// CRM review history uses the existing append-only audit log and Follow-ups queue.
// No schema migration or changes to account visibility are needed.
function registerCrmReviews({router, query, accountScope, sendMail}) {
  const entities = {opportunities: {table:'crm_opportunities',type:'opportunity'}, visits: {table:'crm_visits',type:'visit'}};
  const text = value => String(value ?? '').trim();
  const html = value => text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const canReview = user => Boolean(user.permissions.adminAccess || user.permissions.manageAssignments || user.permissions.viewTeamReports);

  router.get('/salespeople', async (req,res,next) => {
    try {
      const values=[], scope=accountScope('a',req.crmUser,values);
      const result=await query(`select distinct salesperson, entity from (
        select coalesce(nullif(trim(o.owner_user_name),''),a.assigned_to) as salesperson, 'opportunities' as entity
        from crm_opportunities o join crm_accounts a on a.id=o.account_id where a.archived_at is null and ${scope}
        union all select v.created_by as salesperson, 'visits' as entity
        from crm_visits v join crm_accounts a on a.id=v.account_id where a.archived_at is null and ${scope}
      ) people where trim(salesperson)<>'' order by salesperson`,values);
      res.json({ok:true,rows:result.rows});
    } catch(error) { next(error); }
  });

  async function context(req,res) {
    const cfg=entities[req.params.entity],id=Number(req.params.id);
    if(!cfg || !Number.isSafeInteger(id) || id<1){res.status(400).json({ok:false,error:'Invalid CRM review record.'});return null;}
    const values=[id],scope=accountScope('a',req.crmUser,values);
    const result=await query(`select r.*,a.assigned_to,a.company_name from ${cfg.table} r
      join crm_accounts a on a.id=r.account_id where r.id=$1 and a.archived_at is null and ${scope} limit 1`,values);
    const record=result.rows[0];
    if(!record){res.status(404).json({ok:false,error:'Record not found or not assigned to you.'});return null;}
    const intended=cfg.type==='opportunity' ? text(record.owner_user_name)||record.assigned_to : record.created_by;
    // Do not email historic account information to someone who has lost access.
    const recipients=await query(`select user_name,email from app_users where
      lower(account_status)='active' and (crm_portal_access=true or lower(trim(role))='admin')
      and (lower(user_name)=lower($1) or lower(user_name)=lower($2))
      and (lower(user_name)=lower($2) or crm_view_all_accounts=true or lower(trim(role))='admin')
      order by case when lower(user_name)=lower($1) then 0 else 1 end limit 1`,[intended,record.assigned_to]);
    return {cfg,record,recipient:recipients.rows[0]||null};
  }

  router.get('/reviews/:entity/:id',async(req,res,next)=>{
    try {
      const ctx=await context(req,res);if(!ctx)return;
      const result=await query(`select id,actor_user_name,created_at,details_json from crm_audit_log
        where entity_type=$1 and entity_id=$2 and account_id=$3 and action='REVIEW_COMMENT'
        order by created_at desc,id desc limit 500`,[ctx.cfg.type,String(ctx.record.id),ctx.record.account_id]);
      res.json({ok:true,rows:result.rows.reverse(),canComment:canReview(req.crmUser),recipient:ctx.recipient?.user_name||'',recordLabel:ctx.record.title||`Visit ${String(ctx.record.visit_date).slice(0,10)}`,companyName:ctx.record.company_name});
    } catch(error){next(error);}
  });

  router.post('/reviews/:entity/:id',async(req,res,next)=>{
    try {
      if(!canReview(req.crmUser))return res.status(403).json({ok:false,error:'Management review permission is required to send comments.'});
      const body=text(req.body?.comment);
      if(!body || body.length>5000)return res.status(400).json({ok:false,error:'Enter a comment of 1–5,000 characters.'});
      const dueDate=text(req.body?.dueDate);
      if(dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0,10)!==dueDate))return res.status(400).json({ok:false,error:'Enter a valid follow-up date.'});
      const ctx=await context(req,res);if(!ctx)return;
      if(!ctx.recipient)return res.status(422).json({ok:false,error:'No active salesperson with access to this account is available. Assign an active CRM salesperson first.'});
      const {record,cfg,recipient}=ctx,author=req.crmUser.user_name;
      const label=cfg.type==='opportunity'?`${record.opportunity_no || 'Opportunity'} — ${record.title}`:`Visit #${record.id} — ${String(record.visit_date).slice(0,10)}`;
      const title=`Management review: ${label}`.slice(0,300);
      const description=`${author} commented on ${label} (${record.company_name}):\n\n${body}\n\nOpen ${cfg.type==='opportunity'?'Opportunities':'Sales Visits'} in CRM and select Comments on this record.`;
      // Both history and the salesperson's follow-up are committed in one SQL statement.
      const saved=await query(`with comment as (
        insert into crm_audit_log(entity_type,entity_id,account_id,action,actor_user_name,summary,details_json,ip_address)
        values($1,$2,$3,'REVIEW_COMMENT',$4,$5,$6::jsonb,$7) returning *
      ), task as (
        insert into crm_tasks(account_id,opportunity_id,assigned_to,title,description,due_date,priority,status,created_by)
        select $3,$12,$8,$9,$10,$11::date,'Normal','Open',$4 from comment returning id
      ) select comment.id, task.id as task_id from comment cross join task`,[
        cfg.type,String(record.id),record.account_id,author,body.slice(0,1000),
        JSON.stringify({comment:body,recipient:recipient.user_name,dueDate:dueDate||null}),
        text(req.ip).slice(0,200),recipient.user_name,title,description,dueDate||null,cfg.type==='opportunity'?record.id:null
      ]);
      let emailStatus='not_sent';
      if(recipient.email && sendMail) {
        try {
          const delivered=await sendMail({to:[recipient.email],subject:`Apollo Connected CRM | ${title}`,
            text:description,html:`<h2>Apollo Connected · CRM review</h2><p><strong>${html(author)}</strong> sent you a review comment.</p><p>${html(record.company_name)}<br>${html(label)}</p><div style="white-space:pre-wrap">${html(body)}</div>${dueDate?`<p>Follow-up date: ${html(dueDate)}</p>`:''}<p>Sign in to Apollo Connected CRM. Open Follow-ups, or select Comments on the relevant opportunity or visit.</p><p>This is an automated message. Please contact your manager through your usual company channels.</p>`});
          if(delivered?.accepted===true)emailStatus='accepted';
        } catch(error) { console.warn('CRM review email was not accepted:',error?.status || 'send_failed'); }
      }
      res.status(201).json({ok:true,commentId:saved.rows[0].id,taskId:saved.rows[0].task_id,recipient:recipient.user_name,emailStatus,
        message:emailStatus==='accepted'?'Comment saved, follow-up created and email accepted for sending.':'Comment saved and follow-up created. Email was not sent; contact the salesperson or ask IT to check mail delivery.'});
    } catch(error){next(error);}
  });
}

module.exports={registerCrmReviews};

"use strict";
const express = require("express");
const crypto = require("crypto");
const MANAGEMENT_EMAIL = "management@apollo-freight.com";
const key = v => String(v || "").trim().toLowerCase();
const isoDate = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '').slice(0,10);
const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function active(user) { return user && key(user.account_status)==='active' && user.hr_portal_access === true; }
function authority(user, row) {
  if (!active(user) || key(user.user_name)===key(row.user_name)) return {read:false, act:false};
  const final = user.final_approver === true;
  const supervisor = user.can_approve_leave === true && key(user.user_name)===key(row.supervisor_user);
  return {read:final || supervisor, act:row.status==='Pending' && (final || (supervisor && row.approval_stage==='Supervisor')), final, supervisor};
}
function createHrApprovalWorkflow({ query, getPool, requireAppAuth, requireEmployeePortalAuth, balanceForUser, sendMail, mailStatus }) {
  const router = express.Router();
  async function account(name, q=query) {
    return (await q(`select u.user_name,u.email,u.role,u.account_status,u.hr_portal_access,
      coalesce(s.can_approve_leave,false) as can_approve_leave,coalesce(s.final_approver,false) as final_approver,
      coalesce(s.supervisor_user,'') as supervisor_user from app_users u left join hr_leave_user_settings s
      on lower(s.user_name)=lower(u.user_name) where lower(u.user_name)=lower($1) limit 1`,[name])).rows[0];
  }
  async function admin(req) {
    const u=await account(req.appSession.userName);
    if (!u || key(u.account_status)!=='active' || key(u.role)!=='admin' || req.appSession.crmPortal) fail(403,'Only an active ERP administrator can configure leave permissions.');
    return u;
  }
  async function transaction(fn) {
    const c=await getPool().connect();
    try { await c.query('begin');const value=await fn(c.query.bind(c));await c.query('commit');return value; }
    catch(e){await c.query('rollback');throw e;}finally{c.release();}
  }
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
  async function canRead(session, row) {
    const u=await account(session.userName);
    return active(u) && (key(u.user_name)===key(row.user_name) || authority(u,row).read);
  }
  router.get('/settings',requireAppAuth,wrap(async(req,res)=>{
    await admin(req);
    const rows=(await query(`select u.user_name,u.email,u.account_status,u.hr_portal_access,
      coalesce(e.full_name,u.user_name) as full_name,coalesce(s.can_approve_leave,false) as can_approve_leave,
      coalesce(s.final_approver,false) as final_approver,coalesce(s.supervisor_user,'') as supervisor_user
      from app_users u left join employees e on lower(e.user_name)=lower(u.user_name)
      left join hr_leave_user_settings s on lower(s.user_name)=lower(u.user_name) order by u.user_name`)).rows;
    res.json({ok:true,rows,managementEmail:MANAGEMENT_EMAIL});
  }));
  router.put('/settings/:userName',requireAppAuth,wrap(async(req,res)=>{
    const actor=await admin(req);
    const updated=await transaction(async q=>{
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const u=await account(req.params.userName,q);if(!u)fail(404,'User not found. Save the user account first.');
      const canApprove=req.body.canApprove===true, final=req.body.finalApprover===true;
      const supervisor=String(req.body.supervisorUser || '').trim();
      if ((canApprove || final) && (!active(u) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email || ''))) fail(400,'Approvers must have an active account, HR Portal access and a valid email address.');
      if (key(supervisor)===key(u.user_name)) fail(400,'An employee cannot be their own supervisor.');
      if (supervisor) {const target=await account(supervisor,q);if(!active(target)||!target.can_approve_leave)fail(400,'Choose an active user with Leave Approver permission and HR Portal access.');}
      if (u.can_approve_leave && !canApprove) {
        const assigned=(await q("select 1 from hr_leave_user_settings where lower(supervisor_user)=lower($1) union all select 1 from leave_requests where status='Pending' and approval_stage='Supervisor' and lower(supervisor_user)=lower($1) limit 1",[u.user_name])).rows[0];
        if(assigned)fail(409,'Reassign this supervisor’s employees and forward pending requests before removing Leave Approver permission.');
      }
      if (u.final_approver && !final) {
        const other=(await q("select 1 from hr_leave_user_settings s join app_users u on lower(u.user_name)=lower(s.user_name) where s.final_approver=true and lower(u.user_name)<>lower($1) and lower(u.account_status)='active' and u.hr_portal_access=true limit 1",[u.user_name])).rows[0];
        if(!other)fail(409,'Assign another active management final approver before removing the last one.');
      }
      const row=(await q(`insert into hr_leave_user_settings(user_name,can_approve_leave,final_approver,supervisor_user,updated_by)
        values($1,$2,$3,$4,$5) on conflict(user_name) do update set can_approve_leave=excluded.can_approve_leave,
        final_approver=excluded.final_approver,supervisor_user=excluded.supervisor_user,updated_by=excluded.updated_by,updated_at=now() returning *`,
        [u.user_name,canApprove,final,supervisor,actor.user_name])).rows[0];
      await q(`insert into hr_leave_workflow_audit(request_no,actor,action,comment,target_user) values('USER-SETTINGS',$1,'Permissions changed',$2,$3)`,[actor.user_name,JSON.stringify({canApprove,final,supervisor}),u.user_name]);
      return row;
    });
    res.json({ok:true,row:updated});
  }));
  router.get('/inbox',requireEmployeePortalAuth,wrap(async(req,res)=>{
    const u=await account(req.appSession.userName);if(!active(u))fail(403,'Active HR Portal access is required.');
    const rows=(await query(`select request_no,user_name,employee_name,leave_type,start_date,end_date,actual_leave_days,total_days,
      status,approval_stage,supervisor_user,workflow_version from leave_requests where lower(user_name)=lower($1)
      or $2=true or ($3=true and lower(supervisor_user)=lower($1)) order by applied_at desc limit 300`,[u.user_name,u.final_approver,u.can_approve_leave])).rows;
    res.json({ok:true,rows,finalApprover:u.final_approver,canApprove:u.can_approve_leave});
  }));
  router.get('/requests/:requestNo',requireEmployeePortalAuth,wrap(async(req,res)=>{
    const row=(await query('select * from leave_requests where request_no=$1',[req.params.requestNo])).rows[0];
    if(!row || !await canRead(req.appSession,row))fail(404,'Leave request not found or not assigned to you.');
    const u=await account(req.appSession.userName), permissions=authority(u,row);
    const events=(await query('select actor,action,comment,target_user,created_at from hr_leave_workflow_audit where request_no=$1 order by id',[row.request_no])).rows;
    const targets=permissions.act ? (await query(`select u.user_name,u.email from app_users u join hr_leave_user_settings s on lower(s.user_name)=lower(u.user_name)
      where s.can_approve_leave=true and u.hr_portal_access=true and lower(u.account_status)='active'
      and lower(u.user_name)<>lower($1) and lower(u.user_name)<>lower($2) order by u.user_name`,[row.user_name,u.user_name])).rows : [];
    const {attachment_url,...safe}=row;
    res.json({ok:true,row:{...safe,hasAttachment:Boolean(attachment_url)},permissions,events,targets});
  }));
  async function decide(req,res) {
    const decision=key(req.body?.decision), comment=String(req.body?.reason || '').trim().slice(0,4000);
    if(!['approve','reject','sendback','forward'].includes(decision))fail(400,'Choose approve, reject, send back or forward.');
    if(decision!=='approve'&&!comment)fail(400,'A comment is required for deny, return or forward.');
    const row=await transaction(async q=>{
      const existing=(await q('select * from leave_requests where request_no=$1 for update',[req.params.requestNo])).rows[0];
      if(!existing)fail(404,'Request not found.');
      await q('select pg_advisory_xact_lock(hashtext($1))',['hr-leave:'+key(existing.user_name)]);
      const u=await account(req.appSession.userName,q), permission=authority(u,existing);
      if(!permission.act)fail(403,'This pending request is not assigned to your approval authority. Self-approval is not allowed.');
      if(Number(req.body.version)!==Number(existing.workflow_version))fail(409,'This request changed. Refresh it before confirming your decision.');
      let status=existing.status,stage=existing.approval_stage,supervisor=existing.supervisor_user,approvedBy=existing.supervisor_approved_by;
      let action, balance;
      if(decision==='forward') {
        const target=await account(req.body.targetUser,q);
        if(!active(target)||!target.can_approve_leave||key(target.user_name)===key(existing.user_name)||key(target.user_name)===key(u.user_name))fail(400,'Forward only to another active Leave Approver, not the applicant.');
        supervisor=target.user_name;stage='Supervisor';approvedBy='';action='Forwarded';
      } else if(decision==='approve') {
        if(stage==='Supervisor') {
          if(!permission.supervisor)fail(409,'The assigned supervisor must review first. You can forward the request if reassignment is needed.');
          stage='Management';approvedBy=u.user_name;action='Supervisor approved';
        } else {
          if(!permission.final)fail(403,'Management final-approval permission is required.');
          if(key(approvedBy)===key(u.user_name))fail(403,'The supervisor and final approver must be different people.');
          balance=await balanceForUser(existing.user_name,Number(isoDate(existing.start_date).slice(0,4)),existing.leave_type,q);
          const type=(await q('select allow_negative_balance,require_attachment,attachment_after_days from hr_leave_types where upper(code)=upper($1) or lower(name)=lower($1) limit 1',[existing.leave_type])).rows[0];
          const days=Number(existing.actual_leave_days??existing.total_days??0);
          if(!type)fail(400,'Leave type not found.');
          if(days>balance.available&&!type.allow_negative_balance)fail(400,'Insufficient leave balance for final approval.');
          if(type.require_attachment&&!existing.attachment_url&&days>=Number(type.attachment_after_days||0))fail(400,'The supporting document is required before approval.');
          status='Approved';stage='Complete';action='Approved';
        }
      } else { status=decision==='reject'?'Rejected':'Sent Back';stage='Complete';action=status; }
      const saved=(await q(`update leave_requests set status=$1,approval_stage=$2,supervisor_user=$3,supervisor_approved_by=$4,
        rejection_reason=$5,approved_by=case when $1='Approved' then $6 else approved_by end,
        approved_at=case when $1='Approved' then now() else approved_at end,updated_at=now()
        where request_no=$7 returning *`,[status,stage,supervisor,approvedBy,comment,u.user_name,existing.request_no])).rows[0];
      await q('insert into hr_leave_workflow_audit(request_no,actor,action,comment,target_user) values($1,$2,$3,$4,$5)',[existing.request_no,u.user_name,action,comment,decision==='forward'?supervisor:'']);
      if(status==='Approved') {
        const days=Number(existing.actual_leave_days??existing.total_days??0);
        await q(`insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by)
          values($1,$2,$3,'APPROVED_LEAVE',$4,$5,$6,$7,$8)`,[existing.user_name,balance.year,existing.leave_type,existing.request_no,-days,balance.available-days,'Management final approval',u.user_name]);
        await balanceForUser(existing.user_name,balance.year,existing.leave_type,q);
      }
      return saved;
    });
    res.json({ok:true,row});
  }
  router.put('/requests/:requestNo/decision',requireEmployeePortalAuth,wrap(decide));
  router.post('/requests/:requestNo/resubmit',requireEmployeePortalAuth,wrap(async(req,res)=>{
    const result=await transaction(async q=>{
      const r=(await q('select * from leave_requests where request_no=$1 for update',[req.params.requestNo])).rows[0];
      const u=await account(req.appSession.userName,q);
      if(!r||!active(u)||key(r.user_name)!==key(u.user_name))fail(403,'Only the applicant can resubmit.');
      if(r.status!=='Sent Back'||Number(req.body.version)!==r.workflow_version)fail(409,'Refresh this sent-back request first.');
      const reason=String(req.body.reason||'').trim().slice(0,4000);if(!reason)fail(400,'Enter your correction or response to the reviewer.');
      await q('insert into hr_leave_workflow_audit(request_no,actor,action,comment) values($1,$2,$3,$4)',[r.request_no,u.user_name,'Employee response',reason]);
      return (await q("update leave_requests set reason=$1,status='Pending',rejection_reason='',approved_by='',approved_at=null,updated_at=now() where request_no=$2 returning *",[reason,r.request_no])).rows[0];
    });res.json({ok:true,row:result});
  }));
  function emailBody(row,event,events) {
    const origin=String(process.env.APP_PUBLIC_URL||'https://connected.apollo-freight.com').replace(/\/$/,'');
    const url=new URL('/hr-approvals.html',origin);url.searchParams.set('request',row.request_no);
    const link=action=>{const u=new URL(url);u.searchParams.set('action',action);return escapeHtml(u.href);};
    return `<h2>Apollo Connected — Leave ${escapeHtml(event)}</h2><p>${escapeHtml(row.employee_name||row.user_name)} · ${escapeHtml(row.request_no)}</p>
      <p>${escapeHtml(isoDate(row.start_date))} to ${escapeHtml(isoDate(row.end_date))} · ${escapeHtml(row.actual_leave_days??row.total_days)} day(s) · ${escapeHtml(row.leave_type)}</p>
      <p>Status: ${escapeHtml(row.status)} / ${escapeHtml(row.approval_stage)}</p><p>Reason: ${escapeHtml(row.reason)}</p>
      <p>${events.map(e=>`${escapeHtml(e.actor)} — ${escapeHtml(e.action)}: ${escapeHtml(e.comment)}`).join('<br>')}</p>
      <p>${['approve','reject','sendback','forward'].map((a,i)=>`<a style="display:inline-block;padding:12px;background:#17334f;color:white;margin:4px;text-decoration:none" href="${link(a)}">${['Approve','Deny','Return with comments','Forward'][i]}</a>`).join(' ')}</p>
      <p>Sign in with your own Employee/HR account. Links only open the request; nothing is decided until you confirm. The portal always shows the current status.</p>`;
  }
  let draining=false;
  async function drain() {
    if(draining)return {busy:true};draining=true;let sent=0,failed=0;
    try {
      for(let i=0;i<10;i++) {
        const item=(await query(`update hr_leave_mail_outbox set status='Sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes'
          where id=(select id from hr_leave_mail_outbox where status in ('Pending','Sending') and next_attempt_at<=now()
          order by id for update skip locked limit 1) returning *`)).rows[0];
        if(!item)break;
        try {
          const row=(await query('select * from leave_requests where request_no=$1',[item.request_no])).rows[0];if(!row)throw new Error('Leave request no longer exists.');
          const recipient=item.recipient_kind==='management'?MANAGEMENT_EMAIL:(await account(item.recipient_user))?.email;
          if(!recipient)throw new Error('Recipient has no email in User Management.');
          // Forwarded-away supervisors must not receive later private request details.
          if(item.recipient_kind==='user'&&key(item.recipient_user)!==key(row.user_name)&&key(item.recipient_user)!==key(row.supervisor_user)) {
            await query("update hr_leave_mail_outbox set status='Superseded',last_error='Reviewer reassigned' where id=$1",[item.id]);continue;
          }
          const events=(await query('select actor,action,comment from hr_leave_workflow_audit where request_no=$1 order by id desc limit 3',[item.request_no])).rows;
          await sendMail({to:recipient,subject:`Leave ${item.event}: ${row.employee_name||row.user_name} — ${row.request_no}`,html:emailBody(row,item.event,events)});
          await query("update hr_leave_mail_outbox set status='Sent',sent_at=now(),last_error='' where id=$1",[item.id]);sent++;
        } catch(e) {
          await query("update hr_leave_mail_outbox set status=$1,last_error=$2,next_attempt_at=now()+($3 * interval '1 minute') where id=$4",[item.attempts>=8?'Failed':'Pending',String(e.message).slice(0,700),Math.min(60,2**Math.min(item.attempts,6)),item.id]);failed++;
        }
      }
      return {sent,failed};
    }finally{draining=false;}
  }
  router.get('/mail',requireAppAuth,wrap(async(req,res)=>{
    await admin(req);res.json({ok:true,mail:mailStatus(),rows:(await query('select id,request_no,event,recipient_kind,recipient_user,status,attempts,last_error,sent_at from hr_leave_mail_outbox order by id desc limit 100')).rows});
  }));
  router.post('/mail/retry',requireAppAuth,wrap(async(req,res)=>{
    await admin(req);await query("update hr_leave_mail_outbox set status='Pending',attempts=0,next_attempt_at=now() where status='Failed'");res.json({ok:true,...await drain()});
  }));
  router.post('/mail/drain',wrap(async(req,res)=>{
    const wanted=process.env.HR_MAIL_JOB_SECRET||'',got=String(req.get('x-hr-mail-secret')||'');
    if(wanted.length<32||Buffer.byteLength(wanted)!==Buffer.byteLength(got)||!crypto.timingSafeEqual(Buffer.from(wanted),Buffer.from(got)))fail(403,'Notification job not authorised.');
    res.json({ok:true,...await drain()});
  }));
  return {router,decide:wrap(decide),canRead,drain,authority};
}
module.exports={createHrApprovalWorkflow,authority,MANAGEMENT_EMAIL};

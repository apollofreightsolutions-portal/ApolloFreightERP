"use strict";
const express = require("express");
const crypto = require("crypto");
const {hrEmailHtml,emailAttachments}=require('./email-templates');
const MANAGEMENT_EMAIL = "management@apollo-freight.com";
const key = v => String(v || "").trim().toLowerCase();
const isoDate = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '').slice(0,10);
const escapeHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function active(user) { return user && key(user.account_status)==='active' && user.hr_portal_access === true; }
function singleBranch(value) { const b=key(value);return Boolean(b && !/[,;|]/.test(b) && !['all','both','all branches'].includes(b)); }
function sameBranch(a,b) { return singleBranch(a) && singleBranch(b) && key(a)===key(b); }
function authority(user, row) {
  if (!active(user) || key(user.user_name)===key(row.user_name)) return {read:false, act:false};
  const final = user.final_approver === true;
  const supervisor = user.can_approve_leave === true && key(user.user_name)===key(row.supervisor_user) && sameBranch(user.branch_access,row.employee_branch);
  const override = final && user.management_override===true && ['Pending','Rejected','Sent Back'].includes(row.status);
  return {read:final || supervisor, act:row.status==='Pending' && (final || (supervisor && row.approval_stage==='Supervisor')), final, supervisor, override};
}
function createHrApprovalWorkflow({ query, getPool, requireAppAuth, requireEmployeePortalAuth, balanceForUser, sendMail, mailStatus }) {
  const router = express.Router();
  // Both ERP and Employee/HR sessions may review; live database permissions
  // below remain authoritative. CRM/customer sessions must never enter here.
  function reviewAuth(req,res,next) {
    return requireAppAuth(req,res,()=>{
      if(req.appSession.crmPortal)return res.status(403).json({ok:false,error:'Use your ERP or Employee/HR login, not CRM.'});
      return next();
    });
  }
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  async function account(name, q=query) {
    return (await q(`select u.user_name,u.email,u.role,u.account_status,u.hr_portal_access,u.branch_access,
      coalesce(s.management_override,false) as management_override,
      coalesce(s.can_approve_leave,false) as can_approve_leave,coalesce(s.final_approver,false) as final_approver,
      coalesce(s.supervisor_user,'') as supervisor_user from app_users u left join hr_leave_user_settings s
      on lower(s.user_name)=lower(u.user_name) where lower(u.user_name)=lower($1) limit 1`,[name])).rows[0];
  }
  async function admin(req,q=query) {
    const u=await account(req.appSession.userName,q);
    if (!u || key(u.account_status)!=='active' || key(u.role)!=='admin' || req.appSession.crmPortal) fail(403,'Only an active ERP administrator can configure leave permissions.');
    return u;
  }
  async function transaction(fn) {
    const c=await getPool().connect();
    try { await c.query('begin');const value=await fn(c.query.bind(c));await c.query('commit');return value; }
    catch(e){await c.query('rollback');throw e;}finally{c.release();}
  }
  const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(e=>{
    if(['42P01','42703'].includes(e.code)){e.status=503;e.message='HR database update required. IT must run node server/src/migrate-hr-approvals.js from the V24 project root against the live database before using these controls.';}
    next(e);
  });
  async function canRead(session, row) {
    if(session.crmPortal)return false;
    const u=await account(session.userName);
    row={...row,employee_branch:(await account(row.user_name))?.branch_access};
    return active(u) && (key(u.user_name)===key(row.user_name) || authority(u,row).read);
  }
  router.get('/me',reviewAuth,wrap(async(req,res)=>{
    const u=await account(req.appSession.userName);
    if(!u || key(u.account_status)!=='active')fail(403,'Your Connected account is inactive or unavailable. Contact your administrator.');
    res.json({ok:true,userName:u.user_name,hrAccess:u.hr_portal_access===true,
      finalApprover:u.final_approver,managementOverride:u.management_override,
      canConfigure:key(u.role)==='admin'});
  }));
  // Explicit, audited setup for the currently authenticated administrator only.
  // Receiving an email never grants this permission, and no GET changes access.
  router.post('/management-setup',reviewAuth,wrap(async(req,res)=>{
    if(req.body?.confirm!==true)fail(400,'Confirm management approval setup for your own account.');
    await transaction(async q=>{
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const actor=await admin(req,q);
      await q('update app_users set hr_portal_access=true where user_name=$1',[actor.user_name]);
      await saveSettings(q,actor,actor.user_name,{canApprove:actor.can_approve_leave,
        supervisorUser:actor.supervisor_user,finalApprover:true,managementOverride:true});
      await q("insert into hr_leave_workflow_audit(request_no,actor,action,comment,target_user) values('USER-SETTINGS',$1,'Management setup confirmed','HR access, final approval and management override enabled by this administrator for their own account.',$1)",[actor.user_name]);
    });
    res.json({ok:true});
  }));
  router.get('/settings',requireAppAuth,wrap(async(req,res)=>{
    await admin(req);
    const rows=(await query(`select u.user_name,u.email,u.account_status,u.hr_portal_access,u.branch_access,
      coalesce(s.management_override,false) as management_override,
      coalesce(e.full_name,u.user_name) as full_name,coalesce(s.can_approve_leave,false) as can_approve_leave,
      coalesce(s.final_approver,false) as final_approver,coalesce(s.supervisor_user,'') as supervisor_user
      from app_users u left join employees e on lower(e.user_name)=lower(u.user_name)
      left join hr_leave_user_settings s on lower(s.user_name)=lower(u.user_name) order by u.user_name`)).rows;
    res.json({ok:true,rows,managementEmail:MANAGEMENT_EMAIL});
  }));
  async function saveSettings(q, actor, userName, data) {
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const u=await account(userName,q);if(!u)fail(404,'User not found.');
      const canApprove=data.canApprove===true, final=data.finalApprover===true;
      const override=data.managementOverride===undefined?u.management_override:data.managementOverride===true;
      const supervisor=String(data.supervisorUser || '').trim();
      if(override&&!final)fail(400,'Management Override requires Management Final Approver permission.');
      if(canApprove&&!singleBranch(u.branch_access))fail(400,'A Leave Approver must have one specific assigned branch, not All or Both.');
      if ((canApprove || final) && (!active(u) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email || ''))) fail(400,'Approvers must have an active account, HR Portal access and a valid email address.');
      if (key(supervisor)===key(u.user_name)) fail(400,'An employee cannot be their own supervisor.');
      if (supervisor) {const target=await account(supervisor,q);if(!active(target)||!target.can_approve_leave||!sameBranch(target.branch_access,u.branch_access))fail(400,'Choose an active Leave Approver in this employee’s own branch.');}
      const assigned=(await q(`select u.branch_access from app_users u where lower(u.user_name) in (
        select lower(user_name) from hr_leave_user_settings where lower(supervisor_user)=lower($1)
        union select lower(user_name) from leave_requests where status='Pending' and approval_stage='Supervisor' and lower(supervisor_user)=lower($1))`,[u.user_name])).rows;
      if(assigned.length&&(!canApprove||!active(u)||!assigned.every(e=>sameBranch(e.branch_access,u.branch_access))))fail(409,'Reassign this supervisor’s employees and forward pending requests before changing their branch or access.');
      if (u.can_approve_leave && !canApprove) {
        const assigned=(await q("select 1 from hr_leave_user_settings where lower(supervisor_user)=lower($1) union all select 1 from leave_requests where status='Pending' and approval_stage='Supervisor' and lower(supervisor_user)=lower($1) limit 1",[u.user_name])).rows[0];
        if(assigned)fail(409,'Reassign this supervisor’s employees and forward pending requests before removing Leave Approver permission.');
      }
      if (u.final_approver && !final) {
        const other=(await q("select 1 from hr_leave_user_settings s join app_users u on lower(u.user_name)=lower(s.user_name) where s.final_approver=true and lower(u.user_name)<>lower($1) and lower(u.account_status)='active' and u.hr_portal_access=true limit 1",[u.user_name])).rows[0];
        if(!other)fail(409,'Assign another active management final approver before removing the last one.');
      }
      const row=(await q(`insert into hr_leave_user_settings(user_name,can_approve_leave,final_approver,supervisor_user,updated_by,management_override)
        values($1,$2,$3,$4,$5,$6) on conflict(user_name) do update set can_approve_leave=excluded.can_approve_leave,
        final_approver=excluded.final_approver,supervisor_user=excluded.supervisor_user,updated_by=excluded.updated_by,management_override=excluded.management_override,updated_at=now() returning *`,
        [u.user_name,canApprove,final,supervisor,actor.user_name,override])).rows[0];
      await q(`insert into hr_leave_workflow_audit(request_no,actor,action,comment,target_user) values('USER-SETTINGS',$1,'Permissions changed',$2,$3)`,[actor.user_name,JSON.stringify({canApprove,final,supervisor,override}),u.user_name]);
      return row;
  }
  router.put('/settings/:userName',requireAppAuth,wrap(async(req,res)=>{
    const actor=await admin(req);
    const updated=await transaction(q=>saveSettings(q,actor,req.params.userName,req.body));
    res.json({ok:true,row:updated});
  }));
  router.get('/inbox',reviewAuth,wrap(async(req,res)=>{
    const u=await account(req.appSession.userName);if(!active(u))fail(403,'Active HR Portal access is required.');
    const rows=(await query(`select request_no,user_name,employee_name,leave_type,start_date,end_date,actual_leave_days,total_days,
      status,approval_stage,supervisor_user,workflow_version from leave_requests where lower(user_name)=lower($1)
      or $2=true or ($3=true and lower(supervisor_user)=lower($1) and lower(trim((select branch_access from app_users where lower(app_users.user_name)=lower(leave_requests.user_name) limit 1)))=$4) order by applied_at desc limit 300`,[u.user_name,u.final_approver,u.can_approve_leave&&singleBranch(u.branch_access),key(u.branch_access)])).rows;
    res.json({ok:true,rows,finalApprover:u.final_approver,canApprove:u.can_approve_leave});
  }));
  router.get('/requests/:requestNo',reviewAuth,wrap(async(req,res)=>{
    const row=(await query('select * from leave_requests where request_no=$1',[req.params.requestNo])).rows[0];
    if(!row || !await canRead(req.appSession,row))fail(404,'Leave request not found or not assigned to you.');
    row.employee_branch=(await account(row.user_name))?.branch_access;
    const u=await account(req.appSession.userName), permissions=authority(u,row);
    const events=(await query('select actor,action,comment,target_user,created_at from hr_leave_workflow_audit where request_no=$1 order by id',[row.request_no])).rows;
    const targets=permissions.act ? (await query(`select u.user_name,u.email from app_users u join hr_leave_user_settings s on lower(s.user_name)=lower(u.user_name)
      where s.can_approve_leave=true and u.hr_portal_access=true and lower(u.account_status)='active'
      and lower(u.user_name)<>lower($1) and lower(u.user_name)<>lower($2)
      and lower(trim(u.branch_access))=$3 order by u.user_name`,[row.user_name,u.user_name,singleBranch(row.employee_branch)?key(row.employee_branch):'__no_branch__'])).rows : [];
    const {attachment_url,...safe}=row;
    res.json({ok:true,row:{...safe,hasAttachment:Boolean(attachment_url)},permissions,events,targets});
  }));
  async function decide(req,res) {
    const decision=key(req.body?.decision), comment=String(req.body?.reason || '').trim().slice(0,4000);
    if(!['approve','reject','sendback','forward','override'].includes(decision))fail(400,'Choose approve, reject, send back, forward or management override.');
    if(decision!=='approve'&&!comment)fail(400,'A comment is required for deny, return or forward.');
    const row=await transaction(async q=>{
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const existing=(await q('select * from leave_requests where request_no=$1 for update',[req.params.requestNo])).rows[0];
      if(!existing)fail(404,'Request not found.');
      existing.employee_branch=(await account(existing.user_name,q))?.branch_access;
      await q('select pg_advisory_xact_lock(hashtext($1))',['hr-leave:'+key(existing.user_name)]);
      const u=await account(req.appSession.userName,q), permission=authority(u,existing);
      if(decision==='override'?!permission.override:!permission.act)fail(403,'This request is not assigned to your approval authority. Self-approval is not allowed.');
      if(Number(req.body.version)!==Number(existing.workflow_version))fail(409,'This request changed. Refresh it before confirming your decision.');
      let status=existing.status,stage=existing.approval_stage,supervisor=existing.supervisor_user,approvedBy=existing.supervisor_approved_by;
      let action, balance;
      if(decision==='forward') {
        const target=await account(req.body.targetUser,q);
        if(!active(target)||!target.can_approve_leave||!sameBranch(target.branch_access,existing.employee_branch)||key(target.user_name)===key(existing.user_name)||key(target.user_name)===key(u.user_name))fail(400,'Forward only to another active Leave Approver in the employee’s branch, not the applicant.');
        supervisor=target.user_name;stage='Supervisor';approvedBy='';action='Forwarded';
      } else if(decision==='approve'||decision==='override') {
        if(stage==='Supervisor'&&decision!=='override') {
          if(!permission.supervisor)fail(409,'The assigned supervisor must review first. You can forward the request if reassignment is needed.');
          stage='Management';approvedBy=u.user_name;action='Supervisor approved';
        } else {
          if(!permission.final)fail(403,'Management final-approval permission is required.');
          if(decision!=='override'&&key(approvedBy)===key(u.user_name))fail(403,'The supervisor and final approver must be different people.');
          if((await q("select 1 from hr_leave_ledger where reference_no=$1 and transaction_type='APPROVED_LEAVE' limit 1",[existing.request_no])).rows.length)fail(409,'This request already has an approval deduction. Ask HR to reconcile it; no second deduction was made.');
          balance=await balanceForUser(existing.user_name,Number(isoDate(existing.start_date).slice(0,4)),existing.leave_type,q);
          const type=(await q('select allow_negative_balance,require_attachment,attachment_after_days from hr_leave_types where upper(code)=upper($1) or lower(name)=lower($1) limit 1',[existing.leave_type])).rows[0];
          const days=Number(existing.actual_leave_days??existing.total_days??0);
          if(!type)fail(400,'Leave type not found.');
          if(days>balance.available&&!type.allow_negative_balance)fail(400,'Insufficient leave balance for final approval.');
          if(type.require_attachment&&!existing.attachment_url&&days>=Number(type.attachment_after_days||0))fail(400,'The supporting document is required before approval.');
          status='Approved';stage='Complete';action=decision==='override'?'Management override approved':'Approved';
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
  router.put('/requests/:requestNo/decision',reviewAuth,wrap(decide));
  router.post('/requests/:requestNo/resubmit',reviewAuth,wrap(async(req,res)=>{
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
          if(item.recipient_kind==='user'&&key(item.recipient_user)!==key(row.user_name)) {
            const reviewer=await account(item.recipient_user),employee=await account(row.user_name);
            if(!active(reviewer)||!reviewer.can_approve_leave||!sameBranch(reviewer.branch_access,employee?.branch_access)) {
              await query("update hr_leave_mail_outbox set status='Superseded',last_error='Reviewer access or branch changed' where id=$1",[item.id]);continue;
            }
          }
          const events=(await query('select actor,action,comment from hr_leave_workflow_audit where request_no=$1 order by id desc limit 3',[item.request_no])).rows;
          await sendMail({to:recipient,subject:`Leave ${item.event}: ${row.employee_name||row.user_name} — ${row.request_no}`,html:hrEmailHtml(row,item.event,events),attachments:emailAttachments()});
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
  async function saveUser(req, write) {
    const actor=await admin(req);
    return transaction(async q=>{
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const row=await write(q),old=await account(row.user_name,q);
      const data=req.body.leavePermissions || {canApprove:old.can_approve_leave,finalApprover:old.final_approver,managementOverride:old.management_override,supervisorUser:old.supervisor_user};
      await saveSettings(q,actor,row.user_name,data);
      return row;
    });
  }
  async function deleteUser(req,write) {
    const actor=await admin(req);
    return transaction(async q=>{
      await q("select pg_advisory_xact_lock(hashtext('hr-leave-settings'))");
      const user=await account(req.params.id,q);if(!user)fail(404,'User not found.');
      if(user.final_approver)fail(409,'Remove Management Final Approver permission before deleting this user.');
      const dependencies=(await q("select 1 from hr_leave_user_settings where lower(supervisor_user)=lower($1) union all select 1 from leave_requests where status='Pending' and approval_stage='Supervisor' and lower(supervisor_user)=lower($1) limit 1",[user.user_name])).rows;
      if(dependencies.length)fail(409,'Reassign employees and forward pending requests before deleting this supervisor.');
      const row=await write(q);
      await q('delete from hr_leave_user_settings where lower(user_name)=lower($1)',[user.user_name]);
      await q("insert into hr_leave_workflow_audit(request_no,actor,action,target_user) values('USER-SETTINGS',$1,'User deleted; leave permissions removed',$2)",[actor.user_name,user.user_name]);
      return row;
    });
  }
  return {router,decide:wrap(decide),canRead,drain,authority,saveUser,deleteUser};
}
module.exports={createHrApprovalWorkflow,authority,MANAGEMENT_EMAIL,sameBranch,singleBranch};

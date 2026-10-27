const crypto = require('crypto');
const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function assignmentMailer({query,sendMail}) {
  return async ({owner,actor,accounts,batchId=crypto.randomUUID()}) => {
    if(!accounts.length)return {emailStatus:'not_needed'};
    try {
      // A batch is recorded before email, and resolved against current account access on every read.
      await query(`insert into crm_audit_log(entity_type,entity_id,action,actor_user_name,summary,details_json)
        values('assignment_batch',$1,'ASSIGNMENT_NOTIFICATION',$2,$3,$4::jsonb)`,[batchId,actor,`Assigned ${accounts.length} accounts to ${owner}`,JSON.stringify({owner,ids:accounts.map(a=>a.id)})]);
      const recipient=(await query(`select email from app_users where lower(user_name)=lower($1) and lower(account_status)='active' and (crm_portal_access=true or lower(trim(role))='admin') limit 1`,[owner])).rows[0];
      if(!recipient?.email||!sendMail)return {emailStatus:'not_sent',batchId};
      const base=process.env.APP_PUBLIC_URL||process.env.PUBLIC_APP_URL||process.env.APP_BASE_URL||'https://connected.apollo-freight.com';
      const url=new URL(base);if(url.protocol!=='https:')throw Error('HTTPS application URL required');
      url.pathname='/';url.search='';url.hash='';url.searchParams.set('crmAssignment',batchId);
      const sample=accounts.slice(0,20).map(a=>`${a.company_name} (${a.branch||''})`).join('\n');
      const body=`${actor} assigned ${accounts.length} account(s) to you.\n\n${sample}${accounts.length>20?'\nAdditional accounts are listed in Connected.':''}\n\nOpen assigned accounts: ${url.href}\nSign in with your own Apollo Connected account.`;
      const delivered=await sendMail({to:[recipient.email],subject:`Apollo Connected CRM | ${accounts.length} accounts assigned to you`,text:body,
        html:`<h2>Apollo Connected · Account assignment</h2><p>${escape(actor)} assigned <strong>${accounts.length}</strong> account(s) to you.</p><div style="white-space:pre-wrap">${escape(sample)}</div><p><a href="${escape(url.href)}" style="display:inline-block;padding:12px 18px;background:#ed6429;color:white;text-decoration:none">View assigned accounts</a></p><p>Sign in with your own account. Access follows current account ownership. This mailbox is not monitored.</p>`});
      return {emailStatus:delivered?.accepted===true?'accepted':'not_sent',batchId};
    }catch(error){console.warn('CRM assignment email failed:',error.code||error.status||'send_failed');return {emailStatus:'not_sent',batchId};}
  };
}
module.exports={assignmentMailer};

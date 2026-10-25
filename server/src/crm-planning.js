const statuses=['Planned','Completed','Cancelled','No-show','Unclassified'];
function visitFields(body,user){
  return {visit_status:body.visitStatus??body.visit_status??'Planned',actual_visit_date:body.actualVisitDate??body.actual_visit_date??null,salesperson:body.salesperson||body.created_by||user.user_name};
}
async function validateVisit(query,n,user,response,previousSalesperson=''){
  const fail=error=>{response.status(400).json({error});return false;};
  if(!statuses.includes(n.visit_status))return fail('Choose a valid visit status.');
  const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
  if(!date(n.visit_date))return fail('Scheduled date is required.');
  n.actual_visit_date=n.actual_visit_date||null;
  if(n.actual_visit_date&&!date(n.actual_visit_date))return fail('Actual visit date is invalid.');
  if(n.visit_status==='Completed'&&(!n.actual_visit_date||!String(n.outcome||'').trim()))return fail('Completed visits require an actual date and outcome.');
  if(n.visit_status!=='Completed'&&n.actual_visit_date)return fail('Actual visit date applies only to completed visits.');
  if(previousSalesperson&&String(n.salesperson).toLowerCase()===String(previousSalesperson).toLowerCase()){
    n.salesperson=previousSalesperson;return true;
  }
  if(!user.permissions.manageAssignments&&String(n.salesperson).toLowerCase()!==String(user.user_name).toLowerCase())return fail('Only management can assign visits to another salesperson.');
  const target=(await query("select user_name,crm_view_all_accounts,role from app_users where lower(user_name)=lower($1) and lower(account_status)='active' and (crm_portal_access=true or lower(trim(role))='admin')",[n.salesperson])).rows[0];
  if(!target)return fail('Select an active CRM salesperson.');
  const a=(await query('select assigned_to from crm_accounts where id=$1',[n.account_id])).rows[0];
  if(!target.crm_view_all_accounts&&String(target.role).toLowerCase()!=='admin'&&String(a?.assigned_to).toLowerCase()!==String(target.user_name).toLowerCase())return fail('Selected salesperson must have access to this account.');
  n.salesperson=target.user_name;return true;
}
function registerPlanning({router,query,accountScope}){
 router.get('/filter-data',async(req,res,next)=>{try{
  const data={};
  const tables={accounts:['crm_accounts','a'],contacts:['crm_contacts','c'],opportunities:['crm_opportunities','o'],visits:['crm_visits','v'],meetings:['crm_meetings','m'],tasks:['crm_tasks','t'],activity:['crm_audit_log','l']};
  for(const [name,[table,alias]] of Object.entries(tables)){
    const vals=[];let scope=accountScope('a',req.crmUser,vals);let join=name==='accounts'?'':`left join crm_accounts a on a.id=${alias}.account_id`;
    let where=`a.archived_at is null and ${scope}`;
    if(name==='tasks'&&!req.crmUser.permissions.viewAllAccounts){where=`a.archived_at is null and lower(t.assigned_to)=lower($1) and (t.account_id is null or ${scope})`;}
    if(name==='activity'&&!req.crmUser.permissions.viewAllAccounts)where=`a.archived_at is null and a.id is not null and ${scope}`;
    let extra=name==='accounts'?'':',a.company_name,a.branch,a.assigned_to as account_owner';
    if(name==='contacts')extra+=',a.account_code';
    if(name==='visits'||name==='meetings'){join+=` left join crm_contacts c on c.id=${alias}.contact_id`;extra+=',c.full_name as contact_name';}
    if(name==='tasks'){join+=' left join crm_opportunities o on o.id=t.opportunity_id';extra+=',o.title as opportunity_title';}
    const rows=(await query(`select ${alias}.*${extra} from ${table} ${alias} ${join} where ${where} order by ${alias}.id limit 10001`,vals)).rows;
    if(rows.length>10000)return res.status(422).json({error:`${name} exceeds the 10,000-record view limit. Contact IT for server pagination; no partial totals are shown.`});data[name]=rows;
  }
  for(const a of data.accounts){
    a.contact_count=data.contacts.filter(c=>String(c.account_id)===String(a.id)).length;
    a.open_opportunities=data.opportunities.filter(o=>String(o.account_id)===String(a.id)&&String(o.status).toLowerCase()==='open').length;
    a.last_visit_date=data.visits.filter(v=>String(v.account_id)===String(a.id)&&v.visit_status==='Completed'&&v.actual_visit_date).map(v=>v.actual_visit_date).sort((x,y)=>new Date(y)-new Date(x))[0]||null;
  }
  res.json({ok:true,data});
 }catch(e){next(e);}});
}
module.exports={visitFields,validateVisit,registerPlanning};

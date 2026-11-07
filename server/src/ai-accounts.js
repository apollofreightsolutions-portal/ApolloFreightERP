const crypto=require('crypto');
const admin=u=>String(u?.role||'').trim().toLowerCase()==='admin';
const words=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
const STOP=new Set(words('please can could would you me my show find search pull fetch get open account accounts customer customers client clients crm details detail number code contact contacts information info email phone mobile for in at the of on from and branch station entity kuwait kwi dubai dxb ho block unblock this that it company named called is are tell about all list give want need to i what whats where located database record records with'));
function intent(message){
  const tokens=words(message).filter(w=>!STOP.has(w));
  const branch=/\b(kwi|kuwait)\b/i.test(message)?'Kuwait HO':/\b(dxb|dubai)\b/i.test(message)?'Dubai':'';
  const operation=/\bunblock\b/i.test(message)?'unblock':/\bblock\b/i.test(message)?'block':'';
  const asks=/\b(accounts?|customers?|clients?|crm|block|unblock)\b/i.test(message)||(/^(?:please\s+)?(?:open|find|pull)\b/i.test(message)&&!/\b(shipment|tcn|awb|pod|invoice|visit|opportunity)\b/i.test(message));
  return {tokens:[...new Set(tokens)].slice(0,15),branch,operation,asks};
}
function predicates(alias,field,code,parsed,values){
  const conditions=[];
  for(const token of parsed.tokens){values.push(token);conditions.push(`position($${values.length} in lower(coalesce(${alias}.${field},'')||' '||coalesce(${alias}.${code},'')))>0`);}
  if(parsed.branch){values.push(parsed.branch==='Dubai'?['dubai','dxb']:['kuwait','kuwait ho','kwi']);conditions.push(`lower(trim(coalesce(${alias}.branch,'')))=any($${values.length}::text[])`);}
  return conditions;
}
async function searchAccounts(query,user,message,crmScope,reference){
  const parsed=intent(message);
  if(!parsed.asks)return null;
  if(parsed.operation&&!parsed.tokens.length&&reference?.kind==='customer'&&admin(user)&&/^\d+$/.test(String(reference.id))){
    const row=(await query('select id,code,name from customers where id=$1',[reference.id])).rows[0];
    if(row)return {answer:`Review ${parsed.operation} for ${row.name} (${row.code}). Nothing has changed yet.`,actions:[{type:'account-change',id:String(row.id),operation:parsed.operation,branch:parsed.branch,label:`Review ${parsed.operation}: ${row.code}`}]};
  }
  if(!parsed.tokens.length)return {answer:'Please give the company name or account code, plus KWI or DXB if relevant. To block/unblock a customer, first find the account and use its action button.',actions:[]};
  const values=[],scope=crmScope(user,values,'a');
  const conditions=['a.archived_at is null',scope.sql,...predicates('a','company_name','account_code',parsed,values)];
  let crm=[];
  if(user.crm_portal_access||admin(user))crm=(await query(`select a.id,a.account_code,a.company_name,a.branch,a.assigned_to,a.status,count(*) over() as match_count from crm_accounts a where ${conditions.join(' and ')} order by a.company_name,a.id limit 30`,values)).rows;
  let customers=[];
  // The operational customer master controls booking blocks; never treat a CRM lead as that master.
  if(admin(user)){
    const cv=[],cc=predicates('c','name','code',parsed,cv);
    customers=(await query(`select c.id,c.code,c.name,c.branch,c.status,c.blocked_branches,count(*) over() as match_count from customers c where ${cc.join(' and ')||'false'} order by c.name,c.id limit 30`,cv)).rows;
  }
  const actions=[];
  const out=[];
  if(crm.length){out.push(`CRM accounts (${crm[0].match_count} matches${Number(crm[0].match_count)>30?', first 30 shown; narrow the name':''}):`);for(const r of crm){out.push(`${r.company_name} | ${r.account_code} | ${r.branch||'No entity'} | Owner: ${r.assigned_to} | ${r.status}`);actions.push({type:'account',kind:'crm',id:String(r.id),label:`Open ${r.account_code}`});}}
  if(customers.length){out.push(`Operational customers (${customers[0].match_count} matches${Number(customers[0].match_count)>30?', first 30 shown; narrow the name':''}):`);for(const r of customers){out.push(`${r.name} | ${r.code} | ${r.branch} | ${r.status}${r.blocked_branches?' | Blocked: '+r.blocked_branches:''}`);actions.push({type:'account',kind:'customer',id:String(r.id),label:`Open ${r.code}`});if(parsed.operation)actions.push({type:'account-change',id:String(r.id),operation:parsed.operation,branch:parsed.branch,label:`Review ${parsed.operation}: ${r.code}`});}}
  if(!out.length)out.push('No accessible account matches all those search terms and entity. Try a shorter distinctive company name or its exact account code. This is a live database search, not a conclusion based on a limited AI snapshot.');
  if(parsed.operation&&!admin(user))out.push('Only an administrator can block or unblock operational customers.');
  else if(parsed.operation&&!customers.length)out.push('Blocking applies to operational customer records, not CRM prospects. No matching operational customer was found.');
  else if(parsed.operation)out.push('Nothing has been changed. Select the exact customer to review the branch and confirm.');
  return {answer:out.join('\n'),actions};
}
function nextBlockState(row,operation,branch){
  if(!['Active','Blocked'].includes(row.status))throw new Error('This customer is neither Active nor Blocked. Review it in customer management first.');
  const own=require("./station-accounts").station(row.branch);
  if(["Dubai","Kuwait HO"].includes(own)){
    if(branch!=="Both"&&require("./station-accounts").station(branch)!==own)throw Object.assign(new Error("This account belongs to "+own+". Select the other station account to change that station."),{status:409});
    return {status:operation==="block"?"Blocked":"Active",blocked_branches:operation==="block"?own:null};
  }
  if(!['Active','Blocked'].includes(row.status))throw new Error('This customer is neither Active nor Blocked. Review it in customer management first.');
  if(!['Dubai','Kuwait HO','Both'].includes(branch))throw new Error('Choose Dubai, Kuwait HO or Both.');
  let current=String(row.blocked_branches||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(row.status==='Blocked'&&(!current.length||current.includes('Both')))current=['Dubai','Kuwait HO'];
  if(row.status!=='Blocked')current=[];
  if(current.some(x=>!['Dubai','Kuwait HO'].includes(x)))throw new Error('Unrecognised blocked-branch configuration. Review this customer manually.');
  const set=new Set(current),targets=branch==='Both'?['Dubai','Kuwait HO']:[branch];
  targets.forEach(b=>operation==='block'?set.add(b):set.delete(b));
  return {status:set.size?'Blocked':'Active',blocked_branches:set.size===2?'Both':Array.from(set).join(',')||null};
}
function registerAccountRoutes(router,{query,loadAiUser,hasAiAuthorization,crmScope}){
  async function actor(req){const user=await loadAiUser(query,req.appSession);if(!hasAiAuthorization(user)){const e=new Error('AI access denied.');e.status=403;throw e;}return user;}
  router.get('/account/:kind/:id',async(req,res,next)=>{try{
    const user=await actor(req),kind=req.params.kind,id=req.params.id;
    if(!/^\d+$/.test(id))return res.status(400).json({error:'Invalid account.'});
    let row,contacts=[];
    if(kind==='crm'&&(admin(user)||user.crm_portal_access)){
      const values=[],scope=crmScope(user,values,'a');values.push(id);
      row=(await query(`select a.id,a.company_name,a.account_code,a.branch,a.status,a.assigned_to,a.phone,a.email,a.address,a.next_action,a.next_action_date from crm_accounts a where a.archived_at is null and ${scope.sql} and a.id=$${values.length}`,values)).rows[0];
      if(row)contacts=(await query('select full_name,job_title,email,phone,mobile from crm_contacts where account_id=$1 order by id limit 101',[id])).rows;
    }else if(kind==='customer'&&admin(user))row=(await query('select id,name,code,branch,status,blocked_branches,email,mobile,full_address,terms,is_account_overdue from customers where id=$1',[id])).rows[0];
    if(!row)return res.status(404).json({error:'Account not found or not accessible.'});
    const actions=kind==='customer'&&admin(user)?['block','unblock'].map(operation=>({type:'account-change',id,operation,branch:row.branch,label:`${operation==='block'?'Block':'Unblock'} customer…`})):[];
    const answer=Object.entries(row).filter(([k,v])=>k!=='id'&&v!=null&&v!=='').map(([k,v])=>`${k.replace(/_/g,' ')}: ${v}`).join('\n')+(contacts.length?'\n\nContacts:\n'+contacts.slice(0,100).map(c=>Object.values(c).filter(Boolean).join(' | ')).join('\n')+(contacts.length>100?'\nMore contacts exist; open CRM for the complete list.':''):'');
    return res.json({ok:true,answer,actions,accountReference:{kind,id},sourceSummary:'Live permission-checked account record; contact details not sent to a model'});
  }catch(e){next(e);}});
  router.post('/account-change/prepare',async(req,res,next)=>{try{
    const user=await actor(req);if(!admin(user))return res.status(403).json({error:'Administrator access required.'});
    const {id,operation,branch}=req.body||{};
    if(!/^\d+$/.test(String(id))||!['block','unblock'].includes(operation))return res.status(400).json({error:'Invalid action.'});
    const row=(await query('select id,code,name,branch,status,blocked_branches from customers where id=$1',[id])).rows[0];
    if(!row)return res.status(404).json({error:'Customer not found.'});
    const after=nextBlockState(row,operation,branch),token=crypto.randomUUID();
    if(row.status===after.status&&String(row.blocked_branches||'')===String(after.blocked_branches||''))return res.json({ok:true,answer:'Customer already has that state. No change needed.',actions:[]});
    const payload={id:String(id),code:row.code,name:row.name,operation,branch,before:{status:row.status,blocked_branches:row.blocked_branches,branch:row.branch},after};
    await query('insert into ai_account_actions (token,user_name,payload) values ($1,$2,$3::jsonb)',[token,user.user_name,JSON.stringify(payload)]);
    const answer=`Confirm ${operation}: ${row.name} (${row.code})\nAccount station: ${row.branch} (all operational changes)\nBefore: ${row.status}; blocked branches: ${row.blocked_branches||'(none / legacy all if Blocked)'}\nAfter: ${after.status}; blocked branches: ${after.blocked_branches||'none'}\nThis blocks this station account: new work, edits, clearance, POD uploads and closing jobs. Viewing and AWB fetching stay available. The other station account is unaffected. Linked customer login is also blocked. Existing records are retained; overdue flag and CRM status stay unchanged. This proposal expires in 5 minutes.`;
    res.json({ok:true,answer,actions:[{type:'account-confirm',token,label:`Confirm ${operation} ${row.code}`}]});
  }catch(e){if(e.code==='42P01'){e.message='IT must apply SQL 056_ai_account_actions.sql before AI account changes can be used.';e.status=503;}next(e);}});
  router.post('/account-change/confirm',async(req,res,next)=>{try{
    const user=await actor(req);if(!admin(user))return res.status(403).json({error:'Administrator access required.'});
    if(!/^[a-f0-9-]{36}$/i.test(String(req.body?.token||'')))return res.status(400).json({error:'Invalid confirmation.'});
    // One SQL statement: row lock + single-use, user-bound token + optimistic state check + durable audit.
    const result=await query(`with target as (
      select c.id,p.token,p.payload from customers c join ai_account_actions p on c.id=(p.payload->>'id')::bigint
      where p.token=$1::uuid and p.user_name=$2 and p.completed_at is null and p.created_at>now()-interval '5 minutes'
      and c.status=p.payload->'before'->>'status'
      and coalesce(c.branch,'')=coalesce(p.payload->'before'->>'branch','')
      and coalesce(c.blocked_branches,'')=coalesce(p.payload->'before'->>'blocked_branches','') for update of c,p
    ), consumed as (
      update ai_account_actions p set completed_at=now() from target t where p.token=t.token and p.completed_at is null returning t.id,t.payload
    ), changed as (
      update customers c set status=x.payload->'after'->>'status',blocked_branches=x.payload->'after'->>'blocked_branches',updated_at=now()
      from consumed x where c.id=x.id returning c.code,c.name,c.status,c.blocked_branches
    ) select * from changed`,[req.body.token,user.user_name]);
    if(!result.rows.length)return res.status(409).json({error:'Confirmation expired, was already used, or customer changed. Search the customer and prepare a new action.'});
    const r=result.rows[0];res.json({ok:true,answer:`Saved: ${r.name} (${r.code}) is ${r.status}. Blocked branches: ${r.blocked_branches||'none'}. Change recorded in the AI account action audit.`,actions:[]});
  }catch(e){next(e);}});
}
module.exports={intent,predicates,searchAccounts,nextBlockState,registerAccountRoutes};

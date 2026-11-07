const station=value=>({dxb:'Dubai',dbx:'Dubai',dubai:'Dubai','branch 2':'Dubai','dubai 2':'Dubai',kwi:'Kuwait HO',kuwait:'Kuwait HO','kuwait ho':'Kuwait HO','branch 1':'Kuwait HO','kuwait 1':'Kuwait HO'})[String(value||'').trim().toLowerCase()]||String(value||'').trim();
function notes(row){try{return JSON.parse(row.notes||'{}')}catch{return {}}}
async function accountFor(query,row){return (await query('select (apollo_local_customer($1,$2,$3)).*',[row.branch,row.customer_name||row.customer||row.customerName||'',row.customer_code||row.customerCode||notes(row).customerCode||''])).rows[0];}
async function assertJob(query,job){await query('select apollo_assert_job_active($1)',[job]);}
async function writable(query,row){return (await query('select apollo_job_writable($1,$2,$3) as allowed',[row.branch,row.customer_name,row.customer_code||notes(row).customerCode||''])).rows[0].allowed;}
async function assertStationUser(query,session,branch){
 const user=(await query('select role,account_status,branch_access from app_users where lower(user_name)=lower($1)',[session?.userName||''])).rows[0];
 if(!user||String(user.account_status).toLowerCase()!=='active')throw Object.assign(new Error('Active staff access required.'),{status:403});
 if(String(user.role).toLowerCase()==='admin')return user;
 const access=String(user.branch_access||'').trim();
 if(!['Both','All'].some(x=>x.toLowerCase()===access.toLowerCase())&&!access.split(/[,;|]/).some(b=>station(b)===station(branch)))throw Object.assign(new Error('This station is read-only for your account. Fetch the AWB into your own station to work on it.'),{status:403});
 return user;
}
async function guardMutation(query,resources,req){
 const parts=req.path.split('/').filter(Boolean),resource=parts[0],id=parts[1],body=req.body||{};
 const config=resources[resource];let old=null;
 if(config&&id&&['PUT','PATCH','DELETE'].includes(req.method))old=(await query(`select * from ${config.table} where ${config.key}=$1`,[decodeURIComponent(id)])).rows[0];
 if(resource==='customers'){
  const branch=old?.branch||body.branch;
  const user=await assertStationUser(query,req.appSession,branch);
  if(String(user.role).toLowerCase()!=='admin'&&(req.method==='DELETE'||(body.status!==undefined&&String(body.status).toLowerCase()!==String(old?.status||'Active').toLowerCase())||body.blockedBranches!==undefined||body.blocked_branches!==undefined)){
    // Normal full-record saves may include unchanged block metadata.
    const same=old&&req.method!=='DELETE'&&String(body.status||old.status)===String(old.status)&&String(body.blockedBranches??body.blocked_branches??old.blocked_branches??'')===String(old.blocked_branches||'');
    if(!same)throw Object.assign(new Error('Only Admin can block or unblock an account. Submit a block/unblock request.'),{status:403});
  }
  if(old&&String(old.status).toLowerCase()==='blocked'&&String(user.role).toLowerCase()!=='admin')throw Object.assign(new Error('This local account is blocked. Admin must unblock it first.'),{status:409});
  return;
 }
 if(resource==='shipments'&&!id){await assertStationUser(query,req.appSession,body.branch);return;}
 let jobs=[];
 if(resource==='shipments'){
  if(['status-by-awb'].includes(id))return; // explicit route checks branch and all local jobs
  jobs.push(id==='status-email'?body.jobNo||body.job_no:decodeURIComponent(id||''));
 }else if(resource==='pod-documents')jobs.push(body.jobNo);
 else if(resource==='shipment-documents')jobs.push(body.shipmentNo);
 else for(const row of [old,body].filter(Boolean)){
  const refs=resource==='consolidations'?(row.jobNumbers??row.job_numbers):resource==='documents'?(row.linkedNo??row.linked_no):resource==='shipment-status-history'?(row.jobNo??row.job_no):(row.shipmentNo??row.shipment_no);
  jobs.push(...String(refs||'').split(',').map(x=>x.trim()).filter(Boolean));
 }
 for(const job of new Set(jobs.filter(Boolean))){
  const row=(await query('select * from shipments where lower(trim(job_no))=lower(trim($1))',[job])).rows[0];
  if(row){await assertStationUser(query,req.appSession,row.branch);await assertJob(query,row.job_no);}
 }
}
module.exports={station,accountFor,assertJob,writable,assertStationUser,guardMutation};

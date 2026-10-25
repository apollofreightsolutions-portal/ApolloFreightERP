const XLSX = require('xlsx');
const {getPool} = require('./db');
const fields = ['company','contact','email','phone','mobile','job_title','website','country','city','address','notes'];
const clean = v => String(v ?? '').trim();
const key = v => clean(v).toLowerCase().replace(/\s+/g,' ');
function readBook(body) {
  if (!/\.(xlsx|xls|csv)$/i.test(body.fileName || '')) throw new Error('Choose an XLSX, XLS or CSV file.');
  const bytes = Buffer.from(body.data || '', 'base64');
  if (!bytes.length || bytes.length > 5*1024*1024) throw new Error('File must be between 1 byte and 5 MB.');
  const book = XLSX.read(bytes,{type:'buffer',cellFormula:false,bookVBA:false,raw:true,sheetRows:5002});
  const sheet = body.sheet || book.SheetNames[0];
  if (!book.Sheets[sheet]) throw new Error('Select a worksheet.');
  const rows = XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,raw:false,defval:''});
  if (rows.length > 5001) throw new Error('Maximum 5,000 rows per import. Split this worksheet.');
  const header = Number(body.header || 1)-1;
  if (!Number.isInteger(header)||header<0||header>=rows.length) throw new Error('Invalid header row.');
  if ((rows[header]||[]).length>100) throw new Error('Maximum 100 columns.');
  return {sheets:book.SheetNames,sheet,headers:rows[header],rows:rows.slice(header+1)};
}
function mapRows(parsed, mapping) {
  if (!Number.isInteger(mapping?.company)||mapping.company<0||mapping.company>=parsed.headers.length) throw new Error('Map the company column.');
  return parsed.rows.filter(r=>r.some(v=>clean(v))).map((row,i)=>{
    const out={row:i+1};
    for(const f of fields) { const ix=mapping[f]; out[f]=Number.isInteger(ix)&&ix>=0?clean(row[ix]):''; if(out[f].length>(f==='notes'?5000:1000)) throw new Error(`Row ${i+1}: ${f} is too long.`); }
    if(!out.company) throw new Error(`Data row ${i+1}: company name is required.`);
    return out;
  });
}
function registerDatabase({router,query,accountScope}) {
  const guard=(req,res,next)=>req.crmUser.permissions.manageAssignments&&req.crmUser.permissions.viewAllAccounts?next():res.status(403).json({error:'Database import and bulk assignment require account-assignment and all-account access.'});
  const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.code)return next(e);res.status(400).json({error:e.message});}};
  router.post('/database/inspect',guard,wrap(async(req,res)=>{const p=readBook(req.body);res.json({sheets:p.sheets,sheet:p.sheet,headers:p.headers,sample:p.rows.slice(0,5),count:p.rows.length,fields});}));
  router.post('/database/import',guard,wrap(async(req,res)=>{
    const rows=mapRows(readBook(req.body),req.body.mapping);
    if(!rows.length)throw new Error('No data rows found.');
    const branch=clean(req.body.branch); if(!['DXB','KWI'].includes(branch))throw new Error('Choose DXB or KWI.');
    const client=await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(261104)");
      const owner=(await client.query("select user_name from app_users where lower(user_name)=lower($1) and lower(account_status)='active' and (crm_portal_access=true or lower(trim(role))='admin')",[req.body.owner])).rows[0];
      if(!owner)throw new Error('Select an active CRM salesperson.');
      const existing=(await client.query('select id,company_name,branch,archived_at from crm_accounts')).rows;
      const accounts=new Map(); for(const a of existing){const k=key(a.company_name)+'|'+key(a.branch);if(accounts.has(k)) accounts.set(k,{ambiguous:true});else accounts.set(k,a);}
      const contacts=(await client.query('select account_id,full_name,email,phone,mobile from crm_contacts')).rows;
      const seen=new Set(contacts.map(c=>[c.account_id,key(c.full_name),key(c.email),key(c.phone),key(c.mobile)].join('|')));
      const report={accountsAdded:0,accountsMatched:0,contactsAdded:0,contactsSkipped:0,rows:rows.length};
      for(const r of rows){
        const k=key(r.company)+'|'+key(branch);let a=accounts.get(k);
        if(a?.ambiguous||a?.archived_at)throw new Error(`Company ${r.company} has duplicate or archived matches. Resolve this before importing.`);
        if(!a){a=(await client.query("insert into crm_accounts(account_code,company_name,branch,assigned_to,assigned_by,created_by,source,website,country,city,address,notes,email,phone) values('CRM-' || nextval('crm_account_code_seq'),$1,$2,$3,$4,$4,'Database import',$5,$6,$7,$8,$9,$10,$11) returning id",[r.company,branch,owner.user_name,req.crmUser.user_name,r.website,r.country,r.city,r.address,r.notes,r.contact?'':r.email,r.contact?'':r.phone])).rows[0];accounts.set(k,a);report.accountsAdded++;}else report.accountsMatched++;
        if(r.contact||r.email||r.mobile||r.phone){const name=r.contact||r.company; const ck=[a.id,key(name),key(r.email),key(r.phone),key(r.mobile)].join('|');if(seen.has(ck)){report.contactsSkipped++;continue;}
          await client.query('insert into crm_contacts(account_id,full_name,email,phone,mobile,job_title,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[a.id,name,r.email,r.phone,r.mobile,r.job_title,r.notes,req.crmUser.user_name]);seen.add(ck);report.contactsAdded++;}
      }
      if(req.body.commit===true){await client.query("insert into crm_audit_log(entity_type,entity_id,action,actor_user_name,summary,details_json) values('database','import','IMPORT',$1,'Imported CRM database',$2)",[req.crmUser.user_name,JSON.stringify(report)]);await client.query('COMMIT');}else await client.query('ROLLBACK');
      res.json({ok:true,preview:req.body.commit!==true,...report});
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  router.get('/database/accounts',guard,wrap(async(req,res)=>res.json({rows:(await query('select id,company_name,branch,assigned_to from crm_accounts where archived_at is null order by company_name')).rows})));
  router.post('/database/assign',guard,wrap(async(req,res)=>{
    const ids=[...new Set(req.body.ids||[])];if(!ids.length||ids.length>5000||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error('Select 1–5,000 accounts.');
    const branch=clean(req.body.branch),owner=clean(req.body.owner);if(branch&&!['DXB','KWI'].includes(branch))throw new Error('Invalid entity.');if(!branch&&!owner)throw new Error('Choose an owner or entity.');
    const c=await getPool().connect();try{await c.query('BEGIN');
      if(owner&&!(await c.query("select 1 from app_users where user_name=$1 and lower(account_status)='active' and (crm_portal_access=true or lower(trim(role))='admin')",[owner])).rows.length)throw new Error('Invalid salesperson.');
      const old=(await c.query('select id,assigned_to from crm_accounts where id=any($1::bigint[]) and archived_at is null for update',[ids])).rows;
      if(old.length!==ids.length)throw new Error('Some selected accounts are no longer available.');
      for(const a of old){await c.query("update crm_accounts set assigned_to=coalesce(nullif($2,''),assigned_to),branch=coalesce(nullif($3,''),branch),assigned_by=$4,assigned_at=now(),updated_at=now() where id=$1",[a.id,owner,branch,req.crmUser.user_name]);
        if(owner){await c.query("update crm_opportunities set owner_user_name=$2 where account_id=$1 and lower(owner_user_name)=lower($3)",[a.id,owner,a.assigned_to]);await c.query("update crm_tasks set assigned_to=$2 where account_id=$1 and lower(assigned_to)=lower($3) and lower(status)<>'completed'",[a.id,owner,a.assigned_to]);}
        await c.query("insert into crm_audit_log(entity_type,entity_id,account_id,action,actor_user_name,summary,details_json) values('account',$1,$2,'BULK_ASSIGN',$3,'Updated owner/entity',$4)",[String(a.id),a.id,req.crmUser.user_name,JSON.stringify({from:a.assigned_to,owner,branch})]);}
      await c.query('COMMIT');res.json({ok:true,count:ids.length});
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }));
  router.get('/database/export',wrap(async(req,res)=>{
    if(!req.crmUser.permissions.exportAccess)return res.status(403).json({error:'Export permission required.'});
    const values=[];const scope=accountScope('a',req.crmUser,values);
    const rows=(await query(`select a.company_name as company,c.full_name as contact,coalesce(c.email,a.email) as email,coalesce(c.phone,a.phone) as phone,c.mobile,c.job_title,a.website,a.country,a.city,a.address,a.notes,a.branch as entity,a.assigned_to as salesperson from crm_accounts a left join crm_contacts c on c.account_id=a.id where a.archived_at is null and ${scope} order by a.company_name,c.full_name`,values)).rows;
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows.length?rows:[Object.fromEntries([...fields,'entity','salesperson'].map(f=>[f,'']))]),'Database');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Apollo_CRM_Database.xlsx').send(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
  }));
}
module.exports={registerDatabase,readBook,mapRows};

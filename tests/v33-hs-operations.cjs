const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const express=require('express'),{PGlite}=require('@electric-sql/pglite'),XLSX=require('xlsx');
const compliance=require('../server/src/customer-compliance');
const {registerOperationsHs}=require('../server/src/operations-hs');
const {registerHsHelp}=require('../server/src/customer-hs-help');
test('Operations/customer HS: Excel, any-score choices, exports, isolated ownership and DXB replies',async()=>{
 const db=new PGlite();
 for(const name of ['042_customer_compliance.sql','054_customer_hs_help.sql','058_operations_hs_checks.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../server/sql',name),'utf8'));
 await db.exec(`create table app_users(user_name text,role text,account_status text,erp_portal_access boolean,section_access text,branch_access text);
 insert into app_users values ('ops','User','Active',true,'Shipment / Airway','Kuwait HO'),('other','User','Active',true,'HS Code Check','Dubai'),('reviewer','Admin','Active',true,'All','Dubai'),('denied','User','Active',true,'Reports','Dubai'),('off','Admin','Inactive',true,'All','Dubai');`);
 const query=async(sql,values)=>{const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};};
 const staff=(req,res,next)=>{if(req.headers['x-portal']!=='company')return res.status(403).json({error:'ERP required'});req.appSession={userName:req.headers['x-user']||'ops'};next();};
 const customer=(req,res,next)=>{if(req.headers['x-portal']!=='customer')return res.status(403).json({error:'Customer required'});req.customerSession={customerCode:req.headers['x-user']||'ops',userName:'Customer'};next();};
 const app=express();app.use(express.json({limit:'5mb'}));registerOperationsHs({app,query,requireErpPortalAuth:staff});
 app.use('/api/customer/compliance',compliance.createCustomerComplianceRouter({query,requireCustomerPortalAuth:customer}));
 registerHsHelp({app,query,requireCustomerPortalAuth:customer,requireErpPortalAuth:staff,...compliance});
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const call=(url,body,user='ops',portal='company')=>fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-user':user,'x-portal':portal},body:body?JSON.stringify(body):undefined});
 try{
  if(process.env.HS_REGRESSION_FILE){
   const actual={fileName:'KRO-106389.xlsx',contentBase64:fs.readFileSync(process.env.HS_REGRESSION_FILE).toString('base64')};
   for(const [prefix,portal,user] of [['operations','company','ops'],['customer','customer','invoice-test']]){
    const response=await call('/api/'+prefix+'/compliance/analyze',{destination:'Kuwait',files:[actual]},user,portal);
    const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.result.lines.length,5);
    assert(payload.result.lines.every(l=>l.submittedHsCode==='330300100001'));assert(payload.result.warnings.some(w=>w.includes('33073000')));
    const download=await call('/api/'+prefix+'/hs-help/'+payload.analysisId+'/download',null,user,portal);assert.equal(download.status,200);
    const book=XLSX.read(Buffer.from(await download.arrayBuffer()),{type:'buffer'});const values=XLSX.utils.sheet_to_json(book.Sheets['HS Summary'],{header:1,defval:''});
    assert.equal(values.slice(4).filter(r=>r[6]==='330300100001').length,5);
   }
   await db.exec('delete from customer_compliance_checks; delete from operations_hs_checks;');
  }
  for(const user of ['denied','off'])assert.equal((await call('/api/operations/compliance/meta',null,user)).status,403);
  assert.equal((await call('/api/operations/compliance/meta',null,'ops','customer')).status,403);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Description','HS Code'],['Perfumes in liquid or solid forms.','33030010'],['Liquid perfumes','']]),'Summary');
  const file={fileName:'Master-summary.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBase64:XLSX.write(wb,{type:'buffer',bookType:'xlsx'}).toString('base64')};
  let res=await call('/api/operations/compliance/analyze',{destination:'Kuwait',files:[file]});assert.equal(res.status,200);let data=await res.json();const id=data.analysisId;assert.equal(data.result.lines.length,2);assert(data.result.lines[0].suggestion?.hsCode);
  assert.equal((await db.query('select count(*)::int n from customer_compliance_checks')).rows[0].n,0);
  for(const [user,portal,prefix] of [['other','company','operations'],['ops','customer','customer']])assert.equal((await call('/api/'+prefix+'/compliance/'+id,null,user,portal)).status,404);
  // Persist actual master suggestions at low scores, including a missing input code.
  const saved=(await db.query('select result_json from operations_hs_checks where analysis_id=$1',[id])).rows[0];let result=JSON.parse(saved.result_json);
  result.lines[0].suggestion.confidence=82;result.lines[1].suggestion=result.lines[0].suggestion;result.lines[1].suggestion={...result.lines[0].suggestion,confidence:0};
  await db.query('update operations_hs_checks set result_json=$1 where analysis_id=$2',[JSON.stringify(result),id]);
  res=await call('/api/operations/compliance/'+id+'/confirm',{accepted:result.lines.map(l=>({lineIndex:l.lineIndex,hsCode:l.suggestion.hsCode}))});assert.equal(res.status,200);data=await res.json();assert.equal(data.applied.length,2);assert(data.result.lines.every(l=>l.status==='REVIEW')); // Perfume master has a restriction: selection succeeds without erasing it.assert.equal(data.result.lines[0].confidence,82);assert.equal(data.result.lines[1].confidence,0);assert.equal(data.result.attentionItems.length,2);
  const expected=data.result.lines[0].effectiveHsCode;
  res=await call('/api/operations/hs-help/'+id+'/download');assert.equal(res.status,200);const out=XLSX.read(Buffer.from(await res.arrayBuffer()),{type:'buffer'}),rows=XLSX.utils.sheet_to_json(out.Sheets['HS Summary'],{header:1,defval:''});
  assert.equal(rows[4][7],expected);assert.equal(rows[5][7],expected);assert.equal(rows[4][6],'33030010');assert.equal(rows[5][6],'');assert.equal(rows[4][5],'Perfumes in liquid or solid forms.');assert.equal(rows[4][9],82);assert.equal(rows[4][12],'Alternative HS code selected');assert.equal(out.Sheets['HS Summary']['H5'].t,'s');
  res=await call('/api/operations/compliance/'+id+'/confirm',{accepted:[{lineIndex:0,hsCode:'999999999999999'}]});data=await res.json();assert.equal(data.applied.length,0);
  assert.equal((await call('/api/operations/hs-help/'+id+'/download',null,'other')).status,404);
  res=await call('/api/operations/hs-help/'+id+'/help',{lineIndexes:[0,1],question:'Check these codes'});assert.equal(res.status,200);const helpId=(await res.json()).id;
  assert.equal((await call('/api/operations/hs-review/requests',null,'ops')).status,403);
  res=await call('/api/operations/hs-review/requests',null,'reviewer');assert.equal((await res.json()).rows.length,1);
  res=await call('/api/operations/hs-review/requests/'+helpId+'/reply',{replies:[{lineIndex:0,hsCode:expected,comment:'Reviewed'},{lineIndex:1,hsCode:expected,comment:'Reviewed'}]},'reviewer');assert.equal(res.status,200);
  res=await call('/api/operations/hs-help/requests');assert.equal((await res.json()).rows[0].status,'ANSWERED');res=await call('/api/operations/hs-help/requests',null,'other');assert.equal((await res.json()).rows.length,0);
  assert.equal((await call('/api/operations/hs-help/requests/'+helpId+'/download')).status,200);
  assert.equal((await db.query('select count(*)::int n from customer_hs_help')).rows[0].n,0);
  // Restriction/clarification warnings remain visible even after explicit selection.
  result.lines[0].status='BLOCKED';result.lines[0].issue='Original prohibition warning';result.lines[1].clarificationQuestion='What material?';
  await db.query('update operations_hs_checks set result_json=$1 where analysis_id=$2',[JSON.stringify(result),id]);res=await call('/api/operations/compliance/'+id+'/confirm',{accepted:result.lines.map(l=>({lineIndex:l.lineIndex,hsCode:l.suggestion.hsCode}))});data=await res.json();assert.equal(data.applied.length,2);assert.equal(data.result.lines[0].status,'BLOCKED');assert.match(data.result.lines[0].issue,/Original prohibition/);assert.equal(data.result.lines[1].clarificationQuestion,'What material?');
  const unrestricted=[...compliance.masterIndex().values()].find(x=>!x.importRestriction&&!x.importProhibition);
  result.lines=[{lineIndex:0,description:'Description only',submittedHsCode:'',status:'ATTENTION',suggestion:{hsCode:unrestricted.hsCode,confidence:0}}];
  await db.query('update operations_hs_checks set result_json=$1 where analysis_id=$2',[JSON.stringify(result),id]);res=await call('/api/operations/compliance/'+id+'/confirm',{accepted:[{lineIndex:0,hsCode:unrestricted.hsCode}]});data=await res.json();assert.deepEqual(data.applied,[0]);assert.equal(data.result.lines[0].status,'CUSTOMER_SELECTED');assert.equal(data.result.attentionItems.length,0);
  // Same behaviour in customer routes, independent of internal staff data.
  res=await call('/api/customer/compliance/analyze',{destination:'Kuwait',files:[file]},'customer1','customer');data=await res.json();assert.equal(res.status,200);const customerId=data.analysisId;
  res=await call('/api/customer/compliance/'+customerId+'/confirm',{accepted:[{lineIndex:0,hsCode:data.result.lines[0].suggestion.hsCode}]},'customer1','customer');data=await res.json();assert.deepEqual(data.applied,[0]);
  res=await call('/api/customer/hs-help/'+customerId+'/download',null,'customer1','customer');assert.equal(res.status,200);
 }finally{await new Promise(r=>server.close(r));await db.close();}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express'),vm=require('vm');
const {accountFor,writable,assertJob,guardMutation}=require('../server/src/station-accounts');
test('Station accounts: duplicate control, independent blocks, legacy jobs, all write paths and AWB reads',async()=>{
 const db=new PGlite();const query=async(s,p)=>{const r=await db.query(s,p);return {...r,rowCount:r.affectedRows??r.rows.length}};
 try{
 await db.exec(`create table customers(id bigserial primary key,code text unique,name text,branch text,status text default 'Active',blocked_branches text);
 create table shipments(id bigserial primary key,job_no text unique,branch text,customer_name text,notes text,airway_bill_no text,status text,actual_kg numeric,cbm numeric,pod_status text,invoice_status text,updated_at timestamptz default now());
 create table documents(document_no text,linked_no text,status text);
 create table shipment_status_history(id bigserial,job_no text,branch text,status text,pod_status text,invoice_status text,notes text,updated_by text,updated_at timestamptz);
 create table invoices(invoice_no text,shipment_no text);
 create table consolidations(load_no text,job_numbers text);
 create table additional_charges(ref_no text,shipment_no text);
 create table app_users(user_name text,role text,account_status text,branch_access text);
 insert into customers(code,name,branch) values ('0021','Sun and Sand','Dubai');
 insert into shipments(job_no,branch,customer_name,notes,airway_bill_no,status,actual_kg,cbm) values ('DXB-1','Dubai','Sun and Sand','{"customerCode":"0021"}','AWB123','Booked',150,3),('KWI-1','Kuwait HO','Sun and Sand','{"customerCode":"0021"}','AWB123','Booked',150,3);
 insert into app_users values ('kwi','User','Active','Kuwait HO'),('dxb','User','Active','Dubai'),('admin','Admin','Active','Both');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/sql/057_station_customer_accounts.sql'),'utf8'));
 // Migration preserves old job identities and the original cross-station code in notes.
 assert.equal((await query("select notes from shipments where job_no='KWI-1'")).rows[0].notes,'{"customerCode":"0021"}');
 await assert.rejects(query("update shipments set status='Clearance' where job_no='KWI-1'"),/local.*customer account/);
 await query("insert into customers(code,name,branch) values ('1212','Sun and Sand','KWI')");
 await assert.rejects(query("insert into customers(code,name,branch) values ('1213',' SUN AND SAND. ','Kuwait HO')"),/already exists/);
 await assert.rejects(query("insert into customers(code,name,branch) values ('0021','Other','Kuwait HO')"),/unique/);
 await assert.rejects(query("update customers set branch='Dubai' where code='1212'"),/cannot be changed/);
 let c=await accountFor(query,{branch:'KWI',customer_name:'Sun and Sand',customer_code:'0021'});assert.equal(c.code,'1212');
 await query("update shipments set status='Clearance' where job_no='KWI-1'");
 assert.equal((await query("select customer_code from shipments where job_no='KWI-1'")).rows[0].customer_code,'1212');
 await query("insert into documents values ('POD-KWI','KWI-1','Uploaded')");
 await query("insert into invoices values ('INV-KWI','KWI-1')");
 await query("insert into consolidations values ('LOAD1','KWI-1')");
 await query("update customers set status='Blocked',blocked_branches='Kuwait HO' where code='1212'");
 for(const sql of ["update shipments set status='Delivered' where job_no='KWI-1'","delete from shipments where job_no='KWI-1'","update shipments set customer_code='0021',branch='Dubai' where job_no='KWI-1'","insert into shipments(job_no,branch,customer_name,notes) values('KWI-2','Kuwait HO','Sun and Sand','{}')","insert into documents values('POD2','KWI-1','Uploaded')","delete from documents where document_no='POD-KWI'","insert into shipment_status_history(job_no,status) values('KWI-1','Delivered')","update invoices set shipment_no='DXB-1' where invoice_no='INV-KWI'","update consolidations set job_numbers='DXB-1' where load_no='LOAD1'","insert into additional_charges values('CH1','KWI-1')"]){await assert.rejects(query(sql),/blocked/);}
 await query("update shipments set status='Delivered' where job_no='DXB-1'");
 await query("insert into documents values('POD-DXB','DXB-1','Uploaded')");
 let rows=(await query("select * from shipments where airway_bill_no='AWB123' order by job_no")).rows;
 assert.equal(rows.length,2);assert.equal(Number(rows[0].actual_kg),150);assert.equal(Number(rows[1].cbm),3);
 assert.equal(await writable(query,rows[0]),true);assert.equal(await writable(query,rows[1]),false);
 // Exercise the actual V32 route code, not a reimplementation of its AWB loop.
 const app=express();app.use(express.json());const source=fs.readFileSync(path.join(__dirname,'../server/src/index.js'),'utf8');
 const start=source.indexOf('app.post("/api/shipments/status-by-awb"');const end=source.indexOf('app.post("/api/shipments",',start);
 const env={app,query,requireErpPortalAuth:(req,res,next)=>{req.appSession={userName:req.headers['x-user']||'dxb'};next();},normalizeBranchKey:x=>x,normalizeStatusHistoryTimestamp:x=>x,stationAccounts:require('../server/src/station-accounts'),isDatabaseSetupError:()=>false,
 withDatabaseTransaction:async fn=>{await db.exec('begin');try{const r=await fn({query});await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}};
 vm.runInNewContext(source.slice(start,end),env);app.use((e,req,res,next)=>res.status(e.status||409).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  let res=await fetch('http://127.0.0.1:'+server.address().port+'/api/shipments/status-by-awb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({airwayBillNo:'AWB123',branch:'Dubai',status:'In Transit'})});
  assert.equal(res.status,200);const body=await res.json();assert.equal(body.rows.find(r=>r.branch==='Dubai').status,'In Transit');assert.equal(body.rows.find(r=>r.branch==='Kuwait HO').status,'Clearance');
  res=await fetch('http://127.0.0.1:'+server.address().port+'/api/shipments/status-by-awb',{method:'POST',headers:{'Content-Type':'application/json','x-user':'kwi'},body:JSON.stringify({airwayBillNo:'AWB123',branch:'Kuwait HO',status:'Delivered'})});assert.equal(res.status,409);
 }finally{await new Promise(r=>server.close(r));}
 // A denied related job must not abort the surrounding AWB transaction.
 await db.exec('begin');assert.equal(await writable(query,rows[1]),false);await query("update shipments set status='Booked' where job_no='DXB-1'");await db.exec('commit');
 await assert.rejects(guardMutation(query,{}, {path:'/pod-documents',method:'POST',appSession:{userName:'kwi'},body:{jobNo:'DXB-1'}}),/read-only/);
 await assert.rejects(guardMutation(query,{}, {path:'/pod-documents',method:'POST',appSession:{userName:'kwi'},body:{jobNo:'KWI-1'}}),/blocked/);
 await query("update customers set status='Active',blocked_branches=null where code='1212'");await assertJob(query,'KWI-1');
 await query("update shipments set status='Delivered' where job_no='KWI-1'");
 assert.equal((await query("select code from customers where branch='Dubai'")).rows[0].code,'0021');
 assert.equal((await query("select count(*)::int as n from shipments")).rows[0].n,2);
 await query("update customers set status='Blocked',blocked_branches='Kuwait HO' where code='0021'");
 await assert.rejects(db.exec(fs.readFileSync(path.join(__dirname,'../server/sql/057_station_customer_accounts.sql'),'utf8')),/legacy cross-station/);await db.exec('rollback');
 }finally{await db.close();}
});

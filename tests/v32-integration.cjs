// QA-only dependencies: @electric-sql/pglite + normal server dependencies via NODE_PATH.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),express=require('express');
const {createApolloAiRouter}=require('../server/src/apollo-ai');
const {createCustomerComplianceRouter,analyzeLineItem,masterIndex,READY_THRESHOLD}=require('../server/src/customer-compliance');
const {intent,nextBlockState}=require('../server/src/ai-accounts');
const {callOpenAI}=require('../server/src/apollo-openai');
test('V32 database-backed search, branch controls, permissions, confirmations and HS bulk',async()=>{
 const db=new PGlite();await db.exec(`create table crm_accounts(id bigint primary key,account_code text,company_name text,branch text,assigned_to text,status text,archived_at timestamptz,phone text,email text,address text,next_action text,next_action_date date);
 create table crm_contacts(id bigint,account_id bigint,full_name text,job_title text,email text,phone text,mobile text);
 create table customers(id bigint primary key,code text,name text,branch text,status text,blocked_branches text,updated_at timestamptz,email text,mobile text,full_address text,terms text,is_account_overdue boolean);
 create table customer_compliance_checks(analysis_id text primary key,customer_code text,result_json text,status text,expires_at timestamptz,updated_at timestamptz);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/sql/056_ai_account_actions.sql'),'utf8'));
 await db.exec(`insert into crm_accounts(id,account_code,company_name,branch,assigned_to,status) select n,'CRM-'||n,'Unrelated company '||n,'DXB','Ahmad','Prospect' from generate_series(1,1301) n;
 insert into crm_accounts(id,account_code,company_name,branch,assigned_to,status) values (1400,'CRM-SUN','Sun & Sand Sports','KWI','Khaldoun','Customer'),(1401,'CRM-SUND','Sun and Sand Sports','DXB','Ahmad','Customer'),(1402,'CRM-COOL','cool station plus','KWI','Ahmad','Prospect');
 insert into customers(id,code,name,branch,status,is_account_overdue) values (1,'CUS-SUN','Sun & Sand Sports','Kuwait HO','Active',true),(2,'CUS-SUND','Sun and Sand Sports','Dubai','Active',false);`);
 const users={admin:{user_name:'Khaldoun',role:'Admin',account_status:'Active'},sales:{user_name:'Ahmad',role:'User',account_status:'Active',crm_portal_access:true,ai_access:true},off:{user_name:'Off',role:'Admin',account_status:'Inactive'}};
 let active='admin';
 const query=async(sql,values)=>{
   if(sql.includes('from app_users'))return {rows:[users[active]]};
   if(sql.includes('insert into ai_audit_log'))return {rows:[]};
   const r=await db.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};
 };
 const app=express();app.use(express.json());
 app.use('/api/ai',createApolloAiRouter({query,requireAppAuth:(req,res,next)=>{req.appSession={userName:users[active].user_name};next();}}));
 app.use('/api/customer/compliance',createCustomerComplianceRouter({query,requireCustomerPortalAuth:(req,res,next)=>{req.customerSession={customerCode:req.headers['x-customer']||'TEST'};next();}}));
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(p,body,headers={})=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try{
  assert.deepEqual(intent('open sun and sand in accounts for kwi station').tokens,['sun','sand']);
  let r=await request('/api/ai/chat',{message:'open sun and sand in accounts for kwi station'});assert.equal(r.status,200);assert.match(r.data.answer,/CRM-SUN/);assert(!r.data.answer.includes('cool station'));assert(!r.data.answer.includes('CRM-SUND'));
  r=await request('/api/ai/chat',{message:'show me the sun and sand account number in KWI branch'});assert.match(r.data.answer,/CRM-SUN/);
  r=await request('/api/ai/account/crm/1400');assert.match(r.data.answer,/Sun & Sand/);
  active='sales';r=await request('/api/ai/chat',{message:'find sun and sand account KWI'});assert(!r.data.answer.includes('CRM-SUN'));r=await request('/api/ai/account/crm/1400');assert.equal(r.status,404);
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'block',branch:'Both'});assert.equal(r.status,403);
  active='off';r=await request('/api/ai/account/customer/1');assert.equal(r.status,403);active='admin';
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'block',branch:'Kuwait HO'});assert.equal(r.status,200);const token=r.data.actions[0].token;
  assert.equal((await db.query('select status from customers where id=1')).rows[0].status,'Active');
  r=await request('/api/ai/account-change/confirm',{token});assert.equal(r.status,200);let c=(await db.query('select * from customers where id=1')).rows[0];assert.equal(c.status,'Blocked');assert.equal(c.blocked_branches,'Kuwait HO');assert.equal(c.is_account_overdue,true);
  r=await request('/api/ai/account-change/confirm',{token});assert.equal(r.status,409);
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'block',branch:'Dubai'});assert.equal(r.status,409);let tok;
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'unblock',branch:'Kuwait HO'});tok=r.data.actions[0].token;await request('/api/ai/account-change/confirm',{token:tok});assert.equal((await db.query('select status from customers where id=1')).rows[0].status,'Active');
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'block',branch:'Both'});tok=r.data.actions[0].token;
  await db.exec("update customers set status='Blocked',blocked_branches='Kuwait HO' where id=1");r=await request('/api/ai/account-change/confirm',{token:tok});assert.equal(r.status,409);
  r=await request('/api/ai/account-change/prepare',{id:1,operation:'unblock',branch:'Both'});tok=r.data.actions[0].token;await db.query("update ai_account_actions set created_at=now()-interval '6 minutes' where token=$1",[tok]);r=await request('/api/ai/account-change/confirm',{token:tok});assert.equal(r.status,409);
  assert.deepEqual(nextBlockState({status:'Blocked',blocked_branches:null},'unblock','Kuwait HO'),{status:'Blocked',blocked_branches:'Dubai'});
  // No generated SQL or model credentials are needed for all preceding checks.
  assert.equal(READY_THRESHOLD,90);
  const accessory=analyzeLineItem({description:'Accessories',hsCode:'621710900000'},0);assert.equal(accessory.confidence,92);assert.equal(accessory.status,'PASS');
  const valid=[...masterIndex().values()].find(x=>!x.importRestriction&&!x.importProhibition);
  const lines=Array.from({length:35},(_,i)=>({lineIndex:i,description:'Fixture',submittedHsCode:valid.hsCode,effectiveHsCode:valid.hsCode,status:'ATTENTION',confidence:80,suggestion:{hsCode:valid.hsCode,confidence:91}}));
  lines[0].clarificationQuestion='What use?';lines[1].status='BLOCKED';lines[2].suggestion.confidence=89;
  await db.query("insert into customer_compliance_checks values ('check','TEST',$1,'ATTENTION_REQUIRED',now()+interval '1 day',now())",[JSON.stringify({lines})]);
  r=await request('/api/customer/compliance/check/confirm',{accepted:lines.map(l=>({lineIndex:l.lineIndex,hsCode:valid.hsCode}))});assert.equal(r.status,200);assert.equal(r.data.applied.length,32);assert.equal(r.data.skipped.length,3);assert(r.data.result.lines[0].clarificationQuestion);assert.equal(r.data.result.lines[1].status,'BLOCKED');
  r=await request('/api/customer/compliance/check/confirm',{accepted:[{lineIndex:1,keepOriginal:true}]},{'x-customer':'OTHER'});assert.equal(r.status,404);
  r=await request('/api/ai/me');assert.equal(r.data.provider,'OpenAI API');assert.equal(r.data.model,'gpt-5.4-mini');
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
test('OpenAI adapter contract, no Gemini fallback and incomplete/error handling',async()=>{
 const old=global.fetch,key=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{await assert.rejects(callOpenAI({model:'gpt-5.4-mini'}),/not configured/);process.env.OPENAI_API_KEY='test-only';
 global.fetch=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(opts.body);assert.equal(b.store,false);assert.equal(b.model,'gpt-5.4-mini');return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Grounded reply'}]}]})};};
 assert.equal(await callOpenAI({model:'gpt-5.4-mini',instructions:'Test',message:'Hi'}),'Grounded reply');
 global.fetch=async()=>({ok:false,status:401,json:async()=>({})});await assert.rejects(callOpenAI({}),/credentials/);
 }finally{global.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

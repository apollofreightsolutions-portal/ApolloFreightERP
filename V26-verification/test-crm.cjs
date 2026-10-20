const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.env.APOLLO_TEST_ROOT||'v26_current/ApolloFreightERP-main');
const req=require('node:module').createRequire(root+'/server/package.json');
const express=req('express'),{createCrmRouter}=req('./src/crm');
const users=[{user_name:'Admin',role:'Admin',email:'admin@example.test',account_status:'Active'},
  {user_name:'Ali',role:'Sales',email:'ali@example.test',account_status:'Active',crm_portal_access:true},
  {user_name:'Sam',role:'Sales',email:'sam@example.test',account_status:'Active',crm_portal_access:true}];
const accounts=[{id:1,company_name:'Alpha Retail',assigned_to:'Ali',account_code:'A1'}, {id:2,company_name:'Beta Retail',assigned_to:'Sam',account_code:'A2'}];
const opportunities=[{id:11,account_id:1,owner_user_name:'Ali',title:'Alpha freight',stage:'Proposal',status:'Open',estimated_value:100,currency:'AED',probability:50,opportunity_no:'OPP-11'},
  {id:22,account_id:2,owner_user_name:'Sam',title:'Beta freight',stage:'Proposal',status:'Open',estimated_value:200,currency:'AED',probability:50,opportunity_no:'OPP-22'}];
const visits=[{id:31,account_id:1,created_by:'Ali',purpose:'Alpha meeting',visit_date:'2026-10-20'},
  {id:32,account_id:2,created_by:'Sam',purpose:'Beta meeting',visit_date:'2026-10-20'},
  {id:33,account_id:1,created_by:'Sam',purpose:'Historic transferred visit',visit_date:'2026-10-10'}];
let comments=[],tasks=[],mail=[],mailFailure=false,dbFailure=false;const queries=[];
const enrich=r=>({...r,...Object.fromEntries(Object.entries(accounts.find(a=>a.id===r.account_id)).filter(([k])=>k!=='id'))});
function scopeRows(sql,values,rows) {const match=sql.match(/lower\(a.assigned_to\) = lower\(\$(\d+)\)/);return match?rows.filter(r=>r.assigned_to.toLowerCase()===String(values[Number(match[1])-1]).toLowerCase()):rows;}
async function query(sql,values=[]) {
  queries.push({sql,values});
  if(sql.includes('from app_users')&&sql.includes('crm_manage_assignments'))return {rows:users.filter(u=>u.user_name.toLowerCase()===String(values[0]).toLowerCase())};
  if(sql.includes('select user_name,email from app_users')) {
    const eligible=users.filter(u=>u.account_status==='Active'&&(u.user_name.toLowerCase()===String(values[0]).toLowerCase()||u.user_name.toLowerCase()===String(values[1]).toLowerCase())&&(u.role==='Admin'||u.user_name.toLowerCase()===String(values[1]).toLowerCase()));
    eligible.sort((a,b)=>Number(b.user_name===values[0])-Number(a.user_name===values[0]));return {rows:eligible.slice(0,1)};
  }
  if(sql.includes('select distinct salesperson')) {
    assert.match(sql,/a.archived_at is null/);
    return {rows:[...scopeRows(sql,values,opportunities.map(enrich)).map(r=>({salesperson:r.owner_user_name,entity:'opportunities'})),...scopeRows(sql,values,visits.map(enrich)).map(r=>({salesperson:r.created_by,entity:'visits'}))]};
  }
  if(sql.includes('select r.*')) {
    const rows=(sql.includes('crm_opportunities')?opportunities:visits).filter(r=>r.id===values[0]).map(enrich);
    return {rows:scopeRows(sql,values,rows)};
  }
  if(sql.includes("action='REVIEW_COMMENT'"))return {rows:comments.filter(c=>c.entity_type===values[0]&&c.entity_id===values[1]&&c.account_id===values[2]).slice().reverse()};
  if(sql.includes('with comment as')) {
    assert.match(sql,/insert into crm_audit_log/);assert.match(sql,/insert into crm_tasks/);assert.match(sql,/from comment returning id/);
    if(dbFailure)throw Error('Simulated database outage');
    const id=comments.length+1,taskId=tasks.length+1;
    comments.push({id,entity_type:values[0],entity_id:values[1],account_id:values[2],actor_user_name:values[3],details_json:JSON.parse(values[5]),created_at:'2026-10-20T12:00:00Z'});
    tasks.push({id:taskId,assigned_to:values[7],description:values[9],due_date:values[10],opportunity_id:values[11]});
    return {rows:[{id,task_id:taskId}]};
  }
  if(sql.includes('from crm_opportunities o join')||sql.includes('from crm_opportunities o\n')) {
    let rows=scopeRows(sql,values,opportunities.map(enrich));
    const filter=sql.match(/a.assigned_to\)\)=lower\(\$(\d+)\)/);
    if(filter)rows=rows.filter(r=>r.owner_user_name.toLowerCase()===String(values[Number(filter[1])-1]).toLowerCase());
    return {rows};
  }
  if(sql.includes('from crm_visits v join')) {
    let rows=scopeRows(sql,values,visits.map(enrich));const filter=sql.match(/lower\(v.created_by\)=lower\(\$(\d+)\)/);
    if(filter)rows=rows.filter(r=>r.created_by.toLowerCase()===String(values[Number(filter[1])-1]).toLowerCase());return {rows};
  }
  if(sql.includes('from crm_accounts a\n'))return {rows:scopeRows(sql,values,accounts)};
  if(sql.includes('from crm_contacts'))return {rows:[]};
  throw Error('Unhandled test query: '+sql);
}
const app=express();app.use(express.json());
app.use('/api/crm',createCrmRouter({query,requireAppAuth:(r,s,n)=>{const user=String(r.headers.authorization||'').replace('Bearer ','');if(!users.some(u=>u.user_name===user))return s.sendStatus(401);r.appSession={userName:user,crmPortal:true};n();},sendMail:async m=>{if(mailFailure)throw Error('Simulated mail outage');mail.push(m);return {accepted:true};}}));
app.use('/assets',express.static(root+'/web'));
app.get('/',(r,s)=>s.send('<html><head><link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/crm-portal.css"></head><body><main id="moduleContent"></main></body></html>'));
app.use((e,r,s,n)=>s.status(e.status||500).json({ok:false,error:e.message}));
(async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
  const call=(url,user='Admin',body)=>fetch(origin+'/api/crm'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  let browser;
  try {
    let r=await call('/opportunities?salesperson=Sam');assert.equal(r.status,200);assert.deepEqual((await r.json()).rows.map(x=>x.id),[22]);
    r=await call('/opportunities?salesperson=Sam','Ali');assert.equal(r.status,200);assert.equal((await r.json()).rows.length,0);
    r=await call('/visits?salesperson=Sam');assert.deepEqual((await r.json()).rows.map(x=>x.id),[32,33]);
    r=await call('/salespeople','Ali');const people=(await r.json()).rows;assert.ok(!people.some(x=>x.entity==='opportunities'&&x.salesperson==='Sam'));
    r=await call('/export/opportunities?salesperson=Sam');assert.equal(r.status,200);const csv=await r.text();assert.match(csv,/Beta freight/);assert.doesNotMatch(csv,/Alpha freight/);
    console.log('PASS server-side salesperson filters, original visit author, scoped options, filtered export and no access expansion');
    r=await call('/reviews/opportunities/22','Ali');assert.equal(r.status,404);
    r=await call('/reviews/opportunities/11','Ali',{comment:'Unauthorized management post'});assert.equal(r.status,403);assert.equal(comments.length,0);
    r=await call('/reviews/opportunities/11','Admin',{comment:'Please follow up <script>alert(1)</script>',dueDate:'2026-10-25',recipient:'Sam'});assert.equal(r.status,201);let saved=await r.json();assert.equal(saved.recipient,'Ali');assert.equal(saved.emailStatus,'accepted');assert.equal(tasks[0].assigned_to,'Ali');assert.equal(tasks[0].opportunity_id,11);assert.equal(mail[0].to[0],'ali@example.test');assert.ok(!mail[0].html.includes('<script>'));
    r=await call('/reviews/opportunities/11','Ali');assert.equal(r.status,200);assert.equal((await r.json()).rows.length,1);
    r=await call('/reviews/visits/33','Admin',{comment:'Please check the historic visit.'});assert.equal(r.status,201);assert.equal((await r.json()).recipient,'Ali');assert.equal(tasks[1].opportunity_id,null);
    console.log('PASS append-only comment history, atomic comment/task SQL, server-selected recipient, salesperson read access, email escaping and reassigned-account recipient fallback');
    const before=comments.length;for(const body of [{comment:''},{comment:'x'.repeat(5001)},{comment:'Check',dueDate:'2026-02-30'}]){r=await call('/reviews/visits/31','Admin',body);assert.equal(r.status,400);}assert.equal(comments.length,before);
    mailFailure=true;r=await call('/reviews/visits/31','Admin',{comment:'Check outcome'});assert.equal(r.status,201);saved=await r.json();assert.equal(saved.emailStatus,'not_sent');assert.match(saved.message,/Email was not sent/);assert.equal(comments.length,before+1);
    dbFailure=true;const mailCount=mail.length;r=await call('/reviews/visits/31','Admin',{comment:'Cannot save'});assert.equal(r.status,500);assert.equal(mail.length,mailCount);dbFailure=false;mailFailure=false;
    console.log('PASS validation, mail failure preserves saved follow-up with honest status, and database failure never sends email');
    const vm=require('node:vm'),listeners={},alerts=[];
    let authUser='Admin';
    const dialog={innerHTML:'',querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}};
    const button={disabled:false,textContent:''},form={querySelector:()=>button};
    const ctx={console,fetch,FormData,URL,Date,setTimeout,clearTimeout,
      sessionStorage:{getItem:()=>JSON.stringify({userName:authUser,token:authUser,crmViewAllAccounts:authUser==='Admin',crmExportAccess:authUser==='Admin'})},
      window:{location:{origin},alert:m=>alerts.push(m)},
      document:{querySelector:s=>s==='#crmDialog'?dialog:null,addEventListener:(name,fn)=>{listeners[name]=fn;}}};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/web/crm-portal.js','utf8'),ctx);
    await vm.runInContext('load("salespeople")',ctx);await vm.runInContext('load("opportunities")',ctx);await vm.runInContext('load("accounts")',ctx);
    let rendered=vm.runInContext('renderOpportunities()',ctx);assert.match(rendered,/Alpha freight/);assert.match(rendered,/Beta freight/);
    listeners.change({target:{dataset:{crmSalesperson:'opportunities'},value:'Sam'}});
    await vm.runInContext('load("opportunities")',ctx);rendered=vm.runInContext('renderOpportunities()',ctx);assert.match(rendered,/Beta freight/);assert.doesNotMatch(rendered,/Alpha freight/);
    await vm.runInContext('openReview("opportunities",22)',ctx);assert.match(dialog.innerHTML,/Send to:/);assert.match(dialog.innerHTML,/Sam/);
    ctx.testForm=form;await vm.runInContext('sendReview(testForm,{entity:"opportunities",id:22,comment:"Please follow up tomorrow.",dueDate:"2026-10-21"})',ctx);
    assert.equal(button.disabled,false);assert.match(dialog.innerHTML,/email accepted for sending/);assert.match(dialog.innerHTML,/Please follow up tomorrow/);assert.equal(tasks.at(-1).assigned_to,'Sam');assert.equal(mail.at(-1).to[0],'sam@example.test');
    await vm.runInContext('load("visits")',ctx);await vm.runInContext('load("contacts")',ctx);
    listeners.change({target:{dataset:{crmSalesperson:'visits'},value:'Sam'}});
    await vm.runInContext('load("visits")',ctx);rendered=vm.runInContext('renderVisits()',ctx);assert.match(rendered,/Historic transferred visit/);assert.doesNotMatch(rendered,/Alpha meeting/);
    authUser='Ali';await vm.runInContext('openReview("opportunities",11)',ctx);assert.match(dialog.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(dialog.innerHTML,/<textarea/);assert.deepEqual(alerts,[]);
    console.log('PASS actual frontend functions and change handler: filters through HTTP, modal, comment send, persisted history, staff read-only view and HTML escaping');
    console.log('LIMIT: database/mail/DOM adapters simulated; actual Express routes and frontend functions executed. Browser rendering not verified (Chromium unavailable). No production data or external email used.');
  } finally {if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

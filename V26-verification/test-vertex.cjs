const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(process.env.APOLLO_TEST_ROOT || 'v26_current/ApolloFreightERP-main');
const req=require('module').createRequire(root+'/server/package.json');
const env={GOOGLE_CLOUD_PROJECT:'fixture-project'};let endpoint,body,headers,status=200;
const payload={lineItems:[],shipment:{},cargoLines:[],warnings:[]};
const context={require:n=>n==='google-auth-library'?{GoogleAuth:class{async getClient(){return {getRequestHeaders:async()=>({Authorization:'Bearer local-fixture'})}}}}:req(n.startsWith('./')?'./src/'+n.slice(2):n),__dirname:root+'/server/src',module:{exports:{}},process:{env},Buffer,URL,AbortController,setTimeout,clearTimeout,console:{warn:()=>{}},fetch:async(url,opts)=>{
 endpoint=url;body=JSON.parse(opts.body);headers=opts.headers;
 return {ok:status===200,status,json:async()=>status===200?{candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}:{error:{message:'Private provider diagnostic: fixture project only'}}};
}};
vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/server/src/customer-compliance.js','utf8')+'\nthis.provider=providerRequest;',context);
const pdf={fileName:'fixture.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('%PDF-transport-fixture').toString('base64')};
(async()=>{
 await context.provider({files:[pdf],destination:'Kuwait'});
 assert.equal(endpoint,'https://aiplatform.googleapis.com/v1/projects/fixture-project/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent');
 assert.equal(headers.Authorization,'Bearer local-fixture');assert.equal(body.contents[0].parts[1].inlineData.data,pdf.contentBase64);
 console.log('PASS default Vertex global host, resource location, bearer header and PDF transport payload');
 env.APOLLO_COMPLIANCE_LOCATION='us-central1';env.APOLLO_COMPLIANCE_MODEL='fixture-regional-model';
 await context.provider({files:[pdf],destination:'Kuwait'});assert.match(endpoint,/https:\/\/us-central1-aiplatform.googleapis.com\/v1\/projects\/fixture-project\/locations\/us-central1\/publishers\/google\/models\/fixture-regional-model/);
 console.log('PASS explicit regional endpoint and model override preserved');
 env.APOLLO_COMPLIANCE_PROVIDER='gemini_api';env.GEMINI_API_KEY='fixture-key';
 await context.provider({files:[pdf],destination:'Kuwait'});assert.match(endpoint,/^https:\/\/generativelanguage.googleapis.com/);assert.equal(headers['x-goog-api-key'],'fixture-key');
 console.log('PASS explicitly selected Gemini API path preserved; no automatic provider fallback');
 for(const [upstream,expected] of [[400,422],[401,503],[403,503],[404,503],[429,429],[500,502]]){
  status=upstream;await assert.rejects(()=>context.provider({files:[pdf],destination:'Kuwait'}),e=>e.status===expected&&e.message.includes('DOC-AI-')&&!e.message.includes('Private provider diagnostic'));
 }
 console.log('PASS provider errors distinguish invalid request, authentication, access, endpoint/model, quota and outage without leaking provider details');
 // Execute the real router through HTTP with the Vertex branch enabled.
 delete env.APOLLO_COMPLIANCE_PROVIDER;delete env.APOLLO_COMPLIANCE_LOCATION;delete env.APOLLO_COMPLIANCE_MODEL;status=200;
 const express=req('express'),app=express();let saves=0;
 app.use(express.json());app.use('/api/customer/compliance',context.module.exports.createCustomerComplianceRouter({query:async()=>{saves++;return {rows:[]}},requireCustomerPortalAuth:(r,s,n)=>{if(r.headers.authorization!=='Bearer customer-fixture')return s.status(401).json({error:'Login required'});r.customerSession={customerCode:'TEST',userName:'test'};n();}}));
 app.use((e,r,s,n)=>s.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const send=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/customer/compliance/analyze',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer customer-fixture'},body:JSON.stringify({destination:'Kuwait',files:[pdf]})});
 try{
  let r=await send();assert.equal(r.status,200);assert.equal(saves,1);assert.match(endpoint,/^https:\/\/aiplatform.googleapis.com/);
  status=403;r=await send();assert.equal(r.status,503);assert.match((await r.json()).error,/DOC-AI-403/);assert.equal(saves,1);
  console.log('PASS HTTP customer PDF -> Vertex request -> analysis save; service failure never saves a false successful result');
 }finally{server.close();}
 console.log('LIMIT: Google authentication, AI responses and database are fixtures; no live Google request or customer document extraction was performed.');
})().catch(e=>{console.error(e);process.exitCode=1});

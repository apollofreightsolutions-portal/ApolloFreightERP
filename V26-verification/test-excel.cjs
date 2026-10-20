const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(process.env.APOLLO_TEST_ROOT || 'v26_1_work/ApolloFreightERP-main');
const req = require('node:module').createRequire(root + '/server/package.json');
const {extractSpreadsheetInvoice} = req('./src/compliance-spreadsheet');
const {createCustomerComplianceRouter, spreadsheetText} = req('./src/customer-compliance');
const XLSX = req('xlsx'), express = req('express');
const sample = process.env.APOLLO_TEST_INVOICE || 'upload/BFLKWT-2026-00261.xlsm';
const file = {fileName: 'BFLKWT-2026-00261.XLSM', mimeType: 'application/octet-stream', contentBase64: fs.readFileSync(sample).toString('base64')};
const rows = extractSpreadsheetInvoice(file);
assert.equal(rows.lineItems.length,164);assert.equal(rows.lineItems[163].sourceRow,173);
assert.equal(new Set(rows.lineItems.map(x=>x.hsCode)).size,86);
assert.equal(rows.lineItems.reduce((n,x)=>n+x.quantity,0),552);
assert.equal(rows.shipment.grossWeightKg,304.21);
assert.equal(rows.shipment.invoiceNo,'BFLKWT-2026-00261');
console.log('PASS actual invoice: 164 rows, 86 HS codes, 552 units, invoice number and 304.21 kg gross weight; 12-digit column preferred');
function fixture(type, data) {
  const b = XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(data),'Invoice');
  return {fileName:'fixture.'+(type==='biff8'?'xls':type),contentBase64:XLSX.write(b,{bookType:type,type:'buffer'}).toString('base64')};
}
for (const type of ['xlsm','xlsx','biff8']) {
  const f = fixture(type,[['Description','HS Code','Qty'],['Cotton shirts','010121000000',2],['Missing code','',1],['Total','',3]]);
  spreadsheetText(f);const r=extractSpreadsheetInvoice(f);assert.equal(r.lineItems.length,2);assert.equal(r.lineItems[0].hsCode,'010121000000');assert.equal(r.lineItems[1].hsCode,'');
}
console.log('PASS XLS/XLSX/XLSM, leading-zero codes, missing-code rows retained and totals excluded');
const realFetch = global.fetch;let providerCalls=0, saves=[], mode='complete';
process.env.APOLLO_COMPLIANCE_PROVIDER='gemini_api';process.env.GEMINI_API_KEY='test-only';
global.fetch = async (url, options) => {
  if(String(url).startsWith('http://127.0.0.1:')) return realFetch(url,options);
  providerCalls++;
  const lineItems=Array.from({length:mode==='overlimit'?1501:61},()=>({description:'Accessories',hsCode:'420219900000',quantity:1}));
  return {ok:true,json:async()=>({candidates:[{finishReason:mode==='truncated'?'MAX_TOKENS':'STOP',content:{parts:[{text:JSON.stringify({lineItems})}]}}]})};
};
const app=express();app.use(express.json({limit:'16mb'}));
app.use('/api/customer/compliance',createCustomerComplianceRouter({query:async(sql,params)=>{saves.push({sql,params});return {rows:[]}},requireCustomerPortalAuth:(r,s,n)=>{if(r.headers.authorization!=='Bearer test')return s.sendStatus(401);r.customerSession={customerCode:'TEST',userName:'test'};n();}}));
app.use((e,r,s,n)=>s.status(e.status||500).json({error:e.message}));
(async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
  const send=(files,token='test')=>fetch(origin+'/api/customer/compliance/analyze',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({destination:'Kuwait',files})});
  try {
    let r=await fetch(origin+'/api/customer/compliance/meta',{headers:{Authorization:'Bearer test'}});assert.equal(r.status,200);
    console.log('PASS cold-start metadata endpoint');
    const started=Date.now();r=await send([file]);assert.equal(r.status,200);const data=await r.json();
    assert.equal(providerCalls,0);assert.equal(data.result.totalLineItems,164);assert.equal(data.result.lines[163].sourceRow,173);assert.equal(data.result.status,'ATTENTION_REQUIRED');
    assert.equal(data.result.passedLineItems,24);assert.equal(data.result.attentionItems.length,140);
    for(let i=0;i<164;i++) {assert.equal(data.result.lines[i].submittedHsCode,rows.lineItems[i].hsCode);assert.equal(data.result.lines[i].description,rows.lineItems[i].description);assert.equal(data.result.lines[i].quantity,rows.lineItems[i].quantity);}
    assert.equal(data.result.lines[134].status,'ATTENTION');assert.equal(data.result.lines[136].status,'ATTENTION');
    assert.equal(JSON.parse(saves[0].params[6]).lines.length,164);
    assert.equal(data.result.lines[0].suggestion,null);
    console.log(`PASS actual invoice through HTTP: all 164 rows preserved and saved, 140 attention / 24 pass, generic Accessories replacement suppressed; ${Date.now()-started}ms, ZERO Google calls`);
    r=await send([file],'wrong');assert.equal(r.status,401);
    r=await send([{...file,contentBase64:'bm90IGV4Y2Vs'}]);assert.equal(r.status,422);
    r=await send([file,file,file,file]);assert.equal(r.status,422);
    console.log('PASS authentication, corrupt workbook and excess-file rejection');
    const pdf={fileName:'test.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('%PDF-test').toString('base64')};
    r=await send([pdf]);assert.equal(r.status,200);assert.equal((await r.json()).result.totalLineItems,61);
    const saved=saves.length;mode='truncated';r=await send([pdf]);assert.equal(r.status,422);assert.equal(saves.length,saved);
    mode='overlimit';r=await send([pdf]);assert.equal(r.status,422);assert.equal(saves.length,saved);
    mode='complete';r=await send([file,pdf]);assert.equal(r.status,422);assert.equal(saves.length,saved);
    console.log('PASS AI fallback preserves 61 rows; truncated / over-limit / incomplete mixed Excel results never saved');
    const input={files:[{name:file.fileName,type:'',size:Buffer.from(file.contentBase64,'base64').length,base64:file.contentBase64}]}, hidden={value:''};
    const form={querySelector:s=>s.includes('attachments')?input:s.includes('destination')?{value:'Kuwait'}:s.includes('complianceAnalysisId')?hidden:null};
    const panel={dataset:{},closest:()=>null},button={};
    const ctx={window:{location:{origin}},sessionStorage:{getItem:()=>JSON.stringify({portal:'customer',token:'test'})},document:{readyState:'loading',documentElement:{},addEventListener:()=>{}},MutationObserver:class{observe(){}},FileReader:class{readAsDataURL(f){this.result='data:application/octet-stream;base64,'+f.base64;this.onload()}},fetch:global.fetch,AbortController,setTimeout,clearTimeout,console};
    vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/web/customer-compliance.js','utf8'),ctx);Object.assign(ctx,{form,panel,button});
    await vm.runInContext('analyze(form,panel,button)',ctx);assert.ok(hidden.value);assert.match(panel.innerHTML,/164 invoice lines checked/);assert.match(panel.innerHTML,/Trolley Bag/);assert.match(panel.innerHTML,/Office or school supplies/);assert.equal(button.disabled,false);
    console.log('PASS actual browser analyze function, uppercase XLSM / blank MIME, FileReader, HTTP request, 164-count and meaningful review cards');
    // Execute the actual customer attachment handler with storage/database adapters.
    const indexSource=fs.readFileSync(root+'/server/src/index.js','utf8');
    const start=indexSource.indexOf('app.post("/api/customer/shipment-requests/:requestNo/documents"');
    const end=indexSource.indexOf('\napp.put(',start);let uploadHandler, stored=false, belongs=true;
    const uploadContext={app:{post:(route,auth,handler)=>{uploadHandler=handler;}},requireCustomerPortalAuth:()=>{},Buffer,
      query:async(sql,params)=>{if(sql.startsWith('select request_no')){assert.equal(params[1],'TEST');return {rows:belongs?[{request_no:'REQ',attachments_json:'[]'}]:[]};}return {rows:[{document_no:'DOC'}]};},
      googleCloudStorageConfig:()=>({prefix:'test',bucket:{name:'test'}}),safeEmployeeDocumentPart:v=>v,
      saveToGoogleCloudStorage:async(config,name,bytes,mime)=>{stored=true;assert.equal(mime,'application/vnd.ms-excel.sheet.macroenabled.12');assert.equal(bytes.length,Buffer.from(file.contentBase64,'base64').length);return 'fixture://document';}};
    vm.createContext(uploadContext);vm.runInContext(indexSource.slice(start,end),uploadContext);
    let code=200;const response={status(n){code=n;return this},json(v){return v}};
    const request={params:{requestNo:'REQ'},customerSession:{customerCode:'TEST',userName:'test'},body:{fileName:file.fileName,mimeType:'application/vnd.ms-excel.sheet.macroenabled.12',contentBase64:file.contentBase64}};
    await uploadHandler(request,response,e=>{throw e});assert.equal(code,201);assert.ok(stored);
    belongs=false;stored=false;await uploadHandler(request,response,e=>{throw e});assert.equal(code,404);assert.equal(stored,false);
    console.log('PASS actual shipment attachment handler accepts XLSM and preserves customer ownership check (storage/database mocked)');
    console.log('LIMIT: local HTTP and persistence adapter; no live customer login, Google service or production database used. No macros executed.');
  } finally {server.close();global.fetch=realFetch;}
})().catch(e=>{console.error(e);process.exitCode=1});

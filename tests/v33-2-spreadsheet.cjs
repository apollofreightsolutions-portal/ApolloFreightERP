const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),X=require('xlsx');
const {extractSpreadsheetInvoice:extract}=require('../server/src/compliance-spreadsheet');
const {spreadsheetText}=require('../server/src/customer-compliance');
function file(tabs){const w=X.utils.book_new();for(const [n,rows]of tabs)X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(rows),n);return {fileName:'fixture.xlsx',contentBase64:X.write(w,{type:'buffer',bookType:'xlsx'}).toString('base64')};}
test('full-code aliases, priority, genuine missing codes and original row offsets',()=>{
 const f=file([['Invoice',[[],['Parent_Code','Description','HS_CODE','HSCODE-12','Qty'],['1','Perfume','33030010','330300100001',2],['2','No code','','',3],['Total','','','',5],['','Footer text','','',0]]]]);
 const r=extract(f);assert.equal(r.lineItems.length,2);assert.equal(r.lineItems[0].hsCode,'330300100001');assert.equal(r.lineItems[0].sourceRow,3);assert.equal(r.lineItems[1].hsCode,'');
});
test('loading summary bypasses AI; supporting duplicates excluded but unlinked items retained',()=>{
 const invoice=['Invoice',[['Parent_Code','Description','HS Code'],['A','Perfume','330300100001']]];
 const packing=['paking list',[['Parent_Code','Description','Qty'],['A','Perfume carton',10]]];
 const loading=['loading sheet',[['PALLET','CTN','QTY'],['P1',1,10]]];
 let r=extract(file([invoice,packing,loading]));assert.equal(r.lineItems.length,1);assert(r.warnings.some(x=>x.includes('loading')));
 packing[1].push(['B','Extra product',1]);r=extract(file([invoice,packing,loading]));assert(r.lineItems.some(x=>x.description==='Extra product'));
 assert.equal(extract(file([invoice,['Unidentified',[['Unstructured extra goods']]]])),null);
});
test('numeric scientific display expands safely, formatted leading zero survives, KSA not used as Kuwait code',()=>{
 const f=file([['Items',[['Description','HSCODE-12','Qty'],['Perfume',330300100001,1],['Leading',1234567890,1]]]]);
 const w=X.read(Buffer.from(f.contentBase64,'base64'));w.Sheets.Items.B2.z='0.000E+00';w.Sheets.Items.B3.z='000000000000';
 f.contentBase64=X.write(w,{type:'buffer',bookType:'xlsx'}).toString('base64');const r=extract(f);
 assert.equal(r.lineItems[0].hsCode,'330300100001');assert.equal(r.lineItems[1].hsCode,'001234567890');
 const k=extract(file([['Items',[['Description','HS_CODE','KSA_HSCODE','Qty'],['Perfume','33030010','999999999999',1]]]]));assert.equal(k.lineItems[0].hsCode,'33030010');
});
test('merged footer stale cells do not become invoice products',()=>{
 const f=file([['Invoice',[['Description','HS Code'],['Perfume','330300100001'],['Total',''],['Footer','stale text']]]]);
 const w=X.read(Buffer.from(f.contentBase64,'base64'));w.Sheets.Invoice['!merges']=[{s:{r:3,c:0},e:{r:3,c:1}}];f.contentBase64=X.write(w,{type:'buffer',bookType:'xlsx'}).toString('base64');assert.equal(extract(f).lineItems.length,1);
});
test('actual customer invoice regression when explicitly supplied',{skip:!process.env.HS_REGRESSION_FILE},()=>{
 const f={fileName:'KRO-106389.xlsx',contentBase64:fs.readFileSync(process.env.HS_REGRESSION_FILE).toString('base64')};assert(spreadsheetText(f));const r=extract(f);assert.equal(r.lineItems.length,5);assert(r.lineItems.every(x=>x.hsCode==='330300100001'));assert.deepEqual(r.lineItems.map(x=>x.sourceRow),[5,6,7,8,9]);assert(r.warnings.some(x=>x.includes('33073000')));
});

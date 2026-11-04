const {test}=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {allowed,summaryWorkbook}=require('../src/customer-hs-help');
test('HS help permits active DXB customer-review staff and denies KWI-only/CRM-only/inactive staff',()=>{
 const user={role:'User',account_status:'Active',branch_access:'DXB',section_access:'Customer Portal'};
 assert(allowed(user));assert(allowed({...user,branch_access:'Both'}));
 assert(!allowed({...user,branch_access:'KWI'}));assert(!allowed({...user,section_access:'CRM'}));assert(!allowed({...user,account_status:'Inactive'}));assert(!allowed(null));
});
test('HS summary preserves all rows, original codes/descriptions and leading zeroes without formulas',()=>{
 const b=summaryWorkbook({extractionComplete:false,lines:[{lineIndex:0,description:'=SUM(A1:A2)',submittedHsCode:'00112233',effectiveHsCode:'00112244',status:'ATTENTION',confidence:84},{lineIndex:1,description:'Unchanged',submittedHsCode:'12345678',status:'PASS',confidence:98}]});
 const ws=XLSX.read(b,{type:'buffer'}).Sheets['HS Summary'],rows=XLSX.utils.sheet_to_json(ws,{header:1});
 assert.equal(rows.length,6);assert.equal(rows[4][5],'=SUM(A1:A2)');assert.equal(rows[4][6],'00112233');assert.equal(rows[4][7],'00112244');assert(!ws.F5.f);assert.match(rows[2][1],/omit/);
});

const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const old=require('./fixtures/v31-awb-functions.json').functions;
const src=fs.readFileSync(path.join(__dirname,'../web/app-runtime.js'),'utf8');
function extract(name){const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(src);assert(match,name);const tail=src.slice(match.index),end=/\n(?:async )?function /.exec(tail);return tail.slice(0,end?end.index:tail.length).trim();}
const revised=new Set(['apiShipment','openShipmentFromAirwayBill']);
for(const [name,body] of Object.entries(old))if(!revised.has(name))assert.equal(extract(name),body,`${name}: V31 established fetch/render/save behaviour changed`);
const clean=x=>JSON.parse(JSON.stringify(x));
const binderNames=['bindShipmentDirectionDialog','bindShipmentCustomerTariffs','bindShipmentCustomerAutofill','bindShipmentCopySections','bindTransporterAutofill','bindTariffFinancialAutofill','bindVolumeCalculator','bindPalletDimensionBuilder','bindAwbFetchButton'];
function harness(version,customers,alreadyOpen){
 let captured;const calls=[];
 const ctx={state:{customers},normalizeBranchName:x=>({KWI:'Kuwait HO',DXB:'Dubai'})[x]||x,defaultUserBranch:()=> 'Kuwait HO',stationCustomerName:x=>String(x||'').toLowerCase().replace(/[\s\p{P}]+/gu,''),notifyDenied:(...x)=>calls.push(['notice',...x]),today:()=> '2026-11-06',currentUserName:()=> 'admin',effectiveChargeableWeightForShipment:x=>x.chargeableKg,shipmentDirectionOptions:()=>['Import','Export'],shipmentServiceOptions:()=>['LE','AE','SI'],nextShipmentNumber:(b,s)=>b+'-NEXT-'+s,recordDialog:{open:alreadyOpen},shipmentDialogBody:(m,r)=>{captured=clean(r);return 'existing-form';},openDialog:o=>o.afterOpen(),window:{requestAnimationFrame:()=>{}},dialogBody:{},dialogType:{},dialogTitle:{},dialogSave:{},resetDialogShell:()=>{}};
 for(const name of binderNames)ctx[name]=()=>calls.push([name]);
 vm.createContext(ctx);
 vm.runInContext(extract('isChecked'),ctx);
 for(const name of ['parseJsonMeta','shipment','apiShipment','openShipmentFromAirwayBill'])vm.runInContext(version==='old'?old[name]:extract(name),ctx);
 return {ctx,get:()=>captured,calls};
}
// Populate EVERY metadata property in V31's shipment constructor plus every actual DB field
// used by apiShipment, rather than checking a handpicked handful of cargo fields.
const metadata={};for(const m of old.shipment.matchAll(/meta\.([A-Za-z0-9_]+)/g))metadata[m[1]]='stored-'+m[1];
Object.assign(metadata,{customerCode:'0021',customerEmail:'shipment-contact@example.test',customerMobile:'shipment-phone',customerAddress:'Shipment-specific delivery address',shipmentDirection:'Export',shipmentService:'LE',cargoItemsJson:JSON.stringify([{description:'Cargo A',quantity:3,length:120,width:80,height:100,unit:'CM',weight:125,hsCode:'001234567890'}]),palletDimensionsJson:JSON.stringify([{length:120,width:80,height:100}]),manualChargeableKg:750,freightAmount:55,otherChargesAmount:12,taxAmount:3,totalAmount:70});
const row={};for(const m of old.apiShipment.matchAll(/row\.([A-Za-z0-9_]+)/g))row[m[1]]='db-'+m[1];
Object.assign(row,{job_no:'DXB-ORIGINAL',branch:'Dubai',customer_name:'Sun and Sand',airway_bill_no:'AWB-EXISTING-123',booking_date:'2026-10-01',shipment_direction:'Export',shipment_service:'LE',actual_kg:375,cbm:2.88,chargeable_kg:750,pieces:3,sell:70,buy_cost:40,transit_days:3,chargeable_divisor:250,notes:JSON.stringify(metadata),pod_splits_json:'[{"reference":"existing-split"}]'});
let cases=0,fieldCount=0;
for(const direction of ['Import','Export'])for(const service of ['LE','AE','SI'])for(const alreadyOpen of [false,true])for(const target of ['Dubai','Kuwait HO'])for(const localMode of ['active','blocked','missing','ambiguous']){
 const customers=[{code:'0021',name:'Sun and Sand',branch:'Dubai',status:'Active',email:'different-dxb@example.test',mobile:'different-dxb',fullAddress:'Different DXB address'}];
 if(localMode!=='missing')customers.push({code:'1212',name:'Sun and Sand',branch:'Kuwait HO',status:localMode==='blocked'?'Blocked':'Active',email:'different-kwi@example.test',mobile:'different-kwi',fullAddress:'Different KWI address'});
 if(localMode==='ambiguous')customers.push({code:'1313',name:'Sun and Sand.',branch:'Kuwait HO',status:'Active'});
 const a=harness('old',customers,alreadyOpen),b=harness('new',customers,alreadyOpen);
 const original=a.ctx.apiShipment(row),current=b.ctx.apiShipment(row);
 assert.deepEqual(clean(current),clean(original),'Existing DB record parsing changed');
 // Also prove unrecognized future metadata on a loaded record is not dropped by fetching.
 original.extraEstablishedField={nested:['preserve',123]};current.extraEstablishedField={nested:['preserve',123]};
 const before=clean(current);
 a.ctx.openShipmentFromAirwayBill(original,row.airway_bill_no,target,service,direction);
 b.ctx.openShipmentFromAirwayBill(current,row.airway_bill_no,target,service,direction);
 const expected=a.get(),actual=b.get();
 const local=target==='Dubai'?'0021':['missing','ambiguous'].includes(localMode)?'':'1212';
 assert.equal(actual.customerCode,local,'Only account identity must map to local station');
 expected.customerCode=local;
 assert.deepEqual(actual,expected,'A fetched parameter differs from V31 beyond local customer ID');
 assert.deepEqual(clean(current),before,'Original job was modified by fetch');
 assert.deepEqual(b.calls.filter(x=>x[0]!=='notice'),a.calls,'Existing fetch form binders/order changed');
 for(const key of ['customerEmail','customerMobile','customerAddress','customerContactPerson','shipperName','consigneeName','billTo1','billingParty1Address','pickupAddress','deliveryAddress','driverName','vehicleNo','cargoItemsJson','podSplitsJson'])assert.equal(actual[key],expected[key],key);
 fieldCount=Object.keys(actual).length;cases++;
}
// Stored local identity takes precedence over legacy notes only; no other database mapping changes.
const a=harness('old',[],false),b=harness('new',[],false),legacy=clean(a.ctx.apiShipment(row)),local=clean(b.ctx.apiShipment({...row,customer_code:'1212'}));legacy.customerCode='1212';assert.deepEqual(local,legacy);
console.log(`PASS V31/V32 AWB parity: ${cases} scenarios, ${fieldCount} fields each; only local account ID differs; original records untouched; lookup, form, cargo, save and binder source unchanged.`);

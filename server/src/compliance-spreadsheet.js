const XLSX = require('xlsx');
const label=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digits=v=>String(v||'').replace(/\D/g,'');
function codeRank(h){
 const s=label(h);
 if(/^(?:kuwait|kwt)(?:hs|hscode)$|^(?:hs|hscode)(?:kuwait|kwt)$/.test(s))return 40;
 if(/^(?:12digit)?(?:hs|hscode|hscodes|hscodeno|hstariffcode|tariffcode|tariffno|customstariff|commoditycode|harmonizedcode|harmonisedcode)(?:12|12digit)?$/.test(s))return /12/.test(s)?30:20;
 return 0;
}
function codeValue(cell){
 if(!cell||cell.t==='e')return '';
 const text=String(cell.w??cell.v??'').trim();
 if(typeof cell.v==='number'&&/e[+-]?\d+/i.test(text))return Number.isSafeInteger(cell.v)&&cell.v>=0?String(cell.v):'';
 return text;
}
// Reads values/cached results only; never runs formulas or VBA.
function extractSpreadsheetInvoice(file){
 const book=XLSX.read(Buffer.from(file.contentBase64,'base64'),{type:'buffer',cellFormula:false,cellHTML:false,bookVBA:false});
 const sheets=[],warnings=[],shipment={};
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name];if(!sheet?.['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:true});
  const cellAt=(r,c)=>{
   const rr=r+range.s.r,cc=c+range.s.c;
   // Stale cells under merges are not visible invoice content.
   if((sheet['!merges']||[]).some(m=>rr>=m.s.r&&rr<=m.e.r&&cc>=m.s.c&&cc<=m.e.c&&(rr!==m.s.r||cc!==m.s.c)))return null;
   return sheet[XLSX.utils.encode_cell({r:rr,c:cc})];
  };
  const lines=[];let columns=null,found=false,ended=false;
  rows.forEach((row,r)=>{
   const visible=row.map((v,c)=>cellAt(r,c)?String(v).trim():'');
   for(const text of visible){
    const inv=text.match(/^invoice\s*(?:no\.?|number|#)\s*:?\s*(\S+)/i);if(inv)shipment.invoiceNo=inv[1];
    const wt=text.match(/^total\s+gross\s+weight\s*:?\s*([\d,.]+)\s*kgs?\b/i);if(wt)shipment.grossWeightKg=Number(wt[1].replace(/,/g,''));
   }
   const labels=visible.map(label);
   const desc=labels.findIndex(s=>/^(description|itemdescription|descriptionofgoods|goodsdescription|productdescription|itemname|productname|commoditydescription|materialdescription|articledescription|descriptionofitem)$/.test(s));
   const codes=visible.map((s,i)=>({i,rank:codeRank(s)})).filter(c=>c.rank).sort((a,b)=>b.rank-a.rank);
   const qty=labels.findIndex(s=>/^(qty|quantity|pieces|pcs|totalqty|qtypcs|quantitypcs)$/.test(s));
   if(desc>=0&&(codes.length||qty>=0)){
    columns={desc,codes,qty,unit:labels.findIndex(s=>/^(unit|uom)$/.test(s)),key:labels.findIndex(s=>/^(parentcode|itemcode|productcode|sku|styleno)$/.test(s))};
    const parent=labels.indexOf('parentcode');if(parent>=0)columns.key=parent;
    found=true;ended=false;return;
   }
   if(!columns||ended)return;
   const first=visible.find(Boolean)||'';
   if(/^(?:sub[ -]?total|grand\s+total|total)(?:\s|:|$)/i.test(first)){ended=true;return;}
   const description=visible[columns.desc]||'';
   const choices=columns.codes.map(c=>codeValue(cellAt(r,c.i))).filter(Boolean);
   const hsCode=choices[0]||'';
   if(!description&&!hsCode)return;
   if(choices.some(c=>{const a=digits(hsCode),b=digits(c);return a&&b&&!a.startsWith(b)&&!b.startsWith(a);}))warnings.push(name+' row '+(r+range.s.r+1)+': conflicting HS columns; Kuwait/full-length column used. Verify source codes.');
   lines.push({description,hsCode,quantity:Number(String(visible[columns.qty]||'').replace(/,/g,''))||0,unit:visible[columns.unit]||'',sourceFile:file.fileName,sourceSheet:name,sourceRow:r+range.s.r+1,_key:visible[columns.key]||''});
  });
  const logistics=/^(?:loading\s*sheet|load\s*summary|pallet\s*summary)$/i.test(name.trim())&&rows.some(r=>r.map(label).includes('pallet')&&r.map(label).some(x=>x==='ctn'||x==='cartons'));
  sheets.push({name,lines,found,logistics,nonempty:rows.some(r=>r.some(v=>String(v).trim()))});
 }
 const primary=sheets.filter(s=>/^(?:customs?|commercial|tax)?\s*invoice(?:\s*\d+)?$/i.test(s.name.trim())&&s.lines.length);
 const supporting=s=>/^(?:pa[ck]+ing\s*list|table(?:\d+|_inv_summary))$/i.test(s.name.trim());
 const primaryKeys=new Set(primary.flatMap(s=>s.lines.map(l=>l._key).filter(Boolean)));
 // Only suppress supporting views when every item is linked to the named invoice.
 // Unlinked supporting items remain visible rather than being silently discarded.
 const duplicateSupport=s=>supporting(s)&&s.lines.length&&s.lines.every(l=>l._key&&primaryKeys.has(l._key));
 const selected=primary.length?sheets.filter(s=>primary.includes(s)||(!duplicateSupport(s)&&s.lines.length)):sheets.filter(s=>s.lines.length);
 if(sheets.some(s=>s.nonempty&&!s.found&&!s.logistics)||!selected.length)return null;
 for(const s of sheets.filter(s=>!selected.includes(s)&&s.nonempty)){
  warnings.push('Supporting sheet "'+s.name+'" was not added as invoice items'+(s.logistics?': loading/pallet summary.':'; the named invoice is the source.'));
  for(const l of s.lines){
   const related=selected.flatMap(x=>x.lines).filter(x=>l._key&&x._key===l._key);
   if(l.hsCode&&related.some(x=>{const a=digits(x.hsCode),b=digits(l.hsCode);return a&&b&&!a.startsWith(b)&&!b.startsWith(a);}))warnings.push('Conflicting HS code '+l.hsCode+' in supporting sheet "'+s.name+'" for item '+l._key+'; invoice code retained.');
  }
 }
 return {lineItems:selected.flatMap(s=>s.lines).map(({_key,...line})=>line),shipment,cargoLines:[],warnings:[...new Set(['Excel invoice rows were read directly. Verify shipment, packing and dimension fields before booking; missing fields were not inferred.',...warnings])]};
}
module.exports={extractSpreadsheetInvoice};

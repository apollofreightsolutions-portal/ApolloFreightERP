const express = require('express');
const crypto = require('crypto');
const XLSX = require('xlsx');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const clean = (v,n=1000) => String(v ?? '').trim().slice(0,n);
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
function allowed(user) {
  if (!user || String(user.account_status).toLowerCase() !== 'active') return false;
  if (String(user.role).toLowerCase() === 'admin') return true;
  return /^(both|all|dxb|dubai)$/i.test(clean(user.branch_access)) &&
    /all|customer|shipment requests/i.test(clean(user.section_access));
}
function summaryWorkbook(result) {
  const rows = [['HS check summary — not a replacement invoice or customs clearance'],
    ['Original documents are unchanged. Update your invoice where required before shipment.'],
    ['Extraction complete',result.extractionComplete === false ? 'No — results may omit items' : 'Yes'],
    ['Line','File','Sheet','Row','Page','Original description','Original HS','Selected HS','Check status','Match score','Clarification','Issue','Customer choice']];
  for (const l of result.lines || []) rows.push([l.lineIndex+1,l.sourceFile||'',l.sourceSheet||'',l.sourceRow||'',l.sourcePage||'',l.description,l.submittedHsCode,l.effectiveHsCode||l.submittedHsCode,l.status,l.confidence,l.clarification||'',l.issue||'',l.customerChoice==='suggestion'?'Alternative HS code selected':l.customerChoice==='original'?'Original code retained':'']);
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[3].map((_,i)=>({wch:i===5||i===11?55:20}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'HS Summary');
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
function registerHsHelp({app,query,requireCustomerPortalAuth,requireErpPortalAuth,loadAnalysis,masterIndex,normalizeCode,customerPrefix='/api/customer/hs-help',reviewPrefix='/api/hs-help'}) {
  const customer = express.Router(); customer.use(requireCustomerPortalAuth);
  customer.get('/requests/:id/download',wrap(async(req,res)=>{
    const r=(await query('select snapshot_json,response_json,status from customer_hs_help where id=$1 and lower(customer_code)=lower($2)',[req.params.id,req.customerSession.customerCode])).rows[0];
    if(!r)return res.status(404).json({ok:false,error:'Request not found.'});
    const snapshot=parse(r.snapshot_json),replies=parse(r.response_json);
    const data=[['Apollo recommendations — selected items only; original invoice unchanged'],['Line','File','Row / Page','Original description','Invoice HS','Apollo recommended HS','Apollo comment','Restriction','Prohibition']];
    for(const l of snapshot.lines){const a=replies.find(x=>x.lineIndex===l.lineIndex)||{};data.push([l.lineIndex+1,l.sourceFile,l.sourceRow||l.sourcePage||'',l.description,l.submittedHsCode,a.hsCode||'',a.comment||'Awaiting reply',a.restriction||'',a.prohibition||'']);}
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Apollo Recommendations');
    res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="Apollo_HS_Recommendations.xlsx"');res.send(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
  }));
  customer.get('/requests',wrap(async(req,res)=>{
    const rows=(await query("select id,question,response_json,status,answered_by,created_at,answered_at,selected_json,(snapshot_json::jsonb->'lines') as lines from customer_hs_help where lower(customer_code)=lower($1) order by created_at desc limit 100",[req.customerSession.customerCode])).rows;
    res.json({ok:true,rows});
  }));
  customer.get('/:analysisId/download',wrap(async(req,res)=>{
    const a=await loadAnalysis(query,req.customerSession,req.params.analysisId);
    if(!a)return res.status(404).json({ok:false,error:'Check expired. Analyze your documents again.'});
    res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition','attachment; filename="Apollo_HS_Summary.xlsx"');res.send(summaryWorkbook(a.result));
  }));
  customer.post('/:analysisId/help',wrap(async(req,res)=>{
    const a=await loadAnalysis(query,req.customerSession,req.params.analysisId);
    if(!a)return res.status(404).json({ok:false,error:'Check expired. Analyze your documents again.'});
    const ids=[...new Set(Array.isArray(req.body.lineIndexes)?req.body.lineIndexes:[])];
    if(!ids.length||ids.some(i=>!Number.isInteger(i)||!a.result.lines[i]))return res.status(400).json({ok:false,error:'Select at least one valid item.'});
    // Analysis snapshots retain the source documents; never accept a customer-supplied result.
    if(!a.result.sourceDocuments?.length)return res.status(409).json({ok:false,error:'Please analyze the documents again to attach originals for DXB.'});
    const id=crypto.randomUUID();
    const snapshot={lines:a.result.lines.filter(l=>ids.includes(l.lineIndex)),documents:a.result.sourceDocuments};
    const inserted=await query(`insert into customer_hs_help(id,analysis_id,customer_code,customer_user,selected_json,snapshot_json,question) values($1,$2,$3,$4,$5,$6,$7) on conflict(analysis_id) do nothing returning id`,[id,a.row.analysis_id,req.customerSession.customerCode,req.customerSession.userName,JSON.stringify(ids),JSON.stringify(snapshot),clean(req.body.question)]);
    if(!inserted.rows.length)return res.status(409).json({ok:false,error:'This check was already sent to DXB. Open HS help to see its status or reply.'});
    res.json({ok:true,id});
  }));
  app.use(customerPrefix,customer);
  const gate=(req,res,next)=>query('select role,account_status,branch_access,section_access from app_users where lower(user_name)=lower($1)',[req.appSession.userName]).then(r=>allowed(r.rows[0])?next():res.status(403).json({ok:false,error:'DXB customer-review access required.'})).catch(next);
  app.get(reviewPrefix+'/requests',requireErpPortalAuth,gate,wrap(async(req,res)=>{
    const rows=(await query('select id,customer_code,customer_user,question,status,answered_by,created_at,answered_at from customer_hs_help order by created_at desc limit 200')).rows;res.json({ok:true,rows});
  }));
  app.get(reviewPrefix+'/requests/:id',requireErpPortalAuth,gate,wrap(async(req,res)=>{
    const r=(await query('select * from customer_hs_help where id=$1',[req.params.id])).rows[0];
    if(!r)return res.status(404).json({ok:false,error:'Request not found.'});res.json({ok:true,row:{...r,snapshot_json:undefined},snapshot:parse(r.snapshot_json)});
  }));
  app.post(reviewPrefix+'/requests/:id/reply',requireErpPortalAuth,gate,wrap(async(req,res)=>{
    const r=(await query('select * from customer_hs_help where id=$1',[req.params.id])).rows[0];
    if(!r)return res.status(404).json({ok:false,error:'Request not found.'});
    const lines=parse(r.snapshot_json).lines, replies=Array.isArray(req.body.replies)?req.body.replies:[];
    if(replies.length!==lines.length||new Set(replies.map(x=>x.lineIndex)).size!==lines.length)return res.status(400).json({ok:false,error:'Respond to each selected item once.'});
    const checked=[];
    for(const reply of replies){
      if(!lines.some(l=>l.lineIndex===reply.lineIndex))return res.status(400).json({ok:false,error:'Invalid item.'});
      const code=normalizeCode(reply.hsCode),row=code?masterIndex().get(code):null,comment=clean(reply.comment);
      if((reply.hsCode&&!row)||(!code&&!comment))return res.status(400).json({ok:false,error:'Enter a valid master HS code or a comment for each item.'});
      checked.push({lineIndex:reply.lineIndex,hsCode:row?.hsCode||'',comment,restriction:row?.importRestriction||'',prohibition:row?.importProhibition||''});
    }
    const changed=await query(`update customer_hs_help set response_json=$1,status='ANSWERED',answered_by=$2,answered_at=now() where id=$3 and status='OPEN' returning id`,[JSON.stringify(checked),req.appSession.userName,r.id]);
    if(!changed.rows.length)return res.status(409).json({ok:false,error:'A colleague already replied. Refresh to see their response.'});
    res.json({ok:true});
  }));
}
module.exports={registerHsHelp,allowed,summaryWorkbook};

// V30: shared DXB optional-help inbox. Server checks current branch and section access.
const root=String(window.APOLLO_API_URL||location.origin).replace(/\/$/,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function session(){try{return JSON.parse(sessionStorage.getItem('apollofreighterp-session')||'null');}catch{return null;}}
async function api(path,body){const s=session();const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+s?.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Unable to load HS help');return j;}
const parse=v=>typeof v==='string'?JSON.parse(v):v;
let button,dialog,rows=[],lastToken='',busy=false;
function close(){dialog?.remove();dialog=null;}
function shell(title){close();dialog=document.createElement('dialog');dialog.style.cssText='width:min(1100px,94vw);max-height:90vh;overflow:auto;border:1px solid #ddd;border-radius:12px;padding:24px';dialog.innerHTML=`<button type="button" data-close style="float:right">Close</button><h2>${esc(title)}</h2><div data-body></div><p role="status" data-message></p>`;document.body.append(dialog);dialog.querySelector('[data-close]').onclick=close;dialog.showModal();return dialog.querySelector('[data-body]');}
function saveFile(bytes,mime,name){const u=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function customerView(r){
  const body=shell('Apollo HS help — '+r.status),replies=parse(r.response_json||'[]');
  body.innerHTML=`<p>Your question: ${esc(r.question)}</p><p>${r.status==='OPEN'?'Awaiting a DXB reply. You can continue using the checker.':'Answered by '+esc(r.answered_by)}</p><div style="overflow:auto"><table><tr><th>Original item</th><th>Invoice HS</th><th>Apollo recommended HS</th><th>Apollo comment</th></tr>${(r.lines||[]).map(l=>{const a=replies.find(x=>x.lineIndex===l.lineIndex)||{};return `<tr><td>${l.lineIndex+1}. ${esc(l.description)}<small>${esc(l.sourceFile)} / ${esc(l.sourceRow||l.sourcePage||'')}</small></td><td>${esc(l.submittedHsCode)}</td><td>${esc(a.hsCode||'—')}</td><td>${esc(a.comment||'Awaiting reply')} ${esc(a.restriction)} ${esc(a.prohibition)}</td></tr>`;}).join('')}</table></div><p>Your original invoice is unchanged. These are recommendations, not customs approval. Update your original invoice where appropriate.</p><button type="button" data-copy>Copy recommendations</button><button type="button" data-back>Back to help requests</button>`;
  body.querySelector('[data-back]').onclick=r._operations?openOperationsRequests:openInbox;
  const download=document.createElement('button');download.type='button';download.textContent='Download recommendations (Excel)';body.append(download);
  download.onclick=async()=>{try{const response=await fetch(root+(r._operations?'/api/operations/hs-help':'/api/customer/hs-help')+'/requests/'+encodeURIComponent(r.id)+'/download',{headers:{Authorization:'Bearer '+session()?.token}});if(!response.ok)throw new Error('Download unavailable.');saveFile(await response.arrayBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Apollo_HS_Recommendations.xlsx');}catch(e){dialog.querySelector('[data-message]').textContent=e.message;}};
  body.querySelector('[data-copy]').onclick=async()=>{const t=['Line\tOriginal item\tInvoice HS\tApollo recommended HS\tComment',...(r.lines||[]).map(l=>{const a=replies.find(x=>x.lineIndex===l.lineIndex)||{};return [l.lineIndex+1,l.description,l.submittedHsCode,a.hsCode||'',a.comment||'',a.restriction||'',a.prohibition||''].map(v=>String(v).replace(/[\r\n\t]/g,' ')).join('\t');})].join('\n');try{await navigator.clipboard.writeText(t);dialog.querySelector('[data-message]').textContent='Copied.';}catch{const box=document.createElement('textarea');box.value=t;body.append(box);box.select();}};
}
async function teamView(id,operations=false){
  const review=operations?'/api/operations/hs-review':'/api/hs-help';
  try {const data=await api(review+'/requests/'+encodeURIComponent(id));const r=data.row, snap=data.snapshot,body=shell('Customer HS question — '+r.customer_code),answers=parse(r.response_json||'[]');
  body.innerHTML=`<p>${esc(r.customer_user)} · ${esc(r.question)}</p><div data-documents></div><p>${r.status==='ANSWERED'?'Answered by '+esc(r.answered_by):'Answer the selected items below. No claim or approval cycle required.'}</p><form data-reply>${snap.lines.map(l=>{const a=answers.find(x=>x.lineIndex===l.lineIndex)||{};return `<fieldset data-line="${l.lineIndex}"><legend>Item ${l.lineIndex+1}: ${esc(l.description)}</legend><p>Source: ${esc(l.sourceFile)} / ${esc(l.sourceRow||l.sourcePage||'')} · Invoice HS: ${esc(l.submittedHsCode)} · Customer-selected HS: ${esc(l.effectiveHsCode)}</p><label>Recommended HS code (optional)<input name="hsCode" maxlength="30" value="${esc(a.hsCode)}"></label><label>Apollo recommendation / comment<textarea name="comment" maxlength="1000">${esc(a.comment)}</textarea></label><p>${esc(a.restriction)} ${esc(a.prohibition)}</p></fieldset>`;}).join('')}<button ${r.status==='ANSWERED'?'disabled':''}>Send reply to customer</button></form>`;
  for(const f of snap.documents||[]){const b=document.createElement('button');b.type='button';b.textContent='Download original: '+f.fileName;b.onclick=()=>saveFile(Uint8Array.from(atob(f.contentBase64),c=>c.charCodeAt(0)),f.mimeType,f.fileName);body.querySelector('[data-documents]').append(b);}
  body.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const replies=[...e.target.querySelectorAll('[data-line]')].map(f=>({lineIndex:Number(f.dataset.line),hsCode:f.querySelector('[name=hsCode]').value,comment:f.querySelector('textarea').value}));await api(review+'/requests/'+id+'/reply',{replies});dialog.querySelector('[data-message]').textContent='Reply sent. The customer will see it in HS help.';poll();}catch(error){b.disabled=false;dialog.querySelector('[data-message]').textContent=error.message;}};
  }catch(error){shell('HS help').textContent=error.message;}
}
async function openInbox(){
  await poll();const s=session();if(!s)return;const customer=s.portal==='customer',body=shell(customer?'Your HS help requests':'DXB customer HS help');
  body.innerHTML='<p>Shared help inbox · refreshed every 30 seconds. Support: ops1@apollo-freight.com</p>';
  if(!rows.length)body.append(document.createTextNode('No requests.'));
  for(const r of rows){const b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;text-align:left;margin:8px 0;padding:12px';b.textContent=`${r._operations?'Operations · ':''}${r.status} · ${customer?'':r.customer_code+' · '}${new Date(r.created_at).toLocaleString()} · ${r.question||'HS item check'}${r.answered_by?' · Answered by '+r.answered_by:''}`;b.onclick=()=>customer?customerView(r):teamView(r.id,r._operations);body.append(b);}
}
async function poll(){
  const s=session();if(!s?.token){button?.remove();button=null;rows=[];lastToken='';close();return;}
  if(s.token!==lastToken){rows=[];close();lastToken=s.token;}
  if(busy)return;busy=true;
  try{const customer=s.portal==='customer',data=await api(customer?'/api/customer/hs-help/requests':'/api/hs-help/requests');if(session()?.token!==s.token)return;rows=data.rows||[];
    if(!customer){try{const staff=await api('/api/operations/hs-review/requests');if(session()?.token!==s.token)return;rows.push(...(staff.rows||[]).map(r=>({...r,_operations:true})));}catch{ /* Older deployments may not have the internal queue yet. */ }}
    if(!button){button=document.createElement('button');button.type='button';button.style.cssText='position:fixed;bottom:18px;left:18px;z-index:900;background:#102332;color:white;border:0;border-radius:8px;padding:12px';button.onclick=openInbox;document.body.append(button);}
    const count=rows.filter(r=>r.status===(customer?'ANSWERED':'OPEN')).length;button.textContent=customer?`HS help · ${count} replies`:`DXB HS help · ${count} pending`;
  }catch(error){button?.remove();button=null;}finally{busy=false;}
}
async function openOperationsRequests(){
  const token=session()?.token;
  try{const data=await api('/api/operations/hs-help/requests');if(session()?.token!==token)return;
    const body=shell('My Operations HS help requests');
    if(!data.rows?.length)body.textContent='No requests yet. Select items in HS Code Check and choose Ask Apollo.';
    for(const r of data.rows||[]){const b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;text-align:left;margin:8px 0;padding:12px';b.textContent=r.status+' · '+(r.question||'HS item check');b.onclick=()=>customerView({...r,_operations:true});body.append(b);}
  }catch(error){shell('Operations HS help').textContent=error.message;}
}
window.ApolloHsHelp={openOperationsRequests};
setInterval(poll,30000);setInterval(()=>{if(session()?.token!==lastToken)poll();},2000);poll();

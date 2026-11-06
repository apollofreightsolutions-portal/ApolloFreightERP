const API_URL = String(window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");
const READY_THRESHOLD = 95;

function sessionToken() {
  try {
    const raw = sessionStorage.getItem("apollofreighterp-session");
    const session = raw ? JSON.parse(raw) : null;
    return session?.portal === "customer" ? String(session.token || "") : "";
  } catch { return ""; }
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
async function api(path, options = {}) {
  const token = sessionToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 45000));
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Compliance analysis timed out. Try a smaller PDF or fewer pages.");
    throw error;
  } finally { clearTimeout(timer); }
}
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}
function setField(form, name, value, onlyIfBlank = false) {
  const field = form.querySelector(`[name='${name}']`);
  if (!field || value === undefined || value === null || value === "") return;
  if (onlyIfBlank && String(field.value || "").trim()) return;
  field.value = String(value);
  field.dataset.complianceFill = '1';
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  delete field.dataset.complianceFill;
}
function styleOnce() {
  if (document.getElementById("apolloComplianceStyle")) return;
  const style = document.createElement("style");
  style.id = "apolloComplianceStyle";
  style.textContent = `
    .apollo-compliance-tools{margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .apollo-compliance-panel{margin-top:14px;border:1px solid #dbe3ec;border-radius:14px;background:#fff;padding:16px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .apollo-compliance-panel[hidden]{display:none!important}
    .apollo-shield{display:flex;gap:14px;align-items:center;padding:16px;border-radius:13px;border:1px solid #b8dfc5;background:#f1fbf5}
    .apollo-shield-mark{width:58px;height:66px;display:grid;place-items:center;clip-path:polygon(50% 0,92% 15%,86% 72%,50% 100%,14% 72%,8% 15%);background:#17334f;color:#fff;font-weight:900;font-size:11px;letter-spacing:.7px;position:relative}
    .apollo-shield-mark:after{content:'✓';position:absolute;bottom:10px;font-size:20px;color:#ff8a1d}
    .apollo-shield h3{margin:0 0 4px;color:#163e2b;font-size:18px}.apollo-shield p{margin:0;color:#426152;font-size:12px}
    .apollo-compliance-summary{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.apollo-compliance-pill{padding:6px 9px;border-radius:999px;background:#f1f5f9;font-size:11px;font-weight:700;color:#334155}
    .apollo-attention-title{margin:0 0 10px;font-size:16px;color:#8a3d00}.apollo-attention-note{font-size:12px;color:#64748b;margin:0 0 12px}
    .apollo-attention-item{border:1px solid #f2d0a2;background:#fffaf2;border-radius:11px;padding:12px;margin:9px 0}
    .apollo-attention-item.blocked{border-color:#efb2b2;background:#fff5f5}.apollo-attention-item.review{border-color:#e6d39c;background:#fffcef}
    .apollo-attention-desc{font-weight:800;color:#1f2937;margin-bottom:7px}.apollo-attention-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;font-size:12px}
    .apollo-attention-grid strong{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}.apollo-suggestion{margin-top:10px;padding:10px;border-radius:9px;background:#fff;border:1px solid #dbe3ec}
    .apollo-confidence{font-weight:900;color:#17334f}.apollo-confidence.high{color:#12713d}.apollo-confidence.low{color:#9a5c00}
    .apollo-compliance-error{margin-top:10px;color:#b42318;font-size:12px}.apollo-compliance-working{font-size:12px;color:#475569}
    .apollo-extracted{margin-top:12px;padding-top:11px;border-top:1px solid #edf0f4;font-size:12px;color:#475569}
    .apollo-compliance-disclaimer{margin-top:12px;color:#64748b;font-size:10px;line-height:1.45}
    .apollo-compliance-apply{margin-top:8px}.apollo-compliance-apply button{font-size:12px}
    .customer-document-step>.apollo-compliance-tools{grid-column:1/-1;min-width:0}
    .apollo-compliance-panel{width:100%;min-width:0;box-sizing:border-box;border-radius:3px;box-shadow:none;color:var(--ink,#071827);font-size:14px}
    .apollo-compliance-panel button{font:inherit;font-weight:700;white-space:normal}
    .apollo-compliance-panel input[type=checkbox]{width:18px;height:18px;min-height:18px;accent-color:var(--accent,#f05a22)}
    .hs31-heading,.hs31-toolbar,.hs31-actions,.hs31-pagination{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .hs31-heading{justify-content:space-between}.hs31-heading h3{margin:0;font-size:24px}.hs31-heading p{margin:6px 0;color:var(--muted)}
    .hs31-counts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
    .apollo-compliance-panel .hs31-count{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:16px;background:var(--canvas,#f4f5f6);color:var(--ink);border:1px solid var(--line,#d9dde1)}
    .hs31-count strong{font-size:28px}.hs31-count span{font-size:13px}
    .apollo-compliance-panel [data-hs-filter][aria-pressed=true]{border-color:var(--accent,#f05a22);box-shadow:inset 0 -3px var(--accent,#f05a22)}
    .hs31-toolbar{margin:14px 0}.hs31-toolbar label{flex:1;min-width:180px}.hs31-toolbar label input{width:100%;box-sizing:border-box}
    .hs31-table-wrap{width:100%;overflow-x:auto;border:1px solid var(--line,#d9dde1)}
    .hs31-table{width:100%;table-layout:auto;border-collapse:collapse;text-align:left;font-size:14px}
    .hs31-table th,.hs31-table td{padding:14px 12px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;border-bottom:1px solid var(--line,#d9dde1)}
    .hs31-table th{background:var(--canvas,#f4f5f6);font-size:12px}.hs31-table th:nth-child(2){width:30%}
    .hs31-table small{display:block;margin-top:4px;color:var(--muted);font-size:12px}
    .hs31-status{display:inline-block;padding:4px 8px;font-size:12px;font-weight:700;background:#fff1dd;color:#7b4300;border-radius:3px}
    .hs31-matched{background:#e8f5eb;color:#215932}.hs31-flagged{background:#fff0ee;color:#9b3022}
    .hs31-detail-row[hidden],.hs31-help[hidden]{display:none!important}
    .hs31-detail{padding:12px;background:var(--canvas,#f4f5f6)}.hs31-detail h4{margin:0 0 8px}.hs31-detail label{display:grid;gap:8px;margin:16px 0}
    .hs31-comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}.hs31-comparison section{background:var(--paper,#fff);padding:18px;border:1px solid var(--line,#d9dde1)}
    .hs31-pagination{justify-content:center;margin:16px 0}.hs31-help{padding:20px;background:var(--canvas,#f4f5f6);border:1px solid var(--line,#d9dde1)}.hs31-help label{display:grid;gap:8px;margin-bottom:12px}.hs31-help textarea{box-sizing:border-box;width:100%}
    .apollo-compliance-panel .apollo-compliance-disclaimer{font-size:12px}.apollo-compliance-panel [data-hs-feedback]{font-weight:700}
    @media(min-width:761px){.hs31-heading{position:sticky;top:0;z-index:2;background:var(--paper,#fff);padding:10px 0}.hs31-selection-bar{position:sticky;bottom:0;z-index:2;background:var(--paper,#fff);border-top:1px solid var(--line,#d9dde1);padding:10px 0}}
    @media(max-width:760px){.hs31-counts{grid-template-columns:1fr 1fr}.hs31-comparison{grid-template-columns:1fr}.hs31-table thead{display:none}.hs31-table,.hs31-table tbody,.hs31-table tr,.hs31-table td{display:block;width:auto}.hs31-table .hs31-row{padding:12px;border-bottom:2px solid var(--line,#d9dde1)}.hs31-table td{border:0;padding:6px 0}.hs31-row td[data-label]::before{content:attr(data-label) ': ';font-weight:700}.hs31-detail-row td{padding:0}.hs31-actions{width:100%}.hs31-actions button{flex:1}.hs31-pagination{gap:6px}.hs31-pagination button{padding:8px}.apollo-compliance-panel{padding:12px}}
  `;
  document.head.appendChild(style);
}
function formatCode(value) { return String(value || "-"); }
function renderResult(panel,result,analysisId) {
  panel.dataset.analysisId=analysisId; panel.dataset.status=result.status;
  const form=panel.closest('form'), submit=form?.querySelector("button[type='submit']");
  const upload=form?.querySelector('[data-hs-upload]');
  if(upload){upload.open=false;upload.querySelector('summary').textContent='Documents: '+([...form.querySelector("[name=attachments]").files].map(f=>f.name).join(', ')||'Uploaded invoice')+' — change files';}
  if(submit)submit.textContent='Submit shipment request';

  const previous=panel._hsView || {filter:'attention',query:'',page:1,selected:new Set(),expanded:new Set(),question:''};
  panel._hsView=previous;
  const lines=result.lines||[];
  const category=l=>l.clarificationQuestion?'clarify':l.status==='PASS'?'matched':'flagged';
  const counts={all:lines.length,matched:lines.filter(l=>category(l)==='matched').length,clarify:lines.filter(l=>category(l)==='clarify').length,flagged:lines.filter(l=>category(l)==='flagged').length};
  if(!panel._hsHasRendered){previous.filter=counts.clarify+counts.flagged?'attention':'all';panel._hsHasRendered=true;}
  const label=l=>category(l)==='matched'?'Matched':category(l)==='clarify'?'Needs clarification':'Flagged';
  panel.innerHTML=`<div class="hs31-heading"><div><h3>HS code results</h3><p>Review exceptions first. Your original invoice stays unchanged.</p></div><div class="hs31-actions"><button type="button" class="secondary-button" data-hs-copy>Copy results</button><button type="button" data-hs-download>Download Excel</button></div></div>
    ${result.extractionComplete===false?'<p class="apollo-compliance-error" role="alert">Document reading is incomplete. Items may be missing. Do not treat this as a complete check.</p>':''}
    <div class="hs31-counts">${[['all','Total items'],['matched','Matched'],['clarify','Needs clarification'],['flagged','Flagged']].map(([key,title])=>`<button type="button" class="secondary-button hs31-count" data-hs-filter="${key}"><span>${title}</span><strong>${counts[key]}</strong></button>`).join('')}</div>
    <div class="hs31-toolbar"><button type="button" class="secondary-button" data-hs-filter="attention">Needs attention (${counts.clarify+counts.flagged})</button><label>Search items or HS codes<input type="search" data-hs-search placeholder="Description or HS code" value="${esc(previous.query)}"></label><span data-hs-visible role="status"></span></div>
    <div class="hs31-table-wrap"><table class="hs31-table"><thead><tr><th><input type="checkbox" data-hs-select-page aria-label="Select visible items"></th><th>Line / original description</th><th>Invoice HS</th><th>Selected HS</th><th>Result</th><th>Action</th></tr></thead><tbody data-hs-rows></tbody></table></div>
    <div class="hs31-pagination"><button type="button" class="secondary-button" data-hs-page="first">First</button><button type="button" class="secondary-button" data-hs-page="previous">Previous</button><span data-hs-page-info></span><button type="button" class="secondary-button" data-hs-page="next">Next</button><button type="button" class="secondary-button" data-hs-page="last">Last</button></div>
    <div class="hs31-toolbar hs31-selection-bar"><strong data-hs-selection></strong><button type="button" class="secondary-button" data-hs-select-filtered>Select all filtered items</button><button type="button" class="secondary-button" data-hs-clear>Clear selection</button><button type="button" class="secondary-button" data-hs-open-help>Ask Apollo</button></div>
    <div class="hs31-help" data-hs-help-box hidden><h4>Ask Apollo about selected items</h4><label>Question (optional)<textarea data-hs-question maxlength="1000" rows="3">${esc(previous.question)}</textarea></label><button type="button" data-hs-help>Send to DXB team</button><p>Optional help, not an approval requirement. Open HS help to read the team's reply.</p></div>
    <p data-hs-feedback role="status" aria-live="polite"></p><p class="apollo-compliance-disclaimer">Matched means the 95% text-match threshold was met, not customs approval. A wording mismatch alone does not mean the invoice code is wrong. ${(result.warnings||[]).map(esc).join(' ')} ${esc(result.disclaimer||'')}</p>`;
  let filtered=[],visible=[],pages=1;
  function drawRows(){
    const query=previous.query.toLowerCase().trim();
    filtered=lines.filter(l=>(previous.filter==='all'||(previous.filter==='attention'?category(l)!=='matched':category(l)===previous.filter))&&[l.description,l.submittedHsCode,l.effectiveHsCode,l.suggestion?.hsCode,l.sourceFile].some(v=>String(v||'').toLowerCase().includes(query)));
    pages=Math.max(1,Math.ceil(filtered.length/20));previous.page=Math.max(1,Math.min(pages,previous.page));visible=filtered.slice((previous.page-1)*20,previous.page*20);
    panel.querySelector('[data-hs-rows]').innerHTML=visible.map(l=>`<tr class="hs31-row">
      <td data-label="Select"><input type="checkbox" data-hs-help-line value="${l.lineIndex}" aria-label="Select item ${l.lineIndex+1}" ${previous.selected.has(l.lineIndex)?'checked':''}></td>
      <td data-label="Item"><strong>${l.lineIndex+1}. ${esc(l.description)}</strong></td>
      <td data-label="Invoice HS">${esc(l.submittedHsCode||'Missing')}<small>${l.originalConfidence==null?'No exact master match':Number(l.originalConfidence)+'% text match'}</small></td>
      <td data-label="Selected HS">${esc(l.effectiveHsCode||l.submittedHsCode||'Not selected')}</td>
      <td data-label="Result"><span class="hs31-status hs31-${category(l)}">${label(l)}</span></td>
      <td><button type="button" class="secondary-button" data-hs-expand="${l.lineIndex}" aria-expanded="${previous.expanded.has(l.lineIndex)}" aria-controls="hs31-detail-${l.lineIndex}">${previous.expanded.has(l.lineIndex)?'Close':category(l)==='clarify'?'Clarify':'View details'}</button></td></tr>
      <tr class="hs31-detail-row" id="hs31-detail-${l.lineIndex}" ${previous.expanded.has(l.lineIndex)?'':'hidden'}><td colspan="6"><div class="hs31-detail">
      <p><strong>Original description:</strong> ${esc(l.description)}</p><small>Source: ${esc(l.sourceFile)} ${esc(l.sourceSheet)} ${l.sourceRow?'row '+esc(l.sourceRow):''} ${l.sourcePage?'page '+esc(l.sourcePage):''}</small>
      <p>${esc(l.issue)}</p>
      <div class="hs31-comparison"><section><h4>Invoice code</h4><strong>${esc(l.submittedHsCode||'Missing')}</strong><p>${l.originalConfidence==null?'No exact master match':Number(l.originalConfidence)+'% text match'}</p>${l.submittedHsCode?`<button type="button" class="secondary-button" data-hs-keep="${l.lineIndex}">Keep invoice code</button>`:''}</section>
      <section><h4>Suggested alternative</h4>${l.suggestion?`<strong>${esc(l.suggestion.hsCode)}</strong><p>${esc(l.suggestion.description)}</p><p>${Number(l.suggestion.confidence)}% text match</p>${!l.suggestion.importRestriction&&!l.suggestion.importProhibition&&Number(l.suggestion.confidence)>=READY_THRESHOLD?`<button type="button" data-compliance-accept data-line-index="${l.lineIndex}" data-hs-code="${esc(l.suggestion.hsCode)}">Use suggestion</button>`:'<p>Not available for automatic selection. Ask Apollo for help.</p>'}`:'<p>No alternative suggested.</p>'}</section></div>
      ${l.clarificationQuestion&&/\bcaps?\b/i.test(l.description)?`<p>Choose a starting detail, then recheck:</p><div class="hs31-actions"><button type="button" class="secondary-button" data-hs-choice="${l.lineIndex}" data-detail="Wearable caps">Wearable caps</button><button type="button" class="secondary-button" data-hs-choice="${l.lineIndex}" data-detail="Container closures">Container closures</button></div>`:''}
      <label>${esc(l.clarificationQuestion||'Add product use or material (optional)')}<input data-hs-detail="${l.lineIndex}" maxlength="500" value="${esc(previous.details?.[l.lineIndex]??l.clarification??'')}" placeholder="For example: wearable cotton baseball caps"></label><button type="button" class="secondary-button" data-hs-clarify="${l.lineIndex}">Recheck item</button>
      <p>Your choice updates the results summary, not your original invoice.</p></div></td></tr>`).join('')||'<tr><td colspan="6">No items match this filter.</td></tr>';
    panel.querySelector('[data-hs-visible]').textContent=`${filtered.length} of ${lines.length} items`;
    panel.querySelector('[data-hs-page-info]').textContent=`Page ${previous.page} of ${pages}`;
    for(const btn of panel.querySelectorAll('[data-hs-page]'))btn.disabled=['first','previous'].includes(btn.dataset.hsPage)?previous.page===1:previous.page===pages;
    for(const btn of panel.querySelectorAll('[data-hs-filter]'))btn.setAttribute('aria-pressed',String(btn.dataset.hsFilter===previous.filter));
    updateSelection();
  }
  function updateSelection(){
    panel.querySelector('[data-hs-selection]').textContent=`${previous.selected.size} items selected`;
    const select=panel.querySelector('[data-hs-select-page]'),n=visible.filter(l=>previous.selected.has(l.lineIndex)).length;
    select.checked=visible.length>0&&n===visible.length;select.indeterminate=n>0&&n<visible.length;select.disabled=!visible.length;
  }
  panel.querySelector('[data-hs-search]').oninput=e=>{previous.query=e.target.value;previous.page=1;drawRows();};
  panel.querySelector('[data-hs-question]').oninput=e=>{previous.question=e.target.value;};
  panel.onchange=e=>{if(e.target.matches('[data-hs-help-line]')){const i=Number(e.target.value);e.target.checked?previous.selected.add(i):previous.selected.delete(i);updateSelection();}};
  panel.oninput=e=>{if(e.target.matches('[data-hs-detail]')){previous.details??={};previous.details[e.target.dataset.hsDetail]=e.target.value;}};
  panel.querySelector('[data-hs-select-page]').onchange=e=>{visible.forEach(l=>e.target.checked?previous.selected.add(l.lineIndex):previous.selected.delete(l.lineIndex));drawRows();};
  panel.querySelector('[data-hs-select-filtered]').onclick=()=>{filtered.forEach(l=>previous.selected.add(l.lineIndex));drawRows();};
  panel.querySelector('[data-hs-clear]').onclick=()=>{previous.selected.clear();drawRows();};
  panel.querySelector('[data-hs-open-help]').onclick=()=>{panel.querySelector('[data-hs-help-box]').hidden=false;panel.querySelector('[data-hs-question]').focus();};
  panel.onclick=async e=>{
    const expand=e.target.closest('[data-hs-expand]'),filter=e.target.closest('[data-hs-filter]'),page=e.target.closest('[data-hs-page]');
    if(expand){const i=Number(expand.dataset.hsExpand);previous.expanded.has(i)?previous.expanded.delete(i):previous.expanded.add(i);drawRows();}
    if(filter){previous.filter=filter.dataset.hsFilter;previous.page=1;drawRows();}
    if(page){previous.page=page.dataset.hsPage==='first'?1:page.dataset.hsPage==='last'?pages:previous.page+(page.dataset.hsPage==='next'?1:-1);drawRows();}
    const choice=e.target.closest('[data-hs-choice]');
    if(choice){const input=panel.querySelector(`[data-hs-detail="${choice.dataset.hsChoice}"]`);input.value=choice.dataset.detail;previous.details??={};previous.details[choice.dataset.hsChoice]=input.value;input.focus();}
    const btn=e.target.closest('[data-hs-keep],[data-hs-clarify]');
    if(!btn)return;
    btn.disabled=true;const clarify=btn.hasAttribute('data-hs-clarify'),index=Number(clarify?btn.dataset.hsClarify:btn.dataset.hsKeep);
    try{
      const r=await api(`/api/customer/compliance/${encodeURIComponent(analysisId)}/${clarify?'clarify':'confirm'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clarify?{lineIndex:index,detail:panel.querySelector(`[data-hs-detail="${index}"]`).value}:{accepted:[{lineIndex:index,keepOriginal:true}]})});
      renderResult(panel,r.result,r.analysisId);syncEffectiveHsToForm(form,r.result);
      panel.querySelector('[data-hs-feedback]').textContent=clarify?'Item rechecked. Results updated.':'Invoice code retained. Any warnings still apply.';
    }catch(err){btn.disabled=false;panel.querySelector('[data-hs-feedback]').textContent=err.message;}
  };
  drawRows();
  panel.querySelector('[data-hs-download]').onclick=async()=>{
    try {const r=await fetch(`${API_URL}/api/customer/hs-help/${encodeURIComponent(analysisId)}/download`,{headers:{Authorization:`Bearer ${sessionToken()}`}});if(!r.ok)throw new Error('Download failed. Your check may have expired.');const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download='Apollo_HS_Summary.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){panel.querySelector('[data-hs-feedback]').textContent=e.message;}
  };
  panel.querySelector('[data-hs-copy]').onclick=async()=>{
    const text=['Line\tOriginal description\tInvoice HS\tSelected HS\tResult',...(result.lines||[]).map(l=>[l.lineIndex+1,l.description,l.submittedHsCode,l.effectiveHsCode||l.submittedHsCode,l.status].map(v=>String(v??'').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n');
    try{await navigator.clipboard.writeText(text);panel.querySelector('[data-hs-feedback]').textContent='Results copied.';}catch{const t=document.createElement('textarea');t.value=text;panel.append(t);t.select();panel.querySelector('[data-hs-feedback]').textContent='Select and copy the text below, or download Excel.';}
  };
  panel.querySelector('[data-hs-help]').onclick=async(event)=>{
    const lineIndexes=[...previous.selected];
    if(!lineIndexes.length){panel.querySelector('[data-hs-feedback]').textContent='Select the items you want DXB to check.';return;}
    event.target.disabled=true;
    try{await api(`/api/customer/hs-help/${encodeURIComponent(analysisId)}/help`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lineIndexes,question:panel.querySelector('[data-hs-question]').value})});panel.querySelector('[data-hs-feedback]').textContent='Sent to the shared DXB help queue. Open HS help to view the reply.';}catch(e){event.target.disabled=false;panel.querySelector('[data-hs-feedback]').textContent=e.message;}
  };

}
function applyExtractionToForm(form, result) {
  if(form.dataset.hsCheckOnly==='1')return;
  const shipment = result?.shipment || {};
  setField(form, "origin", shipment.origin, true);
  setField(form, "destination", shipment.destination || "Kuwait", true);
  setField(form, "consignee", shipment.consignee, true);
  const lines = Array.isArray(result?.lines) ? result.lines : [];
  if (lines.length) {
    const first = lines[0];
    setField(form, "itemName", first.description);
    form.dataset.hsDocumentChecked = '1';
    const effective = first.effectiveHsCode || first.submittedHsCode || "";
    if (effective) {
      setField(form, "hsCode", effective);
      setField(form, "itemCode", effective);
    } else {
      for(const name of ['hsCode','itemCode']){const field=form.querySelector(`[name='${name}']`);if(field)field.value='';}
    }
  }
  const cargoLines = Array.isArray(result?.cargoLines) ? result.cargoLines : [];
  const cargoRoot = form.querySelector("[data-customer-cargo]");
  if (cargoRoot && cargoLines.length) {
    cargoRoot.dispatchEvent(new CustomEvent("apollo:replace-cargo", { bubbles: true, detail: { lines: cargoLines } }));
  } else {
    if (shipment.totalPieces) setField(form, "pieces", shipment.totalPieces);
    if (shipment.grossWeightKg) setField(form, "actualKg", shipment.grossWeightKg);
    if (shipment.totalCbm) setField(form, "cbm", shipment.totalCbm);
  }
}
function syncEffectiveHsToForm(form, result) {
  if(!form || form.dataset.hsCheckOnly==='1')return;
  const lines = Array.isArray(result?.lines) ? result.lines : [];
  if (!lines.length) return;
  const first = lines[0];
  const code = first.effectiveHsCode || first.submittedHsCode || "";
  if (code) { setField(form, "hsCode", code); setField(form, "itemCode", code); }
}
async function analyze(form, panel, button) {
  const files = Array.from(form.querySelector("input[name='attachments']")?.files || []);
  const supported = files.filter((file) => ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/vnd.ms-excel.sheet.macroenabled.12"].includes(String(file.type || "").toLowerCase()) || /\.(xlsx|xls|xlsm)$/i.test(file.name || ""));
  if (!files.length) throw new Error("Select the invoice and/or packing list first.");
  if (supported.length !== files.length) throw new Error("Select only PDF, JPG, PNG, WebP or Excel (.xls/.xlsx/.xlsm) files for analysis. No selected file will be silently skipped.");
  if (supported.length > 3) throw new Error("Select up to 3 documents for one compliance analysis.");
  const destination = form.dataset.hsCheckOnly === '1' ? 'Kuwait' : String(form.querySelector("[name='destination']")?.value || "").trim();
  if (!/\bkuwait\b|\bkwi\b/i.test(destination)) throw new Error("The current compliance master is for Kuwait. Set Destination to Kuwait before running the check.");
  const totalBytes = supported.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (totalBytes > 10 * 1024 * 1024) throw new Error("Keep AI-analysis documents to 10 MB total. Larger files can still be attached after the check.");
  button.disabled = true;
  button.textContent = "Analyzing documents…";
  panel.hidden = false;
  panel.innerHTML = `<div class="apollo-compliance-working">Apollo AI is reading the documents, extracting shipment details and cross-checking the Kuwait HS master…</div>`;
  try {
    const payloadFiles = [];
    for (const file of supported) {
      const lowerName = String(file.name || "").toLowerCase();
      const suppliedMime = String(file.type || "").toLowerCase();
      const mimeType = /\.xlsx$/i.test(lowerName) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : /\.xlsm$/i.test(lowerName) ? "application/vnd.ms-excel.sheet.macroenabled.12" : /\.xls$/i.test(lowerName) ? "application/vnd.ms-excel" : suppliedMime;
      payloadFiles.push({ fileName: file.name, mimeType, contentBase64: await readBase64(file) });
    }
    const response = await api("/api/customer/compliance/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination, files: payloadFiles }), timeoutMs: 120000 });
    const hidden = form.querySelector("input[name='complianceAnalysisId']");
    if (hidden) hidden.value = response.analysisId || "";
    renderResult(panel, response.result || {}, response.analysisId || "");
    applyExtractionToForm(form, response.result || {});
  } finally {
    button.disabled = false;
    button.textContent = "Analyze Documents & Check Kuwait HS";
  }
}
async function confirmSuggestion(form, panel, button) {
  const analysisId = panel.dataset.analysisId || form.querySelector("input[name='complianceAnalysisId']")?.value || "";
  if (!analysisId) throw new Error("Run the document analysis again first.");
  const lineIndex = Number(button.dataset.lineIndex);
  const hsCode = String(button.dataset.hsCode || "");
  button.disabled = true;
  const response = await api(`/api/customer/compliance/${encodeURIComponent(analysisId)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: [{ lineIndex, hsCode }] }) });
  renderResult(panel, response.result || {}, response.analysisId || analysisId);
  syncEffectiveHsToForm(form, response.result || {});
}
function enhance(form) {
  if (!form || form.dataset.apolloComplianceReady === "1") return;
  form.dataset.apolloComplianceReady = "1";
  styleOnce();
  const docStep = form.querySelector(".customer-document-step");
  if (!docStep) return;
  form.dataset.hsCheckOnly=form.dataset.form==='customer-hs-check'?'1':'0';
  form.addEventListener('submit',e=>{if(form.dataset.hsCheckOnly==='1'){e.preventDefault();e.stopImmediatePropagation();}},true);
  const tools = document.createElement("div");
  tools.className = "apollo-compliance-tools";
  tools.innerHTML = `<button type="button" class="secondary-button" data-compliance-analyze>Analyze Documents & Check Kuwait HS</button><span class="apollo-compliance-working">Kuwait master · HS + description + import restriction/prohibition</span>`;
  let hidden = form.querySelector("input[name='complianceAnalysisId']");
  if (!hidden) { hidden = document.createElement("input"); hidden.type = "hidden"; hidden.name = "complianceAnalysisId"; docStep.appendChild(hidden); }
  const panel = document.createElement("div"); panel.className = "apollo-compliance-panel"; panel.hidden = true;
  docStep.appendChild(tools); docStep.after(panel);
  if(form.dataset.hsCheckOnly==='1'){
    const upload=document.createElement('details');upload.dataset.hsUpload='1';upload.open=true;
    const summary=document.createElement('summary');summary.textContent='Upload invoice or packing list';upload.append(summary);
    docStep.before(upload);upload.append(docStep);
  }
  tools.querySelector("[data-compliance-analyze]")?.addEventListener("click", async (event) => {
    try {
      await analyze(form, panel, event.currentTarget);
      window.notifySuccess?.("Compliance analysis complete", "Review the extracted shipment details and HS recommendations.");
    } catch (error) {
      const detail = error.message || "Compliance analysis failed.";
      panel.hidden = false;
      panel.innerHTML = `<div class="apollo-compliance-error">${esc(detail)}</div>`;
      window.notifyFailed?.("Compliance analysis failed", detail);
    }
  });
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-compliance-accept]");
    if (!button) return;
    try {
      await confirmSuggestion(form, panel, button);
      window.notifySuccess?.("HS suggestion applied", "The selected code is updated in your results summary. Your original invoice is unchanged.");
    } catch (error) {
      button.disabled = false;
      const detail = error.message || "Could not apply the suggestion.";
      const note = document.createElement("div");
      note.className = "apollo-compliance-error";
      note.textContent = detail;
      button.parentElement?.appendChild(note);
      window.notifyFailed?.("HS suggestion not applied", detail);
    }
  });
  form.querySelector("[name='attachments']")?.addEventListener("change", () => {
    panel._hsView=null; panel._hsHasRendered=false; hidden.value = ""; panel.hidden = true; panel.innerHTML = ""; panel.dataset.analysisId = ""; panel.dataset.status = "";
  });
}
function scan() { document.querySelectorAll("form[data-form='customer-shipment-request'],form[data-form='customer-hs-check']").forEach(enhance); }
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();

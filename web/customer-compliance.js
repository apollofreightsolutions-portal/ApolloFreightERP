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
  `;
  document.head.appendChild(style);
}
function formatCode(value) { return String(value || "-"); }
function renderResult(panel,result,analysisId) {
  panel.dataset.analysisId=analysisId; panel.dataset.status=result.status;
  const form=panel.closest('form'), submit=form?.querySelector("button[type='submit']");
  if(submit)submit.textContent='Submit shipment request';
  panel.innerHTML=`<h3>HS document check</h3><p>${Number(result.passedLineItems)} of ${Number(result.totalLineItems)} items meet the 95% text-match threshold. This is not a customs approval. A wording mismatch alone does not mean your invoice code is wrong.</p>
    <p>You can copy or download results now. Booking fields below are only needed if you also want to request a shipment. Your original documents remain unchanged.</p>
    ${result.extractionComplete===false?'<p class="apollo-compliance-error">Document reading is incomplete. These results may omit items; do not treat them as a complete check.</p>':''}
    <button type="button" data-hs-download>Download Excel summary</button> <button type="button" data-hs-copy>Copy results</button>
    <div style="overflow:auto;max-height:560px;margin:16px 0"><table style="width:100%;text-align:left"><thead><tr><th>Ask DXB</th><th>Item / source</th><th>Invoice HS</th><th>Selected HS</th><th>Result / options</th></tr></thead><tbody>${(result.lines||[]).map(l=>`<tr>
    <td><input type="checkbox" aria-label="Ask DXB about item ${l.lineIndex+1}" data-hs-help-line value="${l.lineIndex}"></td>
    <td>${l.lineIndex+1}. ${esc(l.description)}<small style="display:block">${esc(l.sourceFile)} ${esc(l.sourceSheet)} ${l.sourceRow?'row '+l.sourceRow:''} ${l.sourcePage?'page '+l.sourcePage:''}</small>${l.clarification?`<small>Clarification: ${esc(l.clarification)}</small>`:''}</td>
    <td>${esc(l.submittedHsCode||'Missing')}<small style="display:block">${l.originalConfidence==null?'No exact master match':Number(l.originalConfidence)+'% invoice-code match'}</small></td><td>${esc(l.effectiveHsCode||l.submittedHsCode||'Not selected')}</td>
    <td><strong>${esc(l.status)}</strong> · ${l.matchedMaster?Number(l.confidence)+'% selected-code match':'Invoice code not found / missing'}<p>${esc(l.issue)}</p>
    ${l.suggestion?`<p>Suggested alternative: ${esc(l.suggestion.hsCode)} — ${esc(l.suggestion.description)} (${Number(l.suggestion.confidence)}% text match)</p>${!l.suggestion.importRestriction&&!l.suggestion.importProhibition?`<button type="button" data-compliance-accept data-line-index="${l.lineIndex}" data-hs-code="${esc(l.suggestion.hsCode)}">Use suggested code</button>`:'<p>Restriction flagged — suggestion cannot be auto-selected.</p>'}`:''}
    ${l.submittedHsCode?`<button type="button" data-hs-keep="${l.lineIndex}">Keep invoice code</button>`:''}
    <details ${l.clarificationQuestion?'open':''}><summary>${l.clarificationQuestion?'Clarify this item':'Add product detail (optional)'}</summary><p>${esc(l.clarificationQuestion||'Add its use and material to refine the match. This does not rewrite your invoice description.')}</p><input data-hs-detail="${l.lineIndex}" maxlength="500" value="${esc(l.clarification||'')}" aria-label="Product detail"><button type="button" data-hs-clarify="${l.lineIndex}">Recheck item</button></details></td></tr>`).join('')}</tbody></table></div>
    <label>Optional question for DXB<textarea data-hs-question maxlength="1000" rows="2"></textarea></label>
    <button type="button" data-hs-help>Ask Apollo about selected items</button><p>Optional help only—no approval cycle is required to view or download your check. Replies appear under HS help. Support: ops1@apollo-freight.com.</p>
    <p>${(result.warnings||[]).map(esc).join(' ')}</p><p>${esc(result.disclaimer)}</p><p data-hs-feedback role="status"></p>`;
  panel.querySelector('[data-hs-download]').onclick=async()=>{
    try {const r=await fetch(`${API_URL}/api/customer/hs-help/${encodeURIComponent(analysisId)}/download`,{headers:{Authorization:`Bearer ${sessionToken()}`}});if(!r.ok)throw new Error('Download failed. Your check may have expired.');const u=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=u;a.download='Apollo_HS_Summary.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){panel.querySelector('[data-hs-feedback]').textContent=e.message;}
  };
  panel.querySelector('[data-hs-copy]').onclick=async()=>{
    const text=['Line\tOriginal description\tInvoice HS\tSelected HS\tResult',...(result.lines||[]).map(l=>[l.lineIndex+1,l.description,l.submittedHsCode,l.effectiveHsCode||l.submittedHsCode,l.status].map(v=>String(v??'').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n');
    try{await navigator.clipboard.writeText(text);panel.querySelector('[data-hs-feedback]').textContent='Results copied.';}catch{const t=document.createElement('textarea');t.value=text;panel.append(t);t.select();panel.querySelector('[data-hs-feedback]').textContent='Select and copy the text below, or download Excel.';}
  };
  panel.querySelector('[data-hs-help]').onclick=async(event)=>{
    const lineIndexes=[...panel.querySelectorAll('[data-hs-help-line]:checked')].map(e=>Number(e.value));
    if(!lineIndexes.length){panel.querySelector('[data-hs-feedback]').textContent='Select the items you want DXB to check.';return;}
    event.target.disabled=true;
    try{await api(`/api/customer/hs-help/${encodeURIComponent(analysisId)}/help`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lineIndexes,question:panel.querySelector('[data-hs-question]').value})});panel.querySelector('[data-hs-feedback]').textContent='Sent to the shared DXB help queue. Open HS help to view the reply.';}catch(e){event.target.disabled=false;panel.querySelector('[data-hs-feedback]').textContent=e.message;}
  };
  for(const b of panel.querySelectorAll('[data-hs-keep],[data-hs-clarify]'))b.onclick=async()=>{
    b.disabled=true;
    const clarify=b.hasAttribute('data-hs-clarify'),index=Number(clarify?b.dataset.hsClarify:b.dataset.hsKeep);
    try {const r=await api(`/api/customer/compliance/${encodeURIComponent(analysisId)}/${clarify?'clarify':'confirm'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clarify?{lineIndex:index,detail:panel.querySelector(`[data-hs-detail="${index}"]`).value}:{accepted:[{lineIndex:index,keepOriginal:true}]})});renderResult(panel,r.result,r.analysisId);syncEffectiveHsToForm(form,r.result);}catch(e){b.disabled=false;panel.querySelector('[data-hs-feedback]').textContent=e.message;}
  };
}
function applyExtractionToForm(form, result) {
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
  const mode=document.createElement('div');
  mode.innerHTML='<label><input type="checkbox" data-check-only checked> Check documents only — Kuwait HS master</label><p>Upload, check and download. No cargo details or shipment submission needed. Uncheck to continue with a shipment booking.</p>';
  form.prepend(mode);
  const modeStyle=document.createElement('style');modeStyle.textContent="form[data-hs-check-only='1'] > .customer-booking-step:not(.customer-document-step),form[data-hs-check-only='1'] > .action-row {display:none!important}";form.append(modeStyle);
  const updateMode=()=>{form.dataset.hsCheckOnly=mode.querySelector('input').checked?'1':'0';};updateMode();mode.querySelector('input').onchange=updateMode;
  form.addEventListener('submit',e=>{if(form.dataset.hsCheckOnly==='1'){e.preventDefault();e.stopImmediatePropagation();}},true);
  const tools = document.createElement("div");
  tools.className = "apollo-compliance-tools";
  tools.innerHTML = `<button type="button" class="secondary-button" data-compliance-analyze>Analyze Documents & Check Kuwait HS</button><span class="apollo-compliance-working">Kuwait master · HS + description + import restriction/prohibition</span>`;
  let hidden = form.querySelector("input[name='complianceAnalysisId']");
  if (!hidden) { hidden = document.createElement("input"); hidden.type = "hidden"; hidden.name = "complianceAnalysisId"; docStep.appendChild(hidden); }
  const panel = document.createElement("div"); panel.className = "apollo-compliance-panel"; panel.hidden = true;
  docStep.appendChild(tools); docStep.appendChild(panel);
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
      window.notifySuccess?.("HS suggestion applied", "The accepted HS code is now reflected in this shipment request.");
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
    hidden.value = ""; panel.hidden = true; panel.innerHTML = ""; panel.dataset.analysisId = ""; panel.dataset.status = "";
  });
}
function scan() { document.querySelectorAll("form[data-form='customer-shipment-request']").forEach(enhance); }
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();

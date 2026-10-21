/* Apollo Connected - HR Portal
 * HR/Employee leave UI is isolated from the core ERP runtime.
 */
const HR_API_URL = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");
const HR_SESSION_KEY = "apollofreighterp-session";
const HR_CALENDAR_BRANCH_KEY = "apollofreighterp-hr-calendar-branch";
const HR_DECLARATION = "I declare that the information provided in this leave application is true and complete. I understand that public holidays marked by HR are not deducted from my leave balance, while configured branch weekends follow the HR calendar, and I will return to work on the stated rejoining date unless an approved extension is granted.";
const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const session = () => { try { return JSON.parse(sessionStorage.getItem(HR_SESSION_KEY) || "null"); } catch { return null; } };
const hrToken = () => String(session()?.token || "");
const hrUser = () => String(session()?.userName || "");
const hrAdmin = () => {
  const current = session() || {};
  const role = String(current.role || "").toLowerCase();
  return String(current.portal || "").toLowerCase() === "employee" && (["admin", "hr"].includes(role) || current.isHrAdmin === true);
};
const hrFetch = async (path, options = {}) => {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${hrToken()}` };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${HR_API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
const hrToastFallback = (status, title, detail = "") => {
  let host = document.getElementById("toastStack") || document.querySelector(".toast-stack");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastStack";
    host.className = "toast-stack";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", status === "failed" ? "assertive" : "polite");
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${status}`;
  const heading = document.createElement("strong");
  heading.textContent = title;
  toast.appendChild(heading);
  if (detail) {
    const message = document.createElement("span");
    message.textContent = detail;
    toast.appendChild(message);
  }
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
};
const hrSuccess = (title, detail = "") => {
  if (typeof window.notifySuccess === "function") return window.notifySuccess(title, detail);
  hrToastFallback("success", title, detail);
};
const hrFailed = (title, detail = "") => {
  if (typeof window.notifyFailed === "function") return window.notifyFailed(title, detail);
  if (typeof window.notifyDenied === "function") return window.notifyDenied(title, detail);
  hrToastFallback("failed", title, detail);
};
const today = () => new Date().toISOString().slice(0, 10);
const year = () => new Date().getFullYear();
const fmtDate = v => v ? (() => { const d = new Date(`${String(v).slice(0,10)}T00:00:00Z`); const pad = n => String(n).padStart(2,"0"); return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth()+1)}-${d.getUTCFullYear()}`; })() : "—";
let cache = { config:null, requests:null, summary:null, adminBalances:null, adminBalancesError:"", adminLedger:null, adminLedgerUser:"", policies:null, leaveTypes:null, delegations:null, ledger:null, calendarBranch:"" };
let balanceFilter = { employee:"", leaveType:"", submitted:false };
let policyFilter = { employee:"", year:"all" };
let bound = false;
let baseLoadPromise = null;
let adminLoadPromise = null;

const employeeSession = () => String(session()?.portal || "").toLowerCase() === "employee";
const sessionBranch = () => {
  const raw=String(session()?.branchAccess||"").trim().toLowerCase();
  if (/^dubai$|^dxb$/.test(raw)) return "Dubai";
  if (/kuwait/.test(raw)) return "Kuwait HO";
  const saved=String(sessionStorage.getItem(HR_CALENDAR_BRANCH_KEY)||"");
  return ["Kuwait HO","Dubai","All"].includes(saved) ? saved : "Kuwait HO";
};
const activeCalendarBranch = () => cache.calendarBranch || sessionBranch();
async function loadConfig(){ cache.config = await hrFetch(`/api/hr/leave-config?year=${year()}&branch=${encodeURIComponent(activeCalendarBranch())}`); return cache.config; }
async function loadRequests(){ cache.requests = (await hrFetch("/api/hr/leave-requests")).rows || []; return cache.requests; }
async function loadAdminBalances(userName=""){ const query=userName?`&userName=${encodeURIComponent(userName)}`:""; cache.adminBalancesError=""; try { cache.adminBalances = (await hrFetch(`/api/hr/admin/balances?year=all${query}`)).rows || []; return cache.adminBalances; } catch (error) { cache.adminBalances=[]; cache.adminBalancesError=error.message||"Unable to load employee leave balances."; throw error; } }
// Keep the complete policy set in the cache; the panel filters it by employee/year.
async function loadPolicies(){ cache.policies = await hrFetch("/api/hr/admin/policies?year=all"); return cache.policies; }
async function loadLeaveTypes(){ cache.leaveTypes = (await hrFetch("/api/hr/admin/leave-types")).rows || []; return cache.leaveTypes; }
async function loadDelegations(){ cache.delegations = (await hrFetch("/api/hr/admin/delegations")).rows || []; return cache.delegations; }
async function loadLedger(){ cache.ledger = (await hrFetch("/api/hr/leave-ledger")).rows || []; return cache.ledger; }
async function loadAdminLedger(userName){
  const name=String(userName||"").trim();
  if(!name){ cache.adminLedger=[]; cache.adminLedgerUser=""; return cache.adminLedger; }
  cache.adminLedger=(await hrFetch(`/api/hr/leave-ledger?userName=${encodeURIComponent(name)}`)).rows||[];
  cache.adminLedgerUser=name;
  return cache.adminLedger;
}
async function ensureLoaded(){
  if(!employeeSession()) return;
  bindHrEvents();
  if(baseLoadPromise) return baseLoadPromise;
  const work=[]; if(!cache.config) work.push(loadConfig()); if(cache.requests===null) work.push(loadRequests());
  if(!work.length) return Promise.resolve();
  baseLoadPromise=Promise.all(work).catch(e=>console.warn("HR portal data unavailable",e)).finally(()=>{baseLoadPromise=null;requestCoreRender();});
  return baseLoadPromise;
}
async function ensureAdminData(){
  if(!hrAdmin()) return;
  bindHrEvents(); if(adminLoadPromise) return adminLoadPromise;
  // loadRequests() and loadConfig() also have to run here (not just in ensureLoaded()) - Leave
  // Approvals reads cache.requests and HR Calendar & Rules reads cache.config, and an HR/admin
  // user who opens either page directly (without visiting My Leave first, which is what normally
  // triggers ensureLoaded()) would otherwise find that data still null/unfetched, so the page
  // would silently show nothing even though there's real data on the server.
  const work=[]; if(!cache.summary) work.push(hrFetch(`/api/hr/admin/summary?year=${year()}`).then(data=>{cache.summary=data;})); if(!cache.policies) work.push(loadPolicies()); if(!cache.leaveTypes) work.push(loadLeaveTypes()); if(cache.requests===null) work.push(loadRequests()); if(!cache.config) work.push(loadConfig());
  if(!work.length) return Promise.resolve();
  adminLoadPromise=Promise.all(work).catch(e=>console.warn("HR admin data unavailable",e)).finally(()=>{adminLoadPromise=null;requestCoreRender();});
  return adminLoadPromise;
}
function requestCoreRender(){
  if(typeof window.__APOLLO_HR_RENDER !== "function") return;
  const controls=[];
  document.querySelectorAll(".hr-page form, [data-hr-modal] form").forEach((form,formIndex)=>{
    form.querySelectorAll("input[name],select[name],textarea[name]").forEach((field,fieldIndex)=>{
      controls.push({formIndex,fieldIndex,name:field.name,type:field.type,value:field.value,checked:field.checked,selected:[...field.options||[]].map(o=>o.selected)});
    });
  });
  window.__APOLLO_HR_RENDER();
  document.querySelectorAll(".hr-page form, [data-hr-modal] form").forEach((form,formIndex)=>{
    controls.filter(item=>item.formIndex===formIndex).forEach(item=>{
      const field=form.querySelectorAll("input[name],select[name],textarea[name]")[item.fieldIndex];
      if(!field) return;
      if(field.type==="checkbox"||field.type==="radio") field.checked=item.checked;
      else if(field.tagName==="SELECT" && item.selected.length){[...field.options].forEach((option,index)=>{option.selected=Boolean(item.selected[index]);});}
      else field.value=item.value;
    });
  });
}
function kpi(title,value,note){ return `<article class="hr-kpi"><strong>${esc(value)}</strong><span>${esc(title)}</span><small>${esc(note)}</small></article>`; }
function panel(title,body,note=""){ return `<article class="panel hr-panel"><div class="hr-panel-head"><div><h3>${esc(title)}</h3>${note?`<small>${esc(note)}</small>`:""}</div></div>${body}</article>`; }
function badge(status){ return `<span class="hr-status hr-status-${esc(String(status||"").toLowerCase().replace(/\s+/g,"-"))}">${esc(status||"")}</span>`; }
function dateDiffText(r){ return `${r.actual_leave_days ?? r.total_days ?? 0} leave day(s) • ${r.weekend_days||0} weekend • ${r.public_holiday_days||0} public holiday excluded`; }
// Shared by every "this is MY own data" panel (My Leave, Leave Calendar) - cache.requests holds
// the full company-wide list whenever the logged-in user is HR/admin (the backend has to return
// everyone's requests for the Leave Approvals queue to work), so anything showing this person's
// own history has to filter back down to their own rows, or it ends up showing the same
// full-company list that Leave Approvals shows.
function myOwnRequests(){ const myName=hrUser().toLowerCase(); return (cache.requests||[]).filter(r=>String(r.user_name||"").toLowerCase()===myName); }
function renderBalanceCards(balances=[]){
  if(!balances.length) return `<p class="empty-state">No leave balance has been configured for you.</p>`;
  return `<div class="hr-balance-grid">${balances.map(b=>`<article class="hr-balance-card"><strong>${esc(b.leaveTypeName||b.leaveTypeCode)}</strong><div class="hr-balance-number">${esc(b.available)}</div><small>Available</small><dl><div><dt>Entitlement</dt><dd>${esc(b.entitlement)}</dd></div><div><dt>Used</dt><dd>${esc(b.used)}</dd></div><div><dt>Pending</dt><dd>${esc(b.pending)}</dd></div><div><dt>Carry forward</dt><dd>${esc(b.carryForward)}</dd></div></dl><div class="hr-projected">Projected after pending: <strong>${esc(b.projected)}</strong></div></article>`).join("")}</div>`;
}
function renderMyLeave(){
  const cfg=cache.config||{balances:[],leaveTypes:[]}, emp=cfg.employee||{};
  // cache.requests holds every employee's requests when the logged-in user is HR/admin (the
  // backend returns the full list for that role, since Leave Approvals needs to see everyone's
  // requests) - but "My Leave" is this person's own self-service page, so it has to be narrowed
  // back down to just their own requests here, or an HR/admin user would see every employee's
  // leave history duplicated onto their personal "My Applications" list, identical to what shows
  // on the Leave Approvals page.
  const rows=myOwnRequests();
  const pending=rows.filter(r=>r.status==="Pending").reduce((n,r)=>n+Number(r.actual_leave_days||r.total_days||0),0);
  const used=rows.filter(r=>r.status==="Approved").reduce((n,r)=>n+Number(r.actual_leave_days||r.total_days||0),0);
  return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Apollo Connected / HR Portal</p><h2>My Leave</h2><p><a href="/hr-approvals.html">Open my requests / Assigned leave review inbox</a></p><p>Complete your leave application and track your balance, approvals and return to work.</p></div><button class="blue-button" data-hr-action="open-leave-form">Apply for Leave</button></div>
  <div class="hr-kpi-grid">${kpi("Available leave",cfg.balances.reduce((n,b)=>n+Number(b.available||0),0),"All leave types")}${kpi("Pending",pending,"Awaiting HR approval")}${kpi("Approved used",used,"Approved requests")}${kpi("Year",year(),"Leave year")}</div>
  ${panel("My Leave Balance",renderBalanceCards(cfg.balances),"Leave is deducted only for working days.")}
  ${panel("My Applications",rows.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Request</th><th>Type</th><th>Period</th><th>Calculation</th><th>Planned Rejoining</th><th>Actual Return</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.request_no)}</td><td>${esc(r.leave_type)}</td><td>${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</td><td>${esc(dateDiffText(r))}</td><td>${fmtDate(r.rejoining_date)}</td><td>${fmtDate(r.rejoined_at)}</td><td>${badge(r.status)}</td><td><button class="ghost-button" data-hr-action="view-request" data-id="${esc(r.request_no)}">View</button>${r.status==="Sent Back"?`<button class="ghost-button" data-hr-action="edit-sent-back" data-id="${esc(r.request_no)}">Edit &amp; Resubmit</button>`:""}${["Pending","Approved","Sent Back"].includes(r.status)?`<button class="ghost-button" data-hr-action="cancel-leave" data-id="${esc(r.request_no)}">Cancel</button>`:""}${r.status==="Approved"&&!r.rejoined_at?`<button class="ghost-button" data-hr-action="rejoin" data-id="${esc(r.request_no)}">Submit Rejoining Form</button><button class="ghost-button" data-hr-action="extend-leave" data-id="${esc(r.request_no)}">Request Extension</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">No leave applications yet.</p>`)}</section>`;
}
function renderBalance(){ if(cache.ledger===null) loadLedger().then(requestCoreRender).catch(()=>{}); const ledger=cache.ledger||[]; const ledgerHtml=ledger.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Leave Type</th><th>Transaction</th><th>Days</th><th>Balance After</th><th>Reference / Note</th></tr></thead><tbody>${ledger.map(r=>`<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.leave_type_code)}</td><td>${esc(r.transaction_type)}</td><td>${esc(r.days)}</td><td>${esc(r.balance_after)}</td><td>${esc(r.reference_no||r.reason)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">No leave balance transactions yet.</p>`; return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Apollo Connected / HR Portal</p><h2>Leave Balance</h2><p>Your entitlement, carry-forward, approved usage, pending requests and projected balance for ${year()}.</p></div><button class="secondary-button" data-hr-action="refresh">Refresh</button></div>${panel(`Leave Balance — ${year()}`,renderBalanceCards(cache.config?.balances||[]),"Available = entitlement + carry-forward + adjustment − approved leave. Pending is shown separately.")}${panel("Leave Ledger",ledgerHtml,"A complete history of approved leave, cancellations and HR adjustments.")}</section>`; }
function calendarGrid(config, rows){
  const now=new Date(), y=now.getUTCFullYear(), m=now.getUTCMonth(), first=new Date(Date.UTC(y,m,1)), last=new Date(Date.UTC(y,m+1,0));
  const holidayMap=new Map((config.holidays||[]).map(h=>[String(h.holiday_date).slice(0,10),h])); const leaveMap=new Map();
  (rows||[]).forEach(r=>{ if(!r.start_date||!r.end_date) return; const s=new Date(`${String(r.start_date).slice(0,10)}T00:00:00Z`), e=new Date(`${String(r.end_date).slice(0,10)}T00:00:00Z`); for(let d=new Date(s);d<=e;d.setUTCDate(d.getUTCDate()+1)) leaveMap.set(d.toISOString().slice(0,10),r.status); });
  const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; let cells=names.map(n=>`<div class="hr-cal-head">${n}</div>`).join("");
  for(let i=0;i<first.getUTCDay();i++) cells+=`<div class="hr-cal-cell is-empty"></div>`;
  for(let d=1;d<=last.getUTCDate();d++){ const dt=new Date(Date.UTC(y,m,d)), key=dt.toISOString().slice(0,10), h=holidayMap.get(key), workingOverride=h?.day_type==="WORKING_DAY", weekend=!workingOverride&&config.weekends?.includes(dt.getUTCDay()), st=leaveMap.get(key); cells+=`<div class="hr-cal-cell ${weekend?"is-weekend":""} ${h?.day_type==="PUBLIC_HOLIDAY"?"is-holiday":""} ${h?.day_type==="BLACKOUT"?"is-blackout":""} ${workingOverride?"is-working-day":""} ${st?`is-leave-${String(st).toLowerCase()}`:""}"><strong>${d}</strong>${h?`<small>${esc(h.title)}</small>`:""}${st?`<small>${esc(st)}</small>`:""}</div>`; }
  return `<div class="hr-calendar-grid">${cells}</div>`;
}

async function extendLeave(no){
  const endDate=window.prompt("New leave end date (YYYY-MM-DD):","")||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return;
  const reason=window.prompt("Reason for the extension:","")||"";
  if(!reason.trim()) return;
  try{ await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(no)}/extension`,{method:"POST",body:JSON.stringify({endDate,reason})}); cache.requests=null; await loadRequests(); await loadConfig(); requestCoreRender(); hrSuccess("Extension request submitted", "The extension was sent to HR for approval."); }
  catch(e){ hrFailed("Action failed", e.message); }
}
function renderCalendar(){ const cfg=cache.config||{weekends:[],holidays:[]}; return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Apollo Connected / HR Portal</p><h2>Leave Calendar</h2><p>See weekends, public holidays and your leave dates in one calendar.</p></div></div>${panel("Calendar",calendarGrid(cfg,myOwnRequests()))}${panel("Calendar Legend",`<div class="hr-legend"><span>Weekend</span><span>Public Holiday</span><span>My Leave</span><span>Blackout / Restricted</span></div>`)}${panel("Configured Public Holidays & Rules",cfg.holidays?.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Notes</th></tr></thead><tbody>${cfg.holidays.map(h=>`<tr><td>${fmtDate(h.holiday_date)}</td><td>${esc(h.day_type)}</td><td>${esc(h.title)}</td><td>${esc(h.notes)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">No special dates configured.</p>`)}</section>`; }
function leaveForm(existing=null){
  const cfg=cache.config||{leaveTypes:[]}, emp=cfg.employee||{};
  const resubmitting=existing?.status==="Sent Back";
  const dateValue=value=>value?String(value).slice(0,10):today();
  const oldFile=Boolean(existing?.attachment_url);
  return `<div class="hr-modal-backdrop" data-hr-modal><div class="hr-modal hr-leave-application"><div class="hr-modal-head"><div><p class="eyebrow">Apollo Connected / HR Portal</p><h2>${resubmitting?`Edit & Resubmit ${esc(existing.request_no)}`:"Leave Application"}</h2><p>${resubmitting?"Make the requested corrections, then resubmit this application for review.":"Complete all required information before submitting."}</p></div><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div>
  ${resubmitting&&existing.rejection_reason?`<p class="form-help"><strong>Administrator’s send-back note:</strong> ${esc(existing.rejection_reason)}</p>`:""}
  <form data-hr-form="leave-application" data-request-no="${resubmitting?esc(existing.request_no):""}" data-has-attachment="${oldFile}" class="hr-form">${resubmitting?`<input type="hidden" name="requestNo" value="${esc(existing.request_no)}"><input type="hidden" name="workflowVersion" value="${esc(existing.workflow_version)}">`:""}<section class="hr-form-section"><h3>Employee Information</h3><div class="hr-form-grid"><label>Employee Name<input value="${esc(emp.full_name||hrUser())}" readonly></label><label>Employee Code<input value="${esc(emp.employee_code||"")}" readonly></label><label>Department<input value="${esc(emp.department||"")}" readonly></label><label>Designation<input value="${esc(emp.designation||"")}" readonly></label><label>Reporting Manager<input value="${esc(emp.reporting_manager||"")}" readonly></label></div></section>
  <section class="hr-form-section"><h3>Leave Details</h3><div class="hr-form-grid"><label>Kind of Leave<select name="leaveType" required>${cfg.leaveTypes.map(t=>`<option value="${esc(t.code)}" ${String(t.code)===String(existing?.leave_type||"")?"selected":""}>${esc(t.name)}${t.paid===false?" — Unpaid":""}</option>`).join("")}</select></label><label>Time Period<select name="halfDayType"><option value="" ${!existing?.half_day_type?"selected":""}>Full Day(s)</option><option value="FIRST_HALF" ${existing?.half_day_type==="FIRST_HALF"?"selected":""}>Half Day — First Half</option><option value="SECOND_HALF" ${existing?.half_day_type==="SECOND_HALF"?"selected":""}>Half Day — Second Half</option></select></label><label>Leave Start Date<input name="startDate" type="date" value="${dateValue(existing?.start_date)}" required></label><label>Leave End Date<input name="endDate" type="date" value="${dateValue(existing?.end_date)}" required></label><label>Rejoining Date<input name="rejoiningDate" type="date" value="${dateValue(existing?.rejoining_date)}" required></label><label>Contact Number During Leave<input name="contactDuringLeave" type="tel" value="${esc(existing?.contact_during_leave||"")}" required></label><label class="hr-full">Address / Location During Leave<textarea name="leaveAddress" rows="2" required>${esc(existing?.leave_address||"")}</textarea></label><label>Emergency Contact<input name="emergencyContact" type="tel" value="${esc(existing?.emergency_contact||"")}"></label><label class="hr-full">Reason for Leave<textarea name="reason" rows="3" required placeholder="Please explain the reason for your leave.">${esc(existing?.reason||"")}</textarea></label></div><div class="hr-calculation" data-hr-calculation>${resubmitting?`Current request: ${esc(existing.actual_leave_days??existing.total_days??0)} leave day(s). Update dates to recalculate.`:"Choose dates to calculate actual leave days."}</div></section>
  ${resubmitting?`<section class="hr-form-section"><h3>Response to Reviewer</h3><label>Correction summary<textarea name="resubmissionComment" rows="2" required placeholder="Briefly describe what you corrected."></textarea></label></section>`:""}
  <section class="hr-form-section"><h3>Supporting Document</h3><p class="form-help">Optional unless the selected leave policy requires supporting documentation. PDF/JPG/PNG up to 10 MB.</p>${resubmitting&&oldFile?`<p class="form-help">Your existing supporting document will be retained unless you upload a replacement. <button type="button" class="ghost-button" data-hr-action="view-attachment" data-id="${esc(existing.request_no)}">View current document</button></p>`:""}<input name="attachment" type="file" accept="application/pdf,.pdf,image/jpeg,image/png"><small data-hr-attachment-status></small></section>
  <section class="hr-form-section"><h3>Employee Self-Declaration</h3><label class="hr-declaration"><input type="checkbox" name="declarationAccepted" value="true" ${existing?.declaration_accepted?"checked":""} required><span>${esc(HR_DECLARATION)}</span></label></section>
  <p class="hr-form-message" data-hr-message></p><div class="dialog-actions"><button type="button" class="secondary-button" data-hr-action="close-modal">Cancel</button><button type="submit">${resubmitting?"Resubmit Leave Application":"Submit Leave Application"}</button></div></form></div></div>`;
}
function renderAdminApprovals(){
  ensureAdminData();
  const rows=cache.requests||[];
  const pending=rows.filter(r=>r.status==="Pending");
  const approved=rows.filter(r=>r.status==="Approved");
  const cancelled=rows.filter(r=>r.status==="Cancelled");
  const sentBack=rows.filter(r=>r.status==="Sent Back");
  const rejected=rows.filter(r=>r.status==="Rejected");
  const rowHtml=r=>`<tr><td>${esc(r.request_no)}</td><td>${esc(r.employee_name)}</td><td>${esc(r.leave_type)}</td><td>${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</td><td>${esc(dateDiffText(r))}</td><td>${fmtDate(r.rejoining_date)}</td><td>${badge(r.status)}</td><td><button class="ghost-button" data-hr-action="view-request" data-id="${esc(r.request_no)}">${r.status==="Pending"?"Review":"View"}</button>${r.status==="Approved"?`<button class="ghost-button" data-hr-action="cancel-leave" data-id="${esc(r.request_no)}">Cancel</button>`:""}${r.status==="Cancelled"?`<button class="danger-button" data-hr-action="delete-cancelled-leave" data-id="${esc(r.request_no)}">Delete</button>`:""}</td></tr>`;
  const table=(title,items,empty)=>panel(title,items.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Request</th><th>Employee</th><th>Type</th><th>Period</th><th>Actual Leave</th><th>Rejoining</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(rowHtml).join("")}</tbody></table></div>`:`<p class="empty-state">${empty}</p>`);
  return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Admin / HR</p><h2>Leave Approvals</h2><p><a href="/hr-approvals.html">Open two-stage approval inbox, forwarding and comments</a></p><p>Review pending applications, track sent-back and rejected requests, see approved leave, and remove cancelled requests. Open any application to see every submitted field and the complete reason.</p></div><button class="secondary-button" data-hr-action="refresh">Refresh</button></div><div class="hr-kpi-grid">${kpi("Pending",pending.length,"Requires HR action")}${kpi("Approved",approved.length,"Approved requests")}${kpi("Sent Back",sentBack.length,"Awaiting employee correction")}${kpi("Rejected",rejected.length,"Not approved")}${kpi("Cancelled",cancelled.length,"Available for deletion")}${kpi("Employees",cache.summary?.employees?.length||0,"Employee records")}</div>${table("Pending Applications",pending,"No pending leave applications.")}${table("Sent Back Requests",sentBack,"No sent-back leave applications.")}${table("Approved Leave",approved,"No approved leave applications.")}${table("Rejected Requests",rejected,"No rejected leave applications.")}${table("Cancelled Requests",cancelled,"No cancelled requests to delete.")}</section>`;
}
function renderRequestDetails(r){
  const canReview=hrAdmin()&&r.status==="Pending";
  const reasonLabel=r.status==="Rejected"?"Rejection Reason":r.status==="Sent Back"?"Send-Back Comment":"Reviewer Comment";
  const detail=(label,value)=>`<strong>${esc(label)}</strong><span>${esc(value===null||value===undefined||value===""?"—":value)}</span>`;
  return `<div class="hr-detail-modal" data-hr-modal><div class="hr-modal"><div class="hr-modal-head"><h2>${esc(r.request_no)}</h2><a href="/hr-approvals.html?request=${encodeURIComponent(r.request_no)}">Review / respond / forward</a><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div><div class="hr-detail-grid">
    ${detail("Employee",r.employee_name)}${detail("Username",r.user_name)}${detail("Leave Type",r.leave_type)}${detail("Start Date",fmtDate(r.start_date))}${detail("End Date",fmtDate(r.end_date))}${detail("Rejoining Date",fmtDate(r.rejoining_date))}${detail("Actual Return Date",fmtDate(r.rejoined_at))}${detail("Rejoined By",r.rejoined_by)}${detail("Total Calendar Days",r.calendar_days)}${detail("Weekend Days",r.weekend_days)}${detail("Public Holiday Days",r.public_holiday_days)}${detail("Actual Leave Days",r.actual_leave_days??r.total_days)}${detail("Late Return Leave Days",r.late_return_days||0)}${detail("Half-Day Type",r.half_day_type)}${detail("Reason / Full Application",r.reason)}${detail("Contact During Leave",r.contact_during_leave)}${detail("Leave Address / Location",r.leave_address)}${detail("Emergency Contact",r.emergency_contact)}${detail("Declaration",r.declaration_accepted?"Accepted":"Not accepted")}${detail("Applied At",r.applied_at)}${detail("Status",r.status)}${detail("Approved By",r.approved_by)}${detail("Approved At",r.approved_at)}${detail("Rejection / Review Comment",r.rejection_reason)}${detail("Cancellation Reason",r.cancellation_reason)}${detail("Created At",r.created_at)}${detail("Updated At",r.updated_at)}${r.attachment_url?`<strong>Supporting Document</strong><span><button class="ghost-button" data-hr-action="view-attachment" data-id="${esc(r.request_no)}">View Document</button></span>`:""}
  </div>${canReview?`<section class="hr-review-form"><h3>Review Decision</h3><label>Comment <small>(required for Reject / Send Back, optional for Approve)</small><textarea data-hr-review-comment rows="2" placeholder="Add a note explaining your decision..."></textarea></label><div class="dialog-actions"><button type="button" data-hr-action="review-decide" data-decision="approve" data-id="${esc(r.request_no)}">Approve</button><button type="button" class="secondary-button" data-hr-action="review-decide" data-decision="sendback" data-id="${esc(r.request_no)}">Send Back</button><button type="button" class="danger-button" data-hr-action="review-decide" data-decision="reject" data-id="${esc(r.request_no)}">Reject</button></div></section>`:""}</div></div>`;
}
function renderAdminCalendar(){
  ensureAdminData();
  const cfg=cache.config||{weekends:[],holidays:[]};
  const branch=activeCalendarBranch();
  const names=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const branchSelector=`<label>Branch<select data-hr-branch-select><option value="All" ${branch==="All"?"selected":""}>All branches</option><option value="Kuwait HO" ${branch==="Kuwait HO"?"selected":""}>Kuwait HO</option><option value="Dubai" ${branch==="Dubai"?"selected":""}>Dubai</option></select></label>`;
  return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Admin / HR</p><h2>HR Calendar & Rules</h2><p>Admin controls weekends, public holidays, blackout dates and working-day overrides - separately for each branch.</p></div><form class="hr-inline-form" onsubmit="return false"><div class="hr-form-grid hr-branch-picker">${branchSelector}</div></form></div>
  ${panel(`Weekend Configuration — ${esc(branch)}`,`<form data-hr-form="weekends" class="hr-inline-form"><input type="hidden" name="branch" value="${esc(branch)}"><div class="hr-weekend-checks">${names.map((n,i)=>`<label><input type="checkbox" name="weekday" value="${i}" ${cfg.weekends.includes(i)?"checked":""}>${esc(n)}</label>`).join("")}</div><button type="submit">Save Weekend Rules for ${esc(branch)}</button></form>`,"Weekends set for one branch only apply to that branch. Anything saved while a branch has no rules of its own falls back to the shared \"All branches\" rule.")}
  ${panel(`Add / Update Calendar Date — ${esc(branch)}`,`<form data-hr-form="holiday" class="hr-form"><input type="hidden" name="branch" value="${esc(branch)}"><div class="hr-form-grid"><label>Date From<input type="date" name="startDate" required></label><label>Date To<input type="date" name="endDate" required></label><label>Type<select name="dayType"><option value="PUBLIC_HOLIDAY">Public Holiday</option><option value="BLACKOUT">Blackout / Restricted</option><option value="WORKING_DAY">Working Day Override</option></select></label><label class="hr-full">Title<input name="title" required></label><label class="hr-full">Notes<textarea name="notes" rows="2"></textarea></label></div><button type="submit">Save Calendar Rule for ${esc(branch)}</button></form>`)}
  ${panel(`Configured Dates — ${esc(branch)}`,cfg.holidays?.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Branch</th><th>Type</th><th>Title</th><th>Notes</th><th>Action</th></tr></thead><tbody>${cfg.holidays.map(h=>`<tr><td>${fmtDate(h.holiday_date)}</td><td>${esc(h.branch)}</td><td>${esc(h.day_type)}</td><td>${esc(h.title)}</td><td>${esc(h.notes)}</td><td><button class="ghost-button" data-hr-action="delete-calendar" data-id="${esc(h.id)}">Remove</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">No configured dates for ${esc(branch)} (or shared "All branches" dates).</p>`,`Dates saved as "All" apply to every branch; dates saved for ${esc(branch)} specifically only apply here.`)}
  </section>`;
}
function renderAdminBalance(){
  ensureAdminData();
  const people=cache.summary?.employees||[], selectedEmployee=balanceFilter.employee, selectedType=balanceFilter.leaveType;
  if(selectedEmployee && String(cache.adminLedgerUser||"").toLowerCase()!==String(selectedEmployee).toLowerCase()) loadAdminLedger(selectedEmployee).then(requestCoreRender).catch(()=>{});
  const employeeOptions=people.map(e=>`<option value="${esc(e.user_name)}" data-branch="${esc(e.branch||"Kuwait HO")}" ${selectedEmployee===e.user_name?"selected":""}>${esc(e.full_name||e.user_name)} — ${esc(e.employee_code||"")} (${esc(e.branch||"Kuwait HO")})</option>`).join("");
  const selectedRow=(cache.adminBalances||[]).find(e=>String(e.user_name).toLowerCase()===String(selectedEmployee).toLowerCase());
  const allBalances=selectedRow?.balances||[];
  const leaveTypes=[...new Map(allBalances.map(b=>[b.leaveTypeCode,b.leaveTypeName])).entries()];
  const typeOptions=leaveTypes.map(([code,name])=>`<option value="${esc(code)}" ${selectedType===code?"selected":""}>${esc(name)}</option>`).join("");
  const visibleBalances=allBalances.filter(b=>!selectedType||String(b.leaveTypeCode).toUpperCase()===String(selectedType).toUpperCase());
  const visibleLedger=(String(cache.adminLedgerUser||"").toLowerCase()===String(selectedEmployee).toLowerCase()?(cache.adminLedger||[]):[]).filter(r=>!selectedType||String(r.leave_type_code).toUpperCase()===String(selectedType).toUpperCase());
  const result=cache.adminBalancesError?`<div class="hr-form-message">${esc(cache.adminBalancesError)} <button type="button" class="secondary-button" data-hr-action="retry-admin-balance">Retry</button></div>`:balanceFilter.submitted&&selectedRow&&visibleBalances.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Branch</th><th>Year</th><th>Leave Type</th><th>Entitlement</th><th>Carry Forward</th><th>Adjustment</th><th>Previous Used</th><th>Used</th><th>Pending</th><th>Available</th><th>Projected</th></tr></thead><tbody>${visibleBalances.map(b=>`<tr><td>${esc(selectedRow.full_name||selectedRow.user_name)}</td><td>${esc(selectedRow.branch||"Kuwait HO")}</td><td>${esc(b.year)}</td><td>${esc(b.leaveTypeName)}</td><td>${esc(b.entitlement)}</td><td>${esc(b.carryForward||0)}</td><td>${esc(b.adjustment||0)}</td><td>${esc(b.previousUsed||0)}</td><td>${esc(b.used)}</td><td>${esc(b.pending)}</td><td><strong>${esc(b.available)}</strong></td><td>${esc(b.projected)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">Select an employee and press Search to view all leave policy and balance entries.</p>`;
  const ledgerResult=balanceFilter.submitted&&selectedRow?visibleLedger.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Date</th><th>Year</th><th>Leave Type</th><th>Transaction</th><th>Days</th><th>Balance After</th><th>Reference / Note</th><th>Recorded By</th></tr></thead><tbody>${visibleLedger.map(r=>`<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.year)}</td><td>${esc(r.leave_type_code)}</td><td>${esc(r.transaction_type)}</td><td>${esc(r.days)}</td><td>${esc(r.balance_after)}</td><td>${esc(r.reference_no||r.reason)}</td><td>${esc(r.created_by||"—")}</td></tr>`).join("")}</tbody></table></div>`:`<p class="empty-state">No ledger transactions match this employee and leave type.</p>`:"";
  return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Admin / HR</p><h2>HR Leave Balances</h2><p>View the current balance rule and the complete retained ledger for one employee. The balance table is current state; the ledger is historical audit.</p></div></div>${panel("Balance Rule",`<div class="hr-rule-box"><strong>Available = Entitlement + Carry Forward + Adjustment − Approved Leave</strong><br>Weekends count as leave days. Public holidays do not consume leave.<br><small>Manual adjustment rows are audit events and may include both positive and negative correction deltas. They are not additional balance records.</small></div>`)}${panel("Find Employee Leave Balance",`<form data-hr-form="balance-filter" class="hr-form"><div class="hr-form-grid"><label>Employee<select name="employee" required><option value="">Select employee</option>${employeeOptions}</select></label><label>Leave Type<select name="leaveType"><option value="">All leave types</option>${typeOptions}</select></label></div><button type="submit" class="blue-button">Search</button></form>`)}${panel(`Selected Balance — All Years`,result)}${balanceFilter.submitted&&selectedRow?panel(`Adjustment & Leave Ledger — ${visibleLedger.length} record(s)`,ledgerResult,"This is the same append-only history shown in the employee Leave Balance page; no records are removed or collapsed."):""}</section>`;
}
function renderAdminPolicies(){
  ensureAdminData();
  const data=cache.policies||{types:[],policies:[],history:[],adjustmentAudit:[]}, types=data.types||[], policies=data.policies||[], history=data.history||[], adjustmentAudit=data.adjustmentAudit||[];
  const filtered=policies.filter(p=>(!policyFilter.employee||String(p.user_name).toLowerCase()===policyFilter.employee.toLowerCase())&&(!policyFilter.year||policyFilter.year==='all'||String(p.year)===String(policyFilter.year)));
  const filteredHistory=history.filter(p=>(!policyFilter.employee||String(p.user_name).toLowerCase()===policyFilter.employee.toLowerCase())&&(!policyFilter.year||policyFilter.year==='all'||String(p.year)===String(policyFilter.year)));
  const filteredAudit=adjustmentAudit.filter(p=>(!policyFilter.employee||String(p.user_name).toLowerCase()===policyFilter.employee.toLowerCase())&&(!policyFilter.year||policyFilter.year==='all'||String(p.year)===String(policyFilter.year)));
  const people=cache.summary?.employees||[];
  const employeeOptions=people.map(e=>`<option value="${esc(e.user_name)}" ${String(e.user_name)===String(policyFilter.employee)?'selected':''}>${esc(e.full_name||e.user_name)} — ${esc(e.employee_code||'')}</option>`).join('');
  const years=[...new Set([...policies,...history].map(p=>String(p.year)))].sort((a,b)=>Number(b)-Number(a));
  const yearOptions=years.map(y=>`<option value="${esc(y)}" ${String(policyFilter.year)===y?'selected':''}>${esc(y)}</option>`).join('');
  const typeRows=types.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Code</th><th>Leave Type</th><th>Entitlement</th><th>Paid</th><th>Carry Forward</th><th>Negative Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>${types.map(t=>`<tr><td>${esc(t.code)}</td><td>${esc(t.name)}</td><td>${esc(t.annual_entitlement)}</td><td>${t.paid?'Paid':'Unpaid'}</td><td>${t.allow_carry_forward?'Allowed':'Not allowed'}</td><td>${t.allow_negative_balance?'Allowed':'Not allowed'}</td><td>${t.active===false?'Inactive':'Active'}</td><td><button class="ghost-button" data-hr-action="edit-leave-type" data-id="${esc(t.code)}">Edit</button>${t.active!==false?`<button class="danger-button" data-hr-action="delete-leave-type" data-id="${esc(t.code)}">Deactivate</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty-state">No leave types configured.</p>';
  const policyRows=filtered.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Leave Type</th><th>Year</th><th>Entitlement</th><th>Carry Forward</th><th>Adjustment</th><th>Previous Used</th><th>Date Range</th><th>Document</th><th>Action</th></tr></thead><tbody>${filtered.map(p=>`<tr><td>${esc(p.user_name)}</td><td>${esc(p.leave_type_code)}</td><td>${esc(p.year)}</td><td>${esc(p.entitlement)}</td><td>${esc(p.carry_forward||0)}</td><td>${esc(p.adjustment||0)}</td><td>${esc(p.previous_used_days||0)}</td><td>${p.adjustment_start_date||p.adjustment_end_date?`${fmtDate(p.adjustment_start_date)} → ${fmtDate(p.adjustment_end_date)}`:'—'}</td><td>${p.attachment_name?`<button class="ghost-button" data-hr-action="view-policy-attachment" data-id="${esc(p.id)}">${esc(p.attachment_name)}</button>`:'—'}</td><td><button class="ghost-button" data-hr-action="edit-policy" data-id="${esc(p.id)}">Edit</button><button class="danger-button" data-hr-action="delete-policy" data-id="${esc(p.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty-state">No current policy records match the selected employee and year.</p>`;
  const historyRows=filteredHistory.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Leave Type</th><th>Year</th><th>Entitlement</th><th>Carry Forward</th><th>Adjustment</th><th>Previous Used</th><th>Date Range</th><th>Saved By</th><th>Saved At</th></tr></thead><tbody>${filteredHistory.map(p=>`<tr><td>${esc(p.user_name)}</td><td>${esc(p.leave_type_code)}</td><td>${esc(p.year)}</td><td>${esc(p.entitlement)}</td><td>${esc(p.carry_forward||0)}</td><td>${esc(p.adjustment||0)}</td><td>${esc(p.previous_used_days||0)}</td><td>${p.adjustment_start_date||p.adjustment_end_date?`${fmtDate(p.adjustment_start_date)} → ${fmtDate(p.adjustment_end_date)}`:'—'}</td><td>${esc(p.saved_by||'—')}</td><td>${esc(p.saved_at||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="empty-state">No saved policy history matches the selected employee and year.</p>`;
  const auditRows=filteredAudit.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Employee</th><th>Leave Type</th><th>Year</th><th>Previous Adjustment</th><th>New Adjustment</th><th>Change</th><th>Reason</th><th>Adjusted By</th><th>Date</th><th>Action</th></tr></thead><tbody>${filteredAudit.map(p=>`<tr><td>${esc(p.user_name)}</td><td>${esc(p.leave_type_code)}</td><td>${esc(p.year)}</td><td>${esc(p.previous_adjustment||0)}</td><td>${esc(p.new_adjustment||0)}</td><td>${esc(Number(p.new_adjustment||0)-Number(p.previous_adjustment||0))}</td><td>${esc(p.reason||'—')}</td><td>${esc(p.adjusted_by||'—')}</td><td>${esc(p.created_at||'—')}</td><td><button class="ghost-button" data-hr-action="edit-adjustment-audit" data-id="${esc(p.id)}">Edit</button><button class="danger-button" data-hr-action="delete-adjustment-audit" data-id="${esc(p.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>`:`<p class="empty-state">No adjustment audit events match the selected employee and year.</p>`;
  return `<section class="hr-page"><div class="hr-hero"><div><p class="eyebrow">Admin / HR</p><h2>HR Leave Policies</h2><p>Manage current policies and review every saved employee adjustment, carry-forward and previous-used entry.</p></div><div class="dialog-actions"><button class="blue-button" data-hr-action="add-policy">Add Policy Record</button><button class="secondary-button" data-hr-action="refresh">Refresh</button></div></div>${panel('Filter Policy Records',`<form data-hr-form="policy-filter" class="hr-form"><div class="hr-form-grid"><label>Employee<select name="employee"><option value="">All employees</option>${employeeOptions}</select></label><label>Year<select name="year"><option value="all" ${policyFilter.year==='all'?'selected':''}>All years</option>${yearOptions}</select></div><button type="submit" class="blue-button">Search</button></form>`)}${panel(`Company Leave Types — ${year()}`,typeRows,'Edit a leave type to update its rules.')}${panel(`Employee Leave Policies — ${policyFilter.year==='all'?'All Years':esc(policyFilter.year)} — ${filtered.length} current record(s)`,policyRows,'The current policy row is used for balance calculations.')}${panel(`All Saved Policy Entries — ${filteredHistory.length} record(s)`,historyRows,'Every save is preserved here, including prior adjustments and carry-forward values.')}${panel(`Adjustment Audit — ${filteredAudit.length} event(s)`,auditRows,'Every change to an employee adjustment is retained here. The current policy remains one active row; these are its historical changes.')}</section>`;
}
function adjustmentAuditEditForm(row){return `<div class="hr-modal-backdrop" data-hr-modal><div class="hr-modal"><div class="hr-modal-head"><h2>Edit Adjustment</h2><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div><form data-hr-form="adjustment-audit" data-id="${esc(row.id)}" class="hr-form"><p class="form-help"><strong>${esc(row.user_name)}</strong> — ${esc(row.leave_type_code)} — ${esc(row.year)}. Use a positive value to add leave or a negative value to reduce the adjustment. The current balance will be recalculated.</p><label>New Adjustment<input name="newAdjustment" type="number" step="0.5" value="${esc(row.new_adjustment||0)}" required></label><label>Reason / Note<textarea name="reason" rows="4">${esc(row.reason||'')}</textarea></label><div class="dialog-actions"><button type="button" class="secondary-button" data-hr-action="close-modal">Cancel</button><button type="submit" class="blue-button">Save Adjustment</button></div></form></div></div>`;}
async function saveAdjustmentAudit(form){try{const data=Object.fromEntries(new FormData(form).entries());await hrFetch(`/api/hr/admin/adjustment-audit/${encodeURIComponent(form.dataset.id)}`,{method:"PUT",body:JSON.stringify(data)});cache.policies=null;cache.adminBalances=null;await loadPolicies();form.closest("[data-hr-modal]")?.remove();hrSuccess("Adjustment updated","The active leave adjustment and balance were recalculated.");requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
async function deleteAdjustmentAudit(id){if(!window.confirm("Delete this adjustment audit entry? The active leave adjustment will be recalculated using the remaining audit entries, and the balance may increase or decrease."))return;try{await hrFetch(`/api/hr/admin/adjustment-audit/${encodeURIComponent(id)}`,{method:"DELETE"});cache.policies=null;cache.adminBalances=null;await loadPolicies();hrSuccess("Adjustment deleted","The active leave adjustment and balance were recalculated.");requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
function renderDelegations(){ if(cache.delegations===null) loadDelegations().then(requestCoreRender).catch(()=>{}); const people=cache.summary?.employees||[], rows=cache.delegations||[]; const options=people.map(e=>`<option value="${esc(e.user_name)}">${esc(e.full_name||e.user_name)}</option>`).join(""); return panel("Delegated Leave Approval",`<form data-hr-form="delegation" class="hr-form"><div class="hr-form-grid"><label>Delegator<select name="delegatorUserName" required>${options}</select></label><label>Delegate<select name="delegateUserName" required>${options}</select></label><label>Start<input type="date" name="startDate" value="${today()}" required></label><label>End<input type="date" name="endDate" required></label><label class="hr-full">Notes<textarea name="notes" rows="2"></textarea></label></div><button type="submit">Save Delegation</button></form>${rows.length?`<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Delegator</th><th>Delegate</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.delegator_user_name)}</td><td>${esc(r.delegate_user_name)}</td><td>${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</td><td>${r.active?"Active":"Ended"}</td><td>${r.active?`<button class="ghost-button" data-hr-action="remove-delegation" data-id="${esc(r.id)}">End</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:""}`,"A delegate can approve or reject requests only during the selected dates."); }
function renderRequestUploadStatus(){ return ""; }
function readFileBase64(file){ return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("The selected file could not be read."));r.readAsDataURL(file);}); }
async function submitLeave(form){
  const data=Object.fromEntries(new FormData(form).entries());
  const resubmitting=Boolean(data.requestNo);
  data.declarationAccepted=form.querySelector("[name=declarationAccepted]")?.checked===true;
  const file=form.querySelector("[name=attachment]")?.files?.[0];
  const msg=form.querySelector("[data-hr-message]");
  const submitButton=form.querySelector("button[type=submit]");
  const selectedType=(cache.config?.leaveTypes||[]).find(t=>String(t.code)===String(data.leaveType));
  if(submitButton?.disabled)return;
  if(submitButton)submitButton.disabled=true;
  let fileBase64="";
  let createdRequestNo="";
  try{
    if(selectedType?.require_attachment && file==null && form.dataset.hasAttachment!=="true"){
      const start=data.startDate,end=data.endDate;
      const calc=await hrFetch(`/api/hr/calendar?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
      const s=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`);
      let working=0;
      const hs=new Map((calc.holidays||[]).map(h=>[String(h.holiday_date).slice(0,10),h]));
      for(let d=new Date(s);d<=e;d.setUTCDate(d.getUTCDate()+1)){
        const k=d.toISOString().slice(0,10);
        if(hs.get(k)?.day_type!=="PUBLIC_HOLIDAY")working++;
      }
      if(working>=Number(selectedType.attachment_after_days||0))throw new Error(`${selectedType.name} requires a supporting document for this leave period.`);
    }
    if(file){
      if(file.size>10*1024*1024)throw new Error("Supporting document must be 10 MB or smaller.");
      fileBase64=await readFileBase64(file);
    }
    const result=await hrFetch("/api/hr/leave-requests",{method:"POST",body:JSON.stringify(data)});
    createdRequestNo=result.row.request_no;
    if(file)await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(createdRequestNo)}/attachment`,{method:"POST",body:JSON.stringify({fileName:file.name,mimeType:file.type,contentBase64:fileBase64})});
  }catch(e){
    if(msg)msg.textContent=e.message;
    if(createdRequestNo){
      form.closest("[data-hr-modal]")?.remove();
      cache.requests=null;
      try{await loadRequests();}catch{}
      requestCoreRender();
      hrFailed(resubmitting?"Request resubmitted; attachment incomplete":"Request submitted; attachment incomplete",`${createdRequestNo} was saved, but its supporting document could not be attached. ${e.message}`);
    }else{
      if(submitButton)submitButton.disabled=false;
      hrFailed("Leave request not submitted",e.message);
    }
    return;
  }

  if(msg)msg.textContent=`${resubmitting?"Resubmitted":"Submitted"} ${createdRequestNo}.`;
  let refreshError="";
  try{await loadConfig();await loadRequests();}catch(e){refreshError=e.message||String(e);}
  form.closest("[data-hr-modal]")?.remove();
  requestCoreRender();
  if(refreshError)hrFailed(resubmitting?"Request resubmitted; list refresh failed":"Request submitted; list refresh failed",`${createdRequestNo} was saved, but the leave list could not be refreshed. ${refreshError}`);
  else hrSuccess(resubmitting?"Leave request resubmitted":"Leave request submitted",`${createdRequestNo} was ${resubmitting?"resubmitted":"submitted"} successfully.`);
}
async function decide(no,decision,reasonOverride){
  location.assign(`/hr-approvals.html?request=${encodeURIComponent(no)}&action=${encodeURIComponent(decision)}`);
  return false;
}
async function cancel(no){const reason=window.prompt("Cancellation reason:","Cancelled by employee")||"";try{await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(no)}/cancel`,{method:"POST",body:JSON.stringify({reason})});await loadRequests();await loadConfig();window.__APOLLO_AUDIT__?.("Cancelled leave request",no,reason);hrSuccess("Leave cancelled",`${no} was cancelled successfully.`);requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
async function rejoin(no,actualReturnDate){try{const r=await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(no)}/rejoin`,{method:"POST",body:JSON.stringify({actualReturnDate})});await loadRequests();requestCoreRender();hrSuccess("Rejoining saved", r.lateReturnDays?`${r.lateReturnDays} late leave day(s) were deducted.`:"The rejoining form was saved successfully.");return true;}catch(e){hrFailed("Action failed", e.message);return false;}}
function rejoinForm(r){return `<div class="hr-modal-backdrop" data-hr-modal><div class="hr-modal"><div class="hr-modal-head"><h2>Rejoining Form — ${esc(r.request_no)}</h2><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div><form data-hr-form="rejoin" data-id="${esc(r.request_no)}" class="hr-form"><p class="form-help">Complete this form after you return to work. Planned return date: <strong>${fmtDate(r.rejoining_date)}</strong>. You may enter the actual date you returned, including a backdated date. If you returned later than planned, the extra paid-leave days will be recorded.</p><label>Actual Return Date<input type="date" name="actualReturnDate" required></label><div class="dialog-actions"><button type="button" class="secondary-button" data-hr-action="close-modal">Cancel</button><button type="submit" class="secondary-button">Submit Rejoining Form</button></div></form></div></div>`;}
async function viewAttachment(no){try{const r=await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(no)}/attachment`);window.open(r.url,"_blank","noopener");}catch(e){hrFailed("Action failed", e.message);}}
async function saveHoliday(form){try{const data=Object.fromEntries(new FormData(form).entries());await hrFetch("/api/hr/calendar/holiday",{method:"POST",body:JSON.stringify(data)});await loadConfig();form.reset();window.__APOLLO_AUDIT__?.("Saved public holiday / calendar date",`${data.startDate}${data.endDate&&data.endDate!==data.startDate?`–${data.endDate}`:""} — ${data.title}`,`${data.dayType} (${data.branch})`);hrSuccess("Calendar rule saved",`${data.title} was saved for ${data.branch}.`);requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
async function saveWeekends(form){
  const weekdays=[...new Set(Array.from(form.querySelectorAll("[name=weekday]:checked")).map(x=>Number(x.value)))].sort((a,b)=>a-b);
  const branch=form.querySelector("[name=branch]")?.value||activeCalendarBranch();
  const previousWeekdays=[...new Set((cache.config?.weekends||[]).map(Number))].sort((a,b)=>a-b);
  const changed=JSON.stringify(previousWeekdays)!==JSON.stringify(weekdays);
  const submitButton=form.querySelector("button[type=submit]");
  if(submitButton?.disabled)return;
  if(!changed){hrSuccess("No changes",`${branch} already uses these weekend rules.`);return;}
  if(submitButton)submitButton.disabled=true;
  let saved=false;
  try{
    await hrFetch("/api/hr/calendar/weekends",{method:"POST",body:JSON.stringify({weekdays,branch})});
    saved=true;
    let refreshError="";
    try{await loadConfig();}catch(error){refreshError=error.message||String(error);}
    if(changed)window.__APOLLO_AUDIT__?.("Updated weekend rules",branch,`weekdays: ${previousWeekdays.join(", ")||"-"} -> ${weekdays.join(", ")||"-"}`);
    requestCoreRender();
    if(refreshError)hrFailed("Weekend rules saved; refresh failed",`${branch} rules were saved, but the calendar did not refresh. ${refreshError}`);
    else if(changed)hrSuccess("Weekend rules saved",`${branch} weekend rules were updated.`);
    else hrSuccess("No changes",`${branch} already uses these weekend rules.`);
  }catch(error){
    if(saved)hrFailed("Weekend rules saved; refresh failed",`${branch} rules were saved, but a follow-up step failed. ${error.message}`);
    else hrFailed("Action failed",error.message);
  }finally{
    if(submitButton?.isConnected)submitButton.disabled=false;
  }
}
async function deleteCalendar(id){if(!window.confirm("Remove this calendar rule?"))return;try{await hrFetch(`/api/hr/calendar/holiday/${encodeURIComponent(id)}`,{method:"DELETE"});await loadConfig();window.__APOLLO_AUDIT__?.("Deleted public holiday / calendar date",String(id),"");hrSuccess("Calendar rule removed","The selected calendar rule was removed.");requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
async function viewPolicyAttachment(id){try{const r=await hrFetch(`/api/hr/admin/policies/${encodeURIComponent(id)}/attachment`);window.open(r.url,"_blank","noopener");}catch(e){hrFailed("Document could not be opened",e.message);}}
function policyChangeSummary(previous,data,file){
  if(!previous)return "";
  const fields=[
    ["year","year"],
    ["adjustment_start_date","adjustmentStartDate"],
    ["adjustment_end_date","adjustmentEndDate"],
    ["branch","branch"],
    ["entitlement","entitlement"],
    ["carry_forward","carryForward"],
    ["adjustment","adjustment"],
    ["previous_used_days","previousUsedDays"],
    ["notes","notes"]
  ];
  const changes=fields
    .filter(([oldKey,newKey])=>String(previous[oldKey]??"")!==String(data[newKey]??""))
    .map(([oldKey,newKey])=>`${oldKey}: ${previous[oldKey]??"-"} -> ${data[newKey]??"-"}`);
  if(file&&String(previous.attachment_name||"")!==String(file.name||""))changes.push(`attachment_name: ${previous.attachment_name||"-"} -> ${file.name||"-"}`);
  return changes.join(" | ");
}
async function savePolicy(form){
  const data=Object.fromEntries(new FormData(form).entries());
  const file=form.querySelector("[name=policyAttachment]")?.files?.[0];
  const previous=(cache.policies?.policies||[]).find(p=>String(p.id)===String(data.id))||null;
  const changeSummary=policyChangeSummary(previous,data,file);
  const submitButton=form.querySelector("button[type=submit]");
  if(submitButton?.disabled)return;
  if(file&&file.size>10*1024*1024){hrFailed("Action failed","Policy document must be 10 MB or smaller.");return;}
  if(previous&&!changeSummary&&!file){form.closest("[data-hr-modal]")?.remove();requestCoreRender();hrSuccess("No changes",`${data.userName} — ${data.leaveTypeCode} had no changed fields.`);return;}
  if(submitButton)submitButton.disabled=true;
  let saved=false;
  const warnings=[];
  try{
    const result=await hrFetch("/api/hr/admin/policies",{method:"PUT",body:JSON.stringify(data)});
    saved=true;
    if(file){
      try{
        const base64=await readFileBase64(file);
        await hrFetch(`/api/hr/admin/policies/${encodeURIComponent(result.row.id)}/attachment`,{method:"POST",body:JSON.stringify({fileName:file.name,mimeType:file.type,contentBase64:base64})});
      }catch(error){warnings.push(`The policy was saved, but the document was not attached: ${error.message}`);}
    }
    cache.policies=null;
    cache.adminBalances=null;
    try{await loadPolicies();}catch(error){warnings.push(`The policy was saved, but the policy list could not refresh: ${error.message}`);}
    if(balanceFilter.employee){
      try{await loadAdminBalances(balanceFilter.employee);await loadAdminLedger(balanceFilter.employee);}
      catch(error){warnings.push(`The policy was saved, but the balance refresh failed: ${error.message}`);}
    }
    if(!previous)window.__APOLLO_AUDIT__?.("Created employee leave policy / balance",`${data.userName} — ${data.leaveTypeCode}`);
    else if(changeSummary)window.__APOLLO_AUDIT__?.("Updated employee leave policy / balance",`${data.userName} — ${data.leaveTypeCode}`,changeSummary);
    form.closest("[data-hr-modal]")?.remove();
    requestCoreRender();
    if(warnings.length)hrFailed("Policy saved with warning",`${data.userName} — ${data.leaveTypeCode}. ${warnings.join(" ")}`);
    else hrSuccess("Leave policy saved",`${data.userName} — ${data.leaveTypeCode} was saved successfully.`);
  }catch(error){
    if(saved){
      form.closest("[data-hr-modal]")?.remove();
      requestCoreRender();
      hrFailed("Policy saved; refresh incomplete",`${data.userName} — ${data.leaveTypeCode} was saved, but a follow-up step failed: ${error.message}`);
    }else{
      hrFailed("Action failed",error.message);
      if(submitButton?.isConnected)submitButton.disabled=false;
    }
  }
}
async function deleteCancelledLeave(no){
  if(!hrAdmin()||!window.confirm(`Delete cancelled request ${no}? This cannot be undone.`))return;
  try{await hrFetch(`/api/hr/leave-requests/${encodeURIComponent(no)}`,{method:"DELETE"});cache.requests=null;await loadRequests();window.__APOLLO_AUDIT__?.("Deleted cancelled leave request",no,"");hrSuccess("Cancelled leave deleted",`${no} was deleted successfully.`);requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}
}
function policyEditForm(p){
  const isNew=!p.id, people=cache.summary?.employees||[], types=cache.policies?.types||[];
  const policyBranch=String(p.branch||people.find(e=>String(e.user_name).toLowerCase()===String(p.user_name||"").toLowerCase())?.branch||"Kuwait HO");
  const employeeOptions=people.map(e=>`<option value="${esc(e.user_name)}" data-branch="${esc(e.branch||'Kuwait HO')}" ${String(e.user_name)===String(p.user_name||'')?'selected':''}>${esc(e.full_name||e.user_name)} — ${esc(e.employee_code||'')} (${esc(e.branch||'Kuwait HO')})</option>`).join('');
  const typeOptions=types.map(t=>`<option value="${esc(t.code)}" ${String(t.code)===String(p.leave_type_code||'')?'selected':''}>${esc(t.name)} (${esc(t.code)})</option>`).join('');
  return `<div class="hr-modal-backdrop" data-hr-modal><div class="hr-modal"><div class="hr-modal-head"><h2>${isNew?'Add':'Edit'} Employee Leave Policy</h2><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div><form data-hr-form="policy" class="hr-form"><input type="hidden" name="id" value="${esc(p.id||'')}"><div class="hr-form-grid"><label>Employee${isNew?`<select name="userName" required><option value="">Select employee</option>${employeeOptions}</select>`:`<input name="userName" value="${esc(p.user_name)}" data-branch="${esc(policyBranch)}" readonly>`}</label><label>Leave Type${isNew?`<select name="leaveTypeCode" required><option value="">Select leave type</option>${typeOptions}</select>`:`<input name="leaveTypeCode" value="${esc(p.leave_type_code)}" readonly>`}</label><label>Year<input name="year" type="number" min="2000" max="2100" value="${esc(p.year||year())}" required></label><label>Adjustment Start Date<input name="adjustmentStartDate" type="date" value="${esc(p.adjustment_start_date||'')}"></label><label>Adjustment End Date<input name="adjustmentEndDate" type="date" value="${esc(p.adjustment_end_date||'')}"></label><label class="hr-full"><span data-hr-policy-calculation>Choose an adjustment date range to calculate working days. Public holidays are excluded; weekends count as leave days.</span></label><label>Branch<input name="branch" value="${esc(policyBranch)}" readonly></label><label>Entitlement<input name="entitlement" type="number" min="0" step="0.5" value="${esc(p.entitlement||0)}" required></label><label>Carry Forward<input name="carryForward" type="number" min="0" step="0.5" value="${esc(p.carry_forward||0)}"></label><label>Adjustment<input name="adjustment" type="number" step="0.5" value="${esc(p.adjustment||0)}"></label><label>Previous Used Leave<input name="previousUsedDays" type="number" min="0" step="0.5" value="${esc(p.previous_used_days||0)}"></label><label class="hr-full">Notes<textarea name="notes" rows="2">${esc(p.notes||'')}</textarea></label><label class="hr-full">Policy Document (PDF/JPG/PNG, up to 10 MB)<input name="policyAttachment" type="file" accept="application/pdf,image/jpeg,image/png">${p.attachment_name?`<small>Current document: ${esc(p.attachment_name)}. Choose a new file only if you want to replace it.</small>`:'<small>Optional. Existing documents remain unchanged when no new file is selected.</small>'}</label></div><div class="dialog-actions"><button type="button" class="secondary-button" data-hr-action="close-modal">Cancel</button><button type="submit" class="blue-button">Save Policy Record</button></div></form></div></div>`;
}
async function deletePolicy(id){if(!hrAdmin()||!window.confirm("Delete this employee-specific leave policy?"))return;try{await hrFetch(`/api/hr/admin/policies/${encodeURIComponent(id)}`,{method:"DELETE"});cache.policies=null;cache.adminBalances=null;await loadPolicies();window.__APOLLO_AUDIT__?.("Deleted employee leave policy",String(id),"");hrSuccess("Leave policy deleted","The employee leave policy was deleted successfully.");requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
function leaveTypeEditForm(t){return `<div class="hr-modal-backdrop" data-hr-modal><div class="hr-modal"><div class="hr-modal-head"><h2>Edit Leave Type</h2><button type="button" class="secondary-button" data-hr-action="close-modal">Close</button></div><form data-hr-form="leave-type" class="hr-form"><div class="hr-form-grid"><label>Code<input name="code" value="${esc(t.code)}" readonly></label><label>Name<input name="name" value="${esc(t.name)}" required></label><label>Annual Entitlement<input name="annualEntitlement" type="number" min="0" step="0.5" value="${esc(t.annual_entitlement)}"></label><label>Paid<select name="paid"><option value="true" ${t.paid?"selected":""}>Paid</option><option value="false" ${!t.paid?"selected":""}>Unpaid</option></select></label><label>Half Day<select name="allowHalfDay"><option value="true" ${t.allow_half_day?"selected":""}>Allowed</option><option value="false" ${!t.allow_half_day?"selected":""}>Not Allowed</option></select></label><label>Hourly<select name="allowHourly"><option value="true" ${t.allow_hourly?"selected":""}>Allowed</option><option value="false" ${!t.allow_hourly?"selected":""}>Not Allowed</option></select></label><label>Require Attachment<select name="requireAttachment"><option value="true" ${t.require_attachment?"selected":""}>Yes</option><option value="false" ${!t.require_attachment?"selected":""}>No</option></select></label><label>Attachment After Days<input name="attachmentAfterDays" type="number" min="0" step="0.5" value="${esc(t.attachment_after_days||0)}"></label><label>During Probation<select name="allowDuringProbation"><option value="true" ${t.allow_during_probation?"selected":""}>Allowed</option><option value="false" ${!t.allow_during_probation?"selected":""}>Restricted</option></select></label><label>Carry Forward<select name="allowCarryForward"><option value="true" ${t.allow_carry_forward?"selected":""}>Yes</option><option value="false" ${!t.allow_carry_forward?"selected":""}>No</option></select></label><label>Maximum Carry Forward<input name="maxCarryForward" type="number" min="0" step="0.5" value="${esc(t.max_carry_forward||0)}"></label><label>Allow Negative Balance<select name="allowNegativeBalance"><option value="true" ${t.allow_negative_balance?"selected":""}>Yes</option><option value="false" ${!t.allow_negative_balance?"selected":""}>No</option></select></label><label>Allow Encashment<select name="allowEncashment"><option value="true" ${t.allow_encashment?"selected":""}>Yes</option><option value="false" ${!t.allow_encashment?"selected":""}>No</option></select></label><label>Active<select name="active"><option value="true" ${t.active!==false?"selected":""}>Active</option><option value="false" ${t.active===false?"selected":""}>Inactive</option></select></label></div><button type="submit">Save Leave Type</button></form></div></div>`;}
async function deleteLeaveType(code){if(!hrAdmin()||!window.confirm(`Deactivate leave type ${code}?`))return;try{await hrFetch(`/api/hr/admin/leave-types/${encodeURIComponent(code)}`,{method:"DELETE"});cache.config=null;cache.policies=null;cache.leaveTypes=null;await loadConfig();await loadPolicies();await loadLeaveTypes();window.__APOLLO_AUDIT__?.("Deactivated leave type",code,"");hrSuccess("Leave type deactivated",`${code} was deactivated.`);requestCoreRender();}catch(e){hrFailed("Action failed", e.message);}}
async function saveLeaveType(form){
  const data=Object.fromEntries(new FormData(form).entries());
  const previous=(cache.policies?.types||cache.config?.leaveTypes||[]).find(type=>String(type.code)===String(data.code))||null;
  const fields=[
    ["name","name"],["annual_entitlement","annualEntitlement"],["paid","paid"],
    ["allow_half_day","allowHalfDay"],["allow_hourly","allowHourly"],["require_attachment","requireAttachment"],
    ["attachment_after_days","attachmentAfterDays"],["allow_during_probation","allowDuringProbation"],
    ["allow_carry_forward","allowCarryForward"],["max_carry_forward","maxCarryForward"],
    ["allow_negative_balance","allowNegativeBalance"],["allow_encashment","allowEncashment"],["active","active"]
  ];
  const changeSummary=previous?fields
    .filter(([oldKey,newKey])=>String(previous[oldKey]??"")!==String(data[newKey]??""))
    .map(([oldKey,newKey])=>`${oldKey}: ${previous[oldKey]??"-"} -> ${data[newKey]??"-"}`)
    .join(" | "):"";
  const submitButton=form.querySelector("button[type=submit]");
  if(submitButton?.disabled)return;
  if(previous&&!changeSummary){hrSuccess("No changes",`${data.code} had no field changes.`);return;}
  if(submitButton)submitButton.disabled=true;
  let saved=false;
  const warnings=[];
  try{
    await hrFetch("/api/hr/admin/leave-types",{method:"PUT",body:JSON.stringify(data)});
    saved=true;
    cache.config=null;cache.policies=null;cache.leaveTypes=null;
    for(const refresh of [loadConfig,loadPolicies,loadLeaveTypes]){
      try{await refresh();}catch(error){warnings.push(error.message||String(error));}
    }
    if(previous&&changeSummary)window.__APOLLO_AUDIT__?.("Updated company-wide leave type",data.code,changeSummary);
    form.reset();
    requestCoreRender();
    if(warnings.length)hrFailed("Leave type saved; refresh incomplete",`${data.code} was saved, but a view refresh failed: ${warnings.join(" ")}`);
    else if(changeSummary)hrSuccess("Leave type saved",`${data.code} was updated successfully.`);
    else hrSuccess("No changes",`${data.code} had no field changes.`);
  }catch(error){
    if(saved){form.reset();requestCoreRender();hrFailed("Leave type saved; refresh incomplete",`${data.code} was saved, but a follow-up step failed: ${error.message}`);}
    else hrFailed("Action failed",error.message);
  }finally{
    if(submitButton?.isConnected)submitButton.disabled=false;
  }
}
function openModal(html){document.querySelector("[data-hr-modal]")?.remove();document.body.insertAdjacentHTML("beforeend",html);bindHrEvents();}
function bindHrEvents(){if(bound)return;bound=true;
  document.addEventListener("click",async e=>{const b=e.target.closest("[data-hr-action]");if(!b)return;const a=b.dataset.hrAction,id=b.dataset.id;if(a==="retry-admin-balance"){cache.adminBalancesError="";try{await loadAdminBalances(balanceFilter.employee);await loadAdminLedger(balanceFilter.employee);hrSuccess("Balances refreshed","The selected employee balance was loaded successfully.");}catch(e){hrFailed("Balance load failed",e.message);}requestCoreRender();return;}if(a==="open-leave-form")openModal(leaveForm());else if(a==="close-modal")b.closest("[data-hr-modal]")?.remove();else if(a==="review-decide"){const modal=b.closest("[data-hr-modal]");const comment=modal?.querySelector("[data-hr-review-comment]")?.value||"";const ok=await decide(id,b.dataset.decision,comment);if(ok)modal?.remove();}else if(a==="cancel-leave")await cancel(id);else if(a==="rejoin"){const r=(cache.requests||[]).find(x=>x.request_no===id);if(r)openModal(rejoinForm(r));}else if(a==="view-request"){const r=(cache.requests||[]).find(x=>x.request_no===id);if(r)openModal(renderRequestDetails(r));}else if(a==="view-attachment")await viewAttachment(id);else if(a==="view-policy-attachment")await viewPolicyAttachment(id);else if(a==="delete-cancelled-leave")await deleteCancelledLeave(id);else if(a==="add-policy")openModal(policyEditForm({}));else if(a==="edit-policy"){const p=(cache.policies?.policies||[]).find(x=>String(x.id)===String(id));if(p)openModal(policyEditForm(p));}else if(a==="delete-policy")await deletePolicy(id);else if(a==="edit-leave-type"){const t=(cache.policies?.types||[]).find(x=>String(x.code)===String(id));if(t)openModal(leaveTypeEditForm(t));}else if(a==="delete-leave-type")await deleteLeaveType(id);else if(a==="delete-calendar")await deleteCalendar(id);else if(a==="refresh"){cache.config=null;cache.requests=null;cache.adminBalances=null;cache.adminBalancesError="";cache.policies=null;cache.leaveTypes=null;cache.ledger=null;await ensureLoaded();if(hrAdmin())await ensureAdminData();}});
  document.addEventListener("submit",async e=>{const f=e.target.closest("form[data-hr-form]");if(!f)return;e.preventDefault();if(f.dataset.hrForm==="balance-filter"){const d=Object.fromEntries(new FormData(f).entries());balanceFilter={employee:String(d.employee||""),leaveType:String(d.leaveType||""),submitted:true};cache.adminBalances=null;cache.adminBalancesError="";try{await loadAdminBalances(balanceFilter.employee);await loadAdminLedger(balanceFilter.employee);hrSuccess("Balances loaded","The selected employee balance was loaded successfully.");}catch(e){hrFailed("Balance load failed",e.message);}requestCoreRender();return;}if(f.dataset.hrForm==="leave-application")await submitLeave(f);else if(f.dataset.hrForm==="rejoin"){const ok=await rejoin(f.dataset.id,f.querySelector("[name=actualReturnDate]").value);if(ok)f.closest("[data-hr-modal]")?.remove();}else if(f.dataset.hrForm==="holiday")await saveHoliday(f);else if(f.dataset.hrForm==="weekends")await saveWeekends(f);else if(f.dataset.hrForm==="policy")await savePolicy(f);else if(f.dataset.hrForm==="policy-filter"){const d=Object.fromEntries(new FormData(f).entries());policyFilter={employee:String(d.employee||""),year:String(d.year||"all")};cache.policies=null;await loadPolicies();requestCoreRender();}else if(f.dataset.hrForm==="leave-type")await saveLeaveType(f);});
  document.addEventListener("change",async e=>{const balanceForm=e.target.closest("form[data-hr-form=balance-filter]");if(balanceForm&&e.target.name==="employee"){balanceFilter={employee:String(e.target.value||""),leaveType:"",submitted:false};cache.adminBalances=null;cache.adminBalancesError="";if(balanceFilter.employee){try{await loadAdminBalances(balanceFilter.employee);}catch{}}requestCoreRender();return;}const f=e.target.closest("form[data-hr-form=leave-application]");if(f&&["startDate","endDate","halfDayType"].includes(e.target.name)){await updateCalculation(f);return;}const p=e.target.closest("form[data-hr-form=policy]");if(p&&["adjustmentStartDate","adjustmentEndDate","userName"].includes(e.target.name))await updatePolicyRange(p);});
}
document.addEventListener("click",async event=>{
  const button=event.target.closest("[data-hr-action='edit-sent-back']");
  if(!button)return;
  const row=(cache.requests||[]).find(item=>item.request_no===button.dataset.id);
  if(!row||row.status!=="Sent Back"){hrFailed("Request unavailable","Refresh the leave list and try again.");return;}
  openModal(leaveForm(row));
  const form=document.querySelector("[data-hr-modal] form[data-hr-form='leave-application']");
  if(form)await updateCalculation(form);
});
async function updatePolicyRange(form){
  const start=form.querySelector("[name=adjustmentStartDate]")?.value;
  const end=form.querySelector("[name=adjustmentEndDate]")?.value;
  const calc=form.querySelector("[data-hr-policy-calculation]");
  const employee=form.querySelector("[name=userName]")?.selectedOptions?.[0];
  const branch=employee?.dataset.branch||form.querySelector("[name=branch]")?.value||"Kuwait HO";
  const adjustment=form.querySelector("[name=adjustment]");
  form.querySelector("[name=branch]").value=branch;
  if(!start||!end){calc.textContent="Choose an adjustment date range to calculate leave days. Public holidays are excluded; weekends count as leave days.";return;}
  if(end<start){calc.textContent="Adjustment end date must be on or after the start date.";return;}
  try{
    const r=await hrFetch(`/api/hr/calendar?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}&branch=${encodeURIComponent(branch)}`);
    const s=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`);
    const hs=new Map((r.holidays||[]).map(h=>[String(h.holiday_date).slice(0,10),h]));
    let weekend=0,holiday=0,working=0;
    for(let d=new Date(s);d<=e;d.setUTCDate(d.getUTCDate()+1)){
      const k=d.toISOString().slice(0,10),rule=hs.get(k),type=String(rule?.day_type||"").trim().toUpperCase(),override=type==="WORKING_DAY";
      if((r.weekends||[]).includes(d.getUTCDay())&&!override)weekend++;
      if(type==="PUBLIC_HOLIDAY"&&!override)holiday++;else working++;
    }
    adjustment.value=working;
    calc.innerHTML=`<strong>Calculated adjustment: ${working} working day(s)</strong> • Weekend: ${weekend} • Public holiday/restricted: ${holiday} • Branch: ${esc(branch)}`;
  }catch(e){calc.textContent=e.message;}
}
async function updateCalculation(form){
  const start=form.querySelector("[name=startDate]")?.value;
  const end=form.querySelector("[name=endDate]")?.value;
  const half=form.querySelector("[name=halfDayType]")?.value;
  const calc=form.querySelector("[data-hr-calculation]");
  if(!start||!end){calc.textContent="Choose dates to calculate actual leave days.";return;}
  try{
    const r=await hrFetch(`/api/hr/calendar?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
    const s=new Date(`${start}T00:00:00Z`),e=new Date(`${end}T00:00:00Z`);
    let weekend=0,holiday=0,working=0;
    const hs=new Map((r.holidays||[]).map(h=>[String(h.holiday_date).slice(0,10),h]));
    for(let d=new Date(s);d<=e;d.setUTCDate(d.getUTCDate()+1)){
      const k=d.toISOString().slice(0,10),rule=hs.get(k),type=String(rule?.day_type||"").trim().toUpperCase(),override=type==="WORKING_DAY";
      if((r.weekends||[]).includes(d.getUTCDay())&&!override)weekend++;
      if(type==="PUBLIC_HOLIDAY"&&!override)holiday++;else if(type!=="BLACKOUT")working++;
    }
    if(["FIRST_HALF","SECOND_HALF"].includes(half)){
      if(start!==end){calc.innerHTML=`<strong>Half-day leave must use the same start and end date.</strong>`;return;}
      working=Math.max(0,working-.5);
    }
    let rejoin=new Date(e);
    do{
      rejoin.setUTCDate(rejoin.getUTCDate()+1);
      const k=rejoin.toISOString().slice(0,10),rule=hs.get(k),type=String(rule?.day_type||"").trim().toUpperCase();
      if(type==="WORKING_DAY"||(!r.weekends.includes(rejoin.getUTCDay())&&type!=="PUBLIC_HOLIDAY"&&type!=="BLACKOUT"))break;
    }while(true);
    const rejoinField=form.querySelector("[name=rejoiningDate]");
    if(rejoinField&&!rejoinField.value)rejoinField.value=rejoin.toISOString().slice(0,10);
    calc.innerHTML=`<strong>Actual leave days: ${working}</strong> • Calendar: ${Math.round((e-s)/86400000)+1} • Weekend: ${weekend} • Public holiday/restricted: ${holiday} • Suggested rejoining: ${rejoin.toISOString().slice(0,10)}`;
  }catch(e){calc.textContent=e.message;}
}
window.ApolloHR={renderMyLeave:()=>{ensureLoaded();return renderMyLeave();},renderBalance:()=>{ensureLoaded();return renderBalance();},renderCalendar:()=>{ensureLoaded();return renderCalendar();},renderAdminApprovals:()=>{ensureAdminData();return renderAdminApprovals();},renderAdminCalendar:()=>{ensureAdminData();return renderAdminCalendar();},renderAdminPolicies:()=>{ensureAdminData();return renderAdminPolicies()+renderDelegations();},renderAdminBalance:()=>{ensureAdminData();return renderAdminBalance();}};
window.addEventListener("apollo-hr-refresh",requestCoreRender);
document.addEventListener("click",async event=>{const button=event.target.closest("[data-hr-action]");if(!button)return;const action=button.dataset.hrAction,id=button.dataset.id;if(action==="edit-adjustment-audit"){const row=(cache.policies?.adjustmentAudit||[]).find(item=>String(item.id)===String(id));if(row)openModal(adjustmentAuditEditForm(row));}else if(action==="delete-adjustment-audit")await deleteAdjustmentAudit(id);});
document.addEventListener("submit",async event=>{const form=event.target.closest("form[data-hr-form=adjustment-audit]");if(!form)return;event.preventDefault();await saveAdjustmentAudit(form);});
  document.addEventListener("change",async event=>{const select=event.target.closest("[data-hr-branch-select]");if(!select)return;const previous=cache.calendarBranch;cache.calendarBranch=select.value;sessionStorage.setItem(HR_CALENDAR_BRANCH_KEY,select.value);try{await loadConfig();const selectedWeekends=new Set((cache.config?.weekends||[]).map(Number));document.querySelectorAll('form[data-hr-form="weekends"] [name="weekday"]').forEach(input=>{input.checked=selectedWeekends.has(Number(input.value));});document.querySelectorAll('form[data-hr-form="weekends"] [name="branch"], form[data-hr-form="holiday"] [name="branch"]').forEach(input=>{input.value=select.value;});requestCoreRender();}catch(error){cache.calendarBranch=previous;if(previous)sessionStorage.setItem(HR_CALENDAR_BRANCH_KEY,previous);else sessionStorage.removeItem(HR_CALENDAR_BRANCH_KEY);hrFailed("Calendar load failed",error.message||"Unable to load the selected branch.");requestCoreRender();}});
document.addEventListener("click",async event=>{const button=event.target.closest("[data-hr-action='extend-leave'],[data-hr-action='remove-delegation']");if(!button)return;if(button.dataset.hrAction==="extend-leave")return extendLeave(button.dataset.id);if(!window.confirm("End this delegated approval?"))return;try{await hrFetch(`/api/hr/admin/delegations/${encodeURIComponent(button.dataset.id)}`,{method:"DELETE"});cache.delegations=null;await loadDelegations();hrSuccess("Delegation ended","The delegated approval was ended successfully.");requestCoreRender();}catch(e){hrFailed("Delegation update failed", e.message);}});
  document.addEventListener("submit",async event=>{const form=event.target.closest("form[data-hr-form='delegation']");if(!form)return;event.preventDefault();try{await hrFetch("/api/hr/admin/delegations",{method:"PUT",body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});cache.delegations=null;await loadDelegations();form.reset();hrSuccess("Delegation saved","The delegated approval was saved successfully.");requestCoreRender();}catch(e){hrFailed("Delegation save failed", e.message);}});
bindHrEvents();
ensureLoaded();
setTimeout(requestCoreRender,0);

const CRM_API = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");
const CRM_SESSION_KEY = "apollofreighterp-session";

const cache = {
  me: null,
  dashboard: null,
  accounts: null,
  contacts: null,
  opportunities: null,
  visits: null,
  meetings: null,
  tasks: null,
  activity: null,
  reports: null,
  users: null,
  adminUsers: null,
  salespeople: null,
  loading: new Set(),
  errors: {}
};

const salespersonFilters = {opportunities: "", visits: ""};

function session() {
  try { return JSON.parse(sessionStorage.getItem(CRM_SESSION_KEY) || "null") || {}; } catch { return {}; }
}
function token() { return session().token || ""; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function text(value, fallback = "—") { const v = String(value ?? "").trim(); return v || fallback; }
function date(value) { if (!value) return "—"; const s = String(value).slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : text(value); }
function money(value, currency = "AED") { const n = Number(value || 0); return `${esc(currency || "AED")} ${Number.isFinite(n) ? n.toLocaleString(undefined,{maximumFractionDigits:0}) : "0"}`; }
function badge(value, tone = "navy") { return `<span class="crm-badge ${tone}">${esc(text(value,"—"))}</span>`; }
function bool(value) { return value === true || value === 1 || String(value || "").toLowerCase() === "true"; }
function today() { return new Date().toISOString().slice(0,10); }
function refresh() { if (typeof window.__APOLLO_CRM_RENDER === "function") window.__APOLLO_CRM_RENDER(); }
function crmSession() { return session(); }
const crmSuccess = (title, detail = "") => {
  if (typeof window.notifySuccess === "function") return window.notifySuccess(title, detail);
  if (typeof window.apolloNotify === "function") return window.apolloNotify("success", title, detail);
};
const crmFailed = (title, detail = "") => {
  if (typeof window.notifyFailed === "function") return window.notifyFailed(title, detail);
  if (typeof window.notifyDenied === "function") return window.notifyDenied(title, detail);
  if (typeof window.apolloNotify === "function") return window.apolloNotify("failed", title, detail);
  window.alert(detail ? `${title}\n${detail}` : title);
};

async function request(path, options = {}) {
  const response = await fetch(`${CRM_API}/api/crm${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? {"Content-Type":"application/json"} : {}),
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    let message = `CRM request failed (${response.status}).`;
    try { const body = contentType.includes("json") ? await response.json() : null; message = body?.error || message; } catch {}
    throw new Error(message);
  }
  if (contentType.includes("application/json")) return response.json();
  return response;
}

const endpoints = {
  me: "/me",
  dashboard: "/dashboard",
  accounts: "/accounts",
  contacts: "/contacts",
  opportunities: "/opportunities",
  visits: "/visits",
  meetings: "/meetings",
  tasks: "/tasks",
  activity: "/activity",
  reports: "/reports",
  users: "/users",
  adminUsers: "/admin/users",
  salespeople: "/salespeople"
};

async function load(key, force = false) {
  if (!force && cache[key] !== null) return cache[key];
  if (cache.loading.has(key)) return null;
  cache.loading.add(key);
  delete cache.errors[key];
  try {
    const selected = salespersonFilters[key] || "";
    const result = await request(endpoints[key] + (selected ? `?salesperson=${encodeURIComponent(selected)}` : ""));
    if (selected !== (salespersonFilters[key] || "")) return null;
    cache[key] = key === "me" ? result.user : key === "dashboard" ? result : key === "reports" ? result : result.rows || [];
  } catch (error) {
    cache.errors[key] = error.message;
  } finally {
    cache.loading.delete(key);
    refresh();
  }
  return cache[key];
}

function ensure(...keys) { keys.forEach(key => { if (cache[key] === null && !cache.loading.has(key)) load(key); }); }
function invalidate(...keys) { keys.forEach(key => cache[key] = null); filterData=null; filterError=''; }

function shell(inner, { title = "Sales CRM", subtitle = "Controlled customer ownership, activity and pipeline visibility.", actions = "" } = {}) {
  const s = crmSession();
  const ownerMessage = s.crmViewAllAccounts ? "Management view: all permitted CRM accounts" : `Private sales view: only accounts assigned to ${esc(s.userName || "you")}`;
  return `<div class="crm-shell">
    <section class="crm-hero">
      <div class="crm-hero-copy"><p class="crm-hero-eyebrow">Apollo Connected · CRM</p><h2>${esc(title)}</h2><p>${esc(subtitle)} ${ownerMessage}.</p></div>
      <div class="crm-hero-actions">${actions}</div>
    </section>
    ${inner}
  </div>`;
}

function loading(key) { return cache.errors[key] ? `<div class="crm-error">${esc(cache.errors[key])}</div>` : `<div class="crm-loading">Loading CRM data…</div>`; }
function empty(message) { return `<div class="crm-empty">${esc(message)}</div>`; }
function kpi(label, value, note) { return `<article class="crm-kpi"><div class="crm-kpi-label">${esc(label)}</div><div class="crm-kpi-value">${esc(value)}</div><div class="crm-kpi-note">${esc(note)}</div></article>`; }
function panel(title, subtitle, body, actions = "") { return `<section class="crm-panel"><div class="crm-panel-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle || "")}</p></div><div class="crm-panel-actions">${actions}</div></div><div class="crm-panel-body">${body}</div></section>`; }

function ownerBadge(row) { return `<span class="crm-primary">${esc(text(row.assigned_to || row.owner_user_name))}</span>`; }
function stageTone(stage) { const s=String(stage||"").toLowerCase(); return s.includes("won")?"green":s.includes("lost")?"red":s.includes("proposal")?"orange":s.includes("negoti")?"amber":"navy"; }
function statusTone(status) { const s=String(status||"").toLowerCase(); return s.includes("active")||s.includes("won")||s.includes("completed")?"green":s.includes("lost")||s.includes("archiv")?"red":s.includes("prospect")||s.includes("lead")?"orange":"navy"; }

function renderDashboard() {
  ensure("dashboard", "opportunities");
  if (!cache.dashboard) return shell(loading("dashboard"), {title:"CRM Dashboard",subtitle:"A management-grade view of accounts, pipeline, follow-ups and activity."});
  const d = cache.dashboard; const s = d.summary || {};
  const opps = (cache.opportunities || []).filter(o => String(o.status||"").toLowerCase()==="open").slice(0,6);
  const tasks = d.tasks || []; const activity = d.activity || [];
  const taskRows = tasks.length ? `<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Follow-up</th><th>Account</th><th>Due</th><th>Priority</th><th>Owner</th></tr></thead><tbody>${tasks.map(r=>`<tr><td class="crm-primary">${esc(r.title)}</td><td>${esc(text(r.company_name))}</td><td>${date(r.due_date)}</td><td>${badge(r.priority, String(r.priority||"").toLowerCase()==="high"?"red":"navy")}</td><td>${esc(text(r.assigned_to))}</td></tr>`).join("")}</tbody></table></div>` : empty("No open follow-ups.");
  const events = activity.length ? `<div class="crm-timeline">${activity.map(r=>`<div class="crm-event"><span class="crm-event-dot"></span><div class="crm-event-body"><strong>${esc(text(r.summary,r.action))}</strong><p>${esc(text(r.company_name,"CRM system activity"))}</p><div class="crm-event-meta">${esc(text(r.actor_user_name))} · ${esc(String(r.created_at||"").slice(0,16).replace("T"," "))}</div></div></div>`).join("")}</div>` : empty("No recent CRM activity.");
  const pipeline = opps.length ? opps.map(o=>`<div class="crm-opportunity-card"><strong>${esc(o.title)}</strong><span>${esc(o.company_name)}</span><span>${badge(o.stage,stageTone(o.stage))}</span><div class="value">${money(o.estimated_value,o.currency)}</div></div>`).join("") : empty("No open opportunities yet.");
  return shell(`
    <section class="crm-kpis">
      ${kpi("Assigned Accounts", s.accounts || 0, `${s.prospects || 0} prospects / leads`)}
      ${kpi("Open Opportunities", s.open_opportunities || 0, `${money(s.pipeline_value,"AED")} pipeline`)}
      ${kpi("Weighted Pipeline", money(s.weighted_pipeline,"AED"), "Value adjusted by probability")}
      ${kpi("Actions Due", s.actions_due || 0, "Next 7 days")}
    </section>
    <section class="crm-grid-2">${panel("Priority Follow-ups","Open tasks requiring attention",taskRows,`<button data-crm-action="new-task">New Follow-up</button>`)}${panel("Recent Activity","Immutable CRM audit trail",events)}</section>
    ${panel("Pipeline Snapshot","Most recent open opportunities",`<div class="crm-pipeline" style="grid-template-columns:repeat(3,minmax(230px,1fr))">${pipeline}</div>`,`<button data-crm-nav="Opportunities">Open Pipeline</button>`)}`,
    {title:"CRM Dashboard",subtitle:"Accounts remain company property. Sales access follows assignment and server-side permissions.",actions:`<button data-crm-action="new-account">New Account</button><button class="secondary-button" data-crm-action="new-visit">Schedule / Log Visit</button>`});
}

let accountSelection=new Set(),shownAccountIds=[],assignmentIds=null,assignmentLoading=false,assignmentError='';
function selectionBar(){return `<div class="crm-bulkbar" ${accountSelection.size?'':'hidden'}><strong>${accountSelection.size} selected</strong><button data-crm-action="bulk-accounts">Bulk actions</button><button class="secondary-button" data-crm-action="clear-selection">Clear selection</button><span>Uncheck any account to exclude it.</span></div>`;}
async function openBulkAccounts(){
 try {
  if(!accountSelection.size)return;
  const users=(await request('/users')).rows||[];const ids=[...accountSelection];
  modal('Update selected accounts',`<p class="wide">${ids.length} accounts selected. Blank fields stay unchanged. Active means an active customer.</p><label>Assign salesperson<select id="bulkOwner"><option value="">Keep existing</option>${users.map(u=>`<option value="${esc(u.user_name)}">${esc(u.user_name)}</option>`).join('')}</select></label><label>Entity<select id="bulkEntity"><option value="">Keep existing</option><option>DXB</option><option>KWI</option></select></label><label>Account status<select id="bulkStatus"><option value="">Keep existing</option><option>Prospect</option><option>Lead</option><option value="Active">Active customer</option><option>Dormant</option></select></label><p class="wide">A changed salesperson receives one summary email for this batch. Account access changes immediately.</p><div class="wide" id="bulkResult" role="status"></div>`,{saveLabel:'Apply changes'});
  const d=document.querySelector('#crmDialog'),form=d.querySelector('form');form.removeAttribute('data-crm-form');
  form.onsubmit=async e=>{e.preventDefault();const owner=d.querySelector('#bulkOwner').value,branch=d.querySelector('#bulkEntity').value,status=d.querySelector('#bulkStatus').value;
   if(!owner&&!branch&&!status)return;
   if(!confirm(`Update ${ids.length} accounts?${owner?' Salesperson: '+owner+'.':''}${branch?' Entity: '+branch+'.':''}${status?' Status: '+status+'.':''}`))return;
   const button=form.querySelector('[type="submit"]');button.disabled=true;
   try{const r=await request('/accounts/bulk',{method:'POST',body:JSON.stringify({ids,owner,branch,status})});accountSelection.clear();invalidate('accounts','contacts','opportunities','tasks','dashboard','activity','reports');
    d.querySelector('#bulkResult').textContent=`Saved ${r.count} accounts. ${mailResult(r.emailStatus)}`;form.onsubmit=e=>{e.preventDefault();d.close();refresh();};button.textContent='Done';
   }catch(error){d.querySelector('#bulkResult').textContent=error.message;}finally{button.disabled=false;}
  };
 }catch(e){crmFailed('Bulk update',e.message);}
}
function mailResult(status){return status==='accepted'?'Email accepted for sending.':status==='not_sent'?'Email was not sent. Assignment is saved; ask IT to check mail delivery.':'';}
function renderAccounts() {
  ensure("accounts","users");
  if (!cache.accounts) return shell(loading("accounts"), {title:"Accounts",subtitle:"Customer ownership is enforced by assignment, not by browser visibility."});
  const rows = cache.accounts.filter(r=>!assignmentIds||assignmentIds.has(String(r.id)));
  shownAccountIds=rows.map(r=>Number(r.id));
  for(const id of accountSelection)if(!shownAccountIds.includes(id))accountSelection.delete(id);
  const exportButton = `<button class="secondary-button" data-crm-action="database">Database import / export</button>` + (crmSession().crmExportAccess ? `<button class="secondary-button" data-crm-export="accounts">Export CSV</button>` : "");
  const table = rows.length ? `<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>${crmSession().crmManageAssignments&&crmSession().crmViewAllAccounts?`<input type="checkbox" data-account-all aria-label="Select all matching accounts" ${rows.length&&rows.every(r=>accountSelection.has(Number(r.id)))?'checked':''}>`:''}</th><th>No.</th><th>Account</th><th>Status</th><th>Owner</th><th>Industry</th><th>Territory</th><th>Potential</th><th>Next Action</th><th>Last Visit</th><th></th></tr></thead><tbody>${rows.map((r,index)=>`<tr><td>${crmSession().crmManageAssignments&&crmSession().crmViewAllAccounts?`<input type="checkbox" data-account-id="${r.id}" aria-label="Select ${esc(r.company_name)}" ${accountSelection.has(Number(r.id))?'checked':''}>`:''}</td><td>${index+1}</td><td><button class="crm-link crm-primary" data-crm-action="view-account" data-id="${r.id}">${esc(r.company_name)}</button><span class="crm-sub">${esc(r.account_code)}</span></td><td>${badge(r.status,statusTone(r.status))}</td><td>${ownerBadge(r)}</td><td>${esc(text(r.industry))}</td><td>${esc(text(r.territory||r.city))}</td><td>${money(r.potential_value,r.currency)}</td><td>${esc(text(r.next_action))}<span class="crm-sub">${date(r.next_action_date)}</span></td><td>${date(r.last_visit_date)}</td><td><button class="secondary-button" data-crm-action="edit-account" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : empty("No CRM accounts are assigned to this user yet.");
  return shell(`<div class="crm-toolbar"><div class="crm-toolbar-group"><label>Search<input class="crm-search" data-crm-filter="account-search" placeholder="Company, code, owner or city"></label><label>Status<select data-crm-filter="account-status"><option>All</option><option>Prospect</option><option>Lead</option><option>Active</option><option>Dormant</option></select></label></div><div class="crm-toolbar-group"><button data-crm-action="new-account">New Account</button>${exportButton}</div></div><p role="status"><strong>${rows.length.toLocaleString()} accounts match your filters</strong>${assignmentIds?' · Assignment email selection <button data-crm-action="clear-assignment">Show all accounts</button>':''}</p>${selectionBar()}${table}`,
  {title:"Accounts",subtitle:"Every account has an accountable sales owner. Sales executives can see only accounts assigned to them."});
}

function renderContacts() {
  ensure("contacts","accounts"); if(!cache.contacts) return shell(loading("contacts"),{title:"Contacts",subtitle:"Decision makers and operational contacts linked to company-owned accounts."});
  const rows=cache.contacts; const body=rows.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Account</th><th>Title</th><th>Email</th><th>Mobile</th><th>Influence</th><th>Primary</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td class="crm-primary">${esc(r.full_name)}</td><td>${esc(r.company_name)}<span class="crm-sub">${esc(r.account_code)}</span></td><td>${esc(text(r.job_title))}</td><td>${esc(text(r.email))}</td><td>${esc(text(r.mobile||r.whatsapp))}</td><td>${badge(r.influence_level||"Standard","navy")}</td><td>${r.is_primary?badge("Primary","green"):"—"}</td><td><button class="secondary-button" data-crm-action="edit-contact" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`:empty("No contacts recorded yet.");
  return shell(body,{title:"Contacts",subtitle:"Contacts inherit account ownership automatically, so reassignment immediately changes visibility.",actions:`<button data-crm-action="new-contact">New Contact</button>`});
}

function salespersonFilter(entity) {
  ensure("salespeople");
  const values = new Map();
  for (const row of cache.salespeople || []) if (row.entity === entity) values.set(String(row.salesperson).toLowerCase(),row.salesperson);
  for (const row of cache[entity] || []) { const name=entity==="visits"?row.created_by:(row.owner_user_name||row.assigned_to); if(name)values.set(String(name).toLowerCase(),name); }
  const current=salespersonFilters[entity];
  if(current)values.set(current.toLowerCase(),current);
  return `<div class="crm-toolbar"><label>Salesperson — ${entity==="visits"?"visit logged by":"opportunity owner"} <select data-crm-salesperson="${entity}"><option value="">All permitted salespeople</option>${[...values.values()].sort((a,b)=>a.localeCompare(b)).map(name=>`<option value="${esc(name)}" ${name.toLowerCase()===current.toLowerCase()?"selected":""}>${esc(name)}</option>`).join("")}</select></label></div>`;
}
function reviewButton(entity,id) { return `<button type="button" class="secondary-button" data-crm-action="review-record" data-entity="${entity}" data-id="${id}">Comments / Review</button>`; }

async function openReview(entity,id,notice="") {
  try {
    const result=await request(`/reviews/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`);
    const history=(result.rows||[]).map(row=>{
      const detail=typeof row.details_json==="string"?JSON.parse(row.details_json):row.details_json||{};
      return `<article class="crm-panel"><div class="crm-panel-body"><strong>${esc(row.actor_user_name)}</strong><span class="crm-sub">${esc(new Date(row.created_at).toLocaleString())} · To: ${esc(detail.recipient||"")}</span><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(detail.comment)}</p>${detail.dueDate?`<p>Follow-up date: ${esc(detail.dueDate)}</p>`:""}</div></article>`;
    }).join("")||empty("No review comments yet.");
    const canWrite=result.canComment&&result.recipient;
    modal(`Review: ${result.recordLabel}`,`
      <div class="wide"><strong>${esc(result.companyName)}</strong>${notice?`<p role="status">${esc(notice)}</p>`:""}${history}</div>
      ${canWrite?`<div class="wide crm-inline-note">Send to: <strong>${esc(result.recipient)}</strong>. This saves the comment, adds a CRM follow-up and sends an email.</div><label class="wide">Comment / requested follow-up<textarea name="comment" required maxlength="5000" rows="5"></textarea></label>${field("Follow-up date (optional)","dueDate","","date")}<input type="hidden" name="entity" value="${esc(entity)}"><input type="hidden" name="id" value="${esc(id)}">`:result.canComment?'<p class="wide">Assign an active CRM salesperson to this account before sending a comment.</p>':""}
    `,{formType:canWrite?"review-comment":"review-read",saveLabel:canWrite?"Send comment":"Close"});
  } catch(error) { crmFailed("Could not open review",error.message); }
}
async function sendReview(form,data) {
  const button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  button.disabled=true;button.textContent="Sending…";
  try {
    const result=await request(`/reviews/${encodeURIComponent(data.entity)}/${encodeURIComponent(data.id)}`,{method:"POST",body:JSON.stringify({comment:data.comment,dueDate:data.dueDate})});
    invalidate("tasks","dashboard","activity");
    await openReview(data.entity,data.id,result.message);
    refresh();
  } catch(error) { crmFailed("Comment could not be saved",error.message); }
  finally {button.disabled=false;button.textContent="Send comment";}
}

function renderOpportunities() {
  ensure("opportunities","accounts"); if(!cache.opportunities) return shell(loading("opportunities"),{title:"Opportunities",subtitle:"A freight-focused pipeline from qualification through won or lost."});
  const rows=cache.opportunities; const stages=["Qualification","Discovery","Proposal","Negotiation","Won"];
  const columns=stages.map(stage=>{const items=rows.filter(r=>String(r.stage||"").toLowerCase()===stage.toLowerCase() && String(r.status||"Open").toLowerCase()!=="lost"); const total=items.reduce((a,r)=>a+Number(r.estimated_value||0),0); return `<section class="crm-stage"><div class="crm-stage-head"><strong>${esc(stage)}</strong><span>${items.length} · ${money(total,"AED")}</span></div>${items.length?items.map(r=>`<div class="crm-opportunity-card" data-crm-action="edit-opportunity" data-id="${r.id}"><strong>${esc(r.title)}</strong><span>${esc(r.company_name)}</span><span>${esc(text(r.service_type))} · ${esc(text(r.origin,""))}${r.origin&&r.destination?" → ":""}${esc(text(r.destination,""))}</span><span>Owner: ${esc(text(r.owner_user_name||r.assigned_to))}</span><div class="value">${money(r.estimated_value,r.currency)} · ${Number(r.probability||0)}%</div>${reviewButton("opportunities",r.id)}</div>`).join(""):empty("No opportunities")}</section>`}).join("");
  const exportButton=crmSession().crmExportAccess?`<button class="secondary-button" data-crm-export="opportunities">Export CSV</button>`:"";
  return shell(`${panel("Pipeline Board","Drag-free by design: stage changes are recorded as auditable edits.",`<div class="crm-pipeline">${columns}</div>`)}${rows.some(r=>String(r.status||"").toLowerCase()==="lost")?panel("Lost Opportunities","Retained for analysis instead of being deleted",`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Opportunity</th><th>Account</th><th>Value</th><th>Reason</th><th>Owner</th><th></th></tr></thead><tbody>${rows.filter(r=>String(r.status||"").toLowerCase()==="lost").map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.company_name)}</td><td>${money(r.estimated_value,r.currency)}</td><td>${esc(text(r.lost_reason))}</td><td>${esc(text(r.owner_user_name))}</td><td>${reviewButton("opportunities",r.id)}</td></tr>`).join("")}</tbody></table></div>`):""}`,
  {title:"Opportunities",subtitle:"Pipeline value, probability, lanes, service type, competitor and next step are captured per opportunity.",actions:`<button data-crm-action="new-opportunity">New Opportunity</button>${exportButton}`});
}

function renderVisits() {
  ensure("visits","accounts","contacts","users"); if(!cache.visits) return shell(loading("visits"),{title:"Sales Visits",subtitle:"Planned visits, actual completion and follow-ups."});
 const rows=[...cache.visits].sort((a,b)=>String(a.visit_date).localeCompare(String(b.visit_date))||String(a.visit_time).localeCompare(String(b.visit_time))); const table=rows.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Scheduled / Actual</th><th>Account</th><th>Contact</th><th>Status / Type</th><th>Purpose</th><th>Outcome</th><th>Follow-up</th><th>Salesperson</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td class="crm-primary">${date(r.visit_date)}<span class="crm-sub">${esc(text(r.visit_time,""))}</span><span class="crm-sub">Actual: ${date(r.actual_visit_date)}</span></td><td>${esc(r.company_name)}</td><td>${esc(text(r.contact_name))}</td><td>${badge(r.visit_status||"Unclassified",statusTone(r.visit_status))}<span class="crm-sub">${esc(r.visit_type)}</span></td><td>${esc(text(r.purpose))}</td><td>${esc(text(r.outcome))}</td><td>${date(r.follow_up_date)}<span class="crm-sub">${esc(text(r.next_step,""))}</span></td><td>${esc(text(r.salesperson||r.created_by))}</td><td><button class="secondary-button" data-crm-action="edit-visit" data-id="${r.id}">Edit</button>${reviewButton("visits",r.id)}</td></tr>`).join("")}</tbody></table></div>`:empty("No visits match these filters.");
  return shell(table,{title:"Sales Visits",subtitle:"Visits stay attached to the account, even if the salesperson later leaves Apollo.",actions:`<button data-crm-action="new-visit">Schedule / Log Visit</button>`});
}

function renderMeetings() {
  ensure("meetings","accounts","contacts"); if(!cache.meetings) return shell(loading("meetings"),{title:"Meeting Minutes",subtitle:"Structured minutes, decisions and action items retained as company records."});
  const rows=cache.meetings; const cards=rows.length?`<div class="crm-grid-equal">${rows.map(r=>`<article class="crm-panel"><div class="crm-panel-head"><div><h3>${esc(r.subject)}</h3><p>${esc(r.company_name)} · ${date(r.meeting_date)} ${esc(text(r.meeting_time,""))}</p></div>${badge(r.meeting_type,"navy")}</div><div class="crm-panel-body"><p><strong>Attendees</strong><br>${esc(text(r.attendees))}</p><p><strong>Minutes</strong><br>${esc(text(r.minutes))}</p><p><strong>Decisions</strong><br>${esc(text(r.decisions))}</p><p><strong>Action Items</strong><br>${esc(text(r.action_items))}</p><div class="crm-panel-actions"><button class="secondary-button" data-crm-action="edit-meeting" data-id="${r.id}">Edit Minutes</button>${r.document_link?`<a href="${esc(r.document_link)}" target="_blank" rel="noopener">Open document</a>`:""}</div></div></article>`).join("")}</div>`:empty("No meeting minutes recorded yet.");
  return shell(cards,{title:"Meeting Minutes",subtitle:"Minutes are searchable and auditable, preventing relationship knowledge from walking out with an employee.",actions:`<button data-crm-action="new-meeting">New Minutes</button>`});
}

function renderTasks() {
  ensure("tasks","accounts","opportunities","users"); if(!cache.tasks) return shell(loading("tasks"),{title:"Follow-ups",subtitle:"A disciplined next-action queue for sales execution."});
  const rows=cache.tasks; const open=rows.filter(r=>String(r.status||"").toLowerCase()!=="completed"), completed=rows.filter(r=>String(r.status||"").toLowerCase()==="completed");
  const taskTable=list=>list.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Task</th><th>Account</th><th>Opportunity</th><th>Due</th><th>Priority</th><th>Assigned To</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td class="crm-primary">${esc(r.title)}<span class="crm-sub">${esc(text(r.description,""))}</span></td><td>${esc(text(r.company_name))}</td><td>${esc(text(r.opportunity_title))}</td><td>${date(r.due_date)}</td><td>${badge(r.priority,String(r.priority||"").toLowerCase()==="high"?"red":"navy")}</td><td>${esc(text(r.assigned_to))}</td><td>${badge(r.status,statusTone(r.status))}</td><td>${String(r.status||"").toLowerCase()!=="completed"?`<button class="crm-success" data-crm-action="complete-task" data-id="${r.id}">Complete</button>`:""}<button class="secondary-button" data-crm-action="edit-task" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`:empty("None.");
  return shell(`${panel("Open Follow-ups",`${open.length} items requiring action`,taskTable(open))}${panel("Completed","Retained for accountability and performance review",taskTable(completed))}`,
  {title:"Follow-ups",subtitle:"Tasks can be assigned by management, while sales executives remain limited to their own customer universe.",actions:`<button data-crm-action="new-task">New Follow-up</button>`});
}

function renderActivity() {
  ensure("activity"); if(!cache.activity) return shell(loading("activity"),{title:"Activity Timeline",subtitle:"A permanent history of CRM changes and relationship activity."});
  const rows=cache.activity; const body=rows.length?`<div class="crm-timeline">${rows.map(r=>`<div class="crm-event"><span class="crm-event-dot"></span><div class="crm-event-body"><strong>${esc(text(r.summary,r.action))}</strong><p>${esc(text(r.company_name,"System / permission event"))}</p><div class="crm-event-meta">${esc(r.entity_type)} #${esc(r.entity_id)} · ${esc(r.actor_user_name)} · ${esc(String(r.created_at||"").slice(0,16).replace("T"," "))}</div></div></div>`).join("")}</div>`:empty("No CRM activity recorded yet.");
  return shell(panel("Audit Timeline","Creates, edits, reassignments, archives and permission changes",body),{title:"Activity Timeline",subtitle:"Sales records are not silently overwritten; key changes create audit entries."});
}

function renderReports() {
  ensure("reports"); if(!cache.reports) return shell(loading("reports"),{title:"CRM Reports",subtitle:"Pipeline and activity visibility for management and individual sales users."});
  const r=cache.reports; const owners=r.byOwner||[], stages=r.byStage||[], sources=r.bySource||[];
  const ownerTable=owners.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Salesperson</th><th>Accounts</th><th>Open Opportunities</th><th>Pipeline</th><th>Visits (30d)</th><th>Meetings (30d)</th></tr></thead><tbody>${owners.map(x=>`<tr><td class="crm-primary">${esc(x.assigned_to)}</td><td>${x.accounts}</td><td>${x.open_opportunities}</td><td>${money(x.pipeline_value,"AED")}</td><td>${x.visits}</td><td>${x.meetings}</td></tr>`).join("")}</tbody></table></div>`:empty("No report data yet.");
  const stageBody=stages.length?stages.map(x=>`<div class="crm-kpi"><div class="crm-kpi-label">${esc(x.stage)}</div><div class="crm-kpi-value">${x.opportunities}</div><div class="crm-kpi-note">${money(x.value,"AED")}</div></div>`).join(""):empty("No pipeline stages yet.");
  const sourceBody=sources.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead Source</th><th>Accounts</th></tr></thead><tbody>${sources.map(x=>`<tr><td>${esc(x.source)}</td><td>${x.accounts}</td></tr>`).join("")}</tbody></table></div>`:empty("No lead source data yet.");
  return shell(`${panel("Sales Ownership & Activity","Accounts and 30-day relationship activity",ownerTable)}<section class="crm-grid-2">${panel("Pipeline by Stage","Open opportunity distribution",`<section class="crm-kpis" style="grid-template-columns:repeat(2,1fr)">${stageBody}</section>`)}${panel("Lead Sources","Where target accounts originated",sourceBody)}</section>`,{title:"CRM Reports",subtitle:"Management can compare account ownership, pipeline and client-contact discipline without exporting the database."});
}

function renderTeam() {
  ensure("users","accounts"); if(!cache.users||!cache.accounts) return shell(loading(!cache.users?"users":"accounts"),{title:"Team & Assignments",subtitle:"Reassign company accounts without losing any history when staff changes."});
  const users=cache.users, accounts=cache.accounts; const counts=new Map(); accounts.forEach(a=>counts.set(String(a.assigned_to||"").toLowerCase(),(counts.get(String(a.assigned_to||"").toLowerCase())||0)+1));
  const userCards=users.map(u=>`<article class="crm-panel"><div class="crm-panel-head"><div><h3>${esc(u.user_name)}</h3><p>${esc(text(u.crm_role,"Sales Executive"))} · ${esc(text(u.branch_access))}</p></div>${badge(`${counts.get(String(u.user_name||"").toLowerCase())||0} accounts`,"orange")}</div><div class="crm-panel-body"><span class="crm-inline-note">${esc(text(u.email,"No email"))}</span></div></article>`).join("");
  const options=users.map(u=>`<option value="${esc(u.user_name)}">${esc(u.user_name)} — ${esc(text(u.crm_role,"Sales Executive"))}</option>`).join("");
  return shell(`<div class="crm-security-callout"><div class="crm-security-icon">A</div><div><strong>Account ownership survives employee departure.</strong><p>Reassignment changes future visibility immediately, while contacts, visits, meetings, opportunities and audit history remain with Apollo.</p></div></div><section class="crm-grid-equal">${userCards}</section>${panel("Bulk Account Reassignment","Use this before disabling a salesperson account.",`<form class="crm-form-grid" data-crm-form="reassign"><label>Current owner<select name="fromUser" required><option value="">Select salesperson</option>${options}</select></label><label>New owner<select name="toUser" required><option value="">Select replacement</option>${options}</select></label><div class="wide crm-inline-note">All active accounts belonging to the current owner will move to the new owner. The reassignment is written to the CRM audit trail.</div><div class="wide crm-form-actions"><button type="submit">Reassign Accounts</button></div></form>`)}`,
  {title:"Team & Assignments",subtitle:"Central ownership control prevents customer information from being tied to an individual employee."});
}

function renderAdmin() {
  ensure("adminUsers"); if(!cache.adminUsers) return shell(loading("adminUsers"),{title:"CRM Security",subtitle:"Management controls who can enter the CRM and what each user can see, export or administer."});
  const rows=cache.adminUsers;
  const matrix=`<div class="crm-permission-matrix"><div class="crm-permission-row header"><div>User</div><div>CRM</div><div>All Accounts</div><div>Assign</div><div>Export</div><div>Archive</div><div>Admin</div></div>${rows.map(u=>`<div class="crm-permission-row"><div class="user-cell"><strong>${esc(u.user_name)}</strong><span>${esc(text(u.crm_role,u.role))}</span></div><div>${u.crm_portal_access||String(u.role).toLowerCase()==="admin"?badge("Yes","green"):badge("No","red")}</div><div>${bool(u.crm_view_all_accounts)?badge("Yes","green"):"—"}</div><div>${bool(u.crm_manage_assignments)?badge("Yes","green"):"—"}</div><div>${bool(u.crm_export_access)?badge("Yes","green"):"—"}</div><div>${bool(u.crm_archive_access)?badge("Yes","green"):"—"}</div><div><button class="secondary-button" data-crm-action="edit-permissions" data-user="${esc(u.user_name)}">Edit</button></div></div>`).join("")}</div>`;
  return shell(`<div class="crm-security-callout"><div class="crm-security-icon">S</div><div><strong>Server-side permissions, not hidden buttons.</strong><p>Assigned-account filtering, exports, reassignments, archives and CRM administration are enforced by the API. A salesperson cannot bypass the screen by typing a URL.</p></div></div>${panel("CRM Permission Matrix","Company Management controls each capability independently",matrix)}${panel("Recommended Sales Executive Profile","Use this default for ordinary sales staff",`<div class="crm-grid-equal"><div><strong>Allowed</strong><p class="crm-inline-note">CRM login, assigned accounts, contacts, opportunities, visits, meeting minutes and own follow-ups.</p></div><div><strong>Blocked</strong><p class="crm-inline-note">Other sales accounts, bulk reassignment, exports/downloads, archiving and CRM security administration.</p></div></div>`)}`,
  {title:"CRM Security",subtitle:"The owner retains customer control even when staff changes."});
}

function accountOptions(selected="") { return (cache.accounts||[]).map(a=>`<option value="${a.id}" ${String(a.id)===String(selected)?"selected":""}>${esc(a.company_name)} (${esc(a.account_code)})</option>`).join(""); }
function userOptions(selected="") { const users=cache.users||[]; return users.map(u=>`<option value="${esc(u.user_name)}" ${String(u.user_name).toLowerCase()===String(selected).toLowerCase()?"selected":""}>${esc(u.user_name)}</option>`).join(""); }
function contactOptions(selected="", accountId="") { return (cache.contacts||[]).filter(c=>!accountId || String(c.account_id)===String(accountId)).map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?"selected":""}>${esc(c.full_name)}${c.company_name?` · ${esc(c.company_name)}`:""}</option>`).join(""); }
function contactsForAccount(accountId, selected="") { return (cache.contacts||[]).filter(c=>String(c.account_id)===String(accountId)).map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?"selected":""}>${esc(c.full_name)}</option>`).join(""); }
function field(label,name,value="",type="text",wide=false,extra="") { return `<label class="${wide?"wide":""}">${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value??"")}" ${extra}></label>`; }
function textarea(label,name,value="",wide=true) { return `<label class="${wide?"wide":""}">${esc(label)}<textarea name="${esc(name)}">${esc(value??"")}</textarea></label>`; }
function select(label,name,options,value="",wide=false) { return `<label class="${wide?"wide":""}">${esc(label)}<select name="${esc(name)}">${options.map(o=>{const v=typeof o==="string"?o:o.value,l=typeof o==="string"?o:o.label;return `<option value="${esc(v)}" ${String(v)===String(value)?"selected":""}>${esc(l)}</option>`}).join("")}</select></label>`; }

function modal(title, body, {saveLabel="Save", formType=""}={}) {
  let d=document.querySelector("#crmDialog"); if(!d){d=document.createElement("dialog");d.id="crmDialog";d.className="record-dialog crm-dialog";document.body.appendChild(d);}
  d.innerHTML=`<form method="dialog" data-crm-form="${esc(formType)}"><div class="dialog-header"><div><p class="eyebrow">Apollo Connected CRM</p><h2>${esc(title)}</h2></div><button type="button" class="window-control-button window-control-close" data-crm-close>×</button></div><div class="dialog-body"><div class="crm-form-grid">${body}</div></div><div class="dialog-actions"><button type="button" class="secondary-button" data-crm-close>Cancel</button><button type="submit">${esc(saveLabel)}</button></div></form>`;
  d.querySelectorAll("[data-crm-close]").forEach(b=>b.addEventListener("click",()=>d.close()));
  d.showModal();
}

async function openDatabase(){
  try{
    const me=(await request('/me')); const perms=me.permissions||me.user?.permissions||cache.me?.permissions||{};
    const manage=crmSession().crmManageAssignments&&crmSession().crmViewAllAccounts;
    const users=manage?(await request('/users')).rows:[];
    modal('CRM database',`<div class="wide">Companies and contacts only. Existing details are kept. Matching uses company name + entity; identical contacts are skipped.</div>
      ${crmSession().crmExportAccess?'<button type="button" id="dbExport">Download database Excel</button>':''}
      ${manage?`<label>Excel / CSV<input id="dbFile" type="file" accept=".xlsx,.xls,.csv"></label><label>Header row<input id="dbHeader" type="number" min="1" value="1"></label><label>Worksheet<select id="dbSheet"></select></label><button type="button" id="dbRead">Read columns</button><div id="dbMap" class="wide"></div><label>Salesperson<select id="dbOwner"><option value="">Keep existing (bulk only)</option>${(users||[]).map(u=>`<option value="${esc(u.user_name)}">${esc(u.user_name)}</option>`).join('')}</select></label><label>Entity<select id="dbBranch"><option value="">Keep existing (bulk only)</option><option>DXB</option><option>KWI</option></select></label><button type="button" id="dbPreview">Preview import</button><button type="button" id="dbCommit" disabled>Confirm import</button><hr class="wide"><button type="button" id="dbAccounts">Load accounts for bulk assignment</button><input id="dbSearch" placeholder="Filter company, owner or entity"><div id="dbList" class="wide" style="max-height:260px;overflow:auto"></div><button type="button" id="dbAssign">Apply owner / entity to selected accounts</button>`:''}<pre id="dbStatus" class="wide" style="white-space:pre-wrap"></pre>`,{saveLabel:'Close'});
    const d=document.querySelector('#crmDialog');const el=id=>d.querySelector('#'+id);d.querySelector('form').removeAttribute('data-crm-form');d.querySelector('form').onsubmit=e=>{e.preventDefault();d.close();refresh();};
    let upload=null,approved=null,accounts=[],selected=new Set();
    const status=v=>el('dbStatus').textContent=typeof v==='string'?v:JSON.stringify(v,null,2);
    const run=(id,fn)=>{if(el(id))el(id).onclick=async()=>{const b=el(id);b.disabled=true;try{await fn();}catch(e){status(id==='dbCommit'?'Import confirmation failed or response was lost. Check Accounts before retrying. '+e.message:e.message);el('dbStatus')?.scrollIntoView({block:'center'});}finally{if(id!=='dbCommit')b.disabled=false;}};};
    run('dbExport',async()=>{const r=await request('/database/export');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='Apollo_CRM_Database.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    if(!manage)return;
    const payload=()=>({...upload,sheet:el('dbSheet').value||undefined,header:Number(el('dbHeader').value),mapping:Object.fromEntries([...d.querySelectorAll('[data-db-field]')].map(s=>[s.dataset.dbField,Number(s.value)])),owner:el('dbOwner').value,branch:el('dbBranch').value});
    const clear=()=>{approved=null;el('dbCommit').disabled=true;};d.addEventListener('change',clear);
    run('dbRead',async()=>{clear();const f=el('dbFile').files[0];if(!f)throw Error('Choose a file.');if(f.size>5*1024*1024)throw Error('Maximum 5 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});const changed=upload?.fileName!==f.name;upload={fileName:f.name,data};const p=await request('/database/inspect',{method:'POST',body:JSON.stringify({...upload,header:Number(el('dbHeader').value),sheet:changed?undefined:el('dbSheet').value||undefined})});el('dbSheet').innerHTML=p.sheets.map(s=>`<option ${s===p.sheet?'selected':''}>${esc(s)}</option>`).join('');el('dbMap').innerHTML=p.fields.map(field=>`<label style="display:inline-block;margin:8px">${esc(field)}<select data-db-field="${field}"><option value="-1">Ignore</option>${p.headers.map((h,i)=>`<option value="${i}" ${String(h).toLowerCase()===field?'selected':''}>${esc(h)} (column ${i+1})</option>`).join('')}</select></label>`).join('');status({rows:p.count,sample:p.sample});});
    run('dbPreview',async()=>{clear();if(!upload)throw Error('Read columns first.');const p=payload();const result=await request('/database/import',{method:'POST',body:JSON.stringify(p)});approved=JSON.stringify(p);status(result);el('dbCommit').disabled=false;});
    run('dbCommit',async()=>{if(!approved||approved!==JSON.stringify(payload()))throw Error('Preview the current settings first.');const result=await request('/database/import',{method:'POST',body:JSON.stringify({...JSON.parse(approved),commit:true})});clear();status(`IMPORT COMPLETE — ${result.rows} rows processed.\n${result.accountsAdded} new accounts; ${result.contactsAdded} new contacts; ${result.contactsSkipped} duplicate contacts skipped.\nYou can close this window. Existing account ownership was kept.`);el('dbStatus').scrollIntoView({block:'center'});window.alert(`Import complete: ${result.accountsAdded} new accounts and ${result.contactsAdded} new contacts saved.`);invalidate('accounts','contacts','dashboard','activity');});
    function draw(){const q=el('dbSearch').value.toLowerCase();const filtered=accounts.filter(a=>[a.company_name,a.branch,a.assigned_to].join(' ').toLowerCase().includes(q));el('dbList').innerHTML=`<label><input type="checkbox" id="dbAll"> Select all ${filtered.length} filtered accounts</label><p>${selected.size} selected</p>`+filtered.map(a=>`<label style="display:block"><input type="checkbox" data-db-id="${a.id}" ${selected.has(Number(a.id))?'checked':''}> ${esc(a.company_name)} · ${esc(a.branch)} · ${esc(a.assigned_to)}</label>`).join('');el('dbAll').checked=filtered.length>0&&filtered.every(a=>selected.has(Number(a.id)));el('dbAll').indeterminate=filtered.some(a=>selected.has(Number(a.id)))&&!el('dbAll').checked;el('dbAll').onchange=e=>{filtered.forEach(a=>e.target.checked?selected.add(Number(a.id)):selected.delete(Number(a.id)));draw();};el('dbList').querySelectorAll('[data-db-id]').forEach(c=>c.onchange=()=>{c.checked?selected.add(Number(c.dataset.dbId)):selected.delete(Number(c.dataset.dbId));draw();});}
    el('dbSearch').oninput=draw;
    run('dbAccounts',async()=>{accounts=(await request('/database/accounts')).rows;selected.clear();draw();});
    run('dbAssign',async()=>{if(!selected.size)throw Error('Select accounts first.');if(!confirm(`Update ${selected.size} selected accounts?`))return;status(await request('/database/assign',{method:'POST',body:JSON.stringify({ids:[...selected],owner:el('dbOwner').value,branch:el('dbBranch').value})}));accounts=(await request('/database/accounts')).rows;selected.clear();draw();invalidate('accounts','contacts','tasks','opportunities','activity');refresh();});
  }catch(e){crmFailed('Database',e.message);}
}
function recordBy(key,id){return (cache[key]||[]).find(r=>String(r.id)===String(id));}

function openAccount(id=null){ const r=id?recordBy("accounts",id):{}; const canAssign=crmSession().crmManageAssignments; ensure("users"); modal(id?`Edit ${r.company_name}`:"New CRM Account",`
  ${field("Company Name","companyName",r.company_name||"")}${field("Legal Name","legalName",r.legal_name||"")}
  ${select("Status","status",["Prospect","Lead","Active","Dormant"],r.status||"Prospect")}${select("Relationship Health","relationshipHealth",["New","Strong","Stable","At Risk"],r.relationship_health||"New")}
  ${field("Industry","industry",r.industry||"")}${field("Segment","segment",r.segment||"")}
  ${field("Branch","branch",r.branch||"")}${field("Territory","territory",r.territory||"")}
  ${canAssign?`<label>Assigned Salesperson<select name="assignedTo"><option value="${esc(r.assigned_to||crmSession().userName)}">${esc(r.assigned_to||crmSession().userName)}</option>${userOptions(r.assigned_to||crmSession().userName)}</select></label>`:`<input type="hidden" name="assignedTo" value="${esc(r.assigned_to||crmSession().userName)}">`}
  ${field("Lead Source","source",r.source||"")}${field("Country","country",r.country||"")}${field("City","city",r.city||"")}
  ${field("Phone","phone",r.phone||"")}${field("Email","email",r.email||"","email")}${field("Website","website",r.website||"")}
  ${field("Potential Value","potentialValue",r.potential_value||0,"number")}${select("Currency","currency",["AED","KWD","USD","EUR","SAR"],r.currency||"AED")}
  ${field("Estimated Monthly Shipments","estimatedMonthlyShipments",r.estimated_monthly_shipments||0,"number")}${field("Next Action Date","nextActionDate",date(r.next_action_date)==="—"?"":date(r.next_action_date),"date")}
  ${textarea("Services of Interest","servicesInterest",r.services_interest||"")}${textarea("Trade Lanes","tradeLanes",r.trade_lanes||"")}${textarea("Next Action","nextAction",r.next_action||"")}${textarea("Address","address",r.address||"")}${textarea("Notes","notes",r.notes||"")}
  <input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"account",saveLabel:id?"Save Account":"Create Account"}); }

function openContact(id=null){const r=id?recordBy("contacts",id):{}; modal(id?`Edit ${r.full_name}`:"New Contact",`
  <label>Account<select name="accountId" required><option value="">Select account</option>${accountOptions(r.account_id)}</select></label>${field("Full Name","fullName",r.full_name||"","text",false,"required")}
  ${field("Job Title","jobTitle",r.job_title||"")}${field("Department","department",r.department||"")}${field("Email","email",r.email||"","email")}${field("Mobile","mobile",r.mobile||"")}${field("WhatsApp","whatsapp",r.whatsapp||"")}${field("LinkedIn","linkedin",r.linkedin||"")}
  ${select("Influence","influenceLevel",["Standard","Influencer","Decision Maker","Economic Buyer"],r.influence_level||"Standard")}${select("Preferred Contact","preferredContactMethod",["Email","Phone","WhatsApp","In Person"],r.preferred_contact_method||"Email")}
  ${select("Primary Contact","isPrimary",[{value:"false",label:"No"},{value:"true",label:"Yes"}],String(Boolean(r.is_primary)))}${textarea("Notes","notes",r.notes||"")}<input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"contact",saveLabel:id?"Save Contact":"Create Contact"});}

function openOpportunity(id=null){const r=id?recordBy("opportunities",id):{}; modal(id?`Edit ${r.opportunity_no}`:"New Opportunity",`
  <label>Account<select name="accountId" required><option value="">Select account</option>${accountOptions(r.account_id)}</select></label>${field("Opportunity Title","title",r.title||"","text",false,"required")}
  ${select("Stage","stage",["Qualification","Discovery","Proposal","Negotiation","Won"],r.stage||"Qualification")}${select("Status","status",["Open","Won","Lost"],r.status||"Open")}
  ${field("Service Type","serviceType",r.service_type||"")}${field("Origin","origin",r.origin||"")}${field("Destination","destination",r.destination||"")}
  ${field("Estimated Value","estimatedValue",r.estimated_value||0,"number")}${select("Currency","currency",["AED","KWD","USD","EUR","SAR"],r.currency||"AED")}${field("Probability %","probability",r.probability??25,"number")}
  ${field("Expected Close","expectedCloseDate",date(r.expected_close_date)==="—"?"":date(r.expected_close_date),"date")}${field("Competitor","competitor",r.competitor||"")}${field("Next Step Date","nextStepDate",date(r.next_step_date)==="—"?"":date(r.next_step_date),"date")}
  ${textarea("Next Step","nextStep",r.next_step||"")}${textarea("Lost Reason","lostReason",r.lost_reason||"")}${textarea("Notes","notes",r.notes||"")}<input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"opportunity",saveLabel:id?"Save Opportunity":"Create Opportunity"});}

function openVisit(id=null){const r=id?recordBy("visits",id):{}; ensure("users"); modal(id?"Edit Sales Visit":"Schedule / Log Visit",`
  ${select("Visit Status","visitStatus",["Planned","Completed","Cancelled","No-show","Unclassified"],r.visit_status||"Planned")}
  ${field("Actual Visit Date (completed only)","actualVisitDate",date(r.actual_visit_date)==="—"?"":date(r.actual_visit_date),"date")}
  <label>Salesperson<select name="salesperson"><option value="${esc(r.salesperson||r.created_by||crmSession().userName)}">${esc(r.salesperson||r.created_by||crmSession().userName)}</option>${crmSession().crmManageAssignments?userOptions():''}</select></label>
  <label>Account<select name="accountId" required><option value="">Select account</option>${accountOptions(r.account_id)}</select></label><label>Client Contact<select name="contactId"><option value="">No contact selected</option>${contactOptions(r.contact_id,r.account_id)}</select></label>${field("Scheduled Date","visitDate",date(r.visit_date)==="—"?today():date(r.visit_date),"date")}
  ${field("Visit Time","visitTime",r.visit_time||"","time")}${select("Visit Type","visitType",["Client Visit","Site Visit","Coffee / Relationship","Presentation","Tender Meeting"],r.visit_type||"Client Visit")}
  ${field("Location","location",r.location||"")}${field("Attendees","attendees",r.attendees||"")}${textarea("Purpose","purpose",r.purpose||"")}${textarea("Outcome","outcome",r.outcome||"")}${field("Follow-up Date","followUpDate",date(r.follow_up_date)==="—"?"":date(r.follow_up_date),"date")}${textarea("Next Step","nextStep",r.next_step||"")}${textarea("Notes","notes",r.notes||"")}<input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"visit",saveLabel:id?"Save Visit":"Log Visit"});}

function openMeeting(id=null){const r=id?recordBy("meetings",id):{}; modal(id?"Edit Meeting Minutes":"New Meeting Minutes",`
  <label>Account<select name="accountId" required><option value="">Select account</option>${accountOptions(r.account_id)}</select></label><label>Client Contact<select name="contactId"><option value="">No contact selected</option>${contactOptions(r.contact_id,r.account_id)}</select></label>${field("Meeting Date","meetingDate",date(r.meeting_date)==="—"?today():date(r.meeting_date),"date")}
  ${field("Meeting Time","meetingTime",r.meeting_time||"","time")}${select("Meeting Type","meetingType",["In Person","Teams / Zoom","Phone","Tender / Formal Review"],r.meeting_type||"In Person")}
  ${field("Subject","subject",r.subject||"","text",false,"required")}${field("Attendees","attendees",r.attendees||"")}${textarea("Minutes","minutes",r.minutes||"")}${textarea("Decisions","decisions",r.decisions||"")}${textarea("Action Items","actionItems",r.action_items||"")}${field("Follow-up Date","followUpDate",date(r.follow_up_date)==="—"?"":date(r.follow_up_date),"date")}${field("Document Link","documentLink",r.document_link||"")}
  <input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"meeting",saveLabel:id?"Save Minutes":"Save Minutes"});}

function openTask(id=null){const r=id?recordBy("tasks",id):{}; modal(id?"Edit Follow-up":"New Follow-up",`
  <label>Account<select name="accountId"><option value="">No account / internal task</option>${accountOptions(r.account_id)}</select></label>${field("Task","title",r.title||"","text",false,"required")}
  ${field("Due Date","dueDate",date(r.due_date)==="—"?"":date(r.due_date),"date")}${select("Priority","priority",["Low","Normal","High","Critical"],r.priority||"Normal")}
  ${select("Status","status",["Open","In Progress","Waiting","Completed"],r.status||"Open")}${crmSession().crmManageAssignments?`<label>Assigned To<select name="assignedTo"><option value="${esc(r.assigned_to||crmSession().userName)}">${esc(r.assigned_to||crmSession().userName)}</option>${userOptions(r.assigned_to||crmSession().userName)}</select></label>`:`<input type="hidden" name="assignedTo" value="${esc(r.assigned_to||crmSession().userName)}">`}
  ${textarea("Description","description",r.description||"")}<input type="hidden" name="id" value="${esc(id||"")}">`,{formType:"task",saveLabel:id?"Save Follow-up":"Create Follow-up"});}

function openPermissions(userName){const r=(cache.adminUsers||[]).find(u=>u.user_name===userName)||{}; modal(`CRM Permissions — ${userName}`,`
  ${select("CRM Access","crmPortalAccess",[{value:"false",label:"Disabled"},{value:"true",label:"Enabled"}],String(bool(r.crm_portal_access)))}${select("CRM Role","crmRole",["Sales Executive","Senior Sales","Sales Manager","Commercial Manager","Management"],r.crm_role||"Sales Executive")}
  ${select("View All Accounts","crmViewAllAccounts",[{value:"false",label:"Assigned accounts only"},{value:"true",label:"All CRM accounts"}],String(bool(r.crm_view_all_accounts)))}${select("Manage Assignments","crmManageAssignments",[{value:"false",label:"No"},{value:"true",label:"Yes"}],String(bool(r.crm_manage_assignments)))}
  ${select("Export / Download","crmExportAccess",[{value:"false",label:"Blocked"},{value:"true",label:"Allowed"}],String(bool(r.crm_export_access)))}${select("Archive Accounts","crmArchiveAccess",[{value:"false",label:"Blocked"},{value:"true",label:"Allowed"}],String(bool(r.crm_archive_access)))}
  ${select("Team Reports","crmViewTeamReports",[{value:"false",label:"Own / scoped reports"},{value:"true",label:"Team reports"}],String(bool(r.crm_view_team_reports)))}${select("CRM Admin","crmAdminAccess",[{value:"false",label:"No"},{value:"true",label:"Yes — security control"}],String(bool(r.crm_admin_access)))}
  <input type="hidden" name="userName" value="${esc(userName)}"><div class="wide crm-inline-note">For ordinary sales users, keep View All, Manage Assignments, Export, Archive and CRM Admin disabled.</div>`,{formType:"permissions",saveLabel:"Save Permissions"});}

function openAccountView(id){const a=recordBy("accounts",id);if(!a)return; const c=(cache.contacts||[]).filter(x=>String(x.account_id)===String(id)); const o=(cache.opportunities||[]).filter(x=>String(x.account_id)===String(id)); const v=(cache.visits||[]).filter(x=>String(x.account_id)===String(id)); const m=(cache.meetings||[]).filter(x=>String(x.account_id)===String(id)); modal(a.company_name,`<div class="wide crm-account-banner"><div><h3>${esc(a.company_name)}</h3><div class="crm-account-meta">${badge(a.status,statusTone(a.status))}${badge(a.relationship_health||"New","navy")}<span>${esc(text(a.industry))}</span><span>${esc(text(a.city))}</span></div></div><div class="crm-account-owner"><span>Assigned Salesperson</span><strong>${esc(a.assigned_to)}</strong></div></div><div class="wide crm-grid-equal"><div><strong>Services / lanes</strong><p>${esc(text(a.services_interest))}</p><p>${esc(text(a.trade_lanes))}</p></div><div><strong>Commercial potential</strong><p>${money(a.potential_value,a.currency)}</p><p>${Number(a.estimated_monthly_shipments||0)} est. monthly shipments</p></div></div><div class="wide"><strong>Relationship record</strong><p>${c.length} contacts · ${o.length} opportunities · ${v.length} visits · ${m.length} meeting minutes</p><p><strong>Next action:</strong> ${esc(text(a.next_action))} · ${date(a.next_action_date)}</p></div>`,{formType:"view-account",saveLabel:"Close"}); const d=document.querySelector("#crmDialog"); const form=d.querySelector("form"); form.addEventListener("submit",e=>{e.preventDefault();d.close();},{once:true}); }

async function submitForm(form){const type=form.dataset.crmForm; if(!type||type==="view-account")return; const data=Object.fromEntries(new FormData(form).entries()); const d=document.querySelector("#crmDialog"); try{
  if(type==="review-read"){d?.close();return;}
  if(type==="review-comment"){await sendReview(form,data);return;}
  let path,method="POST",payload={...data};
  if(type==="account"){path=data.id?`/accounts/${data.id}`:"/accounts";method=data.id?"PUT":"POST";delete payload.id;}
  else if(type==="contact"){path=data.id?`/contacts/${data.id}`:"/contacts";method=data.id?"PUT":"POST";delete payload.id;payload.isPrimary=data.isPrimary==="true";}
  else if(type==="opportunity"){path=data.id?`/opportunities/${data.id}`:"/opportunities";method=data.id?"PUT":"POST";delete payload.id;}
  else if(type==="visit"){path=data.id?`/visits/${data.id}`:"/visits";method=data.id?"PUT":"POST";delete payload.id;}
  else if(type==="meeting"){path=data.id?`/meetings/${data.id}`:"/meetings";method=data.id?"PUT":"POST";delete payload.id;}
  else if(type==="task"){path=data.id?`/tasks/${data.id}`:"/tasks";method=data.id?"PUT":"POST";delete payload.id;}
  else if(type==="permissions"){path=`/admin/users/${encodeURIComponent(data.userName)}`;method="PUT";delete payload.userName; for(const k of ["crmPortalAccess","crmViewAllAccounts","crmManageAssignments","crmExportAccess","crmArchiveAccess","crmViewTeamReports","crmAdminAccess"])payload[k]=payload[k]==="true";}
  else if(type==="reassign"){path="/reassign";payload=data;}
  else return;
  const saved=await request(path,{method,body:JSON.stringify(payload)}); d?.close(); invalidate("dashboard","accounts","contacts","opportunities","visits","meetings","tasks","activity","reports","users","adminUsers","salespeople"); refresh();
  crmSuccess("CRM saved", "The CRM record was saved successfully. "+mailResult(saved.emailStatus));
  if(saved.emailStatus==="not_sent")window.alert("Record saved. "+mailResult(saved.emailStatus));
 }catch(error){crmFailed("CRM save failed", error.message);}}

async function completeTask(id){const r=recordBy("tasks",id);if(!r)return;try{await request(`/tasks/${id}`,{method:"PUT",body:JSON.stringify({status:"Completed",title:r.title,description:r.description,dueDate:date(r.due_date)==="—"?null:date(r.due_date),priority:r.priority,assignedTo:r.assigned_to})});invalidate("dashboard","tasks","activity","reports");refresh();crmSuccess("Task completed", "The CRM follow-up was marked completed.");}catch(error){crmFailed("Task update failed", error.message)}}
async function doReassign(form){await submitForm(form);}
async function exportEntity(entity){try{const response=await request(`/export/${entity}${salespersonFilters[entity]?`?salesperson=${encodeURIComponent(salespersonFilters[entity])}`:""}`);const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`apollo-crm-${entity}-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);crmSuccess("Export ready", `${entity} data was downloaded.`);}catch(error){crmFailed("Export failed", error.message)}}

function bind(){
  document.addEventListener("click",event=>{
    const nav=event.target.closest("[data-crm-nav]"); if(nav){const button=[...document.querySelectorAll("#moduleNav button")].find(b=>b.dataset.module===nav.dataset.crmNav);button?.click();return;}
    const exp=event.target.closest("[data-crm-export]"); if(exp){exportEntity(exp.dataset.crmExport);return;}
    const b=event.target.closest("[data-crm-action]"); if(!b)return; const id=b.dataset.id; const action=b.dataset.crmAction;
    if(action==="bulk-accounts"){openBulkAccounts();return;}
    if(action==="clear-selection"){accountSelection.clear();refresh();return;}
    if(action==="clear-assignment"){assignmentIds=null;assignmentError='';history.replaceState(null,"",location.pathname);refresh();return;}
    if(action==="database"){openDatabase();return;}
    if(action==="review-record"){openReview(b.dataset.entity,id);return;}
    if(action==="new-account")openAccount();else if(action==="edit-account")openAccount(id);else if(action==="view-account"){ensure("contacts","opportunities","visits","meetings");setTimeout(()=>openAccountView(id),cache.contacts&&cache.opportunities&&cache.visits&&cache.meetings?0:500)}
    else if(action==="new-contact")openContact();else if(action==="edit-contact")openContact(id);else if(action==="new-opportunity")openOpportunity();else if(action==="edit-opportunity")openOpportunity(id);
    else if(action==="new-visit")openVisit();else if(action==="edit-visit")openVisit(id);else if(action==="new-meeting")openMeeting();else if(action==="edit-meeting")openMeeting(id);
    else if(action==="new-task")openTask();else if(action==="edit-task")openTask(id);else if(action==="complete-task")completeTask(id);else if(action==="edit-permissions")openPermissions(b.dataset.user);
  });
  document.addEventListener("submit",event=>{const form=event.target.closest("[data-crm-form]");if(!form)return;event.preventDefault();submitForm(form);});
  document.addEventListener("input",event=>{
    if(event.target.matches('[data-crm-filter="account-search"]')){const q=event.target.value.toLowerCase();document.querySelectorAll(".crm-table tbody tr").forEach(tr=>tr.hidden=!tr.textContent.toLowerCase().includes(q));}
  });
  document.addEventListener("change",event=>{
    if(event.target.matches("[data-account-all]")){shownAccountIds.forEach(id=>event.target.checked?accountSelection.add(id):accountSelection.delete(id));refresh();return;}
    if(event.target.matches("[data-account-id]")){const id=Number(event.target.dataset.accountId);event.target.checked?accountSelection.add(id):accountSelection.delete(id);refresh();return;}
    const entity=event.target.dataset.crmSalesperson;
    if(entity==="opportunities"||entity==="visits"){salespersonFilters[entity]=event.target.value;invalidate(entity);refresh();return;}
    if(event.target.matches('[data-crm-filter="account-status"]')){const v=event.target.value.toLowerCase();document.querySelectorAll(".crm-table tbody tr").forEach(tr=>{tr.hidden=v!=="all"&&!tr.textContent.toLowerCase().includes(v);});}
  });
}

let filterData=null,filterBusy=false,filterError='',panelFilters={};
const dateFields={accounts:'created_at',contacts:'created_at',opportunities:'expected_close_date',visits:'visit_date',meetings:'meeting_date',tasks:'due_date',activity:'created_at'};
const dateLabels={accounts:'Account created',contacts:'Contact created',opportunities:'Expected close',visits:'Scheduled visit',meetings:'Meeting date',tasks:'Due date',activity:'Activity date'};
function weekRange(offset=0){const now=new Date();const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const d=new Date(local+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay()+offset*7);const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return [from,d.toISOString().slice(0,10)];}
function panelMatch(section,r,f,accounts){
 const a=section==='accounts'?r:accounts.find(a=>String(a.id)===String(r.account_id));
 const owner=section==='visits'?(r.salesperson||r.created_by):section==='meetings'?r.created_by:section==='activity'?r.actor_user_name:section==='opportunities'?(r.owner_user_name||a?.assigned_to):section==='tasks'?r.assigned_to:(r.assigned_to||a?.assigned_to||r.user_name);
 const entity=String(r.branch||a?.branch||r.branch_access||'').toUpperCase();
 const entityMatch=!f.entity||(f.entity==='DXB'?/DXB|DUBAI|UAE/.test(entity):/KWI|KUWAIT/.test(entity));
 const status=r.visit_status||r.status||r.action||r.account_status||'';
 const dt=String(r[section==='visits'&&f.basis==='actual'?'actual_visit_date':dateFields[section]||'created_at']||'').slice(0,10);
 return (!f.search||Object.values(r).join(' ').toLowerCase().includes(f.search.toLowerCase()))&&(!f.owner||String(owner).toLowerCase()===f.owner.toLowerCase())&&entityMatch&&(!f.customer||String(a?.id||r.account_id)===f.customer)&&(!f.status||status===f.status)&&(!f.from||(dt&&dt>=f.from))&&(!f.to||(dt&&dt<=f.to))&&(!f.overdue||(r.visit_status==='Planned'&&dt<today()));
}
function panelToolbar(section,source){
 const f=panelFilters[section]||{};const accounts=filterData?.accounts||[];const rows=source||[];
 const names=new Set();for(const r of rows){const a=accounts.find(a=>String(a.id)===String(r.account_id));const n=section==='visits'?(r.salesperson||r.created_by):section==='meetings'?r.created_by:section==='activity'?r.actor_user_name:section==='opportunities'?(r.owner_user_name||a?.assigned_to):section==='tasks'?r.assigned_to:r.assigned_to||a?.assigned_to||r.user_name;if(n)names.add(n);}
 if(section==='dashboard'||section==='reports')accounts.forEach(a=>names.add(a.assigned_to));
 const options=(values,selected)=>'<option value="">All</option>'+values.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
 const attr=k=>`data-panel="${section}" data-panel-field="${k}"`;
 const summary=section==='dashboard'||section==='reports';
 return `<section class="crm-toolbar"><label>Search<input ${attr('search')} value="${esc(f.search||'')}"></label><label>${section==='activity'?'Actor':section==='meetings'?'Recorded by':'Salesperson'}<select ${attr('owner')}>${options([...names].sort(),f.owner)}</select></label><label>Entity<select ${attr('entity')}>${options(['DXB','KWI'],f.entity)}</select></label>${!['team','admin'].includes(section)?`<label>Customer<select ${attr('customer')}><option value="">All</option>${accounts.map(a=>`<option value="${a.id}" ${String(a.id)===f.customer?'selected':''}>${esc(a.company_name)}</option>`).join('')}</select>`:''}
 ${!summary?`<label>Status / action<select ${attr('status')}>${options([...new Set(rows.map(r=>r.visit_status||r.status||r.action||r.account_status).filter(Boolean))].sort(),f.status)}</select></label>`:''}
 ${dateFields[section]||summary?`<label>${summary?'Dates apply to each record’s business date':dateLabels[section]} — from<input type="date" ${attr('from')} value="${esc(f.from||'')}"></label><label>To<input type="date" ${attr('to')} value="${esc(f.to||'')}"></label>`:''}
 ${section==='visits'?`<label>Date basis<select ${attr('basis')}><option value="scheduled">Scheduled</option><option value="actual" ${f.basis==='actual'?'selected':''}>Actual completed date</option></select></label><button data-panel-preset="week" data-panel="visits">This week</button><button data-panel-preset="next" data-panel="visits">Next week</button><button data-panel-preset="overdue" data-panel="visits">Overdue planned</button><button data-panel-preset="completed" data-panel="visits">Completed</button><span>Weeks: Sunday–Saturday. Times as entered by staff.</span>`:''}<button data-panel-preset="reset" data-panel="${section}">Reset filters</button></section>`;
}
function filteredRender(section,renderer){
 const batch=new URLSearchParams(location.search).get('crmAssignment');
 if(section==='accounts'&&batch&&assignmentIds===null){
  if(!assignmentLoading&&!assignmentError){assignmentLoading=true;request('/assignment-batches/'+encodeURIComponent(batch)).then(r=>{assignmentIds=new Set(r.ids.map(String));}).catch(e=>assignmentError=e.message).finally(()=>{assignmentLoading=false;refresh();});}
  return shell(assignmentError?`<p>${esc(assignmentError)}</p><button data-crm-action="clear-assignment">Show all accounts</button>`:loading('assigned accounts'),{title:'Assigned accounts'});
 }
 if(!filterData){if(!filterBusy&&!filterError){filterBusy=true;request('/filter-data').then(r=>{filterData=r.data;Object.assign(cache,r.data);}).catch(e=>filterError=e.message).finally(()=>{filterBusy=false;refresh();});}return shell(filterError?`<div class="crm-error">${esc(filterError)}<button data-panel-preset="reload" data-panel="${section}">Retry</button></div>`:loading('filters'),{title:'CRM'});}
 if(section==='team'||section==='admin')ensure(section==='team'?'users':'adminUsers');
 const f=panelFilters[section]||{};const backup={};for(const k of Object.keys(filterData)){backup[k]=cache[k];cache[k]=filterData[k].filter(r=>panelMatch(k,r,f,filterData.accounts));}
 for(const k of ['users','adminUsers']){backup[k]=cache[k];if(cache[k])cache[k]=cache[k].filter(r=>panelMatch(section,r,f,filterData.accounts));}
 backup.dashboard=cache.dashboard;backup.reports=cache.reports;
 const opp=cache.opportunities.filter(o=>String(o.status).toLowerCase()==='open');const sum=list=>list.reduce((n,o)=>n+Number(o.estimated_value||0),0);
 const currencies=[...new Set(opp.map(o=>o.currency||'AED'))];const mixed=currencies.length>1||currencies.some(c=>c!=='AED');
 cache.dashboard={summary:{accounts:cache.accounts.length,prospects:cache.accounts.filter(a=>/prospect|lead/i.test(a.status)).length,open_opportunities:opp.length,pipeline_value:mixed?0:sum(opp),weighted_pipeline:mixed?0:opp.reduce((n,o)=>n+Number(o.estimated_value||0)*Number(o.probability||0)/100,0),actions_due:cache.tasks.filter(t=>t.status!=='Completed'&&t.due_date&&String(t.due_date).slice(0,10)<=new Date(Date.now()+7*864e5).toISOString().slice(0,10)).length},tasks:cache.tasks.filter(t=>t.status!=='Completed').sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))),activity:[...cache.activity].reverse().slice(0,20)};
 const groups=(rows,key)=>[...new Set(rows.map(r=>r[key]||'Unspecified'))];
 cache.reports={byOwner:groups(cache.accounts,'assigned_to').map(n=>({assigned_to:n,accounts:cache.accounts.filter(a=>a.assigned_to===n).length,open_opportunities:opp.filter(o=>(o.owner_user_name||o.account_owner)===n).length,pipeline_value:mixed?0:sum(opp.filter(o=>(o.owner_user_name||o.account_owner)===n)),visits:cache.visits.filter(v=>(v.salesperson||v.created_by)===n&&v.visit_status==='Completed').length,meetings:cache.meetings.filter(m=>m.created_by===n).length})),byStage:groups(opp,'stage').map(stage=>({stage,opportunities:opp.filter(o=>o.stage===stage).length,value:mixed?0:sum(opp.filter(o=>o.stage===stage))})),bySource:groups(cache.accounts,'source').map(source=>({source,accounts:cache.accounts.filter(a=>(a.source||'Unspecified')===source).length}))};
 let html;try{html=renderer();}finally{Object.assign(cache,backup);}
 // Combined filters replace the legacy independent account search/status controls.
 if(section==='accounts')html=html.replace(/<label>Search<input class="crm-search"[\s\S]*?<\/select><\/label>/,'');
 if(section==='reports')html=html.replaceAll('Visits (30d)','Completed visits').replaceAll('Meetings (30d)','Meetings').replaceAll('Accounts and 30-day relationship activity','Selected accounts and activity');
 if(mixed&&(section==='dashboard'||section==='reports'))html=html.replaceAll('AED 0','Not aggregated');
 const source=section==='team'?backup.users:section==='admin'?backup.adminUsers:filterData[section];
 const toolbar=panelToolbar(section,source);
 const notice=(section==='dashboard'||section==='reports')&&mixed?'<p class="crm-inline-note">Pipeline monetary totals are not combined across non-AED or mixed currencies. Counts remain accurate.</p>':'';
 return toolbar+notice+html;
}
function bindPanelFilters(){
 document.addEventListener('change',e=>{const t=e.target;if(!t.dataset.panelField)return;const f=panelFilters[t.dataset.panel]||(panelFilters[t.dataset.panel]={});f[t.dataset.panelField]=t.value;f.overdue=false;refresh();});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-panel-preset]');if(!b)return;const s=b.dataset.panel,p=b.dataset.panelPreset;let f=panelFilters[s]||(panelFilters[s]={});if(p==='reset')panelFilters[s]={};else if(p==='reload'){filterData=null;filterError='';}else if(p==='week'||p==='next'){[f.from,f.to]=weekRange(p==='next'?1:0);f.status='Planned';f.basis='scheduled';f.overdue=false;}else if(p==='overdue'){f.from='';f.to='';f.overdue=true;f.status='Planned';f.basis='scheduled';}else if(p==='completed'){f.status='Completed';f.basis='actual';f.overdue=false;}refresh();});
}
bind();
bindPanelFilters();

window.ApolloCRM = {
  renderDashboard:()=>filteredRender("dashboard",renderDashboard), renderAccounts:()=>filteredRender("accounts",renderAccounts), renderContacts:()=>filteredRender("contacts",renderContacts), renderOpportunities:()=>filteredRender("opportunities",renderOpportunities), renderVisits:()=>filteredRender("visits",renderVisits), renderMeetings:()=>filteredRender("meetings",renderMeetings),
  renderTasks:()=>filteredRender("tasks",renderTasks), renderActivity:()=>filteredRender("activity",renderActivity), renderReports:()=>filteredRender("reports",renderReports), renderTeam:()=>filteredRender("team",renderTeam), renderAdmin:()=>filteredRender("admin",renderAdmin),
  invalidate: () => { accountSelection.clear();shownAccountIds=[];assignmentIds=null;assignmentError='';filterData=null; panelFilters={}; salespersonFilters.opportunities="";salespersonFilters.visits=""; Object.keys(cache).forEach(k=>{if(!["loading","errors"].includes(k))cache[k]=null;}); }
};

// If the CRM module loads after the main runtime has already rendered a CRM session,
// immediately ask the shell to repaint now that the CRM renderer is available.
setTimeout(refresh, 0);

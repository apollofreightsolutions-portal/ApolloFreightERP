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
  loading: new Set(),
  errors: {}
};

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
  adminUsers: "/admin/users"
};

async function load(key, force = false) {
  if (!force && cache[key] !== null) return cache[key];
  if (cache.loading.has(key)) return null;
  cache.loading.add(key);
  delete cache.errors[key];
  try {
    const result = await request(endpoints[key]);
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
function invalidate(...keys) { keys.forEach(key => cache[key] = null); }

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
    {title:"CRM Dashboard",subtitle:"Accounts remain company property. Sales access follows assignment and server-side permissions.",actions:`<button data-crm-action="new-account">New Account</button><button class="secondary-button" data-crm-action="new-visit">Log Visit</button>`});
}

function renderAccounts() {
  ensure("accounts","users");
  if (!cache.accounts) return shell(loading("accounts"), {title:"Accounts",subtitle:"Customer ownership is enforced by assignment, not by browser visibility."});
  const rows = cache.accounts;
  const exportButton = crmSession().crmExportAccess ? `<button class="secondary-button" data-crm-export="accounts">Export CSV</button>` : "";
  const table = rows.length ? `<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Account</th><th>Status</th><th>Owner</th><th>Industry</th><th>Territory</th><th>Potential</th><th>Next Action</th><th>Last Visit</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="crm-link crm-primary" data-crm-action="view-account" data-id="${r.id}">${esc(r.company_name)}</button><span class="crm-sub">${esc(r.account_code)}</span></td><td>${badge(r.status,statusTone(r.status))}</td><td>${ownerBadge(r)}</td><td>${esc(text(r.industry))}</td><td>${esc(text(r.territory||r.city))}</td><td>${money(r.potential_value,r.currency)}</td><td>${esc(text(r.next_action))}<span class="crm-sub">${date(r.next_action_date)}</span></td><td>${date(r.last_visit_date)}</td><td><button class="secondary-button" data-crm-action="edit-account" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : empty("No CRM accounts are assigned to this user yet.");
  return shell(`<div class="crm-toolbar"><div class="crm-toolbar-group"><label>Search<input class="crm-search" data-crm-filter="account-search" placeholder="Company, code, owner or city"></label><label>Status<select data-crm-filter="account-status"><option>All</option><option>Prospect</option><option>Lead</option><option>Active</option><option>Dormant</option></select></label></div><div class="crm-toolbar-group"><button data-crm-action="new-account">New Account</button>${exportButton}</div></div>${table}`,
  {title:"Accounts",subtitle:"Every account has an accountable sales owner. Sales executives can see only accounts assigned to them."});
}

function renderContacts() {
  ensure("contacts","accounts"); if(!cache.contacts) return shell(loading("contacts"),{title:"Contacts",subtitle:"Decision makers and operational contacts linked to company-owned accounts."});
  const rows=cache.contacts; const body=rows.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Account</th><th>Title</th><th>Email</th><th>Mobile</th><th>Influence</th><th>Primary</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td class="crm-primary">${esc(r.full_name)}</td><td>${esc(r.company_name)}<span class="crm-sub">${esc(r.account_code)}</span></td><td>${esc(text(r.job_title))}</td><td>${esc(text(r.email))}</td><td>${esc(text(r.mobile||r.whatsapp))}</td><td>${badge(r.influence_level||"Standard","navy")}</td><td>${r.is_primary?badge("Primary","green"):"—"}</td><td><button class="secondary-button" data-crm-action="edit-contact" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`:empty("No contacts recorded yet.");
  return shell(body,{title:"Contacts",subtitle:"Contacts inherit account ownership automatically, so reassignment immediately changes visibility.",actions:`<button data-crm-action="new-contact">New Contact</button>`});
}

function renderOpportunities() {
  ensure("opportunities","accounts"); if(!cache.opportunities) return shell(loading("opportunities"),{title:"Opportunities",subtitle:"A freight-focused pipeline from qualification through won or lost."});
  const rows=cache.opportunities; const stages=["Qualification","Discovery","Proposal","Negotiation","Won"];
  const columns=stages.map(stage=>{const items=rows.filter(r=>String(r.stage||"").toLowerCase()===stage.toLowerCase() && String(r.status||"Open").toLowerCase()!=="lost"); const total=items.reduce((a,r)=>a+Number(r.estimated_value||0),0); return `<section class="crm-stage"><div class="crm-stage-head"><strong>${esc(stage)}</strong><span>${items.length} · ${money(total,"AED")}</span></div>${items.length?items.map(r=>`<div class="crm-opportunity-card" data-crm-action="edit-opportunity" data-id="${r.id}"><strong>${esc(r.title)}</strong><span>${esc(r.company_name)}</span><span>${esc(text(r.service_type))} · ${esc(text(r.origin,""))}${r.origin&&r.destination?" → ":""}${esc(text(r.destination,""))}</span><span>Owner: ${esc(text(r.owner_user_name||r.assigned_to))}</span><div class="value">${money(r.estimated_value,r.currency)} · ${Number(r.probability||0)}%</div></div>`).join(""):empty("No opportunities")}</section>`}).join("");
  const exportButton=crmSession().crmExportAccess?`<button class="secondary-button" data-crm-export="opportunities">Export CSV</button>`:"";
  return shell(`${panel("Pipeline Board","Drag-free by design: stage changes are recorded as auditable edits.",`<div class="crm-pipeline">${columns}</div>`)}${rows.some(r=>String(r.status||"").toLowerCase()==="lost")?panel("Lost Opportunities","Retained for analysis instead of being deleted",`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Opportunity</th><th>Account</th><th>Value</th><th>Reason</th><th>Owner</th></tr></thead><tbody>${rows.filter(r=>String(r.status||"").toLowerCase()==="lost").map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.company_name)}</td><td>${money(r.estimated_value,r.currency)}</td><td>${esc(text(r.lost_reason))}</td><td>${esc(text(r.owner_user_name))}</td></tr>`).join("")}</tbody></table></div>`):""}`,
  {title:"Opportunities",subtitle:"Pipeline value, probability, lanes, service type, competitor and next step are captured per opportunity.",actions:`<button data-crm-action="new-opportunity">New Opportunity</button>${exportButton}`});
}

function renderVisits() {
  ensure("visits","accounts","contacts"); if(!cache.visits) return shell(loading("visits"),{title:"Sales Visits",subtitle:"Proof of field activity with outcomes and next steps."});
  const rows=cache.visits; const table=rows.length?`<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Date</th><th>Account</th><th>Contact</th><th>Type</th><th>Purpose</th><th>Outcome</th><th>Follow-up</th><th>Logged By</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td class="crm-primary">${date(r.visit_date)}<span class="crm-sub">${esc(text(r.visit_time,""))}</span></td><td>${esc(r.company_name)}</td><td>${esc(text(r.contact_name))}</td><td>${badge(r.visit_type,"navy")}</td><td>${esc(text(r.purpose))}</td><td>${esc(text(r.outcome))}</td><td>${date(r.follow_up_date)}<span class="crm-sub">${esc(text(r.next_step,""))}</span></td><td>${esc(text(r.created_by))}</td><td><button class="secondary-button" data-crm-action="edit-visit" data-id="${r.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>`:empty("No client visits logged yet.");
  return shell(table,{title:"Sales Visits",subtitle:"Visits stay attached to the account, even if the salesperson later leaves Apollo.",actions:`<button data-crm-action="new-visit">Log Visit</button>`});
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
  return shell(`${panel("Open Follow-ups",`${open.length} items requiring action`,taskTable(open))}${panel("Completed","Retained for accountability and performance review",taskTable(completed.slice(0,100)))}`,
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

function openVisit(id=null){const r=id?recordBy("visits",id):{}; modal(id?"Edit Sales Visit":"Log Sales Visit",`
  <label>Account<select name="accountId" required><option value="">Select account</option>${accountOptions(r.account_id)}</select></label><label>Client Contact<select name="contactId"><option value="">No contact selected</option>${contactOptions(r.contact_id,r.account_id)}</select></label>${field("Visit Date","visitDate",date(r.visit_date)==="—"?today():date(r.visit_date),"date")}
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
  await request(path,{method,body:JSON.stringify(payload)}); d?.close(); invalidate("dashboard","accounts","contacts","opportunities","visits","meetings","tasks","activity","reports","users","adminUsers"); refresh();
 }catch(error){alert(error.message);}}

async function completeTask(id){const r=recordBy("tasks",id);if(!r)return;try{await request(`/tasks/${id}`,{method:"PUT",body:JSON.stringify({status:"Completed",title:r.title,description:r.description,dueDate:date(r.due_date)==="—"?null:date(r.due_date),priority:r.priority,assignedTo:r.assigned_to})});invalidate("dashboard","tasks","activity","reports");refresh();}catch(error){alert(error.message)}}
async function doReassign(form){await submitForm(form);}
async function exportEntity(entity){try{const response=await request(`/export/${entity}`);const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`apollo-crm-${entity}-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(error){alert(error.message)}}

function bind(){
  document.addEventListener("click",event=>{
    const nav=event.target.closest("[data-crm-nav]"); if(nav){const button=[...document.querySelectorAll("#moduleNav button")].find(b=>b.dataset.module===nav.dataset.crmNav);button?.click();return;}
    const exp=event.target.closest("[data-crm-export]"); if(exp){exportEntity(exp.dataset.crmExport);return;}
    const b=event.target.closest("[data-crm-action]"); if(!b)return; const id=b.dataset.id; const action=b.dataset.crmAction;
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
    if(event.target.matches('[data-crm-filter="account-status"]')){const v=event.target.value.toLowerCase();document.querySelectorAll(".crm-table tbody tr").forEach(tr=>{tr.hidden=v!=="all"&&!tr.textContent.toLowerCase().includes(v);});}
  });
}

bind();

window.ApolloCRM = {
  renderDashboard, renderAccounts, renderContacts, renderOpportunities, renderVisits, renderMeetings,
  renderTasks, renderActivity, renderReports, renderTeam, renderAdmin,
  invalidate: () => { Object.keys(cache).forEach(k=>{if(!["loading","errors"].includes(k))cache[k]=null;}); }
};

// If the CRM module loads after the main runtime has already rendered a CRM session,
// immediately ask the shell to repaint now that the CRM renderer is available.
setTimeout(refresh, 0);

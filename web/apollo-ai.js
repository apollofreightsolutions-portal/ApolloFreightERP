const AI_SESSION_KEY = "apollofreighterp-session";
const API_URL = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");

let aiState = { token: "", enabled: false, open: false, busy: false, meta: null, messages: [] };

function session() { try { return JSON.parse(sessionStorage.getItem(AI_SESSION_KEY) || "null"); } catch { return null; } }
function isCustomerSession() { return String(session()?.portal || document.body.dataset.apolloPortal || "").toLowerCase() === "customer"; }
function token() { return String(session()?.token || "").trim(); }
function isAiPortalAllowed() {
  const current = session();
  const portal = String(current?.portal || "").trim().toLowerCase();
  return Boolean(current?.token && (portal === "company" || portal === "crm"));
}
function hideAiUiCompletely() {
  const launcher = document.querySelector("#apolloAiLauncher");
  const panel = document.querySelector("#apolloAiPanel");
  if (launcher) { launcher.hidden = true; launcher.style.setProperty("display", "none", "important"); launcher.setAttribute("aria-expanded", "false"); }
  if (panel) { panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); panel.style.setProperty("display", "none", "important"); }
  aiState.open = false;
}
function restoreAiUiContainers() {
  const launcher = document.querySelector("#apolloAiLauncher");
  const panel = document.querySelector("#apolloAiPanel");
  if (launcher) launcher.style.removeProperty("display");
  if (panel) panel.style.removeProperty("display");
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

function ensureUi() {
  if (document.querySelector("#apolloAiLauncher")) return;
  const launcher = document.createElement("button");
  launcher.id = "apolloAiLauncher"; launcher.className = "apollo-ai-launcher"; launcher.type = "button"; launcher.hidden = true;
  launcher.setAttribute("aria-controls", "apolloAiPanel"); launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="apollo-ai-dot" aria-hidden="true"></span><span>Apollo AI</span>';
  document.body.appendChild(launcher);

  const panel = document.createElement("aside");
  panel.id = "apolloAiPanel"; panel.className = "apollo-ai-panel"; panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="apollo-ai-header"><div><p class="apollo-ai-eyebrow">Apollo Connected</p><h2>Apollo AI</h2><p class="apollo-ai-security-line">Read-only · permission-scoped · exact-data first</p></div><button type="button" class="apollo-ai-close">Close</button></div>
    <div class="apollo-ai-meta" id="apolloAiMeta">Checking access…</div>
    <div class="apollo-ai-messages" id="apolloAiMessages" aria-live="polite"></div>
    <div class="apollo-ai-suggestions" id="apolloAiSuggestions"></div>
    <form class="apollo-ai-form" id="apolloAiForm">
      <label for="apolloAiInput">Ask Apollo AI</label>
      <textarea id="apolloAiInput" maxlength="2500" rows="3" placeholder="Ask about shipments, TCN/POD copies, booking activity, CRM, or draft a work message."></textarea>
      <div class="apollo-ai-form-actions"><button type="button" class="apollo-ai-clear">Clear</button><button type="submit" class="apollo-ai-send">Ask Apollo AI</button></div>
      <p class="apollo-ai-footnote">Apollo AI uses server-filtered Connected records and cannot change records or bypass your permissions.</p>
    </form>`;
  document.body.appendChild(panel);

  launcher.addEventListener("click", () => setOpen(true));
  panel.querySelector(".apollo-ai-close").addEventListener("click", () => setOpen(false));
  panel.querySelector(".apollo-ai-clear").addEventListener("click", () => { aiState.messages = []; renderMessages(); renderSuggestions(); });
  panel.querySelector("#apolloAiForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const input = panel.querySelector("#apolloAiInput"); const message = String(input.value || "").trim();
    if (!message || aiState.busy) return; input.value = ""; await sendMessage(message);
  });
  panel.addEventListener("click", async (event) => {
    const suggestion = event.target.closest("[data-ai-suggestion]");
    if (suggestion && !aiState.busy) return sendMessage(suggestion.dataset.aiSuggestion || "");
    const action = event.target.closest("[data-ai-action]");
    if (action) return handleAction(action);
  });
  window.addEventListener("apollo:close-ai", () => setOpen(false, false));
}

function setOpen(open, announce = true) {
  aiState.open = Boolean(open); const panel = document.querySelector("#apolloAiPanel"); const launcher = document.querySelector("#apolloAiLauncher");
  if (!panel || !launcher) return;
  panel.classList.toggle("is-open", aiState.open); panel.setAttribute("aria-hidden", aiState.open ? "false" : "true"); launcher.setAttribute("aria-expanded", aiState.open ? "true" : "false");
  if (aiState.open) { if (announce) window.dispatchEvent(new CustomEvent("apollo:close-chat")); setTimeout(() => panel.querySelector("#apolloAiInput")?.focus(), 100); }
}

function addMessage(role, text, meta = "", actions = [], sourceSummary = "") {
  aiState.messages.push({ role, text: String(text || ""), meta: String(meta || ""), actions: Array.isArray(actions) ? actions : [], sourceSummary: String(sourceSummary || "") });
  if (aiState.messages.length > 20) aiState.messages = aiState.messages.slice(-20);
  renderMessages();
}

function actionButton(item) {
  const payload = encodeURIComponent(JSON.stringify(item));
  return `<button type="button" class="apollo-ai-result-action" data-ai-action="${escapeAttribute(payload)}">${escapeHtml(item.label || "Open")}</button>`;
}

function renderMessages() {
  const container = document.querySelector("#apolloAiMessages"); if (!container) return;
  if (!aiState.messages.length) {
    container.innerHTML = `<div class="apollo-ai-welcome"><strong>Exact Connected data first.</strong><p>Shipment lists, booking summaries, TCN copies and POD retrieval are queried directly from Apollo Connected. Gemini is used only when language interpretation is useful.</p></div>`;
    return;
  }
  container.replaceChildren();
  for (const item of aiState.messages) {
    const row = document.createElement("div"); row.className = `apollo-ai-message is-${item.role === "user" ? "user" : "assistant"}`;
    const body = document.createElement("div"); body.className = "apollo-ai-message-body"; body.textContent = item.text; row.appendChild(body);
    if (item.actions?.length) {
      const actions = document.createElement("div"); actions.className = "apollo-ai-result-actions"; actions.innerHTML = item.actions.map(actionButton).join(""); row.appendChild(actions);
    }
    const details = [item.meta, item.sourceSummary].filter(Boolean).join(" · ");
    if (details) { const meta = document.createElement("div"); meta.className = "apollo-ai-message-meta"; meta.textContent = details; row.appendChild(meta); }
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

function renderSuggestions() {
  const container = document.querySelector("#apolloAiSuggestions"); if (!container) return;
  const sessionData = session() || {};
  const suggestions = ["What shipments were created today by Dubai branch?", "Who booked which type of shipments this month?", "Show TCN copy for a shipment", "Find shipments with pending POD"];
  if (sessionData.crmPortalAccess || String(sessionData.role || "").toLowerCase() === "admin") suggestions.push("Summarize my CRM pipeline and next actions");
  container.innerHTML = suggestions.slice(0, 5).map((text) => `<button type="button" data-ai-suggestion="${escapeAttribute(text)}">${escapeHtml(text)}</button>`).join("");
}

async function api(path, options = {}, timeoutMs = 15000) {
  const currentToken = token(); if (!currentToken) throw new Error("Login required.");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, signal: controller.signal, headers: { "Content-Type":"application/json", Authorization:`Bearer ${currentToken}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.error || "Apollo AI request failed."); error.status = response.status; throw error; }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Apollo AI request timed out. Please try again.");
    throw error;
  } finally { clearTimeout(timer); }
}

async function handleAction(button) {
  let item = null; try { item = JSON.parse(decodeURIComponent(button.dataset.aiAction || "")); } catch { return; }
  if (!item) return;
  if (item.type === "tcn") {
    const docs = window.ApolloConnectedDocuments;
    if (!docs?.openTcn) return window.alert("TCN viewer is not available on this screen yet.");
    docs.openTcn(item.jobNo, false); return;
  }
  if (item.type === "shipment") {
    const docs = window.ApolloConnectedDocuments;
    if (docs?.openShipment) docs.openShipment(item.jobNo); return;
  }
  if (item.type === "pod") {
    button.disabled = true;
    try {
      const result = await api(`/api/ai/document/${encodeURIComponent(item.documentNo)}/view`, {}, 15000);
      if (!result.url) throw new Error("POD file link was not returned.");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { window.alert(error.message || "POD could not be opened."); }
    finally { button.disabled = false; }
  }
}

async function refreshAccess(force = false) {
  const currentToken = token();
  const appShell = document.querySelector("#appShell");
  const loggedIn = Boolean(isAiPortalAllowed() && currentToken && appShell && !appShell.classList.contains("is-hidden"));
  if (!loggedIn) {
    aiState.enabled = false; aiState.token = ""; aiState.meta = null;
    hideAiUiCompletely();
    return;
  }
  ensureUi();
  restoreAiUiContainers();
  renderMessages();
  const launcher = document.querySelector("#apolloAiLauncher");
  if (!force && currentToken === aiState.token && aiState.meta) { if (launcher) launcher.hidden = !aiState.enabled; return; }
  aiState.token = currentToken;
  try {
    const meta = await api("/api/ai/me", {}, 12000); aiState.enabled = Boolean(meta.enabled); aiState.meta = meta; if (launcher) launcher.hidden = !aiState.enabled;
    const metaNode = document.querySelector("#apolloAiMeta"); if (metaNode) metaNode.textContent = `${meta.provider} · ${meta.model}${meta.freeTierSafeMode ? " · Safe Mode" : ""} · ${meta.businessTimezone || ""}`;
    renderSuggestions();
  } catch { aiState.enabled = false; aiState.meta = null; if (launcher) launcher.hidden = true; setOpen(false, false); }
}

async function sendMessage(message) {
  const clean = String(message || "").trim(); if (!clean) return;
  aiState.busy = true; addMessage("user", clean);
  const sendButton = document.querySelector(".apollo-ai-send"); if (sendButton) { sendButton.disabled = true; sendButton.textContent = "Working…"; }
  try {
    const history = aiState.messages.slice(0, -1).slice(-4).map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", text: item.text }));
    const result = await api("/api/ai/chat", { method:"POST", body:JSON.stringify({ message:clean, history }) }, 35000);
    const when = result.retrievedAt ? new Date(result.retrievedAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : "";
    const meta = `${result.scopeLabel || "Apollo AI"}${result.deterministic ? " · Exact query" : ""}${when ? ` · ${when}` : ""}`;
    addMessage("assistant", result.answer || "No response returned.", meta, result.actions || [], result.sourceSummary || "");
  } catch (error) { addMessage("assistant", error.message || "Apollo AI is temporarily unavailable.", "Request not completed"); }
  finally { aiState.busy = false; if (sendButton) { sendButton.disabled = false; sendButton.textContent = "Ask Apollo AI"; } }
}

refreshAccess(true);
const observer = new MutationObserver(() => refreshAccess(false)); const appShell = document.querySelector("#appShell"); if (appShell) observer.observe(appShell, { attributes:true, attributeFilter:["class"] });
window.addEventListener("storage", () => refreshAccess(true)); setInterval(() => refreshAccess(false), 8000);

const AI_SESSION_KEY = "apollofreighterp-session";
const API_URL = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");

let aiState = {
  token: "",
  enabled: false,
  open: false,
  busy: false,
  meta: null,
  messages: []
};

function session() {
  try {
    return JSON.parse(sessionStorage.getItem(AI_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function token() {
  return String(session()?.token || "").trim();
}

function ensureUi() {
  if (document.querySelector("#apolloAiLauncher")) return;
  const launcher = document.createElement("button");
  launcher.id = "apolloAiLauncher";
  launcher.className = "apollo-ai-launcher";
  launcher.type = "button";
  launcher.hidden = true;
  launcher.setAttribute("aria-controls", "apolloAiPanel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="apollo-ai-dot" aria-hidden="true"></span><span>Apollo AI</span>';
  document.body.appendChild(launcher);

  const panel = document.createElement("aside");
  panel.id = "apolloAiPanel";
  panel.className = "apollo-ai-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <div class="apollo-ai-header">
      <div>
        <p class="apollo-ai-eyebrow">Apollo Connected</p>
        <h2>Apollo AI</h2>
        <p class="apollo-ai-security-line">Read-only · permission-scoped</p>
      </div>
      <button type="button" class="apollo-ai-close" aria-label="Close Apollo AI">Close</button>
    </div>
    <div class="apollo-ai-meta" id="apolloAiMeta">Checking access…</div>
    <div class="apollo-ai-messages" id="apolloAiMessages" aria-live="polite"></div>
    <div class="apollo-ai-suggestions" id="apolloAiSuggestions"></div>
    <form class="apollo-ai-form" id="apolloAiForm">
      <label for="apolloAiInput">Ask Apollo AI</label>
      <textarea id="apolloAiInput" maxlength="2500" rows="3" placeholder="Ask about shipments, your CRM accounts, or draft an operational message."></textarea>
      <div class="apollo-ai-form-actions">
        <button type="button" class="apollo-ai-clear">Clear</button>
        <button type="submit" class="apollo-ai-send">Ask Apollo AI</button>
      </div>
      <p class="apollo-ai-footnote">Apollo AI cannot change records, approve requests, send messages, or bypass your Connected permissions.</p>
    </form>`;
  document.body.appendChild(panel);

  launcher.addEventListener("click", () => setOpen(true));
  panel.querySelector(".apollo-ai-close").addEventListener("click", () => setOpen(false));
  panel.querySelector(".apollo-ai-clear").addEventListener("click", () => {
    aiState.messages = [];
    renderMessages();
    renderSuggestions();
  });
  panel.querySelector("#apolloAiForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = panel.querySelector("#apolloAiInput");
    const message = String(input.value || "").trim();
    if (!message || aiState.busy) return;
    input.value = "";
    await sendMessage(message);
  });
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-ai-suggestion]");
    if (!button || aiState.busy) return;
    await sendMessage(button.dataset.aiSuggestion || "");
  });
}

function setOpen(open) {
  aiState.open = Boolean(open);
  const panel = document.querySelector("#apolloAiPanel");
  const launcher = document.querySelector("#apolloAiLauncher");
  if (!panel || !launcher) return;
  panel.classList.toggle("is-open", aiState.open);
  panel.setAttribute("aria-hidden", aiState.open ? "false" : "true");
  launcher.setAttribute("aria-expanded", aiState.open ? "true" : "false");
  if (aiState.open) setTimeout(() => panel.querySelector("#apolloAiInput")?.focus(), 120);
}

function addMessage(role, text, meta = "") {
  aiState.messages.push({ role, text: String(text || ""), meta: String(meta || "") });
  if (aiState.messages.length > 20) aiState.messages = aiState.messages.slice(-20);
  renderMessages();
}

function renderMessages() {
  const container = document.querySelector("#apolloAiMessages");
  if (!container) return;
  if (!aiState.messages.length) {
    container.innerHTML = `
      <div class="apollo-ai-welcome">
        <strong>Ask Connected, without opening every screen.</strong>
        <p>I can analyze only the records your account is already allowed to access. I am read-only.</p>
      </div>`;
    return;
  }
  container.replaceChildren();
  for (const item of aiState.messages) {
    const row = document.createElement("div");
    row.className = `apollo-ai-message is-${item.role === "user" ? "user" : "assistant"}`;
    const body = document.createElement("div");
    body.className = "apollo-ai-message-body";
    body.textContent = item.text;
    row.appendChild(body);
    if (item.meta) {
      const meta = document.createElement("div");
      meta.className = "apollo-ai-message-meta";
      meta.textContent = item.meta;
      row.appendChild(meta);
    }
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

function renderSuggestions() {
  const container = document.querySelector("#apolloAiSuggestions");
  if (!container) return;
  const sessionData = session() || {};
  const suggestions = ["Summarize my current operations", "Find shipments that may need attention"];
  if (sessionData.crmPortalAccess || String(sessionData.role || "").toLowerCase() === "admin") {
    suggestions.push("Summarize my CRM pipeline and next actions");
  }
  suggestions.push("Draft a concise customer shipment update");
  container.innerHTML = suggestions
    .slice(0, 4)
    .map((text) => `<button type="button" data-ai-suggestion="${escapeAttribute(text)}">${escapeHtml(text)}</button>`)
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

async function api(path, options = {}) {
  const currentToken = token();
  if (!currentToken) throw new Error("Login required.");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentToken}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Apollo AI request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshAccess(force = false) {
  ensureUi();
  const currentToken = token();
  const appShell = document.querySelector("#appShell");
  const loggedIn = Boolean(currentToken && appShell && !appShell.classList.contains("is-hidden"));
  const launcher = document.querySelector("#apolloAiLauncher");
  if (!loggedIn) {
    aiState.enabled = false;
    aiState.token = "";
    aiState.meta = null;
    if (launcher) launcher.hidden = true;
    setOpen(false);
    return;
  }
  if (!force && currentToken === aiState.token && aiState.meta) return;
  aiState.token = currentToken;
  try {
    const meta = await api("/api/ai/me");
    aiState.enabled = Boolean(meta.enabled);
    aiState.meta = meta;
    if (launcher) launcher.hidden = !aiState.enabled;
    const metaNode = document.querySelector("#apolloAiMeta");
    if (metaNode) {
      metaNode.textContent = meta.freeTierSafeMode
        ? `${meta.provider} · ${meta.model} · Free-Tier Safe Mode`
        : `${meta.provider} · ${meta.model}`;
    }
    renderSuggestions();
  } catch (error) {
    aiState.enabled = false;
    aiState.meta = null;
    if (launcher) launcher.hidden = true;
    setOpen(false);
  }
}

async function sendMessage(message) {
  const clean = String(message || "").trim();
  if (!clean) return;
  aiState.busy = true;
  addMessage("user", clean);
  const sendButton = document.querySelector(".apollo-ai-send");
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "Thinking…";
  }
  try {
    const history = aiState.messages
      .slice(0, -1)
      .slice(-6)
      .map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", text: item.text }));
    const result = await api("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: clean, history })
    });
    addMessage("assistant", result.answer || "No response returned.", `${result.scopeLabel || "Apollo AI"} · Read-only`);
  } catch (error) {
    addMessage("assistant", error.message || "Apollo AI is temporarily unavailable.", "Request not completed");
  } finally {
    aiState.busy = false;
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = "Ask Apollo AI";
    }
  }
}

ensureUi();
renderMessages();
renderSuggestions();
refreshAccess(true);

const observer = new MutationObserver(() => refreshAccess(false));
const appShell = document.querySelector("#appShell");
if (appShell) observer.observe(appShell, { attributes: true, attributeFilter: ["class"] });
window.addEventListener("storage", () => refreshAccess(true));
setInterval(() => refreshAccess(false), 5000);

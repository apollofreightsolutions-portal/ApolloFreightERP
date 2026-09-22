const CHAT_SESSION_KEY = "apollofreighterp-session";
const CHAT_API_URL = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");

const chatState = {
  token: "", open: false, users: [], conversations: [], activeUser: "", messages: [], unread: 0,
  search: "", shareScreen: false, polling: false, loaded: false
};

function chatSession() { try { return JSON.parse(sessionStorage.getItem(CHAT_SESSION_KEY) || "null"); } catch { return null; } }
function isCustomerChatSession() { return String(chatSession()?.portal || document.body.dataset.apolloPortal || "").toLowerCase() === "customer"; }
function chatToken() { return String(chatSession()?.token || "").trim(); }
function chatEsc(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
function formatChatTime(value) {
  if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return "";
  const today = new Date(); const same = d.toDateString() === today.toDateString();
  return same ? d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : d.toLocaleDateString([], { month:"short", day:"numeric" });
}
function currentScreenContext() {
  const screen = String(document.querySelector("#pageTitle")?.textContent || "Apollo Connected").trim();
  const dialogHeading = String(document.querySelector(".dialog-shell h2, .modal h2, [role='dialog'] h2")?.textContent || "").trim();
  return { screen, label: dialogHeading ? `${screen} · ${dialogHeading}` : screen, reference: "" };
}

async function chatApi(path, options = {}, timeoutMs = 12000) {
  const currentToken = chatToken(); if (!currentToken) throw new Error("Login required.");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${CHAT_API_URL}${path}`, { ...options, signal: controller.signal, headers: { "Content-Type":"application/json", Authorization:`Bearer ${currentToken}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Connected Chat request failed.");
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Connected Chat request timed out.");
    throw error;
  } finally { clearTimeout(timer); }
}

function ensureChatUi() {
  if (document.querySelector("#connectedChatLauncher")) return;
  const launcher = document.createElement("button");
  launcher.id = "connectedChatLauncher"; launcher.className = "connected-chat-launcher"; launcher.type = "button"; launcher.hidden = true;
  launcher.innerHTML = '<span class="connected-chat-icon">↗</span><span>Chat</span><span class="connected-chat-badge" hidden>0</span>';
  document.body.appendChild(launcher);

  const panel = document.createElement("aside");
  panel.id = "connectedChatPanel"; panel.className = "connected-chat-panel"; panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <header class="connected-chat-header">
      <div><p>APOLLO CONNECTED</p><h2>Connected Chat</h2><small>Internal messaging</small></div>
      <button type="button" class="connected-chat-close">Close</button>
    </header>
    <div class="connected-chat-home" id="connectedChatHome">
      <div class="connected-chat-search-wrap"><input id="connectedChatSearch" type="search" placeholder="Search a colleague…" autocomplete="off" /></div>
      <div class="connected-chat-list" id="connectedChatList"></div>
    </div>
    <div class="connected-chat-thread" id="connectedChatThread" hidden>
      <div class="connected-chat-thread-head"><button type="button" class="connected-chat-back">←</button><div><strong id="connectedChatThreadName"></strong><small id="connectedChatThreadMeta"></small></div></div>
      <div class="connected-chat-messages" id="connectedChatMessages"></div>
      <form class="connected-chat-form" id="connectedChatForm">
        <div class="connected-chat-share-state" id="connectedChatShareState" hidden></div>
        <textarea id="connectedChatInput" maxlength="2000" rows="2" placeholder="Write a message…"></textarea>
        <div class="connected-chat-actions"><button type="button" class="connected-chat-share">Share current screen</button><button type="submit" class="connected-chat-send">Send</button></div>
      </form>
    </div>`;
  document.body.appendChild(panel);

  launcher.addEventListener("click", () => setChatOpen(true));
  panel.querySelector(".connected-chat-close").addEventListener("click", () => setChatOpen(false));
  panel.querySelector(".connected-chat-back").addEventListener("click", () => { chatState.activeUser = ""; chatState.messages = []; renderChatView(); });
  panel.querySelector("#connectedChatSearch").addEventListener("input", (event) => { chatState.search = event.target.value || ""; renderChatList(); });
  panel.querySelector(".connected-chat-share").addEventListener("click", () => { chatState.shareScreen = !chatState.shareScreen; renderShareState(); });
  panel.querySelector("#connectedChatForm").addEventListener("submit", sendChatMessage);
  panel.querySelector("#connectedChatList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-user]"); if (button) openConversation(button.dataset.chatUser || "");
  });
  window.addEventListener("apollo:close-chat", () => setChatOpen(false, false));
}

function setChatOpen(open, announce = true) {
  chatState.open = Boolean(open); const panel = document.querySelector("#connectedChatPanel"); const launcher = document.querySelector("#connectedChatLauncher");
  if (!panel || !launcher) return;
  panel.classList.toggle("is-open", chatState.open); panel.setAttribute("aria-hidden", chatState.open ? "false" : "true"); launcher.setAttribute("aria-expanded", chatState.open ? "true" : "false");
  if (chatState.open) { if (announce) window.dispatchEvent(new CustomEvent("apollo:close-ai")); refreshChat(true); }
}

function updateBadge() {
  const badge = document.querySelector(".connected-chat-badge"); if (!badge) return;
  badge.textContent = chatState.unread > 99 ? "99+" : String(chatState.unread || 0); badge.hidden = !chatState.unread;
}

function mergedPeople() {
  const byName = new Map();
  for (const user of chatState.users) byName.set(String(user.userName).toLowerCase(), { ...user, unreadCount:0, lastMessage:"", lastMessageAt:"" });
  for (const convo of chatState.conversations) {
    const key = String(convo.otherUser || "").toLowerCase(); const base = byName.get(key) || { userName:convo.otherUser, role:convo.otherRole, branchAccess:convo.otherBranch };
    byName.set(key, { ...base, unreadCount:Number(convo.unreadCount || 0), lastMessage:convo.lastMessage || "", lastMessageAt:convo.lastMessageAt || "" });
  }
  const needle = chatState.search.trim().toLowerCase();
  return [...byName.values()].filter((item) => !needle || `${item.userName} ${item.role} ${item.branchAccess}`.toLowerCase().includes(needle)).sort((a,b) => {
    if (a.lastMessageAt && b.lastMessageAt) return String(b.lastMessageAt).localeCompare(String(a.lastMessageAt));
    if (a.lastMessageAt) return -1; if (b.lastMessageAt) return 1; return String(a.userName).localeCompare(String(b.userName));
  });
}

function renderChatList() {
  const node = document.querySelector("#connectedChatList"); if (!node) return;
  const people = mergedPeople();
  if (!people.length) { node.innerHTML = '<div class="connected-chat-empty">No active colleagues found.</div>'; return; }
  node.innerHTML = people.map((item) => `
    <button type="button" class="connected-chat-person" data-chat-user="${chatEsc(item.userName)}">
      <span class="connected-chat-avatar">${chatEsc(String(item.userName || "?").slice(0,2).toUpperCase())}</span>
      <span class="connected-chat-person-copy"><strong>${chatEsc(item.userName)}</strong><small>${chatEsc([item.role,item.branchAccess].filter(Boolean).join(" · "))}</small><em>${chatEsc(item.lastMessage || "Start a conversation")}</em></span>
      <span class="connected-chat-person-side"><time>${chatEsc(formatChatTime(item.lastMessageAt))}</time>${item.unreadCount ? `<b>${item.unreadCount}</b>` : ""}</span>
    </button>`).join("");
}

function renderMessages() {
  const node = document.querySelector("#connectedChatMessages"); if (!node) return;
  if (!chatState.messages.length) { node.innerHTML = '<div class="connected-chat-empty thread">No messages yet. Start the conversation.</div>'; return; }
  node.innerHTML = chatState.messages.map((item) => `
    <div class="connected-chat-message ${item.mine ? "mine" : "theirs"}">
      <div class="connected-chat-bubble">${chatEsc(item.body)}</div>
      ${item.context?.label ? `<div class="connected-chat-context">Shared screen: ${chatEsc(item.context.label)}</div>` : ""}
      <small>${chatEsc(formatChatTime(item.createdAt))}${item.mine ? (item.readAt ? " · Read" : " · Sent") : ""}</small>
    </div>`).join("");
  node.scrollTop = node.scrollHeight;
}

function activeUserMeta() {
  const user = chatState.users.find((item) => String(item.userName).toLowerCase() === String(chatState.activeUser).toLowerCase());
  return user || {};
}

function renderShareState() {
  const node = document.querySelector("#connectedChatShareState"); const button = document.querySelector(".connected-chat-share"); if (!node || !button) return;
  const context = currentScreenContext(); node.hidden = !chatState.shareScreen; node.textContent = chatState.shareScreen ? `Will share: ${context.label}` : ""; button.classList.toggle("active", chatState.shareScreen);
}

function renderChatView() {
  const home = document.querySelector("#connectedChatHome"); const thread = document.querySelector("#connectedChatThread"); if (!home || !thread) return;
  const active = Boolean(chatState.activeUser); home.hidden = active; thread.hidden = !active;
  if (!active) { renderChatList(); return; }
  const meta = activeUserMeta(); document.querySelector("#connectedChatThreadName").textContent = chatState.activeUser; document.querySelector("#connectedChatThreadMeta").textContent = [meta.role,meta.branchAccess].filter(Boolean).join(" · "); renderMessages(); renderShareState();
}

async function openConversation(userName) {
  chatState.activeUser = String(userName || "").trim(); chatState.messages = []; chatState.shareScreen = false; renderChatView();
  if (!chatState.activeUser) return;
  try {
    const result = await chatApi(`/api/chat/messages/${encodeURIComponent(chatState.activeUser)}`); chatState.messages = result.messages || []; renderMessages(); await markConversationRead();
    setTimeout(() => document.querySelector("#connectedChatInput")?.focus(), 80);
  } catch (error) { document.querySelector("#connectedChatMessages").innerHTML = `<div class="connected-chat-empty thread">${chatEsc(error.message)}</div>`; }
}

async function markConversationRead() {
  if (!chatState.activeUser) return; const lastId = Math.max(0, ...chatState.messages.map((item) => Number(item.id || 0)));
  try { await chatApi("/api/chat/read", { method:"POST", body:JSON.stringify({ withUser:chatState.activeUser, throughId:lastId }) }); } catch {}
}

async function sendChatMessage(event) {
  event.preventDefault(); if (!chatState.activeUser) return;
  const input = document.querySelector("#connectedChatInput"); const body = String(input?.value || "").trim();
  if (!body && !chatState.shareScreen) return;
  const context = chatState.shareScreen ? currentScreenContext() : {};
  const text = body || `Shared screen: ${context.label}`;
  const send = document.querySelector(".connected-chat-send"); if (send) send.disabled = true;
  try {
    const result = await chatApi("/api/chat/messages", { method:"POST", body:JSON.stringify({ to:chatState.activeUser, body:text, context }) });
    chatState.messages.push(result.message); if (input) input.value = ""; chatState.shareScreen = false; renderMessages(); renderShareState(); await refreshConversations();
  } catch (error) { window.alert(error.message || "Message could not be sent."); }
  finally { if (send) send.disabled = false; }
}

async function refreshConversations() {
  const [conversations, unread] = await Promise.all([chatApi("/api/chat/conversations"), chatApi("/api/chat/unread")]);
  chatState.conversations = conversations.conversations || []; chatState.unread = Number(unread.count || 0); updateBadge(); renderChatList();
}

async function pollActiveConversation() {
  if (!chatState.activeUser) return;
  // Reload the compact conversation window so read_at changes on messages we already rendered
  // are reflected promptly for the sender as a real read receipt.
  const result = await chatApi(`/api/chat/messages/${encodeURIComponent(chatState.activeUser)}`);
  chatState.messages = result.messages || [];
  renderMessages();
  await markConversationRead();
}

async function refreshChat(force = false) {
  if (chatState.polling) return; const currentToken = chatToken(); const shell = document.querySelector("#appShell"); const loggedIn = Boolean(currentToken && shell && !shell.classList.contains("is-hidden")); const launcher = document.querySelector("#connectedChatLauncher");
  if (!loggedIn || isCustomerChatSession()) { chatState.token = ""; chatState.loaded = false; if (launcher) launcher.hidden = true; setChatOpen(false, false); return; }
  if (!force && chatState.token === currentToken && chatState.loaded && !chatState.open) {
    try { const unread = await chatApi("/api/chat/unread", {}, 7000); chatState.unread = Number(unread.count || 0); updateBadge(); } catch {}
    return;
  }
  chatState.polling = true; chatState.token = currentToken;
  try {
    const [users] = await Promise.all([chatApi("/api/chat/users")]); chatState.users = users.users || []; await refreshConversations();
    if (chatState.open && chatState.activeUser) await pollActiveConversation();
    chatState.loaded = true; if (launcher) launcher.hidden = false; renderChatView();
  } catch { if (launcher) launcher.hidden = true; }
  finally { chatState.polling = false; }
}

ensureChatUi(); refreshChat(true);
const chatShell = document.querySelector("#appShell"); if (chatShell) new MutationObserver(() => refreshChat(true)).observe(chatShell, { attributes:true, attributeFilter:["class"] });
window.addEventListener("storage", () => refreshChat(true));
setInterval(() => refreshChat(false), 4500);

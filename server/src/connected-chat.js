const express = require("express");

const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 1200;

function cleanText(value, max = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function lower(value) {
  return cleanText(value, 300).toLowerCase();
}

async function loadActiveUser(query, userName) {
  const result = await query(
    `select user_name, role, branch_access, account_status, erp_portal_access, crm_portal_access
     from app_users
     where lower(user_name)=lower($1)
     limit 1`,
    [cleanText(userName, 200)]
  );
  const row = result.rows[0] || null;
  if (!row || lower(row.account_status || "Active") !== "active") return null;
  const admin = lower(row.role) === "admin";
  if (!admin && row.erp_portal_access !== true && row.crm_portal_access !== true) return null;
  return row;
}

function normalizeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    screen: cleanText(value.screen, 120),
    reference: cleanText(value.reference, 120),
    label: cleanText(value.label, 180)
  };
}

function publicMessage(row, currentUser) {
  let context = {};
  try { context = JSON.parse(row.context_json || "{}"); } catch { context = {}; }
  return {
    id: Number(row.id),
    senderUser: row.sender_user,
    recipientUser: row.recipient_user,
    body: row.body,
    context: normalizeContext(context),
    createdAt: row.created_at,
    readAt: row.read_at,
    mine: lower(row.sender_user) === lower(currentUser)
  };
}

function createConnectedChatRouter({ query, requireAppAuth }) {
  const router = express.Router();
  router.use(requireAppAuth);
  router.use((request, response, next) => {
    if (request.appSession?.employeePortal) {
      return response.status(403).json({ ok: false, error: "Connected Chat is available only inside the ERP and CRM portals." });
    }
    return next();
  });

  router.use(async (request, response, next) => {
    try {
      const current = await loadActiveUser(query, request.appSession?.userName);
      if (!current) return response.status(403).json({ ok: false, error: "This user account is not active." });
      request.chatUser = current;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  router.get("/users", async (request, response, next) => {
    try {
      const rows = (await query(
        `select user_name, role, branch_access
         from app_users
         where lower(coalesce(account_status,'Active'))='active'
           and (lower(trim(role))='admin' or coalesce(erp_portal_access,true)=true or coalesce(crm_portal_access,false)=true)
           and lower(user_name)<>lower($1)
         order by lower(user_name)`,
        [request.chatUser.user_name]
      )).rows;
      return response.json({ ok: true, users: rows.map((row) => ({ userName: row.user_name, role: row.role, branchAccess: row.branch_access })) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/conversations", async (request, response, next) => {
    try {
      const me = request.chatUser.user_name;
      const rows = (await query(
        `with mine as (
           select m.*,
                  case when lower(m.sender_user)=lower($1) then m.recipient_user else m.sender_user end as other_user
           from connected_chat_messages m
           where lower(m.sender_user)=lower($1) or lower(m.recipient_user)=lower($1)
         ), latest as (
           select distinct on (lower(other_user))
                  other_user, id, body, sender_user, recipient_user, created_at, read_at, context_json
           from mine
           order by lower(other_user), created_at desc, id desc
         ), unread as (
           select lower(sender_user) as other_key, count(*)::int as unread_count
           from connected_chat_messages
           where lower(recipient_user)=lower($1) and read_at is null
           group by lower(sender_user)
         )
         select l.*, coalesce(u.unread_count,0)::int as unread_count,
                au.role as other_role, au.branch_access as other_branch
         from latest l
         left join unread u on u.other_key=lower(l.other_user)
         left join app_users au on lower(au.user_name)=lower(l.other_user)
         order by l.created_at desc`,
        [me]
      )).rows;
      const conversations = rows.map((row) => ({
        otherUser: row.other_user,
        otherRole: row.other_role || "",
        otherBranch: row.other_branch || "",
        lastMessage: row.body,
        lastMessageAt: row.created_at,
        lastSender: row.sender_user,
        unreadCount: Number(row.unread_count || 0),
        context: (() => { try { return normalizeContext(JSON.parse(row.context_json || "{}")); } catch { return {}; } })()
      }));
      return response.json({ ok: true, conversations });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/messages/:otherUser", async (request, response, next) => {
    try {
      const me = request.chatUser.user_name;
      const other = cleanText(decodeURIComponent(request.params.otherUser || ""), 200);
      if (!other) return response.status(400).json({ ok: false, error: "Choose a user." });
      const target = await loadActiveUser(query, other);
      if (!target) return response.status(404).json({ ok: false, error: "User not found or inactive." });
      const after = Math.max(0, Number.parseInt(String(request.query.after || "0"), 10) || 0);
      const rows = (await query(
        `select id, sender_user, recipient_user, body, context_json, read_at, created_at
         from connected_chat_messages
         where id > $3
           and ((lower(sender_user)=lower($1) and lower(recipient_user)=lower($2))
             or (lower(sender_user)=lower($2) and lower(recipient_user)=lower($1)))
         order by id asc
         limit 200`,
        [me, target.user_name, after]
      )).rows;
      return response.json({ ok: true, messages: rows.map((row) => publicMessage(row, me)) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/messages", async (request, response, next) => {
    try {
      const me = request.chatUser.user_name;
      const to = cleanText(request.body?.to, 200);
      const rawBody = String(request.body?.body || "");
      const body = cleanText(rawBody, MAX_MESSAGE_CHARS);
      if (!to || !body) return response.status(400).json({ ok: false, error: "Recipient and message are required." });
      if (rawBody.length > MAX_MESSAGE_CHARS) return response.status(400).json({ ok: false, error: `Messages are limited to ${MAX_MESSAGE_CHARS} characters.` });
      if (lower(to) === lower(me)) return response.status(400).json({ ok: false, error: "Choose another user." });
      const target = await loadActiveUser(query, to);
      if (!target) return response.status(404).json({ ok: false, error: "Recipient not found or inactive." });
      const context = normalizeContext(request.body?.context);
      const contextJson = JSON.stringify(context).slice(0, MAX_CONTEXT_CHARS);
      const row = (await query(
        `insert into connected_chat_messages (sender_user, recipient_user, body, context_json)
         values ($1,$2,$3,$4)
         returning id, sender_user, recipient_user, body, context_json, read_at, created_at`,
        [me, target.user_name, body, contextJson]
      )).rows[0];
      return response.status(201).json({ ok: true, message: publicMessage(row, me) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/read", async (request, response, next) => {
    try {
      const me = request.chatUser.user_name;
      const other = cleanText(request.body?.withUser, 200);
      if (!other) return response.status(400).json({ ok: false, error: "Choose a conversation." });
      const throughId = Math.max(0, Number.parseInt(String(request.body?.throughId || "0"), 10) || 0);
      const params = [me, other];
      let throughClause = "";
      if (throughId) {
        params.push(throughId);
        throughClause = ` and id <= $${params.length}`;
      }
      const result = await query(
        `update connected_chat_messages
         set read_at=coalesce(read_at, now())
         where lower(recipient_user)=lower($1) and lower(sender_user)=lower($2) and read_at is null${throughClause}`,
        params
      );
      return response.json({ ok: true, updated: result.rowCount || 0 });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/unread", async (request, response, next) => {
    try {
      const result = await query(
        `select count(*)::int as count
         from connected_chat_messages
         where lower(recipient_user)=lower($1) and read_at is null`,
        [request.chatUser.user_name]
      );
      return response.json({ ok: true, count: Number(result.rows[0]?.count || 0) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createConnectedChatRouter };

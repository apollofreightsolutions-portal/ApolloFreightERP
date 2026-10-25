const express = require("express");
const { registerCrmReviews } = require("./crm-reviews");

function createCrmRouter({ query, requireAppAuth, sendMail }) {
  const router = express.Router();
  router.use(requireAppAuth);

  function cleanText(value, max = 5000) {
    return String(value ?? "").trim().slice(0, max);
  }

  function cleanNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function cleanInteger(value, fallback = 0) {
    return Math.trunc(cleanNumber(value, fallback));
  }

  function cleanDate(value) {
    const text = cleanText(value, 32);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function htmlEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  async function emailTaskAssignee(task, actor, event) {
    if (!sendMail || !task?.assigned_to) return "not_sent";
    try {
      const user = (await query(
        `select email from app_users
         where lower(trim(user_name))=lower(trim($1)) and lower(account_status)='active'
           and (crm_portal_access=true or lower(trim(role))='admin')
         limit 1`,
        [task.assigned_to]
      )).rows[0];
      if (!user?.email) return "not_sent";
      const title = cleanText(task.title, 500);
      const description = cleanText(task.description, 5000);
      const company = cleanText(task.company_name, 300);
      const dueDate = task.due_date ? String(task.due_date).slice(0, 10) : "Not specified";
      const subject = `Apollo Connected CRM | Task ${event}: ${title}`;
      const text = `${actor} ${event} a CRM task for you.\n\nTask: ${title}${company ? `\nAccount: ${company}` : ""}\nDue date: ${dueDate}${description ? `\n\nDetails:\n${description}` : ""}\n\nSign in to Apollo Connected CRM and open Follow-ups.`;
      const delivered = await sendMail({
        to: [user.email], subject, text,
        html: `<h2>Apollo Connected · CRM task ${htmlEscape(event)}</h2><p><strong>${htmlEscape(actor)}</strong> ${htmlEscape(event)} a task for you.</p><p><strong>Task:</strong> ${htmlEscape(title)}${company ? `<br><strong>Account:</strong> ${htmlEscape(company)}` : ""}<br><strong>Due date:</strong> ${htmlEscape(dueDate)}</p>${description ? `<p><strong>Details</strong></p><div style="white-space:pre-wrap">${htmlEscape(description)}</div>` : ""}<p>Sign in to Apollo Connected CRM and open Follow-ups.</p><p>This is an automated message.</p>`
      });
      return delivered?.accepted === true ? "accepted" : "not_sent";
    } catch (error) {
      console.warn("CRM task email was not accepted:", error?.status || "send_failed");
      return "not_sent";
    }
  }

  function bool(value) {
    return value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value || "").toLowerCase() === "yes";
  }

  function isAdminRole(row) {
    return String(row?.role || "").trim().toLowerCase() === "admin";
  }

  function crmPermissions(row) {
    const admin = isAdminRole(row);
    return {
      portalAccess: admin || Boolean(row.crm_portal_access),
      crmRole: admin ? "Management" : cleanText(row.crm_role || "Sales Executive", 100),
      viewAllAccounts: admin || Boolean(row.crm_view_all_accounts),
      manageAssignments: admin || Boolean(row.crm_manage_assignments),
      exportAccess: admin || Boolean(row.crm_export_access),
      archiveAccess: admin || Boolean(row.crm_archive_access),
      viewTeamReports: admin || Boolean(row.crm_view_team_reports),
      adminAccess: admin || Boolean(row.crm_admin_access)
    };
  }

  async function loadCrmUser(request, response, next) {
    try {
      if (!request.appSession?.crmPortal) {
        return response.status(403).json({ ok: false, error: "CRM Portal login is required." });
      }
      const userName = cleanText(request.appSession.userName, 200);
      const result = await query(
        `select user_name, email, role, account_status, branch_access,
                crm_portal_access, crm_role, crm_view_all_accounts, crm_manage_assignments,
                crm_export_access, crm_archive_access, crm_view_team_reports, crm_admin_access
         from app_users
         where lower(user_name) = lower($1)
         limit 1`,
        [userName]
      );
      const row = result.rows[0];
      if (!row || String(row.account_status || "Active").toLowerCase() !== "active") {
        return response.status(403).json({ ok: false, error: "This CRM user account is not active." });
      }
      const permissions = crmPermissions(row);
      if (!permissions.portalAccess) {
        return response.status(403).json({ ok: false, error: "CRM Portal access is not enabled for this account." });
      }
      request.crmUser = { ...row, permissions };
      return next();
    } catch (error) {
      return next(error);
    }
  }

  router.use(loadCrmUser);
  require("./crm-planning").registerPlanning({router,query,accountScope});
  require('./crm-database').registerDatabase({ router, query, accountScope });

  function requestIp(request) {
    return cleanText(request.headers["x-forwarded-for"] || request.ip || "", 200).split(",")[0].trim();
  }

  async function audit(request, { entityType, entityId, accountId = null, action, summary = "", details = {} }) {
    await query(
      `insert into crm_audit_log (entity_type, entity_id, account_id, action, actor_user_name, summary, details_json, ip_address)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        cleanText(entityType, 80),
        cleanText(entityId, 120),
        accountId ? Number(accountId) : null,
        cleanText(action, 80),
        request.crmUser.user_name,
        cleanText(summary, 1000),
        JSON.stringify(details || {}),
        requestIp(request)
      ]
    );
  }

  function accountScope(alias, user, values) {
    if (user.permissions.viewAllAccounts) return "1=1";
    values.push(user.user_name);
    return `lower(${alias}.assigned_to) = lower($${values.length})`;
  }

  registerCrmReviews({router, query, accountScope, sendMail});

  async function getAccountForUser(accountId, user, { includeArchived = false } = {}) {
    const values = [Number(accountId)];
    const scope = accountScope("a", user, values);
    const archived = includeArchived && user.permissions.archiveAccess ? "" : "and a.archived_at is null";
    const result = await query(
      `select a.* from crm_accounts a where a.id = $1 and ${scope} ${archived} limit 1`,
      values
    );
    return result.rows[0] || null;
  }

  async function requireAccount(request, response, accountId, options) {
    const account = await getAccountForUser(accountId, request.crmUser, options);
    if (!account) {
      response.status(404).json({ ok: false, error: "Account not found or not assigned to you." });
      return null;
    }
    return account;
  }

  function canEditAssignedUser(user, targetUserName) {
    return user.permissions.manageAssignments || cleanText(targetUserName, 200).toLowerCase() === cleanText(user.user_name, 200).toLowerCase();
  }

  async function transferAccountWork(accountId, fromUser, toUser) {
    const from = cleanText(fromUser, 200);
    const to = cleanText(toUser, 200);
    if (!accountId || !from || !to || from.toLowerCase() === to.toLowerCase()) return;

    // Preserve the relationship history but move active ownership with the Apollo account.
    // Only records still owned/assigned to the previous account owner are transferred;
    // deliberately delegated work assigned to a different colleague is left untouched.
    await query(
      `update crm_opportunities
       set owner_user_name=$2
       where account_id=$1 and lower(owner_user_name)=lower($3)`,
      [Number(accountId), to, from]
    );
    await query(
      `update crm_tasks
       set assigned_to=$2
       where account_id=$1 and lower(assigned_to)=lower($3) and lower(status) <> 'completed'`,
      [Number(accountId), to, from]
    );
  }

  router.get("/me", async (request, response) => {
    const user = request.crmUser;
    response.json({
      ok: true,
      user: {
        userName: user.user_name,
        email: user.email || "",
        role: user.role || "",
        branchAccess: user.branch_access || "",
        ...user.permissions
      }
    });
  });

  router.get("/users", async (request, response, next) => {
    try {
      if (!request.crmUser.permissions.manageAssignments && !request.crmUser.permissions.adminAccess) {
        return response.json({ ok: true, rows: [{ user_name: request.crmUser.user_name, crm_role: request.crmUser.permissions.crmRole }] });
      }
      const result = await query(
        `select user_name, email, role, account_status, branch_access, crm_role,
                crm_portal_access, crm_view_all_accounts, crm_manage_assignments, crm_export_access,
                crm_archive_access, crm_view_team_reports, crm_admin_access
         from app_users
         where crm_portal_access = true or lower(trim(role)) = 'admin'
         order by lower(user_name)`
      );
      response.json({ ok: true, rows: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard", async (request, response, next) => {
    try {
      const values = [];
      const scope = accountScope("a", request.crmUser, values);
      const accountResult = await query(
        `select
           count(*) filter (where a.archived_at is null) as accounts,
           count(*) filter (where a.archived_at is null and lower(a.status) in ('prospect','lead')) as prospects,
           count(*) filter (where a.archived_at is null and a.next_action_date is not null and a.next_action_date <= current_date + 7) as actions_due,
           coalesce(sum(a.potential_value) filter (where a.archived_at is null),0) as potential_value
         from crm_accounts a where ${scope}`,
        values
      );
      const oppValues = [];
      const oppScope = accountScope("a", request.crmUser, oppValues);
      const oppResult = await query(
        `select
           count(*) filter (where lower(o.status)='open') as open_opportunities,
           coalesce(sum(o.estimated_value) filter (where lower(o.status)='open'),0) as pipeline_value,
           coalesce(sum(o.estimated_value * o.probability / 100.0) filter (where lower(o.status)='open'),0) as weighted_pipeline,
           count(*) filter (where lower(o.status)='won' and o.updated_at >= date_trunc('month', now())) as won_this_month
         from crm_opportunities o
         join crm_accounts a on a.id=o.account_id
         where a.archived_at is null and ${oppScope}`,
        oppValues
      );
      const taskValues = [];
      const taskScope = accountScope("a", request.crmUser, taskValues);
      const tasks = await query(
        `select t.id,t.title,t.due_date,t.priority,t.status,t.assigned_to,a.company_name,a.id as account_id
         from crm_tasks t left join crm_accounts a on a.id=t.account_id
         where lower(t.status) <> 'completed'
           and (t.account_id is null and lower(t.assigned_to)=lower($${taskValues.push(request.crmUser.user_name)} )
                or t.account_id is not null and ${taskScope})
         order by t.due_date nulls last, t.created_at desc limit 8`,
        taskValues
      );
      const activityValues = [];
      const activityScope = accountScope("a", request.crmUser, activityValues);
      let activityWhere;
      if (request.crmUser.permissions.viewAllAccounts) {
        activityWhere = "1=1";
      } else {
        activityValues.push(request.crmUser.user_name);
        activityWhere = `(l.account_id is null and lower(l.actor_user_name)=lower($${activityValues.length})) or (l.account_id is not null and ${activityScope})`;
      }
      const activity = await query(
        `select l.id,l.entity_type,l.entity_id,l.action,l.actor_user_name,l.summary,l.created_at,a.company_name
         from crm_audit_log l
         left join crm_accounts a on a.id=l.account_id
         where ${activityWhere}
         order by l.created_at desc limit 10`,
        activityValues
      );
      response.json({ ok: true, summary: { ...accountResult.rows[0], ...oppResult.rows[0] }, tasks: tasks.rows, activity: activity.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/accounts", async (request, response, next) => {
    try {
      const values = [];
      const conditions = [accountScope("a", request.crmUser, values)];
      const includeArchived = bool(request.query.includeArchived) && request.crmUser.permissions.archiveAccess;
      if (!includeArchived) conditions.push("a.archived_at is null");
      const search = cleanText(request.query.search, 200);
      if (search) {
        values.push(`%${search}%`);
        conditions.push(`(a.company_name ilike $${values.length} or a.account_code ilike $${values.length} or a.assigned_to ilike $${values.length} or a.city ilike $${values.length})`);
      }
      const status = cleanText(request.query.status, 80);
      if (status && status.toLowerCase() !== "all") {
        values.push(status);
        conditions.push(`lower(a.status)=lower($${values.length})`);
      }
      const assignedTo = cleanText(request.query.assignedTo, 200);
      if (assignedTo && request.crmUser.permissions.viewAllAccounts) {
        values.push(assignedTo);
        conditions.push(`lower(a.assigned_to)=lower($${values.length})`);
      }
      const result = await query(
        `select a.*,
                (select count(*) from crm_contacts c where c.account_id=a.id) as contact_count,
                (select count(*) from crm_opportunities o where o.account_id=a.id and lower(o.status)='open') as open_opportunities,
                (select max(v.visit_date) from crm_visits v where v.account_id=a.id) as last_visit_date
         from crm_accounts a
         where ${conditions.join(" and ")}
         order by a.company_name asc limit 1000`,
        values
      );
      response.json({ ok: true, rows: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/accounts", async (request, response, next) => {
    try {
      const body = request.body || {};
      const companyName = cleanText(body.companyName || body.company_name, 300);
      if (!companyName) return response.status(400).json({ ok: false, error: "Company name is required." });
      let assignedTo = cleanText(body.assignedTo || body.assigned_to || request.crmUser.user_name, 200);
      if (!canEditAssignedUser(request.crmUser, assignedTo)) assignedTo = request.crmUser.user_name;
      if (request.crmUser.permissions.manageAssignments) {
        const check = await query(`select user_name from app_users where lower(user_name)=lower($1) and (crm_portal_access=true or lower(trim(role))='admin') and lower(account_status)='active' limit 1`, [assignedTo]);
        if (!check.rows[0]) return response.status(400).json({ ok: false, error: "Assigned salesperson must be an active CRM user." });
        assignedTo = check.rows[0].user_name;
      }
      const codeRow = await query(`select nextval('crm_account_code_seq') as n`);
      const accountCode = cleanText(body.accountCode || body.account_code, 80) || `CRM-${new Date().getFullYear()}-${String(codeRow.rows[0].n).padStart(5, "0")}`;
      const values = [
        accountCode, companyName, cleanText(body.legalName || body.legal_name, 300), cleanText(body.status || "Prospect", 80),
        cleanText(body.segment, 120), cleanText(body.industry, 120), cleanText(body.branch, 120), cleanText(body.territory, 120),
        assignedTo, request.crmUser.user_name, cleanText(body.source, 120), cleanText(body.website, 300), cleanText(body.phone, 120),
        cleanText(body.email, 250), cleanText(body.country, 120), cleanText(body.city, 120), cleanText(body.address, 1000),
        cleanText(body.servicesInterest || body.services_interest, 1000), cleanText(body.tradeLanes || body.trade_lanes, 1000),
        cleanNumber(body.estimatedMonthlyShipments || body.estimated_monthly_shipments), cleanNumber(body.potentialValue || body.potential_value),
        cleanText(body.currency || "AED", 12), cleanText(body.nextAction || body.next_action, 500), cleanDate(body.nextActionDate || body.next_action_date),
        cleanText(body.relationshipHealth || body.relationship_health || "New", 80), cleanText(body.notes, 5000), request.crmUser.user_name
      ];
      const result = await query(
        `insert into crm_accounts
          (account_code,company_name,legal_name,status,segment,industry,branch,territory,assigned_to,assigned_by,source,website,phone,email,country,city,address,services_interest,trade_lanes,estimated_monthly_shipments,potential_value,currency,next_action,next_action_date,relationship_health,notes,created_by)
         values (${values.map((_, i) => `$${i + 1}`).join(",")}) returning *`, values);
      const row = result.rows[0];
      await audit(request, { entityType: "account", entityId: row.id, accountId: row.id, action: "CREATE", summary: `Created account ${row.company_name}`, details: { accountCode: row.account_code, assignedTo: row.assigned_to } });
      response.status(201).json({ ok: true, row });
    } catch (error) { next(error); }
  });

  router.put("/accounts/:id", async (request, response, next) => {
    try {
      const id = Number(request.params.id);
      const current = await requireAccount(request, response, id, { includeArchived: true });
      if (!current) return;
      const body = request.body || {};
      let assignedTo = cleanText(body.assignedTo ?? body.assigned_to ?? current.assigned_to, 200);
      if (assignedTo.toLowerCase() !== String(current.assigned_to || "").toLowerCase() && !request.crmUser.permissions.manageAssignments) {
        return response.status(403).json({ ok: false, error: "You do not have permission to reassign accounts." });
      }
      if (request.crmUser.permissions.manageAssignments && assignedTo) {
        const check = await query(`select user_name from app_users where lower(user_name)=lower($1) and (crm_portal_access=true or lower(trim(role))='admin') and lower(account_status)='active' limit 1`, [assignedTo]);
        if (!check.rows[0]) return response.status(400).json({ ok: false, error: "Assigned salesperson must be an active CRM user." });
        assignedTo = check.rows[0].user_name;
      }
      const updated = {
        company_name: cleanText(body.companyName ?? body.company_name ?? current.company_name, 300),
        legal_name: cleanText(body.legalName ?? body.legal_name ?? current.legal_name, 300),
        status: cleanText(body.status ?? current.status, 80), segment: cleanText(body.segment ?? current.segment, 120),
        industry: cleanText(body.industry ?? current.industry, 120), branch: cleanText(body.branch ?? current.branch, 120),
        territory: cleanText(body.territory ?? current.territory, 120), assigned_to: assignedTo,
        source: cleanText(body.source ?? current.source, 120), website: cleanText(body.website ?? current.website, 300),
        phone: cleanText(body.phone ?? current.phone, 120), email: cleanText(body.email ?? current.email, 250),
        country: cleanText(body.country ?? current.country, 120), city: cleanText(body.city ?? current.city, 120),
        address: cleanText(body.address ?? current.address, 1000), services_interest: cleanText(body.servicesInterest ?? body.services_interest ?? current.services_interest, 1000),
        trade_lanes: cleanText(body.tradeLanes ?? body.trade_lanes ?? current.trade_lanes, 1000),
        estimated_monthly_shipments: cleanNumber(body.estimatedMonthlyShipments ?? body.estimated_monthly_shipments ?? current.estimated_monthly_shipments),
        potential_value: cleanNumber(body.potentialValue ?? body.potential_value ?? current.potential_value), currency: cleanText(body.currency ?? current.currency, 12),
        next_action: cleanText(body.nextAction ?? body.next_action ?? current.next_action, 500), next_action_date: cleanDate(body.nextActionDate ?? body.next_action_date ?? current.next_action_date),
        relationship_health: cleanText(body.relationshipHealth ?? body.relationship_health ?? current.relationship_health, 80), notes: cleanText(body.notes ?? current.notes, 5000)
      };
      const result = await query(
        `update crm_accounts set company_name=$1,legal_name=$2,status=$3,segment=$4,industry=$5,branch=$6,territory=$7,
          assigned_to=$8,assigned_by=case when lower(assigned_to)<>lower($8) then $9 else assigned_by end,
          assigned_at=case when lower(assigned_to)<>lower($8) then now() else assigned_at end,
          source=$10,website=$11,phone=$12,email=$13,country=$14,city=$15,address=$16,services_interest=$17,trade_lanes=$18,
          estimated_monthly_shipments=$19,potential_value=$20,currency=$21,next_action=$22,next_action_date=$23,relationship_health=$24,notes=$25
         where id=$26 returning *`,
        [updated.company_name,updated.legal_name,updated.status,updated.segment,updated.industry,updated.branch,updated.territory,updated.assigned_to,request.crmUser.user_name,updated.source,updated.website,updated.phone,updated.email,updated.country,updated.city,updated.address,updated.services_interest,updated.trade_lanes,updated.estimated_monthly_shipments,updated.potential_value,updated.currency,updated.next_action,updated.next_action_date,updated.relationship_health,updated.notes,id]
      );
      const row = result.rows[0];
      if (String(current.assigned_to || "").toLowerCase() !== String(row.assigned_to || "").toLowerCase()) {
        await transferAccountWork(id, current.assigned_to, row.assigned_to);
      }
      await audit(request, { entityType: "account", entityId: id, accountId: id, action: "UPDATE", summary: `Updated account ${row.company_name}`, details: { assignedFrom: current.assigned_to, assignedTo: row.assigned_to } });
      response.json({ ok: true, row });
    } catch (error) { next(error); }
  });

  router.post("/accounts/:id/archive", async (request, response, next) => {
    try {
      if (!request.crmUser.permissions.archiveAccess) return response.status(403).json({ ok: false, error: "Archive permission is required." });
      const id = Number(request.params.id);
      const current = await requireAccount(request, response, id, { includeArchived: true });
      if (!current) return;
      const archive = request.body?.archive !== false;
      const result = await query(
        `update crm_accounts set archived_at=${archive ? "now()" : "null"}, archived_by=$2 where id=$1 returning *`,
        [id, request.crmUser.user_name]
      );
      await audit(request, { entityType: "account", entityId: id, accountId: id, action: archive ? "ARCHIVE" : "RESTORE", summary: `${archive ? "Archived" : "Restored"} account ${current.company_name}` });
      response.json({ ok: true, row: result.rows[0] });
    } catch (error) { next(error); }
  });

  async function listLinkedEntity(request, response, next, { table, alias, order, extraSelect = "", accountField = "account_id" }) {
    try {
      const values = [];
      const scope = accountScope("a", request.crmUser, values);
      const accountId = Number(request.query.accountId || 0);
      const conditions = ["a.archived_at is null", scope];
      if (accountId) { values.push(accountId); conditions.push(`${alias}.${accountField}=$${values.length}`); }
      const salesperson = cleanText(request.query.salesperson, 200);
      if (table === "crm_opportunities" && salesperson) {
        values.push(salesperson);
        conditions.push(`lower(coalesce(nullif(trim(o.owner_user_name),''),a.assigned_to))=lower($${values.length})`);
      }
      const result = await query(
        `select ${alias}.*, a.company_name, a.account_code, a.assigned_to ${extraSelect}
         from ${table} ${alias} join crm_accounts a on a.id=${alias}.${accountField}
         where ${conditions.join(" and ")} order by ${order} limit 1500`, values);
      response.json({ ok: true, rows: result.rows });
    } catch (error) { next(error); }
  }

  router.get("/contacts", (req,res,next) => listLinkedEntity(req,res,next,{ table:"crm_contacts", alias:"c", order:"c.is_primary desc, c.full_name asc" }));
  router.get("/opportunities", (req,res,next) => listLinkedEntity(req,res,next,{ table:"crm_opportunities", alias:"o", order:"case when lower(o.status)='open' then 0 else 1 end, o.expected_close_date nulls last, o.created_at desc" }));
  router.get("/visits", async (request,response,next) => {
    try {
      const values=[]; const scope=accountScope("a",request.crmUser,values); const accountId=Number(request.query.accountId||0); const conditions=["a.archived_at is null",scope];
      if(accountId){values.push(accountId);conditions.push(`v.account_id=$${values.length}`)}
      const salesperson=cleanText(request.query.salesperson,200);
      if(salesperson){values.push(salesperson);conditions.push(`lower(v.created_by)=lower($${values.length})`);}
      const result=await query(`select v.*,a.company_name,a.account_code,a.assigned_to,c.full_name as contact_name from crm_visits v join crm_accounts a on a.id=v.account_id left join crm_contacts c on c.id=v.contact_id where ${conditions.join(" and ")} order by v.visit_date desc,v.created_at desc limit 1500`,values);
      response.json({ok:true,rows:result.rows});
    } catch(error){next(error)}
  });
  router.get("/meetings", async (request,response,next) => {
    try {
      const values=[]; const scope=accountScope("a",request.crmUser,values); const accountId=Number(request.query.accountId||0); const conditions=["a.archived_at is null",scope];
      if(accountId){values.push(accountId);conditions.push(`m.account_id=$${values.length}`)}
      const result=await query(`select m.*,a.company_name,a.account_code,a.assigned_to,c.full_name as contact_name from crm_meetings m join crm_accounts a on a.id=m.account_id left join crm_contacts c on c.id=m.contact_id where ${conditions.join(" and ")} order by m.meeting_date desc,m.created_at desc limit 1500`,values);
      response.json({ok:true,rows:result.rows});
    } catch(error){next(error)}
  });
  router.get("/tasks", async (request,response,next) => {
    try {
      const values=[]; let where;
      if(request.crmUser.permissions.viewAllAccounts){ where="1=1"; }
      else { values.push(request.crmUser.user_name); where=`(lower(t.assigned_to)=lower($1) and (t.account_id is null or lower(a.assigned_to)=lower($1)))`; }
      const result=await query(`select t.*,a.company_name,a.account_code,o.opportunity_no,o.title as opportunity_title from crm_tasks t left join crm_accounts a on a.id=t.account_id left join crm_opportunities o on o.id=t.opportunity_id where ${where} order by case when lower(t.status)='completed' then 1 else 0 end,t.due_date nulls last,t.created_at desc limit 1500`,values);
      response.json({ok:true,rows:result.rows});
    } catch(error){next(error)}
  });

  async function validateLinkedRecord(response, config, normalized) {
    const required = { contact: ["full_name", "Contact name"], opportunity: ["title", "Opportunity title"], meeting: ["subject", "Meeting subject"] };
    const rule = required[config.entity];
    if (rule && !cleanText(normalized[rule[0]], 500)) {
      response.status(400).json({ ok: false, error: `${rule[1]} is required.` });
      return false;
    }
    if ((config.entity === "visit" || config.entity === "meeting") && normalized.contact_id) {
      const contact = await query(`select id from crm_contacts where id=$1 and account_id=$2 limit 1`, [normalized.contact_id, normalized.account_id]);
      if (!contact.rows[0]) {
        response.status(400).json({ ok: false, error: "The selected contact does not belong to this account." });
        return false;
      }
    }
    return true;
  }

  async function insertLinked(request, response, next, config) {
    try {
      const body=request.body||{}; const accountId=Number(body.accountId||body.account_id||0);
      const account=await requireAccount(request,response,accountId); if(!account)return;
      const normalized=config.normalize(body, request.crmUser, account);
      if (config.entity === "opportunity" && !request.crmUser.permissions.manageAssignments) normalized.owner_user_name = account.assigned_to;
      if (config.entity === "visit" && !(await require("./crm-planning").validateVisit(query,normalized,request.crmUser,response))) return;
      if (!(await validateLinkedRecord(response, config, normalized))) return;
      const columns=Object.keys(normalized); const values=Object.values(normalized);
      const result=await query(`insert into ${config.table} (${columns.join(",")}) values (${values.map((_,i)=>`$${i+1}`).join(",")}) returning *`,values);
      const row=result.rows[0]; await audit(request,{entityType:config.entity,entityId:row.id,accountId,action:"CREATE",summary:`Created ${config.label} for ${account.company_name}`});
      response.status(201).json({ok:true,row});
    }catch(error){next(error)}
  }

  async function updateLinked(request,response,next,config){
    try{
      const id=Number(request.params.id);
      const currentResult=await query(`select ${config.alias}.*,a.assigned_to,a.company_name from ${config.table} ${config.alias} join crm_accounts a on a.id=${config.alias}.account_id where ${config.alias}.id=$1 limit 1`,[id]);
      const current=currentResult.rows[0]; if(!current)return response.status(404).json({ok:false,error:`${config.label} not found.`});
      const account=await requireAccount(request,response,current.account_id); if(!account)return;
      const merged={...current,...request.body,accountId:current.account_id}; const normalized=config.normalize(merged,request.crmUser,account);
      if (config.entity === "opportunity" && !request.crmUser.permissions.manageAssignments) normalized.owner_user_name = account.assigned_to;
      if (config.entity === "visit" && !(await require("./crm-planning").validateVisit(query,normalized,request.crmUser,response,current.salesperson||current.created_by))) return;
      if (!(await validateLinkedRecord(response, config, normalized))) return;
      delete normalized.account_id; delete normalized.created_by;
      const columns=Object.keys(normalized); const values=Object.values(normalized); values.push(id);
      const result=await query(`update ${config.table} set ${columns.map((c,i)=>`${c}=$${i+1}`).join(",")} where id=$${values.length} returning *`,values);
      await audit(request,{entityType:config.entity,entityId:id,accountId:current.account_id,action:"UPDATE",summary:`Updated ${config.label} for ${account.company_name}`});
      response.json({ok:true,row:result.rows[0]});
    }catch(error){next(error)}
  }

  const linkedConfigs={
    contacts:{table:"crm_contacts",alias:"c",entity:"contact",label:"contact",normalize:(b,u)=>({account_id:Number(b.accountId||b.account_id),full_name:cleanText(b.fullName||b.full_name,250),job_title:cleanText(b.jobTitle||b.job_title,200),department:cleanText(b.department,160),email:cleanText(b.email,250),mobile:cleanText(b.mobile,120),phone:cleanText(b.phone,120),whatsapp:cleanText(b.whatsapp,120),linkedin:cleanText(b.linkedin,500),is_primary:bool(b.isPrimary??b.is_primary),influence_level:cleanText(b.influenceLevel||b.influence_level,80),preferred_contact_method:cleanText(b.preferredContactMethod||b.preferred_contact_method,80),birthday:cleanDate(b.birthday),notes:cleanText(b.notes,5000),created_by:u.user_name})},
    opportunities:{table:"crm_opportunities",alias:"o",entity:"opportunity",label:"opportunity",normalize:(b,u,a)=>({account_id:Number(b.accountId||b.account_id),opportunity_no:cleanText(b.opportunityNo||b.opportunity_no,80),title:cleanText(b.title,300),owner_user_name:cleanText(b.ownerUserName||b.owner_user_name||a.assigned_to,200),stage:cleanText(b.stage||"Qualification",100),status:cleanText(b.status||"Open",80),service_type:cleanText(b.serviceType||b.service_type,160),origin:cleanText(b.origin,160),destination:cleanText(b.destination,160),estimated_value:cleanNumber(b.estimatedValue||b.estimated_value),currency:cleanText(b.currency||"AED",12),probability:Math.max(0,Math.min(100,cleanInteger(b.probability,25))),expected_close_date:cleanDate(b.expectedCloseDate||b.expected_close_date),competitor:cleanText(b.competitor,250),next_step:cleanText(b.nextStep||b.next_step,1000),next_step_date:cleanDate(b.nextStepDate||b.next_step_date),lost_reason:cleanText(b.lostReason||b.lost_reason,1000),notes:cleanText(b.notes,5000),created_by:u.user_name})},
    visits:{table:"crm_visits",alias:"v",entity:"visit",label:"visit",normalize:(b,u)=>({...require("./crm-planning").visitFields(b,u),account_id:Number(b.accountId||b.account_id),contact_id:Number(b.contactId||b.contact_id)||null,visit_date:cleanDate(b.visitDate||b.visit_date)||new Date().toISOString().slice(0,10),visit_time:cleanText(b.visitTime||b.visit_time,20),visit_type:cleanText(b.visitType||b.visit_type||"Client Visit",100),location:cleanText(b.location,500),attendees:cleanText(b.attendees,1000),purpose:cleanText(b.purpose,3000),outcome:cleanText(b.outcome,5000),next_step:cleanText(b.nextStep||b.next_step,2000),follow_up_date:cleanDate(b.followUpDate||b.follow_up_date),notes:cleanText(b.notes,5000),created_by:u.user_name})},
    meetings:{table:"crm_meetings",alias:"m",entity:"meeting",label:"meeting minutes",normalize:(b,u)=>({account_id:Number(b.accountId||b.account_id),contact_id:Number(b.contactId||b.contact_id)||null,meeting_date:cleanDate(b.meetingDate||b.meeting_date)||new Date().toISOString().slice(0,10),meeting_time:cleanText(b.meetingTime||b.meeting_time,20),meeting_type:cleanText(b.meetingType||b.meeting_type||"In Person",100),subject:cleanText(b.subject,500),attendees:cleanText(b.attendees,1500),minutes:cleanText(b.minutes,15000),decisions:cleanText(b.decisions,8000),action_items:cleanText(b.actionItems||b.action_items,8000),follow_up_date:cleanDate(b.followUpDate||b.follow_up_date),document_link:cleanText(b.documentLink||b.document_link,1000),created_by:u.user_name})}
  };

  router.post("/opportunities", async (request,response,next)=>{
    try{
      if(!request.body.opportunityNo&&!request.body.opportunity_no){const r=await query(`select nextval('crm_opportunity_no_seq') as n`);request.body.opportunityNo=`OPP-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(5,"0")}`;}
      return insertLinked(request,response,next,linkedConfigs.opportunities);
    }catch(error){next(error)}
  });
  router.post("/contacts",(req,res,next)=>insertLinked(req,res,next,linkedConfigs.contacts));
  router.post("/visits",(req,res,next)=>insertLinked(req,res,next,linkedConfigs.visits));
  router.post("/meetings",(req,res,next)=>insertLinked(req,res,next,linkedConfigs.meetings));
  router.put("/contacts/:id",(req,res,next)=>updateLinked(req,res,next,linkedConfigs.contacts));
  router.put("/opportunities/:id",(req,res,next)=>updateLinked(req,res,next,linkedConfigs.opportunities));
  router.put("/visits/:id",(req,res,next)=>updateLinked(req,res,next,linkedConfigs.visits));
  router.put("/meetings/:id",(req,res,next)=>updateLinked(req,res,next,linkedConfigs.meetings));

  router.post("/tasks", async(request,response,next)=>{
    try{
      const b=request.body||{}; const accountId=Number(b.accountId||b.account_id)||null;
      if(accountId){const a=await requireAccount(request,response,accountId);if(!a)return;}
      const title=cleanText(b.title,500);
      if(!title)return response.status(400).json({ok:false,error:"Task title is required."});
      const opportunityId=Number(b.opportunityId||b.opportunity_id)||null;
      if(opportunityId){
        if(!accountId)return response.status(400).json({ok:false,error:"An opportunity task must be linked to its account."});
        const opportunity=await query(`select id from crm_opportunities where id=$1 and account_id=$2 limit 1`,[opportunityId,accountId]);
        if(!opportunity.rows[0])return response.status(400).json({ok:false,error:"The selected opportunity does not belong to this account."});
      }
      let assignedTo=cleanText(b.assignedTo||b.assigned_to||request.crmUser.user_name,200);
      if(!request.crmUser.permissions.manageAssignments) assignedTo=request.crmUser.user_name;
      const result=await query(`insert into crm_tasks(account_id,opportunity_id,assigned_to,title,description,due_date,priority,status,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[accountId,opportunityId,assignedTo,title,cleanText(b.description,5000),cleanDate(b.dueDate||b.due_date),cleanText(b.priority||"Normal",80),cleanText(b.status||"Open",80),request.crmUser.user_name]);
      await audit(request,{entityType:"task",entityId:result.rows[0].id,accountId,action:"CREATE",summary:`Created follow-up task: ${result.rows[0].title}`});
      const task=result.rows[0];
      if(accountId) task.company_name=(await query(`select company_name from crm_accounts where id=$1 limit 1`,[accountId])).rows[0]?.company_name||"";
      const emailStatus=await emailTaskAssignee(task,request.crmUser.user_name,"assigned");
      response.status(201).json({ok:true,row:task,emailStatus});
    }catch(error){next(error)}
  });

  router.put("/tasks/:id", async(request,response,next)=>{
    try{
      const id=Number(request.params.id); const current=(await query(`select t.*,a.assigned_to as account_owner from crm_tasks t left join crm_accounts a on a.id=t.account_id where t.id=$1 limit 1`,[id])).rows[0];
      if(!current)return response.status(404).json({ok:false,error:"Task not found."});
      if(current.account_id){const a=await requireAccount(request,response,current.account_id);if(!a)return;} else if(!request.crmUser.permissions.viewAllAccounts&&String(current.assigned_to).toLowerCase()!==String(request.crmUser.user_name).toLowerCase()) return response.status(403).json({ok:false,error:"This task is not assigned to you."});
      const b={...current,...request.body}; let assignedTo=cleanText(b.assignedTo||b.assigned_to||current.assigned_to,200); if(!request.crmUser.permissions.manageAssignments)assignedTo=request.crmUser.user_name;
      const title=cleanText(b.title||current.title,500); if(!title)return response.status(400).json({ok:false,error:"Task title is required."});
      const status=cleanText(b.status||current.status,80); const result=await query(`update crm_tasks set assigned_to=$1,title=$2,description=$3,due_date=$4,priority=$5,status=$6,completed_at=case when lower($6)='completed' then coalesce(completed_at,now()) else null end where id=$7 returning *`,[assignedTo,title,cleanText(b.description||current.description,5000),cleanDate(b.dueDate||b.due_date||current.due_date),cleanText(b.priority||current.priority,80),status,id]);
      await audit(request,{entityType:"task",entityId:id,accountId:current.account_id,action:"UPDATE",summary:`Updated follow-up task: ${result.rows[0].title}`});
      const task=result.rows[0];
      const reassigned=String(current.assigned_to||"").trim().toLowerCase()!==String(task.assigned_to||"").trim().toLowerCase();
      if(reassigned && current.account_id) task.company_name=(await query(`select company_name from crm_accounts where id=$1 limit 1`,[current.account_id])).rows[0]?.company_name||"";
      const emailStatus=reassigned?await emailTaskAssignee(task,request.crmUser.user_name,"reassigned"):"not_sent";
      response.json({ok:true,row:task,emailStatus});
    }catch(error){next(error)}
  });

  router.get("/activity", async(request,response,next)=>{
    try{
      const values=[]; const scope=accountScope("a",request.crmUser,values); const accountId=Number(request.query.accountId||0); let visibility;
      if(request.crmUser.permissions.viewAllAccounts) visibility="1=1";
      else { values.push(request.crmUser.user_name); visibility=`(l.account_id is null and lower(l.actor_user_name)=lower($${values.length})) or (l.account_id is not null and ${scope})`; }
      const conditions=[`(${visibility})`];
      if(accountId){values.push(accountId);conditions.push(`l.account_id=$${values.length}`)}
      const result=await query(`select l.*,a.company_name,a.account_code from crm_audit_log l left join crm_accounts a on a.id=l.account_id where ${conditions.join(" and ")} order by l.created_at desc limit 2000`,values); response.json({ok:true,rows:result.rows});
    }catch(error){next(error)}
  });

  router.get("/reports", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.viewTeamReports && request.crmUser.permissions.viewAllAccounts) return response.status(403).json({ok:false,error:"CRM reporting permission is required."});
      const values=[]; const scope=accountScope("a",request.crmUser,values);
      const byOwner=await query(`
        with per_account as (
          select a.id,a.assigned_to,
                 (select count(*) from crm_opportunities o where o.account_id=a.id and lower(o.status)='open') as open_opportunities,
                 (select coalesce(sum(o.estimated_value),0) from crm_opportunities o where o.account_id=a.id and lower(o.status)='open') as pipeline_value,
                 (select count(*) from crm_visits v where v.account_id=a.id and v.visit_date>=current_date-30) as visits,
                 (select count(*) from crm_meetings m where m.account_id=a.id and m.meeting_date>=current_date-30) as meetings
          from crm_accounts a where a.archived_at is null and ${scope}
        )
        select assigned_to,count(*) as accounts,sum(open_opportunities) as open_opportunities,coalesce(sum(pipeline_value),0) as pipeline_value,sum(visits) as visits,sum(meetings) as meetings
        from per_account group by assigned_to order by pipeline_value desc`,values);
      const stageValues=[]; const stageScope=accountScope("a",request.crmUser,stageValues); const byStage=await query(`select o.stage,count(*) as opportunities,coalesce(sum(o.estimated_value),0) as value from crm_opportunities o join crm_accounts a on a.id=o.account_id where a.archived_at is null and lower(o.status)='open' and ${stageScope} group by o.stage order by value desc`,stageValues);
      const sourceValues=[]; const sourceScope=accountScope("a",request.crmUser,sourceValues); const bySource=await query(`select coalesce(nullif(a.source,''),'Unspecified') as source,count(*) as accounts from crm_accounts a where a.archived_at is null and ${sourceScope} group by 1 order by accounts desc`,sourceValues);
      response.json({ok:true,byOwner:byOwner.rows,byStage:byStage.rows,bySource:bySource.rows});
    }catch(error){next(error)}
  });

  router.post("/reassign", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.manageAssignments)return response.status(403).json({ok:false,error:"Account assignment permission is required."});
      const fromUser=cleanText(request.body?.fromUser,200); const toUser=cleanText(request.body?.toUser,200); const accountIds=Array.isArray(request.body?.accountIds)?request.body.accountIds.map(Number).filter(Boolean):[];
      if(!toUser)return response.status(400).json({ok:false,error:"Select the salesperson who will receive the accounts."});
      const target=(await query(`select user_name from app_users where lower(user_name)=lower($1) and (crm_portal_access=true or lower(trim(role))='admin') and lower(account_status)='active' limit 1`,[toUser])).rows[0]; if(!target)return response.status(400).json({ok:false,error:"The new owner must be an active CRM user."});
      const values=[target.user_name,request.crmUser.user_name]; let where="a.archived_at is null";
      if(accountIds.length){values.push(accountIds);where+=` and a.id=any($${values.length}::bigint[])`;} else if(fromUser){values.push(fromUser);where+=` and lower(a.assigned_to)=lower($${values.length})`;} else return response.status(400).json({ok:false,error:"Select a current owner or specific accounts to reassign."});
      const result=await query(`
        with selected as (
          select a.id,a.assigned_to as previous_owner
          from crm_accounts a
          where ${where}
          for update
        ), updated as (
          update crm_accounts a
          set assigned_to=$1,assigned_by=$2,assigned_at=now()
          from selected s
          where a.id=s.id
          returning a.id,a.company_name,a.account_code,a.assigned_to,s.previous_owner
        )
        select * from updated`,values);
      for(const row of result.rows){
        await transferAccountWork(row.id,row.previous_owner,row.assigned_to);
        await audit(request,{entityType:"account",entityId:row.id,accountId:row.id,action:"REASSIGN",summary:`Reassigned ${row.company_name} to ${row.assigned_to}`,details:{fromUser:row.previous_owner,toUser:row.assigned_to}});
      }
      response.json({ok:true,count:result.rowCount,rows:result.rows});
    }catch(error){next(error)}
  });

  router.get("/audit", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.adminAccess&&!request.crmUser.permissions.viewTeamReports)return response.status(403).json({ok:false,error:"CRM audit permission is required."});
      const result=await query(`select l.*,a.company_name,a.account_code from crm_audit_log l left join crm_accounts a on a.id=l.account_id order by l.created_at desc limit 3000`); response.json({ok:true,rows:result.rows});
    }catch(error){next(error)}
  });

  router.get("/admin/users", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.adminAccess)return response.status(403).json({ok:false,error:"CRM Admin permission is required."});
      const result=await query(`select user_name,email,role,account_status,branch_access,crm_portal_access,crm_role,crm_view_all_accounts,crm_manage_assignments,crm_export_access,crm_archive_access,crm_view_team_reports,crm_admin_access from app_users order by lower(user_name)`);response.json({ok:true,rows:result.rows});
    }catch(error){next(error)}
  });

  router.put("/admin/users/:userName", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.adminAccess)return response.status(403).json({ok:false,error:"CRM Admin permission is required."});
      const userName=decodeURIComponent(request.params.userName); const b=request.body||{};
      const result=await query(`update app_users set crm_portal_access=$1,crm_role=$2,crm_view_all_accounts=$3,crm_manage_assignments=$4,crm_export_access=$5,crm_archive_access=$6,crm_view_team_reports=$7,crm_admin_access=$8 where lower(user_name)=lower($9) returning user_name,email,role,account_status,branch_access,crm_portal_access,crm_role,crm_view_all_accounts,crm_manage_assignments,crm_export_access,crm_archive_access,crm_view_team_reports,crm_admin_access`,[bool(b.crmPortalAccess??b.crm_portal_access),cleanText((b.crmRole ?? b.crm_role ?? "Sales Executive"),100),bool(b.crmViewAllAccounts??b.crm_view_all_accounts),bool(b.crmManageAssignments??b.crm_manage_assignments),bool(b.crmExportAccess??b.crm_export_access),bool(b.crmArchiveAccess??b.crm_archive_access),bool(b.crmViewTeamReports??b.crm_view_team_reports),bool(b.crmAdminAccess??b.crm_admin_access),userName]);
      if(!result.rows[0])return response.status(404).json({ok:false,error:"User not found."}); await audit(request,{entityType:"crm_user_permissions",entityId:result.rows[0].user_name,action:"UPDATE",summary:`Updated CRM permissions for ${result.rows[0].user_name}`}); response.json({ok:true,row:result.rows[0]});
    }catch(error){next(error)}
  });

  function csvCell(value){const text=String(value??"");return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
  router.get("/export/:entity", async(request,response,next)=>{
    try{
      if(!request.crmUser.permissions.exportAccess)return response.status(403).json({ok:false,error:"CRM export/download permission is not enabled for this account."});
      const entity=cleanText(request.params.entity,50).toLowerCase(); const allowed={accounts:{table:"crm_accounts",alias:"a",cols:["account_code","company_name","status","segment","industry","branch","territory","assigned_to","source","country","city","services_interest","trade_lanes","potential_value","currency","next_action","next_action_date"]},opportunities:{table:"crm_opportunities",alias:"o",cols:["opportunity_no","title","stage","status","service_type","origin","destination","estimated_value","currency","probability","expected_close_date","owner_user_name"]}}; const cfg=allowed[entity]; if(!cfg)return response.status(400).json({ok:false,error:"This CRM export is not available."});
      const values=[]; let scope=accountScope("a",request.crmUser,values);
      const salesperson=cleanText(request.query.salesperson,200);
      if(entity==="opportunities"&&salesperson){values.push(salesperson);scope+=` and lower(coalesce(nullif(trim(o.owner_user_name),''),a.assigned_to))=lower($${values.length})`;}
      let sql;if(entity==="accounts")sql=`select ${cfg.cols.map(c=>`a.${c}`).join(",")} from crm_accounts a where a.archived_at is null and ${scope} order by a.company_name`;else sql=`select ${cfg.cols.map(c=>`o.${c}`).join(",")},a.company_name from crm_opportunities o join crm_accounts a on a.id=o.account_id where a.archived_at is null and ${scope} order by o.created_at desc`;
      const result=await query(sql,values); const headers=Object.keys(result.rows[0]||Object.fromEntries(cfg.cols.map(c=>[c,""]))); const csv=[headers.join(","),...result.rows.map(r=>headers.map(h=>csvCell(r[h])).join(","))].join("\n"); response.setHeader("Content-Type","text/csv; charset=utf-8"); response.setHeader("Content-Disposition",`attachment; filename=apollo-crm-${entity}-${new Date().toISOString().slice(0,10)}.csv`); response.send(csv);
    }catch(error){next(error)}
  });

  return router;
}

module.exports = { createCrmRouter };

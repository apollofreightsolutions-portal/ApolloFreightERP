const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const { allowedOrigins, autoMigrate, configuredSecret, databaseHost, databaseUrl, databaseUrlSource, isCloudSqlSocket, isNeonDatabase, port } = require("./config");
const { getPool, query, testConnection } = require("./db");
const { runMigrations } = require("./migrate");
const { authRouter: maintenanceAuthRouter } = require("./maintenance/routes/auth");
const { expensesRouter: maintenanceExpensesRouter } = require("./maintenance/routes/expenses");
const { usersRouter: maintenanceUsersRouter } = require("./maintenance/routes/users");
const { vehiclesRouter: maintenanceVehiclesRouter } = require("./maintenance/routes/vehicles");
const { healthRouter: maintenanceHealthRouter } = require("./maintenance/routes/health");

const app = express();
app.set("trust proxy", 1);
const EMPLOYEE_DOCUMENT_TYPES = {
  "Employee Photo": { kind: "image", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "PHOTO", privateAsset: false },
  "Civil ID Front": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "CIVIL-FRONT", privateAsset: true },
  "Civil ID Back": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "CIVIL-BACK", privateAsset: true },
  "Passport Front": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "PASS-FRONT", privateAsset: true },
  "Passport Back": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "PASS-BACK", privateAsset: true },
  "Work Permit": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "WORK-PERMIT", privateAsset: true },
  "Other": { kind: "raw", mimeTypes: new Set(["application/pdf", "image/jpeg", "image/png"]), maxBytes: 10 * 1024 * 1024, code: "OTHER", privateAsset: true }
};
const EMPLOYEE_DOCUMENT_TYPE_NAMES = new Set(Object.keys(EMPLOYEE_DOCUMENT_TYPES));

function employeeDocumentType(value) {
  return EMPLOYEE_DOCUMENT_TYPES[String(value || "").trim()] || null;
}

function safeEmployeeDocumentPart(value) {
  return String(value || "").trim().replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "employee";
}

function cloudinaryConfig() {
  const value = String(process.env.CLOUDINARY_URL || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "cloudinary:" || !url.username || !url.password || !url.hostname) return null;
    return { apiKey: decodeURIComponent(url.username), apiSecret: decodeURIComponent(url.password), cloudName: url.hostname };
  } catch {
    return null;
  }
}

function employeeDocumentNo(userName, typeConfig) {
  return `EMP-${safeEmployeeDocumentPart(userName).toUpperCase()}-${typeConfig.code}`;
}

function cloudinaryPrivateDownloadUrl(cloudinary, { publicId, fileName, resourceType }) {
  const format = path.extname(String(fileName || "")).replace(/^\./, "").toLowerCase();
  if (!publicId || !format || !resourceType) return "";
  const timestamp = Math.floor(Date.now() / 1000);
  const expiresAt = timestamp + (10 * 60);
  const signatureParams = `expires_at=${expiresAt}&format=${format}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(signatureParams + cloudinary.apiSecret).digest("hex");
  const query = new URLSearchParams({
    timestamp: String(timestamp),
    public_id: publicId,
    format,
    expires_at: String(expiresAt),
    signature,
    api_key: cloudinary.apiKey
  });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/${encodeURIComponent(resourceType)}/download?${query.toString()}`;
}
const webDirCandidates = [path.resolve(__dirname, "..", "web"), path.resolve(__dirname, "..", "..", "web")];
const webDir = webDirCandidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) || webDirCandidates[0];
const webIndex = path.join(webDir, "index.html");
const runtimeStatus = {
  autoMigrate,
  databaseConfigured: Boolean(databaseUrl),
  databaseUrlSource: databaseUrlSource || "missing",
  migration: autoMigrate ? "pending" : "disabled",
  loginSecret: configuredSecret ? "configured" : "pending",
  // allowedOrigins defaults to ["*"] (see config.js) when ALLOWED_ORIGIN isn't set. Combined with
  // credentials: true on the cors() middleware below, that means any origin's credentialed request
  // gets reflected back and allowed - fine for same-origin-only deployments (this app's normal
  // setup), but worth being able to see at a glance rather than discovering it during an audit.
  corsPolicy: allowedOrigins.includes("*") ? "open (ALLOWED_ORIGIN not set)" : "restricted",
  startupError: databaseUrl
    ? ""
    : "No database connection string was found. Set DATABASE_URL or one of the supported PostgreSQL aliases."
};

if (allowedOrigins.includes("*")) {
  console.warn(
    "CORS is open to all origins (ALLOWED_ORIGIN is not set) with credentials enabled. This is fine " +
    "if the frontend and API are only ever called from origins you control, but set ALLOWED_ORIGIN to " +
    "your production domain(s) to lock this down."
  );
}

// The token signing secret. Starts with the configured value, or a process-local fallback while
// the database-backed shared secret is initialized in the background. The HTTP server and login
// route remain responsive while migrations complete.
let customerPortalSecret = configuredSecret || crypto.randomBytes(32).toString("hex");
let startupReady = false;
let startupReadyPromise = Promise.resolve();

async function ensurePortalSecret() {
  try {
    // The unified PostgreSQL database is the single source of truth. This
    // deliberately checks the database before any legacy Render environment
    // secret so both ERP-issued and Maintenance-validated tokens converge.
    const existing = await query("select secret_value from system_secrets where secret_key = $1 limit 1", [
      "customer_portal_secret"
    ]);
    if (existing.rows[0]?.secret_value) {
      customerPortalSecret = existing.rows[0].secret_value;
      runtimeStatus.loginSecret = "persisted";
      return customerPortalSecret;
    }

    const generated = crypto.randomBytes(32).toString("hex");
    // ON CONFLICT DO NOTHING: if another instance is cold-starting at the same moment and wins the
    // race to insert first, we don't want to clobber its value - we want to converge on whichever
    // one landed first, so every instance ends up signing/verifying with the same secret.
    await query(
      "insert into system_secrets (secret_key, secret_value) values ($1, $2) on conflict (secret_key) do nothing",
      ["customer_portal_secret", generated]
    );
    const finalRow = await query("select secret_value from system_secrets where secret_key = $1 limit 1", [
      "customer_portal_secret"
    ]);
    customerPortalSecret = finalRow.rows[0]?.secret_value || generated;
    runtimeStatus.loginSecret = "persisted";
    return customerPortalSecret;
  } catch (error) {
    console.warn(
      `Could not read or persist the shared login secret in the database (${error.message}). Falling back to the configured ` +
      "secret - existing sessions require the same CUSTOMER_PORTAL_SECRET on every service."
    );
    customerPortalSecret = customerPortalSecret || crypto.randomBytes(32).toString("hex");
    runtimeStatus.loginSecret = "unstable";
    return customerPortalSecret;
  }
}

// Simple in-memory rate limiter for auth-sensitive endpoints. Deliberately dependency-free and
// generous (won't interfere with normal usage/testing) - it only slows down rapid brute-force attempts.
function rateLimiter({ windowMs, max, keyFor }) {
  const hits = new Map();
  return (request, response, next) => {
    const key = (keyFor ? keyFor(request) : request.ip) || "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return response.status(429).json({ ok: false, error: "Too many attempts. Please wait a few minutes and try again." });
    }
    return next();
  };
}
const loginRateLimiter = rateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyFor: (request) => `${request.ip}:${String(request.body?.userName || request.body?.email || request.body?.customerCode || "").trim().toLowerCase()}`
});

const demoRows = {
  shipments: [
    {
      id: 1,
      job_no: "AFS-2605001",
      branch: "Kuwait HO",
      customer_name: "Gulf Retail Trading",
      origin: "Kuwait City",
      destination: "Riyadh",
      status: "Booked",
      pieces: 14,
      actual_kg: 820,
      cbm: 5.2,
      chargeable_kg: 1040,
      sell: 485,
      buy_cost: 330,
      pod_status: "Pending",
      invoice_status: "Unbilled",
      booking_date: "2026-05-05",
      airway_bill_no: "AWB-2605001",
      tariff_no: "TAR-1001",
      transit_days: 3,
      shipment_direction: "Export",
      shipment_service: "AE",
      shipment_service_other: "",
      volume_category: "Land",
      chargeable_divisor: 250,
      created_at: new Date().toISOString()
    }
  ],
  consolidations: [
    {
      id: 1,
      load_no: "CON-260501",
      trip_date: "2026-05-05",
      route: "Kuwait - Riyadh",
      transporter: "Al Dana Transport",
      vehicle_no: "KWT-49217",
      status: "Dispatched",
      pieces: 14,
      actual_kg: 820,
      cbm: 5.2,
      chargeable_kg: 1040,
      job_numbers: "AFS-2605001",
      manifest_status: "Not Generated",
      last_manifest_request_no: "",
      created_at: new Date().toISOString()
    }
  ],
  customers: [
    {
      id: 1,
      code: "CUS-001",
      name: "Gulf Retail Trading",
      location_or_lane: "Kuwait City",
      full_address: "Kuwait City, Kuwait",
      email: "ops@gulf-retail.example",
      terms: "30 days",
      status: "Active",
      is_account_overdue: false,
      branch: "Kuwait HO",
      created_at: new Date().toISOString()
    }
  ],
  suppliers: [
    {
      id: 1,
      code: "TRN-001",
      name: "Al Dana Transport",
      location_or_lane: "Kuwait - Riyadh",
      full_address: "Kuwait - Riyadh lane office",
      email: "dispatch@aldana.example",
      terms: "20 days",
      status: "Active",
      is_account_overdue: false,
      branch: "Kuwait HO",
      service_type: "Transporter",
      created_at: new Date().toISOString()
    }
  ],
  tariffs: [
    {
      id: 1,
      tariff_no: "TAR-1001",
      customer: "Gulf Retail Trading",
      origin: "Kuwait City",
      destination: "Riyadh",
      main_section: "FTL",
      weight_section: "Minimum",
      min_up_to: "100 KG",
      currency: "KD",
      weight_rates_json: JSON.stringify({ minimum: 0.42, upTo100: 0.42, upTo300: 0.42, upTo500: 0.42, upTo1000: 0.42, more: 0.42 }),
      rate_type: "Per KG",
      rate: 0.42,
      min_charge: 35,
      additional_charges_json: "[]",
      additional_charges_total: 0,
      grand_total: 35,
      volumetric_divisor: 5000,
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
      status: "Active"
    }
  ],
  documents: [
    {
      id: 1,
      document_no: "DOC-001",
      linked_no: "AFS-2605001",
      type: "Waybill",
      status: "Issued",
      date: "2026-05-05",
      owner: "operations",
      file_name: "AFS-2605001-waybill.pdf"
    }
  ],
  invoices: [
    {
      id: 1,
      invoice_no: "INV-260001",
      customer: "Gulf Retail Trading",
      shipment_no: "AFS-2605004",
      revenue: 95,
      supplier_cost: 70,
      gross_profit: 25,
      status: "Sent",
      date: "2026-05-02"
    }
  ],
  users: [
    {
      id: 1,
      user_name: "admin",
      email: "admin@apollofreightsolution.com",
      role: "Admin",
      account_status: "Active",
      branch_access: "Both",
      branch_view_scope: "All Branches",
      section_access: "All",
      can_view_all_entry: true,
      can_view_only_self_entry: true,
      can_edit_all_entry: true,
      can_view_updated_history: true,
      notes: "Default test administrator"
    }
  ],
  "unblock-requests": [],
  "admin-requests": [],
  "additional-charges": [
    {
      id: 1,
      ref_no: "CHG-001",
      shipment_no: "AFS-2605001",
      charge_date: "2026-05-24",
      charge_type: "Labour Charges",
      charge_basis: "1 ton",
      supplier: "ABC Labour",
      reference_no: "LAB-5001",
      invoice_no: "INV-LAB-001",
      amount: 50,
      tax_percent: 10,
      tax_amount: 5,
      total_amount: 55,
      currency: "KWD",
      remarks: "Labour support at warehouse dock.",
      attachment_name: "",
      status: "Approved",
      requested_by: "admin",
      approved_by: "admin",
      approval_notes: "Approved by admin"
    }
  ],
  audit: [],
  employees: [
    {
      id: 1,
      user_name: "admin",
      employee_code: "EMP-0001",
      full_name: "System Administrator",
      department: "Management",
      designation: "Administrator",
      join_date: "2024-01-01",
      phone: "",
      personal_email: "",
      employment_status: "Active",
      reporting_manager: "",
      notes: "Demo employee record"
    }
  ],
  "leave-requests": [],
  payslips: [],
  "hr-announcements": [
    {
      id: 1,
      title: "Welcome to the HR Portal",
      body: "This is a demo announcement. Connect a database to start managing real employee records, leave requests, payslips, and announcements.",
      posted_by: "admin",
      audience: "All",
      pinned: true,
      posted_at: new Date().toISOString()
    }
  ],
  settings: [
    {
      id: 1,
      settings_key: "default",
      company_name: "APOLLO FREIGHT SOLUTIONS",
      company_logo_url: "",
      shipment_number_format: "AFS-SI###",
      invoice_number_format: "INV-YY###",
      default_volumetric_divisor: "5000",
      require_pod_before_invoice: "Yes",
      branches: "Kuwait HO, Dubai",
      dropdown_options: "{}"
    }
  ]
};

const CUSTOMER_PORTAL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const APP_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function normalizePortalStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isPortalActive(value) {
  return normalizePortalStatus(value) === "active";
}

function hashCustomerPassword(password, salt = crypto.randomBytes(8).toString("hex")) {
  const derived = crypto.pbkdf2Sync(String(password || ""), salt, 120000, 32, "sha256").toString("hex");
  return "pbkdf2$120000$" + salt + "$" + derived;
}

function verifyCustomerPassword(password, storedHash) {
  const text = String(storedHash || "");
  if (!text) return false;
  if (!text.startsWith("pbkdf2$")) return String(password || "") === text;
  const parts = text.split("$");
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1] || 120000);
  const salt = parts[2] || "";
  const expected = parts[3] || "";
  const actual = crypto.pbkdf2Sync(String(password || ""), salt, iterations, expected.length / 2, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return actual === expected;
  }
}

function signCustomerToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", customerPortalSecret).update(body).digest("base64url");
  return body + "." + signature;
}

function verifyCustomerToken(token) {
  const value = String(token || "").trim();
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const body = parts[0];
  const signature = parts[1];
  const expected = crypto.createHmac("sha256", customerPortalSecret).update(body).digest("base64url");
  if (expected !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload && payload.exp && Date.now() > Number(payload.exp)) return null;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function customerSessionFromRow(row) {
  const payload = {
    customerUserId: String(row.id || ""),
    customerCode: String(row.customer_code || "").trim(),
    customerName: String(row.customer_name || "").trim(),
    userName: String(row.username || "").trim(),
    email: String(row.email || "").trim(),
    role: "Customer",
    portal: "customer",
    branchAccess: String(row.customer_branch || row.branch || "Customer Portal").trim() || "Customer Portal",
    branchViewScope: "Assigned Branch Only",
    sectionAccess: "Dashboard, New Shipment, Shipments, Tracking, Profile, Notifications, Activity Logs",
    status: String(row.status || "ACTIVE").toUpperCase(),
    lastLogin: row.last_login || ""
  };

  return {
    ...payload,
    token: signCustomerToken({ ...payload, exp: Date.now() + CUSTOMER_PORTAL_TOKEN_TTL_MS })
  };
}

function customerPortalAuthFromRequest(request) {
  const bearer = String(request.headers.authorization || "").trim();
  const token = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : String(request.headers["x-customer-token"] || request.headers["x-portal-token"] || "").trim();
  return verifyCustomerToken(token);
}

function requireCustomerPortalAuth(request, response, next) {
  const session = customerPortalAuthFromRequest(request);
  if (!session) {
    return response.status(401).json({ ok: false, error: "Customer login required." });
  }

  request.customerSession = session;
  return next();
}

function appAuthFromRequest(request) {
  const bearer = String(request.headers.authorization || "").trim();
  const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  if (!token) return null;
  const payload = verifyCustomerToken(token);
  return payload && payload.portal === "app" ? payload : null;
}

function requireAppAuth(request, response, next) {
  const session = appAuthFromRequest(request);
  if (!session) {
    return response.status(401).json({ ok: false, error: "Login required." });
  }

  request.appSession = session;
  return next();
}

function requireEmployeePortalAuth(request, response, next) {
  const session = appAuthFromRequest(request);
  if (!session) return response.status(401).json({ ok: false, error: "Login required." });
  if (!session.employeePortal) return response.status(403).json({ ok: false, error: "Employee Portal login is required." });
  request.appSession = session;
  return next();
}
async function getCustomerAccount(identifier) {
  const result = await query(
    `select cu.id, cu.customer_code, cu.username, cu.email, cu.password_hash, cu.status, cu.last_login,
            c.name as customer_name, c.branch as customer_branch, c.status as customer_status
     from customer_users cu
     left join customers c on lower(c.code) = lower(cu.customer_code)
     where lower(cu.username) = lower($1) or lower(cu.email) = lower($1) or lower(cu.customer_code) = lower($1)
     limit 1`,
    [identifier]
  );

  return result.rows[0] || null;
}

async function loginCustomer(identifier, password) {
  const account = await getCustomerAccount(identifier);
  if (!account) return null;
  if (!isPortalActive(account.status)) return null;
  const customerLinked = account.customer_status !== null && account.customer_status !== undefined;
  if (customerLinked && !isPortalActive(account.customer_status)) return null;
  if (!verifyCustomerPassword(password, account.password_hash)) return null;

  await query(
    `update customer_users
     set last_login = now()
     where id = $1`,
    [account.id]
  );

  return customerSessionFromRow(account);
}

async function nextShipmentRequestNo() {
  const result = await query(
    `select request_no
     from shipment_requests
     order by id desc
     limit 1`
  );
  const last = String(result.rows[0]?.request_no || "");
  const match = last.match(/(\d+)$/);
  const nextNumber = match ? Number(match[1]) + 1 : 1;
  const year = String(new Date().getFullYear()).slice(-2);
  return "SRQ-" + year + String(nextNumber).padStart(4, "0");
}

async function customerPortalSnapshot(customerSession) {
  const customerCode = String(customerSession?.customerCode || "").trim();
  const customerName = String(customerSession?.customerName || "").trim();
  const [shipments, requests, notifications, activityLogs, hsCodes, settings, shipmentStatusHistory] = await Promise.all([
    customerName ? query(`select * from shipments where lower(customer_name) = lower($1) order by booking_date desc, created_at desc limit 500`, [customerName]) : Promise.resolve({ rows: [] }),
    query(
      `select * from shipment_requests
       where lower(customer_code) = lower($1) or lower(customer_name) = lower($2)
       order by created_at desc, id desc
       limit 500`,
      [customerCode, customerName]
    ),
    query(
      `select * from notifications
       where lower(user_type) = 'customer'
         and (lower(customer_code) = lower($1) or lower(user_id) = lower($2))
       order by created_at desc, id desc
       limit 200`,
      [customerCode, String(customerSession?.userName || "")]
    ),
    query(
      `select * from customer_activity_logs
       where lower(customer_code) = lower($1) or lower(customer_user_id) = lower($2)
       order by created_at desc, id desc
       limit 200`,
      [customerCode, String(customerSession?.customerUserId || "")]
    ),
    query(`select * from hs_code_master where lower(status) = 'active' order by item_name asc, item_code asc limit 500`),
    query(`select * from app_settings where settings_key = 'default' limit 1`),
    customerName ? query(`select h.* from shipment_status_history h inner join shipments s on s.job_no = h.job_no where lower(s.customer_name) = lower($1) order by h.updated_at asc`, [customerName]) : Promise.resolve({ rows: [] })
  ]);

  return {
    shipments: shipments.rows,
    shipmentRequests: requests.rows,
    notifications: notifications.rows,
    activityLogs: activityLogs.rows,
    hsCodeMaster: hsCodes.rows,
    settings: settings.rows[0] || null,
    shipmentStatusHistory: shipmentStatusHistory.rows
  };
}

async function createCustomerNotification(data) {
  await query(
    `insert into notifications (user_id, user_type, customer_code, type, title, message, read_status)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [String(data.userId || ""), String(data.userType || "customer"), String(data.customerCode || ""), String(data.type || ""), String(data.title || ""), String(data.message || ""), String(data.readStatus || "UNREAD")]
  );
}

async function createCustomerActivity(data) {
  await query(
    `insert into customer_activity_logs (customer_user_id, customer_code, action, description, ip_address)
     values ($1, $2, $3, $4, $5)`,
    [String(data.customerUserId || ""), String(data.customerCode || ""), String(data.action || ""), String(data.description || ""), String(data.ipAddress || "")]
  );
}

async function evaluateShipmentRequestStatus(data, customerAccount) {
  const settings = await query(`select enable_auto_approval from app_settings where settings_key = 'default' limit 1`);
  const autoApprovalEnabled = settings.rows[0]?.enable_auto_approval !== false;
  const customerActive = isPortalActive(customerAccount?.status) && isPortalActive(customerAccount?.customer_status);
  const requiredFieldsComplete = Boolean(String(data.shipmentType || "").trim() && String(data.origin || "").trim() && String(data.destination || "").trim() && String(data.consignee || "").trim() && String(data.itemName || "").trim() && Number(data.quantity || 0) > 0 && Number(data.weight || 0) > 0);
  const hsCodeMatched = Boolean(String(data.hsCode || "").trim() && String(data.itemCode || "").trim());

  if (!customerActive || !requiredFieldsComplete) {
    return "PENDING_REVIEW";
  }

  if (autoApprovalEnabled && hsCodeMatched) {
    return "AUTO_APPROVED";
  }

  return "PENDING_REVIEW";
}

async function demoCustomerPortalSnapshot(identifier) {
  return {
    session: {
      customerUserId: "1",
      customerCode: "CUS-001",
      customerName: "Gulf Retail Trading",
      userName: identifier || "gulf.retail",
      email: "portal@gulf-retail.example",
      role: "Customer",
      portal: "customer",
      branchAccess: "Customer Portal",
      branchViewScope: "Assigned Branch Only",
      sectionAccess: "Dashboard, New Shipment, Shipments, Tracking, Profile, Notifications, Activity Logs",
      status: "ACTIVE",
      lastLogin: ""
    },
    data: {
      shipments: [
        { job_no: "AFS-2605001", customer_name: "Gulf Retail Trading", origin: "Kuwait City", destination: "Riyadh", status: "Booked", pieces: 14, actual_kg: 820, cbm: 5.2, chargeable_kg: 1040, sell: 485, buy_cost: 330, pod_status: "Pending", invoice_status: "Unbilled", booking_date: "2026-05-05", airway_bill_no: "AWB-2605001", created_by: "admin" }
      ],
      shipmentRequests: [
        { request_no: "SRQ-260001", customer_code: "CUS-001", customer_name: "Gulf Retail Trading", shipment_type: "Export", origin: "Kuwait City", destination: "Riyadh", consignee: "Gulf Retail Trading", item_name: "Laptop Charger", hs_code: "8504.40", item_code: "ITEM-1001", quantity: 10, weight: 25, invoice_value: 420, remarks: "Demo request", status: "AUTO_APPROVED", created_by: "gulf.retail", created_at: new Date().toISOString() }
      ],
      notifications: [
        { id: 1, user_id: "gulf.retail", user_type: "customer", customer_code: "CUS-001", type: "Shipment Submitted", title: "Shipment request received", message: "Your request SRQ-260001 was submitted successfully.", read_status: "UNREAD", created_at: new Date().toISOString() }
      ],
      activityLogs: [
        { id: 1, customer_user_id: "1", customer_code: "CUS-001", action: "Login", description: "Customer portal login", ip_address: "127.0.0.1", created_at: new Date().toISOString() }
      ],
      hsCodeMaster: [
        { id: 1, item_name: "Laptop Charger", alternate_name: "Notebook Charger", hs_code: "8504.40", item_code: "ITEM-1001", status: "ACTIVE", created_at: new Date().toISOString() }
      ],
      settings: { enable_auto_approval: true }
    }
  };
}
const resources = {
  shipments: {
    table: "shipments",
    key: "job_no",
    order: "created_at desc",
    fields: [
      field("job_no", ["jobNo", "job_no"], true),
      field("branch"),
      field("customer_name", ["customerName", "customer", "customer_name"], true),
      field("origin"),
      field("destination"),
      field("status"),
      field("pieces"),
      field("actual_kg", ["actualKg", "actual_kg"]),
      field("cbm"),
      field("chargeable_kg", ["chargeableKg", "chargeable_kg"]),
      field("sell"),
      field("buy_cost", ["buyCost", "buy_cost"]),
      field("pod_status", ["podStatus", "pod_status"]),
      field("pod_splits_json", ["podSplitsJson", "pod_splits_json"]),
      field("invoice_status", ["invoiceStatus", "invoice_status"]),
      field("booking_date", ["bookingDate", "booking_date"]),
      field("airway_bill_no", ["airwayBillNo", "airway_bill_no"]),
      field("tariff_no", ["tariffNo", "tariff_no"]),
      field("transit_days", ["transitDays", "transit_days"]),
      field("shipment_direction", ["shipmentDirection", "shipment_direction"]),
      field("shipment_service", ["shipmentService", "shipment_service"]),
      field("shipment_service_other", ["shipmentServiceOther", "shipment_service_other"]),
      field("volume_category", ["volumeCategory", "volume_category"]),
      field("chargeable_divisor", ["chargeableDivisor", "chargeable_divisor"]),
      field("transporter"),
      field("transporter_code", ["transporterCode", "transporter_code"]),
      field("vehicle_no", ["vehicleNo", "vehicle_no"]),
      field("driver_name", ["driverName", "driver_name"]),
      field("driver_number", ["driverNumber", "driver_number"]),
      field("driver_mobile", ["driverMobile", "driver_mobile"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  "shipment-status-history": {
    table: "shipment_status_history",
    order: "updated_at desc",
    metaFields: [],
    fields: [
      field("job_no", ["jobNo", "job_no"], true),
      field("status", ["status"], true),
      field("pod_status", ["podStatus", "pod_status"]),
      field("invoice_status", ["invoiceStatus", "invoice_status"]),
      field("notes", ["notes", "remark", "manualRemark"]),
      field("updated_by", ["updatedBy", "updated_by"]),
      field("updated_at", ["updatedAt", "updated_at", "date"])
    ]
  },
  consolidations: {
    table: "consolidations",
    key: "load_no",
    order: "trip_date desc, created_at desc",
    fields: [
      field("load_no", ["loadNo", "load_no"], true),
      field("trip_date", ["tripDate", "trip_date"]),
      field("route"),
      field("transporter"),
      field("vehicle_no", ["vehicleNo", "vehicle_no"]),
      field("status"),
      field("pieces"),
      field("actual_kg", ["actualKg", "actual_kg"]),
      field("cbm"),
      field("chargeable_kg", ["chargeableKg", "chargeable_kg"]),
      field("job_numbers", ["jobNumbers", "job_numbers"]),
      field("manifest_status", ["manifestStatus", "manifest_status"]),
      field("last_manifest_request_no", ["lastManifestRequestNo", "last_manifest_request_no"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  customers: partyResource("customers"),
  suppliers: partyResource("suppliers"),
  tariffs: {
    table: "tariffs",
    key: "tariff_no",
    order: "created_at desc",
    fields: [
      field("tariff_no", ["tariffNo", "tariff_no"], true),
      field("customer"),
      field("origin"),
      field("destination"),
      field("main_section", ["mainSection", "main_section"]),
      field("weight_section", ["weightSection", "weight_section"]),
      field("min_up_to", ["minUpTo", "min_up_to"]),
      field("currency"),
      field("weight_rates_json", ["weightRatesJson", "weight_rates_json"]),
      field("rate_type", ["rateType", "rate_type"]),
      field("rate"),
      field("min_charge", ["minCharge", "min_charge"]),
      field("additional_charges_json", ["additionalChargesJson", "additional_charges_json"]),
      field("additional_charges_total", ["additionalChargesTotal", "additional_charges_total"]),
      field("grand_total", ["grandTotal", "grand_total"]),
      field("volumetric_divisor", ["volumetricDivisor", "volumetric_divisor"]),
      field("effective_from", ["effectiveFrom", "effective_from"]),
      field("effective_to", ["effectiveTo", "effective_to"]),
      field("status"),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  documents: {
    table: "documents",
    key: "document_no",
    order: "date desc, created_at desc",
    fields: [
      field("document_no", ["documentNo", "document_no"], true),
      field("linked_no", ["linkedNo", "linked_no"]),
      field("type"),
      field("status"),
      field("date"),
      field("owner"),
      field("file_name", ["fileName", "file_name"]),
      field("storage_url", ["storageUrl", "storage_url"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  quotations: {
    table: "quotations",
    key: "quotation_no",
    order: "created_at desc",
    fields: [
      field("quotation_no", ["quotationNo", "quotation_no"], true),
      field("branch"),
      field("date"),
      field("customer_name", ["customerName", "customer_name"]),
      field("customer_contact_person", ["customerContactPerson", "customer_contact_person"]),
      field("customer_mobile", ["customerMobile", "customer_mobile"]),
      field("customer_email", ["customerEmail", "customer_email"]),
      field("cargo_items_json", ["cargoItemsJson", "cargo_items_json"]),
      field("nature_of_goods", ["natureOfGoods", "nature_of_goods"]),
      field("volume_category", ["volumeCategory", "volume_category"]),
      field("cbm"),
      field("actual_kg", ["actualKg", "actual_kg"]),
      field("status"),
      field("converted_job_no", ["convertedJobNo", "converted_job_no"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  invoices: {
    table: "invoices",
    key: "invoice_no",
    order: "date desc, created_at desc",
    fields: [
      field("invoice_no", ["invoiceNo", "invoice_no"], true),
      field("customer"),
      field("customer_code", ["customerCode", "customer_code"]),
      field("shipment_no", ["shipmentNo", "shipment_no"]),
      field("tariff_no", ["tariffNo", "tariff_no"]),
      field("tariff_name", ["tariffName", "tariff_name"]),
      field("chargeable_weight", ["chargeableWeight", "chargeable_weight"]),
      field("revenue"),
      field("supplier_cost", ["supplierCost", "supplier_cost"]),
      field("total_cost", ["totalCost", "total_cost"]),
      field("tax_percent", ["taxPercent", "tax_percent"]),
      field("tax_amount", ["taxAmount", "tax_amount"]),
      field("grand_total", ["grandTotal", "grand_total"]),
      field("profit_percent", ["profitPercent", "profit_percent"]),
      field("invoice_lines_json", ["invoiceLinesJson", "invoice_lines_json"]),
      field("tariff_snapshot_json", ["tariffSnapshotJson", "tariff_snapshot_json"]),
      field("invoice_snapshot_json", ["invoiceSnapshotJson", "invoice_snapshot_json"]),
      field("status"),
      field("date"),
      field("due_date", ["dueDate", "due_date"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ],
    readonlyFields: ["gross_profit"]
  },
  users: {
    table: "app_users",
    key: "user_name",
    order: "created_at desc",
    hiddenFields: ["password"],
    fields: [
      field("user_name", ["userName", "user_name"], true),
      field("email"),
      field("role"),
      field("account_status", ["accountStatus", "account_status"]),
      field("branch_access", ["branchAccess", "branch_access"]),
      field("branch_view_scope", ["branchViewScope", "branch_view_scope"]),
      field("section_access", ["sectionAccess", "section_access"]),
      field("password"),
      field("can_view_all_entry", ["canViewAllEntry", "can_view_all_entry"]),
      field("can_view_only_self_entry", ["canViewOnlySelfEntry", "can_view_only_self_entry"]),
      field("can_edit_all_entry", ["canEditAllEntry", "can_edit_all_entry"]),
      field("can_view_updated_history", ["canViewUpdatedHistory", "can_view_updated_history"]),
      field("can_billing_sales_entry", ["canBillingSalesEntry", "can_billing_sales_entry"]),
      field("can_billing_cost_entry", ["canBillingCostEntry", "can_billing_cost_entry"]),
      field("hr_portal_access", ["hrPortalAccess", "hr_portal_access"]),
      field("erp_portal_access", ["erpPortalAccess", "erp_portal_access"]),
      field("maintenance_portal_access", ["maintenancePortalAccess", "maintenance_portal_access"]),
      field("is_hr_admin", ["isHrAdmin", "is_hr_admin"]),
      field("notes")
    ]
  },
  "customer-users": {
    table: "customer_users",
    key: "username",
    order: "created_at desc",
    hiddenFields: ["password_hash"],
    fields: [
      field("customer_code", ["customerCode", "customer_code"], true),
      field("username", ["username"], true),
      field("email", ["email"]),
      field("password_hash", ["passwordHash", "password", "password_hash"]),
      field("status"),
      field("last_login", ["lastLogin", "last_login"])
    ]
  },
  "hs-code-master": {
    table: "hs_code_master",
    key: "item_code",
    order: "created_at desc",
    fields: [
      field("item_name", ["itemName", "item_name"], true),
      field("alternate_name", ["alternateName", "alternate_name"]),
      field("hs_code", ["hsCode", "hs_code"]),
      field("item_code", ["itemCode", "item_code"], true),
      field("status")
    ]
  },
  "shipment-requests": {
    table: "shipment_requests",
    key: "request_no",
    order: "created_at desc",
    fields: [
      field("request_no", ["requestNo", "request_no"]),
      field("customer_code", ["customerCode", "customer_code"], true),
      field("customer_name", ["customerName", "customer_name"], true),
      field("shipment_type", ["shipmentType", "shipment_type"], true),
      field("origin", ["origin"], true),
      field("destination", ["destination"], true),
      field("consignee", ["consignee"], true),
      field("item_name", ["itemName", "item_name"], true),
      field("hs_code", ["hsCode", "hs_code"]),
      field("item_code", ["itemCode", "item_code"]),
      field("quantity", ["quantity"], true),
      field("weight", ["weight"], true),
      field("invoice_value", ["invoiceValue", "invoice_value"]),
      field("remarks", ["remarks"]),
      field("attachments_json", ["attachmentsJson", "attachments_json"]),
      field("request_details_json", ["requestDetailsJson", "request_details_json"]),
      field("status", ["status"]),
      field("approval_notes", ["approvalNotes", "approval_notes"]),
      field("auto_approved", ["autoApproved", "auto_approved"]),
      field("converted_job_no", ["convertedJobNo", "converted_job_no"]),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  notifications: {
    table: "notifications",
    key: "id",
    order: "created_at desc",
    fields: [
      field("user_id", ["userId", "user_id"], true),
      field("user_type", ["userType", "user_type"], true),
      field("customer_code", ["customerCode", "customer_code"]),
      field("type"),
      field("title"),
      field("message"),
      field("read_status", ["readStatus", "read_status"])
    ]
  },
  "customer-activity-logs": {
    table: "customer_activity_logs",
    key: "id",
    order: "created_at desc",
    fields: [
      field("customer_user_id", ["customerUserId", "customer_user_id"]),
      field("customer_code", ["customerCode", "customer_code"]),
      field("action"),
      field("description"),
      field("ip_address", ["ipAddress", "ip_address"])
    ]
  },
  "unblock-requests": {
    table: "unblock_requests",
    key: "request_no",
    order: "date desc, created_at desc",
    fields: [
      field("request_no", ["requestNo", "request_no"], true),
      field("request_type", ["requestType", "request_type"]),
      field("target_type", ["targetType", "target_type"]),
      field("reference_no", ["referenceNo", "reference_no"]),
      field("customer_name", ["customerName", "customer_name"]),
      field("requested_by", ["requestedBy", "requested_by"]),
      field("reason"),
      field("status"),
      field("date"),
      field("approved_by", ["approvedBy", "approved_by"]),
      field("notes")
    ]
  },
  "admin-requests": {
    table: "admin_requests",
    key: "request_no",
    order: "date desc, created_at desc",
    fields: [
      field("request_no", ["requestNo", "request_no"], true),
      field("request_type", ["requestType", "request_type"]),
      field("target_module", ["targetModule", "target_module"]),
      field("reference_no", ["referenceNo", "reference_no"]),
      field("requested_by", ["requestedBy", "requested_by"]),
      field("status"),
      field("date"),
      field("details"),
      field("proposed_values", ["proposedValues", "proposed_values"]),
      field("approved_by", ["approvedBy", "approved_by"]),
      field("approval_notes", ["approvalNotes", "approval_notes"]),
      field("created_by", ["createdBy", "created_by"])
    ]
  },
  "additional-charges": {
    table: "additional_charges",
    key: "ref_no",
    order: "charge_date desc, created_at desc",
    readonlyFields: ["tax_amount", "total_amount"],
    fields: [
      field("ref_no", ["refNo", "ref_no"], true),
      field("shipment_no", ["shipmentNo", "shipment_no"], true),
      field("charge_date", ["chargeDate", "charge_date"]),
      field("charge_type", ["chargeType", "charge_type"]),
      field("charge_basis", ["chargeBasis", "charge_basis"]),
      field("supplier"),
      field("reference_no", ["referenceNo", "reference_no"]),
      field("invoice_no", ["invoiceNo", "invoice_no"]),
      field("amount"),
      field("tax_percent", ["taxPercent", "tax_percent"]),
      field("currency"),
      field("remarks"),
      field("attachment_name", ["attachmentName", "attachment_name"]),
      field("status"),
      field("requested_by", ["requestedBy", "requested_by"]),
      field("approved_by", ["approvedBy", "approved_by"]),
      field("approval_notes", ["approvalNotes", "approval_notes"])
    ]
  },
  "shipment-cargo-items": {
    table: "shipment_cargo_items",
    key: "id",
    order: "id asc",
    fields: [
      field("job_no", ["jobNo", "job_no"], true),
      field("package_type", ["packageType", "package_type"]),
      field("quantity"),
      field("length"),
      field("width"),
      field("height"),
      field("dimension_unit", ["dimensionUnit", "dimension_unit"]),
      field("weight"),
      field("weight_unit", ["weightUnit", "weight_unit"]),
      field("volume_weight", ["volumeWeight", "volume_weight"]),
      field("remarks")
    ]
  },
  audit: {
    table: "audit_log",
    key: "id",
    order: "date_time desc",
    metaFields: [],
    fields: [
      field("date_time", ["dateTime", "date_time"]),
      field("user_name", ["userName", "user", "user_name"]),
      field("action"),
      field("reference"),
      field("details")
    ]
  },
  settings: {
    table: "app_settings",
    key: "settings_key",
    order: "id asc",
    metaFields: ["updated_at"],
    fields: [
      field("settings_key", ["settingsKey", "settings_key"]),
      field("company_name", ["companyName", "company_name"]),
      field("company_logo_url", ["companyLogoUrl", "company_logo_url"]),
      field("shipment_number_format", ["shipmentNumberFormat", "shipment_number_format"]),
      field("kuwait_shipment_number_format", ["kuwaitShipmentNumberFormat", "kuwait_shipment_number_format"]),
      field("dubai_shipment_number_format", ["dubaiShipmentNumberFormat", "dubai_shipment_number_format"]),
      field("kuwait_shipment_serial_start", ["kuwaitShipmentSerialStart", "kuwait_shipment_serial_start"]),
      field("dubai_shipment_serial_start", ["dubaiShipmentSerialStart", "dubai_shipment_serial_start"]),
      field("invoice_number_format", ["invoiceNumberFormat", "invoice_number_format"]),
      field("consolidation_number_format", ["consolidationNumberFormat", "consolidation_number_format"]),
      field("tcn_number_format", ["tcnNumberFormat", "tcn_number_format"]),
      field("delivery_note_number_format", ["deliveryNoteNumberFormat", "delivery_note_number_format"]),
      field("document_number_format", ["documentNumberFormat", "document_number_format"]),
      field("tariff_number_format", ["tariffNumberFormat", "tariff_number_format"]),
      field("customer_number_format", ["customerNumberFormat", "customer_number_format"]),
      field("additional_charge_number_format", ["additionalChargeNumberFormat", "additional_charge_number_format"]),
      field("supplier_number_format", ["supplierNumberFormat", "supplier_number_format"]),
      field("quotation_number_format", ["quotationNumberFormat", "quotation_number_format"]),
      field("awb_number_format", ["awbNumberFormat", "awb_number_format"]),
      field("default_volumetric_divisor", ["defaultVolumetricDivisor", "default_volumetric_divisor"]),
      field("require_pod_before_invoice", ["requirePodBeforeInvoice", "require_pod_before_invoice"]),
      field("allow_global_shipment_quick_search", ["allowGlobalShipmentQuickSearch", "allow_global_shipment_quick_search"]),
      field("enable_auto_approval", ["enableAutoApproval", "enable_auto_approval"]),
      field("branches"),
      field("column_layout_json", ["columnLayoutJson", "column_layout_json"]),
      field("dropdown_options", ["dropdownOptionsJson", "dropdown_options"])
    ]
  },
  employees: {
    table: "employees",
    key: "user_name",
    order: "created_at desc",
    fields: [
      field("user_name", ["userName", "user_name"], true),
      field("employee_code", ["employeeCode", "employee_code"]),
      field("full_name", ["fullName", "full_name"], true),
      field("department"),
      field("designation"),
      field("join_date", ["joinDate", "join_date"]),
      field("phone"),
      field("personal_email", ["personalEmail", "personal_email"]),
      field("employment_status", ["employmentStatus", "employment_status"]),
      field("reporting_manager", ["reportingManager", "reporting_manager"]),
      field("nationality"),
      field("date_of_birth", ["dateOfBirth", "date_of_birth"]),
      field("civil_id_no", ["civilIdNo", "civil_id_no"]),
      field("passport_no", ["passportNo", "passport_no"]),
      field("passport_expiry", ["passportExpiry", "passport_expiry"]),
      field("current_address", ["currentAddress", "current_address"]),
      field("permanent_address", ["permanentAddress", "permanent_address"]),
      field("emergency_contact_name", ["emergencyContactName", "emergency_contact_name"]),
      field("emergency_contact_phone", ["emergencyContactPhone", "emergency_contact_phone"]),
      field("notes")
    ]
  },
  "leave-requests": {
    table: "leave_requests",
    key: "request_no",
    order: "applied_at desc",
    fields: [
      field("request_no", ["requestNo", "request_no"], true),
      field("user_name", ["userName", "user_name"], true),
      field("employee_name", ["employeeName", "employee_name"]),
      field("leave_type", ["leaveType", "leave_type"]),
      field("start_date", ["startDate", "start_date"], true),
      field("end_date", ["endDate", "end_date"], true),
      field("total_days", ["totalDays", "total_days"]),
      field("reason"),
      field("status"),
      field("approved_by", ["approvedBy", "approved_by"]),
      field("approved_at", ["approvedAt", "approved_at"]),
      field("applied_at", ["appliedAt", "applied_at"])
    ]
  },
  payslips: {
    table: "payslips",
    key: "payslip_no",
    order: "created_at desc",
    fields: [
      field("payslip_no", ["payslipNo", "payslip_no"], true),
      field("user_name", ["userName", "user_name"], true),
      field("employee_name", ["employeeName", "employee_name"]),
      field("period"),
      field("gross_pay", ["grossPay", "gross_pay"]),
      field("deductions"),
      field("net_pay", ["netPay", "net_pay"]),
      field("status"),
      field("issued_date", ["issuedDate", "issued_date"]),
      field("storage_url", ["storageUrl", "storage_url"])
    ]
  },
  "hr-announcements": {
    table: "hr_announcements",
    key: "id",
    order: "pinned desc, posted_at desc",
    fields: [
      field("title", ["title"], true),
      field("body"),
      field("posted_by", ["postedBy", "posted_by"]),
      field("audience"),
      field("pinned"),
      field("posted_at", ["postedAt", "posted_at"])
    ]
  }
};

function field(column, names = [column], required = false) {
  return { column, names, required };
}

function partyResource(table) {
  return {
    table,
    key: "code",
    order: "created_at desc",
    fields: [
      field("code", ["code"], true),
      field("name", ["name"], true),
      field("location_or_lane", ["locationOrLane", "location_or_lane"]),
      field("full_address", ["fullAddress", "full_address"]),
      field("email"),
      field("mobile"),
      field("terms"),
      field("status"),
      field("is_account_overdue", ["isAccountOverdue", "is_account_overdue"]),
      field("branch"),
      field("blocked_branches", ["blockedBranches", "blocked_branches"]),
      field("credit_limit", ["creditLimit", "credit_limit"]),
      field("notes"),
      field("created_by", ["createdBy", "created_by"])
    ]
  };
}

function isDatabaseSetupError(error) {
  return Boolean(
    error?.code === "42P01" ||
      error?.code === "42703" ||
      error?.message?.includes("DATABASE_URL is required") ||
      error?.message?.includes("connect ECONNREFUSED") ||
      error?.message?.includes("does not exist")
  );
}

function columnsFor(config) {
  const metaFields = config.metaFields || ["created_at", "updated_at"];
  const hiddenFields = new Set(config.hiddenFields || []);
  const names = [
    "id",
    ...config.fields.map((item) => item.column).filter((column) => !hiddenFields.has(column)),
    ...(config.readonlyFields || []),
    ...metaFields
  ];
  return [...new Set(names)].join(", ");
}

function valueFromBody(body, item) {
  for (const name of item.names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      return body[name];
    }
  }

  return undefined;
}

function collectValues(config, body, includeKey = true) {
  const columns = [];
  const values = [];

  for (const item of config.fields) {
    if (!includeKey && item.column === config.key) {
      continue;
    }

    const value = valueFromBody(body, item);
    if (value === undefined || value === "") {
      continue;
    }

    columns.push(item.column);
    values.push(value);
  }

  return { columns, values };
}

function requireFields(config, columns) {
  const missing = config.fields
    .filter((item) => item.required)
    .filter((item) => !columns.includes(item.column))
    .map((item) => item.names[0]);

  if (missing.length) {
    const error = new Error(`${missing.join(", ")} required.`);
    error.status = 400;
    throw error;
  }
}

async function getRows(resourceName, config) {
  const result = await query(
    `select ${columnsFor(config)}
     from ${config.table}
     order by ${config.order}
     limit 500`
  );
  return {
    ok: true,
    rows: result.rows
  };
}

async function loginUser(identifier, password) {
  let result;
  try {
    result = await query(
      `select user_name, email, role, account_status, branch_access, branch_view_scope, section_access,
              can_view_all_entry, can_view_only_self_entry, can_edit_all_entry, can_view_updated_history,
              can_billing_sales_entry, can_billing_cost_entry, hr_portal_access, erp_portal_access, maintenance_portal_access, is_hr_admin, password
       from app_users
       where lower(user_name) = lower($1) or lower(email) = lower($1)
       limit 1`,
      [identifier]
    );
  } catch (error) {
    // Allow existing live databases to keep signing in while the optional HR
    // migration is still being applied by the deployment service.
    if (error?.code !== "42703") throw error;
    result = await query(
      `select user_name, email, role, account_status, branch_access, branch_view_scope, section_access,
              can_view_all_entry, can_view_only_self_entry, can_edit_all_entry, can_view_updated_history,
              password
       from app_users
       where lower(user_name) = lower($1) or lower(email) = lower($1)
       limit 1`,
      [identifier]
    );
    if (result.rows[0]) {
      result.rows[0].hr_portal_access = false;
      result.rows[0].can_billing_sales_entry = true;
      result.rows[0].can_billing_cost_entry = true;
      // Same reasoning as the migration comment: default erp_portal_access to true (matches
      // pre-migration behavior of no ERP access gate existing at all) - is_hr_admin defaults
      // false, a brand new opt-in permission.
      result.rows[0].erp_portal_access = true;
      result.rows[0].maintenance_portal_access = false;
      result.rows[0].is_hr_admin = false;
    }
  }

  const row = result.rows[0];
  if (!row || !verifyCustomerPassword(password, row.password)) {
    return null;
  }

  delete row.password;
  return row;
}

async function prepareRecordForConfig(config, body) {
  const prepared = { ...(body || {}) };

  if (config.table === "customers") {
    // Status is the authoritative account state. Older records can retain stale
    // blocked_branches after an unblock because empty strings were previously omitted
    // from partial updates. Keep the two fields consistent whenever an admin saves Active.
    const hasStatus = Object.prototype.hasOwnProperty.call(prepared, "status");
    const status = String(prepared.status || "").trim().toLowerCase();
    if (hasStatus && status === "active") {
      prepared.blocked_branches = null;
      prepared.is_account_overdue = false;
    }
  }

  if (config.table === "customer_users") {
    const password = String(prepared.password || "").trim();
    const passwordHash = String(prepared.password_hash || prepared.passwordHash || "").trim();
    if (password) {
      prepared.password_hash = password.startsWith("pbkdf2$") ? password : hashCustomerPassword(password);
    } else if (passwordHash && !passwordHash.startsWith("pbkdf2$") && passwordHash.length > 0) {
      prepared.password_hash = hashCustomerPassword(passwordHash);
    }
    if (!String(prepared.status || "").trim()) {
      prepared.status = "ACTIVE";
    }
    delete prepared.password;
    delete prepared.passwordHash;
  }

  if (config.table === "app_users") {
    const password = String(prepared.password || "").trim();
    if (password && !password.startsWith("pbkdf2$")) {
      prepared.password = hashCustomerPassword(password);
    }
  }

  if (config.table === "shipment_requests") {
    if (!String(prepared.request_no || "").trim()) {
      prepared.request_no = await nextShipmentRequestNo();
    }
    if (!String(prepared.status || "").trim()) {
      prepared.status = "SUBMITTED";
    }
    const attachments = prepared.attachments_json || prepared.attachmentsJson || prepared.attachments;
    if (Array.isArray(attachments)) {
      prepared.attachments_json = JSON.stringify(attachments);
    } else if (attachments && typeof attachments === "object") {
      prepared.attachments_json = JSON.stringify(attachments);
    } else if (typeof attachments === "string" && attachments.trim()) {
      prepared.attachments_json = attachments;
    }
    if (!String(prepared.customer_name || "").trim() && String(prepared.customer_code || "").trim()) {
      const customerByCode = await query(`select name from customers where lower(code) = lower($1) limit 1`, [prepared.customer_code]);
      prepared.customer_name = customerByCode.rows[0]?.name || prepared.customer_name || "";
    }
    if (!String(prepared.customer_code || "").trim() && String(prepared.customer_name || "").trim()) {
      const customerByName = await query(`select code from customers where lower(name) = lower($1) limit 1`, [prepared.customer_name]);
      prepared.customer_code = customerByName.rows[0]?.code || prepared.customer_code || "";
    }
    prepared.auto_approved = String(prepared.status || "").toUpperCase() === "AUTO_APPROVED";
  }

  if (config.table === "invoices") {
    const stringify = (value, fallback) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") return JSON.stringify(value);
      return fallback;
    };
    prepared.customer_code = String(prepared.customer_code || prepared.customerCode || "").trim();
    prepared.tariff_no = String(prepared.tariff_no || prepared.tariffNo || "").trim();
    prepared.tariff_name = String(prepared.tariff_name || prepared.tariffName || "").trim();
    prepared.chargeable_weight = Number(prepared.chargeable_weight || prepared.chargeableWeight || 0);
    prepared.revenue = Number(prepared.revenue || 0);
    prepared.supplier_cost = Number(prepared.supplier_cost || prepared.supplierCost || 0);
    prepared.total_cost = Number(prepared.total_cost || prepared.totalCost || prepared.supplier_cost || 0);
    prepared.tax_percent = Number(prepared.tax_percent || prepared.taxPercent || 0);
    prepared.tax_amount = Number(prepared.tax_amount || prepared.taxAmount || 0);
    prepared.grand_total = Number(prepared.grand_total || prepared.grandTotal || prepared.revenue + prepared.tax_amount);
    prepared.profit_percent = Number(
      prepared.profit_percent ||
        prepared.profitPercent ||
        (prepared.revenue ? (((prepared.revenue - prepared.total_cost) / prepared.revenue) * 100) : 0)
    );
    prepared.invoice_lines_json = stringify(prepared.invoice_lines_json || prepared.invoiceLinesJson, "[]");
    prepared.tariff_snapshot_json = stringify(prepared.tariff_snapshot_json || prepared.tariffSnapshotJson, "{}");
    prepared.invoice_snapshot_json = stringify(prepared.invoice_snapshot_json || prepared.invoiceSnapshotJson, "{}");
  }

  if (config.table === "audit_log") {
    const details = prepared.details;
    if (typeof details === "string") {
      prepared.details = JSON.stringify({ text: details });
    } else if (details && typeof details === "object") {
      prepared.details = JSON.stringify(details);
    } else {
      prepared.details = JSON.stringify({ text: "" });
    }
  }

  if (config.table === "notifications" && !String(prepared.read_status || "").trim()) {
    prepared.read_status = "UNREAD";
  }

  return prepared;
}
function bumpTrailingNumber(value) {
  const text = String(value || "");
  const matches = [...text.matchAll(/\d+/g)];
  if (!matches.length) return `${text}-1`;
  // Bump the longest digit run, not just the last one in the string. Job number formats embed the
  // month AFTER the serial number (e.g. "AFS-00174/08/KWI/EXP") - a naive "last digits in the
  // string" match increments the month (08 -> 09) instead of the actual serial number, which never
  // resolves the real collision and can exhaust every retry attempt with the serial left unchanged.
  const target = matches.reduce((longest, current) => (current[0].length > longest[0].length ? current : longest), matches[0]);
  const start = target.index;
  const end = start + target[0].length;
  const next = String(Number(target[0]) + 1).padStart(target[0].length, "0");
  return text.slice(0, start) + next + text.slice(end);
}

// Global Delivered Shipment Rule / Manifest Creation rule, enforced server-side too: strips out
// any job number that is already on another manifest or whose shipment status is Delivered,
// mirroring the frontend's normalizeConsolidationJobs(). Only applied to the "consolidations"
// (Manifest) resource so no other resource's request body is touched.
async function sanitizeConsolidationJobNumbers(rawJobNumbers, excludeLoadNo = "") {
  const requested = String(rawJobNumbers || "")
    .split(",")
    .map((jobNo) => jobNo.trim())
    .filter(Boolean);
  if (!requested.length) return rawJobNumbers;

  const shipmentStatus = await query("select job_no, status from shipments where job_no = any($1::text[])", [requested]);
  const deliveredJobs = new Set(
    shipmentStatus.rows.filter((row) => String(row.status || "").trim().toLowerCase() === "delivered").map((row) => row.job_no)
  );

  const assignedResult = await query(
    excludeLoadNo
      ? "select job_numbers from consolidations where load_no <> $1"
      : "select job_numbers from consolidations",
    excludeLoadNo ? [excludeLoadNo] : []
  );
  const assignedJobs = new Set();
  assignedResult.rows.forEach((row) => {
    String(row.job_numbers || "").split(",").map((jobNo) => jobNo.trim()).filter(Boolean).forEach((jobNo) => assignedJobs.add(jobNo));
  });

  return requested.filter((jobNo) => !deliveredJobs.has(jobNo) && !assignedJobs.has(jobNo)).join(", ");
}

async function insertRow(config, body) {
  body = await prepareRecordForConfig(config, body);
  const { columns, values } = collectValues(config, body);
  requireFields(config, columns);

  if (!columns.length) {
    const error = new Error("No values supplied.");
    error.status = 400;
    throw error;
  }

  // Two people can open "New Shipment" at nearly the same moment and both get shown the same
  // next job number. Rather than reject the second person's whole submission and make them
  // re-enter everything, automatically bump the number and retry a few times - this is the only
  // table where that's currently a reported problem.
  const autoRenumberColumn = config.table === "shipments" ? "job_no" : null;
  const maxAttempts = autoRenumberColumn ? 6 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const placeholders = values.map((_, index) => `$${index + 1}`);
    try {
      const result = await query(
        `insert into ${config.table} (${columns.join(", ")})
         values (${placeholders.join(", ")})
         returning ${columnsFor(config)}`,
        values
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505" && autoRenumberColumn && attempt < maxAttempts) {
        const colIndex = columns.indexOf(autoRenumberColumn);
        if (colIndex !== -1) {
          const oldValue = values[colIndex];
          const newValue = bumpTrailingNumber(oldValue);
          values[colIndex] = newValue;
          // Airway-entry shipments use the same value for job_no and airway_bill_no - keep them matched.
          const awbIndex = columns.indexOf("airway_bill_no");
          if (awbIndex !== -1 && values[awbIndex] === oldValue) {
            values[awbIndex] = newValue;
          }
          continue;
        }
      }

      if (error.code === "23505") {
        const keyIndex = config.key ? columns.indexOf(config.key) : -1;
        const keyValue = keyIndex >= 0 ? values[keyIndex] : "";
        const duplicateError = new Error(
          keyValue
            ? `${keyValue} already exists. Choose a different number and try again.`
            : "A record with this value already exists. Choose a different number and try again."
        );
        duplicateError.status = 409;
        throw duplicateError;
      }
      throw error;
    }
  }
}


async function updateRow(config, id, body) {
  if (!config.key) {
    const error = new Error("This resource does not support direct updates.");
    error.status = 400;
    throw error;
  }

  body = await prepareRecordForConfig(config, body);
  const { columns, values } = collectValues(config, body, false);
  if (!columns.length) {
    const error = new Error("No values supplied.");
    error.status = 400;
    throw error;
  }

  const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
  values.push(id);
  const result = await query(
    `update ${config.table}
     set ${assignments.join(", ")}
     where ${config.key} = $${values.length}
     returning ${columnsFor(config)}`,
    values
  );

  if (!result.rows[0]) {
    const error = new Error("Record not found.");
    error.status = 404;
    throw error;
  }

  if (config.table === "shipment_requests") {
    const row = result.rows[0];
    const status = String(row.status || "").toUpperCase();
    if (status === "APPROVED" || status === "SENT_BACK") {
      try {
        await createCustomerNotification({
          userType: "customer",
          customerCode: row.customer_code || "",
          type: status === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_SENT_BACK",
          title: status === "APPROVED" ? `Shipment request ${row.request_no} approved` : `Shipment request ${row.request_no} needs your attention`,
          message: status === "APPROVED"
            ? `Your shipment request ${row.request_no} (${row.origin} to ${row.destination}) has been approved.${row.approval_notes ? ` Note: ${row.approval_notes}` : ""}`
            : `Your shipment request ${row.request_no} (${row.origin} to ${row.destination}) was sent back for review.${row.approval_notes ? ` Details: ${row.approval_notes}` : ""}`
        });
      } catch (notificationError) {
        console.error("Failed to create customer notification for shipment request update:", notificationError);
      }
    }
  }

  return result.rows[0];
}

async function deleteRow(config, id) {
  if (!config.key) {
    const error = new Error("This resource does not support direct deletion.");
    error.status = 400;
    throw error;
  }

  const result = await query(
    `delete from ${config.table}
     where ${config.key} = $1
     returning ${columnsFor(config)}`,
    [id]
  );

  if (!result.rows[0]) {
    const error = new Error("Record not found.");
    error.status = 404;
    throw error;
  }

  return result.rows[0];
}

async function checkDatabaseReady() {
  const requiredTables = [
    "shipments",
    "consolidations",
    "customers",
    "suppliers",
    "tariffs",
    "documents",
    "invoices",
    "app_users",
    "unblock_requests",
    "admin_requests",
    "additional_charges",
    "shipment_cargo_items",
    "app_settings"
  ];
  const result = await query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [requiredTables]
  );
  const existingTables = new Set(result.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));
  return {
    ready: missingTables.length === 0,
    missingTables
  };
}

function demoResponse(resourceName) {
  const config = resources[resourceName];
  const hidden = new Set(config?.hiddenFields || []);
  const rows = (demoRows[resourceName] || []).map((row) => {
    if (!hidden.size) return row;
    const clone = { ...row };
    hidden.forEach((field) => delete clone[field]);
    return clone;
  });

  return {
    ok: true,
    mode: "demo",
    rows
  };
}

// Electron loads the desktop app's UI via a local file:// page (see electron/main.js -
// mainWindow.loadFile(...)). Chromium sends `Origin: null` (the literal string "null", not an
// absent header) on cross-origin fetch/XHR requests made from a file:// page - that's how the
// desktop build's every API call (including things like manifest saves) was getting silently
// rejected by CORS while the same build's requests to /api/health worked fine when hit directly
// from a normal browser tab, which has a proper https:// origin. Since a file:// origin can only
// come from a local file the user already has - not from a remote attacker's page (a malicious
// website has its own https:// origin, not "null") - allowing it here is safe for this app, whose
// endpoints already require a Bearer token via requireAppAuth for anything sensitive regardless
// of origin.
function isAllowedOrigin(origin) {
  return !origin || origin === "null" || allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed.`));
    },
    credentials: true
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "15mb" }));

if (fs.existsSync(webIndex)) {
  app.use(express.static(webDir));
}

app.get("/", (_request, response) => {
  if (fs.existsSync(webIndex)) {
    return response.sendFile(webIndex);
  }

  return response.json({
    ok: true,
    service: "apollofreighterp-server",
    web: "https://apollo-freighterp.vercel.app",
    health: "/api/health"
  });
});

app.get(["/customer", "/customer/*"], (_request, response) => {
  if (fs.existsSync(webIndex)) {
    return response.sendFile(webIndex);
  }

  return response.redirect(302, "/");
});

app.get("/api/health", async (_request, response) => {
  try {
    const db = await testConnection();
    const readiness = await checkDatabaseReady();
    const ready = readiness.ready;
    response.json({
      ok: true,
      service: "apollofreighterp-server",
      database: ready ? "connected" : "not-ready",
      mode: ready ? "database" : "setup",
      databaseConfigured: runtimeStatus.databaseConfigured,
      databaseUrlSource: runtimeStatus.databaseUrlSource,
      databaseHost,
      isNeonDatabase,
      isCloudSqlSocket,
      allowedOrigins,
      autoMigrate: runtimeStatus.autoMigrate,
      migration: runtimeStatus.migration,
      loginSecret: runtimeStatus.loginSecret,
      corsPolicy: runtimeStatus.corsPolicy,
      startupError: ready ? runtimeStatus.startupError : runtimeStatus.startupError || `Missing tables: ${readiness.missingTables.join(", ")}`,
      error: ready ? "" : runtimeStatus.startupError || `Missing tables: ${readiness.missingTables.join(", ")}`,
      serverTime: db.server_time
    });
  } catch (error) {
    response.json({
      ok: true,
      service: "apollofreighterp-server",
      database: "disconnected",
      mode: "demo",
      databaseConfigured: runtimeStatus.databaseConfigured,
      databaseUrlSource: runtimeStatus.databaseUrlSource,
      databaseHost,
      isNeonDatabase,
      isCloudSqlSocket,
      allowedOrigins,
      autoMigrate: runtimeStatus.autoMigrate,
      migration: runtimeStatus.migration,
      loginSecret: runtimeStatus.loginSecret,
      corsPolicy: runtimeStatus.corsPolicy,
      startupError: runtimeStatus.startupError,
      error: error.message
    });
  }
});

app.post("/api/session/handoff", loginRateLimiter, async (request, response, next) => {
  const token = String(request.body?.token || "").trim();
  const payload = verifyCustomerToken(token);
  const identifier = String(payload?.userName || payload?.username || "").trim();
  if (!payload || payload.portal !== "app" || !identifier) {
    return response.status(401).json({ ok: false, error: "Invalid or expired ERP session." });
  }

  try {
    const result = await query(
      `select user_name, email, role, account_status, branch_access, branch_view_scope, section_access,
              can_view_all_entry, can_view_only_self_entry, can_edit_all_entry, can_view_updated_history,
              can_billing_sales_entry, can_billing_cost_entry, hr_portal_access, erp_portal_access,
              maintenance_portal_access, is_hr_admin
       from app_users
       where lower(user_name) = lower($1)
       limit 1`,
      [identifier]
    );
    const row = result.rows[0];
    if (!row || String(row.account_status || "Active").toLowerCase() !== "active") {
      return response.status(403).json({ ok: false, error: "This user account is not active." });
    }
    if (row.erp_portal_access === false) {
      return response.status(403).json({ ok: false, error: "ERP Portal access is not enabled for this account." });
    }

    return response.json({
      ok: true,
      session: {
        userName: row.user_name,
        email: row.email,
        role: row.role,
        branchAccess: row.branch_access,
        branchViewScope: row.branch_view_scope || "Assigned Branch Only",
        sectionAccess: row.section_access,
        canViewAllEntry: row.can_view_all_entry,
        canViewOnlySelfEntry: row.can_view_only_self_entry,
        canEditAllEntry: row.can_edit_all_entry,
        canViewUpdatedHistory: row.can_view_updated_history,
        canBillingSalesEntry: row.can_billing_sales_entry !== false,
        canBillingCostEntry: row.can_billing_cost_entry !== false,
        hrPortalAccess: Boolean(row.hr_portal_access),
        erpPortalAccess: row.erp_portal_access !== false,
        maintenancePortalAccess: Boolean(row.maintenance_portal_access),
        isHrAdmin: Boolean(row.is_hr_admin),
        token: signCustomerToken({
          userName: row.user_name,
          role: row.role,
          portal: "app",
          employeePortal: false,
          isHrAdmin: Boolean(row.is_hr_admin),
          exp: Date.now() + APP_TOKEN_TTL_MS
        })
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/login", loginRateLimiter, async (request, response, next) => {
  // Database migrations and shared-secret hydration run in the background so login requests do not
  // hang when a migration is slow or waiting on a database lock. Production uses the configured
  // CUSTOMER_PORTAL_SECRET until the persisted secret is available.
  const identifier = String(request.body?.userName || request.body?.email || "").trim();
  const password = String(request.body?.password || "");
  const loginMode = String(request.body?.loginMode || "company").trim().toLowerCase();
  const employeeLogin = loginMode === "employee";
  const maintenanceLogin = loginMode === "maintenance";

  if (!identifier || !password) {
    return response.status(400).json({
      ok: false,
      error: "User name and password are required."
    });
  }

  try {
    const row = await loginUser(identifier, password);

    if (!row) {
      return response.status(401).json({
        ok: false,
        error: "Invalid login credentials."
      });
    }

    if (String(row.account_status || "Active").toLowerCase() !== "active") {
      return response.status(403).json({
        ok: false,
        error: "This user account is not active."
      });
    }
    if (employeeLogin && !row.hr_portal_access) {
      return response.status(403).json({ ok: false, error: "HR Portal access is not enabled for this account." });
    }
    if (maintenanceLogin && !row.maintenance_portal_access) {
      return response.status(403).json({ ok: false, error: "Maintenance Portal access is not enabled for this account." });
    }
    if (!employeeLogin && !maintenanceLogin && !row.erp_portal_access) {
      return response.status(403).json({ ok: false, error: "ERP Portal access is not enabled for this account." });
    }

    return response.json({
      ok: true,
      session: {
        userName: row.user_name,
        email: row.email,
        role: row.role,
        branchAccess: row.branch_access,
        branchViewScope: row.branch_view_scope || "Assigned Branch Only",
        sectionAccess: row.section_access,
        canViewAllEntry: row.can_view_all_entry,
        canViewOnlySelfEntry: row.can_view_only_self_entry,
        canEditAllEntry: row.can_edit_all_entry,
        canViewUpdatedHistory: row.can_view_updated_history,
        canBillingSalesEntry: row.can_billing_sales_entry !== false,
        canBillingCostEntry: row.can_billing_cost_entry !== false,
        hrPortalAccess: Boolean(row.hr_portal_access),
        erpPortalAccess: row.erp_portal_access !== false,
        maintenancePortalAccess: Boolean(row.maintenance_portal_access),
        isHrAdmin: Boolean(row.is_hr_admin),
        token: signCustomerToken({ userName: row.user_name, role: row.role, portal: "app", employeePortal: employeeLogin, isHrAdmin: Boolean(row.is_hr_admin), exp: Date.now() + APP_TOKEN_TTL_MS })
      }
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      if ((identifier.toLowerCase() === "admin" || identifier.toLowerCase() === "admin@apollofreightsolution.com") && password === "admin123") {
        return response.json({
          ok: true,
          session: {
            userName: "admin",
            email: "admin@apollofreightsolution.com",
            role: "Admin",
            branchAccess: "Both",
            branchViewScope: "All Branches",
            sectionAccess: "All",
            hrPortalAccess: true,
            erpPortalAccess: true,
            isHrAdmin: true,
            token: signCustomerToken({ userName: "admin", role: "Admin", portal: "app", employeePortal: employeeLogin, exp: Date.now() + APP_TOKEN_TTL_MS })
          }
        });
      }

      return response.status(401).json({
        ok: false,
        error: "Invalid login credentials."
      });
    }

    return next(error);
  }
});

app.post("/api/portal-switch", requireAppAuth, async (request, response, next) => {
  const requestedPortal = String(request.body?.portal || "").trim().toLowerCase();
  if (!["employee", "company"].includes(requestedPortal)) {
    return response.status(400).json({ ok: false, error: "A valid portal must be selected." });
  }
  try {
    let result;
    try {
      result = await query(
        `select user_name, email, role, account_status, branch_access, branch_view_scope, section_access,
                can_view_all_entry, can_view_only_self_entry, can_edit_all_entry, can_view_updated_history,
                can_billing_sales_entry, can_billing_cost_entry, hr_portal_access, erp_portal_access, is_hr_admin
         from app_users where lower(user_name) = lower($1) limit 1`,
        [request.appSession.userName]
      );
    } catch (error) {
      if (error?.code !== "42703") throw error;
      result = await query(
        `select user_name, email, role, account_status, branch_access, branch_view_scope, section_access,
                can_view_all_entry, can_view_only_self_entry, can_edit_all_entry, can_view_updated_history,
                can_billing_sales_entry, can_billing_cost_entry
         from app_users where lower(user_name) = lower($1) limit 1`,
        [request.appSession.userName]
      );
      if (result.rows[0]) {
        result.rows[0].hr_portal_access = false;
        result.rows[0].erp_portal_access = true;
        result.rows[0].is_hr_admin = false;
      }
    }
    const row = result.rows[0];
    if (!row || String(row.account_status || "Active").toLowerCase() !== "active") {
      return response.status(403).json({ ok: false, error: "This user account is not active." });
    }
    if (requestedPortal === "employee" && !row.hr_portal_access) {
      return response.status(403).json({ ok: false, error: "HR Portal access is not enabled for this account." });
    }
    if (requestedPortal === "company" && row.erp_portal_access === false) {
      return response.status(403).json({ ok: false, error: "ERP Portal access is not enabled for this account." });
    }
    return response.json({
      ok: true,
      session: {
        userName: row.user_name,
        email: row.email,
        role: row.role,
        branchAccess: row.branch_access,
        branchViewScope: row.branch_view_scope || "Assigned Branch Only",
        sectionAccess: row.section_access,
        canViewAllEntry: row.can_view_all_entry,
        canViewOnlySelfEntry: row.can_view_only_self_entry,
        canEditAllEntry: row.can_edit_all_entry,
        canViewUpdatedHistory: row.can_view_updated_history,
        canBillingSalesEntry: row.can_billing_sales_entry !== false,
        canBillingCostEntry: row.can_billing_cost_entry !== false,
        hrPortalAccess: Boolean(row.hr_portal_access),
        erpPortalAccess: row.erp_portal_access !== false,
        maintenancePortalAccess: Boolean(row.maintenance_portal_access),
        isHrAdmin: Boolean(row.is_hr_admin),
        portal: requestedPortal === "employee" ? "employee" : "company",
        token: signCustomerToken({ userName: row.user_name, role: row.role, portal: "app", employeePortal: requestedPortal === "employee", isHrAdmin: Boolean(row.is_hr_admin), exp: Date.now() + APP_TOKEN_TTL_MS })
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/change-password", loginRateLimiter, async (request, response, next) => {
  const userName = String(request.body?.userName || "").trim();
  const currentPassword = String(request.body?.currentPassword || "");
  const newPassword = String(request.body?.newPassword || "");

  if (!userName || !currentPassword || !newPassword) {
    return response.status(400).json({
      ok: false,
      error: "User name, current password, and new password are required."
    });
  }

  try {
    const row = await loginUser(userName, currentPassword);

    if (!row) {
      return response.status(401).json({
        ok: false,
        error: "The current password is incorrect."
      });
    }

    await query("update app_users set password = $1 where user_name = $2", [hashCustomerPassword(newPassword), row.user_name]);

    return response.json({ ok: true });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.status(503).json({
        ok: false,
        error: "Password changes require a connected database."
      });
    }

    return next(error);
  }
});

app.post("/api/customer-login", loginRateLimiter, async (request, response, next) => {
  const identifier = String(request.body?.userName || request.body?.email || request.body?.customerCode || "").trim();
  const password = String(request.body?.password || "");

  if (!identifier || !password) {
    return response.status(400).json({
      ok: false,
      error: "Customer user name and password are required."
    });
  }

  try {
    const session = await loginCustomer(identifier, password);
    if (!session) {
      return response.status(401).json({
        ok: false,
        error: "Invalid customer login credentials."
      });
    }

    await createCustomerActivity({
      customerUserId: session.customerUserId,
      customerCode: session.customerCode,
      action: "Login",
      description: "Customer portal login",
      ipAddress: request.ip || ""
    });

    const snapshot = await customerPortalSnapshot(session);
    return response.json({
      ok: true,
      session,
      data: snapshot
    });
  } catch (error) {
    if (isDatabaseSetupError(error) && String(password || "") === "customer123") {
      const demo = await demoCustomerPortalSnapshot(identifier);
      return response.json({
        ok: true,
        mode: "demo",
        session: demo.session,
        data: demo.data
      });
    }

    return next(error);
  }
});

app.get("/api/hr-announcement-reads", requireAppAuth, async (request, response, next) => {
  const userName = String(request.appSession?.userName || "").trim().toLowerCase();
  if (!userName) return response.status(401).json({ ok: false, error: "Login required." });
  try {
    const result = await query(
      "select announcement_id, read_at from hr_announcement_reads where lower(user_name)=lower($1) order by read_at desc",
      [userName]
    );
    return response.json({ ok: true, rows: result.rows });
  } catch (error) {
    if (isDatabaseSetupError(error)) return response.json({ ok: true, mode: "demo", rows: [] });
    return next(error);
  }
});

app.post("/api/hr-announcement-reads", requireAppAuth, async (request, response, next) => {
  const userName = String(request.appSession?.userName || "").trim().toLowerCase();
  const announcementId = Number(request.body?.announcementId);
  if (!userName || !Number.isInteger(announcementId) || announcementId <= 0) {
    return response.status(400).json({ ok: false, error: "A valid announcement is required." });
  }
  try {
    const announcement = (await query("select id from hr_announcements where id=$1 limit 1", [announcementId])).rows[0];
    if (!announcement) return response.status(404).json({ ok: false, error: "Announcement not found." });
    const result = await query(
      `insert into hr_announcement_reads (announcement_id, user_name, read_at)
       values ($1, $2, now())
       on conflict (announcement_id, user_name) do update set read_at=excluded.read_at
       returning announcement_id, read_at`,
      [announcementId, userName]
    );
    return response.status(201).json({ ok: true, row: result.rows[0] });
  } catch (error) {
    if (isDatabaseSetupError(error)) return response.status(201).json({ ok: true, mode: "demo", row: { announcement_id: announcementId, user_name: userName } });
    return next(error);
  }
});

app.get("/api/customer/bootstrap", requireCustomerPortalAuth, async (request, response, next) => {
  try {
    const data = await customerPortalSnapshot(request.customerSession);
    response.json({
      ok: true,
      session: request.customerSession,
      data
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      const demo = await demoCustomerPortalSnapshot(request.customerSession?.userName || "gulf.retail");
      return response.json({
        ok: true,
        mode: "demo",
        session: demo.session,
        data: demo.data
      });
    }

    return next(error);
  }
});

app.post("/api/customer/shipment-requests", requireCustomerPortalAuth, async (request, response, next) => {
  const data = request.body || {};

  try {
    const account = await getCustomerAccount(request.customerSession.customerCode || request.customerSession.userName);
    if (!account) {
      return response.status(404).json({ ok: false, error: "Customer account not found." });
    }

    const hsCodeResult = await query(
      `select item_name, alternate_name, hs_code, item_code
       from hs_code_master
       where lower(item_name) = lower($1)
          or lower(alternate_name) = lower($1)
          or lower(item_code) = lower($1)
       limit 1`,
      [String(data.itemName || data.item_code || data.itemCode || "").trim()]
    );
    const hsCode = hsCodeResult.rows[0] || null;
    const status = await evaluateShipmentRequestStatus({
      ...data,
      hsCode: data.hsCode || hsCode?.hs_code || "",
      itemCode: data.itemCode || hsCode?.item_code || ""
    }, account);
    const requestNo = await nextShipmentRequestNo();
    const attachments = Array.isArray(data.attachments) ? data.attachments : Array.isArray(data.attachmentsJson) ? data.attachmentsJson : [];
    const row = {
      request_no: requestNo,
      customer_code: account.customer_code,
      customer_name: account.customer_name || request.customerSession.customerName || account.customer_code,
      shipment_type: String(data.shipmentType || data.shipment_type || "").trim(),
      origin: String(data.origin || "").trim(),
      destination: String(data.destination || "").trim(),
      consignee: String(data.consignee || "").trim(),
      item_name: String(data.itemName || data.item_name || "").trim(),
      hs_code: String(data.hsCode || hsCode?.hs_code || "").trim(),
      item_code: String(data.itemCode || hsCode?.item_code || "").trim(),
      quantity: Number(data.quantity || 0),
      weight: Number(data.weight || 0),
      invoice_value: Number(data.invoiceValue || data.invoice_value || 0),
      remarks: String(data.remarks || "").trim(),
      attachments_json: JSON.stringify(attachments),
      request_details_json: JSON.stringify(data.requestDetails || data.request_details || {}),
      status,
      approval_notes: status === "AUTO_APPROVED" ? "Auto approved by portal rules." : "",
      auto_approved: status === "AUTO_APPROVED",
      created_by: request.customerSession.userName
    };

    const saved = await insertRow(resources["shipment-requests"], row);

    await Promise.all([
      createCustomerNotification({
        userId: request.customerSession.userName,
        customerCode: account.customer_code,
        userType: "customer",
        type: status === "AUTO_APPROVED" ? "Shipment Auto Approved" : "Shipment Pending Review",
        title: "Shipment request " + requestNo,
        message: "Your shipment request " + requestNo + " was submitted with " + status.toLowerCase().replace(/_/g, " ") + "."
      }),
      createCustomerNotification({
        userId: "admin",
        customerCode: account.customer_code,
        userType: "company",
        type: "Shipment Submitted",
        title: "New customer request " + requestNo,
        message: (account.customer_name || account.customer_code) + " submitted a shipment request."
      }),
      createCustomerActivity({
        customerUserId: request.customerSession.customerUserId,
        customerCode: account.customer_code,
        action: "Shipment Submission",
        description: "Submitted " + requestNo + " for " + row.item_name,
        ipAddress: request.ip || ""
      })
    ]);

    return response.status(201).json({
      ok: true,
      row: saved,
      status
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.status(201).json({
        ok: true,
        mode: "demo",
        row: { ...data, requestNo: "SRQ-260002" },
        status: "AUTO_APPROVED"
      });
    }

    return next(error);
  }
});

app.put("/api/customer/shipment-requests/:requestNo", requireCustomerPortalAuth, async (request, response, next) => {
  const data = request.body || {};
  const requestNo = String(request.params.requestNo || "").trim();
  try {
    const account = await getCustomerAccount(request.customerSession.customerCode || request.customerSession.userName);
    const existing = await query(
      `select * from shipment_requests where request_no = $1 and lower(customer_code) = lower($2) limit 1`,
      [requestNo, String(account?.customer_code || "")]
    );
    const current = existing.rows[0];
    if (!current) return response.status(404).json({ ok: false, error: "Shipment request was not found." });
    if (String(current.status || "").toUpperCase() !== "SENT_BACK") {
      return response.status(409).json({ ok: false, error: "Only a sent-back request can be edited and resubmitted." });
    }
    const details = JSON.stringify(data.requestDetails || data.request_details || {});
    const result = await query(
      `update shipment_requests set shipment_type=$1, origin=$2, destination=$3, consignee=$4, item_name=$5,
        hs_code=$6, item_code=$7, quantity=$8, weight=$9, invoice_value=$10, remarks=$11,
        request_details_json=$12, status='SUBMITTED', approval_notes='', auto_approved=false
       where request_no=$13 returning *`,
      [String(data.shipmentType || ""), String(data.origin || ""), String(data.destination || ""), String(data.consignee || ""),
        String(data.itemName || ""), String(data.hsCode || ""), String(data.itemCode || ""), Number(data.quantity || 0),
        Number(data.weight || 0), Number(data.invoiceValue || 0), String(data.remarks || ""), details, requestNo]
    );
    await Promise.all([
      createCustomerNotification({ userId: request.customerSession.userName, customerCode: current.customer_code, userType: "customer", type: "REQUEST_RESUBMITTED", title: "Shipment request " + requestNo, message: "Your corrected shipment request was resubmitted for company review." }),
      createCustomerNotification({ userId: "admin", customerCode: current.customer_code, userType: "company", type: "REQUEST_RESUBMITTED", title: "Customer request resubmitted " + requestNo, message: (current.customer_name || current.customer_code) + " corrected and resubmitted a shipment request." }),
      createCustomerActivity({ customerUserId: request.customerSession.customerUserId, customerCode: current.customer_code, action: "Shipment Resubmission", description: "Resubmitted " + requestNo + " after company feedback", ipAddress: request.ip || "" })
    ]);
    response.json({ ok: true, row: result.rows[0] });
  } catch (error) { next(error); }
});

app.get("/api/customer/profile", requireCustomerPortalAuth, async (request, response, next) => {
  try {
    const account = await getCustomerAccount(request.customerSession.customerCode || request.customerSession.userName);
    if (!account) {
      return response.status(404).json({ ok: false, error: "Customer account not found." });
    }

    response.json({
      ok: true,
      profile: {
        customerUserId: String(account.id || ""),
        customerCode: account.customer_code || "",
        customerName: account.customer_name || "",
        username: account.username || "",
        email: account.email || "",
        status: account.status || "ACTIVE",
        lastLogin: account.last_login || "",
        branch: account.customer_branch || ""
      }
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({
        ok: true,
        mode: "demo",
        profile: {
          customerUserId: "1",
          customerCode: "CUS-001",
          customerName: "Gulf Retail Trading",
          username: "gulf.retail",
          email: "portal@gulf-retail.example",
          status: "ACTIVE",
          lastLogin: "",
          branch: "Kuwait HO"
        }
      });
    }

    return next(error);
  }
});

app.put("/api/customer/profile", requireCustomerPortalAuth, async (request, response, next) => {
  const data = request.body || {};
  try {
    const account = await getCustomerAccount(request.customerSession.customerCode || request.customerSession.userName);
    if (!account) {
      return response.status(404).json({ ok: false, error: "Customer account not found." });
    }

    const userSets = [];
    const userValues = [];
    const customerSets = [];
    const customerValues = [];

    if (String(data.email || "").trim()) {
      userValues.push(String(data.email).trim());
      userSets.push("email = $" + userValues.length);
      customerValues.push(String(data.email).trim());
      customerSets.push("email = $" + customerValues.length);
    }

    if (String(data.password || "").trim()) {
      userValues.push(hashCustomerPassword(String(data.password).trim()));
      userSets.push("password_hash = $" + userValues.length);
    }

    if (String(data.mobile || "").trim()) {
      customerValues.push(String(data.mobile).trim());
      customerSets.push("mobile = $" + customerValues.length);
    }

    if (String(data.fullAddress || data.full_address || "").trim()) {
      customerValues.push(String(data.fullAddress || data.full_address).trim());
      customerSets.push("full_address = $" + customerValues.length);
    }

    if (!userSets.length && !customerSets.length) {
      return response.status(400).json({ ok: false, error: "No profile changes were provided." });
    }

    if (userSets.length) {
      userValues.push(account.id);
      await query("update customer_users set " + userSets.join(", ") + " where id = $" + userValues.length, userValues);
    }

    if (customerSets.length) {
      customerValues.push(account.customer_code);
      await query("update customers set " + customerSets.join(", ") + " where code = $" + customerValues.length, customerValues);
    }

    await createCustomerActivity({
      customerUserId: request.customerSession.customerUserId,
      customerCode: account.customer_code,
      action: "Profile Update",
      description: "Updated customer profile details",
      ipAddress: request.ip || ""
    });

    return response.json({ ok: true });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({ ok: true, mode: "demo" });
    }

    return next(error);
  }
});
app.get("/api/employee-profile-documents", requireEmployeePortalAuth, async (request, response, next) => {
  const sessionUser = String(request.appSession?.userName || "").trim();
  const role = String(request.appSession?.role || "").toLowerCase();
  const requestedUser = String(request.query?.employee || "").trim();
  const isAdmin = isHrAdminSession(request.appSession);
  if (!sessionUser) return response.status(401).json({ ok: false, error: "Login required." });
  const userName = isAdmin && requestedUser ? requestedUser : sessionUser;
  if (!isAdmin && requestedUser && requestedUser.toLowerCase() !== sessionUser.toLowerCase()) {
    return response.status(403).json({ ok: false, error: "You can only view your own employee documents." });
  }
  try {
    const result = await query(
      `select document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_at
       from documents
       where lower(linked_no) = lower($1) and type = any($2::text[])
       order by type`,
      [userName, [...EMPLOYEE_DOCUMENT_TYPE_NAMES]]
    );
    return response.json({ ok: true, employeeUserName: userName, rows: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/employee-profile-documents/:documentNo/view", requireEmployeePortalAuth, async (request, response, next) => {
  const userName = String(request.appSession?.userName || "").trim();
  const role = String(request.appSession?.role || "").toLowerCase();
  const isAdmin = isHrAdminSession(request.appSession);
  const documentNo = String(request.params.documentNo || "").trim();
  if (!userName || !documentNo) return response.status(400).json({ ok: false, error: "Document not found." });
  try {
    const result = isAdmin
      ? await query(`select document_no, linked_no, type, file_name, storage_url, notes from documents where document_no = $1 and type = any($2::text[]) limit 1`, [documentNo, [...EMPLOYEE_DOCUMENT_TYPE_NAMES]])
      : await query(`select document_no, linked_no, type, file_name, storage_url, notes from documents where document_no = $1 and lower(linked_no) = lower($2) and type = any($3::text[]) limit 1`, [documentNo, userName, [...EMPLOYEE_DOCUMENT_TYPE_NAMES]]);
    const documentItem = result.rows[0];
    if (!documentItem?.storage_url) return response.status(404).json({ ok: false, error: "Uploaded file not found." });
    const typeConfig = employeeDocumentType(documentItem.type);
    if (!typeConfig?.privateAsset) return response.json({ ok: true, url: documentItem.storage_url });

    const cloudinary = cloudinaryConfig();
    if (!cloudinary) return response.status(503).json({ ok: false, error: "Cloudinary is not configured on the server." });
    let metadata = {};
    try { metadata = JSON.parse(documentItem.notes || "{}"); } catch { metadata = {}; }
    const url = cloudinaryPrivateDownloadUrl(cloudinary, {
      publicId: String(metadata.cloudinaryPublicId || ""),
      fileName: documentItem.file_name,
      resourceType: String(metadata.resourceType || typeConfig.kind)
    });
    if (!url) return response.status(404).json({ ok: false, error: "The private file details are incomplete. Upload the file again." });
    return response.json({ ok: true, url });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/employee-profile-documents", requireEmployeePortalAuth, async (request, response, next) => {
  const sessionUser = String(request.appSession?.userName || "").trim();
  const role = String(request.appSession?.role || "").toLowerCase();
  const requestedUser = String(request.body?.employeeUserName || "").trim();
  const isAdmin = isHrAdminSession(request.appSession);
  const userName = isAdmin && requestedUser ? requestedUser : sessionUser;
  if (!sessionUser || (!isAdmin && requestedUser && requestedUser.toLowerCase() !== sessionUser.toLowerCase())) {
    return response.status(403).json({ ok: false, error: "You can only upload your own employee documents." });
  }
  const documentTypeName = String(request.body?.documentType || "").trim();
  const typeConfig = employeeDocumentType(documentTypeName);
  const fileName = String(request.body?.fileName || "").trim();
  const mimeType = String(request.body?.mimeType || "").toLowerCase().trim();
  const contentBase64 = String(request.body?.contentBase64 || "").replace(/^data:[^,]+,/, "").trim();
  if (!userName || !typeConfig || !fileName || !contentBase64) {
    return response.status(400).json({ ok: false, error: "Choose a valid employee document file." });
  }
  if (!typeConfig.mimeTypes.has(mimeType)) return response.status(400).json({ ok: false, error: "Employee documents must be PDF, JPG, JPEG, or PNG files." });

  if (!isAdmin) {
    const existing = (await query("select notes from documents where document_no=$1 and type=any($2::text[]) limit 1", [employeeDocumentNo(userName, typeConfig), [...EMPLOYEE_DOCUMENT_TYPE_NAMES]])).rows[0];
    let metadata = {};
    try { metadata = JSON.parse(existing?.notes || "{}"); } catch { metadata = {}; }
    if (metadata.locked === true) return response.status(423).json({ ok: false, error: "This document is locked by HR. Contact HR to unlock it before replacing the file." });
  }

  const cloudinary = cloudinaryConfig();
  if (!cloudinary) {
    return response.status(503).json({ ok: false, error: "Cloudinary is not configured on the server." });
  }

  try {
    const fileBuffer = Buffer.from(contentBase64, "base64");
    if (!fileBuffer.length || fileBuffer.length > typeConfig.maxBytes) {
      return response.status(400).json({ ok: false, error: `File must be ${typeConfig.maxBytes / 1024 / 1024} MB or smaller.` });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "apollo-freight/employee-private";
    const publicId = `${safeEmployeeDocumentPart(userName)}-${typeConfig.code.toLowerCase()}`;
    const signatureParams = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${typeConfig.privateAsset ? "&type=private" : ""}`;
    const signature = crypto.createHash("sha1").update(signatureParams + cloudinary.apiSecret).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);
    form.append("api_key", cloudinary.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("public_id", publicId);
    form.append("overwrite", "true");
    if (typeConfig.privateAsset) form.append("type", "private");
    form.append("signature", signature);
    const uploadKind = mimeType === "application/pdf" ? "raw" : "image";
    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/${uploadKind}/upload`, { method: "POST", body: form });
    const uploaded = await cloudinaryResponse.json().catch(() => ({}));
    if (!cloudinaryResponse.ok || !uploaded.secure_url) {
      throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
    }
    const documentNo = employeeDocumentNo(userName, typeConfig);
    const notes = JSON.stringify({ cloudinaryPublicId: uploaded.public_id || "", resourceType: uploaded.resource_type || typeConfig.kind, bytes: uploaded.bytes || fileBuffer.length });
    const saved = await query(
      `insert into documents (document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_by)
       values ($1, $2, $3, 'Uploaded', current_date, $2, $4, $5, $6, $2)
       on conflict (document_no) do update set file_name = excluded.file_name, storage_url = excluded.storage_url, notes = excluded.notes, status = 'Uploaded', date = current_date, updated_at = now()
       returning document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_at`,
      [documentNo, userName, documentTypeName, fileName, uploaded.secure_url, notes]
    );
    return response.status(201).json({ ok: true, row: saved.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/employee-profile-documents/:documentNo/lock", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    if (!isHrAdminSession(request.appSession)) return response.status(403).json({ ok: false, error: "Only HR can lock or unlock employee documents." });
    const documentNo = String(request.params.documentNo || "").trim();
    const locked = request.body?.locked === true || String(request.body?.locked || "").toLowerCase() === "true";
    const existing = (await query("select document_no, notes from documents where document_no=$1 and type=any($2::text[]) limit 1", [documentNo, [...EMPLOYEE_DOCUMENT_TYPE_NAMES]])).rows[0];
    if (!existing) return response.status(404).json({ ok: false, error: "Employee document not found." });
    let metadata = {};
    try { metadata = JSON.parse(existing.notes || "{}"); } catch { metadata = {}; }
    metadata.locked = locked;
    metadata.lockedAt = locked ? new Date().toISOString() : "";
    metadata.lockedBy = locked ? String(request.appSession?.userName || "HR") : "";
    const result = await query("update documents set notes=$2, updated_at=now() where document_no=$1 returning document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_at", [documentNo, JSON.stringify(metadata)]);
    return response.json({ ok: true, row: result.rows[0] });
  } catch (error) { return next(error); }
});

app.delete("/api/employee-profile-documents/:documentNo", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const sessionUser = String(request.appSession?.userName || "").trim();
    const isAdmin = isHrAdminSession(request.appSession);
    const documentNo = String(request.params.documentNo || "").trim();
    const documentItem = (await query("select document_no,linked_no,type,notes from documents where document_no=$1 and type=any($2::text[]) limit 1", [documentNo, [...EMPLOYEE_DOCUMENT_TYPE_NAMES]])).rows[0];
    if (!documentItem) return response.status(404).json({ok:false,error:"Employee document not found."});
    if (!isAdmin && String(documentItem.linked_no || "").toLowerCase() !== sessionUser.toLowerCase()) return response.status(403).json({ok:false,error:"You can only delete your own employee documents."});
    let metadata = {};
    try { metadata = JSON.parse(documentItem.notes || "{}"); } catch { metadata = {}; }
    if (!isAdmin && metadata.locked === true) return response.status(423).json({ ok: false, error: "This document is locked by HR. Contact HR to unlock it before deleting the file." });
    await query("delete from documents where document_no=$1", [documentNo]);
    return response.json({ok:true,documentNo});
  } catch (error) { return next(error); }
});

app.post("/api/pod-documents", requireAppAuth, async (request, response, next) => {
  const userName = String(request.appSession?.userName || "").trim();
  const jobNo = String(request.body?.jobNo || "").trim();
  const fileName = String(request.body?.fileName || "").trim();
  const mimeType = String(request.body?.mimeType || "").toLowerCase().trim();
  const contentBase64 = String(request.body?.contentBase64 || "").replace(/^data:[^,]+,/, "").trim();
  // Which delivery split this POD belongs to (a shipment delivered in multiple parts gets one POD
  // per split). Optional for backward compatibility - omitting it keeps the old single-POD-per-
  // shipment behavior (overwrites any previous POD for that job).
  const splitNo = String(request.body?.splitNo || "").trim();
  const requestedAirwayBillNo = String(request.body?.airwayBillNo || request.body?.airway_bill_no || "").trim();
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
  if (!userName || !jobNo || !fileName || !contentBase64 || !allowedTypes.has(mimeType)) {
    return response.status(400).json({ ok: false, error: "POD file must be a PDF, JPG, JPEG, or PNG file." });
  }
  const cloudinary = cloudinaryConfig();
  if (!cloudinary) return response.status(503).json({ ok: false, error: "Cloudinary is not configured on the server." });

  try {
    const shipment = await query("select job_no, airway_bill_no from shipments where lower(job_no) = lower($1) limit 1", [jobNo]);
    if (!shipment.rows[0]) return response.status(404).json({ ok: false, error: "Shipment not found." });
    const fileBuffer = Buffer.from(contentBase64, "base64");
    if (!fileBuffer.length || fileBuffer.length > 10 * 1024 * 1024) {
      return response.status(400).json({ ok: false, error: "POD file must be 10 MB or smaller." });
    }
    const kind = mimeType === "application/pdf" ? "raw" : "image";
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "apollo-freight/pod";
    const jobNoPart = safeEmployeeDocumentPart(jobNo);
    const publicId = splitNo ? `${jobNoPart}-signed-pod-split-${safeEmployeeDocumentPart(splitNo)}` : `${jobNoPart}-signed-pod`;
    const signatureBase = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}${cloudinary.apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);
    form.append("api_key", cloudinary.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("public_id", publicId);
    form.append("overwrite", "true");
    form.append("signature", signature);
    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/${kind}/upload`, { method: "POST", body: form });
    const uploaded = await cloudinaryResponse.json().catch(() => ({}));
    if (!cloudinaryResponse.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
    const documentNo = splitNo ? `POD-${jobNoPart.toUpperCase()}-${safeEmployeeDocumentPart(splitNo).toUpperCase()}` : `POD-${jobNoPart.toUpperCase()}`;
    const notes = JSON.stringify({ cloudinaryPublicId: uploaded.public_id || "", resourceType: uploaded.resource_type || kind, bytes: uploaded.bytes || fileBuffer.length, signedPod: true, splitNo: splitNo || "" });
    const saved = await query(
      `insert into documents (document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_by)
       values ($1, $2, 'POD', 'Uploaded', current_date, $3, $4, $5, $6, $3)
       on conflict (document_no) do update set file_name = excluded.file_name, storage_url = excluded.storage_url, notes = excluded.notes, status = 'Uploaded', date = current_date, owner = excluded.owner, updated_at = now()
       returning document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_at`,
      [documentNo, jobNo, userName, fileName, uploaded.secure_url, notes]
    );
    const airwayBillNo = String(shipment.rows[0].airway_bill_no || requestedAirwayBillNo).trim();
    let relatedRows = [shipment.rows[0]];
    let relatedDocuments = [saved.rows[0]];
    if (airwayBillNo) {
      const grouped = await withDatabaseTransaction(async (client) => {
        const updated = await client.query(
          "update shipments set status = 'Delivered', pod_status = 'Uploaded', updated_at = now() where lower(trim(airway_bill_no)) = lower(trim($1)) returning *",
          [airwayBillNo]
        );
        for (const related of updated.rows) {
          const relatedJobPart = safeEmployeeDocumentPart(related.job_no);
          const relatedDocumentNo = splitNo ? `POD-${relatedJobPart.toUpperCase()}-${safeEmployeeDocumentPart(splitNo).toUpperCase()}` : `POD-${relatedJobPart.toUpperCase()}`;
          const relatedDocument = await client.query(
            `insert into documents (document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_by)
             values ($1, $2, 'POD', 'Uploaded', current_date, $3, $4, $5, $6, $3)
             on conflict (document_no) do update set file_name = excluded.file_name, storage_url = excluded.storage_url, notes = excluded.notes, status = 'Uploaded', date = current_date, owner = excluded.owner, updated_at = now()
             returning document_no, linked_no, type, status, date, owner, file_name, storage_url, notes, created_at`,
            [relatedDocumentNo, related.job_no, userName, fileName, uploaded.secure_url, notes]
          );
          relatedDocuments.push(relatedDocument.rows[0]);
        }
        return { rows: updated.rows, documents: relatedDocuments };
      });
      relatedRows = grouped.rows;
      relatedDocuments = grouped.documents;
    }
    return response.status(201).json({ ok: true, row: saved.rows[0], airwayBillNo, relatedRows, relatedDocuments });
  } catch (error) {
    return next(error);
  }
});



// --- HR Leave Management ----------------------------------------------------
function isHrAdminSession(session) {
  const role = String(session?.role || "").toLowerCase();
  return Boolean(session?.employeePortal && (["admin", "hr"].includes(role) || session?.isHrAdmin === true));
}

function requireHrAdmin(request, response, next) {
  const session = request.appSession || appAuthFromRequest(request);
  if (!session) return response.status(401).json({ ok: false, error: "Login required." });
  if (!isHrAdminSession(session)) {
    return response.status(403).json({ ok: false, error: "HR Admin access is required." });
  }
  request.appSession = session;
  return next();
}

async function canApproveLeave(session) {
  const role = String(session?.role || "").toLowerCase();
  if (isHrAdminSession(session)) return { allowed: true, delegated: false };
  if (!session?.employeePortal || !session?.userName) return { allowed: false, delegated: false };
  const delegated = await query(
    `select id from hr_leave_delegations
     where lower(delegate_user_name)=lower($1) and active=true and current_date between start_date and end_date limit 1`,
    [session.userName]
  );
  return { allowed: Boolean(delegated.rows[0]), delegated: Boolean(delegated.rows[0]) };
}

function isoDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : "";
}

function normalizeHrBranch(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/dubai|dxb/.test(text)) return "Dubai";
  return "Kuwait HO";
}

function hrBranchForRequest(request, requestedBranch = "") {
  const role = String(request.appSession?.role || "").toLowerCase();
  const requested = String(requestedBranch || "").trim();
  if (isHrAdminSession(request.appSession) && requested) return requested.toLowerCase() === "all" ? "All" : normalizeHrBranch(requested);
  return normalizeHrBranch(String(request.appSession?.branchAccess || "").split(",")[0]);
}

function dateParts(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const rows = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    rows.push(new Date(cursor));
  }
  return rows;
}

async function hrCalendarRules(branch = "Kuwait HO") {
  const [weekends, holidays, types] = await Promise.all([
    query("select branch,weekday,active from hr_weekend_rules where branch in ('All',$1) order by weekday", [branch]),
    query("select id, holiday_date, day_type, title, notes, branch from hr_calendar_days where active = true and (lower(trim(branch))='all' or lower(trim(branch))=lower(trim($1))) order by holiday_date", [branch]),
    query("select * from hr_leave_types where active = true order by id")
  ]);
  const normalizedBranch = String(branch || "").trim().toLowerCase() === "all" ? "All" : normalizeHrBranch(branch);
  const exactWeekendRows = weekends.rows.filter((row) => String(row.branch || "").trim().toLowerCase() !== "all" && normalizeHrBranch(row.branch) === normalizedBranch);
  const sharedWeekendRows = weekends.rows.filter((row) => String(row.branch || "").trim().toLowerCase() === "all");
  const activeExactWeekendRows = exactWeekendRows.filter((row) => row.active);
  let weekendOverride = null;
  try { weekendOverride = (await query("select configured from hr_weekend_rule_overrides where branch=$1 limit 1", [normalizedBranch])).rows[0] || null; } catch (error) { if (error.code !== "42P01") throw error; }
  const weekendRows = weekendOverride ? activeExactWeekendRows : (activeExactWeekendRows.length ? activeExactWeekendRows : sharedWeekendRows.filter((row) => row.active));
  const effectiveDates = new Map();
  for (const row of holidays.rows) {
    const isAll = String(row.branch || "").trim().toLowerCase() === "all";
    const isExact = !isAll && normalizeHrBranch(row.branch) === normalizedBranch;
    if (!isAll && !isExact) continue;
    const date = String(row.holiday_date).slice(0, 10);
    const current = effectiveDates.get(date);
    const priority = (isExact ? 2 : 1) + (String(row.day_type || "").toUpperCase() === "WORKING_DAY" ? 1 : 0);
    if (!current || priority >= current.priority) effectiveDates.set(date, { row, priority });
  }
  return { branch: normalizedBranch, weekends: weekendRows.map((row) => Number(row.weekday)), holidays: [...effectiveDates.values()].map((entry) => entry.row), leaveTypes: types.rows };
}

async function calculateHrLeave(startDate, endDate, branch = "Kuwait HO") {
  const dates = dateParts(startDate, endDate);
  if (!dates) throw new Error("A valid leave date range is required.");
  const rules = await hrCalendarRules(branch);
  const holidayMap = new Map(rules.holidays
    .filter((row) => String(row.day_type || "").trim().toUpperCase() === "PUBLIC_HOLIDAY")
    .map((row) => [String(row.holiday_date).slice(0, 10), row]));
  let weekendDays = 0;
  let publicHolidayDays = 0;
  let workingDays = 0;
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    const day = date.getUTCDay();
    // Weekends count as leave. A marked public holiday is the only date
    // excluded from the leave total, even if it is also a weekend.
    if (rules.weekends.includes(day)) weekendDays += 1;
    if (holidayMap.has(key) && String(holidayMap.get(key).day_type) === "PUBLIC_HOLIDAY") {
      publicHolidayDays += 1;
    } else {
      workingDays += 1;
    }
  }
  return {
    calendarDays: dates.length,
    weekendDays,
    publicHolidayDays,
    actualLeaveDays: workingDays
  };
}

async function hrBalanceForUser(userName, year, leaveTypeCode) {
  const type = (await query("select * from hr_leave_types where upper(code)=upper($1) or lower(name)=lower($1) limit 1", [leaveTypeCode])).rows[0];
  if (!type) throw new Error("Leave type not found.");
  const normalizedLeaveTypeCode = String(type.code || leaveTypeCode).trim().toUpperCase();
  const policy = (await query(
    "select * from hr_employee_leave_policies where lower(user_name)=lower($1) and year=$2 and leave_type_code=$3 order by case when user_name=$1 then 0 else 1 end, updated_at desc nulls last, id desc limit 1",
    [userName, year, normalizedLeaveTypeCode]
  )).rows[0];
  const entitlement = Number(policy?.entitlement ?? type.annual_entitlement ?? 0);
  let carryForward = Number(policy?.carry_forward ?? 0);
  if (!policy && type.allow_carry_forward && year > 1) {
    const previous = (await query(`select greatest(0, least($1, coalesce(b.available_days,0))) as days from hr_leave_balances b where lower(b.user_name)=lower($2) and b.year=$3 and b.leave_type_code=$4 limit 1`, [Number(type.max_carry_forward || 0), userName, year - 1, normalizedLeaveTypeCode])).rows[0];
    carryForward = Number(previous?.days || 0);
    if (type.carry_forward_expiry_month && type.carry_forward_expiry_day) {
      const expiry = new Date(Date.UTC(year, Number(type.carry_forward_expiry_month) - 1, Number(type.carry_forward_expiry_day)));
      if (new Date() > expiry) carryForward = 0;
    }
  }
  const adjustment = Number(policy?.adjustment ?? 0);
  const previousUsed = Number(policy?.previous_used_days ?? 0);
  const approvedUsed = Number((await query(
    "select coalesce(sum(coalesce(actual_leave_days,total_days)+coalesce(late_return_days,0)),0) as days from leave_requests where lower(user_name)=lower($1) and status='Approved' and (upper(leave_type)=upper($2) or lower(leave_type)=lower((select name from hr_leave_types where code=$2))) and extract(year from start_date)=$3",
    [userName, normalizedLeaveTypeCode, year]
  )).rows[0]?.days || 0);
  const used = previousUsed + approvedUsed;
  const pending = Number((await query(
    "select coalesce(sum(coalesce(actual_leave_days,total_days)),0) as days from leave_requests where lower(user_name)=lower($1) and status='Pending' and (upper(leave_type)=upper($2) or lower(leave_type)=lower((select name from hr_leave_types where code=$2))) and extract(year from start_date)=$3",
    [userName, normalizedLeaveTypeCode, year]
  )).rows[0]?.days || 0);
  const available = entitlement + carryForward + adjustment - used;
  const projected = available - pending;
  await query(
    `insert into hr_leave_balances (user_name, year, leave_type_code, entitlement, carry_forward, adjustment, used_days, pending_days, available_days, projected_days, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     on conflict (user_name,year,leave_type_code) do update set entitlement=excluded.entitlement,carry_forward=excluded.carry_forward,adjustment=excluded.adjustment,used_days=excluded.used_days,pending_days=excluded.pending_days,available_days=excluded.available_days,projected_days=excluded.projected_days,updated_at=now()`,
    [userName, year, normalizedLeaveTypeCode, entitlement, carryForward, adjustment, used, pending, available, projected]
  );
  return { userName, year, leaveTypeCode: normalizedLeaveTypeCode, leaveTypeName: type.name, entitlement, carryForward, adjustment, previousUsed, approvedUsed, used, pending, available, projected };
}

async function hrAllBalances(userName, year) {
  const types = (await query("select code from hr_leave_types where active=true order by id")).rows;
  return Promise.all(types.map((row) => hrBalanceForUser(userName, year, row.code)));
}

async function hrAllYearBalances(userName) {
  const years = (await query(
    `select distinct year from hr_employee_leave_policies where lower(user_name)=lower($1)
     union select distinct extract(year from start_date)::int from leave_requests where lower(user_name)=lower($1)
     union select $2
     order by year desc`,
    [userName, new Date().getFullYear()]
  )).rows.map((row) => Number(row.year)).filter(Number.isFinite);
  const balances = await Promise.all(years.map((year) => hrAllBalances(userName, year)));
  return balances.flat();
}

app.get("/api/hr/leave-config", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const year = Number(request.query.year || new Date().getFullYear());
    const branch = hrBranchForRequest(request, request.query.branch);
    const config = await hrCalendarRules(branch);
    const userName = String(request.appSession.userName || "").trim();
    const balances = await hrAllBalances(userName, year);
    const employee = (await query("select user_name, full_name, department, designation, join_date, employment_status, reporting_manager from employees where lower(user_name)=lower($1) limit 1", [userName])).rows[0] || null;
    return response.json({ ok: true, year, ...config, balances, employee });
  } catch (error) { return next(error); }
});

app.get("/api/hr/calendar", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const from = isoDate(request.query.from) || `${new Date().getFullYear()}-01-01`;
    const to = isoDate(request.query.to) || `${new Date().getFullYear()}-12-31`;
    const branch = hrBranchForRequest(request, request.query.branch);
    const config = await hrCalendarRules(branch);
    const weekends = config.weekends;
    const holidays = config.holidays.filter((row) => String(row.holiday_date).slice(0,10) >= from && String(row.holiday_date).slice(0,10) <= to);
    return response.json({ ok: true, from, to, weekends, holidays });
  } catch (error) { return next(error); }
});

app.get("/api/hr/balances", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const year = Number(request.query.year || new Date().getFullYear());
    const userName = String(request.query.userName || request.appSession.userName || "").trim();
    if (userName.toLowerCase() !== String(request.appSession.userName || "").toLowerCase() && !isHrAdminSession(request.appSession)) return response.status(403).json({ ok:false,error:"You can only view your own balance." });
    return response.json({ ok:true, year, rows: await hrAllBalances(userName, year) });
  } catch (error) { return next(error); }
});

app.get("/api/hr/leave-ledger", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const requestedUser = String(request.query.userName || request.appSession.userName || "").trim();
    const role = String(request.appSession.role || "").toLowerCase();
    if (requestedUser.toLowerCase() !== String(request.appSession.userName || "").toLowerCase() && !isHrAdminSession(request.appSession)) return response.status(403).json({ok:false,error:"You can only view your own leave ledger."});
    const rows = (await query("select user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by,created_at from hr_leave_ledger where lower(user_name)=lower($1) order by created_at desc limit 100", [requestedUser])).rows;
    return response.json({ok:true,rows});
  } catch (error) { return next(error); }
});

app.get("/api/hr/leave-requests", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const role = String(request.appSession.role || "").toLowerCase();
    const admin = ["admin","hr"].includes(role);
    const values = [];
    let where = "";
    if (!admin) { values.push(request.appSession.userName); where = "where lower(user_name)=lower($1)"; }
    const result = await query(`select request_no,user_name,employee_name,leave_type,start_date,end_date,total_days,calendar_days,weekend_days,public_holiday_days,actual_leave_days,half_day_type,reason,rejoining_date,contact_during_leave,leave_address,emergency_contact,declaration_accepted,attachment_url,status,approved_by,approved_at,rejection_reason,cancellation_reason,rejoined_at,rejoined_by,late_return_days,applied_at,created_at,updated_at from leave_requests ${where} order by applied_at desc`, values);
    return response.json({ok:true,rows:result.rows});
  } catch(error){ return next(error); }
});

function emailHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[character]));
}

async function notifyHrAdminsOfLeaveSubmission({ row, employee, branch }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();
  if (!apiKey || !from) {
    console.warn("Leave email notification skipped: RESEND_API_KEY and EMAIL_FROM are not configured.");
    return false;
  }
  const recipients = (await query(
    `select distinct lower(trim(email)) as email
       from app_users
      where account_status='Active'
        and nullif(trim(email),'') is not null
        and (coalesce(is_hr_admin,false)=true or lower(trim(role)) in ('admin','hr'))`
  )).rows.map(item => item.email).filter(Boolean);
  if (!recipients.length) {
    console.warn("Leave email notification skipped: no active HR/admin email address is registered.");
    return false;
  }
  const employeeName = employee.full_name || row.employee_name || row.user_name;
  const subject = `New leave request ${row.request_no} — ${employeeName}`;
  const html = `<h2>New Leave Request</h2>
    <p>A new leave request was submitted from the HR portal and is waiting for HR/admin review.</p>
    <table cellpadding="6" cellspacing="0" border="0">
      <tr><td><strong>Request No.</strong></td><td>${emailHtml(row.request_no)}</td></tr>
      <tr><td><strong>Employee</strong></td><td>${emailHtml(employeeName)} (${emailHtml(row.user_name)})</td></tr>
      <tr><td><strong>Branch</strong></td><td>${emailHtml(branch)}</td></tr>
      <tr><td><strong>Leave Type</strong></td><td>${emailHtml(row.leave_type)}</td></tr>
      <tr><td><strong>Dates</strong></td><td>${emailHtml(row.start_date)} to ${emailHtml(row.end_date)}</td></tr>
      <tr><td><strong>Actual Leave Days</strong></td><td>${emailHtml(row.actual_leave_days)}</td></tr>
      <tr><td><strong>Reason</strong></td><td>${emailHtml(row.reason)}</td></tr>
    </table>
    <p>Please open the HR portal to review and approve or reject this request.</p>`;
  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, html })
  });
  if (!mailResponse.ok) {
    const detail = await mailResponse.text().catch(() => "");
    throw new Error(`Leave email provider returned ${mailResponse.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

app.post("/api/hr/leave-requests", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const data = request.body || {};
    const userName = String(request.appSession.userName || "").trim();
    const leaveType = String(data.leaveType || "ANNUAL").trim().toUpperCase();
    const type = (await query("select * from hr_leave_types where code=$1 and active=true limit 1", [leaveType])).rows[0];
    if (!type) return response.status(400).json({ok:false,error:"Choose a valid leave type."});
    const startDate = isoDate(data.startDate); const endDate = isoDate(data.endDate);
    const globalSettings = (await query("select settings_json from hr_leave_settings where settings_key='global' limit 1")).rows[0]?.settings_json || {};
    const backdatedDays = Math.max(0, Number(globalSettings.backdated_days ?? 3));
    const earliestStart = new Date(); earliestStart.setHours(0,0,0,0); earliestStart.setDate(earliestStart.getDate() - backdatedDays);
    if (startDate && new Date(`${startDate}T00:00:00`) < earliestStart) return response.status(400).json({ok:false,error:`Leave cannot be backdated by more than ${backdatedDays} day(s). Please contact HR.`});
    const branch = hrBranchForRequest(request);
    const calculation = await calculateHrLeave(startDate,endDate,branch);
    const halfDayType = String(data.halfDayType || "").toUpperCase();
    if (["FIRST_HALF","SECOND_HALF"].includes(halfDayType) && startDate !== endDate) return response.status(400).json({ok:false,error:"Half-day leave must use the same start and end date."});
    if (["FIRST_HALF","SECOND_HALF"].includes(halfDayType)) {
      calculation.actualLeaveDays = Math.max(0, calculation.actualLeaveDays - 0.5);
    }
    const declaration = Boolean(data.declarationAccepted);
    if (!declaration) return response.status(400).json({ok:false,error:"You must accept the self-declaration before submitting."});
    if (calculation.actualLeaveDays <= 0) return response.status(400).json({ok:false,error:"The selected period contains no working leave days."});
    const employee = (await query("select * from employees where lower(user_name)=lower($1) limit 1",[userName])).rows[0];
    if (!employee) return response.status(400).json({ok:false,error:"Employee profile not found."});
    const joinDate = employee.join_date ? new Date(`${String(employee.join_date).slice(0,10)}T00:00:00Z`) : null;
    const probationEnd = joinDate ? new Date(joinDate.getTime()) : null;
    if (probationEnd) probationEnd.setUTCMonth(probationEnd.getUTCMonth()+3);
    if (probationEnd && new Date(`${startDate}T00:00:00Z`) < probationEnd && !type.allow_during_probation) return response.status(400).json({ok:false,error:`${type.name} is not available during probation.`});
    const year = Number(startDate.slice(0,4));
    const balance = await hrBalanceForUser(userName, year, leaveType);
    if (calculation.actualLeaveDays > balance.projected && !type.allow_negative_balance) return response.status(400).json({ok:false,error:`Insufficient ${type.name} balance after pending requests. Available to reserve: ${balance.projected} day(s), requested: ${calculation.actualLeaveDays}.`});
    const calendarRules = await hrCalendarRules(branch);
    const blackout = calendarRules.holidays.find((item) => String(item.day_type || "").toUpperCase() === "BLACKOUT" && String(item.holiday_date).slice(0,10) >= startDate && String(item.holiday_date).slice(0,10) <= endDate);
    if (blackout) return response.status(400).json({ok:false,error:`Leave is restricted during ${blackout.title || 'a blackout date'}. HR must change the calendar rule first.`});
    const requestNo = `LV-${year}-${Date.now().toString().slice(-7)}`;
    const rejoiningDate = isoDate(data.rejoiningDate) || null;
    if (!rejoiningDate || rejoiningDate <= endDate) return response.status(400).json({ok:false,error:"A valid rejoining date after the leave end date is required."});
    const reason = String(data.reason || "").trim();
    const contactDuringLeave = String(data.contactDuringLeave || "").trim();
    const leaveAddress = String(data.leaveAddress || "").trim();
    if (!reason || !contactDuringLeave || !leaveAddress) return response.status(400).json({ok:false,error:"Reason, contact number and leave address are required."});
    const staffing = employee.department ? await query(
      `select count(*)::int as count from leave_requests r join employees e on lower(e.user_name)=lower(r.user_name)
       where lower(e.department)=lower($1) and r.status in ('Pending','Approved') and r.start_date <= $3 and r.end_date >= $2`,
      [employee.department, startDate, endDate]
    ) : { rows: [{ count: 0 }] };
    const staffingWarning = Number(staffing.rows[0]?.count || 0) > 0
      ? `${staffing.rows[0].count} colleague(s) in ${employee.department} already have overlapping pending or approved leave.` : "";
    const saved = await query(`insert into leave_requests (request_no,user_name,employee_name,leave_type,start_date,end_date,total_days,calendar_days,weekend_days,public_holiday_days,actual_leave_days,half_day_type,reason,rejoining_date,contact_during_leave,leave_address,emergency_contact,declaration_accepted,declaration_accepted_at,status,applied_at,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,now(),'Pending',now(),now(),now()) returning *`,
      [requestNo,userName,employee.full_name || userName,leaveType, startDate,endDate,calculation.actualLeaveDays,calculation.calendarDays,calculation.weekendDays,calculation.publicHolidayDays,calculation.actualLeaveDays,halfDayType,reason,rejoiningDate,contactDuringLeave,leaveAddress,String(data.emergencyContact||"").trim()]);
    try {
      await notifyHrAdminsOfLeaveSubmission({row:saved.rows[0], employee, branch});
    } catch (emailError) {
      // The leave record is already committed. Never turn a successful leave submission into a
      // failed request just because an external email provider is unavailable.
      console.error("Leave request saved, but HR email notification failed:", emailError.message);
    }
    return response.status(201).json({ok:true,row:saved.rows[0],calculation,balance,staffingWarning});
  } catch(error){ return next(error); }
});

app.post("/api/hr/leave-requests/:requestNo/attachment", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const requestNo = String(request.params.requestNo || "").trim();
    const existing = (await query("select * from leave_requests where request_no=$1 limit 1", [requestNo])).rows[0];
    if (!existing) return response.status(404).json({ok:false,error:"Leave request not found."});
    const admin = ["admin","hr"].includes(String(request.appSession.role||"").toLowerCase()) && Boolean(request.appSession.employeePortal);
    if (!admin && String(existing.user_name).toLowerCase() !== String(request.appSession.userName).toLowerCase()) return response.status(403).json({ok:false,error:"You can only attach a document to your own leave request."});
    const fileName = String(request.body?.fileName || "").trim();
    const mimeType = String(request.body?.mimeType || "").toLowerCase().trim();
    const contentBase64 = String(request.body?.contentBase64 || "").replace(/^data:[^,]+,/, "").trim();
    const allowed = new Set(["application/pdf","image/jpeg","image/png"]);
    if (!fileName || !contentBase64 || !allowed.has(mimeType)) return response.status(400).json({ok:false,error:"Supporting document must be a PDF, JPG or PNG."});
    const buffer = Buffer.from(contentBase64, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return response.status(400).json({ok:false,error:"Supporting document must be 10 MB or smaller."});
    const cloudinary = cloudinaryConfig();
    if (!cloudinary) return response.status(503).json({ok:false,error:"Cloudinary is not configured on the server."});
    const timestamp = Math.floor(Date.now()/1000);
    const folder = "apollo-freight/employee-leave";
    const publicId = safeEmployeeDocumentPart(requestNo);
    const signatureParams = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}&type=private`;
    const signature = crypto.createHash("sha1").update(signatureParams + cloudinary.apiSecret).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([buffer], {type:mimeType}), fileName);
    form.append("api_key", cloudinary.apiKey); form.append("timestamp", String(timestamp)); form.append("folder", folder); form.append("public_id", publicId); form.append("overwrite", "true"); form.append("type", "private"); form.append("signature", signature);
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/raw/upload`, {method:"POST", body:form});
    const uploaded = await uploadResponse.json().catch(()=>({}));
    if (!uploadResponse.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || "Supporting document upload failed.");
    const metadata = JSON.stringify({cloudinaryPublicId:uploaded.public_id || publicId,resourceType:uploaded.resource_type || "raw",bytes:uploaded.bytes || buffer.length,fileName});
    const saved = await query("update leave_requests set attachment_url=$1,updated_at=now() where request_no=$2 returning request_no,attachment_url",[metadata,requestNo]);
    return response.status(201).json({ok:true,row:saved.rows[0]});
  } catch(error){ return next(error); }
});

app.get("/api/hr/leave-requests/:requestNo/attachment", requireEmployeePortalAuth, async (request,response,next)=>{
  try{
    const requestNo=String(request.params.requestNo||"").trim();
    const existing=(await query("select request_no,user_name,attachment_url from leave_requests where request_no=$1 limit 1",[requestNo])).rows[0];
    if(!existing?.attachment_url) return response.status(404).json({ok:false,error:"No supporting document is attached."});
    const admin=isHrAdminSession(request.appSession);
    if(!admin && String(existing.user_name).toLowerCase()!==String(request.appSession.userName).toLowerCase()) return response.status(403).json({ok:false,error:"You can only view your own leave document."});
    let metadata={}; try{metadata=JSON.parse(existing.attachment_url||"{}");}catch{}
    const cloudinary=cloudinaryConfig(); if(!cloudinary||!metadata.cloudinaryPublicId) return response.status(404).json({ok:false,error:"Supporting document details are incomplete."});
    const url=cloudinaryPrivateDownloadUrl(cloudinary,{publicId:metadata.cloudinaryPublicId,fileName:metadata.fileName||"supporting-document.pdf",resourceType:metadata.resourceType||"raw"});
    if(!url) return response.status(404).json({ok:false,error:"Supporting document could not be opened."});
    return response.json({ok:true,url});
  }catch(error){return next(error);}
});

app.put("/api/hr/leave-requests/:requestNo/decision", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const authority = await canApproveLeave(request.appSession);
    if (!authority.allowed) return response.status(403).json({ok:false,error:"HR approval authority or an active delegation is required."});
    const requestNo = String(request.params.requestNo || "").trim();
    const decision = String(request.body?.decision || "").toLowerCase();
    if (!["approve","reject","sendback"].includes(decision)) return response.status(400).json({ok:false,error:"Decision must be approve, reject, or sendback."});
    const existing = (await query("select * from leave_requests where request_no=$1 limit 1",[requestNo])).rows[0];
    if (!existing) return response.status(404).json({ok:false,error:"Leave request not found."});
    if (existing.status !== "Pending") return response.status(400).json({ok:false,error:`This request is already ${existing.status}.`});
    const status = decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Sent Back";
    const comment = String(request.body?.reason || "").trim();
    if (decision !== "approve" && !comment) return response.status(400).json({ok:false,error:`A ${decision === "reject" ? "rejection" : "send-back"} reason is required.`});
    const saved = await query("update leave_requests set status=$1,approved_by=$2,approved_at=now(),rejection_reason=$3,approved_by_delegate=$4,updated_at=now() where request_no=$5 and status='Pending' returning *",[status,request.appSession.userName,comment,authority.delegated,requestNo]);
    if (!saved.rows[0]) return response.status(409).json({ok:false,error:"This leave request was already updated by another reviewer."});
    const balance = await hrBalanceForUser(existing.user_name, Number(String(existing.start_date).slice(0,4)), existing.leave_type);
    if (status === "Approved") await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'APPROVED_LEAVE',$4,$5,$6,$7,$8)",[existing.user_name,balance.year,existing.leave_type,requestNo,-Number(existing.actual_leave_days||existing.total_days||0),balance.available,"Leave approved",request.appSession.userName]);
    return response.json({ok:true,row:saved.rows[0]});
  } catch(error){ return next(error); }
});

app.post("/api/hr/leave-requests/:requestNo/cancel", requireEmployeePortalAuth, async (request, response, next) => {
  try {
    const requestNo=String(request.params.requestNo||"").trim();
    const existing=(await query("select * from leave_requests where request_no=$1 limit 1",[requestNo])).rows[0];
    if(!existing) return response.status(404).json({ok:false,error:"Leave request not found."});
    if(!["Pending","Sent Back","Approved"].includes(String(existing.status||""))) return response.status(400).json({ok:false,error:`A ${existing.status} leave request cannot be cancelled.`});
    const admin=isHrAdminSession(request.appSession);
    if(!admin && String(existing.user_name).toLowerCase()!==String(request.appSession.userName).toLowerCase()) return response.status(403).json({ok:false,error:"You can only cancel your own leave."});
    if(["Rejected","Cancelled"].includes(existing.status)) return response.status(400).json({ok:false,error:`This request is already ${existing.status}.`});
    const reason=String(request.body?.reason||"Cancelled by employee").trim();
    const saved=await query("update leave_requests set status='Cancelled',cancellation_reason=$1,updated_at=now() where request_no=$2 and status=$3 returning *",[reason,requestNo,existing.status]);
    if(!saved.rows[0]) return response.status(409).json({ok:false,error:"This leave request was already updated by another user."});
    if(existing.status==="Approved"){ const balance=await hrBalanceForUser(existing.user_name,Number(String(existing.start_date).slice(0,4)),existing.leave_type); await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'CANCELLATION',$4,$5,$6,$7,$8)",[existing.user_name,balance.year,existing.leave_type,requestNo,Number(existing.actual_leave_days||existing.total_days||0),balance.available,reason,request.appSession.userName]); }
    return response.json({ok:true,row:saved.rows[0]});
  }catch(error){return next(error);}
});

app.post("/api/hr/leave-requests/:requestNo/extension", requireEmployeePortalAuth, async (request,response,next)=>{
  try {
    const original=(await query("select * from leave_requests where request_no=$1 limit 1",[String(request.params.requestNo||"").trim()])).rows[0];
    if(!original) return response.status(404).json({ok:false,error:"Leave request not found."});
    const admin=isHrAdminSession(request.appSession);
    if(!admin && String(original.user_name).toLowerCase()!==String(request.appSession.userName).toLowerCase()) return response.status(403).json({ok:false,error:"You can only extend your own leave."});
    if(original.status!=="Approved") return response.status(400).json({ok:false,error:"Only an approved leave request can be extended."});
    const newEnd=isoDate(request.body?.endDate); const start=new Date(`${String(original.end_date).slice(0,10)}T00:00:00Z`); start.setUTCDate(start.getUTCDate()+1); const extensionStart=start.toISOString().slice(0,10);
    if(!newEnd||newEnd<extensionStart) return response.status(400).json({ok:false,error:"Extension end date must be after the current leave end date."});
    const calculation=await calculateHrLeave(extensionStart,newEnd,hrBranchForRequest(request)); if(calculation.actualLeaveDays<=0) return response.status(400).json({ok:false,error:"The extension contains no working leave days."});
    const type=(await query("select * from hr_leave_types where code=$1 limit 1",[String(original.leave_type||"").toUpperCase()])).rows[0];
    const balance=await hrBalanceForUser(original.user_name,Number(extensionStart.slice(0,4)),String(original.leave_type||"").toUpperCase());
    if(calculation.actualLeaveDays>balance.available&&!type?.allow_negative_balance) return response.status(400).json({ok:false,error:"Insufficient leave balance for this extension."});
    const requestNo=`LV-${extensionStart.slice(0,4)}-${Date.now().toString().slice(-7)}`;
    const saved=await query(`insert into leave_requests(request_no,user_name,employee_name,leave_type,start_date,end_date,total_days,calendar_days,weekend_days,public_holiday_days,actual_leave_days,reason,rejoining_date,contact_during_leave,leave_address,emergency_contact,declaration_accepted,declaration_accepted_at,status,applied_at,created_at,updated_at,extension_of,extension_reason)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,now(),'Pending',now(),now(),now(),$17,$18) returning *`,
      [requestNo,original.user_name,original.employee_name,original.leave_type,extensionStart,newEnd,calculation.actualLeaveDays,calculation.calendarDays,calculation.weekendDays,calculation.publicHolidayDays,calculation.actualLeaveDays,String(request.body?.reason||"Leave extension").trim(),request.body?.rejoiningDate||null,original.contact_during_leave,original.leave_address,original.emergency_contact,original.request_no,String(request.body?.reason||"Leave extension").trim()]);
    return response.status(201).json({ok:true,row:saved.rows[0],calculation});
  } catch(error){ return next(error); }
});

app.post("/api/hr/leave-requests/:requestNo/rejoin", requireEmployeePortalAuth, async (request,response,next)=>{
  try{
    const requestNo=String(request.params.requestNo||"").trim();
    const existing=(await query("select * from leave_requests where request_no=$1 limit 1",[requestNo])).rows[0];
    if(!existing) return response.status(404).json({ok:false,error:"Leave request not found."});
    if(existing.status!=="Approved") return response.status(400).json({ok:false,error:"Only approved leave can be marked as rejoined."});
    if(existing.rejoined_at) return response.status(409).json({ok:false,error:"This leave request has already been marked as rejoined."});
    const admin=isHrAdminSession(request.appSession);
    if(!admin && String(existing.user_name).toLowerCase()!==String(request.appSession.userName).toLowerCase()) return response.status(403).json({ok:false,error:"Not allowed."});
    const actualReturn=isoDate(request.body?.actualReturnDate)||new Date().toISOString().slice(0,10);
    const promised=isoDate(existing.rejoining_date);
    if(!promised||actualReturn<promised) return response.status(400).json({ok:false,error:"Actual return date must be on or after the promised rejoining date."});
    let lateReturnDays=0;
    if(actualReturn>promised){ const dayBefore=new Date(`${actualReturn}T00:00:00Z`); dayBefore.setUTCDate(dayBefore.getUTCDate()-1); const type=(await query("select paid from hr_leave_types where upper(code)=upper($1) or lower(name)=lower($1) limit 1",[existing.leave_type])).rows[0]; const calc=await calculateHrLeave(promised,dayBefore.toISOString().slice(0,10),hrBranchForRequest(request)); lateReturnDays=type?.paid===false?0:Number(calc.actualLeaveDays||0); }
    const saved=await query("update leave_requests set rejoined_at=$1,rejoined_by=$2,late_return_days=$3,updated_at=now() where request_no=$4 and rejoined_at is null returning *",[actualReturn,request.appSession.userName,lateReturnDays,requestNo]);
    if(!saved.rows[0]) return response.status(409).json({ok:false,error:"This leave request was already marked as rejoined."});
    if(lateReturnDays>0) await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'LATE_RETURN',$4,$5,0,$6,$7)",[existing.user_name,Number(String(existing.start_date).slice(0,4)),String(existing.leave_type||'').toUpperCase(),requestNo,lateReturnDays,`Late return: ${lateReturnDays} additional leave day(s)`,request.appSession.userName]);
    return response.json({ok:true,row:saved.rows[0],lateReturnDays});
  }catch(error){return next(error);}
});

app.post("/api/hr/calendar/holiday", requireHrAdmin, async (request,response,next)=>{
  try{
    const d=request.body||{}; const rawBranch=String(d.branch||"All").trim(); const branch=rawBranch.toLowerCase()==="all"?"All":normalizeHrBranch(rawBranch);
    const startDate=isoDate(d.startDate)||isoDate(d.holidayDate); const endDate=isoDate(d.endDate)||startDate;
    const title=String(d.title||"").trim();
    if(!startDate||!endDate||endDate<startDate||!title) return response.status(400).json({ok:false,error:"A valid holiday date range and title are required."});
    const dayType=String(d.dayType||"PUBLIC_HOLIDAY").toUpperCase();
    if(!["PUBLIC_HOLIDAY","BLACKOUT","WORKING_DAY"].includes(dayType)) return response.status(400).json({ok:false,error:"Invalid calendar day type."});
    const rows=[];
    for(const dateObj of dateParts(startDate,endDate)){
      const date=dateObj.toISOString().slice(0,10);
      const saved=await query(`insert into hr_calendar_days(branch,holiday_date,day_type,title,notes,active,created_by,created_at,updated_at) values($1,$2,$3,$4,$5,true,$6,now(),now()) on conflict(branch,holiday_date,day_type) do update set title=excluded.title,notes=excluded.notes,active=true,updated_at=now() returning *`,[branch,date,dayType,title,String(d.notes||"").trim(),request.appSession.userName]);
      rows.push(saved.rows[0]);
    }
    return response.json({ok:true,rows,row:rows[0]});
  }catch(error){return next(error);}
});

app.delete("/api/hr/calendar/holiday/:id", requireHrAdmin, async (request,response,next)=>{
  try{const id=Number(request.params.id); const saved=await query("update hr_calendar_days set active=false,updated_at=now() where id=$1 returning *",[id]); if(!saved.rows[0]) return response.status(404).json({ok:false,error:"Calendar item not found."}); return response.json({ok:true,row:saved.rows[0]});}catch(error){return next(error);}
});

app.post("/api/hr/calendar/weekends", requireHrAdmin, async (request,response,next)=>{
  try{
    const weekdays=Array.isArray(request.body?.weekdays)?request.body.weekdays.map(Number).filter((n)=>n>=0&&n<=6):[];
    const requestedBranch=String(request.body?.branch||"").trim();
    const branch=requestedBranch.toLowerCase()==="all"?"All":hrBranchForRequest(request,requestedBranch);
    try { await query("insert into hr_weekend_rule_overrides(branch,configured,updated_by,updated_at) values($1,true,$2,now()) on conflict(branch) do update set configured=true,updated_by=excluded.updated_by,updated_at=now()",[branch,request.appSession.userName]); } catch (error) { if (error.code !== "42P01") throw error; }
    await query("update hr_weekend_rules set active=false,updated_at=now() where branch=$1",[branch]);
    for(const weekday of weekdays){ await query("insert into hr_weekend_rules(branch,weekday,active,created_by,created_at,updated_at) values($1,$2,true,$3,now(),now()) on conflict(branch,weekday) do update set active=true,updated_at=now()",[branch,weekday,request.appSession.userName]); }
    return response.json({ok:true,branch,weekdays});
  }catch(error){return next(error);}
});

app.get("/api/hr/admin/delegations", requireHrAdmin, async (request,response,next)=>{
  try { const rows=(await query("select * from hr_leave_delegations order by active desc, start_date desc, id desc")).rows; return response.json({ok:true,rows}); }
  catch(error){ return next(error); }
});

app.put("/api/hr/admin/delegations", requireHrAdmin, async (request,response,next)=>{
  try {
    const d=request.body||{}; const delegator=String(d.delegatorUserName||"").trim(), delegate=String(d.delegateUserName||"").trim();
    const start=isoDate(d.startDate), end=isoDate(d.endDate);
    if(!delegator||!delegate||!start||!end||end<start) return response.status(400).json({ok:false,error:"Delegator, delegate and a valid date range are required."});
    if(delegator.toLowerCase()===delegate.toLowerCase()) return response.status(400).json({ok:false,error:"Delegator and delegate must be different employees."});
    const saved=await query(`insert into hr_leave_delegations(delegator_user_name,delegate_user_name,start_date,end_date,active,notes,created_by,created_at,updated_at)
      values($1,$2,$3,$4,true,$5,$6,now(),now()) returning *`,[delegator,delegate,start,end,String(d.notes||"").trim(),request.appSession.userName]);
    return response.status(201).json({ok:true,row:saved.rows[0]});
  } catch(error){ return next(error); }
});

app.delete("/api/hr/admin/delegations/:id", requireHrAdmin, async (request,response,next)=>{
  try { const result=await query("update hr_leave_delegations set active=false,updated_at=now() where id=$1 returning *",[Number(request.params.id)]); if(!result.rows[0]) return response.status(404).json({ok:false,error:"Delegation not found."}); return response.json({ok:true,row:result.rows[0]}); }
  catch(error){ return next(error); }
});

app.get("/api/hr/admin/balances", requireHrAdmin, async (request,response,next)=>{
  try{
    const yearParam=String(request.query.year||new Date().getFullYear()).trim().toLowerCase();
    const year=yearParam==="all"?"all":Number(yearParam);
    const selectedUser=String(request.query.userName||"").trim();
    const employees=(await query(selectedUser
      ? "select e.user_name,e.employee_code,e.full_name,e.department,e.designation,coalesce(u.branch_access,'Kuwait HO') as branch from employees e left join app_users u on lower(u.user_name)=lower(e.user_name) where lower(e.user_name)=lower($1) order by e.full_name"
      : "select e.user_name,e.employee_code,e.full_name,e.department,e.designation,coalesce(u.branch_access,'Kuwait HO') as branch from employees e left join app_users u on lower(u.user_name)=lower(e.user_name) order by e.full_name",
      selectedUser?[selectedUser]:[])).rows;
    const rows=[];
    for(const employee of employees){
      const balances=year==="all" ? await hrAllYearBalances(employee.user_name) : await hrAllBalances(employee.user_name,year);
      rows.push({...employee,balances});
    }
    return response.json({ok:true,year,rows});
  }catch(error){return next(error);}
});

app.get("/api/hr/admin/leave-types", requireHrAdmin, async (request,response,next)=>{
  try{ const rows=(await query("select code,name,annual_entitlement,paid,allow_half_day,allow_hourly,require_attachment,attachment_after_days,allow_during_probation,allow_carry_forward,max_carry_forward,carry_forward_expiry_month,carry_forward_expiry_day,allow_encashment,allow_negative_balance,active from hr_leave_types order by id")).rows; return response.json({ok:true,rows}); }catch(error){return next(error);}
});

app.put("/api/hr/admin/leave-types", requireHrAdmin, async (request,response,next)=>{
  try{ const d=request.body||{}; const code=String(d.code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"_"); const name=String(d.name||"").trim(); if(!code||!name)return response.status(400).json({ok:false,error:"Leave type code and name are required."});
    const enabled=value=>value===true||String(value).toLowerCase()==="true"||String(value)==="1";
    const saved=await query(`insert into hr_leave_types(code,name,annual_entitlement,paid,allow_half_day,allow_hourly,require_attachment,attachment_after_days,allow_during_probation,allow_carry_forward,max_carry_forward,carry_forward_expiry_month,carry_forward_expiry_day,allow_encashment,allow_negative_balance,active,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now()) on conflict(code) do update set name=excluded.name,annual_entitlement=excluded.annual_entitlement,paid=excluded.paid,allow_half_day=excluded.allow_half_day,allow_hourly=excluded.allow_hourly,require_attachment=excluded.require_attachment,attachment_after_days=excluded.attachment_after_days,allow_during_probation=excluded.allow_during_probation,allow_carry_forward=excluded.allow_carry_forward,max_carry_forward=excluded.max_carry_forward,carry_forward_expiry_month=excluded.carry_forward_expiry_month,carry_forward_expiry_day=excluded.carry_forward_expiry_day,allow_encashment=excluded.allow_encashment,allow_negative_balance=excluded.allow_negative_balance,active=excluded.active,updated_at=now() returning *`,[code,name,Number(d.annualEntitlement||0),enabled(d.paid),enabled(d.allowHalfDay),enabled(d.allowHourly),enabled(d.requireAttachment),Number(d.attachmentAfterDays||0),enabled(d.allowDuringProbation),enabled(d.allowCarryForward),Number(d.maxCarryForward||0),d.carryForwardExpiryMonth?Number(d.carryForwardExpiryMonth):null,d.carryForwardExpiryDay?Number(d.carryForwardExpiryDay):null,enabled(d.allowEncashment),enabled(d.allowNegativeBalance),d.active===undefined||d.active===""?true:enabled(d.active)]);
    return response.json({ok:true,row:saved.rows[0]});
  }catch(error){return next(error);}
});

app.get("/api/hr/admin/policies", requireHrAdmin, async (request,response,next)=>{
  try{
    const yearParam=String(request.query.year||"").trim().toLowerCase();
    const year=Number(yearParam||new Date().getFullYear());
    const types=(await query("select code,name,annual_entitlement,paid,allow_half_day,allow_during_probation,allow_carry_forward,max_carry_forward,allow_negative_balance,active from hr_leave_types order by id")).rows;
    const policies=yearParam==="all"
      ? (await query("select * from hr_employee_leave_policies order by year desc,user_name,leave_type_code")).rows
      : (await query("select * from hr_employee_leave_policies where year=$1 order by user_name,leave_type_code",[year])).rows;
    let history=[];
    try {
      history=yearParam==="all"
        ? (await query("select * from hr_employee_leave_policy_history order by year desc,user_name,leave_type_code,saved_at desc")).rows
        : (await query("select * from hr_employee_leave_policy_history where year=$1 order by user_name,leave_type_code,saved_at desc",[year])).rows;
    } catch (historyError) {
      // Keep the policy screen usable during rolling deployments where the
      // application is newer than migration 034. History appears after the
      // migration completes; current policy rows remain available now.
      if (historyError.code !== "42P01") throw historyError;
    }
    let adjustmentAudit=[];
    try {
      adjustmentAudit=yearParam==="all"
        ? (await query("select * from hr_leave_adjustment_audit order by created_at desc,id desc")).rows
        : (await query("select * from hr_leave_adjustment_audit where year=$1 order by created_at desc,id desc",[year])).rows;
    } catch (auditError) {
      if (auditError.code !== "42P01") throw auditError;
    }
    return response.json({ok:true,year:yearParam==="all"?"all":year,types,policies,history,adjustmentAudit});
  }catch(error){return next(error);}
});

app.put("/api/hr/admin/adjustment-audit/:id", requireHrAdmin, async (request,response,next)=>{
  try {
    const id=Number(request.params.id);
    if(!Number.isInteger(id)||id<=0) return response.status(400).json({ok:false,error:"Invalid adjustment audit entry."});
    const data=request.body||{};
    const reason=String(data.reason||"").trim();
    const newAdjustment=Number(data.newAdjustment);
    if(!Number.isFinite(newAdjustment)) return response.status(400).json({ok:false,error:"A valid new adjustment is required."});
    const result=await withDatabaseTransaction(async client=>{
      const audit=(await client.query("select * from hr_leave_adjustment_audit where id=$1 for update",[id])).rows[0];
      if(!audit) return null;
      const policy=(await client.query("select id,adjustment from hr_employee_leave_policies where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 order by updated_at desc nulls last,id desc limit 1 for update",[audit.user_name,audit.leave_type_code,audit.year])).rows[0];
      const updated=(await client.query("update hr_leave_adjustment_audit set new_adjustment=$1,reason=$2 where id=$3 returning *",[newAdjustment,reason,id])).rows[0];
      await optionalTransactionQuery(client,"update hr_employee_leave_policy_history set adjustment=$1,notes=$2 where lower(user_name)=lower($3) and leave_type_code=$4 and year=$5 and saved_at=$6",[newAdjustment,reason,audit.user_name,audit.leave_type_code,audit.year,audit.created_at]);
      const latest=(await client.query("select new_adjustment from hr_leave_adjustment_audit where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 order by created_at desc,id desc limit 1",[audit.user_name,audit.leave_type_code,audit.year])).rows[0];
      const target=Number(latest?.new_adjustment||0);
      if(policy) await client.query("update hr_employee_leave_policies set adjustment=$1,updated_at=now() where id=$2",[target,policy.id]);
      return {audit:updated,oldPolicyAdjustment:Number(policy?.adjustment||0),newPolicyAdjustment:target};
    });
    if(!result) return response.status(404).json({ok:false,error:"Adjustment audit entry not found."});
    const delta=result.newPolicyAdjustment-result.oldPolicyAdjustment;
    if(delta!==0){const balance=await hrBalanceForUser(result.audit.user_name,result.audit.year,result.audit.leave_type_code);await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'MANUAL_ADJUSTMENT',$4,$5,$6,$7,$8)",[result.audit.user_name,result.audit.year,result.audit.leave_type_code,`AUDIT-EDIT-${id}`,delta,balance.available,reason||"Adjustment audit corrected",request.appSession.userName]);}
    return response.json({ok:true,row:result.audit,delta});
  } catch(error) { return next(error); }
});

app.delete("/api/hr/admin/adjustment-audit/:id", requireHrAdmin, async (request,response,next)=>{
  try {
    const id=Number(request.params.id);
    if(!Number.isInteger(id)||id<=0) return response.status(400).json({ok:false,error:"Invalid adjustment audit entry."});
    const deleted=await withDatabaseTransaction(async client=>{
      const audit=(await client.query("select * from hr_leave_adjustment_audit where id=$1 for update",[id])).rows[0];
      if(!audit) return null;
      const policy=(await client.query("select id,adjustment from hr_employee_leave_policies where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 order by updated_at desc nulls last,id desc limit 1 for update",[audit.user_name,audit.leave_type_code,audit.year])).rows[0];
      await client.query("delete from hr_leave_adjustment_audit where id=$1",[id]);
      await optionalTransactionQuery(client,`delete from hr_employee_leave_policy_history where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 and saved_at=$4 and adjustment=$5`,[audit.user_name,audit.leave_type_code,audit.year,audit.created_at,audit.new_adjustment]);
      const latest=(await client.query("select new_adjustment from hr_leave_adjustment_audit where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 order by created_at desc,id desc limit 1",[audit.user_name,audit.leave_type_code,audit.year])).rows[0];
      const target=Number(latest?.new_adjustment||0);
      if(policy) await client.query("update hr_employee_leave_policies set adjustment=$1,updated_at=now() where id=$2",[target,policy.id]);
      return {audit,oldPolicyAdjustment:Number(policy?.adjustment||0),newPolicyAdjustment:target};
    });
    if(!deleted) return response.status(404).json({ok:false,error:"Adjustment audit entry not found."});
    const delta=deleted.newPolicyAdjustment-deleted.oldPolicyAdjustment;
    if(delta!==0){const balance=await hrBalanceForUser(deleted.audit.user_name,deleted.audit.year,deleted.audit.leave_type_code);await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'MANUAL_ADJUSTMENT',$4,$5,$6,$7,$8)",[deleted.audit.user_name,deleted.audit.year,deleted.audit.leave_type_code,`AUDIT-DELETE-${id}`,delta,balance.available,"Adjustment audit deleted/corrected",request.appSession.userName]);}
    return response.json({ok:true,row:deleted.audit,delta});
  } catch(error) { return next(error); }
});

app.put("/api/hr/admin/policies", requireHrAdmin, async (request,response,next)=>{
  try{
    const data=request.body||{}; const year=Number(data.year||new Date().getFullYear());
    const requestedUserName=String(data.userName||"").trim(); const code=String(data.leaveTypeCode||"").trim().toUpperCase();
    const adjustmentStart=isoDate(data.adjustmentStartDate), adjustmentEnd=isoDate(data.adjustmentEndDate);
    if((adjustmentStart&&!adjustmentEnd)||(!adjustmentStart&&adjustmentEnd)|| (adjustmentStart&&adjustmentEnd&&adjustmentEnd<adjustmentStart)) return response.status(400).json({ok:false,error:"A valid adjustment date range is required."});
    if(!requestedUserName||!code) return response.status(400).json({ok:false,error:"Employee and leave type are required."});
    const employeeIdentity=(await query("select user_name from employees where lower(user_name)=lower($1) order by case when user_name=$1 then 0 else 1 end, id limit 1",[requestedUserName])).rows[0];
    const userName=String(employeeIdentity?.user_name||requestedUserName).trim();
    const recordId=Number(data.id||0);
    const existing=(await query(recordId
      ? "select adjustment from hr_employee_leave_policies where id=$1 limit 1"
      : "select adjustment from hr_employee_leave_policies where lower(user_name)=lower($1) and leave_type_code=$2 and year=$3 limit 1",
      recordId?[recordId]:[userName,code,year])).rows[0];
    const previousAdjustment=Number(existing?.adjustment||0), nextAdjustment=Number(data.adjustment||0);
    const previousUsedDays=Number(data.previousUsedDays||0);
    if(previousUsedDays<0) return response.status(400).json({ok:false,error:"Previous used leave cannot be negative."});
    const saved=recordId
      ? await query(`update hr_employee_leave_policies set user_name=$1,leave_type_code=$2,year=$3,entitlement=$4,carry_forward=$5,adjustment=$6,previous_used_days=$7,notes=$8,adjustment_start_date=$9,adjustment_end_date=$10,updated_at=now() where id=$11 returning *`,
        [userName,code,year,Number(data.entitlement||0),Number(data.carryForward||0),Number(data.adjustment||0),previousUsedDays,String(data.notes||"").trim(),adjustmentStart||null,adjustmentEnd||null,recordId])
      : await query(`insert into hr_employee_leave_policies(user_name,leave_type_code,year,entitlement,carry_forward,adjustment,previous_used_days,notes,adjustment_start_date,adjustment_end_date,created_by,created_at,updated_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) on conflict(user_name,leave_type_code,year) do update set entitlement=excluded.entitlement,carry_forward=excluded.carry_forward,adjustment=excluded.adjustment,previous_used_days=excluded.previous_used_days,notes=excluded.notes,adjustment_start_date=excluded.adjustment_start_date,adjustment_end_date=excluded.adjustment_end_date,updated_at=now() returning *`,
        [userName,code,year,Number(data.entitlement||0),Number(data.carryForward||0),Number(data.adjustment||0),previousUsedDays,String(data.notes||"").trim(),adjustmentStart||null,adjustmentEnd||null,request.appSession.userName]);
    try {
      await query(`insert into hr_employee_leave_policy_history
        (policy_id,user_name,leave_type_code,year,entitlement,carry_forward,adjustment,previous_used_days,adjustment_start_date,adjustment_end_date,notes,saved_by,saved_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())`,
        [saved.rows[0].id,userName,code,year,Number(data.entitlement||0),Number(data.carryForward||0),Number(data.adjustment||0),previousUsedDays,adjustmentStart||null,adjustmentEnd||null,String(data.notes||"").trim(),request.appSession.userName]);
    } catch (historyError) {
      if (historyError.code !== "42P01") throw historyError;
    }
    if(previousAdjustment!==nextAdjustment) await query(`insert into hr_leave_adjustment_audit(user_name,leave_type_code,year,previous_adjustment,new_adjustment,reason,adjusted_by)
      values($1,$2,$3,$4,$5,$6,$7)`,[userName,code,year,previousAdjustment,nextAdjustment,String(data.notes||"Manual HR adjustment").trim(),request.appSession.userName]);
    const balance=await hrBalanceForUser(userName,year,code);
    if(previousAdjustment!==nextAdjustment) await query("insert into hr_leave_ledger(user_name,year,leave_type_code,transaction_type,reference_no,days,balance_after,reason,created_by) values($1,$2,$3,'MANUAL_ADJUSTMENT','',$4,$5,$6,$7)",[userName,year,code,nextAdjustment-previousAdjustment,balance.available,String(data.notes||"Manual HR adjustment").trim(),request.appSession.userName]);
    return response.json({ok:true,row:saved.rows[0]});
  }catch(error){return next(error);}
});

app.delete("/api/hr/admin/policies/:id", requireHrAdmin, async (request,response,next)=>{
  try {
    const id=Number(request.params.id);
    const saved=await query("delete from hr_employee_leave_policies where id=$1 returning *",[id]);
    if(!saved.rows[0]) return response.status(404).json({ok:false,error:"Employee leave policy not found."});
    return response.json({ok:true,row:saved.rows[0]});
  } catch(error){ return next(error); }
});

app.delete("/api/hr/admin/leave-types/:code", requireHrAdmin, async (request,response,next)=>{
  try {
    const code=String(request.params.code||"").trim().toUpperCase();
    const saved=await query("update hr_leave_types set active=false,updated_at=now() where code=$1 returning *",[code]);
    if(!saved.rows[0]) return response.status(404).json({ok:false,error:"Leave type not found."});
    return response.json({ok:true,row:saved.rows[0]});
  } catch(error){ return next(error); }
});

app.delete("/api/hr/leave-requests/:requestNo", requireHrAdmin, async (request,response,next)=>{
  try {
    const requestNo=String(request.params.requestNo||"").trim();
    const existing=(await query("select * from leave_requests where request_no=$1 limit 1",[requestNo])).rows[0];
    if(!existing) return response.status(404).json({ok:false,error:"Leave request not found."});
    if(String(existing.status||"").toLowerCase()!=="cancelled") return response.status(400).json({ok:false,error:"Only cancelled leave requests can be deleted."});
    const deleted=await query("delete from leave_requests where request_no=$1 returning request_no",[requestNo]);
    return response.json({ok:true,row:deleted.rows[0]});
  } catch(error){ return next(error); }
});

app.get("/api/hr/admin/summary", requireHrAdmin, async (request,response,next)=>{
  try{
    const year=Number(request.query.year||new Date().getFullYear());
    const employees=(await query("select e.user_name,e.employee_code,e.full_name,e.department,e.designation,e.join_date,e.employment_status,e.reporting_manager,coalesce(u.branch_access,'Kuwait HO') as branch from employees e left join app_users u on lower(u.user_name)=lower(e.user_name) order by e.full_name,e.user_name")).rows;
    const pending=(await query("select count(*)::int as count from leave_requests where status='Pending'")).rows[0]?.count||0;
    const approved=(await query("select count(*)::int as count from leave_requests where status='Approved' and extract(year from start_date)=$1",[year])).rows[0]?.count||0;
    return response.json({ok:true,year,employees,pending,approved});
  }catch(error){return next(error);}
});

// Server-side enforcement for blocked customers - this backs up the same check already done in
// the frontend (app-runtime.js) before it even submits. That client-side check is only a UX
// convenience and can be bypassed by anyone calling the API directly, so shipment creation for a
// blocked customer must also be rejected here to actually be enforced.
// The branch a customer-block check should be evaluated against: the actual shipment's own branch
// (request.body.branch) - NOT the logged-in staff member's own session branch. Using the
// requester's account branch broke bulk operations like "Update Manifest Status", which saves many
// shipments (across possibly different branches) under one admin's session - that admin's own
// branch has nothing to do with which branch each individual shipment actually belongs to.
function requestBlockCheckBranch(request) {
  return String(request.body?.branch || "").trim();
}

async function findBlockedCustomer(customerName, branch) {
  const lookup = String(customerName || "").trim();
  if (!lookup) return null;
  const result = await query(
    "select code, name, status, blocked_branches from customers where lower(name) = lower($1) or lower(code) = lower($1) limit 1",
    [lookup]
  );
  const row = result.rows[0];
  if (!row) return null;
  // Status is authoritative. Ignore stale blocked_branches left by older unblock updates.
  if (String(row.status || "").trim().toLowerCase() !== "blocked") return null;
  const blockedBranches = String(row.blocked_branches || "").split(",").map((item) => item.trim()).filter(Boolean);
  // Per-branch check: a block on one branch must not affect shipments booked under another
  // branch. Falls back to the plain status flag only for legacy records blocked before per-branch
  // tracking existed (status = Blocked but blocked_branches empty), so those stay blocked
  // everywhere, same as before this fix.
  if (blockedBranches.length) {
    if (blockedBranches.includes("Both")) return row;
    const normalizedBranch = String(branch || "").trim();
    if (normalizedBranch && blockedBranches.some((item) => item.toLowerCase() === normalizedBranch.toLowerCase())) return row;
    return null;
  }
  if (String(row.status || "").trim().toLowerCase() === "blocked") return row;
  return null;
}

async function withDatabaseTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function optionalTransactionQuery(client, text, params = []) {
  const savepoint = `hr_optional_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    const result = await client.query(text, params);
    await client.query(`release savepoint ${savepoint}`);
    return result;
  } catch (error) {
    try { await client.query(`rollback to savepoint ${savepoint}`); } catch {}
    try { await client.query(`release savepoint ${savepoint}`); } catch {}
    if (error.code === "42P01" || error.code === "42703") return null;
    throw error;
  }
}

function normalizeAirwayBillNo(value) {
  return String(value || "").trim();
}

async function synchronizeAirwayBillGroup(client, airwayBillNo, options = {}) {
  const normalizedAwb = normalizeAirwayBillNo(airwayBillNo);
  if (!normalizedAwb) return [];
  const syncStatus = options.syncStatus === true;
  const syncPodStatus = options.syncPodStatus === true;
  const nextStatus = String(options.status || "").trim();
  const nextPodStatus = String(options.podStatus || "").trim();
  if (syncStatus && !nextStatus) return [];
  if (syncPodStatus && !nextPodStatus) return [];
  const updatedBy = String(options.updatedBy || "system").trim();
  const updatedAt = String(options.updatedAt || new Date().toISOString()).trim();
  const note = String(options.notes || `AWB group synchronization for ${normalizedAwb}`).trim();
  const found = await client.query(
    "select * from shipments where lower(trim(airway_bill_no)) = lower(trim($1)) order by job_no for update",
    [normalizedAwb]
  );
  const updated = [];
  for (const current of found.rows) {
    const currentStatus = String(current.status || "").trim();
    const currentPodStatus = String(current.pod_status || "").trim();
    const targetStatus = syncStatus ? nextStatus : currentStatus;
    const targetPodStatus = syncPodStatus ? nextPodStatus : currentPodStatus;
    const statusChanged = currentStatus.toLowerCase() !== targetStatus.toLowerCase();
    const podChanged = currentPodStatus.toLowerCase() !== targetPodStatus.toLowerCase();
    let row = current;
    if (statusChanged || podChanged) {
      const saved = await client.query(
        "update shipments set status = $1, pod_status = $2, updated_at = now() where job_no = $3 returning *",
        [targetStatus, targetPodStatus, current.job_no]
      );
      row = saved.rows[0] || current;
      await client.query(
        "insert into shipment_status_history (job_no, status, pod_status, invoice_status, notes, updated_by, updated_at) values ($1, $2, $3, $4, $5, $6, $7)",
        [row.job_no, targetStatus, targetPodStatus, row.invoice_status || "", note, updatedBy, updatedAt]
      );
    }
    updated.push(row);
  }
  return updated;
}

async function latestAirwayBillState(client, airwayBillNo, excludeJobNo = "") {
  const normalizedAwb = normalizeAirwayBillNo(airwayBillNo);
  if (!normalizedAwb) return null;
  const result = await client.query(
    `with awb_events as (
       select h.status, h.pod_status, h.updated_at, 1 as source_priority, h.id as source_id
       from shipment_status_history h
       join shipments s on lower(trim(s.job_no)) = lower(trim(h.job_no))
       where lower(trim(s.airway_bill_no)) = lower(trim($1))
         and ($2 = '' or s.job_no <> $2)
       union all
       select s.status, s.pod_status, s.updated_at, 0 as source_priority, s.id as source_id
       from shipments s
       where lower(trim(s.airway_bill_no)) = lower(trim($1))
         and ($2 = '' or s.job_no <> $2)
     )
     select status, pod_status
     from awb_events
     order by updated_at desc, source_priority desc, source_id desc
     limit 1`,
    [normalizedAwb, String(excludeJobNo || "")]
  );
  return result.rows[0] || null;
}

async function synchronizeShipmentAirwayBill(row, options = {}) {
  const airwayBillNo = normalizeAirwayBillNo(row?.airway_bill_no || row?.airwayBillNo);
  if (!airwayBillNo) return [row];
  return withDatabaseTransaction(async (client) => {
    let syncStatus = options.syncStatus === true;
    let syncPodStatus = options.syncPodStatus === true;
    let status = String(options.status || row.status || "").trim();
    let podStatus = String(options.podStatus || row.pod_status || "").trim();

    if (options.joinExistingGroup === true && !options.statusChanged && !options.podStatusChanged) {
      const latest = await latestAirwayBillState(client, airwayBillNo, row.job_no);
      if (latest) {
        syncStatus = true;
        syncPodStatus = true;
        status = String(latest.status || "").trim();
        podStatus = String(latest.pod_status || "").trim();
      }
    }

    return synchronizeAirwayBillGroup(client, airwayBillNo, {
      syncStatus,
      syncPodStatus,
      status,
      podStatus,
      updatedBy: options.updatedBy,
      updatedAt: options.updatedAt,
      notes: options.notes
    });
  });
}

app.post("/api/shipments/status-by-awb", requireAppAuth, async (request, response, next) => {
  try {
    const airwayBillNo = String(request.body?.airwayBillNo ?? request.body?.airway_bill_no ?? "").trim();
    const newStatus = String(request.body?.status || "").trim();
    const updatedBy = String(request.body?.updatedBy || request.appSession?.userName || "system").trim();
    const updatedAt = String(request.body?.updatedAt || new Date().toISOString()).trim();
    const notes = String(request.body?.notes || "").trim();
    if (!airwayBillNo) return response.status(400).json({ ok: false, error: "An Airway Bill number is required." });
    if (!newStatus) return response.status(400).json({ ok: false, error: "A shipment status is required." });
    const rows = await withDatabaseTransaction(async (client) => {
      const found = await client.query("select * from shipments where lower(trim(airway_bill_no)) = lower(trim($1)) order by job_no for update", [airwayBillNo]);
      if (!found.rows.length) {
        const error = new Error("No shipments were found for this Airway Bill number.");
        error.status = 404;
        throw error;
      }
      const updated = [];
      for (const current of found.rows) {
        const oldStatus = String(current.status || "").trim();
        if (oldStatus.toLowerCase() !== newStatus.toLowerCase()) {
          const saved = await client.query("update shipments set status = $1, updated_at = now() where job_no = $2 returning *", [newStatus, current.job_no]);
          const row = saved.rows[0];
          updated.push(row);
          await client.query(
            "insert into shipment_status_history (job_no, status, pod_status, invoice_status, notes, updated_by, updated_at) values ($1, $2, $3, $4, $5, $6, $7)",
            [row.job_no, newStatus, row.pod_status || "", row.invoice_status || "", notes ? `${notes} | AWB ${airwayBillNo}` : `Updated by AWB ${airwayBillNo}`, updatedBy, updatedAt]
          );
        } else {
          updated.push(current);
        }
      }
      return updated;
    });
    response.json({ ok: true, airwayBillNo, rows });
  } catch (error) {
    if (isDatabaseSetupError(error)) return response.json({ ok: true, mode: "demo", airwayBillNo: request.body?.airwayBillNo || "", rows: [] });
    return next(error);
  }
});
app.post("/api/shipments", requireAppAuth, async (request, response, next) => {
  try {
    const customerName = request.body?.customer || request.body?.customerName || "";
    const blocked = await findBlockedCustomer(customerName, requestBlockCheckBranch(request));
    if (blocked) {
      const error = new Error(`${blocked.name} (${blocked.code}) is blocked for overdue account. Ask admin to approve an unblock request before creating shipments.`);
      error.status = 409;
      throw error;
    }

    const row = await insertRow(resources.shipments, request.body || {});
    const relatedRows = await synchronizeShipmentAirwayBill(row, {
      joinExistingGroup: true,
      updatedBy: request.appSession?.userName || "system",
      notes: `AWB group synchronization after shipment creation for ${row.airway_bill_no || ""}`
    });
    const savedRow = relatedRows.find((item) => String(item.job_no) === String(row.job_no)) || row;
    response.status(201).json({ ok: true, row: savedRow, relatedRows });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.status(201).json({ ok: true, mode: "demo", row: request.body || {} });
    }

    return next(error);
  }
});

// Maintenance is an ERP module: these routes use the ERP database and ERP-only HMAC handoff.
// They must be mounted before the generic ERP resource handlers below.
app.use("/api/maintenance/health", maintenanceHealthRouter);
app.use("/api/maintenance/auth", maintenanceAuthRouter);
app.use("/api/maintenance/expenses", maintenanceExpensesRouter);
app.use("/api/maintenance/users", maintenanceUsersRouter);
app.use("/api/maintenance/vehicles", maintenanceVehiclesRouter);

app.get("/api/:resource", requireAppAuth, async (request, response, next) => {
  const resourceName = request.params.resource;
  const config = resources[resourceName];

  if (!config) {
    return next();
  }

  try {
    const result = await getRows(resourceName, config);
    if (resourceName === "documents") {
      result.rows = result.rows.filter((row) => !EMPLOYEE_DOCUMENT_TYPE_NAMES.has(String(row.type || "")));
    }
    response.json(result);
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json(demoResponse(resourceName));
    }

    return next(error);
  }
});

app.post("/api/:resource", requireAppAuth, async (request, response, next) => {
  const resourceName = request.params.resource;
  const config = resources[resourceName];

  if (!config) {
    return next();
  }

  try {
    if (resourceName === "consolidations" && (request.body?.jobNumbers !== undefined || request.body?.job_numbers !== undefined)) {
      const sanitized = await sanitizeConsolidationJobNumbers(request.body.jobNumbers ?? request.body.job_numbers);
      if (request.body.jobNumbers !== undefined) request.body.jobNumbers = sanitized;
      if (request.body.job_numbers !== undefined) request.body.job_numbers = sanitized;
    }

    const row = await insertRow(config, request.body || {});
    response.status(201).json({
      ok: true,
      row
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.status(201).json({
        ok: true,
        mode: "demo",
        row: request.body || {}
      });
    }

    return next(error);
  }
});

app.put("/api/shipments/:id", requireAppAuth, async (request, response, next) => {
  try {
    const shipmentId = decodeURIComponent(request.params.id);
    // NOTE: no customer-blocked check here on purpose. The block only applies to creating a NEW
    // shipment (see POST /api/shipments above) - updating an existing shipment (status changes,
    // manifest bulk updates, edits, POD entry, etc.) must always be allowed regardless of the
    // customer's block status, since the shipment already legitimately exists.

    // A shipment becomes read-only for non-admin users only after both conditions are met:
    // status is exactly Delivered and the POD has been uploaded. Until then, delivery staff
    // must still be able to complete the POD workflow. Admins can always edit.
    const isAdmin = String(request.appSession?.role || "").toLowerCase() === "admin";
    if (!isAdmin) {
      const current = await query("select status, pod_status from shipments where job_no = $1", [shipmentId]);
      const currentRow = current.rows[0];
      const isClosedJob = currentRow
        && String(currentRow.status || "").trim().toLowerCase() === "delivered"
        && String(currentRow.pod_status || "").trim().toLowerCase() === "uploaded";
      if (isClosedJob) {
        const error = new Error("This shipment is Delivered with POD uploaded and is read-only. Only an admin can edit it.");
        error.status = 403;
        throw error;
      }
    }

    const currentResult = await query("select * from shipments where job_no = $1 limit 1", [shipmentId]);
    const currentBeforeUpdate = currentResult.rows[0];
    const row = await updateRow(resources.shipments, shipmentId, request.body || {});
    const requestedStatus = request.body?.status ?? request.body?.status;
    const requestedPodStatus = request.body?.podStatus ?? request.body?.pod_status;
    const statusChanged = requestedStatus !== undefined
      && String(requestedStatus || "").trim().toLowerCase() !== String(currentBeforeUpdate?.status || "").trim().toLowerCase();
    const podStatusChanged = requestedPodStatus !== undefined
      && String(requestedPodStatus || "").trim().toLowerCase() !== String(currentBeforeUpdate?.pod_status || "").trim().toLowerCase();
    const airwayBillChanged = normalizeAirwayBillNo(row.airway_bill_no).toLowerCase() !== normalizeAirwayBillNo(currentBeforeUpdate?.airway_bill_no).toLowerCase();
    const relatedRows = await synchronizeShipmentAirwayBill(row, {
      joinExistingGroup: airwayBillChanged,
      statusChanged,
      podStatusChanged,
      syncStatus: statusChanged,
      syncPodStatus: podStatusChanged,
      status: row.status,
      podStatus: row.pod_status,
      updatedBy: request.appSession?.userName || row.created_by || "system",
      notes: `AWB group synchronization after shipment update for ${row.airway_bill_no || ""}`
    });
    const savedRow = relatedRows.find((item) => String(item.job_no) === String(row.job_no)) || row;
    response.json({ ok: true, row: savedRow, relatedRows });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({ ok: true, mode: "demo", row: request.body || {} });
    }

    return next(error);
  }
});

app.put("/api/:resource/:id", requireAppAuth, async (request, response, next) => {
  const resourceName = request.params.resource;
  const config = resources[resourceName];

  if (!config) {
    return next();
  }

  try {
    const recordId = decodeURIComponent(request.params.id);
    if (resourceName === "consolidations" && (request.body?.jobNumbers !== undefined || request.body?.job_numbers !== undefined)) {
      const sanitized = await sanitizeConsolidationJobNumbers(request.body.jobNumbers ?? request.body.job_numbers, recordId);
      if (request.body.jobNumbers !== undefined) request.body.jobNumbers = sanitized;
      if (request.body.job_numbers !== undefined) request.body.job_numbers = sanitized;
    }

    const row = await updateRow(config, recordId, request.body || {});
    response.json({
      ok: true,
      row
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({
        ok: true,
        mode: "demo",
        row: request.body || {}
      });
    }

    return next(error);
  }
});

app.delete("/api/audit", requireAppAuth, async (_request, response, next) => {
  try {
    const result = await query("delete from audit_log returning id");
    response.json({
      ok: true,
      deleted: result.rowCount
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({
        ok: true,
        mode: "demo",
        deleted: 0
      });
    }

    return next(error);
  }
});

app.delete("/api/:resource/:id", requireAppAuth, async (request, response, next) => {
  const resourceName = request.params.resource;
  const config = resources[resourceName];

  if (!config) {
    return next();
  }

  try {
    const row = await deleteRow(config, decodeURIComponent(request.params.id));
    response.json({
      ok: true,
      row
    });
  } catch (error) {
    if (isDatabaseSetupError(error)) {
      return response.json({
        ok: true,
        mode: "demo",
        row: {}
      });
    }

    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(error.status || 500).json({
    ok: false,
    error: error.message || "Unexpected server error."
  });
});

function start() {
  // Bind before migrations. Render's port scanner has a short startup window and will terminate a
  // process that does not listen while a slow or locked database migration is being applied.
  const server = app.listen(port, () => {
    console.log(`Apollo Freight Solutions Portal server running on port ${port}`);
  });
  server.on("error", (error) => {
    runtimeStatus.startupError = error.message;
    console.error(`Could not bind server to port ${port}: ${error.message}`);
  });

  startupReadyPromise = (async () => {
    if (autoMigrate) {
      try {
        await runMigrations();
        runtimeStatus.migration = "applied";
        runtimeStatus.startupError = "";
      } catch (error) {
        runtimeStatus.migration = "skipped";
        runtimeStatus.startupError = error.message;
        console.warn(`Database migration skipped: ${error.message}`);
      }
    }
    // Resolve the stable shared secret after migrations. Login requests wait for this promise,
    // preventing token signing races while still allowing Render to detect the open port.
    await ensurePortalSecret();
    startupReady = true;
  })().catch((error) => {
    runtimeStatus.startupError = error.message;
    console.error(`Startup initialization failed: ${error.message}`);
    startupReady = true;
  });
}
start();

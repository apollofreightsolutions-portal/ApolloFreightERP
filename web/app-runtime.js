const API_URL = (window.APOLLO_API_URL || window.location.origin || "").replace(/\/$/, "");
const STORAGE_KEY = "apollofreighterp-web-state-v3";
const SESSION_KEY = "apollofreighterp-session";
const MAINTENANCE_PORTAL_URL = "/maintenance/";

const customerModules = [
  ["Customer Dashboard", "Shipment requests, tracking updates, and notifications"],
  ["Customer New Shipment", "Submit shipment requests for company approval"],
  ["Customer Shipments", "Shipment request history and company shipments"],
  ["Customer Tracking", "Track your shipment status"],
  ["Customer Profile", "Profile, status, and password"],
  ["Customer Notifications", "Portal messages and activity"]
];

const hrModules = [
  ["HR Dashboard", "Your profile summary, leave balance, and latest announcements"],
  ["My Profile", "Your employee profile details"],
  ["Employee Directory", "Browse colleagues by department"],
  ["My Leave", "Apply for leave and track your requests"],
  ["Leave Balance", "View annual entitlement, used, pending, and available leave"],
  ["Leave Calendar", "View weekends and HR public holidays"],
  ["My Payslips", "View and download your payslips"],
  ["Announcements", "Company announcements"]
];

const hrAdminModules = [
  ["Manage Employees", "Create and update employee profiles"],
  ["Leave Approvals", "Review and approve or reject leave requests"],
  ["HR Calendar & Rules", "Manage weekends, public holidays, and blackout dates"],
  ["HR Leave Balances", "Review leave balance rules and employee leave usage"],
  ["HR Leave Policies", "Configure leave entitlement and employee-specific adjustments"],
  ["Manage Payslips", "Issue payslips to employees"],
  ["Post Announcement", "Publish a company announcement"]
];

const crmModules = [
  ["CRM Dashboard", "Accounts, pipeline, follow-ups, and relationship activity"],
  ["Accounts", "Company-owned customer and prospect accounts"],
  ["Contacts", "Decision makers and account contacts"],
  ["Opportunities", "Sales pipeline, lanes, value, and next steps"],
  ["Sales Visits", "Client visit log, outcomes, and follow-ups"],
  ["Meeting Minutes", "Structured meeting records, decisions, and action items"],
  ["Follow-ups", "Tasks and next actions"],
  ["Activity Timeline", "Auditable CRM activity history"],
  ["CRM Reports", "Pipeline and sales activity reporting"]
];
const crmManagerModules = [["Team & Assignments", "Account ownership and staff handover controls"]];
const crmAdminModules = [["CRM Security", "CRM access, visibility, export, archive, and admin permissions"]];

const modules = [
  ["Dashboard", "Live operational summary for land freight consolidation"],
  ["Shipment / Airway", "Create, track, duplicate, and close cargo shipments and airway bills"],
  ["Manifest", "Build trips, manifests, and loading lists"],
  ["Customers", "Customer master data and account controls"],
  ["Suppliers / Transporters", "Supplier and transporter lane master"],
  ["Tariffs / Rate Master", "Customer, lane, service, vehicle, and surcharge rates"],
  ["Documents", "Document tags, shipment attachments, and missing file checks"],
  ["Billing / Invoices", "Invoice shipments, monitor unbilled jobs, and check margins"],
  ["Quotation", "Create customer quotations and convert them into shipments"],
  ["Customer Requests", "Review, approve, or reject shipment requests submitted by customers"],
  ["POD / Delivery", "Delivery status, POD uploads, disputes, and pending lists"],
  ["Shipment Status", "Dedicated shipment status updates and history controls"],
  ["Reports", "Operational, billing, POD, and margin reports"],
  ["User Management / Settings", "Users, permissions, branches, and company settings"],
  ["Customer Portal Access", "Create and manage customer login accounts for the customer portal"],
  ["Audit Log", "Entry create and update history"]
];

const state = loadState();
let announcementReadStateReady = false;
let activeModule = "Dashboard";
let editing = null;
let dialogState = null;
let skipNextDialogCloseReset = false;
let lastPendingNotificationCount = 0;
let activeDropdownMenu = null;
let customerPortalData = null;
let sharedShipmentRefreshTimer = null;
let sharedShipmentRefreshInProgress = false;
let sharedShipmentRefreshEventsBound = false;
let liveShipmentDataReady = false;

const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const moduleNav = document.querySelector("#moduleNav");
const portalAccessPanel = document.querySelector("#portalAccessPanel");
const pageEyebrow = document.querySelector("#pageEyebrow");
const pageTitle = document.querySelector("#pageTitle");
const pageSubtitle = document.querySelector("#pageSubtitle");
const userContextText = document.querySelector("#userContextText");
const moduleContent = document.querySelector("#moduleContent");
const apiBanner = document.querySelector("#apiBanner");
const globalSearch = document.querySelector("#globalSearch");
const erpAnnouncementsDropdown = document.querySelector("#erpAnnouncementsDropdown");
const erpAnnouncementsList = document.querySelector("#erpAnnouncementsList");
const fromDate = document.querySelector("#fromDate");
const toDate = document.querySelector("#toDate");
const applyFilters = document.querySelector("#applyFilters");
const dateFilterStatusText = document.querySelector("#dateFilterStatusText");
const resetFilters = document.querySelector("#resetFilters");
const branchFilterPanel = document.querySelector("#branchFilterPanel");
const newShipmentButton = document.querySelector("#newShipmentButton");
const changePasswordButton = document.querySelector("#changePasswordButton");
const logoutButton = document.querySelector("#logoutButton");
const resetEmail = document.querySelector("#resetEmail");
const resetPasswordButton = document.querySelector("#resetPasswordButton");
const resetMessage = document.querySelector("#resetMessage");
const recordDialog = document.querySelector("#recordDialog");
const dialogType = document.querySelector("#dialogType");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogBody = document.querySelector("#dialogBody");
const dialogSecondary = document.querySelector("#dialogSecondary");
const dialogSave = document.querySelector("#dialogSave");
const dialogHeaderSave = document.querySelector("#dialogHeaderSave");
const dialogHeaderVerified = document.querySelector("#dialogHeaderVerified");
const dialogMinimize = document.querySelector("#recordDialogMinimize");
const dialogMaximize = document.querySelector("#recordDialogMaximize");
const dialogClose = document.querySelector("#recordDialogClose");
const toastStack = document.querySelector("#toastStack");
const CANONICAL_BRANCHES = ["Kuwait HO", "Dubai", "Both"];

function currentSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      parsed.branchViewScope = normalizeBranchViewScope(parsed.branchViewScope || parsed.branch_view_scope || parsed.viewScope || "Assigned Branch Only");
      return parsed;
    }
  } catch {}

  return {
      userName: raw,
      role: raw === "admin" ? "Admin" : "Operations",
      branchAccess: raw === "admin" ? "Both" : "Kuwait HO",
      branchViewScope: raw === "admin" ? "All Branches" : "Assigned Branch Only"
  };
}

function rememberSession(sessionOrUserName) {
  const session =
    typeof sessionOrUserName === "object" && sessionOrUserName
      ? sessionOrUserName
      : {
          userName: sessionOrUserName,
          role: sessionOrUserName === "admin" ? "Admin" : "Operations",
          branchAccess: sessionOrUserName === "admin" ? "Both" : "Kuwait HO"
        };

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      userName: session.userName,
      customerUserId: session.customerUserId || "",
      customerCode: session.customerCode || "",
      customerName: session.customerName || "",
      email: session.email || "",
      token: session.token || "",
      portal: session.portal || "company",
      role: session.role || "Operations",
      branchAccess: session.branchAccess || "Kuwait HO",
      branchViewScope: normalizeBranchViewScope(
        session.branchViewScope ||
          session.branch_view_scope ||
          session.viewScope ||
          (String(session.role || "").toLowerCase() === "admin" ? "All Branches" : "Assigned Branch Only")
      ),
      sectionAccess: normalizeSectionAccess(session.sectionAccess || "All"),
      canViewAllEntry: Boolean(session.canViewAllEntry || (session.role || "").toLowerCase() === "admin"),
      canViewOnlySelfEntry: Boolean(session.canViewOnlySelfEntry),
      canEditAllEntry: Boolean(session.canEditAllEntry || (session.role || "").toLowerCase() === "admin"),
      canViewUpdatedHistory: Boolean(session.canViewUpdatedHistory),
      canBillingSalesEntry: session.canBillingSalesEntry === undefined ? true : isChecked(session.canBillingSalesEntry),
      canBillingCostEntry: session.canBillingCostEntry === undefined ? true : isChecked(session.canBillingCostEntry),
      // isHrAdmin is read continuously throughout the session (every isHrAdmin() call), not just
      // once at login like hrPortalAccess/erpPortalAccess (pure login-time gates) - it must be
      // persisted here or it would silently stop working the moment currentSession() re-reads
      // from storage instead of the raw login response.
      isHrAdmin: Boolean(session.isHrAdmin),
      hrPortalAccess: session.hrPortalAccess === true,
      erpPortalAccess: session.erpPortalAccess !== false,
      maintenancePortalAccess: session.maintenancePortalAccess === true,
      crmPortalAccess: session.crmPortalAccess === true,
      crmRole: session.crmRole || "Sales Executive",
      crmViewAllAccounts: session.crmViewAllAccounts === true,
      crmManageAssignments: session.crmManageAssignments === true,
      crmExportAccess: session.crmExportAccess === true,
      crmArchiveAccess: session.crmArchiveAccess === true,
      crmViewTeamReports: session.crmViewTeamReports === true,
      crmAdminAccess: session.crmAdminAccess === true,
      aiAccess: session.aiAccess === true
    })
  );
}

function seedState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    shipments: [
      shipment("AFS-2605001", "Kuwait HO", "Gulf Retail Trading", "Kuwait City", "Riyadh", "Booked", 14, 820, 5.2, 1040, 485, 330, "Pending", "Unbilled", "2026-05-05", "AWB-2605001", "TAR-1001", 3, "Export", "AE", ""),
      shipment("AFS-2605002", "Dubai", "Desert Medical Supplies", "Shuwaikh", "Dammam", "In-Transit", 8, 410, 2.1, 420, 215, 150, "Pending", "Unbilled", "2026-05-05", "AWB-2605002", "TAR-1002", 2, "Import", "AI", ""),
      shipment("AFS-2605003", "Kuwait HO", "Al Noor Projects", "Ahmadi", "Doha", "Delivered", 22, 1250, 7.8, 1560, 780, 590, "Missing", "Unbilled", "2026-05-04", "AWB-2605003", "TAR-1001", 4, "Export", "LE", ""),
      shipment("AFS-2605004", "Kuwait HO", "Gulf Retail Trading", "Kuwait City", "Riyadh", "Invoiced", 4, 160, 0.9, 180, 95, 70, "Uploaded", "INV-260001", "2026-05-02", "AWB-2605004", "TAR-1001", 3, "WHC", "WHC Remark", "Warehouse handling and cross-docking")
    ],
    loads: [
      load("CON-260501", "2026-05-05", "Kuwait - Riyadh", "Al Dana Transport", "KWT-49217", "Dispatched", "AFS-2605001, AFS-2605004", "Not Generated", ""),
      load("CON-260502", "2026-05-06", "Kuwait - Dammam", "Falcon Line Haul", "KWT-77320", "Planned", "AFS-2605002", "Not Generated", "")
    ],
    customers: [
      party("CUS-001", "Gulf Retail Trading", "Kuwait City", "ops@gulf-retail.example", "30 days", "Active", false, "Kuwait HO"),
      party("CUS-002", "Desert Medical Supplies", "Shuwaikh", "logistics@desert-med.example", "15 days", "Active", true, "Dubai"),
      party("CUS-003", "Al Noor Projects", "Ahmadi", "cargo@alnoor.example", "45 days", "Active", false, "Kuwait HO")
    ],
    suppliers: [
      party("TRN-001", "Al Dana Transport", "Kuwait - Riyadh", "dispatch@aldana.example", "20 days", "Active", false, "Kuwait HO"),
      party("TRN-002", "Falcon Line Haul", "Kuwait - Dammam", "ops@falconline.example", "30 days", "Active", false, "Dubai")
    ],
    tariffs: [
      tariff("TAR-1001", "Gulf Retail Trading", "Kuwait City", "Riyadh", "FTL", "Minimum", "100 KG", 0.42, 35),
      tariff("TAR-1002", "Desert Medical Supplies", "Shuwaikh", "Dammam", "LTL", "Up to 300 KG", "300 KG", 18, 55)
    ],
    documents: [
      documentRow("DOC-001", "AFS-2605001", "Waybill", "Issued", "2026-05-05", "operations"),
      documentRow("DOC-002", "AFS-2605003", "POD", "Missing", "2026-05-04", "delivery"),
      documentRow("DOC-003", "AFS-2605004", "Customer Invoice", "Stored", "2026-05-02", "billing")
    ],
    additionalCharges: [
      additionalCharge("CHG-001", "AFS-2605001", "2026-05-24", "Labour Charges", "1 ton", "ABC Labour", "LAB-5001", "INV-LAB-001", 50, 10, "KWD", "Labour support at warehouse dock.", "", "Approved", "admin", "admin", "Approved by admin"),
      additionalCharge("CHG-002", "AFS-2605001", "2026-05-24", "Delivery Charges", "3 ton", "Fast Van", "DLV-5001", "INV-DLV-001", 20, 10, "KWD", "Final-mile van delivery.", "", "Pending Approval", "operations", "", "")
    ],
    invoices: [
      invoice("INV-260001", "Gulf Retail Trading", "AFS-2605004", 95, 70, "Sent", "2026-05-02"),
      invoice("DRAFT-260006", "Al Noor Projects", "AFS-2605003", 780, 590, "Draft", "2026-05-05")
    ],
    quotations: [],
    shipmentRequests: [],
    shipmentStatusHistory: [],
    users: [
      user("admin", "admin@apollofreightsolution.com", "Admin", "Active", "Both", "All Branches", "All", true, true, true, true, "", "System administrator"),
      user("ops-kuwait", "operations.kuwait@apollofreightsolution.com", "Operations", "Active", "Kuwait HO", "Assigned Branch Only", "Dashboard, Shipment / Airway, Manifest, Customers, Suppliers / Transporters, Documents, Tariffs / Rate Master, Reports", true, false, false, false, "", "Can create and track Kuwait HO shipments"),
      user("billing-dubai", "billing.dubai@apollofreightsolution.com", "Billing", "Active", "Dubai", "Assigned Branch Only", "Dashboard, Billing / Invoices, POD / Delivery, Shipment Status, Reports", true, false, true, true, "", "Invoice and finance access for Dubai")
    ],
    customerUsers: [],
    unblockRequests: [],
    adminRequests: [],
    audit: [],
    employees: [
      { userName: "admin", employeeCode: "EMP-0001", fullName: "System Administrator", department: "Management", designation: "Administrator", joinDate: "2024-01-01", phone: "", personalEmail: "", employmentStatus: "Active", reportingManager: "", notes: "Demo employee record" }
    ],
    leaveRequests: [],
    payslips: [],
    hrAnnouncements: [
      { id: "1", title: "Welcome to the HR Portal", body: "This is a demo announcement. Connect a database to start managing real employee records, leave requests, payslips, and announcements.", postedBy: "admin", audience: "All", pinned: true, postedAt: today }
    ],
    hrAnnouncementReadIds: {},
    settings: {
      settingsKey: "default",
      companyName: "APOLLO FREIGHT SOLUTIONS",
      companyLogoUrl: "",
      shipmentNumberFormat: "AFS-SI###",
      kuwaitShipmentNumberFormat: "AFS-#####/MM/KWI/{SERVICE}",
      dubaiShipmentNumberFormat: "AFS-#####/MM/DBX/{SERVICE}",
      kuwaitShipmentSerialStart: "1",
      dubaiShipmentSerialStart: "1",
      invoiceNumberFormat: "INV-YY###",
      consolidationNumberFormat: "CON-YY###",
      tcnNumberFormat: "TCN-YY###",
      deliveryNoteNumberFormat: "POD-YY###",
      documentNumberFormat: "DOC-YY###",
      tariffNumberFormat: "TAR-###",
      customerNumberFormat: "CUS-###",
      additionalChargeNumberFormat: "CHG-YY###",
      supplierNumberFormat: "TRN-###",
      quotationNumberFormat: "QUO-YY###",
      awbNumberFormat: "AFS######",
      awbSerialStart: "262035",
      columnLayoutJson: "{}",
      defaulttricDivisor: "5000",
      requirePodBeforeInvoice: "Yes",
      allowGlobalShipmentQuickSearch: "No",
      branches: "Kuwait HO, Dubai",
      dropdownOptionsJson: "{}"
    },
    api: {
      status: "Checking API",
      database: "Pending",
      mode: "local"
    },
    ui: {
      reportFormat: "PDF",
      reportType: "Daily shipments",
      reportPreview: null,
      selectedLoadNo: "",
      shipmentRegisterColumns: null,
      dashboardShipmentColumns: null,
      openColumnSettings: "",
      customerActivityFilter: "All",
      customerRequestEditNo: ""
    },
    dropdownOptions: {}
  };
}

function parseJsonMeta(value) {
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function shipmentMetaNotes(data) {
  return JSON.stringify({
    shipmentDate: String(data.shipmentDate || "").trim(),
    expectedArrivalDate: String(data.expectedArrivalDate || "").trim(),
    transportMode: String(data.transportMode || "").trim(),
    shipmentVia: String(data.shipmentVia || data.transportMode || "").trim(),
    loadType: String(data.loadType || "").trim(),
    receivingBranch: String(data.receivingBranch || data.destinationBranch || "").trim(),
    expectedArrivalDate: String(data.expectedArrivalDate || "").trim(),
    customerCode: String(data.customerCode || "").trim(),
    customerContactPerson: String(data.customerContactPerson || "").trim(),
    customerMobile: String(data.customerMobile || "").trim(),
    customerEmail: String(data.customerEmail || "").trim(),
    customerAddress: String(data.customerAddress || "").trim(),
    internalReferenceNo: String(data.internalReferenceNo || "").trim(),
    salesPerson: String(data.salesPerson || "").trim(),
    shipperName: String(data.shipperName || "").trim(),
    shipperAddress: String(data.shipperAddress || "").trim(),
    shipperContactPerson: String(data.shipperContactPerson || "").trim(),
    shipperMobile: String(data.shipperMobile || "").trim(),
    shipperEmail: String(data.shipperEmail || "").trim(),
    shipperVatTrn: String(data.shipperVatTrn || "").trim(),
    shipperCountry: String(data.shipperCountry || "").trim(),
    consigneeName: String(data.consigneeName || "").trim(),
    consigneeAddress: String(data.consigneeAddress || "").trim(),
    consigneeContactPerson: String(data.consigneeContactPerson || "").trim(),
    consigneeMobile: String(data.consigneeMobile || "").trim(),
    consigneeEmail: String(data.consigneeEmail || "").trim(),
    consigneeCountry: String(data.consigneeCountry || "").trim(),
    pickupLocation: String(data.pickupLocation || "").trim(),
    pickupAddress: String(data.pickupAddress || "").trim(),
    pickupContactPerson: String(data.pickupContactPerson || "").trim(),
    pickupMobile: String(data.pickupMobile || "").trim(),
    pickupDate: String(data.pickupDate || "").trim(),
    pickupTime: String(data.pickupTime || "").trim(),
    deliveryLocation: String(data.deliveryLocation || "").trim(),
    deliveryAddress: String(data.deliveryAddress || "").trim(),
    deliveryContactPerson: String(data.deliveryContactPerson || "").trim(),
    deliveryMobile: String(data.deliveryMobile || "").trim(),
    deliveryDate: String(data.deliveryDate || "").trim(),
    deliveryTime: String(data.deliveryTime || "").trim(),
    notifyPartyName: String(data.notifyPartyName || "").trim(),
    notifyPartyAddress: String(data.notifyPartyAddress || "").trim(),
    notifyContactPerson: String(data.notifyContactPerson || "").trim(),
    notifyMobile: String(data.notifyMobile || "").trim(),
    notifyEmail: String(data.notifyEmail || "").trim(),
    billTo1: String(data.billTo1 || "").trim(),
    billTo2: String(data.billTo2 || "").trim(),
    billingParty1Address: String(data.billingParty1Address || "").trim(),
    billingParty1ContactPerson: String(data.billingParty1ContactPerson || "").trim(),
    billingParty1Mobile: String(data.billingParty1Mobile || "").trim(),
    billingParty1Email: String(data.billingParty1Email || "").trim(),
    billingParty1CreditTerms: String(data.billingParty1CreditTerms || "").trim(),
    billingParty2Address: String(data.billingParty2Address || "").trim(),
    billingParty2ContactPerson: String(data.billingParty2ContactPerson || "").trim(),
    billingParty2Mobile: String(data.billingParty2Mobile || "").trim(),
    billingParty2Email: String(data.billingParty2Email || "").trim(),
    billingParty2Percentage: String(data.billingParty2Percentage || "").trim(),
    printOnlyCargoDetails: isChecked(data.printOnlyCargoDetails),
    manualChargeableKg: Number(data.manualChargeableKg || 0),
    volumeCategory: String(data.volumeCategory || "1 CBM = 250 KG").trim(),
    natureOfGoods: String(data.natureOfGoods || "").trim(),
    cargoItemsJson: data.cargoItemsJson || data.palletDimensionsJson || "[]",
    transitPoint: String(data.transitPoint || "").trim(),
    route: String(data.route || "").trim(),
    transporter: String(data.transporter || "").trim(),
    vehicleNo: String(data.vehicleNo || "").trim(),
    driverName: String(data.driverName || "").trim(),
    driverMobile: String(data.driverMobile || "").trim(),
    tripNo: String(data.tripNo || "").trim(),
    manifestNo: String(data.manifestNo || "").trim(),
    currency: String(data.currency || "KWD").trim(),
    freightAmount: Number(data.freightAmount || 0),
    otherChargesAmount: Number(data.otherChargesAmount || 0),
    taxAmount: Number(data.taxAmount || 0),
    totalAmount: Number(data.totalAmount || 0),
    paymentMode: String(data.paymentMode || "").trim(),
    invoiceCopy: String(data.invoiceCopy || "").trim(),
    packingListCopy: String(data.packingListCopy || "").trim(),
    podCopy: String(data.podCopy || "").trim(),
    customsDocuments: String(data.customsDocuments || "").trim(),
    otherDocuments: String(data.otherDocuments || "").trim(),
    specialInstructions: String(data.specialInstructions || "").trim(),
    handlingInstructions: String(data.handlingInstructions || "").trim(),
    internalNotes: String(data.internalNotes || "").trim(),
    tcnNumber: String(data.tcnNumber || "").trim(),
    palletDimensionsJson: data.palletDimensionsJson || "[]",
    entryMode: data.entryMode || "shipment",
    deliveryNoteNo: String(data.deliveryNoteNo || "").trim(),
    ginNo: String(data.ginNo || "").trim(),
    customerReference: String(data.customerReference || "").trim(),
    shipmentRemarks: String(data.shipmentRemarks || "").trim(),
    vehicleType: String(data.vehicleType || "").trim(),
    deliveryRemarks: String(data.deliveryRemarks || "").trim(),
    pocName: String(data.pocName || "").trim(),
    pocMobile: String(data.pocMobile || "").trim(),
    additionalContact: String(data.additionalContact || "").trim(),
    preparedBy: String(data.preparedBy || "").trim(),
    deliveredBy: String(data.deliveredBy || "").trim(),
    receivedBy: String(data.receivedBy || data.receiver || "").trim(),
    receiverPhone: String(data.receiverPhone || "").trim(),
    deliveryDatetime: String(data.deliveryDatetime || "").trim(),
    receiverSignature: String(data.receiverSignature || "").trim()
  });
}

function loadMetaNotes(data) {
  return JSON.stringify({
    driverName: String(data.driverName || "").trim(),
    driverNumber: String(data.driverNumber || "").trim(),
    driverMobile: String(data.driverMobile || "").trim(),
    transporterCode: String(data.transporterCode || "").trim(),
    origin: String(data.origin || "").trim(),
    destination: String(data.destination || "").trim()
  });
}

function shipment(
  jobNo,
  branch,
  customer,
  origin,
  destination,
  status,
  pieces,
  actualKg,
  cbm,
  chargeableKg,
  sell,
  buyCost,
  podStatus,
  invoiceStatus,
  bookingDate,
  airwayBillNo = jobNo.replace("AFS", "AWB"),
  tariffNo = "TAR-1001",
  transitDays = 3,
  shipmentDirection = "Export",
  shipmentService = "AE",
  shipmentServiceOther = "",
  volumeCategory = "Land",
  chargeableDivisor = 250,
  createdBy = currentUserName(),
  notes = ""
) {
  const meta = parseJsonMeta(notes);
  return {
    jobNo,
    branch,
    customer,
    origin,
    destination,
    status,
    pieces,
    actualKg,
    cbm,
    chargeableKg,
    sell,
    buyCost,
    podStatus,
    invoiceStatus,
    bookingDate,
    airwayBillNo,
    tariffNo,
    transitDays,
    shipmentDirection,
    shipmentService,
    shipmentServiceOther,
    volumeCategory,
    chargeableDivisor,
    shipmentDate: meta.shipmentDate || "",
    expectedArrivalDate: meta.expectedArrivalDate || "",
    receivingBranch: meta.receivingBranch || "",
    transportMode: meta.transportMode || "",
    loadType: meta.loadType || "",
    shipmentVia: meta.shipmentVia || meta.transportMode || "",
    expectedArrivalDate: meta.expectedArrivalDate || "",
    customerCode: meta.customerCode || "",
    customerContactPerson: meta.customerContactPerson || "",
    customerMobile: meta.customerMobile || "",
    customerEmail: meta.customerEmail || "",
    customerAddress: meta.customerAddress || "",
    internalReferenceNo: meta.internalReferenceNo || "",
    salesPerson: meta.salesPerson || "",
    shipperName: meta.shipperName || "",
    shipperAddress: meta.shipperAddress || "",
    shipperContactPerson: meta.shipperContactPerson || "",
    shipperMobile: meta.shipperMobile || "",
    shipperEmail: meta.shipperEmail || "",
    shipperVatTrn: meta.shipperVatTrn || "",
    shipperCountry: meta.shipperCountry || "",
    consigneeName: meta.consigneeName || "",
    consigneeAddress: meta.consigneeAddress || "",
    consigneeContactPerson: meta.consigneeContactPerson || "",
    consigneeMobile: meta.consigneeMobile || "",
    consigneeEmail: meta.consigneeEmail || "",
    consigneeCountry: meta.consigneeCountry || "",
    pickupLocation: meta.pickupLocation || "",
    pickupAddress: meta.pickupAddress || "",
    pickupContactPerson: meta.pickupContactPerson || "",
    pickupMobile: meta.pickupMobile || "",
    pickupDate: meta.pickupDate || "",
    pickupTime: meta.pickupTime || "",
    deliveryLocation: meta.deliveryLocation || "",
    deliveryAddress: meta.deliveryAddress || "",
    deliveryContactPerson: meta.deliveryContactPerson || "",
    deliveryMobile: meta.deliveryMobile || "",
    deliveryDate: meta.deliveryDate || "",
    deliveryTime: meta.deliveryTime || "",
    notifyPartyName: meta.notifyPartyName || "",
    notifyPartyAddress: meta.notifyPartyAddress || "",
    notifyContactPerson: meta.notifyContactPerson || "",
    notifyMobile: meta.notifyMobile || "",
    notifyEmail: meta.notifyEmail || "",
    billTo1: meta.billTo1 || "",
    billTo2: meta.billTo2 || "",
    billingParty1Address: meta.billingParty1Address || "",
    billingParty1ContactPerson: meta.billingParty1ContactPerson || "",
    billingParty1Mobile: meta.billingParty1Mobile || "",
    billingParty1Email: meta.billingParty1Email || "",
    billingParty1CreditTerms: meta.billingParty1CreditTerms || "",
    billingParty2Address: meta.billingParty2Address || "",
    billingParty2ContactPerson: meta.billingParty2ContactPerson || "",
    billingParty2Mobile: meta.billingParty2Mobile || "",
    billingParty2Email: meta.billingParty2Email || "",
    billingParty2Percentage: meta.billingParty2Percentage || "",
    manualChargeableKg: Number(meta.manualChargeableKg || 0),
    volumeCategory: meta.volumeCategory || volumeCategory,
    natureOfGoods: meta.natureOfGoods || "",
    cargoItemsJson: meta.cargoItemsJson || meta.palletDimensionsJson || "[]",
    transitPoint: meta.transitPoint || "",
    route: meta.route || "",
    transporter: meta.transporter || "",
    vehicleNo: meta.vehicleNo || "",
    driverName: meta.driverName || "",
    driverMobile: meta.driverMobile || "",
    tripNo: meta.tripNo || "",
    manifestNo: meta.manifestNo || "",
    currency: meta.currency || "KWD",
    freightAmount: Number(meta.freightAmount || 0),
    otherChargesAmount: Number(meta.otherChargesAmount || 0),
    taxAmount: Number(meta.taxAmount || 0),
    totalAmount: Number(meta.totalAmount || 0),
    paymentMode: meta.paymentMode || "",
    invoiceCopy: meta.invoiceCopy || "",
    packingListCopy: meta.packingListCopy || "",
    podCopy: meta.podCopy || "",
    customsDocuments: meta.customsDocuments || "",
    otherDocuments: meta.otherDocuments || "",
    specialInstructions: meta.specialInstructions || "",
    handlingInstructions: meta.handlingInstructions || "",
    internalNotes: meta.internalNotes || "",
    tcnNumber: meta.tcnNumber || "",
    palletDimensionsJson: meta.palletDimensionsJson || "[]",
    entryMode: meta.entryMode || (String(jobNo || "").startsWith("AWB") ? "airway" : "shipment"),
    deliveryNoteNo: meta.deliveryNoteNo || "",
    ginNo: meta.ginNo || "",
    customerReference: meta.customerReference || "",
    shipmentRemarks: meta.shipmentRemarks || "",
    vehicleType: meta.vehicleType || "",
    deliveryRemarks: meta.deliveryRemarks || "",
    printOnlyCargoDetails: isChecked(meta.printOnlyCargoDetails),
    pocName: meta.pocName || "",
    pocMobile: meta.pocMobile || "",
    additionalContact: meta.additionalContact || "",
    preparedBy: meta.preparedBy || "",
    deliveredBy: meta.deliveredBy || "",
    receivedBy: meta.receivedBy || "",
    receiverPhone: meta.receiverPhone || "",
    deliveryDatetime: meta.deliveryDatetime || "",
    receiverSignature: meta.receiverSignature || "",
    notes,
    createdBy
  };
}

function load(loadNo, tripDate, route, transporter, vehicleNo, status, jobNumbers, manifestStatus = "Not Generated", lastManifestRequestNo = "", createdBy = currentUserName(), notes = "") {
  const meta = parseJsonMeta(notes);
  return { loadNo, tripDate, route, transporter, transporterCode: meta.transporterCode || "", vehicleNo, driverName: meta.driverName || "", driverNumber: meta.driverNumber || "", driverMobile: meta.driverMobile || "", origin: meta.origin || "", destination: meta.destination || "", status, jobNumbers, pieces: 0, actualKg: 0, cbm: 0, chargeableKg: 0, manifestStatus, lastManifestRequestNo, notes, createdBy };
}

function party(code, name, locationOrLane, email, terms, status, isAccountOverdue, branch, createdBy = currentUserName(), fullAddress = "", mobile = "", blockedBranches = "") {
  return { code, name, locationOrLane, email, mobile, terms, status, isAccountOverdue, branch, fullAddress, createdBy, createdDate: new Date().toISOString().slice(0, 10), blockedBranches };
}

function tariff(tariffNo, customer, origin, destination, mainSection, weightSection, minUpTo, rate, minCharge, additionalChargesJson = "[]", additionalChargesTotal = 0, grandTotal = 0, createdBy = currentUserName()) {
  const weightRates = normalizeTariffWeightRates({ minimum: rate, upTo100: rate, upTo300: rate, upTo500: rate, upTo1000: rate, more: rate }, Number(rate || 0));
  return {
    tariffNo,
    customer,
    origin,
    destination,
    mainSection,
    weightSection: weightSection || "Table",
    minUpTo: minUpTo || "",
    rate: tariffPrimaryRate(weightRates),
    minCharge: Number(minCharge || 0),
    additionalChargesJson,
    additionalChargesTotal: Number(additionalChargesTotal || 0),
    grandTotal: Number(grandTotal || Number(minCharge || 0) + Number(additionalChargesTotal || 0)),
    weightRatesJson: JSON.stringify(weightRates),
    currency: "KD",
    rateType: "Per KG",
    volumetricDivisor: 5000,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    status: "Active",
    createdBy
  };
}

function tariffWeightBandDefinitions() {
  return [
    { key: "minimum", label: "Minimum", max: 0 },
    { key: "upTo100", label: "Up to 100", max: 100 },
    { key: "upTo300", label: "300", max: 300 },
    { key: "upTo500", label: "500", max: 500 },
    { key: "upTo1000", label: "1000", max: 1000 },
    { key: "more", label: "More", max: Infinity }
  ];
}

function tariffWeightBandKeys() {
  return tariffWeightBandDefinitions().map((band) => band.key);
}

function normalizeTariffWeightRates(value, fallbackRate = 0) {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed || "{}"); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
  const fallback = Number(fallbackRate || parsed.rate || 0);
  const rates = {};
  tariffWeightBandKeys().forEach((key) => {
    const raw = parsed[key];
    rates[key] = raw === undefined || raw === null || raw === "" ? fallback : Number(raw || 0);
  });
  if (tariffWeightBandKeys().every((key) => Number(rates[key] || 0) === 0) && fallback > 0) {
    tariffWeightBandKeys().forEach((key) => { rates[key] = fallback; });
  }
  return rates;
}

function tariffWeightBandForWeight(weight) {
  const numeric = Number(weight || 0);
  if (numeric <= 0) return tariffWeightBandDefinitions()[0];
  if (numeric <= 100) return tariffWeightBandDefinitions()[1];
  if (numeric <= 300) return tariffWeightBandDefinitions()[2];
  if (numeric <= 500) return tariffWeightBandDefinitions()[3];
  if (numeric <= 1000) return tariffWeightBandDefinitions()[4];
  return tariffWeightBandDefinitions()[5];
}

function tariffWeightRateLookup(tariffItem, chargeableWeight) {
  const rates = normalizeTariffWeightRates(tariffItem?.weightRatesJson || tariffItem?.weight_rates_json || {}, Number(tariffItem?.rate || 0));
  const band = tariffWeightBandForWeight(chargeableWeight);
  return { rates, band, rate: Number(rates[band.key] || 0) };
}

function tariffPrimaryRate(rates) {
  const normalized = normalizeTariffWeightRates(rates || {}, 0);
  for (const band of tariffWeightBandDefinitions()) {
    const value = Number(normalized[band.key] || 0);
    if (Number.isFinite(value) && value > 0) return Number(value.toFixed(3));
  }
  return 0;
}

function tariffPricingForWeight(tariffItem, chargeableWeight) {
  if (!tariffItem) return { rates: normalizeTariffWeightRates({}, 0), band: tariffWeightBandForWeight(chargeableWeight), rate: 0, freight: 0, additional: 0, revenue: 0 };
  const lookup = tariffWeightRateLookup(tariffItem, chargeableWeight);
  const freight = Math.max(Number(tariffItem.minCharge || 0), Number(chargeableWeight || 0) * lookup.rate);
  const additional = Number(tariffItem.additionalChargesTotal || 0);
  return { ...lookup, freight: Number(freight.toFixed(3)), additional: Number(additional.toFixed(3)), revenue: Number((freight + additional).toFixed(3)) };
}

function buildTariffRecord(data = {}, existing = {}) {
  const source = { ...existing, ...data };
  const weightRates = normalizeTariffWeightRates(source.weightRatesJson || source.weight_rates_json || {}, Number(source.rate || 0));
  const weightRatesJson = JSON.stringify(weightRates);
  const minCharge = Number(source.minCharge ?? source.min_charge ?? 0);
  const additionalChargesTotal = Number(source.additionalChargesTotal ?? source.additional_charges_total ?? 0);
  const grandTotal = Number(source.grandTotal ?? source.grand_total ?? (minCharge + additionalChargesTotal));
  return {
    tariffNo: String(source.tariffNo || source.tariff_no || ""),
    customer: String(source.customer || ""),
    origin: String(source.origin || ""),
    destination: String(source.destination || ""),
    mainSection: String(source.mainSection || source.main_section || "FTL"),
    weightSection: String(source.weightSection || source.weight_section || "Table"),
    minUpTo: "",
    rate: tariffPrimaryRate(weightRates),
    minCharge,
    additionalChargesJson: source.additionalChargesJson || source.additional_charges_json || "[]",
    additionalChargesTotal,
    grandTotal,
    weightRatesJson,
    currency: String(source.currency || "KD"),
    rateType: String(source.rateType || source.rate_type || "Per KG"),
    volumetricDivisor: Number(source.volumetricDivisor || source.volumetric_divisor || 5000),
    effectiveFrom: String(source.effectiveFrom || source.effective_from || today()).slice(0, 10),
    effectiveTo: String(source.effectiveTo || source.effective_to || today()).slice(0, 10),
    status: String(source.status || "Active"),
    createdBy: String(source.createdBy || source.created_by || currentUserName())
  };
}

function tariffWeightRateTableHtml(tariffItem = {}, options = {}) {
  const editable = Boolean(options.editable);
  const selectedBand = options.selectedWeight === undefined || options.selectedWeight === null || options.selectedWeight === "" ? null : tariffWeightBandForWeight(options.selectedWeight);
  const rates = normalizeTariffWeightRates(tariffItem.weightRatesJson || tariffItem.weight_rates_json || {}, Number(tariffItem.rate || 0));
  const bands = tariffWeightBandDefinitions();
  const header = bands.map((band) => "<th>" + escapeHtml(band.label) + "</th>").join("");
  const cells = bands.map((band) => {
    const selected = selectedBand && selectedBand.key === band.key ? " is-selected" : "";
    const value = Number(rates[band.key] || 0);
    const readonlyAttr = editable ? "" : " readonly";
    return "<td class=\"tariff-weight-cell" + selected + "\"><input type=\"number\" step=\"0.001\" min=\"0\" data-tariff-weight-rate=\"" + escapeHtml(band.key) + "\" value=\"" + escapeHtml(numericInputValue(value)) + "\"" + readonlyAttr + " /></td>";
  }).join("");
  return "<div class=\"table-wrap tariff-weight-wrap\"><table class=\"tariff-weight-table" + (editable ? " is-editable" : "") + "\"><thead><tr><th></th>" + header + "</tr></thead><tbody><tr><th>Rate</th>" + cells + "</tr></tbody></table></div>";
}

function tariffWeightRatesBuilder(record = {}) {
  const weightRatesJson = record.weightRatesJson || record.weight_rates_json || JSON.stringify(normalizeTariffWeightRates({}, Number(record.rate || 0)));
  const primaryRate = tariffPrimaryRate(weightRatesJson);
  const isEditable = String(record.mainSection || "FTL").toUpperCase() === "LTL";
  return "<div class=\"tariff-weight-builder\" data-tariff-weight-builder>" +
    "<input type=\"hidden\" name=\"weightRatesJson\" value=\"" + escapeHtml(weightRatesJson) + "\" />" +
    "<input type=\"hidden\" name=\"weightSection\" value=\"Table\" />" +
    "<input type=\"hidden\" name=\"minUpTo\" value=\"\" />" +
    "<input type=\"hidden\" name=\"rate\" value=\"" + escapeHtml(String(primaryRate)) + "\" />" +
    tariffWeightRateTableHtml({ ...record, weightRatesJson }, { editable: isEditable }) +
  "</div>";
}

function bindTariffWeightRates() {
  const builder = dialogBody.querySelector("[data-tariff-weight-builder]");
  if (!builder) return;
  const hidden = builder.querySelector("input[name='weightRatesJson']");
  const rateField = builder.querySelector("input[name='rate']");
  const mainSectionField = dialogBody.querySelector("[name='mainSection']");
  const inputs = [...builder.querySelectorAll("[data-tariff-weight-rate]")];
  const sync = () => {
    const rates = {};
    inputs.forEach((input) => { rates[input.dataset.tariffWeightRate] = Number(input.value || 0); });
    if (hidden) hidden.value = JSON.stringify(rates);
    if (rateField) rateField.value = String(tariffPrimaryRate(rates));
  };
  const syncEditability = () => {
    const isLTL = String(mainSectionField?.value || "FTL").toUpperCase() === "LTL";
    inputs.forEach((input) => { input.readOnly = !isLTL; });
  };
  inputs.forEach((input) => { input.addEventListener("input", sync); input.addEventListener("change", sync); });
  mainSectionField?.addEventListener("change", syncEditability);
  mainSectionField?.addEventListener("input", syncEditability);
  sync();
  syncEditability();
}

function tariffDialogBody(record = {}) {
  const tariffItem = buildTariffRecord(record, record);
  const tariffNo = tariffItem.tariffNo || nextNumber("TAR", state.tariffs, "tariffNo");
  return "" +
    input("tariffNo", "Tariff Number", tariffNo, Boolean(record.tariffNo)) +
    selectFrom("customer", "Consignee", state.customers.map((row) => row.name), tariffItem.customer) +
    input("origin", "Origin", tariffItem.origin || "Kuwait City") +
    input("destination", "Destination", tariffItem.destination || "Riyadh") +
    selectEditable("mainSection", "Main Section", "mainSection", ["FTL", "LTL"], tariffItem.mainSection || "FTL") +
    formSection("Weight Section", tariffWeightRatesBuilder(tariffItem), true, true) +
    selectEditable("currency", "Currency", "currency", currencyOptions(), tariffItem.currency || "KD") +
    input("minCharge", "Minimum Charge", numericInputValue(tariffItem.minCharge || 0), false, "number") +
    tariffAdditionalChargesBuilder(tariffItem.additionalChargesJson || "[]");
}

function tariffPreviewRateSummary(tariffItem, selectedWeight) {
  const pricing = tariffPricingForWeight(tariffItem, selectedWeight || 0);
  return [
    summaryPair("Selected Band", pricing.band.label),
    summaryPair("Selected Rate", money(pricing.rate)),
    summaryPair("Minimum Charge", money(tariffItem.minCharge || 0)),
    summaryPair("Additional Charges", money(tariffItem.additionalChargesTotal || 0))
  ].join("");
}

function documentRow(documentNo, linkedNo, type, status, date, owner, fileName = "", createdBy = currentUserName()) {
  return { documentNo, linkedNo, type, status, date, owner, fileName, createdBy };
}

// Documents keep their stored document number and linked job number unchanged. The register derives
// the AWB group from the linked shipment so one uploaded POD can show every related job without
// exposing the synchronized per-job clone rows as separate document records.
function documentLinkedShipment(row) {
  const linkedNo = String(row?.linkedNo || "").trim();
  if (!linkedNo) return { airwayBillNo: "", jobNo: "" };
  const normalizedLink = linkedNo.toLowerCase();
  const shipment = (state.shipments || []).find((item) => [item?.jobNo, item?.airwayBillNo]
    .some((value) => String(value || "").trim().toLowerCase() === normalizedLink));
  return {
    airwayBillNo: String(shipment?.airwayBillNo || (String(linkedNo).toUpperCase().startsWith("AWB") ? linkedNo : "")).trim(),
    jobNo: String(shipment?.jobNo || (String(linkedNo).toUpperCase().startsWith("AWB") ? "" : linkedNo)).trim()
  };
}
function documentLinkedJobNumbers(row) {
  const { airwayBillNo, jobNo } = documentLinkedShipment(row);
  const normalizedAwb = airwayBillNo.toLowerCase();
  const relatedJobs = normalizedAwb
    ? (state.shipments || [])
      .filter((item) => String(item?.airwayBillNo || "").trim().toLowerCase() === normalizedAwb)
      .map((item) => String(item?.jobNo || "").trim())
      .filter(Boolean)
    : [];
  return [...new Set(relatedJobs.length ? relatedJobs : (jobNo ? [jobNo] : []))];
}
function documentLinkedToText(row) {
  const linkedNo = String(row?.linkedNo || "").trim();
  const { airwayBillNo } = documentLinkedShipment(row);
  const jobNumbers = documentLinkedJobNumbers(row);
  if (airwayBillNo && jobNumbers.length) return `${airwayBillNo} | Job: ${jobNumbers.join(", ")}`;
  return airwayBillNo || jobNumbers.join(", ") || linkedNo;
}
function documentLinkedToMarkup(row) {
  const linkedText = documentLinkedToText(row);
  if (!linkedText) return `<span class="empty-state">-</span>`;
  const { airwayBillNo } = documentLinkedShipment(row);
  const jobNumbers = documentLinkedJobNumbers(row);
  const separator = airwayBillNo && jobNumbers.length ? " | " : "";
  return `<span class="document-linked-to" title="${escapeHtml(linkedText)}">${airwayBillNo ? `<strong>${escapeHtml(airwayBillNo)}</strong>` : ""}${separator}${jobNumbers.length ? `<span>Job: ${escapeHtml(jobNumbers.join(", "))}</span>` : ""}</span>`;
}
function documentRegisterGroupingKey(row) {
  if (String(row?.type || "").trim().toLowerCase() !== "pod") return "";
  const storageUrl = String(row?.storageUrl || "").trim();
  if (!storageUrl) return "";
  const { airwayBillNo } = documentLinkedShipment(row);
  return `${airwayBillNo.toLowerCase()}|${storageUrl}`;
}
function documentRowIsSynthetic(row) {
  return /^POD-AWB-BACKFILL-/i.test(String(row?.documentNo || "").trim());
}
function documentRowIsOriginalJob(row) {
  const documentNo = String(row?.documentNo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const linkedNo = String(row?.linkedNo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(linkedNo && documentNo.startsWith(`pod${linkedNo}`));
}
function documentRowCreatedTime(row) {
  const createdAt = String(row?.createdAt || "").trim();
  const time = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
function preferredDocumentRow(candidate, current) {
  if (!current) return candidate;
  if (documentRowIsSynthetic(candidate) !== documentRowIsSynthetic(current)) {
    return documentRowIsSynthetic(candidate) ? current : candidate;
  }
  if (documentRowIsOriginalJob(candidate) !== documentRowIsOriginalJob(current)) {
    return documentRowIsOriginalJob(candidate) ? candidate : current;
  }
  return documentRowCreatedTime(candidate) < documentRowCreatedTime(current) ? candidate : current;
}
function documentRegisterRows(rows) {
  const result = [];
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const isPod = String(row?.type || "").trim().toLowerCase() === "pod";
    // AWB backfill rows are synchronization artifacts, not separate user uploads. They remain in
    // state so shipment/POD operations are intact, but the Documents register must show the
    // original uploaded file only.
    if (isPod && documentRowIsSynthetic(row)) return;
    const groupKey = documentRegisterGroupingKey(row);
    if (!groupKey) {
      result.push(row);
      return;
    }
    const current = grouped.get(groupKey);
    if (!current) {
      grouped.set(groupKey, row);
      result.push(row);
      return;
    }
    const preferred = preferredDocumentRow(row, current);
    if (preferred !== current) {
      const currentIndex = result.indexOf(current);
      if (currentIndex >= 0) result[currentIndex] = preferred;
      grouped.set(groupKey, preferred);
    }
  });
  return result;
}

function additionalCharge(
  refNo,
  shipmentNo,
  chargeDate,
  chargeType,
  chargeBasis,
  supplier,
  referenceNo,
  invoiceNo,
  amount,
  taxPercent,
  currency,
  remarks,
  attachmentName,
  status,
  requestedBy,
  approvedBy,
  approvalNotes,
  createdBy = currentUserName()
) {
  const taxAmount = Number(amount || 0) * (Number(taxPercent || 0) / 100);
  const totalAmount = Number(amount || 0) + taxAmount;
  return {
    refNo,
    shipmentNo,
    chargeDate,
    chargeType,
    chargeBasis,
    supplier,
    referenceNo,
    invoiceNo,
    amount: Number(amount || 0),
    taxPercent: Number(taxPercent || 0),
    taxAmount,
    totalAmount,
    currency,
    remarks,
    attachmentName,
    status,
    requestedBy,
    approvedBy,
    approvalNotes,
    createdBy
  };
}

function invoiceDialogBody(record = {}) {
  const shipmentItem = state.shipments.find((row) => row.jobNo === record.shipmentNo) || null;
  const tariffItem = assignedTariffForShipment(shipmentItem) || state.tariffs.find((row) => row.tariffNo === record.tariffNo) || null;
  const customerName = record.customer || shipmentItem?.customer || record.customerName || shipmentItem?.customerName || '';
  let snapshot = {};
  try { snapshot = JSON.parse(record.invoiceSnapshotJson || '{}'); } catch {}
  const taxPercent = Number(record.taxPercent ?? snapshot.taxPercent ?? 0);
  const chargeableWeight = Number(record.chargeableWeight ?? snapshot.chargeableWeight ?? effectiveChargeableWeightForShipment(shipmentItem));
  const grossWeight = Number(record.grossWeight ?? snapshot.grossWeight ?? shipmentItem?.actualKg ?? 0);
  const volumeWeight = Number(record.volumeWeight ?? snapshot.volumeWeight ?? shipmentItem?.cbm ?? 0);
  const lines = parseInvoiceLineItems(record.invoiceLinesJson || JSON.stringify(invoiceLinesFromTariff(shipmentItem, tariffItem, chargeableWeight)));
  const tariffName = record.tariffName || snapshot.tariffName || tariffItem?.customer || '';
  const totals = invoiceTotals(lines, taxPercent);
  const revenue = Number(record.revenue ?? snapshot.revenue ?? totals.revenue);
  const supplierCost = Number(record.supplierCost ?? record.totalCost ?? snapshot.cost ?? totals.cost);
  return (
    input('invoiceNo', 'Invoice No', record.invoiceNo || nextInvoiceNumber(), Boolean(record.invoiceNo)) +
    selectFrom('customer', 'Customer', invoiceCustomerOptions(), customerName) +
    selectFrom('shipmentNo', 'Shipment No', invoiceShipmentOptionsForCustomer(customerName), record.shipmentNo || shipmentItem?.jobNo || '') +
    selectFrom('tariffNo', 'Tariff No', invoiceTariffOptionsForCustomer(customerName), record.tariffNo || tariffItem?.tariffNo || '') +
    tariffPreviewShell('invoice') +
    input('tariffName', 'Tariff Name', tariffName, true) +
    input('chargeableWeight', 'Chargeable Weight', chargeableWeight, true, 'number') +
    input('grossWeight', 'Gross Weight', grossWeight, true, 'number') +
    input('volumeWeight', 'Volume Weight', volumeWeight, true, 'number') +
    selectEditable('currency', 'Currency', 'currency', currencyOptions(), record.currency || snapshot.currency || shipmentItem?.currency || 'KD') +
    input('taxPercent', 'Tax %', taxPercent, false, 'number') +
    (canBillingSalesEntry() ? input('revenue', 'Revenue', revenue, true, 'number') : '') +
    (canBillingCostEntry() ? input('supplierCost', 'Cost', supplierCost, false, 'number') + input('totalCost', 'Total Cost', supplierCost, true, 'number') : '') +
    (canBillingSalesEntry() ? input('taxAmount', 'Tax Amount', totals.taxAmount, true, 'number') + input('grandTotal', 'Grand Total', totals.grandTotal, true, 'number') : '') +
    (canBillingSalesEntry() && canBillingCostEntry() && canViewProfitMargin() ? input('grossProfit', 'Gross Profit', totals.grossProfit, true, 'number') + input('profitPercent', 'Profit %', totals.profitPercent, true, 'number') : '') +
    select('status', 'Status', ['Draft', 'Approved', 'Sent', 'Paid', 'Overdue'], record.status || 'Draft') +
    input('date', 'Date', record.date || today(), false, 'date') +
    '<input type="hidden" name="invoiceLinesJson" value="' + escapeHtml(record.invoiceLinesJson || JSON.stringify(lines)) + '" />' +
    '<input type="hidden" name="tariffSnapshotJson" value="' + escapeHtml(record.tariffSnapshotJson || JSON.stringify(tariffItem || {})) + '" />' +
    '<input type="hidden" name="invoiceSnapshotJson" value="' + escapeHtml(record.invoiceSnapshotJson || JSON.stringify(snapshot || invoiceSnapshotFromSelection(shipmentItem, tariffItem, lines, taxPercent, record.currency || snapshot.currency || shipmentItem?.currency || 'KD'))) + '" />'
  );
}

function invoice(invoiceNo, customer, shipmentNo, revenue, supplierCost, status, date, createdBy = currentUserName()) {

  return { invoiceNo, customer, shipmentNo, revenue, supplierCost, status, date, grossProfit: revenue - supplierCost, createdBy };
}

function quotation(quotationNo, customerName, status = "Draft", date = today(), createdBy = currentUserName()) {
  return {
    quotationNo,
    branch: defaultUserBranch(),
    date,
    customerName,
    customerContactPerson: "",
    customerMobile: "",
    customerEmail: "",
    cargoItemsJson: "[]",
    natureOfGoods: "",
    volumeCategory: "1 CBM = 250 KG",
    cbm: 0,
    actualKg: 0,
    status,
    convertedJobNo: "",
    notes: "",
    createdBy
  };
}

function user(
  userName,
  email,
  role,
  accountStatus,
  branchAccess,
  branchViewScope,
  sectionAccess,
  canViewAllEntry,
  canViewOnlySelfEntry,
  canEditAllEntry,
  canViewUpdatedHistory,
  password = "",
  notes = "Web demo user",
  createdDate = today(),
  hrPortalAccess = false,
  canBillingSalesEntry = true,
  canBillingCostEntry = true,
  erpPortalAccess = true,
  isHrAdmin = false,
  maintenancePortalAccess = false,
  crmPortalAccess = false,
  crmRole = "Sales Executive",
  crmViewAllAccounts = false,
  crmManageAssignments = false,
  crmExportAccess = false,
  crmArchiveAccess = false,
  crmViewTeamReports = false,
  crmAdminAccess = false,
  aiAccess = true
) {
  return {
    userName,
    email,
    role,
    accountStatus,
    branchAccess,
    branchViewScope: normalizeBranchViewScope(branchViewScope),
    sectionAccess,
    canViewAllEntry: isChecked(canViewAllEntry),
    canViewOnlySelfEntry: isChecked(canViewOnlySelfEntry),
    canEditAllEntry: isChecked(canEditAllEntry),
    canViewUpdatedHistory: isChecked(canViewUpdatedHistory),
    password,
    notes,
    createdDate,
    hrPortalAccess: isChecked(hrPortalAccess),
    canBillingSalesEntry: isChecked(canBillingSalesEntry),
    canBillingCostEntry: isChecked(canBillingCostEntry),
    erpPortalAccess: isChecked(erpPortalAccess),
    isHrAdmin: isChecked(isHrAdmin),
    maintenancePortalAccess: isChecked(maintenancePortalAccess),
    crmPortalAccess: isChecked(crmPortalAccess),
    crmRole: crmRole || "Sales Executive",
    crmViewAllAccounts: isChecked(crmViewAllAccounts),
    crmManageAssignments: isChecked(crmManageAssignments),
    crmExportAccess: isChecked(crmExportAccess),
    crmArchiveAccess: isChecked(crmArchiveAccess),
    crmViewTeamReports: isChecked(crmViewTeamReports),
    crmAdminAccess: isChecked(crmAdminAccess),
    aiAccess: isChecked(aiAccess)
  };
}

function audit(dateTime, userName, action, reference, details = "", id = "") {
  return { id, dateTime, user: userName, action, reference, details };
}

function adminRequest(requestNo, requestType, targetModule, referenceNo, requestedBy, status, date, details, proposedValues, approvedBy = "", approvalNotes = "") {
  return { requestNo, requestType, targetModule, referenceNo, requestedBy, status, date, details, proposedValues, approvedBy, approvalNotes };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(stored);
  } catch {
    return normalizeState(null);
  }
}

let saveStateTimer = null;
let columnLayoutHydrated = false;
let lastPersistedColumnLayoutJson = "";
const SAVE_STATE_DEBOUNCE_MS = 200;
const SAVE_STATE_MAX_AUDIT_ROWS = 500;

function saveState() {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    saveStateTimer = null;
    writeStateSnapshot();
  }, SAVE_STATE_DEBOUNCE_MS);
}

function writeStateSnapshot() {
  try {
    const snapshot = Array.isArray(state.audit) && state.audit.length > SAVE_STATE_MAX_AUDIT_ROWS
      ? { ...state, audit: state.audit.slice(0, SAVE_STATE_MAX_AUDIT_ROWS) }
      : state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Could not save local state (it will still be saved to the server):", error);
  }
  persistColumnLayoutToServer();
}

function columnLayoutScopes() {
  return Object.keys(state.ui || {}).filter((key) => {
    if (key === "shipmentRegisterColumns" || key === "dashboardShipmentColumns" || key === "customerShipmentHistoryColumns") return true;
    return key.startsWith("columnSettings_");
  });
}

const DASHBOARD_LAYOUT_STORAGE_KEY = "apollo.dashboard.columns.v3";

function readDashboardLayoutSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializeColumnLayout() {
  const layouts = {};
  columnLayoutScopes().forEach((key) => {
    const value = state.ui[key];
    if (value && typeof value === "object") layouts[key] = value;
  });
  return JSON.stringify({
    version: 1,
    layouts,
    columnWidths: state.ui.columnWidths || {},
    columnWidthsLocked: state.ui.columnWidthsLocked || {},
    dashboardLayout: readDashboardLayoutSnapshot()
  });
}

function parseColumnLayoutJson(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hydrateColumnLayoutFromServer(value) {
  const snapshot = parseColumnLayoutJson(value);
  const layouts = snapshot.layouts && typeof snapshot.layouts === "object" ? snapshot.layouts : {};
  Object.entries(layouts).forEach(([key, layout]) => {
    if (!layout || typeof layout !== "object" || !Array.isArray(layout.order)) return;
    state.ui[key] = {
      order: layout.order.slice(),
      visible: { ...(layout.visible || {}) }
    };
  });
  if (snapshot.columnWidths && typeof snapshot.columnWidths === "object") {
    state.ui.columnWidths = { ...(state.ui.columnWidths || {}), ...snapshot.columnWidths };
  }
  if (snapshot.columnWidthsLocked && typeof snapshot.columnWidthsLocked === "object") {
    state.ui.columnWidthsLocked = { ...(state.ui.columnWidthsLocked || {}), ...snapshot.columnWidthsLocked };
  }
  if (snapshot.dashboardLayout && typeof snapshot.dashboardLayout === "object") {
    try { localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(snapshot.dashboardLayout)); } catch {}
    window.apolloDashboardLayout?.init?.();
  }
  lastPersistedColumnLayoutJson = String(value || "{}");
}

function persistColumnLayoutToServer() {
  if (!columnLayoutHydrated || !state.settings?.settingsKey) return;
  const columnLayoutJson = serializeColumnLayout();
  if (columnLayoutJson === lastPersistedColumnLayoutJson) return;
  state.settings.columnLayoutJson = columnLayoutJson;
  lastPersistedColumnLayoutJson = columnLayoutJson;
  persistRecord("settings", {
    settingsKey: state.settings.settingsKey || "default",
    columnLayoutJson
  }).then((saved) => {
    if (!saved) lastPersistedColumnLayoutJson = "";
  }).catch((error) => {
    lastPersistedColumnLayoutJson = "";
    console.warn("Could not persist register column settings", error);
  });
}

window.apolloPersistColumnLayout = persistColumnLayoutToServer;

window.addEventListener("beforeunload", () => {
  if (saveStateTimer) {
    clearTimeout(saveStateTimer);
    saveStateTimer = null;
    writeStateSnapshot();
  }
});

function parseDropdownOptions(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeState(stored) {
  const defaults = seedState();
  if (!stored || typeof stored !== "object") {
    defaults.users = normalizeUsers(defaults.users);
    return defaults;
  }

  const normalized = {
    ...defaults,
    ...stored,
    shipments: Array.isArray(stored.shipments) && stored.shipments.length ? stored.shipments : defaults.shipments,
    loads: Array.isArray(stored.loads) && stored.loads.length ? stored.loads : defaults.loads,
    customers: Array.isArray(stored.customers) && stored.customers.length ? stored.customers : defaults.customers,
    suppliers: Array.isArray(stored.suppliers) && stored.suppliers.length ? stored.suppliers : defaults.suppliers,
    tariffs: Array.isArray(stored.tariffs) && stored.tariffs.length ? stored.tariffs : defaults.tariffs,
    documents: Array.isArray(stored.documents) ? stored.documents : defaults.documents,
    additionalCharges: Array.isArray(stored.additionalCharges) ? stored.additionalCharges : defaults.additionalCharges,
    invoices: Array.isArray(stored.invoices) ? stored.invoices : defaults.invoices,
    quotations: Array.isArray(stored.quotations) ? stored.quotations : defaults.quotations,
    shipmentRequests: Array.isArray(stored.shipmentRequests) ? stored.shipmentRequests : defaults.shipmentRequests,
    shipmentStatusHistory: Array.isArray(stored.shipmentStatusHistory) ? stored.shipmentStatusHistory : defaults.shipmentStatusHistory,
    users: normalizeUsers(Array.isArray(stored.users) && stored.users.length ? stored.users : defaults.users),
    customerUsers: Array.isArray(stored.customerUsers) ? stored.customerUsers : defaults.customerUsers,
    unblockRequests: Array.isArray(stored.unblockRequests) ? stored.unblockRequests : defaults.unblockRequests,
    adminRequests: Array.isArray(stored.adminRequests) ? stored.adminRequests : defaults.adminRequests,
    audit: Array.isArray(stored.audit) ? stored.audit : defaults.audit,
    employees: Array.isArray(stored.employees) ? stored.employees : defaults.employees,
    leaveRequests: Array.isArray(stored.leaveRequests) ? stored.leaveRequests : defaults.leaveRequests,
    payslips: Array.isArray(stored.payslips) ? stored.payslips : defaults.payslips,
    hrAnnouncements: Array.isArray(stored.hrAnnouncements) ? stored.hrAnnouncements : defaults.hrAnnouncements,
    hrAnnouncementReadIds: stored.hrAnnouncementReadIds && typeof stored.hrAnnouncementReadIds === "object" && !Array.isArray(stored.hrAnnouncementReadIds) ? stored.hrAnnouncementReadIds : defaults.hrAnnouncementReadIds,
    settings: {
      ...defaults.settings,
      ...(stored.settings || {})
    },
    dropdownOptions: {
      ...defaults.dropdownOptions,
      ...parseDropdownOptions((stored.settings || {}).dropdownOptionsJson),
      ...(stored.dropdownOptions || {})
    },
    api: {
      ...defaults.api,
      ...(stored.api || {})
    },
    ui: {
      ...defaults.ui,
      ...(stored.ui || {}),
      selectedLoadNo: (stored.ui || {}).selectedLoadNo || "",
      chargeFilters: {
        shipmentNo: "",
        chargeType: "All",
        supplier: "All",
        status: "All",
        fromDate: "",
        toDate: "",
        ...((stored.ui || {}).chargeFilters || {})
      },
      auditFilters: {
        query: "",
        fromDate: "",
        toDate: "",
        ...((stored.ui || {}).auditFilters || {})
      },
      adminBranchFilter: Object.prototype.hasOwnProperty.call(stored.ui || {}, "adminBranchFilter") && Array.isArray((stored.ui || {}).adminBranchFilter)
        ? (stored.ui || {}).adminBranchFilter
        : null
    }
  };
  return normalized;
}

function normalizeUsers(users) {
  return (Array.isArray(users) ? users : []).map((record) => ({
    ...record,
    sectionAccess: normalizeSectionAccess(record.sectionAccess || "All"),
    branchViewScope: normalizeBranchViewScope(record.branchViewScope || record.branch_view_scope || record.viewScope || "Assigned Branch Only"),
    canViewAllEntry: isChecked(record.canViewAllEntry),
    canViewOnlySelfEntry: isChecked(record.canViewOnlySelfEntry),
    canEditAllEntry: isChecked(record.canEditAllEntry),
    canViewUpdatedHistory: isChecked(record.canViewUpdatedHistory),
    canBillingSalesEntry: record.canBillingSalesEntry === undefined ? true : isChecked(record.canBillingSalesEntry),
    canBillingCostEntry: record.canBillingCostEntry === undefined ? true : isChecked(record.canBillingCostEntry),
    aiAccess: isChecked(record.aiAccess ?? record.ai_access)
  }));
}

function normalizeBranchViewScope(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["all branches", "all branch", "all", "both"].includes(text)) return "All Branches";
  return "Assigned Branch Only";
}

function normalizeSectionAccess(value) {
  const text = String(value || "All").trim();
  if (!text || text.toLowerCase() === "all") return "All";
  const sections = text
    .split(",")
    .map((item) => normalizeModuleName(item.trim()))
    .filter(Boolean);
  return [...new Set(sections)].join(", ") || "Dashboard";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function today() {
  return localDate();
}

function localDate(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function localDateTime(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16).replace("T", " ");
}

function localDateTimeInput(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function nextNumber(prefix, collection, field) {
  const max = collection
    .map((item) => String(item[field] || ""))
    .map((value) => Number(value.replace(/\D/g, "").slice(-4)) || 0)
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `${prefix}-${new Date().toISOString().slice(2, 7).replace("-", "")}${String(max + 1).padStart(4, "0")}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function configuredNumber(format, collection, field, fallbackPrefix, serialStart = 1) {
  const normalizedFormat = String(format || "").trim();
  if (!normalizedFormat || !normalizedFormat.includes("#")) {
    return nextNumber(fallbackPrefix, collection, field);
  }

  const fullYear = new Date().getFullYear().toString();
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const resolvedFormat = normalizedFormat.replaceAll("YYYY", fullYear).replaceAll("YY", year).replaceAll("MM", month);
  const hashPattern = resolvedFormat.match(/#+/);
  if (!hashPattern) return nextNumber(fallbackPrefix, collection, field);

  const digits = hashPattern[0].length;
  const prefix = resolvedFormat.slice(0, hashPattern.index);
  const suffix = resolvedFormat.slice(hashPattern.index + digits);
  const numberPattern = new RegExp(`^${escapeRegex(prefix)}(\\d{${digits},})${escapeRegex(suffix)}$`, "i");
  const startingNumber = Math.max(1, Number(serialStart) || 1);
  const max = collection
    .map((item) => String(item[field] || ""))
    .map((value) => {
      const match = value.match(numberPattern);
      return match ? Number(match[1]) || 0 : 0;
    })
    .reduce((highest, value) => Math.max(highest, value), startingNumber - 1);

  return resolvedFormat
    .replace(/#+/, String(max + 1).padStart(digits, "0"));
}

function shipmentNumberFormatForBranch(branch) {
  return normalizeBranchName(branch) === "Dubai"
    ? state.settings.dubaiShipmentNumberFormat || "AFS-#####/MM/DBX/{SERVICE}"
    : state.settings.kuwaitShipmentNumberFormat || "AFS-#####/MM/KWI/{SERVICE}";
}

function shipmentSerialStartForBranch(branch) {
  const raw = normalizeBranchName(branch) === "Dubai"
    ? state.settings.dubaiShipmentSerialStart
    : state.settings.kuwaitShipmentSerialStart;
  return Math.max(1, Number(raw) || 1);
}

function shipmentServiceCode(service) {
  const normalized = String(service || "").trim().toUpperCase();
  return normalized === "CONSOLIDATION" || normalized === "CONSOLADATION" ? "CO" : normalized;
}

function nextShipmentNumber(branch = defaultUserBranch(), service = "") {
  const normalizedBranch = normalizeBranchName(branch);
  const serviceCode = shipmentServiceCode(service);
  const format = shipmentNumberFormatForBranch(normalizedBranch);
  const fullYear = new Date().getFullYear().toString();
  const year = fullYear.slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const resolvedFormat = String(format).replaceAll("YYYY", fullYear).replaceAll("YY", year).replaceAll("MM", month);
  const hashPattern = resolvedFormat.match(/#+/);
  if (!hashPattern) return configuredNumber(state.settings.shipmentNumberFormat, state.shipments, "jobNo", "AFS");

  const digits = hashPattern[0].length;
  const prefix = resolvedFormat.slice(0, hashPattern.index);
  const suffix = resolvedFormat.slice(hashPattern.index + digits);
  const suffixPattern = escapeRegex(suffix).replace("\\{SERVICE\\}", "[A-Za-z0-9]+") || "";
  const numberPattern = new RegExp(`^${escapeRegex(prefix)}(\\d{${digits},})${suffixPattern}$`, "i");
  const max = state.shipments
    .filter((item) => normalizeBranchName(item.branch || "") === normalizedBranch)
    .map((item) => String(item.jobNo || "").match(numberPattern))
    .map((match) => match ? Number(match[1]) || 0 : 0)
    .reduce((highest, value) => Math.max(highest, value), shipmentSerialStartForBranch(normalizedBranch) - 1);

  return resolvedFormat
    .replace(/#+/, String(max + 1).padStart(digits, "0"))
    .replaceAll("{SERVICE}", serviceCode);
}

function nextInvoiceNumber() {
  return configuredNumber(state.settings.invoiceNumberFormat, state.invoices, "invoiceNo", "INV");
}

function nextQuotationNumber() {
  return configuredNumber(state.settings.quotationNumberFormat, state.quotations, "quotationNo", "QUO");
}

function nextAirwayBillNumber() {
  return configuredNumber(state.settings.awbNumberFormat, state.shipments, "airwayBillNo", "AWB", state.settings.awbSerialStart || 262035);
}

function nextConsolidationNumber() {
  return configuredNumber(state.settings.consolidationNumberFormat, state.loads, "loadNo", "CON");
}

function nextTcnNumber() {
  return configuredNumber(state.settings.tcnNumberFormat, state.shipments, "tcnNumber", "TCN");
}

function nextDeliveryNoteNumber() {
  return configuredNumber(state.settings.deliveryNoteNumberFormat, state.shipments, "deliveryNoteNo", "POD");
}

function nextCustomerNumber() {
  return configuredNumber(state.settings.customerNumberFormat, state.customers, "code", "CUS");
}

function nextSupplierNumber() {
  return configuredNumber(state.settings.supplierNumberFormat, state.suppliers, "code", "TRN");
}

function nextAdditionalChargeNumber() {
  return configuredNumber(state.settings.additionalChargeNumberFormat, state.additionalCharges, "refNo", "CHG");
}

function branchOptions() {
  return CANONICAL_BRANCHES.slice();
}

function creditLimitOptions() {
  return ["15 Days", "30 Days", "45 Days"];
}

function customerStatusOptions() {
  return ["Active", "Inactive"];
}

function normalizedCreditLimit(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return { "15 days": "15 Days", "30 days": "30 Days", "45 days": "45 Days" }[normalized] || "15 Days";
}

function normalizedCustomerStatus(value = "") {
  return String(value || "").trim().toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function defaultUserBranch() {
  const access = String(currentSession()?.branchAccess || "").trim();
  if (access && !["both", "all"].includes(access.toLowerCase())) {
    const normalized = normalizeBranchName(access);
    if (CANONICAL_BRANCHES.includes(normalized)) return normalized;
  }
  return branchOptions()[0];
}

function recordDate(record) {
  return record.bookingDate || record.tripDate || record.date || record.createdDate || record.effectiveFrom || record.dateTime?.slice(0, 10) || "";
}

function filteredRows(rows) {
  const query = globalSearch.value.trim().toLowerCase();
  const from = fromDate.value;
  const to = toDate.value;
  return rows.filter((row) => {
    const date = recordDate(row);
    const derivedSearchText = row?.type === "POD" ? documentLinkedToText(row) : "";
    const textMatch = !query || `${Object.values(row).join(" ")} ${derivedSearchText}`.toLowerCase().includes(query);
    const fromMatch = !from || !date || date >= from;
    const toMatch = !to || !date || date <= to;
    return textMatch && fromMatch && toMatch && adminBranchFilterMatch(row);
  });
}

function shipmentStatusKey(status) { return String(status || "").trim().toLowerCase().replace(/[\s_-]+/g, " "); }
function shipmentIsPartiallyDelivered(row) { return shipmentStatusKey(row?.status) === "partially delivered"; }
// Deliberately excludes "Partially Delivered" even though it contains the substring "delivered" -
// a shipment still owed pieces is not fully delivered, and should keep showing delay alerts / an
// "In Transit"-like badge rather than being treated the same as a fully Delivered shipment.
function shipmentIsDelivered(row) { return !shipmentIsPartiallyDelivered(row) && /delivered|completed|closed|invoiced/.test(shipmentStatusKey(row.status)); }
// Strict "Status = Delivered" check (exact match only) used by the Closed Jobs / read-only /
// delivered-exclusion rules below. Deliberately separate from the looser shipmentIsDelivered()
// above (which also matches completed/closed/invoiced and drives unrelated alert/arrival logic)
// so those existing behaviors are not touched.
function shipmentStatusIsDelivered(row) { return shipmentStatusKey(row?.status) === "delivered"; }
function shipmentIsInTransit(row) { return shipmentStatusKey(row?.status) === "in transit"; }
function shipmentIsOpen(row) { return ["draft", "booked"].includes(shipmentStatusKey(row?.status)); }
function shipmentPodIsUploaded(row) { return String(row?.podStatus || "").trim().toLowerCase() === "uploaded"; }
// Pending POD must be based on the actual uploaded POD document, not only the legacy
// shipment-level podStatus field. Older records can have a stale/blank podStatus even though
// their signed POD is present in Documents; shipmentHasLiveUploadedPod also handles documents
// linked through the shipment's AWB and excludes synchronization backfill artifacts.
function shipmentNeedsPendingPod(row) { return shipmentStatusIsDelivered(row) && !shipmentHasLiveUploadedPod(row); }
function shipmentInvoiceRecord(row) {
  const jobNo = String(row?.jobNo || "").trim().toLowerCase();
  return (state.invoices || []).find((invoiceRow) => String(invoiceRow?.shipmentNo || "").trim().toLowerCase() === jobNo);
}
function shipmentHasApprovedInvoice(row) {
  return String(shipmentInvoiceRecord(row)?.status || "").trim().toLowerCase() === "approved";
}
function shipmentIsUnbilled(row) {
  const linkedInvoice = shipmentInvoiceRecord(row);
  if (linkedInvoice && shipmentHasApprovedInvoice(row)) return false;
  const invoiceStatus = String(linkedInvoice?.status || row?.invoiceStatus || "").trim().toLowerCase();
  return ["unbilled", "draft", "missing rate"].includes(invoiceStatus);
}
function shipmentHasLiveUploadedPod(row) {
  const jobNo = String(row?.jobNo || "").trim().toLowerCase();
  const airwayBillNo = String(row?.airwayBillNo || "").trim().toLowerCase();
  if (!jobNo && !airwayBillNo) return false;
  // The shipment-level flag is written by the live POD upload endpoint and is also returned
  // with the shipment after a successful upload. Keep it as a trusted fast path so a valid POD
  // is not shown as pending when the document list is still catching up or a legacy record has
  // a split-linked document that is not directly linked by job number.
  if (shipmentPodIsUploaded(row)) return true;
  const splitDocumentNos = new Set(parsePodSplits(row?.podSplitsJson)
    .map((split) => String(split?.documentNo || "").trim().toLowerCase())
    .filter(Boolean));
  return (state.documents || []).some((document) => {
    if (String(document?.type || "").trim().toLowerCase() !== "pod") return false;
    if (String(document?.status || "").trim().toLowerCase() !== "uploaded") return false;
    if (!String(document?.storageUrl || "").trim()) return false;
    // Historical AWB backfill rows carry status/file values but are synchronization artifacts,
    // not distinct user uploads. Do not let them inflate the live Closed Jobs KPI.
    const documentNo = String(document?.documentNo || "").trim();
    if (/^POD-AWB-BACKFILL-/i.test(documentNo)) return false;
    if (splitDocumentNos.has(documentNo.toLowerCase())) return true;
    const linkedNo = String(document?.linkedNo || "").trim().toLowerCase();
    if (linkedNo === jobNo) return true;
    if (!airwayBillNo) return false;
    const linkedShipment = (state.shipments || []).find((shipment) => String(shipment?.jobNo || "").trim().toLowerCase() === linkedNo);
    return String(linkedShipment?.airwayBillNo || "").trim().toLowerCase() === airwayBillNo;
  });
}
// "Closed Job" = Delivered status AND POD Uploaded AND a live uploaded POD file exists for the
// shipment's AWB group. This prevents status-only/backfill rows from inflating the Dashboard KPI.
function shipmentIsClosedJob(row) {
  return shipmentStatusIsDelivered(row) && shipmentPodIsUploaded(row) && shipmentHasLiveUploadedPod(row);
}
// A normal (non-admin) user may edit a Delivered shipment until its POD is uploaded.
// Once both conditions are complete, it becomes a Closed Job and only Admin can edit it.
function shipmentIsReadOnlyForCurrentUser(row) { return shipmentIsClosedJob(row) && !isAdminSession(); }
function shipmentIsCancelled(row) { return /cancelled|returned|damaged/.test(shipmentStatusKey(row.status)); }
// A partially delivered shipment has, by definition, already started arriving/being delivered -
// counts as "arrived" for Arrival Overdue purposes even though shipmentIsDelivered() now excludes it.
function shipmentHasArrived(row) { return shipmentIsDelivered(row) || shipmentIsPartiallyDelivered(row) || /arrived|destination warehouse|out for delivery/.test(shipmentStatusKey(row.status)); }
function shipmentDateValue(value) { const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? null : date; }
function shipmentDelayAlerts(row) {
  if (shipmentIsDelivered(row) || shipmentIsCancelled(row)) return [];
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const alerts = [];
  const arrivalDate = row.expectedArrivalDate || row.arrivalDate || (Number(row.transitDays || 0) ? (() => { const start = shipmentDateValue(row.shipmentDate || row.bookingDate); if (!start) return ""; start.setDate(start.getDate() + Number(row.transitDays)); return start.toISOString().slice(0, 10); })() : "");
  [["Arrival Overdue", arrivalDate, shipmentHasArrived(row)], ["Delivery Overdue", row.expectedDeliveryDate || row.deliveryDate, false]].forEach(([kind, dueDate, reached]) => {
    const due = shipmentDateValue(dueDate);
    if (!reached && due && due < todayDate) alerts.push({ kind, due: String(dueDate).slice(0, 10), days: Math.max(1, Math.round((todayDate - due) / 86400000)) });
  });
  return alerts;
}
function shipmentStatusIcon(status) {
  const icons = { "shipment created":"📝", "booking confirmed":"✅", "pickup scheduled":"📅", "driver assigned":"👨‍✈️", "pickup started":"🚚", "pickup completed":"📦", "warehouse received":"🏢", "warehouse processing":"📋", "customs submitted":"📄", "customs inspection":"🔍", "customs cleared":"🛃", "waiting for flight":"⏳", "flight departed":"✈️", "vessel departed":"🚢", "train departed":"🚆", "in transit":"🚛", "border crossed":"🌍", "arrived at destination":"📍", "destination warehouse":"🏬", "out for delivery":"🚐", "delivery attempt":"🚪", "delivered":"🎉", "partially delivered":"🟡", "proof of delivery uploaded":"📷", "completed":"✔️", "delayed":"⏰", "on hold":"⏸️", "exception":"⚠️", "damaged cargo":"📦⚠️", "returned":"↩️", "cancelled":"❌" };
  const key = shipmentStatusKey(status); return icons[key] || (key.includes("delivered") ? "🎉" : key.includes("transit") ? "🚛" : "📦");
}
function shipmentVisualState(row) {
  const alerts = shipmentDelayAlerts(row);
  if (shipmentIsCancelled(row)) return { key: "cancelled", label: "Cancelled", icon: "❌" };
  if (alerts.some((alert) => alert.kind === "Delivery Overdue")) return { key: "delivery-overdue", label: "Delivery Overdue", icon: "🚩" };
  if (alerts.some((alert) => alert.kind === "Arrival Overdue")) return { key: "arrival-overdue", label: "Arrival Overdue", icon: "🚩" };
  if (/delayed|on hold|exception/.test(shipmentStatusKey(row.status))) return { key: "delayed", label: "Delayed", icon: "⏰" };
  if (shipmentIsPartiallyDelivered(row)) return { key: "partially-delivered", label: "Partially Delivered", icon: "🟡" };
  if (shipmentIsDelivered(row)) return { key: "delivered", label: "Delivered", icon: "✅" };
  if (/in transit|dispatched|departed/.test(shipmentStatusKey(row.status))) return { key: "in-transit", label: "In Transit", icon: "🚚" };
  return { key: "on-time", label: "On Time", icon: "●" };
}

// A transfer stays as one shipment record. The receiving branch is derived from the destination
// already entered during shipment creation, so existing live shipments need no data migration.
function shipmentReceivingBranch(row) {
  const explicit = normalizeBranchName(row.receivingBranch || row.destinationBranch || "");
  if (CANONICAL_BRANCHES.includes(explicit)) return explicit;
  const destination = String(row.destination || row.deliveryLocation || "").trim().toLowerCase();
  if (/\b(dubai|dxb)\b/.test(destination)) return "Dubai";
  if (/\b(kuwait|kwi|kwt)\b/.test(destination)) return "Kuwait HO";
  return "";
}

function isBranchTransferStatus(status) {
  return /dispatched|in[\s-]?transit|departed/.test(shipmentStatusKey(status));
}

function incomingShipmentsForCurrentBranch() {
  if (canViewAllBranches()) return state.shipments.filter((row) => isBranchTransferStatus(row.status) && shipmentReceivingBranch(row));
  const access = String(currentSession()?.branchAccess || defaultUserBranch());
  const branches = access.split(",").map(normalizeBranchName).filter((value) => CANONICAL_BRANCHES.includes(value));
  return state.shipments.filter((row) => isBranchTransferStatus(row.status) && branches.includes(shipmentReceivingBranch(row)));
}

function incomingShipmentPanel() {
  const rows = incomingShipmentsForCurrentBranch();
  const branchLabel = canViewAllBranches() ? "All receiving branches" : String(currentSession()?.branchAccess || defaultUserBranch());
  return `<section class="split-grid single-panel incoming-shipment-panel"><article class="panel">${panelHeader("Upcoming / Incoming Shipments", branchLabel)}<p class="empty-state">Shipments appear here after they are marked Dispatched, In Transit, or Departed for Kuwait/KWI or Dubai/DXB. Status updates here change the same main shipment record.</p>${shipmentStatusTable(rows)}</article></section>`;
}

function maybePlayAdminNotification() {
  const pending = pendingRequestCount();
  if (isAdminSession() && lastPendingNotificationCount > 0 && pending > lastPendingNotificationCount) {
    playBeep();
  }
  lastPendingNotificationCount = pending;
}

function playBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
    oscillator.onended = () => audioContext.close().catch(() => {});
  } catch {}
}

async function addHistory(action, reference, details = "") {
  const record = audit(localDateTime(), currentUserName(), action, reference, details);
  state.audit.unshift(record);
  saveState();
  const saved = await postRecord("audit", record);
  if (saved && typeof saved === "object" && saved.id !== undefined && saved.id !== null && saved.id !== "") {
    record.id = String(saved.id);
    saveState();
  }
}

function recalculateLoad(loadItem) {
  const jobs = loadItem.jobNumbers.split(",").map((job) => job.trim()).filter(Boolean);
  const linked = state.shipments.filter((shipmentItem) => jobs.includes(shipmentItem.jobNo));
  loadItem.pieces = linked.reduce((sum, item) => sum + Number(item.pieces || 0), 0);
  loadItem.actualKg = linked.reduce((sum, item) => sum + Number(item.actualKg || 0), 0);
  loadItem.cbm = linked.reduce((sum, item) => sum + Number(item.cbm || 0), 0);
  loadItem.chargeableKg = linked.reduce((sum, item) => sum + Number(item.chargeableKg || 0), 0);
}

async function syncManifestShipmentStatuses(loadItem) {
  const status = String(loadItem?.status || "").trim();
  const jobs = String(loadItem?.jobNumbers || "").split(",").map((job) => job.trim()).filter(Boolean);
  if (!status || !jobs.length) return 0;
  const linkedShipments = state.shipments.filter((shipmentItem) => jobs.includes(shipmentItem.jobNo) && shipmentItem.status !== status);
  let updatedCount = 0;
  for (const shipmentItem of linkedShipments) {
    const saved = await persistRecord("shipment", { ...shipmentItem, status });
    if (saved) {
      shipmentItem.status = status;
      updatedCount += 1;
    }
  }
  if (updatedCount) addHistory("Updated shipment statuses from manifest", `${loadItem.loadNo} - ${status} (${updatedCount} shipments)`);
  return updatedCount;
}

async function boot() {
  renderModuleNav();

  moduleNav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-module]");
    if (!button) return;
    activeModule = button.dataset.module;
    // The navigation item always starts a brand-new customer request. Editing is
    // available only by opening the specific Sent Back request number.
    if (activeModule === "Customer New Shipment") state.ui.customerRequestEditNo = "";
    render();
  });

  portalAccessPanel?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-portal-switch]");
    if (!button) return;
    switchPortal(button.dataset.portalSwitch);
  });
  loginForm.addEventListener("submit", handleLogin);
  loginForm.querySelectorAll("[data-login-mode-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const modeField = loginForm.querySelector("#loginModeField");
      if (modeField) modeField.value = button.dataset.loginModeOption || "company";
      loginForm.querySelectorAll("[data-login-mode-option]").forEach((option) => {
        const active = option === button;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
  });
  logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    stopSharedShipmentRefresh();
    showLogin();
  });
  changePasswordButton?.addEventListener("click", openChangePasswordDialog);
  globalSearch.addEventListener("input", render);
  applyFilters.addEventListener("click", render);
  branchFilterPanel?.addEventListener("change", handleAdminBranchFilterChange);
  resetFilters.addEventListener("click", () => {
    globalSearch.value = "";
    fromDate.value = "";
    toDate.value = "";
    state.ui.adminBranchFilter = ["Both"];
    saveState();
    render();
  });
  newShipmentButton?.addEventListener("click", openShipmentWorkspace);
  resetPasswordButton.addEventListener("click", handlePasswordReset);
  loginForm.querySelector("[data-toggle-password]")?.addEventListener("click", toggleLoginPassword);
  moduleContent.addEventListener("click", handleModuleClick);
  moduleContent.addEventListener("click", handleModuleLinkClick);
  moduleContent.addEventListener("input", handleColumnFilterInput);
  moduleContent.addEventListener("input", (event) => {
    const recordSelector = event.target.closest("[data-load-select], [data-delete-select]");
    if (!recordSelector) return;
    const type = recordSelector.dataset.loadSelect || recordSelector.dataset.deleteSelect;
    if (!type) return;
    const value = String(recordSelector.value || "").trim();
    if (!collectionFor(type).some((row) => String(rowId(type, row)) === value)) return;
    state.ui.selectedRecordSelectors = state.ui.selectedRecordSelectors || {};
    state.ui.selectedRecordSelectors[type] = value;
    if (recordSelector.dataset.loadSelect === "shipment") state.ui.activeShipmentNo = value;
    saveState();
  });
  // Dashboard metric tables live inside the reusable record dialog rather than moduleContent.
  // Delegate the same filter handler there so their filter boxes work like register filters.
  recordDialog?.addEventListener("input", handleColumnFilterInput);
  moduleContent.addEventListener("input", handleShipmentQuickOpenInput);
  moduleContent.addEventListener("mousedown", handleColumnResizeStart);
  moduleContent.addEventListener("dragstart", handleShipmentColumnDragStart);
  moduleContent.addEventListener("dragover", handleShipmentColumnDragOver);
  moduleContent.addEventListener("drop", handleShipmentColumnDrop);
  moduleContent.addEventListener("keydown", handleModuleKeydown);
  moduleContent.addEventListener("submit", handleModuleSubmit);
  moduleContent.addEventListener("change", (event) => {
    const recordSelector = event.target.closest("[data-load-select], [data-delete-select]");
    if (recordSelector) {
      state.ui.selectedRecordSelectors = state.ui.selectedRecordSelectors || {};
      const type = recordSelector.dataset.loadSelect || recordSelector.dataset.deleteSelect;
      const value = String(recordSelector.value || "").trim();
      if (collectionFor(type).some((row) => String(rowId(type, row)) === value)) {
        state.ui.selectedRecordSelectors[type] = value;
        if (recordSelector.dataset.loadSelect === "shipment") state.ui.activeShipmentNo = value;
      }
      saveState();
    }
    const activityFilter = event.target.closest("[data-customer-activity-filter]");
    if (activityFilter) {
      state.ui.customerActivityFilter = activityFilter.value || "All";
      saveState();
      render();
      return;
    }
    const statusSelect = event.target.closest("form[data-form='status'] [name='status']");
    if (!statusSelect) return;
    const field = statusSelect.closest("form").querySelector("[data-expected-arrival-field]");
    if (!field) return;
    field.hidden = !isBranchTransferStatus(statusSelect.value);
  });
  recordDialog.addEventListener("click", handleModuleClick);
  recordDialog.addEventListener("click", handleModuleLinkClick);
  recordDialog.addEventListener("mousedown", handleColumnResizeStart);
  recordDialog.addEventListener("keydown", handleModuleKeydown);
  dialogSecondary.addEventListener("click", () => dialogState?.onSecondary?.());
  dialogMinimize?.addEventListener("click", toggleDialogMinimized);
  dialogMaximize?.addEventListener("click", toggleDialogMaximized);
  dialogClose?.addEventListener("click", () => recordDialog.close());
  dialogSave.addEventListener("click", saveDialogRecord);
  const syncDialogHeaderSave = () => {
    if (!dialogHeaderSave) return;
    dialogHeaderSave.textContent = dialogSave.textContent;
    dialogHeaderSave.disabled = dialogSave.disabled;
    const isShipmentDialog = /shipment/i.test(`${dialogType.textContent} ${dialogTitle.textContent}`);
    dialogHeaderSave.classList.toggle("is-hidden", dialogSave.classList.contains("is-hidden") || !isShipmentDialog);
    dialogHeaderVerified?.classList.toggle("is-hidden", !isShipmentDialog);
  };
  dialogHeaderSave?.addEventListener("click", saveDialogRecord);
  syncDialogHeaderSave();
  new MutationObserver(syncDialogHeaderSave).observe(dialogSave, { attributes: true, childList: true, characterData: true, subtree: true });
  recordDialog.addEventListener("close", () => {
    if (skipNextDialogCloseReset) {
      skipNextDialogCloseReset = false;
      return;
    }
    resetDialogShell();
  });
  document.addEventListener("focus", handleDropdownFocus, true);
  document.addEventListener("pointerdown", handleDropdownPointerDown, true);
  document.addEventListener("input", handleDropdownInput, true);
  document.addEventListener("keydown", handleDropdownKeydown, true);
  document.addEventListener("blur", handleDropdownBlur, true);
  document.addEventListener("pointerdown", handleDocumentPointerDown, false);

  if (currentSession()) {
    showApp();
  } else {
    try {
      const restored = await restoreHandoffSession();
      if (restored) showApp();
      else showLogin();
    } catch {
      showLogin();
    }
  }
}

function handleDropdownFocus(event) {
  const field = event.target.closest?.("[data-dropdown-input]");
  if (!field || field.readOnly) return;
  selectDropdownText(field);
  window.setTimeout(() => openDropdownMenu(field), 0);
}

function handleDropdownPointerDown(event) {
  const field = event.target.closest?.("[data-dropdown-input]");
  if (!field || field.readOnly) return;
  window.setTimeout(() => {
    selectDropdownText(field);
    openDropdownMenu(field);
  }, 0);
}

function handleDropdownInput(event) {
  const field = event.target.closest?.("[data-dropdown-input]");
  if (!field || field.readOnly) return;
  field.dataset.dropdownSelected = "0";
  openDropdownMenu(field);
}

function handleDropdownKeydown(event) {
  const field = event.target.closest?.("[data-dropdown-input]");
  if (!field || field.readOnly || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Escape") {
    closeDropdownMenu();
    return;
  }
  if (event.key.length !== 1) return;
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  if (start === 0 && end === field.value.length) {
    field.dataset.dropdownSelected = "0";
    return;
  }
  if (field.dataset.dropdownSelected !== "1") return;
  field.dataset.dropdownSelected = "0";
  field.value = "";
}

function selectDropdownText(field) {
  field.dataset.dropdownSelected = "1";
  field.select?.();
}

function dropdownOptionsForField(field) {
  const listId = field.getAttribute("list");
  const datalist = listId ? document.getElementById(listId) : null;
  return Array.from(datalist?.options || [])
    .map((option) => ({
      value: option.value || "",
      label: option.label || option.value || ""
    }))
    .filter((option) => option.value);
}

function openDropdownMenu(field) {
  const options = dropdownOptionsForField(field);
  closeDropdownMenu();
  if (!options.length) return;

  const query = String(field.value || "").trim().toLowerCase();
  const visibleOptions = options
    .filter((option) => !query || `${option.value} ${option.label}`.toLowerCase().includes(query))
    .slice(0, 80);

  if (!visibleOptions.length) return;

  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  menu.dataset.dropdownMenu = "1";
  menu.innerHTML = visibleOptions.map((option) => `
    <button type="button" data-dropdown-value="${escapeHtml(option.value)}">
      <strong>${escapeHtml(option.value)}</strong>
      ${option.label && option.label !== option.value ? `<span>${escapeHtml(option.label)}</span>` : ""}
    </button>
  `).join("");

  menu.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const button = event.target.closest("[data-dropdown-value]");
    if (!button) return;
    field.value = button.dataset.dropdownValue || "";
    field.dataset.dropdownSelected = "0";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    closeDropdownMenu();
    field.focus();
  });

  document.body.appendChild(menu);
  activeDropdownMenu = menu;
  positionDropdownMenu(field, menu);
}

function positionDropdownMenu(field, menu) {
  const rect = field.getBoundingClientRect();
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.width = `${rect.width}px`;
}

function closeDropdownMenu() {
  activeDropdownMenu?.remove();
  activeDropdownMenu = null;
}

function handleDocumentPointerDown(event) {
  if (!activeDropdownMenu) return;
  if (event.target.closest?.("[data-dropdown-menu]") || event.target.closest?.("[data-dropdown-input]")) return;
  closeDropdownMenu();
}

function handleDropdownBlur(event) {
  const field = event.target.closest?.("[data-dropdown-input]");
  if (!field) return;
  rememberDropdownOptions({ [field.dataset.dropdownKey || field.name]: field.value });
  window.setTimeout(() => {
    if (document.activeElement !== field) closeDropdownMenu();
  }, 120);
}

function isCustomerSession() {
  return String(currentSession()?.portal || "").toLowerCase() === "customer";
}

function isHrSession() {
  return String(currentSession()?.portal || "").toLowerCase() === "employee";
}

function isCrmSession() {
  return String(currentSession()?.portal || "").toLowerCase() === "crm";
}

// HR Admin = ERP role is "Admin" or "HR" (unchanged from before - main admins and HR-role users
// keep working exactly as they did) OR the independent "Is HR Admin" checkbox is set on this
// account - lets someone be HR Admin in the Employee portal without needing to also be an ERP
// Admin (e.g. an Accounts-role user who also runs HR), without disturbing anyone already relying
// on the role-based grants.
function isHrAdmin() {
  const role = (currentSession()?.role || "").toLowerCase();
  return isHrSession() && (role === "admin" || role === "hr" || currentSession()?.isHrAdmin === true);
}

function isAdminSession() {
  return !isCustomerSession() && !isHrSession() && !isCrmSession() && (currentSession()?.role || "").toLowerCase() === "admin";
}

function visibleModules() {
  if (isCustomerSession()) return customerModules;
  if (isHrSession()) return isHrAdmin() ? hrModules.concat(hrAdminModules) : hrModules;
  if (isCrmSession()) {
    const session = currentSession() || {};
    let items = crmModules.slice();
    if (session.crmManageAssignments === true) items = items.concat(crmManagerModules);
    if (session.crmAdminAccess === true) items = items.concat(crmAdminModules);
    return items;
  }
  if (isAdminSession()) return modules;
  const session = currentSession();
  const configured = String(session?.sectionAccess || "").trim();
  if (configured && configured.toLowerCase() !== "all") {
    const allowedSections = new Set(
      configured
        .split(",")
        .map((item) => normalizeModuleName(item.trim()))
        .filter(Boolean)
    );
    return modules.filter(([name]) => allowedSections.has(name));
  }
  const allowed = new Set([
    "Dashboard",
    "Shipment / Airway",
    "Manifest",
    "Customers",
    "Suppliers / Transporters",
    "Documents",
    "Tariffs / Rate Master",
    "Reports"
  ]);
  return modules.filter(([name]) => allowed.has(name));
}

function normalizeModuleName(name) {
  if (name === "Shipments / Jobs") return "Shipment / Airway";
  if (name === "Consolidation") return "Manifest";
  return name;
}

function renderModuleNav() {
  moduleNav.innerHTML = visibleModules()
    .map(([name]) => `<button type="button" data-module="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join("");
  if (portalAccessPanel) {
    const session = currentSession() || {};
    portalAccessPanel.hidden = isCustomerSession();
    const hrButton = portalAccessPanel.querySelector("[data-portal-switch='hr']");
    const erpButton = portalAccessPanel.querySelector("[data-portal-switch='erp']");
    const maintenanceButton = portalAccessPanel.querySelector("[data-portal-switch='maintenance']");
    const crmButton = portalAccessPanel.querySelector("[data-portal-switch='crm']");
    if (hrButton) hrButton.hidden = isCustomerSession() || isHrSession() || session.hrPortalAccess !== true;
    if (erpButton) erpButton.hidden = isCustomerSession() || (!isHrSession() && !isCrmSession()) || session.erpPortalAccess === false;
    if (maintenanceButton) maintenanceButton.hidden = isCustomerSession() || (session.maintenancePortalAccess !== true && session.erpPortalAccess !== true);
    if (crmButton) crmButton.hidden = isCustomerSession() || isCrmSession() || session.crmPortalAccess !== true;
  }
}

function currentUserName() {
  return currentSession()?.userName || "operations";
}

function canBillingSalesEntry() {
  const session = currentSession() || {};
  return isAdminSession() || session.canBillingSalesEntry === undefined || isChecked(session.canBillingSalesEntry);
}

function canBillingCostEntry() {
  const session = currentSession() || {};
  return isAdminSession() || session.canBillingCostEntry === undefined || isChecked(session.canBillingCostEntry);
}

function canViewProfitMargin() {
  const role = String(currentSession()?.role || "").toLowerCase();
  return isAdminSession() || ["billing", "billings", "accounts", "accountant"].includes(role);
}

function canViewBillingSummary() {
  const role = String(currentSession()?.role || "").toLowerCase();
  return isAdminSession() || ["billing", "billings", "accounts", "accountant"].includes(role);
}

function canViewAllBranches() {
  const session = currentSession() || {};
  return isAdminSession() || normalizeBranchViewScope(session?.branchViewScope || session?.viewScope) === "All Branches";
}

function ownedByCurrentUser(row) {
  if (!branchAllowed(row)) return false;
  if (canViewAllBranches()) return true;
  if (Boolean(currentSession()?.canViewAllEntry)) return true;
  const userName = currentUserName().toLowerCase();
  const owners = [
    row.createdBy,
    row.created_by,
    row.requestedBy,
    row.requested_by,
    row.owner,
    row.user,
    row.userName
  ].map((value) => String(value || "").toLowerCase());
  return owners.includes(userName);
}

function visibleRows(rows) {
  return rows.filter(ownedByCurrentUser);
}

function branchAllowed(row) {
  const branch = normalizeBranchName(row.branch);
  if (!branch) return true;
  if (canViewAllBranches()) return true;
  const access = String(currentSession()?.branchAccess || "Kuwait HO").trim();
  if (!access || ["both", "all"].includes(access.toLowerCase())) return true;
  const allowed = access
    .split(",")
    .map((item) => normalizeBranchName(item).toLowerCase())
    .filter(Boolean);
  return allowed.includes(branch.toLowerCase());
}

function normalizeBranchName(value) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();
  if (["branch 1", "kuwait 1", "kuwait ho"].includes(normalized)) return "Kuwait HO";
  if (["branch 2", "dubai 2", "dubai"].includes(normalized)) return "Dubai";
  return text;
}

function allBranchFilterOptions() {
  return CANONICAL_BRANCHES.slice();
}

function selectedAdminBranches() {
  const options = allBranchFilterOptions();
  const selected = Array.isArray(state.ui.adminBranchFilter)
    ? state.ui.adminBranchFilter
    : ["Both"];
  const valid = new Set(options.map((branch) => branch.toLowerCase()));
  return selected.filter((branch) => valid.has(String(branch || "").toLowerCase()));
}

function renderAdminBranchFilter() {
  if (!branchFilterPanel) return;
  if (!canViewAllBranches()) {
    branchFilterPanel.innerHTML = "";
    branchFilterPanel.classList.add("is-hidden");
    return;
  }

  const options = allBranchFilterOptions();
  const selected = new Set(selectedAdminBranches().map((branch) => branch.toLowerCase()));
  branchFilterPanel.classList.remove("is-hidden");
  branchFilterPanel.innerHTML = `
    <span class="filter-label">Branch</span>
    ${options.map((branch) => checkbox("adminBranchFilter", branch, selected.has(branch.toLowerCase()), branch)).join("")}
  `;
}

function handleAdminBranchFilterChange(event) {
  if (!event.target.matches("input[name='adminBranchFilter']")) return;
  const changedValue = String(event.target.value || "").toLowerCase();
  if (changedValue === "both" && event.target.checked) {
    branchFilterPanel.querySelectorAll("input[name='adminBranchFilter']").forEach((input) => {
      input.checked = String(input.value || "").toLowerCase() === "both";
    });
  } else if (event.target.checked) {
    const bothField = Array.from(branchFilterPanel.querySelectorAll("input[name='adminBranchFilter']")).find((input) => String(input.value || "").toLowerCase() === "both");
    if (bothField) bothField.checked = false;
  }
  state.ui.adminBranchFilter = Array.from(branchFilterPanel.querySelectorAll("input[name='adminBranchFilter']:checked")).map((input) => input.value);
  saveState();
  render();
}

function adminBranchFilterSummary() {
  if (!canViewAllBranches()) return "";
  const selected = selectedAdminBranches();
  if (!selected.length || selected.map((branch) => branch.toLowerCase()).includes("both")) return "";
  return ` | Branch: ${selected.join(", ")}`;
}

function adminBranchFilterMatch(row) {
  if (!canViewAllBranches()) return true;
  const selected = selectedAdminBranches().map((branch) => branch.toLowerCase());
  if (!selected.length) return false;
  if (selected.includes("both")) return true;
  const rowBranches = branchValuesForRecord(row).map((branch) => branch.toLowerCase());
  return rowBranches.some((branch) => selected.includes(branch));
}

function branchValuesForRecord(row) {
  const branches = new Set();
  const add = (value) => {
    String(value || "")
      .split(",")
      .map(normalizeBranchName)
      .filter(Boolean)
      .forEach((item) => {
        if (!["both", "all"].includes(item.toLowerCase())) branches.add(item);
      });
  };

  add(row?.branch);
  add(row?.branchAccess);

  // If the record already carries its own explicit branch, that's authoritative - stop here.
  // Previously this always continued on to also pull in a linked shipment's or the customer's
  // master-record branch, which meant a shipment correctly booked under Dubai would still pick up
  // "Kuwait HO" (and start matching a Kuwait-only filter) whenever its customer's account happened
  // to be tagged to the other branch - a very normal situation for any customer shipping from both.
  // The fallback below is only meant for record types (invoices, loads) that don't carry their own
  // branch and have to infer one from what they're linked to.
  if (branches.size > 0) return [...branches];

  const shipmentKeys = [row?.shipmentNo, row?.jobNo, row?.linkedNo, row?.referenceNo]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  shipmentKeys.forEach((jobNo) => add(state.shipments.find((shipmentItem) => shipmentItem.jobNo === jobNo)?.branch));

  String(row?.jobNumbers || "")
    .split(",")
    .map((jobNo) => jobNo.trim())
    .filter(Boolean)
    .forEach((jobNo) => add(state.shipments.find((shipmentItem) => shipmentItem.jobNo === jobNo)?.branch));

  // A linked shipment's own branch is more specific than the customer's master-record branch -
  // if that already resolved something, stop before also folding in the customer-level guess.
  if (branches.size > 0) return [...branches];

  const customerName = row?.customer || row?.customerName || row?.customer_name;
  if (customerName) add(state.customers.find((customer) => customer.name === customerName || customer.code === customerName)?.branch);

  return [...branches];
}

function notify(status, title, detail = "") {
  if (!toastStack) {
    if (detail) window.alert(`${title}\n${detail}`);
    else window.alert(title);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${status}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}`;
  toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function notifySuccess(title, detail = "") {
  notify("success", title, detail);
}

function notifyDenied(title, detail = "") {
  notify("denied", title, detail);
}

function notifyFailed(title, detail = "") {
  notify("failed", title, detail);
}

function openShipmentWorkspace() {
  activeModule = "Shipment / Airway";
  render();
  setTimeout(() => {
    openNewDialog("shipment");
  }, 0);
}

function handlePasswordReset() {
  const email = resetEmail.value.trim();
  if (!email) {
    resetMessage.textContent = "Enter an email address first.";
    return;
  }

  resetMessage.textContent = `Password reset is not configured yet for ${email}. Enable SMTP or Microsoft 365 on the API to activate this flow.`;
}

function openChangePasswordDialog() {
  openDialog({
    title: "Change Password",
    typeLabel: "Security",
    body: changePasswordDialogBody(),
    saveLabel: "Update Password",
    singleColumn: true,
    async onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      const saved = await changeCurrentPassword(data);
      if (!saved) return;
      recordDialog.close();
      render();
    }
  });
}

function toggleLoginPassword(event) {
  const button = event.currentTarget;
  const field = loginForm.querySelector("input[name='password']");
  if (!field) return;
  const shouldShow = field.type === "password";
  field.type = shouldShow ? "text" : "password";
  button.textContent = shouldShow ? "Hide" : "View";
  button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  button.title = shouldShow ? "Hide password" : "Show password";
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(loginForm);
  const userName = String(form.get("userName") || "").trim();
  const password = String(form.get("password") || "");
  const loginMode = String(form.get("loginMode") || "company");

  try {
    if (loginMode === "customer") {
      const loginResult = await attemptCustomerLogin(userName, password);
      customerPortalData = loginResult.data || null;
      rememberSession(loginResult.session);
    } else if (loginMode === "employee") {
      const session = await attemptApiLogin(userName, password, "employee");
      if (!session.hrPortalAccess) {
        throw new Error("HR Portal access is not enabled for this account. Contact your Admin to enable it.");
      }
      customerPortalData = null;
      rememberSession({ ...session, portal: "employee" });
    } else if (loginMode === "maintenance") {
      const session = await attemptApiLogin(userName, password, "maintenance");
      if (!session.maintenancePortalAccess && !session.erpPortalAccess) {
        throw new Error("Maintenance Portal access is not enabled for this account. Contact your Admin to enable it.");
      }
      customerPortalData = null;
      rememberSession({ ...session, portal: "company" });
      window.location.assign(`${MAINTENANCE_PORTAL_URL}#erpToken=${encodeURIComponent(session.token || "")}`);
      return;
    } else if (loginMode === "crm") {
      const session = await attemptApiLogin(userName, password, "crm");
      if (!session.crmPortalAccess) {
        throw new Error("CRM Portal access is not enabled for this account. Contact Company Management.");
      }
      customerPortalData = null;
      rememberSession({ ...session, portal: "crm" });
      activeModule = "CRM Dashboard";
    } else {
      const session = await attemptApiLogin(userName, password);
      if (session.erpPortalAccess === false) {
        throw new Error("ERP Portal access is not enabled for this account. Contact your Admin to enable it.");
      }
      customerPortalData = null;
      rememberSession(session);
    }
    loginMessage.textContent = "";
    resetMessage.textContent = "";
    showApp();
    return;
  } catch (error) {
    loginMessage.textContent = error.message || "Invalid login. Check user name and password.";
  }
}

async function attemptCustomerLogin(userName, password) {
  if (!userName || !password) {
    throw new Error("Customer user name and password are required.");
  }

  const result = await fetchJson("/api/customer-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName, password })
  });
  return { session: result.session, data: result.data };
}

async function attemptApiLogin(userName, password, loginMode = "company") {
  if (!userName || !password) {
    throw new Error("User name and password are required.");
  }

  const result = await fetchJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName, password, loginMode })
  });
  return result.session;
}

async function restoreHandoffSession() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("erpToken");
  if (!token) return false;

  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  const result = await fetchJson("/api/session/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!result?.session?.token) return false;
  customerPortalData = null;
  rememberSession({ ...result.session, portal: "company" });
  return true;
}

async function switchPortal(target) {
  const session = currentSession();
  if (!session?.token) {
    showLogin();
    return;
  }
  if (target === "maintenance") {
    if (session.maintenancePortalAccess !== true) {
      notifyDenied("Access denied", "Maintenance Portal access is not enabled for this account. Contact Company Management.");
      return;
    }
    const handoffUrl = `${MAINTENANCE_PORTAL_URL}#erpToken=${encodeURIComponent(session.token || "")}`;
    const maintenanceWindow = window.open(handoffUrl, "_blank", "noopener,noreferrer");
    if (!maintenanceWindow) {
      notifyDenied("Maintenance Portal", "The browser blocked the new tab. Please allow pop-ups for this ERP portal and try again.");
    }
    return;
  }
  const portal = target === "hr" ? "employee" : target === "crm" ? "crm" : "company";
  if (portal === "employee" && session.hrPortalAccess !== true) {
    notifyDenied("Access denied", "HR Portal access is not enabled for this account. Contact Company Management.");
    return;
  }
  if (portal === "crm" && session.crmPortalAccess !== true) {
    notifyDenied("Access denied", "CRM Portal access is not enabled for this account. Contact Company Management.");
    return;
  }
  if (portal === "company" && session.erpPortalAccess === false) {
    notifyDenied("Access denied", "ERP Portal access is not enabled for this account. Contact Company Management.");
    return;
  }
  try {
    const result = await fetchJson("/api/portal-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal })
    });
    customerPortalData = null;
    rememberSession(result.session);
    activeModule = portal === "employee" ? "HR Dashboard" : portal === "crm" ? "CRM Dashboard" : "Dashboard";
    showApp();
  } catch (error) {
    notifyDenied("Portal switch failed", error.message || "The requested portal could not be opened.");
  }
}

function showLogin() {
  customerPortalData = null;
  loginScreen.classList.remove("is-hidden");
  appShell.classList.add("is-hidden");
  delete document.body.dataset.apolloPortal;
  resetMessage.textContent = "";
}

function showApp() {
  announcementReadStateReady = false;
  liveShipmentDataReady = false;
  loginScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  document.body.dataset.apolloPortal = isCustomerSession() ? "customer" : isHrSession() ? "employee" : isCrmSession() ? "crm" : "company";
  appShell.classList.toggle("hr-portal-theme", isHrSession());
  appShell.classList.toggle("crm-portal-theme", isCrmSession());
  renderModuleNav();
  updateUserContext();
  if (isCrmSession()) {
    stopSharedShipmentRefresh();
    window.ApolloCRM?.invalidate?.();
    render();
    return;
  }
  // This first render happens before syncFromApi()'s data has arrived - it uses whatever was
  // cached locally from the last session, which can be stale or incomplete (missing anything
  // added since). Show a visible loading indicator so that's obvious, rather than silently
  // presenting old data as current and leaving the person to notice something's missing and
  // manually refresh - syncFromApi() replaces this render with live data as soon as it's ready.
  showSyncingIndicator();
  syncFromApi();
  startSharedShipmentRefresh();
  render();
}

function canRefreshSharedShipmentData() {
  return Boolean(currentSession()?.token) && !isCustomerSession() && !isHrSession() && !isCrmSession() && !document.hidden && !recordDialog?.open;
}

function isRecordSelectorFocused() {
  const active = document.activeElement;
  return Boolean(active?.matches?.("[data-load-select], [data-delete-select]"));
}

async function refreshSharedShipmentData() {
  if (!canRefreshSharedShipmentData() || sharedShipmentRefreshInProgress) return;
  sharedShipmentRefreshInProgress = true;
  try {
    const [shipments, documents, invoices, shipmentStatusHistory] = await Promise.all([
      fetchJson("/api/shipments"),
      fetchJson("/api/documents"),
      fetchJson("/api/invoices"),
      fetchJson("/api/shipment-status-history")
    ]);
    state.shipments = (shipments.rows || []).map(apiShipment);
    state.documents = (documents.rows || []).map(apiDocument);
    state.invoices = (invoices.rows || []).map(apiInvoice);
    state.shipmentStatusHistory = (shipmentStatusHistory.rows || []).map(apiShipmentStatusHistory);
    liveShipmentDataReady = true;
    saveState();
    // Do not redraw moduleContent while a user is typing in a searchable record selector. The
    // redraw would replace the datalist input and make its text appear to disappear. The next
    // refresh after blur, navigation, or action will render the newly fetched data normally.
    if (isRecordSelectorFocused()) return;
    render();
  } catch {
    // A background refresh must never interrupt a person who is working. The next focus or timer refresh will retry.
  } finally {
    sharedShipmentRefreshInProgress = false;
  }
}

function startSharedShipmentRefresh() {
  if (sharedShipmentRefreshTimer) window.clearInterval(sharedShipmentRefreshTimer);
  // Keep dashboard KPIs and shipment status close to live without interrupting
  // an active record edit (refreshSharedShipmentData skips open dialogs).
  sharedShipmentRefreshTimer = window.setInterval(refreshSharedShipmentData, 10000);
  if (sharedShipmentRefreshEventsBound) return;
  sharedShipmentRefreshEventsBound = true;
  window.addEventListener("focus", refreshSharedShipmentData);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshSharedShipmentData();
  });
}

function stopSharedShipmentRefresh() {
  if (!sharedShipmentRefreshTimer) return;
  window.clearInterval(sharedShipmentRefreshTimer);
  sharedShipmentRefreshTimer = null;
}

function showSyncingIndicator() {
  let banner = document.querySelector("#dataSyncBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "dataSyncBanner";
    banner.className = "data-sync-banner";
    banner.textContent = "Loading latest data...";
    document.body.appendChild(banner);
  }
  banner.classList.remove("is-hidden");
}

function hideSyncingIndicator() {
  document.querySelector("#dataSyncBanner")?.classList.add("is-hidden");
}

async function syncFromApi() {
  try {
    if (isCustomerSession()) {
      await syncCustomerPortal();
      return;
    }
    const requestNames = [
      "health", "shipments", "consolidations", "customers", "suppliers", "tariffs", "documents",
      "additionalCharges", "invoices", "quotations", "shipmentRequests", "shipmentStatusHistory",
      "users", "customerUsers", "unblockRequests", "adminRequests", "audit", "settings", "employees",
      "leaveRequests", "payslips", "hrAnnouncements", "employeeProfileDocuments"
    ];
    const results = await Promise.allSettled([
      fetchJson("/api/health"),
      fetchJson("/api/shipments"),
      fetchJson("/api/consolidations"),
      fetchJson("/api/customers"),
      fetchJson("/api/suppliers"),
      fetchJson("/api/tariffs"),
      fetchJson("/api/documents"),
      fetchJson("/api/additional-charges"),
      fetchJson("/api/invoices"),
      fetchJson("/api/quotations"),
      fetchJson("/api/shipment-requests"),
      fetchJson("/api/shipment-status-history"),
      fetchJson("/api/users"),
      fetchJson("/api/customer-users"),
      fetchJson("/api/unblock-requests"),
      fetchJson("/api/admin-requests"),
      fetchJson("/api/audit"),
      fetchJson("/api/settings"),
      fetchJson("/api/employees"),
      fetchJson("/api/leave-requests"),
      fetchJson("/api/payslips"),
      fetchJson("/api/hr-announcements"),
      isHrSession() ? fetchJson("/api/employee-profile-documents") : Promise.resolve({ rows: [] })
    ]);
    const valueAt = (index) => results[index]?.status === "fulfilled" ? results[index].value : null;
    const health = valueAt(0);
    const failures = results
      .map((result, index) => result.status === "rejected" ? `${requestNames[index]}: ${result.reason?.message || "request failed"}` : "")
      .filter(Boolean);
    if (!health) throw new Error(failures[0] || "Health request failed.");

    const apiMode = health.mode || (health.database === "connected" ? "database" : "demo");
    const databaseReady = health.database === "connected" && apiMode === "database";
    state.api = {
      status: databaseReady ? "API connected" : "API setup required",
      database: health.database || "unknown",
      mode: apiMode,
      error: [health.error || health.startupError || "", ...failures].filter(Boolean).join(" | ")
    };
    if (databaseReady) {
      const rowsAt = (index) => valueAt(index)?.rows;
      if (rowsAt(1)) state.shipments = rowsAt(1).map(apiShipment);
      if (rowsAt(2)) state.loads = rowsAt(2).map(apiLoad);
      if (rowsAt(3)) state.customers = rowsAt(3).map(apiCustomer);
      if (rowsAt(4)) state.suppliers = rowsAt(4).map(apiSupplier);
      if (rowsAt(5)) state.tariffs = rowsAt(5).map(apiTariff);
      if (rowsAt(6)) state.documents = rowsAt(6).map(apiDocument);
      if (rowsAt(7)) state.additionalCharges = rowsAt(7).map(apiAdditionalCharge);
      if (rowsAt(8)) state.invoices = rowsAt(8).map(apiInvoice);
      if (rowsAt(9)) state.quotations = rowsAt(9).map(apiQuotation);
      if (rowsAt(10)) state.shipmentRequests = rowsAt(10).map(apiShipmentRequest);
      if (rowsAt(11)) state.shipmentStatusHistory = rowsAt(11).map(apiShipmentStatusHistory);
      if (rowsAt(12)) state.users = normalizeUsers(rowsAt(12).map(apiUser));
      if (rowsAt(13)) state.customerUsers = rowsAt(13).map(apiCustomerUser);
      if (rowsAt(14)) state.unblockRequests = rowsAt(14).map(apiUnblockRequest);
      if (rowsAt(15)) state.adminRequests = rowsAt(15).map(apiAdminRequest);
      if (rowsAt(16)) state.audit = rowsAt(16).map(apiAudit);
      if (rowsAt(18)) state.employees = rowsAt(18).map(apiEmployee);
      if (rowsAt(19)) state.leaveRequests = rowsAt(19).map(apiLeaveRequest);
      if (rowsAt(20)) state.payslips = rowsAt(20).map(apiPayslip);
      if (rowsAt(21)) state.hrAnnouncements = rowsAt(21).map(apiHrAnnouncement);
      if (rowsAt(22)) state.employeeProfileDocuments = rowsAt(22).map(apiDocument);
      const settingsRows = rowsAt(17);
      if (settingsRows?.length) {
        state.settings = apiSettings(settingsRows[0]);
        hydrateColumnLayoutFromServer(state.settings.columnLayoutJson);
        columnLayoutHydrated = true;
        state.dropdownOptions = { ...state.dropdownOptions, ...parseDropdownOptions(state.settings.dropdownOptionsJson) };
      }
      try {
        await syncAnnouncementReadState();
      } catch (error) {
        announcementReadStateReady = true;
        state.api.error = [state.api.error, `announcement reads: ${error.message}`].filter(Boolean).join(" | ");
      }
      renderErpAnnouncementsDropdown();
      liveShipmentDataReady = Boolean(rowsAt(1));
    }
    if (!databaseReady) announcementReadStateReady = true;
    saveState();
    maybePlayAdminNotification();
  } catch (error) {
    liveShipmentDataReady = false;
    announcementReadStateReady = true;
    state.api = { status: "API offline", database: "local data", mode: "browser", error: error.message };
  } finally {
    hideSyncingIndicator();
    render();
  }
}

async function fetchJson(path, options = {}) {
  const session = currentSession();
  const existingHeaders = options.headers || {};
  const hasAuthHeader = Object.keys(existingHeaders).some((key) => key.toLowerCase() === "authorization");
  const headers = session?.token && !hasAuthHeader
    ? { ...existingHeaders, Authorization: "Bearer " + session.token }
    : existingHeaders;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const controller = options.signal ? null : new AbortController();
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  const requestOptions = { ...options, headers, signal: options.signal || controller?.signal };
  delete requestOptions.timeoutMs;
  try {
    const response = await fetch(`${API_URL}${path}`, requestOptions);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds: ${path}`);
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

async function syncCustomerPortal() {
  const session = currentSession();
  if (!session?.token) { render(); return; }
  try {
    const result = await fetchJson("/api/customer/bootstrap", { headers: { Authorization: "Bearer " + session.token } });
    customerPortalData = result.data || customerPortalData;
    state.api = { status: "Customer portal connected", database: "connected", mode: result.mode || "database", error: "" };
    render();
  } catch (error) {
    state.api = { status: "Customer portal offline", database: "local data", mode: "browser", error: error.message };
    render();
  }
}

function apiShipment(row) {
  const item = shipment(
    row.job_no,
    row.branch,
    row.customer_name,
    row.origin,
    row.destination,
    row.status,
    row.pieces || 0,
    row.actual_kg || 0,
    row.cbm || 0,
    row.chargeable_kg || 0,
    row.sell || 0,
    row.buy_cost || 0,
    row.pod_status || "Pending",
    row.invoice_status || "Unbilled",
    String(row.booking_date || today()).slice(0, 10),
    row.airway_bill_no || row.job_no?.replace("AFS", "AWB"),
    row.tariff_no || "TAR-1001",
    Number(row.transit_days || 0),
    row.shipment_direction || "Export",
    row.shipment_service || "AE",
    row.shipment_service_other || "",
    row.volume_category || "Land",
    Number(row.chargeable_divisor || 250),
    row.created_by || "admin",
    row.notes || ""
  );
  const shipmentMeta = parseJsonMeta(row.notes || "{}");
  item.shipmentVia = shipmentMeta.shipmentVia || shipmentMeta.transportMode || "";
  item.transporter = row.transporter || "";
  item.transporterCode = row.transporter_code || "";
  item.vehicleNo = row.vehicle_no || "";
  item.driverName = row.driver_name || "";
  item.driverNumber = row.driver_number || "";
  item.driverMobile = row.driver_mobile || "";
  // pod_splits_json is its own real database column (not packed into notes like most other
  // fields) - without mapping it back here, every recorded delivery/split would appear to vanish
  // after a page reload even though it's safely saved server-side.
  item.podSplitsJson = row.pod_splits_json || "[]";
  item.chargeableKg = effectiveChargeableWeightForShipment(item);
  return item;
}

function apiLoad(row) {
  const item = load(
    row.load_no,
    String(row.trip_date || today()).slice(0, 10),
    row.route,
    row.transporter,
    row.vehicle_no,
    row.status,
    row.job_numbers || "",
    row.manifest_status || "Not Generated",
    row.last_manifest_request_no || "",
    row.created_by || "admin",
    row.notes || ""
  );
  recalculateLoad(item);
  return item;
}

function apiCustomer(row) {
  return party(row.code, row.name, row.location_or_lane, row.email, row.terms, row.status, row.is_account_overdue, row.branch, row.created_by || "admin", row.full_address || "", row.mobile || "", row.blocked_branches || "");
}

function apiSupplier(row) {
  return party(row.code, row.name, row.location_or_lane, row.email, row.terms, row.status, row.is_account_overdue, row.branch, row.created_by || "admin", row.full_address || "", row.mobile || "", row.blocked_branches || "");
}

function apiTariff(row) {
  return buildTariffRecord(row, { createdBy: row.created_by || "admin" });
}

function apiDocument(row) {
  const item = documentRow(row.document_no, row.linked_no, row.type, row.status, String(row.date || today()).slice(0, 10), row.owner, row.file_name || "", row.owner || "admin");
  item.fileName = row.file_name || "";
  item.storageUrl = row.storage_url || "";
  item.createdAt = row.created_at || "";
  let metadata = {};
  try { metadata = JSON.parse(row.notes || "{}"); } catch { metadata = {}; }
  item.locked = metadata.locked === true;
  item.lockedAt = metadata.lockedAt || "";
  item.lockedBy = metadata.lockedBy || "";
  return item;
}

function apiAdditionalCharge(row) {
  return additionalCharge(
    row.ref_no,
    row.shipment_no,
    String(row.charge_date || today()).slice(0, 10),
    row.charge_type,
    row.charge_basis || "1 ton",
    row.supplier,
    row.reference_no || "",
    row.invoice_no || "",
    Number(row.amount || 0),
    Number(row.tax_percent || 0),
    row.currency || "KWD",
    row.remarks || "",
    row.attachment_name || "",
    row.status || "Draft",
    row.requested_by || "",
    row.approved_by || "",
    row.approval_notes || "",
    row.created_by || row.requested_by || "admin"
  );
}

function apiShipmentRequest(row) {
  return {
    requestNo: row.request_no,
    customerCode: row.customer_code || "",
    customerName: row.customer_name || "",
    shipmentType: row.shipment_type || "",
    origin: row.origin || "",
    destination: row.destination || "",
    consignee: row.consignee || "",
    itemName: row.item_name || "",
    hsCode: row.hs_code || "",
    itemCode: row.item_code || "",
    quantity: Number(row.quantity || 0),
    weight: Number(row.weight || 0),
    invoiceValue: Number(row.invoice_value || 0),
    remarks: row.remarks || "",
    attachmentsJson: row.attachments_json || "[]",
    requestDetailsJson: row.request_details_json || "{}",
    status: row.status || "SUBMITTED",
    approvalNotes: row.approval_notes || "",
    autoApproved: Boolean(row.auto_approved),
    convertedJobNo: row.converted_job_no || "",
    createdBy: row.created_by || "",
    createdAt: String(row.created_at || today()).slice(0, 10)
  };
}

function apiShipmentStatusHistory(row) {
  return {
    id: row.id || "",
    jobNo: row.job_no || "",
    status: row.status || "",
    podStatus: row.pod_status || "",
    invoiceStatus: row.invoice_status || "",
    notes: row.notes || "",
    updatedBy: row.updated_by || "",
    updatedAt: row.updated_at || new Date().toISOString(),
    fromLocation: row.from_location || row.fromLocation || row.from || "",
    toLocation: row.to_location || row.toLocation || row.to || "",
    location: row.location || "",
    carrier: row.carrier || "",
    vehicleNo: row.vehicle_no || row.vehicleNo || "",
    flightNo: row.flight_no || row.flightNo || "",
    vessel: row.vessel || row.vessel_name || "",
    departure: row.departure || row.departure_at || "",
    arrival: row.arrival || row.arrival_at || ""
  };
}

function apiQuotation(row) {
  const item = quotation(row.quotation_no, row.customer_name, row.status || "Draft", String(row.date || today()).slice(0, 10), row.created_by || "admin");
  item.branch = row.branch || item.branch;
  item.customerContactPerson = row.customer_contact_person || "";
  item.customerMobile = row.customer_mobile || "";
  item.customerEmail = row.customer_email || "";
  item.cargoItemsJson = row.cargo_items_json || "[]";
  item.natureOfGoods = row.nature_of_goods || "";
  item.volumeCategory = row.volume_category || "1 CBM = 250 KG";
  item.cbm = Number(row.cbm || 0);
  item.actualKg = Number(row.actual_kg || 0);
  item.convertedJobNo = row.converted_job_no || "";
  item.notes = row.notes || "";
  return item;
}

function apiInvoice(row) {
  const item = invoice(row.invoice_no, row.customer, row.shipment_no, Number(row.revenue || 0), Number(row.supplier_cost || 0), row.status, String(row.date || today()).slice(0, 10), row.created_by || "admin");
  const snapshot = parseJsonMeta(row.invoice_snapshot_json || "{}");
  item.customerCode = row.customer_code || "";
  item.tariffNo = row.tariff_no || "";
  item.tariffName = row.tariff_name || "";
  item.chargeableWeight = Number(row.chargeable_weight || 0);
  item.grossWeight = Number(row.gross_weight || snapshot.grossWeight || 0);
  item.volumeWeight = Number(row.volume_weight || snapshot.volumeWeight || 0);
  item.currency = row.currency || snapshot.currency || "KD";
  item.totalCost = Number(row.total_cost || row.supplier_cost || 0);
  item.taxPercent = Number(row.tax_percent || 0);
  item.taxAmount = Number(row.tax_amount || 0);
  item.grandTotal = Number(row.grand_total || row.revenue || 0);
  item.profitPercent = Number(row.profit_percent || 0);
  item.grossProfit = Number(item.revenue || 0) - Number(item.totalCost || 0);
  item.invoiceLinesJson = row.invoice_lines_json || "[]";
  item.tariffSnapshotJson = row.tariff_snapshot_json || "{}";
  item.invoiceSnapshotJson = row.invoice_snapshot_json || "{}";
  item.dueDate = row.due_date || "";
  item.notes = row.notes || "";
  return item;
}

function apiCustomerUser(row) {
  return {
    customerCode: row.customer_code || "",
    username: row.username,
    email: row.email || "",
    status: row.status || "ACTIVE",
    lastLogin: row.last_login ? String(row.last_login).slice(0, 16).replace("T", " ") : "",
    createdAt: String(row.created_at || today()).slice(0, 10)
  };
}

function apiUser(row) {
  return user(
    row.user_name,
    row.email,
    row.role,
    row.account_status,
    row.branch_access,
    row.branch_view_scope || row.view_scope || "Assigned Branch Only",
    normalizeSectionAccess(row.section_access || "All"),
    isChecked(row.can_view_all_entry),
    isChecked(row.can_view_only_self_entry),
    isChecked(row.can_edit_all_entry),
    isChecked(row.can_view_updated_history),
    "",
    row.notes || "",
    String(row.created_at || today()).slice(0, 10),
    isChecked(row.hr_portal_access),
    row.can_billing_sales_entry === undefined ? true : isChecked(row.can_billing_sales_entry),
    row.can_billing_cost_entry === undefined ? true : isChecked(row.can_billing_cost_entry),
    row.erp_portal_access === undefined ? true : isChecked(row.erp_portal_access),
    isChecked(row.is_hr_admin),
    isChecked(row.maintenance_portal_access),
    isChecked(row.crm_portal_access),
    row.crm_role || "Sales Executive",
    isChecked(row.crm_view_all_accounts),
    isChecked(row.crm_manage_assignments),
    isChecked(row.crm_export_access),
    isChecked(row.crm_archive_access),
    isChecked(row.crm_view_team_reports),
    isChecked(row.crm_admin_access),
    isChecked(row.ai_access)
  );
}

function apiUnblockRequest(row) {
  return {
    requestNo: row.request_no,
    requestType: row.request_type || "Unblock",
    targetType: row.target_type || "Customer",
    referenceNo: row.reference_no || "",
    customerName: row.customer_name,
    requestedBy: row.requested_by,
    reason: row.reason,
    status: row.status,
    date: String(row.date || today()).slice(0, 10),
    approvedBy: row.approved_by || "",
    notes: row.notes || ""
  };
}

function apiAdminRequest(row) {
  return adminRequest(
    row.request_no,
    row.request_type,
    row.target_module,
    row.reference_no,
    row.requested_by,
    row.status,
    String(row.date || today()).slice(0, 10),
    row.details || "",
    row.proposed_values || "",
    row.approved_by || "",
    row.approval_notes || ""
  );
}

function apiAudit(row) {
  return {
    id: row.id,
    dateTime: String(row.date_time || "").replace("T", " ").slice(0, 16),
    user: row.user_name,
    action: row.action,
    reference: row.reference,
    details: row.details || ""
  };
}

function apiEmployee(row) {
  return {
    userName: row.user_name,
    employeeCode: row.employee_code || "",
    fullName: row.full_name || "",
    department: row.department || "",
    designation: row.designation || "",
    joinDate: String(row.join_date || "").slice(0, 10),
    phone: row.phone || "",
    personalEmail: row.personal_email || "",
    employmentStatus: row.employment_status || "Active",
    reportingManager: row.reporting_manager || "",
    nationality: row.nationality || "",
    dateOfBirth: String(row.date_of_birth || "").slice(0, 10),
    civilIdNo: row.civil_id_no || "",
    passportNo: row.passport_no || "",
    passportExpiry: String(row.passport_expiry || "").slice(0, 10),
    currentAddress: row.current_address || "",
    permanentAddress: row.permanent_address || "",
    emergencyContactName: row.emergency_contact_name || "",
    emergencyContactPhone: row.emergency_contact_phone || "",
    notes: row.notes || ""
  };
}

function apiLeaveRequest(row) {
  return {
    requestNo: row.request_no,
    userName: row.user_name,
    employeeName: row.employee_name || "",
    leaveType: row.leave_type || "Annual",
    startDate: String(row.start_date || "").slice(0, 10),
    endDate: String(row.end_date || "").slice(0, 10),
    totalDays: Number(row.total_days || 0),
    reason: row.reason || "",
    status: row.status || "Pending",
    approvedBy: row.approved_by || "",
    approvedAt: row.approved_at || "",
    appliedAt: row.applied_at || ""
  };
}

function apiPayslip(row) {
  return {
    payslipNo: row.payslip_no,
    userName: row.user_name,
    employeeName: row.employee_name || "",
    period: row.period || "",
    grossPay: Number(row.gross_pay || 0),
    deductions: Number(row.deductions || 0),
    netPay: Number(row.net_pay || 0),
    status: row.status || "Issued",
    issuedDate: String(row.issued_date || "").slice(0, 10),
    storageUrl: row.storage_url || ""
  };
}

function renderErpAnnouncementsDropdown() {
  if (!erpAnnouncementsDropdown || !erpAnnouncementsList) return;
  const session = currentSession();
  const visible = Boolean(session?.token) && !isHrSession() && !isCustomerSession();
  erpAnnouncementsDropdown.hidden = !visible;
  if (!visible) return;
  const announcements = [...(state.hrAnnouncements || [])].sort((a,b) => (b.pinned - a.pinned) || (b.postedAt || "").localeCompare(a.postedAt || ""));
  erpAnnouncementsList.innerHTML = announcements.length
    ? announcements.slice(0, 5).map(row => `<article class="erp-announcement-item${row.pinned ? " is-pinned" : ""}"><strong>${escapeHtml(row.pinned ? "Pinned: " : "")}${escapeHtml(row.title)}</strong><span>${escapeHtml(row.body)}</span><small>${escapeHtml(row.postedBy || "HR")} · ${escapeHtml(row.postedAt ? new Date(row.postedAt).toLocaleDateString() : "")}</small></article>`).join("")
    : `<span class="announcement-empty">No announcements yet.</span>`;
}
function apiHrAnnouncement(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    body: row.body || "",
    postedBy: row.posted_by || "",
    audience: row.audience || "All",
    pinned: Boolean(row.pinned),
    postedAt: row.posted_at || ""
  };
}

function sortedHrAnnouncements() {
  return [...(state.hrAnnouncements || [])].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
}

function announcementReadKey(userName = currentUserName()) {
  return String(userName || "").trim().toLowerCase() || "anonymous";
}

function localReadAnnouncementSet(userName = currentUserName()) {
  const byUser = state.hrAnnouncementReadIds?.[announcementReadKey(userName)];
  return new Set(Array.isArray(byUser) ? byUser.map((id) => String(id)) : []);
}

function latestUnreadAnnouncement(userName = currentUserName()) {
  const readIds = localReadAnnouncementSet(userName);
  return sortedHrAnnouncements().find((row) => !readIds.has(String(row.id))) || null;
}

function postLoginAnnouncementNotice() {
  const session = currentSession();
  if (!announcementReadStateReady || !session?.token || isCustomerSession()) return "";
  const row = latestUnreadAnnouncement();
  if (!row) return "";
  const posted = String(row.postedAt || "").replace("T", " ").slice(0, 16);
  return `<section class="panel post-login-announcement-notice"><div class="panel-header"><div><p class="eyebrow">New announcement</p><h2>${escapeHtml(row.title)}</h2><small>${escapeHtml(row.postedBy || "HR")} · ${escapeHtml(posted)}</small></div><span class="announcement-unread-badge">Unread</span></div><p>${escapeHtml(row.body)}</p><div class="action-row"><button type="button" data-action="mark-announcement-read" data-id="${escapeHtml(row.id)}">Mark as read</button></div></section>`;
}

async function syncAnnouncementReadState() {
  const session = currentSession();
  if (!session?.token || isCustomerSession()) {
    announcementReadStateReady = true;
    return;
  }
  try {
    const result = await fetchJson("/api/hr-announcement-reads");
    const serverIds = (result.rows || []).map((row) => String(row.announcement_id ?? row.announcementId ?? "")).filter(Boolean);
    const key = announcementReadKey();
    const current = state.hrAnnouncementReadIds && typeof state.hrAnnouncementReadIds === "object" ? state.hrAnnouncementReadIds : {};
    const merged = new Set([...(Array.isArray(current[key]) ? current[key].map((value) => String(value)) : []), ...serverIds]);
    state.hrAnnouncementReadIds = { ...current, [key]: [...merged] };
    announcementReadStateReady = true;
  } catch (error) {
    // The announcement read endpoint is additive. Keep the locally stored state when an older live
    // server has not deployed it yet, so the normal bootstrap and existing portal flows continue.
    announcementReadStateReady = true;
    console.warn("Announcement read state could not be loaded", error);
  }
}

async function markAnnouncementRead(id) {
  const announcementId = String(id || "").trim();
  if (!announcementId || !currentSession()?.token) return;
  const key = announcementReadKey();
  const current = state.hrAnnouncementReadIds && typeof state.hrAnnouncementReadIds === "object" ? state.hrAnnouncementReadIds : {};
  const readIds = new Set(Array.isArray(current[key]) ? current[key].map((value) => String(value)) : []);
  readIds.add(announcementId);
  state.hrAnnouncementReadIds = { ...current, [key]: [...readIds] };
  announcementReadStateReady = true;
  saveState();
  render();
  try {
    await fetchJson("/api/hr-announcement-reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: Number(announcementId) })
    });
  } catch (error) {
    // Local persistence keeps the notice dismissed even when an older live server has not yet run
    // the additive read-state migration. The announcement remains available in its panel.
    console.warn("Announcement read state could not be synced to the server", error);
  }
}

function apiSettings(row) {
  return {
    settingsKey: row.settings_key || state.settings.settingsKey || "default",
    companyName: row.company_name || state.settings.companyName,
    companyLogoUrl: row.company_logo_url || state.settings.companyLogoUrl || "",
    shipmentNumberFormat: row.shipment_number_format || state.settings.shipmentNumberFormat,
    kuwaitShipmentNumberFormat: row.kuwait_shipment_number_format || state.settings.kuwaitShipmentNumberFormat || "AFS-#####/MM/KWI/{SERVICE}",
    dubaiShipmentNumberFormat: row.dubai_shipment_number_format || state.settings.dubaiShipmentNumberFormat || "AFS-#####/MM/DBX/{SERVICE}",
    kuwaitShipmentSerialStart: row.kuwait_shipment_serial_start || state.settings.kuwaitShipmentSerialStart || "1",
    dubaiShipmentSerialStart: row.dubai_shipment_serial_start || state.settings.dubaiShipmentSerialStart || "1",
    invoiceNumberFormat: row.invoice_number_format || state.settings.invoiceNumberFormat,
    consolidationNumberFormat: row.consolidation_number_format || state.settings.consolidationNumberFormat,
    tcnNumberFormat: row.tcn_number_format || state.settings.tcnNumberFormat,
    deliveryNoteNumberFormat: row.delivery_note_number_format || state.settings.deliveryNoteNumberFormat,
    documentNumberFormat: row.document_number_format || state.settings.documentNumberFormat,
    tariffNumberFormat: row.tariff_number_format || state.settings.tariffNumberFormat,
    customerNumberFormat: row.customer_number_format || state.settings.customerNumberFormat,
    additionalChargeNumberFormat: row.additional_charge_number_format || state.settings.additionalChargeNumberFormat,
    supplierNumberFormat: row.supplier_number_format || state.settings.supplierNumberFormat,
    quotationNumberFormat: row.quotation_number_format || state.settings.quotationNumberFormat,
    awbNumberFormat: row.awb_number_format || state.settings.awbNumberFormat,
    awbSerialStart: row.awb_serial_start || state.settings.awbSerialStart || "262035",
    defaultVolumetricDivisor: row.default_volumetric_divisor || state.settings.defaultVolumetricDivisor,
    requirePodBeforeInvoice: row.require_pod_before_invoice || state.settings.requirePodBeforeInvoice,
    allowGlobalShipmentQuickSearch: row.allow_global_shipment_quick_search || state.settings.allowGlobalShipmentQuickSearch || "No",
    branches: row.branches || state.settings.branches,
    columnLayoutJson: row.column_layout_json || state.settings.columnLayoutJson || "{}",
    dropdownOptionsJson: row.dropdown_options || state.settings.dropdownOptionsJson || "{}"
  };
}

// hr-portal.js (window.ApolloHR) loads via a dynamic import in app.js, separately from and
// slightly after app-runtime.js's own first render() - so on that first render, or if hr-portal.js
// hasn't finished loading yet for any reason, window.ApolloHR.renderXxx may not exist yet. This
// used to fall back to a single shared placeholder function for several different pages at
// once (and a bare, uncalled function reference at that) - which is what made My Leave, Leave
// Balance, Leave Calendar all show identical content, and separately made Leave Approvals, HR
// Calendar & Rules, HR Leave Balances, HR Leave Policies all show identical content too, no
// matter which of those pages was actually open. Each page now gets its own clearly-labelled
// state instead of quietly borrowing another page's content: a "loading" notice if hr-portal.js
// isn't ready yet, and a page-specific error notice (instead of leaving whatever the previous
// page showed on screen) if it throws while rendering.
function renderHrModule(methodName, label) {
  const method = window.ApolloHR?.[methodName];
  if (typeof method !== "function") {
    return `<section class="panel">${panelHeader(label)}${empty(`Loading ${label}... if this doesn't update in a moment, refresh the page.`)}</section>`;
  }
  try {
    const html = method();
    return html || `<section class="panel">${panelHeader(label)}${empty(`No data available for ${label} right now. Try Refresh.`)}</section>`;
  } catch (error) {
    console.error(`HR module render failed for ${label}`, error);
    return `<section class="panel">${panelHeader(label)}${empty(`Something went wrong loading ${label}. Refresh and try again.`)}</section>`;
  }
}

function renderCrmModule(methodName, label) {
  const method = window.ApolloCRM?.[methodName];
  if (typeof method !== "function") {
    return `<section class="panel">${panelHeader(label)}${empty(`Loading ${label}...`)}</section>`;
  }
  try {
    return method() || `<section class="panel">${panelHeader(label)}${empty(`No CRM data available for ${label}.`)}</section>`;
  } catch (error) {
    console.error(`CRM module render failed for ${label}`, error);
    return `<section class="panel">${panelHeader(label)}${empty(`Something went wrong loading ${label}. Refresh and try again.`)}</section>`;
  }
}

function render() {
  // Column filter inputs live inside moduleContent, which this function fully replaces on every
  // call (including on every keystroke - see handleColumnFilterInput). Without this, retyping a
  // second character would find a brand-new input with no focus and the cursor reset to nowhere.
  // Save which one (if any) had focus and its cursor position, then restore both after re-render.
  const focusedFilter = document.activeElement?.closest?.("[data-column-filter]");
  const focusedFilterInfo = focusedFilter ? {
    scope: focusedFilter.dataset.filterScope || "",
    key: focusedFilter.dataset.filterKey || "",
    selectionStart: focusedFilter.selectionStart,
    selectionEnd: focusedFilter.selectionEnd
  } : null;
  const focusedRecordSelector = document.activeElement?.closest?.("[data-load-select], [data-delete-select]");
  const focusedRecordSelectorInfo = focusedRecordSelector ? {
    loadType: focusedRecordSelector.dataset.loadSelect || "",
    deleteType: focusedRecordSelector.dataset.deleteSelect || "",
    value: focusedRecordSelector.value || "",
    selectionStart: focusedRecordSelector.selectionStart,
    selectionEnd: focusedRecordSelector.selectionEnd
  } : null;
  const hrFormState = isHrSession() ? Array.from(moduleContent.querySelectorAll("form")).map((form) => ({
    key: form.dataset.hrForm || form.dataset.form || "",
    values: Array.from(form.querySelectorAll("input[name],select[name],textarea[name]")).map((field) => ({
      name: field.name,
      value: field.value,
      checked: field.checked,
      selected: field.tagName === "SELECT" ? Array.from(field.options).map((option) => option.selected) : null
    }))
  })) : [];
  // Record selectors also live inside moduleContent. A background refresh replaces that DOM, so
  // capture the current value before rendering. This is intentionally done for both load/action
  // selectors and delete selectors: actions must continue to target exactly what the user picked,
  // never the first/latest row returned by the refresh.
  const liveRecordSelectors = {};
  moduleContent.querySelectorAll("[data-load-select], [data-delete-select]").forEach((selector) => {
    const type = selector.dataset.loadSelect || selector.dataset.deleteSelect;
    if (type) liveRecordSelectors[type] = String(selector.value || "").trim();
  });
  if (Object.keys(liveRecordSelectors).length) {
    state.ui.selectedRecordSelectors = {
      ...(state.ui.selectedRecordSelectors || {}),
      ...liveRecordSelectors
    };
  }

  if (!visibleModules().some(([name]) => name === activeModule)) {
    activeModule = isCustomerSession() ? "Customer Dashboard" : isHrSession() ? "HR Dashboard" : isCrmSession() ? "CRM Dashboard" : "Dashboard";
  }
  const activeModules = isCustomerSession() ? customerModules : isHrSession() ? hrModules.concat(hrAdminModules) : isCrmSession() ? crmModules.concat(crmManagerModules, crmAdminModules) : modules;
  const module = activeModules.find(([name]) => name === activeModule) || activeModules[0];
  pageEyebrow.textContent = "";
  pageTitle.textContent = module[0];
  pageSubtitle.textContent = module[1];
  updateUserContext();
  renderAdminBranchFilter();
  updateDateFilterStatus();
  moduleNav.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.module === activeModule));
  if (apiBanner) {
    apiBanner.hidden = isCrmSession();
    const apiHealthy = state.api.database === "connected";
    apiBanner.className = `api-banner ${apiHealthy ? "is-ok" : "is-warning"}`;
    const errorText = state.api.error ? ` | Detail: ${escapeHtml(state.api.error)}` : "";
    apiBanner.innerHTML = `<strong>${escapeHtml(state.api.status)}</strong><span>API: ${escapeHtml(API_URL)} | Database: ${escapeHtml(state.api.database)} | Mode: ${escapeHtml(state.api.mode)}${errorText}</span>`;
  }

  const renderers = {
    Dashboard: renderDashboard,
    "Shipment / Airway": renderShipments,
    Manifest: renderConsolidation,
    Customers: () => renderParties("customers", "Consignee"),
    "Suppliers / Transporters": () => renderParties("suppliers", "Supplier / Transporter"),
    "Tariffs / Rate Master": renderTariffs,
    Documents: renderDocuments,
    "Billing / Invoices": renderInvoices,
    Quotation: renderQuotations,
    "Customer Requests": renderShipmentRequests,
    "POD / Delivery": renderPod,
    "Shipment Status": renderShipmentStatus,
    Reports: renderReports,
    "User Management / Settings": renderSettings,
    "Customer Portal Access": renderCustomerUserAccess,
    "Audit Log": renderAudit,
    "Customer Dashboard": renderCustomerDashboard,
    "Customer New Shipment": renderCustomerNewShipment,
    "Customer Shipments": renderCustomerShipments,
    "Customer Tracking": renderCustomerTracking,
    "Customer Profile": renderCustomerProfile,
    "Customer Notifications": renderCustomerNotifications,
    "HR Dashboard": renderHrDashboard,
    "My Profile": renderHrProfile,
    "Employee Directory": renderHrDirectory,
    "My Leave": () => renderHrModule("renderMyLeave", "My Leave"),
    "Leave Balance": () => renderHrModule("renderBalance", "Leave Balance"),
    "Leave Calendar": () => renderHrModule("renderCalendar", "Leave Calendar"),
    "My Payslips": renderHrPayslips,
    Announcements: renderHrAnnouncements,
    "Manage Employees": renderHrAdminEmployees,
    "Leave Approvals": () => renderHrModule("renderAdminApprovals", "Leave Approvals"),
    "HR Calendar & Rules": () => renderHrModule("renderAdminCalendar", "HR Calendar & Rules"),
    "HR Leave Balances": () => renderHrModule("renderAdminBalance", "HR Leave Balances"),
    "HR Leave Policies": () => renderHrModule("renderAdminPolicies", "HR Leave Policies"),
    "Manage Payslips": renderHrAdminPayslips,
    "Post Announcement": renderHrAdminAnnouncements,
    "CRM Dashboard": () => renderCrmModule("renderDashboard", "CRM Dashboard"),
    "Accounts": () => renderCrmModule("renderAccounts", "Accounts"),
    "Contacts": () => renderCrmModule("renderContacts", "Contacts"),
    "Opportunities": () => renderCrmModule("renderOpportunities", "Opportunities"),
    "Sales Visits": () => renderCrmModule("renderVisits", "Sales Visits"),
    "Meeting Minutes": () => renderCrmModule("renderMeetings", "Meeting Minutes"),
    "Follow-ups": () => renderCrmModule("renderTasks", "Follow-ups"),
    "Activity Timeline": () => renderCrmModule("renderActivity", "Activity Timeline"),
    "CRM Reports": () => renderCrmModule("renderReports", "CRM Reports"),
    "Team & Assignments": () => renderCrmModule("renderTeam", "Team & Assignments"),
    "CRM Security": () => renderCrmModule("renderAdmin", "CRM Security")
  };
  moduleContent.innerHTML = (renderers[activeModule] || renderDashboard)();
  if (hrFormState.length) {
    moduleContent.querySelectorAll("form").forEach((form, formIndex) => {
      const saved = hrFormState[formIndex];
      if (!saved || (saved.key && saved.key !== (form.dataset.hrForm || form.dataset.form || ""))) return;
      saved.values.forEach((item) => {
        const field = form.querySelector(`[name="${cssAttrEscape(item.name)}"]`);
        if (!field) return;
        if (field.type === "checkbox" || field.type === "radio") field.checked = item.checked;
        else if (field.tagName === "SELECT" && item.selected) Array.from(field.options).forEach((option, index) => { option.selected = Boolean(item.selected[index]); });
        else field.value = item.value;
      });
    });
  }
  renderErpAnnouncementsDropdown();
  window.__APOLLO_HR_RENDER = () => { if (typeof render === "function") render(); };
  window.__APOLLO_CRM_RENDER = () => { if (typeof render === "function" && isCrmSession()) render(); };
  // Lets hr-portal.js (a separate script, loaded independently) write to the same audit log as
  // the rest of the app after an HR Admin action - approvals, rejections, send-backs, holiday and
  // weekend rule changes, and balance/policy adjustments - since it has no direct access to
  // addHistory() otherwise. Uses the same session/token both scripts already share.
  window.__APOLLO_AUDIT__ = (action, reference, details = "") => { if (typeof addHistory === "function") addHistory(action, reference, details); };
  if (activeModule === "Customer New Shipment") bindCustomerShipmentRequestForm();

  if (focusedFilterInfo) {
    const restored = moduleContent.querySelector(`[data-column-filter][data-filter-scope="${cssAttrEscape(focusedFilterInfo.scope)}"][data-filter-key="${cssAttrEscape(focusedFilterInfo.key)}"]`);
    if (restored) {
      restored.focus();
      try { restored.setSelectionRange(focusedFilterInfo.selectionStart, focusedFilterInfo.selectionEnd); } catch (error) { /* not a text-selectable input type - ignore */ }
    }
  }
  if (focusedRecordSelectorInfo) {
    const selector = focusedRecordSelectorInfo.loadType
      ? moduleContent.querySelector(`[data-load-select="${cssAttrEscape(focusedRecordSelectorInfo.loadType)}"]`)
      : moduleContent.querySelector(`[data-delete-select="${cssAttrEscape(focusedRecordSelectorInfo.deleteType)}"]`);
    if (selector) {
      // Restore the in-progress datalist search text as well as a completed selection. The
      // selectedRecordSelectors state intentionally stores only valid record IDs, while this
      // temporary value prevents a refresh from erasing what the user is currently typing.
      selector.value = focusedRecordSelectorInfo.value;
      selector.focus();
      try { selector.setSelectionRange(focusedRecordSelectorInfo.selectionStart, focusedRecordSelectorInfo.selectionEnd); } catch (error) { /* ignore non-text controls */ }
    }
  }
}

function cssAttrEscape(value) {
  return String(value || "").replace(/["\\]/g, "\\$&");
}

function updateUserContext() {
  const session = currentSession() || { userName: "admin", branchAccess: "Both" };
  if (isCustomerSession()) {
    userContextText.textContent = `Customer: ${session.customerName || session.customerCode || session.userName}`;
    return;
  }
  if (isHrSession()) {
    userContextText.textContent = `Employee: ${session.userName}${isHrAdmin() ? " | HR Admin" : ""}`;
    return;
  }
  if (isCrmSession()) {
    userContextText.textContent = `CRM User: ${session.userName} | ${session.crmRole || "Sales Executive"}${session.crmViewAllAccounts ? " | All Accounts" : " | Assigned Accounts Only"}`;
    return;
  }
  userContextText.textContent = `User: ${session.userName} | Branch: ${session.branchAccess}`;
}

function updateDateFilterStatus() {
  const branchText = adminBranchFilterSummary();
  if (!fromDate.value && !toDate.value) {
    dateFilterStatusText.textContent = `Showing all records${branchText}`;
    return;
  }

  const fromLabel = fromDate.value || "start";
  const toLabel = toDate.value || "today";
  dateFilterStatusText.textContent = `Showing records from ${fromLabel} to ${toLabel}${branchText}`;
}

function portalRows(name) { return Array.isArray(customerPortalData?.[name]) ? customerPortalData[name] : []; }
function portalStatus(value) { return String(value || "").toUpperCase().replace(/\s+/g, "_"); }
function renderCustomerDashboard() { const requests = portalRows("shipmentRequests"); const shipments = portalRows("shipments"); const notifications = portalRows("notifications"); const activity = portalRows("activityLogs"); const filter = state.ui.customerActivityFilter || "All"; const visibleActivity = filter === "All" ? activity : activity.filter((row) => String(row.action || "").toLowerCase().includes(filter.toLowerCase())); const pending = requests.filter((row) => ["SUBMITTED", "PENDING_REVIEW"].includes(portalStatus(row.status))).length; const approved = requests.filter((row) => ["AUTO_APPROVED", "APPROVED", "COMPLETED"].includes(portalStatus(row.status))).length; const sentBack = requests.filter((row) => portalStatus(row.status) === "SENT_BACK").length; return "<section class=\"kpi-grid\">" + kpi("Total Shipments", shipments.length + requests.length, "Your shipment records", "customer-total-shipments") + kpi("Pending Requests", pending, "Waiting company review", "customer-pending-requests") + kpi("Approved Requests", approved, "Approved or auto approved", "customer-approved-requests") + kpi("Sent Back Requests", sentBack, "Needs your attention", "customer-sent-back-requests") + kpi("Notifications", notifications.length, "Portal messages", "customer-notifications") + "</section><section class=\"split-grid\"><article class=\"panel\">" + panelHeader("Recent Requests", "Customer Portal") + table("customerRequest", requests.slice(0, 8), customerRequestColumns(), false, "customerRequest:dashboard") + "</article><article class=\"panel\">" + panelHeader("Recent Activity", "Customer Portal") + `<label class="customer-activity-filter">Filter activity<select data-customer-activity-filter>${["All", "Login", "Shipment Submission", "Shipment Resubmission"].map((value) => `<option value="${escapeHtml(value)}" ${value === filter ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select></label>` + table("customerActivity", visibleActivity.slice(0, 8), customerActivityColumns(), false, "customerActivity:dashboard") + "</article></section>"; }
function renderCustomerNewShipment() {
  const hsOptions = portalRows("hsCodeMaster").map((row) => ({ value: row.item_name || row.itemName || "", label: [row.hs_code || row.hsCode, row.item_code || row.itemCode, row.alternate_name || row.alternateName].filter(Boolean).join(" | ") }));
  const requestNo = state.ui.customerRequestEditNo || "";
  const editRecord = requestNo ? portalRows("shipmentRequests").find((row) => String(row.request_no || row.requestNo || "") === requestNo) : null;
  const details = parseJsonMeta(editRecord?.request_details_json || editRecord?.requestDetailsJson || "{}");
  const value = (name, fallback = "") => details[name] ?? editRecord?.[name] ?? editRecord?.[name.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase())] ?? fallback;
  const resubmitting = portalStatus(editRecord?.status) === "SENT_BACK";
  return `<section class="panel customer-booking-panel">
    ${panelHeader(resubmitting ? `Correct & Resubmit ${requestNo}` : "New Shipment Request", "Customer Portal")}
    ${resubmitting ? `<div class="alert warning"><strong>Company feedback:</strong> ${escapeHtml(editRecord?.approval_notes || editRecord?.approvalNotes || "Please review the request and resubmit it.")}</div>` : ""}
    <p class="customer-booking-intro">Complete the booking details, attach the supporting documents, then select your item and HS code. The cargo calculator uses the same CBM and chargeable-weight rules as the company shipment portal.</p>
    <form class="stack-form customer-booking-form" data-form="customer-shipment-request" novalidate>
      <section class="customer-booking-step"><span class="customer-step-number">1</span><div><h3>Booking & Delivery Details</h3><p>Tell us where and when your cargo needs to move.</p></div>
        <div class="form-section-grid">
          ${strictSelect("shipmentType", "Shipment Type", ["Export", "Import", "Cross Trade", "Local Delivery"], value("shipmentType", "Export"))}
          ${strictSelect("shipmentVia", "Shipment Via", ["Air", "Sea", "Land"], value("shipmentVia"))}
          ${input("origin", "Origin", value("origin"))}${input("destination", "Destination", value("destination"))}
          ${input("pickupDate", "Preferred Pickup Date", value("pickupDate"), false, "date")}${input("deliveryDate", "Requested Delivery Date", value("deliveryDate"), false, "date")}
          ${input("consignee", "Consignee / Delivery Company", value("consignee"))}${input("consigneeContactPerson", "Delivery Contact Person", value("consigneeContactPerson"))}
          ${input("consigneeMobile", "Delivery Mobile", value("consigneeMobile"))}${input("deliveryLocation", "Delivery Location", value("deliveryLocation"))}
          ${textarea("deliveryAddress", "Delivery Address", value("deliveryAddress"), false, 2)}${input("customerReference", "Customer Reference", value("customerReference"))}
        </div>
      </section>
      <section class="customer-booking-step customer-document-step"><span class="customer-step-number">2</span><div><h3>Upload Shipment Documents</h3><p>Upload invoice, packing list, or other supporting files first. This unlocks item and HS-code selection.</p></div>
        <label class="customer-file-picker">Shipment Documents <input name="attachments" type="file" multiple ${resubmitting ? "" : "required"} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" /><small data-customer-document-status>${resubmitting ? "Existing documents are retained. Add replacement files only if needed." : "Select at least one file. Maximum 5 files, 10 MB each."}</small></label>
      </section>
      <section class="customer-booking-step" data-customer-hs-step hidden><span class="customer-step-number">3</span><div><h3>Item & Customs Information</h3><p>Select the item from the approved item list. Its HS code is filled automatically.</p></div>
        <div class="form-section-grid">
          ${selectFrom("itemName", "Item Name", hsOptions, value("itemName"))}${input("hsCode", "HS Code", value("hsCode"), true)}${input("itemCode", "Item Code", value("itemCode"), true)}
          ${input("invoiceValue", "Declared Invoice Value", value("invoiceValue"), false, "number")}${textarea("remarks", "Special Instructions / Remarks", value("remarks"), false, 3)}
        </div>
      </section>
      <section class="customer-booking-step" data-customer-cargo><span class="customer-step-number">4</span><div><h3>Cargo Dimensions & Chargeable Weight</h3><p>Add every pallet, carton, or package. CBM and chargeable weight calculate automatically.</p></div>
        <input type="hidden" name="requestNo" value="${escapeHtml(requestNo)}" /><input type="hidden" name="complianceAnalysisId" value="${escapeHtml(value("complianceAnalysisId", ""))}" /><input type="hidden" name="cargoItemsJson" value="${escapeHtml(value("cargoItemsJson", "[]"))}" />
        <div class="tariff-charge-entry cargo-entry">
          ${strictSelect("cargoPackageType", "Package Type", ["Pallet", "Carton", "Crate", "Box", "Package", "Drum"], "Pallet")}
          ${input("cargoQuantity", "Quantity", "1", false, "number")}
          ${input("cargoLength", "Length", "", false, "number")}
          ${input("cargoWidth", "Width", "", false, "number")}
          ${input("cargoHeight", "Height", "", false, "number")}
          ${strictSelect("cargoDimensionUnit", "Unit", ["CM", "M", "INCH"], "CM")}
          ${input("cargoWeightPerUnit", "Weight Per Unit (KG)", "", false, "number")}
          <button type="button" class="secondary-button" data-customer-add-cargo>Add Cargo</button>
        </div>
        <div class="tariff-charge-table" data-customer-cargo-lines></div>
        <div class="form-section-grid cargo-totals">
          <input type="hidden" name="volumeCategory" value="1 CBM = 250 KG" />
          ${input("cbm", "Grand Total CBM", "0", true, "number")}
          ${input("actualKg", "Total Gross Weight (KG)", "0", true, "number")}
          ${input("chargeableKg", "Chargeable Weight (KG)", "0", true, "number")}
          <input type="hidden" name="pieces" value="0" />
          <input type="hidden" name="chargeableDivisor" value="250" />
        </div>
      </section>
      <div class="action-row"><button type="submit">${resubmitting ? "Resubmit Shipment Request" : "Submit Shipment Request"}</button></div>
    </form>
  </section>`;
}
function renderCustomerShipments() { return "<section class=\"split-grid wide-left\"><article class=\"panel\">" + panelHeader("Shipment Requests", "History") + table("customerRequest", portalRows("shipmentRequests"), customerRequestColumns(), false) + "</article><article class=\"panel\">" + panelHeader("Company Shipments", "Tracking") + table("customerShipment", portalRows("shipments"), customerShipmentColumns(), false) + "</article></section>"; }
function renderCustomerTracking() { return "<section class=\"panel\">" + panelHeader("Tracking", "Customer Portal") + table("customerShipment", portalRows("shipments"), customerShipmentColumns(), false) + "</section>"; }
function renderCustomerProfile() { const session = currentSession() || {}; return "<section class=\"panel\">" + panelHeader("Profile", "Customer Portal") + "<form class=\"stack-form\" data-form=\"customer-profile\">" + input("customerCode", "Customer Code", session.customerCode || "", true) + input("customerName", "Customer Name", session.customerName || "", true) + input("email", "Email", session.email || "") + passwordField("password", "New Password", "") + "<button type=\"submit\">Save Profile</button></form></section>"; }
function renderCustomerNotifications() { return "<section class=\"split-grid\"><article class=\"panel\">" + panelHeader("Notifications", "Customer Portal") + table("customerNotification", portalRows("notifications"), customerNotificationColumns(), false) + "</article><article class=\"panel\">" + panelHeader("Activity Logs", "Customer Portal") + table("customerActivity", portalRows("activityLogs"), customerActivityColumns(), false) + "</article></section>"; }

function myEmployeeRecord() {
  return state.employees.find((row) => row.userName === currentUserName()) || null;
}

function leaveRequestColumns() {
  return [
    ["requestNo", "Request No"],
    ["employeeName", "Employee"],
    ["leaveType", "Type"],
    ["startDate", "Start"],
    ["endDate", "End"],
    ["totalDays", "Days"],
    ["status", "Status"]
  ];
}

function payslipColumns() {
  return [
    ["payslipNo", "Payslip No"],
    ["employeeName", "Employee"],
    ["period", "Period"],
    ["grossPay", "Gross Pay"],
    ["deductions", "Deductions"],
    ["netPay", "Net Pay"],
    ["status", "Status"]
  ];
}

function employeeColumns() {
  return [
    ["employeeCode", "Employee Code"],
    ["fullName", "Full Name"],
    ["department", "Department"],
    ["designation", "Designation"],
    ["employmentStatus", "Status"],
    ["reportingManager", "Reporting Manager"]
  ];
}

function announcementCard(row) {
  const posted = String(row.postedAt || "").replace("T", " ").slice(0, 16);
  const actions = isHrAdmin() ? `<div class="row-action-group"><button type="button" class="ghost-button" data-action="open" data-type="hrAnnouncement" data-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="ghost-button danger-text" data-action="delete-record-direct" data-type="hrAnnouncement" data-id="${escapeHtml(row.id)}">Delete</button></div>` : "";
  return `<article class="alert${row.pinned ? " hr-announcement-pinned" : ""}"><strong>${escapeHtml(row.pinned ? "📌 " : "")}${escapeHtml(row.title)}</strong><span>${escapeHtml(row.body)}</span><small>${escapeHtml(row.postedBy)} | ${escapeHtml(posted)}</small>${actions}</article>`;
}

function renderHrDashboard() {
  const myRecord = myEmployeeRecord();
  const myLeave = state.leaveRequests.filter((row) => row.userName === currentUserName());
  const pendingLeave = myLeave.filter((row) => row.status === "Pending").length;
  const approvedLeave = myLeave.filter((row) => row.status === "Approved").length;
  const myPayslips = state.payslips.filter((row) => row.userName === currentUserName());
  const announcements = [...state.hrAnnouncements].sort((a, b) => (b.pinned - a.pinned) || (b.postedAt || "").localeCompare(a.postedAt || ""));
  return `${postLoginAnnouncementNotice()}<section class="kpi-grid">
      ${kpi("My Pending Leave", pendingLeave, "Awaiting approval")}
      ${kpi("My Approved Leave", approvedLeave, "This account")}
      ${kpi("My Payslips", myPayslips.length, "Available to view")}
      ${kpi("Announcements", announcements.length, "Company wide")}
    </section>
    ${isHrAdmin() ? `<section class="panel"><div class="panel-header"><div><h2>HR Admin Actions</h2></div></div>
      <div class="action-row">
        <button type="button" data-action="goto-module" data-module="Leave Approvals">Open Leave Approvals</button>
        <button type="button" class="secondary-button" data-action="goto-module" data-module="HR Calendar &amp; Rules">HR Calendar &amp; Rules</button>
        <button type="button" class="secondary-button" data-action="goto-module" data-module="HR Leave Balances">HR Leave Balances</button>
        <button type="button" class="secondary-button" data-action="goto-module" data-module="HR Leave Policies">HR Leave Policies</button>
      </div>
    </section>` : ""}
    <section class="split-grid">
      <article class="panel">${panelHeader("My Profile")}
        ${myRecord
          ? `<p><strong>${escapeHtml(myRecord.fullName || currentUserName())}</strong></p><p>${escapeHtml(myRecord.designation || "")} ${myRecord.department ? "| " + escapeHtml(myRecord.department) : ""}</p>`
          : empty("No employee profile on file yet. Contact HR to set one up.")}
      </article>
      <article class="panel">${panelHeader("Latest Announcements")}
        ${announcements.length ? announcements.slice(0, 3).map(announcementCard).join("") : empty("No announcements yet.")}
      </article>
    </section>`;
}

function renderHrProfile() {
  const myRecord = myEmployeeRecord() || {};
  return `<section class="panel">${panelHeader("My Profile")}
    <form class="stack-form" data-form="employee-profile">
      <p class="empty-state">Keep your contact and identity information up to date. Employment details are managed by HR.</p>
      <div class="detail-grid">
        ${input("userName", "Login User Name", currentUserName(), true)}
        ${input("fullName", "Full Name", myRecord.fullName || "")}
        ${input("phone", "Mobile Number", myRecord.phone || "", false, "tel")}
        ${input("personalEmail", "Personal Email", myRecord.personalEmail || "", false, "email")}
        ${input("nationality", "Nationality", myRecord.nationality || "")}
        ${input("dateOfBirth", "Date of Birth", myRecord.dateOfBirth || "", false, "date")}
        ${input("civilIdNo", "Civil ID Number", myRecord.civilIdNo || "")}
        ${input("passportNo", "Passport Number", myRecord.passportNo || "")}
        ${input("passportExpiry", "Passport Expiry Date", myRecord.passportExpiry || "", false, "date")}
        ${input("emergencyContactName", "Emergency Contact Name", myRecord.emergencyContactName || "")}
        ${input("emergencyContactPhone", "Emergency Contact Number", myRecord.emergencyContactPhone || "", false, "tel")}
      </div>
      ${textarea("currentAddress", "Current Address", myRecord.currentAddress || "", false, 3)}
      ${textarea("permanentAddress", "Permanent Address", myRecord.permanentAddress || "", false, 3)}
      <div class="detail-grid">
        ${input("employeeCode", "Employee Code", myRecord.employeeCode || "", true)}
        ${input("department", "Department", myRecord.department || "", true)}
        ${input("designation", "Designation", myRecord.designation || "", true)}
        ${input("joinDate", "Join Date", myRecord.joinDate || "", true, "date")}
        ${input("employmentStatus", "Employment Status", myRecord.employmentStatus || "", true)}
        ${input("reportingManager", "Reporting Manager", myRecord.reportingManager || "", true)}
      </div>
      <button type="submit">Save My Profile</button>
    </form>
    ${employeeProfileDocumentsPanel()}
  </section>`;
}

function employeeProfileDocumentsPanel() {
  const documents = Array.isArray(state.employeeProfileDocuments) ? state.employeeProfileDocuments : [];
  const documentTypes = [
    ["Employee Photo", "Profile Photo", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Civil ID Front", "Civil ID — Front", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Civil ID Back", "Civil ID — Back", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Passport Front", "Passport — Front", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Passport Back", "Passport — Back", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Work Permit", "Work Permit", "PDF, JPG or PNG • Maximum 10 MB"],
    ["Other", "Other Document", "PDF, JPG or PNG • Maximum 10 MB"]
  ];
  return `<section class="form-section employee-document-panel"><h3>Personal Documents</h3>
    <p class="empty-state">Your documents are stored privately. HR-locked documents remain viewable but cannot be changed or deleted.</p>
    <div class="employee-document-list">
      ${documentTypes.map(([type, label, help]) => {
        const documentItem = documents.find((item) => item.type === type);
        const locked = documentItem?.locked === true;
        return `<article class="employee-document-row${locked ? " is-locked" : ""}">
          <div class="employee-document-row-main"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small>${type === "Employee Photo" && documentItem?.storageUrl ? `<img class="employee-profile-thumbnail" src="${escapeHtml(documentItem.storageUrl)}" alt="Employee profile" />` : ""}</div>
          <span class="${documentItem?.storageUrl ? "document-uploaded" : "document-missing"}">${documentItem?.storageUrl ? "Uploaded" : "Not uploaded"}</span>
          ${locked ? `<span class="document-locked">Locked by HR</span>` : ""}
          <div class="employee-document-row-actions">${documentItem?.storageUrl ? `<button type="button" class="secondary-button" data-action="view-employee-document" data-document-no="${escapeHtml(documentItem.documentNo)}">View</button>` : ""}${documentItem?.storageUrl && !locked ? `<button type="button" class="secondary-button" data-action="delete-employee-document" data-document-no="${escapeHtml(documentItem.documentNo)}">Delete</button>` : ""}${!locked ? `<button type="button" class="secondary-button" data-action="upload-employee-document" data-document-type="${escapeHtml(type)}">${documentItem?.storageUrl ? "Change" : "Upload"}</button>` : ""}</div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function renderHrDirectory() {
  return `<section class="panel">${panelHeader("Employee Directory")}
    ${table("employee", state.employees, employeeColumns(), false)}
  </section>`;
}

function renderHrLeave() {
  const myLeave = state.leaveRequests.filter((row) => row.userName === currentUserName());
  return `<section class="panel">${panelHeader("My Leave")}
    <div class="action-row"><button type="button" data-action="new-record" data-type="leaveRequest">Apply for Leave</button></div>
    ${table("leaveRequest", myLeave, leaveRequestColumns(), false)}
  </section>`;
}

function renderHrPayslips() {
  const myPayslips = state.payslips.filter((row) => row.userName === currentUserName());
  return `<section class="panel">${panelHeader("My Payslips")}
    ${table("payslip", myPayslips, payslipColumns(), false)}
  </section>`;
}

function renderHrAnnouncements() {
  const announcements = [...state.hrAnnouncements].sort((a, b) => (b.pinned - a.pinned) || (b.postedAt || "").localeCompare(a.postedAt || ""));
  return `<section class="panel">${panelHeader("Announcements")}
    ${announcements.length ? announcements.map(announcementCard).join("") : empty("No announcements yet.")}
  </section>`;
}

function renderHrAdminEmployees() {
  if (!isHrAdmin()) return `<section class="panel">${panelHeader("Access Denied")}${empty("Only HR Admin can manage employee records.")}</section>`;
  return `<section class="panel">${panelHeader("Manage Employees")}
    <div class="action-row"><button type="button" data-action="new-record" data-type="employee">New Employee</button></div>
    ${table("employee", state.employees, employeeColumns())}
  </section>`;
}

function renderHrAdminLeaveApprovals() {
  if (!isHrAdmin()) return `<section class="panel">${panelHeader("Access Denied")}${empty("Only HR Admin can review leave requests.")}</section>`;
  return `<section class="panel">${panelHeader("Leave Approvals")}
    ${table("leaveRequest", state.leaveRequests, leaveRequestColumns())}
  </section>`;
}

function renderHrAdminPayslips() {
  if (!isHrAdmin()) return `<section class="panel">${panelHeader("Access Denied")}${empty("Only HR Admin can manage payslips.")}</section>`;
  return `<section class="panel">${panelHeader("Manage Payslips")}
    <div class="action-row"><button type="button" data-action="new-record" data-type="payslip">Issue Payslip</button></div>
    ${table("payslip", state.payslips, payslipColumns(), false)}
    ${hrAdminDeletePanel("payslip", "Payslip")}
  </section>`;
}

function renderHrAdminAnnouncements() {
  if (!isHrAdmin()) return `<section class="panel">${panelHeader("Access Denied")}${empty("Only HR Admin can post announcements.")}</section>`;
  const announcements = [...state.hrAnnouncements].sort((a, b) => (b.pinned - a.pinned) || (b.postedAt || "").localeCompare(a.postedAt || ""));
  return `<section class="panel">${panelHeader("Post Announcement")}
    <div class="action-row"><button type="button" data-action="new-record" data-type="hrAnnouncement">New Announcement</button></div>
    ${announcements.length ? announcements.map(announcementCard).join("") : empty("No announcements yet.")}
  </section>`;
}

function portalCustomerCount() {
  return Array.isArray(state.customerUsers) ? state.customerUsers.length : 0;
}

function dashboardInvoiceRows() {
  const completedStatuses = new Set(["approved", "sent", "paid", "overdue", "issued", "completed"]);
  return filteredRows(visibleRows(state.invoices)).filter((row) => completedStatuses.has(String(row.status || "").trim().toLowerCase()));
}

function dashboardBranchKpi(title, invoiceRows, metric, valueForRow, caption) {
  const branches = [["Kuwait HO", "KWD"], ["Dubai", "AED"]];
  const cells = branches.map(([branch, currency]) => {
    const branchRows = invoiceRows.filter((row) => {
      const linkedShipment = state.shipments.find((shipment) => shipment.jobNo === row.shipmentNo);
      const rowBranch = String(row.branch || linkedShipment?.branch || "Kuwait HO").trim().toLowerCase();
      return branch === "Dubai" ? /dubai|dxb/.test(rowBranch) : !/dubai|dxb/.test(rowBranch);
    });
    const total = branchRows.reduce((sum, row) => sum + Number(valueForRow(row) || 0), 0);
    return `<div class="kpi-branch-cell"><small>${escapeHtml(branch)}</small><strong>${escapeHtml(currency)} ${escapeHtml(money(total))}</strong></div>`;
  }).join("");
  return `<article class="kpi kpi-branch" data-dashboard-metric="${escapeHtml(metric)}" role="button" tabindex="0"><span>${escapeHtml(title)}</span><div class="kpi-branch-grid">${cells}</div><small>${escapeHtml(caption)}</small></article>`;
}

function renderDashboard() {
  const rows = filteredRows(visibleRows(state.shipments));
  const invoiceRows = dashboardInvoiceRows();
  const open = liveShipmentDataReady ? rows.filter(shipmentIsOpen).length : "—";
  const transit = liveShipmentDataReady ? rows.filter(shipmentIsInTransit).length : "—";
  const pod = liveShipmentDataReady ? rows.filter(shipmentNeedsPendingPod).length : "—";
  const unbilled = liveShipmentDataReady ? rows.filter(shipmentIsUnbilled).length : "—";
  const closedJobs = liveShipmentDataReady ? rows.filter(shipmentIsClosedJob).length : "—";
  const liveShipmentCaption = liveShipmentDataReady ? "Draft and Booked jobs remaining" : "Waiting for live data";
  const pendingPodCaption = liveShipmentDataReady ? "Delivered but POD not uploaded" : "Waiting for live data";
  const unbilledCaption = liveShipmentDataReady ? "Invoice not completed" : "Waiting for live data";
  const closedJobsCaption = liveShipmentDataReady ? "Delivered + live POD uploaded" : "Waiting for live data";
  const pendingRequests = pendingRequestCount();
  const pendingCustomerRequests = state.shipmentRequests.filter((row) => ["SUBMITTED", "PENDING_REVIEW"].includes(String(row.status || "").toUpperCase())).length;
  const pendingCharges = state.additionalCharges.filter((row) => row.status === "Pending Approval").length;
  // The KPI counts above still reflect every shipment, but the table itself only needs to show a
  // recent slice - rendering the full register here (potentially thousands of rows, on every
  // render, which happens on nearly every click anywhere in the app) was the main cause of the
  // dashboard feeling slow. The full list is one click away on the Shipment Register.
  const recentRows = [...rows].sort((left, right) => String(right.bookingDate || "").localeCompare(String(left.bookingDate || ""))).slice(0, 50);
  const dashboardTableNote = rows.length > recentRows.length
    ? `<p class="empty-state">Showing the most recent ${recentRows.length} of ${rows.length} shipments. Open Shipment Register for the full list.</p>`
    : "";
  if (!isAdminSession()) {
    return `
      ${postLoginAnnouncementNotice()}
      <section class="kpi-grid">
        ${kpi("Open Shipments", open, liveShipmentCaption, "open-shipments")}
        ${kpi("In Transit", transit, "Status: In-Transit", "in-transit")}
        ${kpi("Pending POD", pod, pendingPodCaption, "pending-pod")}
        ${kpi("Unbilled", unbilled, unbilledCaption, "unbilled")}
        ${kpi("Closed Jobs", closedJobs, closedJobsCaption, "closed-jobs")}
        ${kpi("Pending Requests", pendingRequests, "Your pending approvals", "pending-requests")}
        ${kpi("Customer Requests", pendingCustomerRequests, "Shipment requests to review", "customer-requests")}
      </section>
      <section class="panel">${panelHeader("My Shipments", "Limited Dashboard")} ${dashboardColumnSettingsMarkup()} ${dashboardTableNote} ${table("shipment", recentRows, dashboardShipmentColumns(), undefined, "shipment:dashboard")}</section>
      ${incomingShipmentPanel()}`;
  }
  return `
    ${postLoginAnnouncementNotice()}
    <section class="kpi-grid">
      ${kpi("Open Shipments", open, liveShipmentCaption, "open-shipments")}
      ${kpi("In Transit", transit, "Status: In-Transit", "in-transit")}
      ${kpi("Pending POD", pod, pendingPodCaption, "pending-pod")}
      ${kpi("Unbilled", unbilled, unbilledCaption, "unbilled")}
      ${kpi("Closed Jobs", closedJobs, closedJobsCaption, "closed-jobs")}
      ${kpi("Pending Requests", pendingRequests, "Need admin action", "pending-requests")}
      ${kpi("Customer Requests", pendingCustomerRequests, "Shipment requests to review", "customer-requests")}
      ${kpi("Customer Portal", portalCustomerCount(), "Customer users", "customer-portal")}
      ${dashboardBranchKpi("Month Revenue", invoiceRows, "month-revenue", (row) => Number(row.revenue || 0), "Invoice totals by branch")}
      ${canViewProfitMargin() ? dashboardBranchKpi("Gross Profit", invoiceRows, "gross-profit", (row) => Number(row.revenue || 0) - Number(row.supplierCost || row.totalCost || 0), "Invoice revenue minus invoice cost by branch") : ""}
    </section>
    <section class="split-grid single-panel dashboard-shipment-register">
      <article class="panel">${panelHeader("Operational Shipments", "Dashboard")} ${dashboardColumnSettingsMarkup()} ${dashboardTableNote} ${table("shipment", recentRows, dashboardShipmentColumns(), undefined, "shipment:dashboard")}</article>
    </section>
    ${incomingShipmentPanel()}
    <section class="split-grid single-panel dashboard-alert-row">
      <details class="panel collapsible-section dashboard-alert-panel">
        <summary>${panelHeader("Exception Alerts")}<span class="dashboard-alert-toggle" aria-hidden="true"></span></summary>
        <div class="alert-list">
          ${alert("Jobs missing tariff/rate", "AFS-2605005 needs tariff selection before invoice.")}
          ${alert("Delivered but not invoiced", "AFS-2605003 is delivered and waiting for billing.")}
          ${alert("Pending POD", `${pod} shipments need POD upload or dispute update.`)}
          ${alert("Admin requests waiting", `${pendingRequests} pending request(s) need admin approval. Open User Management / Settings to review.`)}
          ${alert("Additional charges waiting", `${pendingCharges} additional charge entry/changes are waiting for approval.`)}
        </div>
      </details>
    </section>`;
}

function dashboardMetricConfig(metric) {
  if (metric === "customer-requests") {
    return {
      title: "Customer Requests",
      summary: "Shipment requests waiting on your review",
      rows: state.shipmentRequests.filter((row) => ["SUBMITTED", "PENDING_REVIEW"].includes(String(row.status || "").toUpperCase())),
      columns: shipmentRequestColumns()
    };
  }

  if (metric === "customer-total-shipments") {
    return {
      title: "Total Shipments",
      summary: "Your shipment records and submitted requests",
      rows: [...portalRows("shipments"), ...portalRows("shipmentRequests")],
      columns: customerShipmentColumns()
    };
  }

  if (metric === "customer-pending-requests") {
    return {
      title: "Pending Requests",
      summary: "Requests waiting on company review",
      rows: portalRows("shipmentRequests").filter((row) => ["SUBMITTED", "PENDING_REVIEW"].includes(portalStatus(row.status))),
      columns: customerRequestColumns()
    };
  }

  if (metric === "customer-approved-requests") {
    return {
      title: "Approved Requests",
      summary: "Approved or auto-approved requests",
      rows: portalRows("shipmentRequests").filter((row) => ["AUTO_APPROVED", "APPROVED", "COMPLETED"].includes(portalStatus(row.status))),
      columns: customerRequestColumns()
    };
  }

  if (metric === "customer-sent-back-requests") {
    return {
      title: "Sent Back Requests",
      summary: "Requests sent back by the company for review",
      rows: portalRows("shipmentRequests").filter((row) => portalStatus(row.status) === "SENT_BACK"),
      columns: customerRequestColumns()
    };
  }

  if (metric === "customer-notifications") {
    return {
      title: "Notifications",
      summary: "Portal messages",
      rows: portalRows("notifications"),
      columns: customerNotificationColumns()
    };
  }

  const rows = filteredRows(visibleRows(state.shipments));
  if (metric === "open-shipments") {
    const selected = liveShipmentDataReady ? rows.filter(shipmentIsOpen) : [];
    return {
      title: "Open Shipments",
      summary: "All live shipment records",
      rows: selected,
      columns: dashboardShipmentColumns()
    };
  }

  if (metric === "in-transit") {
    const selected = liveShipmentDataReady ? rows.filter(shipmentIsInTransit) : [];
    return {
      title: "In Transit",
      summary: "Shipments whose status is In-Transit",
      rows: selected,
      columns: dashboardShipmentColumns()
    };
  }

  if (metric === "pending-pod") {
    const selected = liveShipmentDataReady ? rows.filter(shipmentNeedsPendingPod) : [];
    return {
      title: "Pending POD",
      summary: "Delivered shipments whose POD is not uploaded",
      rows: selected,
      columns: dashboardShipmentColumns()
    };
  }

  if (metric === "unbilled") {
    const selected = liveShipmentDataReady ? rows.filter(shipmentIsUnbilled) : [];
    return {
      title: "Unbilled",
      summary: "Shipments whose invoice is not completed",
      rows: selected,
      columns: dashboardShipmentColumns()
    };
  }

  if (metric === "closed-jobs") {
    const selected = liveShipmentDataReady ? rows.filter(shipmentIsClosedJob) : [];
    return {
      title: "Closed Jobs",
      summary: liveShipmentDataReady ? "Delivered shipments with a live uploaded POD" : "Waiting for live shipment and POD data",
      rows: selected,
      columns: dashboardShipmentColumns()
    };
  }

  if (metric === "pending-requests") {
    const selected = allUserRequests().filter((row) => String(row.status || "").toLowerCase() === "pending");
    return {
      title: "Pending Requests",
      summary: "User and admin requests waiting for review",
      rows: selected,
      columns: userRequestColumns()
    };
  }

  if (metric === "month-revenue" || metric === "gross-profit") {
    const invoiceRows = dashboardInvoiceRows();
    const selected = invoiceRows.map((row) => ({
      ...row,
      profit: Number(row.revenue || 0) - Number(row.supplierCost || 0)
    }));
    return {
      title: metric === "month-revenue" ? "Month Revenue" : "Gross Profit",
      summary: metric === "month-revenue" ? "Invoiced revenue by record" : "Invoiced profit by record",
      rows: selected,
      columns: [
        ["invoiceNo", "Invoice"],
        ["customer", "Consignee"],
        ["shipmentNo", "Shipment"],
        ["revenue", "REVENUE"],
        ["supplierCost", "COST"],
        ["profit", "PROFIT"]
      ]
    };
  }

  return null;
}

function dashboardMetricTableType(metric) {
  if (metric === "pending-requests") return "userRequest";
  if (metric === "customer-requests") return "shipmentRequest";
  if (metric === "month-revenue" || metric === "gross-profit") return "invoice";
  if (metric === "customer-total-shipments") return "customerShipment";
  if (["customer-pending-requests", "customer-approved-requests", "customer-sent-back-requests"].includes(metric)) return "customerRequest";
  if (metric === "customer-notifications") return "customerNotification";
  return "shipment";
}

function exportDashboardMetricExcel(metric) {
  const config = dashboardMetricConfig(metric);
  if (!config || !config.rows.length || !config.columns.length) {
    notifyDenied("Export not ready", "No rows are available for this dashboard card.");
    return;
  }
  const tableType = dashboardMetricTableType(metric);
  const scope = `metric:${metric}`;
  const headers = config.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const rows = config.rows.map((row, index) => {
    const cells = config.columns.map(([key]) => {
      const rawValue = key === "slNo" ? index + 1 : displayCellValue(tableType, key, row, index);
      return `<td>${escapeHtml(display(rawValue ?? ""))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #b8c2cc;padding:6px;text-align:left}th{background:#e7eef5;font-weight:700}</style></head><body><h2>${escapeHtml(config.title)}</h2><p>${escapeHtml(config.summary)}</p><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${config.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${today()}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  notifySuccess("Excel export ready", `${config.rows.length} row(s) exported from ${config.title}.`);
}
function openDashboardMetricDialog(metric, options = {}) {
  const config = dashboardMetricConfig(metric);
  if (!config) return;
  const filterScope = `metric:${metric}`;
  openDialog({
    title: `${config.title} Details`,
    typeLabel: "Dashboard",
    body: `
      <div class="dashboard-popup-shell">
        <div class="report-preview-shell">
        <div class="report-preview-page">
          <div class="report-preview-heading">
            <div>
              <h3>${escapeHtml(config.title)}</h3>
              <p>${escapeHtml(config.summary)}</p>
            </div>
            <span class="status-badge neutral">${escapeHtml(String(config.rows.length))}</span>
          </div>
          <div class="action-row dashboard-metric-actions">
            <button type="button" class="secondary-button" data-action="export-dashboard-metric" data-dashboard-metric="${escapeHtml(metric)}" ${config.rows.length ? "" : "disabled"}>Export Excel</button>
          </div>
          ${registerColumnSettingsMarkup(filterScope, `${config.title} columns`, config.columns)}
          ${config.rows.length ? table(dashboardMetricTableType(metric), config.rows, config.columns, !metric.startsWith("customer-"), filterScope, false) : `<p class="empty-state">No matching records found.</p>`}
        </div>
      </div>
      </div>
    `,
    saveLabel: "Close",
    singleColumn: true,
    onSave() {
      recordDialog.close();
    },
    afterOpen() {
      if (!options.focusFilter || !options.filterKey) return;
      const field = dialogBody.querySelector(`[data-column-filter][data-filter-scope="${filterScope}"][data-filter-key="${options.filterKey}"]`);
      if (!field) return;
      field.focus({ preventScroll: true });
      const cursor = field.value.length;
      field.setSelectionRange(cursor, cursor);
    }
  });
}

function openCustomerShipmentHistory(customerCode, range = {}) {
  const customer = state.customers.find((row) => String(row.code || "").toLowerCase() === String(customerCode || "").toLowerCase());
  if (!customer) return;
  const from = String(range.from || "").slice(0, 10);
  const to = String(range.to || "").slice(0, 10);
  state.ui.customerShipmentHistory = { customerCode: customer.code, from, to };
  const rows = state.shipments.filter((shipmentItem) => {
    const belongsToCustomer = String(shipmentItem.customerCode || "").toLowerCase() === String(customer.code || "").toLowerCase()
      || String(shipmentItem.customer || "").toLowerCase() === String(customer.name || "").toLowerCase()
      || String(shipmentItem.consigneeName || "").toLowerCase() === String(customer.name || "").toLowerCase();
    const shipmentDate = String(shipmentItem.bookingDate || shipmentItem.shipmentDate || "").slice(0, 10);
    return belongsToCustomer && (!from || !shipmentDate || shipmentDate >= from) && (!to || !shipmentDate || shipmentDate <= to);
  });
  openDialog({
    title: `Customer Shipments — ${customer.code}`,
    typeLabel: customer.name || "Customer",
    singleColumn: true,
    saveLabel: "Apply Date Filter",
    secondaryLabel: "Close",
    body: `<div class="form-grid"><label>From Date<input name="customerShipmentFrom" type="date" value="${escapeHtml(from)}"></label><label>To Date<input name="customerShipmentTo" type="date" value="${escapeHtml(to)}"></label></div><div class="action-row customer-performance-actions"><button type="button" class="secondary-button" data-dialog-action="export-customer-performance" ${rows.length ? "" : "disabled"}>Export Excel</button></div><p class="empty-state">${escapeHtml(String(rows.length))} shipment(s) for ${escapeHtml(customer.name)}.</p>${registerColumnSettingsMarkup("shipment:customer-history", "Customer shipment columns", shipmentColumnDefaults("shipment:customer-history"))}${table("shipment", rows, shipmentColumns("shipment:customer-history"), false, "shipment:customer-history")}`,
    onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      openCustomerShipmentHistory(customer.code, { from: data.customerShipmentFrom, to: data.customerShipmentTo });
    },
    onSecondary() { recordDialog.close(); },
    afterOpen: () => {
      dialogBody.querySelector("[data-dialog-action='export-customer-performance']")?.addEventListener("click", () => {
        exportCustomerPerformanceExcel(customer, rows, { from, to });
      });
    }
  });
}

function exportCustomerPerformanceExcel(customer, rows, range = {}) {
  const columns = shipmentColumns("shipment:customer-history");
  if (!customer || !rows.length || !columns.length) {
    notifyDenied("Export not ready", "No customer shipment records are available for export.");
    return;
  }
  const customerLabel = `${customer.code}${customer.name ? ` — ${customer.name}` : ""}`;
  const headers = columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const sortedRows = [...rows].sort((left, right) => {
    const dateOrder = String(left.bookingDate || left.shipmentDate || "").localeCompare(String(right.bookingDate || right.shipmentDate || ""));
    return dateOrder || String(left.jobNo || "").localeCompare(String(right.jobNo || ""));
  });
  const bodyRows = sortedRows.map((row, index) => {
    const cells = columns.map(([key]) => {
      const rawValue = key === "slNo" ? index + 1 : displayCellValue("shipment", key, row, index);
      return `<td>${escapeHtml(display(rawValue ?? ""))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const dateSummary = [range.from && `From: ${range.from}`, range.to && `To: ${range.to}`].filter(Boolean).join(" | ") || "All dates";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #b8c2cc;padding:6px;text-align:left}th{background:#e7eef5;font-weight:700}.meta{margin:4px 0;color:#435466}</style></head><body><h2>Customer Performance</h2><p class="meta"><strong>Customer:</strong> ${escapeHtml(customerLabel)}</p><p class="meta"><strong>Date range:</strong> ${escapeHtml(dateSummary)}</p><p class="meta"><strong>Total shipments:</strong> ${sortedRows.length}</p><table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `customer-performance-${String(customer.code || "customer").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${today()}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  notifySuccess("Excel export ready", `${sortedRows.length} shipment(s) exported for ${customerLabel}.`);
}

function openCustomerDetails(customerCode) {
  const customer = state.customers.find((row) => String(row.code || "").toLowerCase() === String(customerCode || "").toLowerCase());
  if (!customer) return;
  const adminActing = isAdminSession();
  openDialog({
    title: `Customer Details — ${customer.code}`,
    typeLabel: customer.name || "Customer",
    saveLabel: "Save Changes",
    secondaryLabel: "Close",
    body: `
      ${input("code", "Customer Code", customer.code || "", true)}
      ${strictSelect("status", "Status", customerStatusOptions(), normalizedCustomerStatus(customer.status))}
      ${input("name", "Name", customer.name || "")}
      ${input("locationOrLane", "Lane / Location", customer.locationOrLane || "")}
      ${textarea("fullAddress", "Full Address / Shipping Delivery Address", customer.fullAddress || "", false, 3)}
      ${input("email", "Contact Email", customer.email || "", false, "email")}
      ${input("mobile", "Mobile Number", customer.mobile || "")}
      ${strictSelect("terms", "Credit Limit Days", creditLimitOptions(), normalizedCreditLimit(customer.terms))}
      ${strictSelect("branch", "Branch", branchOptions(), normalizeBranchName(customer.branch || defaultUserBranch()))}
      <div class="action-row customer-detail-actions">
        <button type="button" class="secondary-button" data-dialog-action="check-performance">Check Performance</button>
        ${strictSelect("blockBranch", "Branch to Block / Unblock", branchOptions(), normalizeBranchName(customer.branch || defaultUserBranch()))}
        <button type="button" class="secondary-button" data-dialog-action="block-customer">${adminActing ? "Block" : "Block Request"}</button>
        <button type="button" class="secondary-button" data-dialog-action="unblock-customer">${adminActing ? "Unblock" : "Unblock Request"}</button>
      </div>
      <p class="empty-state">${adminActing ? "As admin, block/unblock applies immediately - no approval needed." : "Block/unblock requests are sent to admin and shown in User Management / Settings."} Choose which branch the block/unblock applies to before clicking Block or Unblock.${customer.blockedBranches ? ` Currently blocked branch(es): ${escapeHtml(customer.blockedBranches)}.` : ""}</p>
    `,
    async onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      const name = String(data.name || "").trim();
      if (!name) {
        notifyDenied("Not saved", "Enter a name first.");
        return;
      }
      if (isDuplicateCustomerDetails(name, data.email, data.mobile, customer.code)) {
        notifyDuplicateCustomer();
        return;
      }
      const originalSnapshot = { ...customer };
      Object.assign(customer, {
        name,
        locationOrLane: String(data.locationOrLane || "").trim(),
        fullAddress: String(data.fullAddress || "").trim(),
        email: String(data.email || "").trim(),
        mobile: String(data.mobile || "").trim(),
        terms: normalizedCreditLimit(data.terms),
        status: normalizedCustomerStatus(data.status),
        branch: normalizeBranchName(data.branch || defaultUserBranch())
      });
      const saved = await persistRecord("customers", customer);
      if (!saved) {
        Object.assign(customer, originalSnapshot);
        notifyDenied("Not saved", "This change could not be saved to the server. Please try again.");
        return;
      }
      addHistory("Updated customer", customer.code);
      saveState();
      recordDialog.close();
      notifySuccess("Customer updated", `${customer.code} was saved successfully.`);
      render();
    },
    onSecondary() { recordDialog.close(); },
    afterOpen: () => {
      dialogBody.querySelector("[data-dialog-action='check-performance']")?.addEventListener("click", () => {
        recordDialog.close();
        openCustomerShipmentHistory(customer.code);
      });
      dialogBody.querySelector("[data-dialog-action='block-customer']")?.addEventListener("click", async () => {
        const chosenBranch = dialogValue("blockBranch") || customer.branch || defaultUserBranch();
        recordDialog.close();
        await submitBlockRequest("customers", customer.code, "Block", chosenBranch);
      });
      dialogBody.querySelector("[data-dialog-action='unblock-customer']")?.addEventListener("click", async () => {
        const chosenBranch = dialogValue("blockBranch") || customer.branch || defaultUserBranch();
        recordDialog.close();
        await submitBlockRequest("customers", customer.code, "Unblock", chosenBranch);
      });
    }
  });
}

function adminTopRequestsPanel() {
  if (!isAdminSession()) return "";
  return `<section class="split-grid single-panel admin-request-strip">
    <article class="panel">${panelHeader("All User Requests", "Admin")}
      ${safeTable("userRequest", filteredRows(allUserRequests()), userRequestColumns(), "No user requests are loaded yet.")}
    </article>
  </section>`;
}

function allUserRequests() {
  const blockRows = (state.unblockRequests || []).map((row) => ({
    ...row,
    sourceType: "unblock",
    target: row.targetType || "Block / Unblock",
    referenceNo: row.referenceNo || row.customerName || "",
    details: row.reason || ""
  }));
  const adminRows = (state.adminRequests || []).map((row) => ({
    ...row,
    sourceType: "adminRequest",
    target: row.targetModule || "Admin Request",
    customerName: row.targetModule || "",
    details: row.details || ""
  }));
  return [...blockRows, ...adminRows].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
}

function adminDeletePanel(type, label, note = "") {
  if (!isAdminSession()) return "";
  return `<section class="panel admin-delete-panel">${panelHeader(`Delete ${label}`, "Admin Only")}
    ${deleteSelectorMarkup(type, `${label} To Delete`)}
    <div class="action-row">
      <button type="button" class="danger-button" data-action="delete-record" data-type="${escapeHtml(type)}">Delete ${escapeHtml(label)}</button>
    </div>
    ${note ? `<p class="empty-state">${escapeHtml(note)}</p>` : ""}
  </section>`;
}

function hrAdminDeletePanel(type, label, note = "") {
  if (!isHrAdmin()) return "";
  return `<section class="panel admin-delete-panel">${panelHeader(`Delete ${label}`, "HR Admin Only")}
    ${deleteSelectorMarkup(type, `${label} To Delete`)}
    <div class="action-row">
      <button type="button" class="danger-button" data-action="delete-record" data-type="${escapeHtml(type)}">Delete ${escapeHtml(label)}</button>
    </div>
    ${note ? `<p class="empty-state">${escapeHtml(note)}</p>` : ""}
  </section>`;
}

function renderShipments() {
  const rows = filteredRows(visibleRows(state.shipments));
  return `
    <section class="shipment-module-layout">
      <article class="panel shipment-landscape-actions">${panelHeader("Shipment Actions", "Open and manage a saved shipment")} ${shipmentLandscapeActionsMarkup()}</article>
      <article class="panel shipment-register-panel">${panelHeader("Shipment Register", "Editable records")} ${shipmentRegisterColumnsMarkup()} ${table("shipment", rows, shipmentColumns("shipment:register"))}</article>
    </section>
    ${adminDeletePanel("shipment", "Shipment", "Deleting a shipment also removes linked consolidation references, documents, invoices, and additional charges.")}`;
}

function quickOpenShipmentMarkup() {
  return `<div class="action-stack">
    <label>Open by Job No / AWB No / TCN No
      <input type="text" id="quickOpenShipmentInput" placeholder="Enter number and click Open" />
    </label>
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="quick-open-shipment">Open Shipment</button>
    </div>
  </div>`;
}

function shipmentLandscapeActionsMarkup() {
  return `<div class="shipment-quick-open-row">
    <label class="shipment-quick-open-field">Open by Job No / AWB No / TCN No
      <input type="text" id="quickOpenShipmentInput" list="shipmentQuickOpenOptions" placeholder="Type a number to search" autocomplete="off" />
      <datalist id="shipmentQuickOpenOptions">${shipmentQuickOpenOptionsMarkup()}</datalist>
    </label>
  </div>
  <div class="shipment-landscape-action-row">
    <button type="button" class="primary-button shipment-new-action" data-action="new-record" data-type="shipment" data-mode="shipment">New</button>
    <button type="button" class="secondary-button" data-action="quick-open-shipment">Open</button>
    <button type="button" class="secondary-button" data-action="generate-document" data-type="shipment">Generate Shipment</button>
    <button type="button" class="secondary-button" data-action="export-document" data-type="shipment">Save / Export</button>
    <button type="button" class="secondary-button" data-action="request-block" data-type="shipment">Block</button>
    <button type="button" class="secondary-button" data-action="request-unblock" data-type="shipment">Unblock</button>
  </div>`;
}

function shipmentQuickOpenOptionsMarkup() {
  const rows = visibleRows(state.shipments);
  const options = [];
  const seen = new Set();
  rows.forEach((row) => {
    [row.jobNo, row.airwayBillNo, row.tcnNumber].forEach((value) => {
      const number = String(value || "").trim();
      const key = number.toLowerCase();
      if (!number || seen.has(key)) return;
      seen.add(key);
      options.push(`<option value="${escapeHtml(number)}" label="${escapeHtml(shipmentOptionLabel(row))}"></option>`);
    });
  });
  return options.join("");
}

function renderConsolidation() {
  const rows = filteredRows(visibleRows(state.loads)).map((row) => {
    recalculateLoad(row);
    return row;
  });
  const selectedLoad = rows.find((row) => row.loadNo === state.ui.selectedLoadNo) || null;
  return `
    <section class="stacked-module-layout">
      <article class="panel module-action-panel-top">${panelHeader("Manifest Actions", "Select a manifest, then choose an action")}
        <div class="action-stack">
          ${loadSelectorMarkup("load", "Manifest to Open / Manage")}
          <div class="action-row module-action-buttons">
            <button type="button" class="primary-button" data-action="new-record" data-type="load">New Manifest</button>
            <button type="button" class="secondary-button" data-action="load-record" data-type="load">Open</button>
            <button type="button" class="secondary-button" data-action="generate-document" data-type="load">Generate Manifest</button>
            <button type="button" class="secondary-button" data-action="export-document" data-type="load">Save / Export</button>
          </div>
          <p class="empty-state">Select a manifest by typing to filter its number, route, status, and transport details. Existing manifest actions use the same handlers as before.</p>
        </div>
      </article>
      <article class="panel">${panelHeader("Manifest Register", "Loads / Trips")} ${registerColumnSettingsMarkup("load", "Manifest Register columns", defaultColumnLayouts().load)} ${table("load", rows, loadColumns(), false, "load")}
        ${selectedLoad ? consolidationJobsPanel(selectedLoad) : `<div class="report-preview-empty"><p class="empty-state">Select a manifest from the list to open the related job numbers below.</p></div>`}
      </article>
    </section>
    ${adminDeletePanel("load", "Manifest", "Deleting a manifest removes the trip/manifest only. Shipments stay available.")}`;
}

function renderParties(key, label) {
  const rows = filteredRows(state[key]);
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader(`${label} Register`, "Master data")} ${registerColumnSettingsMarkup(key, `${label} Register columns`, defaultColumnLayouts()[key])} ${table(key, rows, partyColumns(key), false, key)}</article>
      ${moduleActionPanel(`${label} Actions`, key, `Open separate New and Load windows for ${label.toLowerCase()} records.`, actionChecklist([
        "New creates a fresh master-data entry window.",
        "Load opens an existing record to review or update."
      ]) + (key === "customers" ? "" : blockRequestControls(key, label)))}
    </section>
    ${adminDeletePanel(key, label)}`;
}

function renderTariffs() {
  const rows = filteredRows(visibleRows(state.tariffs));
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Rate Master", "Tariffs")} ${registerColumnSettingsMarkup("tariff", "Tariff Register columns", defaultColumnLayouts().tariff)} ${table("tariff", rows, tariffColumns(), false, "tariff")}</article>
      ${moduleActionPanel("Tariff Actions", "tariff", "Maintain tariff cards from separate New and Load popups just like the desktop layout.", documentActionControls("tariff", "Tariff"))}
    </section>
    ${adminDeletePanel("tariff", "Tariff")}`;
}

function renderDocuments() {
  const rows = filteredRows(documentRegisterRows(visibleRows(state.documents)));
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Document Library", "Attachments")} ${registerColumnSettingsMarkup("document", "Document Register columns", defaultColumnLayouts().document)} ${table("document", rows, documentColumns(), false, "document")}</article>
      ${moduleActionPanel("Document Actions", "document", "Separate popup windows are available for new document tags and for loading stored shipment files.")}
    </section>
    ${adminDeletePanel("document", "Document")}`;
}

function renderShipmentRequests() {
  const rows = filteredRows(state.shipmentRequests);
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Customer Shipment Requests", "Review Queue")} ${registerColumnSettingsMarkup("shipmentRequest", "Request Register columns", defaultColumnLayouts().shipmentRequest)} ${table("shipmentRequest", rows, shipmentRequestColumns())}</article>
      ${moduleActionPanel("Customer Request Actions", "shipmentRequest", "Open a request to review full details, then Approve, Reject, or Convert it into a shipment.", quickOpenShipmentRequestMarkup())}
    </section>
    ${adminDeletePanel("shipmentRequest", "Shipment Request")}`;
}

function quickOpenShipmentRequestMarkup() {
  return `<div class="action-stack">
    <label>Open by Request No
      <input type="text" id="quickOpenShipmentRequestInput" placeholder="Enter number and click Open" />
    </label>
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="quick-open-shipment-request">Open Request</button>
    </div>
  </div>`;
}

function renderQuotations() {
  const rows = filteredRows(visibleRows(state.quotations));
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Quotation Register", "Sales")} ${registerColumnSettingsMarkup("quotation", "Quotation Register columns", defaultColumnLayouts().quotation)} ${table("quotation", rows, quotationColumns())}</article>
      ${moduleActionPanel("Quotation Actions", "quotation", "Create a quotation, then convert it to a shipment once confirmed.", quickOpenQuotationMarkup())}
    </section>
    ${adminDeletePanel("quotation", "Quotation")}`;
}

function quickOpenQuotationMarkup() {
  return `<div class="action-stack">
    <label>Open by Quotation No
      <input type="text" id="quickOpenQuotationInput" placeholder="Enter number and click Open" />
    </label>
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="quick-open-quotation">Open Quotation</button>
    </div>
  </div>`;
}

function renderInvoices() {
  const rows = filteredRows(visibleRows(state.invoices));
  const canEnterBilling = canBillingSalesEntry() || canBillingCostEntry();
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Invoice Register", "Billing")} ${registerColumnSettingsMarkup("invoice", "Invoice Register columns", defaultColumnLayouts().invoice)} ${table("invoice", rows, invoiceColumns(), false, "invoice")}</article>
      ${canEnterBilling
        ? moduleActionPanel("Invoice Actions", "invoice", "Keep invoice creation and load/update in separate popup windows.", quickOpenInvoiceMarkup() + documentActionControls("invoice", "Bill"))
        : `<article class="panel">${panelHeader("Invoice Actions", "Restricted")}${empty("Your account has view-only access to billing.")}</article>`}
    </section>
    ${adminDeletePanel("invoice", "Invoice")}`;
}

function quickOpenInvoiceMarkup() {
  return `<div class="action-stack">
    <label>Open by Invoice No / Shipment No
      <input type="text" id="quickOpenInvoiceInput" placeholder="Enter number and click Open" />
    </label>
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="quick-open-invoice">Open Invoice</button>
    </div>
  </div>`;
}

function renderPod() {
  // A shipment that is already Delivered with its POD Uploaded is a Closed Job - it must not
  // appear again in this board or its Generate POD dropdown (the old filter compared status to
  // "Closed", a status value shipments never actually have, so it never actually excluded
  // anything).
  const rows = filteredRows(visibleRows(state.shipments).filter((row) => !shipmentIsClosedJob(row)));
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("POD Pending / Delivery Board", "Delivery")} ${registerColumnSettingsMarkup("shipment:pod", "POD Board columns", shipmentColumnDefaults("shipment:pod"))} ${table("shipment", rows, shipmentColumns(), undefined, "shipment:pod")}</article>
      <article class="panel">${panelHeader("POD Actions", "Delivery")}
        <div class="action-stack">
          <p class="empty-state">Select one saved shipment, then load delivery details, generate or export its POD, upload the signed POD after delivery, or view a POD already uploaded.</p>
          ${loadSelectorMarkup("pod", "Saved Records")}
          <div class="action-row pod-action-row">
            <button type="button" class="secondary-button" data-action="load-record" data-type="pod">Load</button>
            <button type="button" class="secondary-button" data-action="generate-document" data-type="pod">Generate POD</button>
            <button type="button" class="secondary-button" data-action="export-document" data-type="pod">Save / Export</button>
            <button type="button" class="secondary-button" data-action="upload-pod-file" data-type="pod">Upload POD File</button>
            <button type="button" class="secondary-button" data-action="view-pod-file" data-type="pod">View POD</button>
          </div>
        </div>
      </article>
    </section>
    ${adminDeletePanel("podDocument", "POD Document", "Deletes only the selected uploaded POD document; the shipment remains unchanged.")}`;
}

function renderShipmentStatus() {
  const rows = prioritizeBookedStatus(filteredRows(visibleRows(state.shipments)));
  return `
    <section class="stacked-module-layout">
      <article class="panel module-action-panel-top">${panelHeader("Status Actions", "Select a shipment, then choose an action")}
        <div class="action-stack">
          ${loadSelectorMarkup("status", "Shipment to Open / Update")}
          <div class="action-row module-action-buttons">
            <button type="button" class="primary-button" data-action="load-record" data-type="status">Open</button>
            <button type="button" class="secondary-button" data-action="send-status-email" data-type="status">Send Update</button>
          </div>
          <p class="empty-state">Type to filter by job number, AWB, customer, origin, destination, or status. Status changes continue to use the existing register and tracking-history handlers.</p>
        </div>
      </article>
      <article class="panel">${panelHeader("Shipment Status Register", "Click Job No for shipment details or AWB No for grouped status update")} ${registerColumnSettingsMarkup("shipmentStatus", "Shipment Status columns", shipmentStatusColumns())} ${shipmentStatusTable(rows)}</article>
    </section>
    ${adminDeletePanel("statusHistory", "Status History", "Deletes only the selected status-history entry; the shipment remains unchanged.")}`;
}

// Default ordering for the Shipment Status Register: Booked shipments listed first, everything
// else after in whatever order it was already in. This is only the starting order - it's a plain
// array sort, not tied to the column-filter/sort state, so clicking a column header to sort, or
// typing in a column filter box, both still work exactly as normal and simply take over from here.
function prioritizeBookedStatus(rows) {
  return [...rows].sort((left, right) => {
    const leftBooked = String(left?.status || "").trim().toLowerCase() === "booked" ? 0 : 1;
    const rightBooked = String(right?.status || "").trim().toLowerCase() === "booked" ? 0 : 1;
    return leftBooked - rightBooked;
  });
}



function shipmentStatusColumns() {
  const columns = shipmentColumns();
  const statusEntry = columns.find(([key]) => key === "status");
  const destinationIndex = columns.findIndex(([key]) => key === "destination");
  if (!statusEntry || destinationIndex === -1) return columns;
  const reordered = columns.filter(([key]) => key !== "status");
  const insertAt = reordered.findIndex(([key]) => key === "destination") + 1;
  reordered.splice(insertAt, 0, statusEntry);
  return reordered;
}

function shipmentStatusTable(rows) {
  const scope = "shipmentStatus";
  const columns = configurableColumns("shipment", shipmentStatusColumns(), scope);
  const filteredRows = applyColumnFilters(scope, rows, columns);
  const sortedRows = applySort(scope, filteredRows);
  const pageSize = 15;
  state.ui.tablePages = state.ui.tablePages || {};
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.ui.tablePages[scope] || 1)), totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const expandedJob = state.ui.expandedStatusJob || "";
  const expandedAwb = state.ui.expandedStatusAwb || "";
  const locked = isColumnWidthLocked(scope);
  const headCells = columns.map(([key, label]) => sortableHeaderCell("shipment", scope, key, label, locked)).join("");
  const filterRow = columnFilterRowMarkup(scope, columns, false);
  const widths = (state.ui.columnWidths || {})[scope];
  const tableStyle = widths && Object.keys(widths).length ? ` style="table-layout:fixed"` : "";
  const hasActiveFilter = Object.values(state.ui.columnFilters?.[scope] || {}).some((term) => String(term || "").trim());
  const body = sortedRows.length
    ? pageRows.map((row, index) => shipmentStatusRowMarkup(row, index + ((currentPage - 1) * pageSize), columns, expandedJob, expandedAwb)).join("")
    : `<tr><td colspan="${columns.length}">${empty(hasActiveFilter ? "No records match the column filters." : "No records found.")}</td></tr>`;
  const pager = totalPages > 1 ? `<div class="table-pagination"><span>Showing ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, sortedRows.length)} of ${sortedRows.length}</span><div><button type="button" class="secondary-button" data-action="table-page" data-page-scope="${scope}" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Previous</button><span>Page ${currentPage} / ${totalPages}</span><button type="button" class="secondary-button" data-action="table-page" data-page-scope="${scope}" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Next</button></div></div>` : "";
  return `${columnLockToggleMarkup(scope, locked)}<div class="table-wrap"><table${tableStyle}><thead><tr>${headCells}</tr>${filterRow}</thead><tbody>${body}</tbody></table></div>${pager}`;
}



function shipmentStatusRowMarkup(row, index, columns, expandedJob, expandedAwb) {
  const jobNo = String(row.jobNo || "").trim();
  const airwayBillNo = String(row.airwayBillNo || "").trim();
  const isJobExpanded = jobNo === expandedJob;
  const isAwbExpanded = Boolean(airwayBillNo) && airwayBillNo.toLowerCase() === String(expandedAwb || "").toLowerCase();
  const cells = columns
    .map(([key]) => {
      if (key === "jobNo") {
        return `<td><button type="button" class="table-inline-link" data-shipment-open data-shipment-id="${escapeHtml(jobNo)}" aria-label="Open shipment details for ${escapeHtml(jobNo)}">${escapeHtml(jobNo)}</button></td>`;
      }
      if (key === "airwayBillNo") {
        return `<td><button type="button" class="table-inline-link" data-action="toggle-status-awb" data-awb="${escapeHtml(airwayBillNo)}" aria-label="Update status for Airway Bill ${escapeHtml(airwayBillNo)}">${escapeHtml(airwayBillNo)}</button></td>`;
      }
      return `<td>${cellHtml("shipment", key, row, index)}</td>`;
    })
    .join("");
  const isExpanded = isJobExpanded || isAwbExpanded;
  const mainRow = `<tr class="${isExpanded ? "is-expanded" : ""}">${cells}</tr>`;
  if (isJobExpanded) return mainRow + shipmentStatusExpandRowMarkup(row, columns.length);
  if (isAwbExpanded) return mainRow + shipmentAwbExpandRowMarkup(airwayBillNo, columns.length);
  return mainRow;
}

function shipmentAwbExpandRowMarkup(airwayBillNo, colSpan) {
  const normalizedAwb = String(airwayBillNo || "").trim().toLowerCase();
  const group = state.shipments.filter((row) => String(row.airwayBillNo || "").trim().toLowerCase() === normalizedAwb);
  const representative = group[0];
  if (!representative) return "";
  const jobNumbers = group.map((row) => row.jobNo).filter(Boolean).join(", ");
  const history = (state.shipmentStatusHistory || [])
    .filter((entry) => group.some((row) => row.jobNo === entry.jobNo))
    .sort((left, right) => new Date(left.updatedAt || 0) - new Date(right.updatedAt || 0));
  return `<tr class="status-expand-row"><td colspan="${colSpan}">
    <div class="status-expand-panel">
      <div class="status-expand-panel-header">
        <h4>Update Status - AWB ${escapeHtml(airwayBillNo)}</h4>
        <button type="button" class="ghost-button" data-action="toggle-status-awb" data-awb="${escapeHtml(airwayBillNo)}">Collapse ▲</button>
      </div>
      <p class="empty-state">This AWB is linked to ${group.length} shipment(s): ${escapeHtml(jobNumbers)}. The selected status will be applied to every linked shipment across all branches.</p>
      <form data-form="status" class="inline-status-form">
        <input type="hidden" name="jobNo" value="${escapeHtml(representative.jobNo)}" />
        ${strictSelect("status", "Status", statusOptions(), representative.status)}
        ${input("date", "Date", today(), false, "date")}
        ${input("notes", "Manual Remark", "")}
        <div class="expected-arrival-field" data-expected-arrival-field ${isBranchTransferStatus(representative.status) || representative.expectedArrivalDate ? "" : "hidden"}>
          ${input("expectedArrivalDate", "Expected Arrival Date", representative.expectedArrivalDate || "", false, "date")}
        </div>
        <div class="action-row">
          <button type="submit" class="primary-button">Save AWB Status Update</button>
          <button type="button" class="secondary-button" data-action="send-status-email-row" data-id="${escapeHtml(representative.jobNo)}">Send Update</button>
        </div>
      </form>
      ${shipmentJourneyTimeline(history, representative)}
    </div>
  </td></tr>`;
}

function shipmentStatusExpandRowMarkup(row, colSpan) {
  const jobNo = row.jobNo;
  const history = (state.shipmentStatusHistory || [])
    .filter((entry) => entry.jobNo === jobNo)
    .sort((left, right) => new Date(left.updatedAt || 0) - new Date(right.updatedAt || 0));
  return `<tr class="status-expand-row"><td colspan="${colSpan}">
    <div class="status-expand-panel">
      <div class="status-expand-panel-header">
        <h4>Update Status - ${escapeHtml(jobNo)}</h4>
        <button type="button" class="ghost-button" data-action="toggle-status-row" data-id="${escapeHtml(jobNo)}">Collapse ▲</button>
      </div>
      <form data-form="status" class="inline-status-form">
        <input type="hidden" name="jobNo" value="${escapeHtml(jobNo)}" />
        ${strictSelect("status", "Status", statusOptions(), row.status)}
        ${input("date", "Date", today(), false, "date")}
        ${input("notes", "Manual Remark", "")}
        <div class="expected-arrival-field" data-expected-arrival-field ${isBranchTransferStatus(row.status) || row.expectedArrivalDate ? "" : "hidden"}>
          ${input("expectedArrivalDate", "Expected Arrival Date", row.expectedArrivalDate || "", false, "date")}
        </div>
        <div class="action-row">
          <button type="submit" class="primary-button">Save Status Update</button>
          <button type="button" class="secondary-button" data-action="send-status-email-row" data-id="${escapeHtml(jobNo)}">Send Update</button>
        </div>
      </form>
      ${shipmentJourneyTimeline(history, row)}
    </div>
  </td></tr>`;
}

function shipmentJourneyTimeline(history, shipmentItem = {}) {
  const alerts = shipmentDelayAlerts(shipmentItem);
  if (!history.length) {
    return `<section class="shipment-journey"><div class="shipment-journey-heading"><div><p class="eyebrow">Shipment Journey</p><h4>Tracking Timeline</h4></div></div>${shipmentDelayAlertMarkup(alerts)}${empty("No status history yet for this shipment.")}</section>`;
  }
  return `<section class="shipment-journey">
    <div class="shipment-journey-heading"><div><p class="eyebrow">Shipment Journey</p><h4>Tracking Timeline</h4><p class="empty-state">Oldest to newest</p></div></div>
    ${shipmentDelayAlertMarkup(alerts)}
    <div class="shipment-timeline">${history.map((entry, index) => shipmentTimelineCard(entry, index, history.length)).join("")}</div>
  </section>`;
}

function shipmentTimelineCard(entry, index, total) {
  const status = String(entry.status || "Status update");
  const normalizedStatus = status.toLowerCase();
  const tone = /cancel|reject|block|returned|damaged/.test(normalizedStatus) ? "cancelled" : /delay|hold|exception|inspection|waiting/.test(normalizedStatus) ? "delayed" : index === total - 1 ? "current" : "completed";
  const details = [
    ["From", entry.fromLocation],
    ["To", entry.toLocation],
    ["Location", entry.location],
    ["Carrier", entry.carrier],
    ["Vehicle No.", entry.vehicleNo],
    ["Flight No.", entry.flightNo],
    ["Vessel", entry.vessel],
    ["Departure", entry.departure],
    ["Arrival", entry.arrival]
  ].filter(([, value]) => String(value || "").trim());
  return `<article class="shipment-timeline-card ${tone}">
    <div class="shipment-timeline-rail" aria-hidden="true"><span class="shipment-timeline-dot">${shipmentStatusIcon(status)}</span>${index < total - 1 ? '<span class="shipment-timeline-line"></span>' : ""}</div>
    <div class="shipment-timeline-content">
      <div class="shipment-timeline-title"><h5>${escapeHtml(status)}</h5><span class="shipment-timeline-state">${tone === "current" ? "Current" : tone === "cancelled" ? "Cancelled" : tone === "delayed" ? "Attention" : "Completed"}</span></div>
      <div class="shipment-timeline-meta"><span><b>Date &amp; Time</b>${escapeHtml(formatShipmentTimelineDate(entry.updatedAt))}</span>${entry.updatedBy ? `<span><b>Updated By</b>${escapeHtml(entry.updatedBy)}</span>` : ""}</div>
      ${details.length ? `<div class="shipment-timeline-details">${details.map(([label, value]) => `<span><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
      ${entry.notes ? `<p class="shipment-timeline-remark"><b>Remark</b>${escapeHtml(entry.notes)}</p>` : ""}
    </div>
  </article>`;
}

function shipmentDelayAlertMarkup(alerts) {
  if (!alerts.length) return "";
  return `<div class="shipment-delay-alerts">${alerts.map((alert) => `<article class="shipment-delay-alert"><span>🚩</span><div><strong>${escapeHtml(alert.kind)}</strong><p>Expected: ${escapeHtml(formatShipmentTimelineDate(alert.due))}</p><p>${escapeHtml(`${alert.days} ${alert.days === 1 ? "Day" : "Days"} Late`)}</p></div></article>`).join("")}</div>`;
}

function formatShipmentTimelineDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return String(value || "-");
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderReports() {
  const rows = filteredRows(visibleRows(state.shipments));
  const revenue = rows.reduce((sum, row) => sum + Number(row.sell || 0), 0);
  const cost = rows.reduce((sum, row) => sum + Number(row.buyCost || 0), 0);
  const preview = state.ui.reportPreview;
  const canSeeSummary = canViewBillingSummary();
  return `
    <section class="kpi-grid">
      ${kpi("Filtered Shipments", rows.length, "Current report scope")}
      ${canSeeSummary && canBillingSalesEntry() ? kpi("Revenue", money(revenue), "Sell total") : ""}
      ${canSeeSummary && canBillingCostEntry() ? kpi("Supplier Cost", money(cost), "Buy total") : ""}
      ${canSeeSummary && canViewProfitMargin() && canBillingSalesEntry() && canBillingCostEntry() ? kpi("Margin", money(revenue - cost), "Revenue minus cost") : ""}
    </section>
    <section class="panel">${panelHeader("Report Preview and Export", "Reports")}
      <div class="report-toolbar">
        ${strictSelect("reportType", "Report Type", reportTypeOptions(), normalizedReportType(state.ui.reportType))}
        ${select("reportFormat", "Preview As", ["PDF", "Excel CSV"], state.ui.reportFormat || "PDF")}
        ${input("reportFromDate", "From Date", state.ui.reportFromDate || "", false, "date")}
        ${input("reportToDate", "To Date", state.ui.reportToDate || "", false, "date")}
        <button type="button" data-action="preview-report">Preview Report</button>
        <button type="button" class="secondary-button" data-action="reset-report-range">Reset Date Range</button>
        <button type="button" class="secondary-button" data-action="export-report" ${preview ? "" : "disabled"}>Export Report</button>
        ${canViewProfitMargin() && canBillingSalesEntry() && canBillingCostEntry() ? `<button type="button" class="secondary-button" data-action="margin-report">Margin Summary</button>` : ""}
      </div>
      <p class="empty-state">Leave From/To blank to include every shipment for the selected report type. Dates filter on booking date.</p>
      ${preview ? reportPreviewPanel(preview) : `<div class="report-preview-empty"><p class="empty-state">Preview the report first, then export once the page layout looks correct.</p></div>`}
    </section>`;
}

function renderCustomerUserAccess() {
  if (!isAdminSession()) {
    return `<section class="panel">${panelHeader("Access Denied", "Admin")}<p class="empty-state">Only admin users can manage customer portal accounts.</p></section>`;
  }
  return `
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("Customer Portal Accounts", "Access Control")} ${registerColumnSettingsMarkup("customerUser", "Customer Portal columns", defaultColumnLayouts().customerUser)} ${table("customerUser", filteredRows(state.customerUsers), customerUserColumns(), false, "customerUser")}</article>
      ${moduleActionPanel("Customer Portal Actions", "customerUser", "Create a login for a customer so they can access the Customer Portal. Resetting the password here immediately replaces their old one.")}
    </section>
    ${adminDeletePanel("customerUser", "Customer Portal Account", "Deleting a customer portal account immediately blocks that login from the customer portal.")}`;
}

function renderSettings() {
  if (!isAdminSession()) {
    return `<section class="panel">${panelHeader("Access Denied", "Admin")}<p class="empty-state">Only admin users can access user management and settings.</p></section>`;
  }

  const settingsOpen = Boolean(state.ui.showSettingsForm);
  return `
    ${adminTopRequestsPanel()}
    <section class="split-grid wide-left">
      <article class="panel">${panelHeader("User Accounts", "Permissions")} ${registerColumnSettingsMarkup("user", "User Account columns", defaultColumnLayouts().user)} ${table("user", filteredRows(state.users), userColumns(), false, "user")}</article>
      ${moduleActionPanel("User / Permission Actions", "user", "Admin users can open separate New and Load windows for staff accounts and permissions.")}
    </section>
    ${adminDeletePanel("user", "User Account", "Deleting a user removes the login from the live database. The current logged-in admin cannot delete itself.")}
    <section class="split-grid single-panel">
      <article class="panel">${panelHeader("Company Settings", "System")}
        <div class="action-row">
          <button type="button" data-action="toggle-settings">${settingsOpen ? "Close Settings" : "Open / Update Settings"}</button>
        </div>
        ${settingsOpen ? `<form class="stack-form" data-form="settings">
          ${input("companyName", "Company Name", state.settings.companyName)}
          ${input("companyLogoUrl", "Company Logo URL", state.settings.companyLogoUrl || "")}
          <div class="branch-sequence-table-wrap">
            <table class="branch-sequence-table">
              <thead><tr><th>Sequence Name</th><th>Kuwait HO</th><th>Dubai</th></tr></thead>
              <tbody><tr>
                <td><strong>Job No</strong></td>
                <td>
                  <label>Format<input name="kuwaitShipmentNumberFormat" value="${escapeHtml(state.settings.kuwaitShipmentNumberFormat || "AFS-#####/MM/KWI/{SERVICE}")}" /></label>
                  <label>Next Serial<input name="kuwaitShipmentSerialStart" type="number" min="1" value="${escapeHtml(state.settings.kuwaitShipmentSerialStart || "1")}" /></label>
                </td>
                <td>
                  <label>Format<input name="dubaiShipmentNumberFormat" value="${escapeHtml(state.settings.dubaiShipmentNumberFormat || "AFS-#####/MM/DBX/{SERVICE}")}" /></label>
                  <label>Next Serial<input name="dubaiShipmentSerialStart" type="number" min="1" value="${escapeHtml(state.settings.dubaiShipmentSerialStart || "1")}" /></label>
                </td>
              </tr></tbody>
            </table>
          </div>
          <p class="empty-state">Use <strong>#####</strong> for serial number, <strong>MM</strong> for month, and <strong>{SERVICE}</strong> for the service type selected in the shipment panel.</p>
          ${input("invoiceNumberFormat", "Invoice Number Format", state.settings.invoiceNumberFormat)}
          ${input("consolidationNumberFormat", "Consolidation Number Format", state.settings.consolidationNumberFormat)}
          ${input("tcnNumberFormat", "TCN Number Format", state.settings.tcnNumberFormat)}
          ${input("deliveryNoteNumberFormat", "POD / Delivery Note Number Format", state.settings.deliveryNoteNumberFormat)}
          ${input("documentNumberFormat", "Document Number Format", state.settings.documentNumberFormat)}
          ${input("tariffNumberFormat", "Tariff Number Format", state.settings.tariffNumberFormat)}
          ${input("customerNumberFormat", "New Customer Number Format", state.settings.customerNumberFormat)}
          ${input("additionalChargeNumberFormat", "Additional Charges Number Format", state.settings.additionalChargeNumberFormat)}
          ${input("supplierNumberFormat", "Supplier / Transporter Number Format", state.settings.supplierNumberFormat)}
          ${input("quotationNumberFormat", "Quotation Number Format", state.settings.quotationNumberFormat)}
          ${input("awbNumberFormat", "Airway Bill Number Format", state.settings.awbNumberFormat)}
          ${input("awbSerialStart", "Airway Bill Starting Number", state.settings.awbSerialStart || "262035", false, "number")}
          ${input("defaultVolumetricDivisor", "Default Volumetric Divisor", state.settings.defaultVolumetricDivisor)}
          ${select("requirePodBeforeInvoice", "Require POD Before Invoice", ["Yes", "No"], state.settings.requirePodBeforeInvoice)}
          ${strictSelect("branches", "Branches", branchOptions(), normalizeBranchName(state.settings.branches || branchOptions()[0]))}
          ${select("allowGlobalShipmentQuickSearch", "Allow 'Open by Number' to search all branches", ["No", "Yes"], state.settings.allowGlobalShipmentQuickSearch || "No")}
          <p class="empty-state">Next Kuwait shipment: ${escapeHtml(nextShipmentNumber("Kuwait HO", "LI"))} | Next Dubai shipment: ${escapeHtml(nextShipmentNumber("Dubai", "SI"))} | invoice: ${escapeHtml(nextInvoiceNumber())} | manifest: ${escapeHtml(nextConsolidationNumber())} | TCN: ${escapeHtml(nextTcnNumber())} | POD: ${escapeHtml(nextDeliveryNoteNumber())} | customer: ${escapeHtml(nextCustomerNumber())} | charge: ${escapeHtml(nextAdditionalChargeNumber())} | supplier: ${escapeHtml(nextSupplierNumber())} | quotation: ${escapeHtml(nextQuotationNumber())}</p>
          <button type="submit">Save Company Settings</button>
        </form>` : `<p class="empty-state">Open settings to update number formats, branches, and invoice/POD controls.</p>`}
      </article>
    </section>`;
}

function renderAudit() {
  if (!isAdminSession()) {
    return `<section class="panel">${panelHeader("Access Denied", "Admin")}<p class="empty-state">Only admin users can access audit log.</p></section>`;
  }
  const rows = filteredAuditRows();
  return `<section class="panel">${panelHeader("Audit Trail", "History")}
    <div class="report-toolbar">
      ${input("auditQuery", "Search Log", state.ui.auditFilters?.query || "")}
      ${input("auditFromDate", "From", state.ui.auditFilters?.fromDate || "", false, "date")}
      ${input("auditToDate", "To", state.ui.auditFilters?.toDate || "", false, "date")}
      <button type="button" data-action="filter-audit">Filter</button>
      <button type="button" class="danger-button" data-action="delete-audit-log-selected">Delete Selected</button>
    </div>
    <div class="audit-scroll">${auditTableMarkup(rows)}</div>
  </section>`;
}

function moduleActionPanel(title, type, note, extra = "") {
  const newButtons = type === "shipment"
    ? `<button type="button" data-action="new-record" data-type="shipment" data-mode="shipment">New Shipment</button><button type="button" class="secondary-button" data-action="new-record" data-type="shipment" data-mode="airway">New Airway</button>`
    : `<button type="button" data-action="new-record" data-type="${escapeHtml(type)}">New</button>`;
  return `<article class="panel">${panelHeader(title, "New / Load")}
    <div class="action-stack">
      <p class="empty-state">${escapeHtml(note)}</p>
      ${newRecordSelectorMarkup(type)}
      <div class="action-row">
        ${newButtons}
        <button type="button" class="secondary-button" data-action="export-list" data-type="${escapeHtml(type)}">Export Excel</button>
      </div>
      ${loadSelectorMarkup(type)}
      <div class="action-row">
        <button type="button" class="secondary-button" data-action="load-record" data-type="${escapeHtml(type)}">Load</button>
      </div>
      ${extra}
    </div>
  </article>`;
}

function blockRequestControls(type, label) {
  const rows = collectionFor(type);
  const adminActing = isAdminSession();
  const blockLabel = adminActing ? "Block" : "Block Request";
  const unblockLabel = adminActing ? "Unblock" : "Unblock Request";
  const helpText = adminActing
    ? "As admin, this applies immediately - no approval needed."
    : "Requests are sent to admin and shown in User Management / Settings.";
  return `<div class="action-stack">
    ${loadSelectorMarkup(type, `${label} To ${adminActing ? "Update" : "Request"}`)}
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="request-block" data-type="${escapeHtml(type)}">${blockLabel}</button>
      <button type="button" class="secondary-button" data-action="request-unblock" data-type="${escapeHtml(type)}">${unblockLabel}</button>
    </div>
    <p class="empty-state">${rows.length ? helpText : `No ${label.toLowerCase()} records available for request.`}</p>
  </div>`;
}

function documentActionControls(type, label) {
  return `<div class="action-stack">
    ${loadSelectorMarkup(type, `${label} To Generate`)}
    <div class="action-row">
      <button type="button" class="secondary-button" data-action="generate-document" data-type="${escapeHtml(type)}">Generate ${escapeHtml(label)}</button>
      <button type="button" class="secondary-button" data-action="export-document" data-type="${escapeHtml(type)}">Save / Export</button>
    </div>
  </div>`;
}

function newRecordSelectorMarkup(type, label = "New Entry Option") {
  const options = newRecordOptions(type);
  return `<label>${escapeHtml(label)}
    <select data-new-select="${escapeHtml(type)}">
      ${options.map((option) => `<option value="${escapeHtml(option.type)}">${escapeHtml(option.label)}</option>`).join("")}
    </select>
  </label>`;
}

function newRecordOptions(type) {
  const labels = {
    shipment: "New Shipment / Airway",
    load: "New Manifest",
    customers: "New Customer",
    suppliers: "New Supplier / Transporter",
    tariff: "New Tariff",
    document: "New Document Tag",
    charge: "New Additional Charge",
    invoice: "New Invoice",
    quotation: "New Quotation",
    customerUser: "New Customer Portal Account",
    pod: "New POD / Delivery",
    status: "New Shipment Status",
    user: "New User Account"
  };
  return [{ type, label: labels[type] || `New ${type}` }];
}

function loadSelectorMarkup(type, label = "Saved Records") {
  const rows = collectionFor(type);
  if (!rows.length) {
    return `<p class="empty-state">No saved ${escapeHtml(type)} records available.</p>`;
  }

  if (["shipment", "status", "pod", "load"].includes(type)) {
    return searchableRecordSelectorMarkup(type, "data-load-select", label, rows);
  }

  return `<label>${escapeHtml(label)}
    <select data-load-select="${escapeHtml(type)}">
      ${rows.map((row) => `<option value="${escapeHtml(rowId(type, row))}">${escapeHtml(loadOptionLabel(type, row))}</option>`).join("")}
    </select>
  </label>`;
}

function deleteSelectorMarkup(type, label = "Record To Delete") {
  const rows = collectionFor(type);
  if (!rows.length) {
    return `<p class="empty-state">No saved ${escapeHtml(type)} records available.</p>`;
  }

  if (type === "shipment") {
    return searchableRecordSelectorMarkup(type, "data-delete-select", label, rows);
  }

  const savedValue = state.ui.selectedRecordSelectors?.[type] || "";
  return `<label>${escapeHtml(label)}
    <select data-delete-select="${escapeHtml(type)}">
      ${rows.map((row) => {
        const value = rowId(type, row);
        return `<option value="${escapeHtml(value)}" ${value === savedValue ? "selected" : ""}>${escapeHtml(loadOptionLabel(type, row))}</option>`;
      }).join("")}
    </select>
  </label>`;
}

function loadOptionLabel(type, row) {
  if (type === "shipment" || type === "status" || type === "pod") {
    return shipmentOptionLabel(row);
  }

  if (type === "load") {
    return `${row.loadNo} | ${row.route || `${row.origin || ""} to ${row.destination || ""}`} | ${row.transporter || ""} | ${row.vehicleNo || ""} | ${row.status || ""}`;
  }

  if (type === "user") {
    return `${row.userName} | ${row.role}`;
  }

  if (type === "charge") {
    return `${row.refNo} | ${row.shipmentNo} | ${row.chargeType}`;
  }

  if (type === "podDocument") {
    return `${row.documentNo} | ${row.linkedNo || "Unlinked"}`;
  }

  if (type === "statusHistory") {
    return `${row.jobNo} | ${row.status} | ${formatDateDisplay(row.updatedAt)}`;
  }

  if (type === "customers" || type === "suppliers") {
    return `${row.code} | ${row.name}`;
  }

  return rowId(type, row);
}

function searchableRecordSelectorMarkup(type, attribute, label, rows) {
  const listId = `${attribute}-${type}-options`;
  const savedValue = state.ui.selectedRecordSelectors?.[type] || "";
  const firstValue = rows.some((row) => rowId(type, row) === savedValue)
    ? savedValue
    : (rows.length ? rowId(type, rows[0]) : "");
  const options = rows.map((row) => {
    const value = rowId(type, row);
    return `<option value="${escapeHtml(value)}" label="${escapeHtml(loadOptionLabel(type, row))}"></option>`;
  }).join("");
  return `<label>${escapeHtml(label)}
    <input type="text" ${attribute}="${escapeHtml(type)}" value="${escapeHtml(firstValue)}" list="${escapeHtml(listId)}" placeholder="Type to search and select" autocomplete="off" />
    <datalist id="${escapeHtml(listId)}">${options}</datalist>
  </label>`;
}

function shipmentOptions() {
  return visibleRows(state.shipments).map((row) => ({ value: row.jobNo, label: shipmentOptionLabel(row) }));
}

function tariffOptionsForCustomer(customer) {
  const name = String(customer || "").trim().toLowerCase();
  if (!name) return [];
  return state.tariffs
    .filter((row) => String(row.customer || "").trim().toLowerCase() === name)
    .map((row) => ({ value: row.tariffNo, label: `${row.tariffNo} | ${row.customer} | ${row.origin} to ${row.destination}` }));
}

function shipmentOptionLabel(row) {
  return `${row.jobNo} | ${row.airwayBillNo || ""} | ${row.customer} | ${row.origin} to ${row.destination}`;
}

function consolidationJobsPanel(loadItem) {
  const jobs = String(loadItem.jobNumbers || "")
    .split(",")
    .map((jobNo) => jobNo.trim())
    .filter(Boolean);

  return `<section class="consolidation-jobs">
    <div class="panel-header">
      <div>
        <p class="eyebrow">Selected Manifest</p>
        <h2>${escapeHtml(loadItem.loadNo)}</h2>
        <p class="empty-state">Manifest: ${escapeHtml(loadItem.manifestStatus || "Not Generated")}${loadItem.lastManifestRequestNo ? ` | Request: ${escapeHtml(loadItem.lastManifestRequestNo)}` : ""}</p>
      </div>
      <div class="action-row">
        <button type="button" class="secondary-button" data-action="approve-load-manifest" data-id="${escapeHtml(loadItem.loadNo)}">Generate Manifest</button>
        <button type="button" class="secondary-button" data-action="open" data-type="load" data-id="${escapeHtml(loadItem.loadNo)}">Edit Manifest</button>
      </div>
    </div>
    <div class="status-expand-panel">
      <div class="status-expand-panel-header">
        <h4>Update Manifest Status - ${escapeHtml(loadItem.loadNo)}</h4>
      </div>
      <form data-form="load-status" class="inline-status-form">
        <input type="hidden" name="loadNo" value="${escapeHtml(loadItem.loadNo)}" />
        ${strictSelect("status", "Status", manifestUpdateStatusOptions(), loadItem.status)}
        ${input("date", "Date", today(), false, "date")}
        ${input("notes", "Manual Remark", "")}
        <div class="action-row">
          <button type="submit" class="primary-button">Save Manifest Status Update</button>
        </div>
      </form>
      <p class="empty-state">Saves immediately - no admin approval needed. Updates every shipment currently linked to this manifest to the same status, and adds the same date/remark to each one's own status history.</p>
    </div>
    ${jobs.length ? `<div class="job-list-table">${jobs.map((jobNo) => consolidationJobRow(loadItem.loadNo, jobNo)).join("")}</div>` : `<p class="empty-state">No job numbers linked to this consolidation.</p>`}
  </section>`;
}

function consolidationJobRow(loadNo, jobNo) {
  const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
  const removeButton = isAdminSession()
    ? `<button type="button" class="danger-button" data-action="remove-load-job" data-load-id="${escapeHtml(loadNo)}" data-job-id="${escapeHtml(jobNo)}">Remove</button>`
    : "";
  if (!shipmentItem) {
    return `<div class="job-list-row"><strong>${escapeHtml(jobNo)}</strong><span class="empty-state">Shipment not found.</span>${removeButton}</div>`;
  }

  return `<div class="job-list-row">
    <div class="job-list-main">
      <button type="button" class="ghost-button inline-link" data-action="open" data-type="shipment" data-id="${escapeHtml(jobNo)}">${escapeHtml(jobNo)}</button>
      <span class="status-badge neutral">${escapeHtml(shipmentItem.status)}</span>
    </div>
    <div class="job-list-detail-grid">
      <span><strong>Customer</strong>${escapeHtml(shipmentItem.customer)}</span>
      <span><strong>Route</strong>${escapeHtml(shipmentItem.origin)} to ${escapeHtml(shipmentItem.destination)}</span>
      <span><strong>Service</strong>${escapeHtml(shipmentItem.shipmentDirection)} / ${escapeHtml(shipmentItem.shipmentService)}</span>
      <span><strong>Pieces</strong>${escapeHtml(shipmentItem.pieces)}</span>
      <span><strong>Actual KG</strong>${money(shipmentItem.actualKg)}</span>
      <span><strong>CBM</strong>${money(shipmentItem.cbm)}</span>
      <span><strong>Chargeable KG</strong>${money(shipmentItem.chargeableKg)}</span>
      <span><strong>POD</strong>${escapeHtml(shipmentItem.podStatus)}</span>
      <span><strong>Invoice</strong>${escapeHtml(shipmentItem.invoiceStatus)}</span>
      <span><strong>Sell / Cost</strong>${money(shipmentItem.sell)} / ${money(shipmentItem.buyCost)}</span>
    </div>
    ${removeButton}
  </div>`;
}

function actionChecklist(items) {
  return `<div class="bullet-card">${items.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>`;
}

function reportPreviewPanel(preview) {
  return `<div class="report-preview-shell">
    <div class="report-preview-page ${preview.format === "PDF" ? "pdf" : "excel"}">
      <div class="report-preview-heading">
        <h3>${escapeHtml(preview.reportType)}</h3>
        <p>${escapeHtml(preview.summary)}</p>
      </div>
      ${table("shipment", preview.rows, shipmentColumns(), false, "shipment:reportPreview", false)}
    </div>
  </div>`;
}

function kpi(title, value, caption, metric = "") {
  const metricAttr = metric ? ` data-dashboard-metric="${escapeHtml(metric)}" role="button" tabindex="0"` : "";
  return `<article class="kpi"${metricAttr}><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(caption)}</small></article>`;
}

function alert(title, detail) {
  return `<article class="alert"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function panelHeader(title) {
  return `<div class="panel-header"><div><h2>${escapeHtml(title)}</h2></div></div>`;
}

function empty(text) {
  return `<p class="empty-state">${escapeHtml(text)}</p>`;
}

function table(type, rows, columns, showLoad = type !== "shipment", scope = type, sortable = true) {
  const configuredColumns = configurableColumns(type, columns, scope);
  const filteredRows = applyColumnFilters(scope, rows, configuredColumns);
  const sortedRows = sortable ? applySort(scope, filteredRows) : filteredRows;
  const pageSize = 15;
  state.ui.tablePages = state.ui.tablePages || {};
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.ui.tablePages[scope] || 1)), totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const header = showLoad ? `<th>Load</th>` : "";
  const colSpan = configuredColumns.length + (showLoad ? 1 : 0);
  const hasActiveFilter = Object.values(state.ui.columnFilters?.[scope] || {}).some((term) => String(term || "").trim());
  const body = sortedRows.length
    ? pageRows.map((row, index) => tableRow(type, row, index + ((currentPage - 1) * pageSize), configuredColumns, showLoad)).join("")
    : `<tr><td colspan="${colSpan}">${empty(hasActiveFilter ? "No records match the column filters." : "No records found.")}</td></tr>`;
  const locked = isColumnWidthLocked(scope);
  const headCells = configuredColumns.map(([key, label]) => sortable ? sortableHeaderCell(type, scope, key, label, locked) : `<th>${escapeHtml(label)}</th>`).join("");
  const filterRow = columnFilterRowMarkup(scope, configuredColumns, showLoad);
  const widths = (state.ui.columnWidths || {})[scope];
  const tableStyle = widths && Object.keys(widths).length ? ` style="table-layout:fixed"` : "";
  const lockToggle = sortable ? columnLockToggleMarkup(scope, locked) : "";
  const pager = totalPages > 1 ? `<div class="table-pagination"><span>Showing ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, sortedRows.length)} of ${sortedRows.length}</span><div><button type="button" class="secondary-button" data-action="table-page" data-page-scope="${escapeHtml(scope)}" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Previous</button><span>Page ${currentPage} / ${totalPages}</span><button type="button" class="secondary-button" data-action="table-page" data-page-scope="${escapeHtml(scope)}" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Next</button></div></div>` : "";
  return `${scope === "shipment" ? "" : ""}${lockToggle}<div class="table-wrap"><table${tableStyle}><thead><tr>${headCells}${header}</tr>${filterRow}</thead><tbody>${body}</tbody></table></div>${pager}`;
}

// Per-column "type to filter" row shown directly under the column headings of every register
// table. Typing in any of these boxes narrows the rows to ones whose value in THAT column
// contains the typed text (case-insensitive, partial match) - and when more than one box has
// text, a row must match all of them at once (AND, not OR). This runs independently per table
// (scope), the same way sorting and pagination already do, so filtering the Shipment Register
// doesn't touch the Manifest Register's filters.
function columnFilterRowMarkup(scope, columns, showLoad) {
  const filters = state.ui.columnFilters?.[scope] || {};
  const cells = columns.map(([key]) => `<th><input type="text" class="column-filter-input" data-column-filter data-filter-scope="${escapeHtml(scope)}" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(filters[key] || "")}" placeholder="Filter..." autocomplete="off" /></th>`).join("");
  return `<tr class="column-filter-row">${cells}${showLoad ? "<th></th>" : ""}</tr>`;
}

function tableColumnValue(scope, key, row) {
  const tableType = String(scope || "").split(":")[0];
  if (key === "consoleNo") return consoleNoForShipment(row?.jobNo);
  if (tableType === "document" && key === "linkedNo") return documentLinkedToText(row);
  return row?.[key];
}

function applyColumnFilters(scope, rows, columns) {
  const filters = state.ui.columnFilters?.[scope] || {};
  const activeEntries = Object.entries(filters).filter(([key, term]) => String(term || "").trim() && columns.some(([columnKey]) => columnKey === key));
  if (!activeEntries.length) return rows;
  return rows.filter((row) => activeEntries.every(([key, term]) => {
    const cellText = String(display(tableColumnValue(scope, key, row)) ?? "").toLowerCase();
    return cellText.includes(String(term).trim().toLowerCase());
  }));
}

function handleColumnFilterInput(event) {
  const field = event.target.closest("[data-column-filter]");
  if (!field) return;
  const scope = field.dataset.filterScope;
  const key = field.dataset.filterKey;
  if (!scope || !key) return;
  state.ui.columnFilters = state.ui.columnFilters || {};
  state.ui.columnFilters[scope] = state.ui.columnFilters[scope] || {};
  if (field.value) state.ui.columnFilters[scope][key] = field.value;
  else delete state.ui.columnFilters[scope][key];
  state.ui.tablePages = state.ui.tablePages || {};
  state.ui.tablePages[scope] = 1;
  if (scope.startsWith("metric:")) {
    openDashboardMetricDialog(scope.slice("metric:".length), { focusFilter: true, filterKey: key });
    return;
  }
  if (scope === "shipment:customer-history" && state.ui.customerShipmentHistory?.customerCode) {
    openCustomerShipmentHistory(state.ui.customerShipmentHistory.customerCode, state.ui.customerShipmentHistory);
    return;
  }
  render();
}

function handleShipmentQuickOpenInput(event) {
  if (event.target?.id !== "quickOpenShipmentInput") return;
  const query = String(event.target.value || "").trim().toLowerCase();
  if (!query) return;
  const searchAllBranches = String(state.settings.allowGlobalShipmentQuickSearch || "No").toLowerCase() === "yes";
  const searchPool = searchAllBranches ? state.shipments : visibleRows(state.shipments);
  const match = searchPool.find((row) => [row.jobNo, row.airwayBillNo, row.tcnNumber]
    .some((value) => String(value || "").trim().toLowerCase() === query));
  if (!match) return;
  state.ui.activeShipmentNo = rowId("shipment", match);
  saveState();
}



function isColumnWidthLocked(scope) {
  return Boolean((state.ui.columnWidthsLocked || {})[scope]);
}

function columnLockToggleMarkup(scope, locked) {
  return `<div class="column-lock-row">
    <button type="button" class="icon-toggle-button" data-action="toggle-column-lock" data-scope="${escapeHtml(scope)}" title="${locked ? "Column widths are locked. Click to unlock and resize." : "Column widths are unlocked. Drag a column edge to resize, then click to lock."}">${locked ? "🔒 Locked" : "🔓 Unlocked"}</button>
  </div>`;
}

function sortableHeaderCell(type, scope, key, label, locked = false) {
  const sortState = (state.ui.sort || {})[scope];
  const isActive = !!(sortState && sortState.key === key);
  const arrow = isActive ? (sortState.direction === "asc" ? " ▲" : " ▼") : "";
  const width = (state.ui.columnWidths || {})[scope]?.[key];
  const widthStyle = width ? ` style="width:${width}px"` : "";
  const resizeHandle = locked ? "" : `<span class="col-resize-handle" data-resize-scope="${escapeHtml(scope)}" data-resize-key="${escapeHtml(key)}"></span>`;
  return `<th${widthStyle}><button type="button" class="sort-header-button${isActive ? " is-active" : ""}" data-action="sort-column" data-type="${escapeHtml(type)}" data-scope="${escapeHtml(scope)}" data-key="${escapeHtml(key)}">${escapeHtml(label)}${arrow}</button>${resizeHandle}</th>`;
}

function applySort(scope, rows) {
  const sortState = (state.ui.sort || {})[scope];
  if (!sortState || !sortState.key) return rows;
  const key = sortState.key;
  const factor = sortState.direction === "asc" ? 1 : -1;
  const valueFor = (row) => tableColumnValue(scope, key, row);
  return [...rows].sort((left, right) => factor * compareCellValues(valueFor(left), valueFor(right)));
}

function compareCellValues(left, right) {
  const leftValue = left === undefined || left === null ? "" : left;
  const rightValue = right === undefined || right === null ? "" : right;
  const leftNum = Number(leftValue);
  const rightNum = Number(rightValue);
  const bothNumeric = leftValue !== "" && rightValue !== "" && !Number.isNaN(leftNum) && !Number.isNaN(rightNum);
  if (bothNumeric) return leftNum - rightNum;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
}

function guessDefaultSortDirection(type, key) {
  const rows = allCollectionFor(type) || [];
  const sample = rows.map((row) => tableColumnValue(type, key, row)).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  if (sample === undefined) return "desc";
  const text = String(sample).trim();
  const isDateLike = /^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{2}[-/]\d{2}[-/]\d{4}/.test(text);
  const isNumericLike = text !== "" && !Number.isNaN(Number(text));
  const isCodeLike = /[A-Za-z]/.test(text) && /\d{3,}/.test(text);
  return (isDateLike || isNumericLike || isCodeLike) ? "desc" : "asc";
}

function safeTable(type, rows, columns, fallbackText) {
  try {
    return table(type, Array.isArray(rows) ? rows : [], columns);
  } catch (error) {
    return `<div class="report-preview-empty"><p class="empty-state">${escapeHtml(fallbackText)} ${escapeHtml(error?.message || "")}</p></div>`;
  }
}

function tableRow(type, row, index, columns, showLoad = true) {
  const id = rowId(type, row);
  const actionCell = showLoad ? `<td>${tableActionButton(type, id)}</td>` : "";
  const rowClass = type === "shipment" ? `shipment-row-${shipmentVisualState(row).key}` : "";
  return `<tr class="${rowClass}">${columns.map(([key]) => `<td>${cellHtml(type, key, row, index)}</td>`).join("")}${actionCell}</tr>`;
}


function tableActionButton(type, id) {
  if (type === "leaveRequest") {
    const record = state.leaveRequests.find((row) => row.requestNo === id);
    const isPending = String(record?.status || "").toLowerCase() === "pending";
    const canDecide = isHrAdmin() && isPending;
    return `<div class="row-action-group">
      <button class="ghost-button" data-action="open" data-type="leaveRequest" data-id="${escapeHtml(id)}">Open</button>
      ${canDecide ? `<button class="ghost-button" data-action="approve-leave-request" data-id="${escapeHtml(id)}">Approve</button>` : ""}
      ${canDecide ? `<button class="ghost-button" data-action="reject-leave-request" data-id="${escapeHtml(id)}">Reject</button>` : ""}
    </div>`;
  }

  if (type === "load") {
    return `<button class="ghost-button" data-action="view-load" data-id="${escapeHtml(id)}">View Jobs</button>`;
  }

  if (type === "unblock" || type === "adminRequest" || type === "userRequest") {
    return `<button class="ghost-button" data-action="open" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}">Review</button>`;
  }

  if (type === "shipmentRequest") {
    const record = state.shipmentRequests.find((row) => row.requestNo === id);
    const status = String(record?.status || "").toUpperCase();
    const isPending = ["SUBMITTED", "PENDING_REVIEW"].includes(status);
    const isApprovedNotConverted = ["APPROVED", "AUTO_APPROVED"].includes(status) && !record?.convertedJobNo;
    return `<div class="row-action-group">
      <button class="ghost-button" data-action="open" data-type="shipmentRequest" data-id="${escapeHtml(id)}">Open</button>
      ${isPending ? `<button class="ghost-button" data-action="approve-shipment-request" data-id="${escapeHtml(id)}">Approve</button>` : ""}
      ${isPending ? `<button class="ghost-button" data-action="send-back-shipment-request" data-id="${escapeHtml(id)}">Send Back</button>` : ""}
      ${isApprovedNotConverted ? `<button class="ghost-button" data-action="convert-shipment-request" data-id="${escapeHtml(id)}">Convert</button>` : ""}
    </div>`;
  }

  if (type === "quotation") {
    return `<div class="row-action-group">
      <button class="ghost-button" data-action="open" data-type="quotation" data-id="${escapeHtml(id)}">Open</button>
      <button class="ghost-button" data-action="print-quotation" data-id="${escapeHtml(id)}">Print</button>
      <button class="ghost-button" data-action="convert-quotation" data-id="${escapeHtml(id)}">Convert</button>
      <button class="ghost-button danger-text" data-action="delete-record-direct" data-type="quotation" data-id="${escapeHtml(id)}">Delete</button>
    </div>`;
  }

  if (type === "employee") {
    return `<div class="row-action-group">
      <button class="ghost-button" data-action="open" data-type="employee" data-id="${escapeHtml(id)}">Open</button>
      <button class="ghost-button" data-action="view-employee-documents" data-id="${escapeHtml(id)}">Documents</button>
    </div>`;
  }

  return `<button class="ghost-button" data-action="open" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}">Load</button>`;
}

function display(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : money(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return formatDateDisplay(value);
  return value ?? "";
}

// Reformats ISO date strings (from <input type="date">/<input type="datetime-local"> values, or
// API date columns - always YYYY-MM-DD / YYYY-MM-DDTHH:MM under the hood) to DD-MM-YYYY for
// display, project-wide. Only ever touches DISPLAY text - every stored value, form input value,
// sort comparison, and API payload keeps using ISO internally, since that's what native date
// inputs require and what keeps chronological sorting correct (sorting DD-MM-YYYY strings as
// text would sort by day first, not year).
function formatDateDisplay(value) {
  const text = String(value ?? "").trim();
  const dateTimeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (dateTimeMatch) return `${dateTimeMatch[3]}-${dateTimeMatch[2]}-${dateTimeMatch[1]} ${dateTimeMatch[4]}:${dateTimeMatch[5]}`;
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  return value;
}

// For the handful of spots that stamp the current moment (e.g. "printed at", "prepared" time)
// rather than displaying a stored date value.
function formatDateTimeNow(date = new Date()) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function chargeTypeOptions() {
  return [
    "Labour Charges",
    "Delivery Charges",
    "Loading Charges",
    "Unloading Charges",
    "Fuel Charges",
    "Toll Charges",
    "Handling Charges",
    "Customs Charges",
    "Warehouse Charges",
    "Documentation Charges",
    "Crane Charges",
    "Local Transport",
    "Miscellaneous"
  ];
}

function chargeBasisOptions() {
  return ["1 ton", "3 ton", "5 ton", "10 ton", "Flat", "Per Shipment"];
}

function chargeStatusOptions() {
  return ["Draft", "Pending Approval", "Approved", "Rejected", "Posted to Invoice"];
}

function reportTypeOptions() {
  return ["All Shipments", ...statusOptions()];
}
function normalizedReportType(value = "") {
  const selected = reportTypeOptions().find((option) => option.toLowerCase() === String(value || "").trim().toLowerCase());
  return selected || "All Shipments";
}

function shipmentDirectionOptions() {
  return ["Export", "Import", "Consolidation"];
}

function shipmentServiceOptions(direction) {
  if (direction === "Import") {
    return ["SI", "AI", "LI", "WHC"];
  }

  if (direction === "Consolidation" || direction === "Consoladation") {
    return ["Consolidation"];
  }

  return ["SE", "AE", "LE", "WHC"];
}

function isConsolidationShipment(row) {
  const values = [row?.shipmentDirection, row?.shipmentService].map((item) => String(item || "").trim().toLowerCase());
  return values.includes("consolidation") || values.includes("consoladation");
}

function assignedConsolidationJobs(exceptLoadNo = "") {
  const jobs = new Set();
  state.loads
    .filter((loadItem) => !exceptLoadNo || loadItem.loadNo !== exceptLoadNo)
    .forEach((loadItem) => {
      String(loadItem.jobNumbers || "")
        .split(",")
        .map((jobNo) => jobNo.trim())
        .filter(Boolean)
        .forEach((jobNo) => jobs.add(jobNo));
    });
  return jobs;
}

// The Console (Manifest) Number a shipment currently belongs to, if any - looked up live from
// state.loads rather than stored on the shipment itself, so it's always accurate the moment a
// shipment is added to or removed from a manifest, with nothing extra to keep in sync.
function consoleNoForShipment(jobNo) {
  const trimmedJobNo = String(jobNo || "").trim();
  if (!trimmedJobNo) return "";
  const loadItem = state.loads.find((row) =>
    String(row.jobNumbers || "").split(",").map((item) => item.trim()).filter(Boolean).includes(trimmedJobNo)
  );
  return loadItem ? loadItem.loadNo : "";
}

// Eligible for a manifest = not already on any other manifest, and not Delivered. The former
// "Console/Consolidation service type only" restriction has been removed so every shipment type
// can be added to a manifest.
function isEligibleForManifest(row) {
  return !shipmentStatusIsDelivered(row);
}

function availableConsolidationShipmentOptions(initialJobs = "", currentLoadNo = "") {
  const selected = new Set(
    String(initialJobs || "")
      .split(",")
      .map((jobNo) => jobNo.trim())
      .filter(Boolean)
  );
  const assigned = assignedConsolidationJobs(currentLoadNo);
  return state.shipments
    .filter((row) => selected.has(row.jobNo) || (isEligibleForManifest(row) && !assigned.has(row.jobNo)))
    .map((row) => row.jobNo);
}

function normalizeConsolidationJobs(jobNumbers, currentLoadNo = "") {
  const assigned = assignedConsolidationJobs(currentLoadNo);
  const valid = new Set(state.shipments.filter(isEligibleForManifest).map((row) => row.jobNo));
  return [
    ...new Set(
      String(jobNumbers || "")
        .split(",")
        .map((jobNo) => jobNo.trim())
        .filter((jobNo) => jobNo && valid.has(jobNo) && !assigned.has(jobNo))
    )
  ];
}

function filteredAuditRows() {
  const filters = state.ui.auditFilters || {};
  return filteredRows(state.audit).filter((row) => {
    const query = String(filters.query || "").trim().toLowerCase();
    const textMatch = !query || Object.values(row).join(" ").toLowerCase().includes(query);
    const date = recordDate(row);
    const fromMatch = !filters.fromDate || !date || date >= filters.fromDate;
    const toMatch = !filters.toDate || !date || date <= filters.toDate;
    return textMatch && fromMatch && toMatch;
  });
}

// Composite audit references look like "AFS-2605001 -> Delivered" (status change) or
// "LOAD-0001 - Booked (5 shipments)" (manifest sync) - the underlying reference number itself
// never contains " -> " or " - ", so cutting at the first occurrence of either isolates it cleanly
// and lets every audit entry for the same shipment/record group together regardless of which
// action logged it.
function auditReferenceKey(reference) {
  const text = String(reference || "").trim();
  if (!text) return "";
  const arrowIndex = text.indexOf(" -> ");
  const dashIndex = text.indexOf(" - ");
  let cut = text.length;
  if (arrowIndex !== -1) cut = Math.min(cut, arrowIndex);
  if (dashIndex !== -1) cut = Math.min(cut, dashIndex);
  return text.slice(0, cut).trim() || text;
}

// Audit "details" strings are written as "field: before -> after | field2: before2 -> after2".
// The field names remain stored for audit integrity, but the UI intentionally displays only the
// changed values so an update reads simply: "Before: old -> After: new".
function parseChangeDetailPairs(details) {
  return String(details || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const colonIndex = item.indexOf(":");
      if (colonIndex === -1) return null;
      const field = item.slice(0, colonIndex).trim();
      const valuePart = item.slice(colonIndex + 1).trim();
      const arrowIndex = valuePart.indexOf("->");
      if (!field || arrowIndex === -1) return null;
      return {
        field,
        before: valuePart.slice(0, arrowIndex).trim(),
        after: valuePart.slice(arrowIndex + 2).trim()
      };
    })
    .filter(Boolean);
}

// Full history for a reference, oldest first, regardless of the summary list's current date/text
// filters - opening a shipment's audit trail should always show everything ever done to it.
function auditHistoryForReference(referenceKey) {
  return state.audit
    .filter((row) => auditReferenceKey(row.reference) === referenceKey)
    .slice()
    .sort((a, b) => String(a.dateTime || "").localeCompare(String(b.dateTime || "")));
}

function auditChangeValueText(details) {
  const pairs = parseChangeDetailPairs(details);
  if (!pairs.length) return String(details || "").trim();
  return pairs
    .map((pair) => `Before: ${pair.before || "-"} -> After: ${pair.after || "-"}`)
    .join(" | ");
}

function auditDetailEntryMarkup(entry, position) {
  const valueText = auditChangeValueText(entry.details);
  const changesMarkup = valueText
    ? `<p class="audit-change-values">${escapeHtml(valueText)}</p>`
    : `<p class="audit-change-note audit-change-note-empty">No value changes recorded for this entry.</p>`;

  return `<div class="audit-detail-entry">
    <div class="audit-detail-entry-head">
      <span class="audit-detail-entry-index">${position}</span>
      <div class="audit-detail-entry-heading">
        <strong>${escapeHtml(entry.action || "Update")}</strong>
        <span class="audit-detail-entry-meta">${escapeHtml(entry.dateTime || "")} &middot; by ${escapeHtml(entry.user || "Unknown")}</span>
      </div>
    </div>
    ${changesMarkup}
  </div>`;
}

function openAuditDetailDialog(referenceKey) {
  if (!isAdminSession()) return;
  if (!referenceKey) {
    notifyDenied("No reference", "This audit entry has no reference to look up.");
    return;
  }
  const entries = auditHistoryForReference(referenceKey);
  if (!entries.length) {
    notifyDenied("Not found", `No audit history found for ${referenceKey}.`);
    return;
  }
  const items = entries.map((entry, index) => auditDetailEntryMarkup(entry, index + 1)).join("");
  openDialog({
    title: `Audit Trail - ${referenceKey}`,
    typeLabel: "Audit",
    body: `<div class="audit-detail-list">${items}</div>`,
    saveLabel: "Close",
    singleColumn: true,
    onSave() {
      recordDialog.close();
    }
  });
}

function pendingRequestCount() {
  return state.adminRequests.filter((row) => row.status === "Pending").length + state.unblockRequests.filter((row) => row.status === "Pending").length;
}

function badge(value) {
  const tone =
    value === "Approved" || value === "Paid" || value === "Uploaded"
      ? "ok"
      : value === "Pending" || value === "Pending Approval" || value === "In-Transit"
        ? "warn"
        : value === "Rejected" || value === "Declined" || value === "Blocked" || value === "Missing"
          ? "bad"
          : "neutral";
  return `<span class="status-badge ${tone}">${escapeHtml(value)}</span>`;
}

function cellHtml(type, key, row, index = 0) {
  if (key === "slNo") return escapeHtml(index + 1);
  if (type === "customerRequest" && key === "request_no") {
    const requestNo = String(row.request_no || row.requestNo || "").trim();
    const canEdit = portalStatus(row.status) === "SENT_BACK";
    return requestNo ? `<button type="button" class="table-inline-link" data-action="${canEdit ? "edit-customer-request" : "view-customer-request"}" data-request-no="${escapeHtml(requestNo)}">${escapeHtml(requestNo)}</button>` : "";
  }
  if (type === "customers" && key === "code") {
    const code = String(row.code || "").trim();
    return code ? `<button type="button" class="table-inline-link" data-customer-details="${escapeHtml(code)}" aria-label="Open customer details for ${escapeHtml(code)}">${escapeHtml(code)}</button>` : "";
  }
  if (type === "load" && key === "loadNo") {
    // Reuses the exact same "view-load" action the old Load-column "View Jobs" button used
    // (selects this manifest so its job list renders below the register), rather than the
    // generic openRecord edit dialog - preserving that existing behavior.
    const loadId = String(row.loadNo || "").trim();
    return loadId ? `<button type="button" class="table-inline-link" data-action="view-load" data-id="${escapeHtml(loadId)}" aria-label="View jobs for manifest ${escapeHtml(loadId)}">${escapeHtml(loadId)}</button>` : "";
  }
  const clickableRegisterKey = { suppliers: "code", tariff: "tariffNo", invoice: "invoiceNo", document: "documentNo" }[type];
  if (clickableRegisterKey && key === clickableRegisterKey) {
    const id = String(row[key] || "").trim();
    if (!id) return escapeHtml(row[key] || "");
    return `<button type="button" class="table-inline-link" data-record-open data-record-type="${escapeHtml(type)}" data-record-id="${escapeHtml(id)}" aria-label="Open ${escapeHtml(type)} ${escapeHtml(id)}">${escapeHtml(id)}</button>`;
  }
  if (type === "audit" && key === "auditNumber") {
    const auditId = String(row.id || "").trim();
    if (!auditId) return `<span class="audit-details-empty" title="Still saving - refresh in a moment">Pending</span>`;
    const label = `AUD-${auditId}`;
    return `<button type="button" class="table-inline-link" data-audit-open data-audit-ref="${escapeHtml(auditReferenceKey(row.reference))}" aria-label="Open audit trail for ${escapeHtml(String(row.reference || ""))}">${escapeHtml(label)}</button>`;
  }
  if (type === "document" && key === "linkedNo") return documentLinkedToMarkup(row);
  if (type === "audit" && key === "details") {
    const value = auditChangeValueText(row.details);
    if (!value) return `<span class="audit-details-empty">-</span>`;
    const short = value.length > 120 ? `${value.slice(0, 120)}...` : value;
    return `<span class="audit-details" title="${escapeHtml(value)}">${escapeHtml(short)}</span>`;
  }
  if (key === "palletCount") return escapeHtml(cargoPalletCount(row));
  if (key === "truckDetails") return escapeHtml([row.vehicleNo, row.driverName, row.driverMobile].filter(Boolean).join(" / "));
  if (type === "shipment" && (key === "jobNo" || key === "airwayBillNo")) {
    const value = display(row[key]);
    const visual = key === "jobNo" ? shipmentVisualState(row) : null;
    return `${visual ? `<span class="shipment-register-indicator ${escapeHtml(visual.key)}" title="${escapeHtml(visual.label)}">${visual.icon}</span>` : ""}<button type="button" class="table-inline-link" data-shipment-open data-shipment-id="${escapeHtml(row.jobNo || "")}" data-shipment-field="${escapeHtml(key)}" aria-label="Open shipment ${escapeHtml(String(value))}">${escapeHtml(value)}</button>`;
  }

  if (type === "shipment" && key === "consoleNo") {
    const consoleNo = consoleNoForShipment(row.jobNo);
    if (!consoleNo) return `<span class="empty-state">-</span>`;
    return `<button type="button" class="table-inline-link" data-action="view-load" data-id="${escapeHtml(consoleNo)}" aria-label="View manifest ${escapeHtml(consoleNo)}">${escapeHtml(consoleNo)}</button>`;
  }

  if (["status", "podStatus", "invoiceStatus", "accountStatus", "manifestStatus"].includes(key)) {
    return badge(display(row[key]));
  }

  if (type === "charge" && ["amount", "taxAmount", "totalAmount"].includes(key)) {
    return money(row[key]);
  }

  if (type === "charge" && key === "taxPercent") {
    return `${escapeHtml(row[key])}%`;
  }

  if (type === "invoice" && ["revenue", "supplierCost"].includes(key)) {
    return money(row[key]);
  }

  return escapeHtml(display(row[key]));
}

function cargoPalletCount(row) {
  return parsePalletDimensions(row.cargoItemsJson || row.palletDimensionsJson || "[]")
    .filter((line) => String(line.packageType || "").toLowerCase() === "pallet")
    .reduce((sum, line) => sum + Number(line.quantity || line.count || 0), 0);
}

function dashboardShipmentColumns() {
  return shipmentColumnsForScope("shipment:dashboard", defaultColumnLayouts().shipment);
}

function shipmentColumnDefaults(scope) {
  const type = String(scope || "shipment").split(":")[0];
  return defaultColumnLayouts()[type] || defaultColumnLayouts().shipment;
}

function input(name, label, value = "", readonly = false, type = "text") {
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" ${readonly ? "readonly" : ""} /></label>`;
}

function textarea(name, label, value = "", readonly = false, rows = 4) {
  return `<label>${escapeHtml(label)}<textarea name="${escapeHtml(name)}" rows="${rows}" ${readonly ? "readonly" : ""}>${escapeHtml(value)}</textarea></label>`;
}

function checkbox(name, label, checked = false, value = "on") {
  return `<div class="checkbox-field"><input id="checkbox-${escapeHtml(name)}" name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(value)}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></div>`;
}

function select(name, label, options, selected = options[0]) {
  const selectedValue = optionValue(selected);
  const optionKey = dropdownKeyForField(name) || name;
  return selectEditable(name, label, optionKey, options, selectedValue);
}

function strictSelect(name, label, options, selected = "") {
  const selectedValue = optionValue(selected);
  // If the record's current saved value isn't among the given options (e.g. an option was
  // retired after this record was saved with it), keep it selectable as a trailing option rather
  // than silently falling back to whichever option happens to be first - a plain <select> with no
  // matching "selected" option defaults to showing (and, on save, submitting) its first option,
  // which would silently change this field's value the moment the record is opened and saved.
  const hasCurrentValue = !selectedValue || options.some((option) => optionValue(option) === selectedValue);
  const normalizedOptions = hasCurrentValue ? options : [...options, selectedValue];
  const optionTags = normalizedOptions.map((option) => {
    const value = optionValue(option);
    const isSelected = value === selectedValue;
    return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`;
  }).join("");
  const blankOption = selectedValue ? "" : `<option value="" selected disabled hidden></option>`;
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}">${blankOption}${optionTags}</select></label>`;
}

function selectFrom(name, label, options, value = "") {
  const optionKey = dropdownKeyForField(name) || name;
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" list="${escapeHtml(name)}Options" value="${escapeHtml(optionValue(value))}" data-dropdown-key="${escapeHtml(optionKey)}" data-dropdown-input /><datalist id="${escapeHtml(name)}Options">${options.map((option) => `<option value="${escapeHtml(optionValue(option))}" label="${escapeHtml(optionLabel(option))}"></option>`).join("")}</datalist></label>`;
}

function optionValue(option) {
  return typeof option === "object" && option ? option.value || "" : option || "";
}

function optionLabel(option) {
  return typeof option === "object" && option ? option.label || option.value || "" : option || "";
}

function dropdownOptions(key, defaults = []) {
  const saved = Array.isArray(state.dropdownOptions?.[key]) ? state.dropdownOptions[key] : [];
  const seen = new Set();
  return [...defaults, ...saved]
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function selectEditable(name, label, optionKey, defaults = [], selected = "", includeRemembered = true) {
  const options = includeRemembered ? dropdownOptions(optionKey, defaults) : defaults;
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" list="${escapeHtml(optionKey)}Options" value="${escapeHtml(optionValue(selected))}" data-dropdown-key="${escapeHtml(optionKey)}" data-dropdown-input /><datalist id="${escapeHtml(optionKey)}Options">${options.map((option) => `<option value="${escapeHtml(optionValue(option))}" label="${escapeHtml(optionLabel(option))}"></option>`).join("")}</datalist></label>`;
}
function rememberDropdownOptions(data) {
  let changed = false;
  Object.entries(data).forEach(([name, value]) => {
    const optionKey = dropdownKeyForField(name);
    if (["origin", "destination"].includes(optionKey)) return;
    const text = String(value || "").trim();
    if (!optionKey || !text) return;
    const current = dropdownOptions(optionKey);
    if (!current.map((item) => item.toLowerCase()).includes(text.toLowerCase())) {
      state.dropdownOptions[optionKey] = [...current, text];
      changed = true;
    }
  });
  if (changed) {
    state.settings.dropdownOptionsJson = JSON.stringify(state.dropdownOptions);
    saveState();
    // Deliberately send ONLY the field that changed here, not the whole state.settings object.
    // This runs on every form submission app-wide (any new value typed into any autocomplete
    // field), often from sessions that logged in before a later admin change to Company Settings -
    // sending the full settings snapshot would silently overwrite every other setting (branch
    // serial numbers, etc.) with whatever stale copy happened to be sitting in that browser tab.
    persistRecord("settings", {
      settingsKey: state.settings.settingsKey || "default",
      dropdownOptionsJson: state.settings.dropdownOptionsJson
    });
  }
}

function dropdownKeyForField(name) {
  return {
    branch: "branch",
    status: "status",
    podStatus: "podStatus",
    invoiceStatus: "invoiceStatus",
    shipmentDirection: "shipmentDirection",
    shipmentService: "shipmentService",
    manifestStatus: "manifestStatus",
    chargeType: "chargeType",
    chargeBasis: "chargeBasis",
    mainSection: "mainSection",
    weightSection: "weightSection",
    minUpTo: "minUpTo",
    type: "documentType",
    role: "role",
    accountStatus: "accountStatus",
    branchAccess: "branchAccess",
    currency: "currency",
    terms: "terms",
    volumeCategory: "volumeCategory",
    transportMode: "transportMode",
    vehicleType: "vehicleType",
    paymentMode: "paymentMode",
    billingParty1CreditTerms: "creditTerms",
    palletPackageType: "packageType",
    palletDimensionUnit: "dimensionUnit",
    palletWeightUnit: "weightUnit",
    customerCode: "customerCode",
    customer: "customer",
    consigneeName: "consignee",
    origin: "origin",
    destination: "destination",
    pickupLocation: "pickupLocation",
    deliveryLocation: "deliveryLocation",
    transporter: "transporter"
  }[name] || name;
}

function statusOptions() {
  return [
    "Draft",
    "Pending Approvals",
    "Approved",
    "Booked",
    "Dispatched",
    "In-Transit",
    "Arrived",
    "Under-Clearance",
    "Clearance Delay",
    "Customs Cleared",
    "Partially Delivered",
    "Delivered",
    "Invoiced",
    "Closed"
  ];
}

// Manifest Status is the approval state for the manifest record itself. Operational status
// changes that propagate to linked shipments use manifestUpdateStatusOptions() below.
function manifestStatusOptions() {
  return ["Not Generated", "Pending Approval", "Approved", "Rejected"];
}

// The operational manifest status update changes the linked shipment statuses.
// Keep approval states limited to the separate Manifest Status field above.
function manifestUpdateStatusOptions() {
  return [
    "Draft",
    "Booked",
    "Dispatched",
    "In-Transit",
    "Arrived",
    "Under-Clearance",
    "Clearance Delay",
    "Customs Cleared",
    "Partially Delivered",
    "Delivered",
    "Invoiced",
    "Closed"
  ];
}
function roleOptions() {
  // Fixed choices for User Management. Legacy values remain selectable through
  // strictSelect when an older account is opened, so editing it never overwrites
  // a stored role silently.
  return ["Admin", "Operations", "Billings", "Accountant", "HR", "Management", "Read Only", "Staff"];
}

function accountStatusOptions() {
  return ["Active", "Inactive", "Locked"];
}

function branchAccessOptions() {
  return CANONICAL_BRANCHES.slice();
}

function volumeCategoryOptions() {
  return ["1 CBM = 167 KG", "1 CBM = 200 KG", "1 CBM = 250 KG", "1 CBM = 333 KG", "Same as Gross Weight"];
}

function currencyOptions() {
  return dropdownOptions("currency", ["KD", "KWD", "AED", "USD", "SAR", "QAR", "OMR", "BHD"]);
}

function volumeDivisorFor(category) {
  const label = String(category || "");
  if (/167/.test(label)) return 167;
  if (/200/.test(label)) return 200;
  if (/250/.test(label)) return 250;
  if (/333/.test(label)) return 333;
  const match = String(category || "").match(/=\s*(\d+(?:\.\d+)?)\s*KG/i);
  if (match) return Number(match[1]);
  return { Sea: 333, Land: 250, Air: 167 }[category] || 0;
}

function isSameAsGrossWeightCategory(category) {
  return String(category || "").trim().toLowerCase() === "same as gross weight";
}

function configurableColumns(type, defaults, scope = type) {
  const cleanDefaults = type === "shipment" ? defaults.filter(([key]) => !isRegisterAddressColumn(key)) : defaults.slice();
  const saved = state.ui[shipmentColumnSettingsKey(scope)];
  if (!saved || !Array.isArray(saved.order)) return cleanDefaults;
  const byKey = new Map(cleanDefaults);
  const ordered = [];
  saved.order.forEach((key) => {
    if (byKey.has(key) && saved.visible?.[key] !== false) ordered.push([key, byKey.get(key)]);
  });
  cleanDefaults.forEach(([key, label]) => {
    if (!ordered.some(([existingKey]) => existingKey === key) && saved.visible?.[key] !== false) ordered.push([key, label]);
  });
  return ordered.length ? ordered : cleanDefaults.slice(0, 1);
}

function shipmentColumnSettingsKey(scope) {
  if (scope === "shipment:dashboard") return "dashboardShipmentColumns";
  if (scope === "shipment:register") return "shipmentRegisterColumns";
  if (scope === "shipment:customer-history") return "customerShipmentHistoryColumns";
  return `columnSettings_${String(scope || "register").replace(/[^a-z0-9]+/gi, "_")}`;
}

function shipmentColumnsForScope(scope, defaults) {
  const cleanDefaults = defaults.filter(([key]) => !isRegisterAddressColumn(key));
  const saved = state.ui[shipmentColumnSettingsKey(scope)];
  if (!saved || !Array.isArray(saved.order)) return cleanDefaults;
  const byKey = new Map(cleanDefaults);
  const ordered = [];
  saved.order.forEach((key) => {
    if (byKey.has(key) && saved.visible?.[key] !== false) ordered.push([key, byKey.get(key)]);
  });
  cleanDefaults.forEach(([key, label]) => {
    if (!ordered.some(([existingKey]) => existingKey === key) && saved.visible?.[key] !== false) ordered.push([key, label]);
  });
  return ordered.length ? ordered : cleanDefaults.slice(0, 1);
}

function shipmentColumnSettings(scope, defaults) {
  const cleanDefaults = defaults.filter(([key]) => !isRegisterAddressColumn(key));
  const existing = state.ui[shipmentColumnSettingsKey(scope)];
  const order = Array.isArray(existing?.order) ? existing.order.filter((key) => cleanDefaults.some(([k]) => k === key)) : [];
  cleanDefaults.forEach(([key]) => { if (!order.includes(key)) order.push(key); });
  const visible = { ...(existing?.visible || {}) };
  cleanDefaults.forEach(([key]) => { if (!Object.prototype.hasOwnProperty.call(visible, key)) visible[key] = true; });
  return { defaults: cleanDefaults, order, visible };
}

function shipmentRegisterColumnSettings() {
  return shipmentColumnSettings("shipment:register", shipmentColumnDefaults("shipment:register"));
}

function dashboardColumnSettings() {
  return shipmentColumnSettings("shipment:dashboard", shipmentColumnDefaults("shipment:dashboard"));
}

function shipmentColumnSettingsMarkup(scope, title, settings) {
  const isOpen = state.ui.openColumnSettings === scope;
  const rows = settings.order.map((key) => {
    const label = settings.defaults.find(([k]) => k === key)?.[1] || key;
    return `<label class="shipment-column-setting" draggable="true" data-column-drag-key="${escapeHtml(key)}" data-column-scope="${escapeHtml(scope)}">
      <span class="shipment-column-drag" aria-hidden="true">☰</span>
      <input type="checkbox" data-action="toggle-shipment-column" data-column-scope="${escapeHtml(scope)}" data-column-key="${escapeHtml(key)}" ${settings.visible[key] !== false ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>`;
  }).join("");
  return `<div class="shipment-column-tools">
    <button type="button" class="secondary-button shipment-column-toggle" data-action="toggle-shipment-columns" data-column-scope="${escapeHtml(scope)}">⚙ Columns</button>
    <div class="shipment-column-menu" data-shipment-column-menu data-column-menu-scope="${escapeHtml(scope)}" ${isOpen ? "" : "hidden"}>
      <div class="shipment-column-menu-title">${escapeHtml(title)}</div>
      <div class="shipment-column-menu-help">Drag ☰ to arrange the order. Untick a column to hide it.</div>
      <div data-shipment-column-list>${rows}</div>
      <div class="shipment-column-menu-actions">
        <button type="button" class="secondary-button" data-action="select-all-shipment-columns" data-column-scope="${escapeHtml(scope)}">Select all</button>
        <button type="button" class="secondary-button" data-action="unselect-all-shipment-columns" data-column-scope="${escapeHtml(scope)}">Unselect all</button>
        <button type="button" class="secondary-button" data-action="reset-shipment-columns" data-column-scope="${escapeHtml(scope)}">Reset</button>
      </div>
    </div>
  </div>`;
}

function shipmentRegisterColumnsMarkup() {
  return shipmentColumnSettingsMarkup("shipment:register", "Shipment Register columns", shipmentRegisterColumnSettings());
}

function dashboardColumnSettingsMarkup() {
  return shipmentColumnSettingsMarkup("shipment:dashboard", "Dashboard shipment columns", dashboardColumnSettings());
}

function registerColumnSettingsMarkup(scope, title, defaults) {
  return shipmentColumnSettingsMarkup(scope, title, shipmentColumnSettings(scope, defaults || shipmentColumnDefaults(scope)));
}

function columnSettingsDefaults(scope) {
  if (scope === "shipmentStatus") return shipmentStatusColumns();
  if (scope.startsWith("metric:")) return dashboardMetricConfig(scope.slice("metric:".length))?.columns || [];
  if (scope === "shipment:pod" || scope === "shipment:dashboard" || scope === "shipment:register" || scope === "shipment:customer-history") return shipmentColumnDefaults(scope);
  return defaultColumnLayouts()[scope] || shipmentColumnDefaults(scope);
}

function isRegisterAddressColumn(key) {
  return /address/i.test(String(key || ""));
}

function defaultColumnLayouts() {
  return {
    shipment: [
      ["slNo", "SL."],
      ["bookingDate", "DATE"],
      ["jobNo", "JOB NO."],
      ["consoleNo", "CONSOLE NO."],
      ["airwayBillNo", "AWB Number"],
      ["origin", "ORIGIN"],
      ["destination", "DESTINATION"],
      ["customerReference", "CUSTOMER REFERENCE"],
      ["billTo1", "BILL TO"],
      ["shipperName", "SHIPPER"],
      ["consigneeName", "CONSIGNEE"],
      ["pickupLocation", "PICK UP LOCATIONS"],
      ["deliveryLocation", "DELIVERY LOCATION"],
      ["loadType", "LOAD TYPE"],
      ["shipmentService", "MODE FULL"],
      ["pieces", "PKGS / CARTONS"],
      ["palletCount", "No# of Pallets"],
      ["actualKg", "G.WT"],
      ["manualChargeableKg", "C.WT"],
      ["status", "STATUS"],
      ["createdBy", "USERNAME"]
    ],
    load: [["loadNo", "Manifest"], ["tripDate", "Trip Date"], ["origin", "Origin"], ["destination", "Destination"], ["transporter", "Transporter"], ["vehicleNo", "Truck No"], ["driverName", "Driver Name"], ["driverNumber", "Driver Number"], ["status", "Status"], ["manifestStatus", "Manifest"], ["jobNumbers", "Job Numbers"], ["createdBy", "USERNAME"]],
    customers: [["code", "Code"], ["name", "Name"], ["locationOrLane", "Lane / Location"], ["email", "Email"], ["mobile", "Mobile"], ["terms", "Terms"], ["status", "Status"], ["branch", "Branch"], ["createdBy", "USERNAME"]],
    suppliers: [["code", "Code"], ["name", "Name"], ["locationOrLane", "Lane / Location"], ["email", "Email"], ["mobile", "Mobile"], ["terms", "Terms"], ["status", "Status"], ["branch", "Branch"], ["createdBy", "USERNAME"]],
    tariff: [["tariffNo", "Tariff"], ["customer", "Consignee"], ["origin", "Origin"], ["destination", "Destination"], ["mainSection", "Main Section"], ["currency", "Currency"], ["minCharge", "Minimum Charge"], ["grandTotal", "Grand Total"], ["createdBy", "USERNAME"]],
    document: [["documentNo", "Documents"], ["linkedNo", "Linked To"], ["type", "Type"], ["status", "Status"], ["date", "Date"], ["owner", "Owner"]],
    invoice: [["invoiceNo", "Invoice"], ["customer", "Consignee"], ["shipmentNo", "Shipment"], ["revenue", "Revenue"], ["supplierCost", "Cost"], ["status", "Status"], ["date", "Date"], ["createdBy", "USERNAME"]],
    quotation: [["quotationNo", "Quotation"], ["date", "Date"], ["customerName", "Customer"], ["customerMobile", "Mobile"], ["customerEmail", "Email"], ["cbm", "CBM"], ["status", "Status"], ["createdBy", "USERNAME"]],
    shipmentRequest: [["requestNo", "Request"], ["createdAt", "Date"], ["customerName", "Customer"], ["shipmentType", "Type"], ["origin", "Origin"], ["destination", "Destination"], ["itemName", "Item"], ["status", "Status"]],
    customerUser: [["customerCode", "Customer Code"], ["username", "Portal Username"], ["email", "Email"], ["status", "Status"], ["lastLogin", "Last Login"], ["createdAt", "Created"]],
    charge: [["refNo", "Ref No"], ["shipmentNo", "Shipment No"], ["chargeType", "Charge Type"], ["supplier", "Supplier"], ["amount", "Amount"], ["taxAmount", "Tax"], ["totalAmount", "Total"], ["status", "Status"]],
    user: [["userName", "User"], ["email", "Email"], ["role", "Role"], ["accountStatus", "Status"], ["branchAccess", "Branch"]]
  };
}

function shipmentColumns(scope = "shipment:register") {
  return configurableColumns("shipment", defaultColumnLayouts().shipment, scope);
}

function loadColumns() {
  return configurableColumns("load", defaultColumnLayouts().load);
}

function partyColumns(type = "customers") {
  return configurableColumns(type, defaultColumnLayouts()[type] || defaultColumnLayouts().customers);
}

function tariffColumns() {
  return configurableColumns("tariff", defaultColumnLayouts().tariff);
}

function documentColumns() {
  return configurableColumns("document", defaultColumnLayouts().document);
}

function invoiceColumns() {
  return configurableColumns("invoice", defaultColumnLayouts().invoice).filter(([key]) => {
    if (key === "revenue") return canBillingSalesEntry();
    if (key === "supplierCost" || key === "totalCost") return canBillingCostEntry();
    if (key === "grossProfit" || key === "profitPercent") return canBillingCostEntry() && canBillingSalesEntry() && canViewProfitMargin();
    return true;
  });
}

function quotationColumns() {
  return configurableColumns("quotation", defaultColumnLayouts().quotation);
}

function shipmentRequestColumns() {
  return configurableColumns("shipmentRequest", defaultColumnLayouts().shipmentRequest);
}

function customerUserColumns() {
  return configurableColumns("customerUser", defaultColumnLayouts().customerUser);
}

function additionalChargeColumns() {
  return configurableColumns("charge", defaultColumnLayouts().charge);
}

function userColumns() {
  return configurableColumns("user", defaultColumnLayouts().user);
}

function customerRequestColumns() { return [["request_no", "Request"], ["item_name", "Item"], ["hs_code", "HS Code"], ["origin", "Origin"], ["destination", "Destination"], ["status", "Status"], ["created_at", "Created"]]; }
function customerShipmentColumns() { return [["job_no", "Shipment"], ["origin", "Origin"], ["destination", "Destination"], ["status", "Status"], ["pod_status", "POD"], ["invoice_status", "Invoice"]]; }
function customerNotificationColumns() { return [["title", "Title"], ["message", "Message"], ["read_status", "Status"], ["created_at", "Created"]]; }
function customerActivityColumns() { return [["action", "Action"], ["description", "Description"], ["ip_address", "IP"], ["created_at", "Created"]]; }

function userRequestColumns() {
  return [["requestNo", "Request"], ["requestType", "Type"], ["target", "Section"], ["referenceNo", "Reference"], ["requestedBy", "Requested By"], ["status", "Status"], ["date", "Date"]];
}

function auditColumns() {
  return [
    ["slNo", "Sr. No."],
    ["auditNumber", "Audit No."],
    ["dateTime", "Date Time"],
    ["reference", "Reference"],
    ["action", "Action"],
    ["user", "Updated By"]
  ];
}

function auditTableMarkup(rows) {
  const sortedRows = applySort("audit", rows);
  const columns = auditColumns();
  const locked = isColumnWidthLocked("audit");
  const headCells = columns.map(([key, label]) => sortableHeaderCell("audit", "audit", key, label, locked)).join("");
  const body = sortedRows.length
    ? sortedRows.map((row, index) => auditRowMarkup(row, index, columns)).join("")
    : `<tr><td colspan="${columns.length + 1}">${empty("No records found.")}</td></tr>`;
  return `${columnLockToggleMarkup("audit", locked)}<div class="table-wrap"><table><thead><tr>
    <th><input type="checkbox" data-action="toggle-select-all-audit" title="Select all" /></th>
    ${headCells}
  </tr></thead><tbody>${body}</tbody></table></div>`;
}

function auditRowMarkup(row, index, columns) {
  const id = escapeHtml(String(rowId("audit", row)));
  const stillSaving = !id;
  const cells = columns.map(([key]) => `<td>${cellHtml("audit", key, row, index)}</td>`).join("");
  return `<tr><td><input type="checkbox" class="audit-row-checkbox" data-audit-id="${id}" ${stillSaving ? "disabled title=\"Still saving - refresh in a moment\"" : ""} /></td>${cells}</tr>`;
}

function openShipmentRequestByNumber(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) {
    window.alert("Enter a Request No first.");
    return;
  }

  const match = state.shipmentRequests.find((row) => String(row.requestNo || "").trim().toLowerCase() === query);

  if (!match) {
    window.alert(`No request found matching "${rawQuery}".`);
    return;
  }

  openRecord("shipmentRequest", rowId("shipmentRequest", match));
}

function openQuotationByNumber(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) {
    window.alert("Enter a Quotation No first.");
    return;
  }

  const match = visibleRows(state.quotations).find((row) => String(row.quotationNo || "").trim().toLowerCase() === query);

  if (!match) {
    window.alert(`No quotation found matching "${rawQuery}". You may not have access to view this record.`);
    return;
  }

  openRecord("quotation", rowId("quotation", match));
}

function openInvoiceByNumber(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) {
    window.alert("Enter an Invoice No or Shipment No first.");
    return;
  }

  const match = visibleRows(state.invoices).find((row) => {
    const invoiceNo = String(row.invoiceNo || "").trim().toLowerCase();
    const shipmentNo = String(row.shipmentNo || "").trim().toLowerCase();
    return invoiceNo === query || shipmentNo === query;
  });

  if (!match) {
    window.alert(`No invoice found matching "${rawQuery}". You may not have access to view this record.`);
    return;
  }

  openRecord("invoice", rowId("invoice", match));
}

function openShipmentByNumber(rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) {
    window.alert("Enter a Job No, AWB No, or TCN No first.");
    return;
  }

  const searchAllBranches = String(state.settings.allowGlobalShipmentQuickSearch || "No").toLowerCase() === "yes";
  const searchPool = searchAllBranches ? state.shipments : visibleRows(state.shipments);

  const match = searchPool.find((row) => {
    const jobNo = String(row.jobNo || "").trim().toLowerCase();
    const awbNo = String(row.airwayBillNo || "").trim().toLowerCase();
    const tcnNumber = String(row.tcnNumber || "").trim().toLowerCase();
    return jobNo === query || awbNo === query || tcnNumber === query;
  });

  if (!match) {
    const message = searchAllBranches
      ? `No shipment found matching "${rawQuery}".`
      : `No shipment found matching "${rawQuery}". You may not have access to view this record.`;
    window.alert(message);
    return;
  }

  state.ui.activeShipmentNo = rowId("shipment", match);
  saveState();
  openRecord("shipment", rowId("shipment", match), match);
}

function rowId(type, row) {
  const keys = {
    shipment: "jobNo",
    load: "loadNo",
    pod: "jobNo",
    status: "jobNo",
    customers: "code",
    suppliers: "code",
    tariff: "tariffNo",
    document: "documentNo",
    podDocument: "documentNo",
    statusHistory: "id",
    charge: "refNo",
    invoice: "invoiceNo",
    quotation: "quotationNo",
    shipmentRequest: "requestNo",
    user: "userName",
    customerUser: "username",
    settings: "settingsKey",
    unblock: "requestNo",
    adminRequest: "requestNo",
    userRequest: "requestNo",
    audit: "id",
    employee: "userName",
    leaveRequest: "requestNo",
    payslip: "payslipNo",
    hrAnnouncement: "id"
  };
  const id = row[keys[type]] || "";
  return type === "userRequest" ? `${row.sourceType}:${id}` : id;
}

function collectionFor(type) {
  const collections = {
    shipment: visibleRows(state.shipments),
    load: visibleRows(state.loads),
    pod: visibleRows(state.shipments).filter((row) => !shipmentIsClosedJob(row)),
    status: visibleRows(state.shipments),
    customers: state.customers,
    suppliers: state.suppliers,
    tariff: visibleRows(state.tariffs),
    document: documentRegisterRows(visibleRows(state.documents)),
    podDocument: visibleRows(state.documents).filter((row) => String(row.type || "").toLowerCase() === "pod"),
    statusHistory: state.shipmentStatusHistory.filter((row) => row.id),
    charge: visibleRows(state.additionalCharges),
    invoice: visibleRows(state.invoices),
    quotation: visibleRows(state.quotations),
    shipmentRequest: state.shipmentRequests,
    user: state.users,
    customerUser: state.customerUsers,
    unblock: state.unblockRequests,
    adminRequest: state.adminRequests,
    userRequest: allUserRequests(),
    audit: state.audit,
    employee: state.employees,
    leaveRequest: state.leaveRequests,
    payslip: state.payslips,
    hrAnnouncement: state.hrAnnouncements
  };
  return collections[type] || [];
}

async function handleModuleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, type, id, mode } = button.dataset;

  if (action === "goto-module") {
    activeModule = button.dataset.module || activeModule;
    saveState();
    render();
    return;
  }

  if (action === "mark-announcement-read") {
    await markAnnouncementRead(button.dataset.id || "");
    return;
  }

  if (action === "edit-customer-request") {
    state.ui.customerRequestEditNo = button.dataset.requestNo || "";
    activeModule = "Customer New Shipment";
    saveState();
    render();
    return;
  }

  if (action === "view-customer-request") {
    const record = portalRows("shipmentRequests").find((row) => String(row.request_no || row.requestNo || "") === String(button.dataset.requestNo || ""));
    notifySuccess("Shipment request", `${button.dataset.requestNo || ""} is ${String(record?.status || "pending review").replace(/_/g, " ")}. Approved requests are locked for customer changes.`);
    return;
  }

  if (action === "toggle-shipment-columns") {
    const scope = button.dataset.columnScope || "shipment:register";
    rerenderColumnSettings(scope, state.ui.openColumnSettings !== scope);
    return;
  }

  if (action === "toggle-shipment-column") {
    const key = button.dataset.columnKey;
    const scope = button.dataset.columnScope || "shipment:register";
    const settings = shipmentColumnSettings(scope, columnSettingsDefaults(scope));
    const visibleCount = settings.order.filter((columnKey) => settings.visible[columnKey] !== false).length;
    if (button.checked === false && visibleCount <= 1) {
      button.checked = true;
      notifyDenied("Column selection", "At least one column must remain visible.");
      return;
    }
    state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible: { ...settings.visible, [key]: button.checked } };
    saveState();
    rerenderColumnSettings(scope);
    return;
  }

  if (action === "select-all-shipment-columns") {
    const scope = button.dataset.columnScope || "shipment:register";
    const settings = shipmentColumnSettings(scope, columnSettingsDefaults(scope));
    const visible = {};
    settings.defaults.forEach(([key]) => { visible[key] = true; });
    state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible };
    saveState();
    rerenderColumnSettings(scope);
    return;
  }

  if (action === "unselect-all-shipment-columns") {
    const scope = button.dataset.columnScope || "shipment:register";
    const settings = shipmentColumnSettings(scope, columnSettingsDefaults(scope));
    const visible = {};
    // Keep the first column visible - a table with zero columns has nothing to show or click,
    // and the individual checkbox toggle already enforces "at least one column must remain
    // visible", so bulk-unselecting should leave the table in that same valid minimum state
    // rather than an empty one, ready for the user to tick back on whichever ones they want.
    settings.order.forEach((key, index) => { visible[key] = index === 0; });
    state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible };
    saveState();
    rerenderColumnSettings(scope);
    return;
  }

  if (action === "reset-shipment-columns") {
    const scope = button.dataset.columnScope || "shipment:register";
    state.ui[shipmentColumnSettingsKey(scope)] = null;
    saveState();
    rerenderColumnSettings(scope);
    return;
  }

  if (action === "toggle-column-lock") {
    const scope = button.dataset.scope;
    state.ui.columnWidthsLocked = state.ui.columnWidthsLocked || {};
    state.ui.columnWidthsLocked[scope] = !state.ui.columnWidthsLocked[scope];
    saveState();
    render();
    return;
  }

  if (action === "print-quotation") {
    printQuotation(id);
    return;
  }

  if (action === "convert-quotation") {
    convertQuotationToShipment(id);
    return;
  }

  if (action === "quick-open-shipment-request") {
    openShipmentRequestByNumber(document.querySelector("#quickOpenShipmentRequestInput")?.value || "");
    return;
  }

  if (action === "approve-shipment-request") {
    approveShipmentRequest(id);
    return;
  }

  if (action === "send-back-shipment-request") {
    sendBackShipmentRequest(id);
    return;
  }

  if (action === "approve-leave-request") {
    decideLeaveRequest(id, true);
    return;
  }

  if (action === "reject-leave-request") {
    decideLeaveRequest(id, false);
    return;
  }

  if (action === "convert-shipment-request") {
    convertShipmentRequestToShipment(id);
    return;
  }

  if (action === "quick-open-quotation") {
    openQuotationByNumber(document.querySelector("#quickOpenQuotationInput")?.value || "");
    return;
  }

  if (action === "quick-open-invoice") {
    openInvoiceByNumber(document.querySelector("#quickOpenInvoiceInput")?.value || "");
    return;
  }

  if (action === "quick-open-shipment") {
    openShipmentByNumber(document.querySelector("#quickOpenShipmentInput")?.value || "");
    return;
  }

  if (action === "sort-column") {
    const key = button.dataset.key;
    const scope = button.dataset.scope || type;
    state.ui.sort = state.ui.sort || {};
    const current = state.ui.sort[scope];
    const direction = current && current.key === key
      ? (current.direction === "asc" ? "desc" : "asc")
      : guessDefaultSortDirection(type, key);
    state.ui.sort[scope] = { key, direction };
    saveState();
    render();
    return;
  }

  if (action === "table-page") {
    const scope = button.dataset.pageScope || type || "register";
    state.ui.tablePages = state.ui.tablePages || {};
    state.ui.tablePages[scope] = Math.max(1, Number(button.dataset.page || 1));
    saveState();
    if (scope === "shipment:customer-history" && state.ui.customerShipmentHistory?.customerCode) {
      openCustomerShipmentHistory(state.ui.customerShipmentHistory.customerCode, state.ui.customerShipmentHistory);
      return;
    }
    if (scope.startsWith("metric:")) {
      openDashboardMetricDialog(scope.slice("metric:".length));
      return;
    }
    render();
    return;
  }

  if (action === "open") {
    openRecord(type, id);
    return;
  }

  if (action === "upload-employee-document") {
    await uploadEmployeeProfileDocument(button.dataset.documentType || "");
    return;
  }

  if (action === "view-employee-document") {
    await viewEmployeeProfileDocument(button.dataset.documentNo || "");
    return;
  }

  if (action === "view-document") {
    await viewStoredDocument(button.dataset.documentNo || "");
    return;
  }

  if (action === "delete-employee-document") {
    await deleteEmployeeProfileDocument(button.dataset.documentNo || "");
    return;
  }

  if (action === "view-employee-documents") {
    await openEmployeeDocumentsDialog(id);
    return;
  }

  if (action === "upload-employee-document-admin") {
    await uploadEmployeeProfileDocumentAsAdmin(button.dataset.employee || "", button.dataset.documentType || "");
    return;
  }

  if (action === "toggle-employee-document-lock") {
    await toggleEmployeeDocumentLock(button.dataset.documentNo || "", button.dataset.locked !== "true");
    return;
  }

  if (action === "new-record") {
    openNewDialog(selectedNewRecordType(type), mode || "");
    return;
  }

  if (action === "load-record") {
    handleLoadRecord(type);
    return;
  }

  if (action === "view-load") {
    // Also used by the shipment register's Console No. column (any module) to jump straight to
    // that manifest - not just the Manifest register's own "View Jobs"/number click, which is
    // already on the Manifest module and only needs to select the row.
    activeModule = "Manifest";
    state.ui.selectedLoadNo = id;
    saveState();
    render();
    return;
  }

  if (action === "remove-load-job") {
    await removeJobFromLoad(button.dataset.loadId, button.dataset.jobId);
    return;
  }

  if (action === "delete-record") {
    await deleteSelectedRecord(type);
    return;
  }

  if (action === "delete-record-direct") {
    await deleteRecordById(type, id);
    return;
  }

  if (action === "request-block" || action === "request-unblock") {
    await submitBlockRequest(type, selectedRecordId(type), action === "request-block" ? "Block" : "Unblock");
    return;
  }

  if (action === "generate-document" || action === "export-document") {
    generateRecordDocument(type, selectedRecordId(type), action === "export-document");
    return;
  }

  if (action === "upload-pod-file") {
    await uploadPodFileForSelectedShipment(selectedRecordId("pod"));
    return;
  }

  if (action === "view-pod-file") {
    viewPodFileForSelectedShipment(selectedRecordId("pod"));
    return;
  }

  if (action === "export-list") {
    exportCollectionCsv(type);
    return;
  }
  if (action === "export-dashboard-metric") {
    exportDashboardMetricExcel(button.dataset.dashboardMetric || "");
    return;
  }

  if (action === "approve-load-manifest") {
    await approveLoadManifest(id);
    return;
  }

  if (action === "send-status-email") {
    sendShipmentStatusEmail(selectedRecordId("status"));
    return;
  }

  if (action === "toggle-status-row") {
    state.ui.expandedStatusJob = state.ui.expandedStatusJob === id ? "" : id;
    state.ui.expandedStatusAwb = "";
    saveState();
    render();
    return;
  }

  if (action === "toggle-status-awb") {
    const awb = String(button.dataset.awb || "").trim();
    state.ui.expandedStatusAwb = String(state.ui.expandedStatusAwb || "").toLowerCase() === awb.toLowerCase() ? "" : awb;
    state.ui.expandedStatusJob = "";
    saveState();
    render();
    return;
  }

  if (action === "send-status-email-row") {
    sendShipmentStatusEmail(id);
    return;
  }

  if (action === "preview-report") {
    previewReport();
    return;
  }

  if (action === "reset-report-range") {
    state.ui.reportFromDate = "";
    state.ui.reportToDate = "";
    state.ui.reportPreview = null;
    saveState();
    render();
    return;
  }

  if (action === "export-report") {
    exportReport();
    return;
  }

  if (action === "margin-report") {
    if (!canViewProfitMargin() || !canBillingSalesEntry() || !canBillingCostEntry()) {
      notifyDenied("Not allowed", "You do not have permission to view profit margin.");
      return;
    }
    const margin = filteredRows(visibleRows(state.shipments)).reduce((sum, row) => sum + Number(row.sell || 0) - Number(row.buyCost || 0), 0);
    window.alert(`Current margin: ${money(margin)}`);
    return;
  }

  if (action === "filter-charges") {
    applyChargeFilters();
    return;
  }

  if (action === "toggle-settings") {
    state.ui.showSettingsForm = !state.ui.showSettingsForm;
    saveState();
    render();
    return;
  }

  if (action === "filter-audit") {
    applyAuditFilters();
    return;
  }

  if (action === "toggle-select-all-audit") {
    const checked = event.target.checked;
    moduleContent.querySelectorAll(".audit-row-checkbox").forEach((box) => {
      box.checked = checked;
    });
    return;
  }

  if (action === "delete-audit-log-selected") {
    await deleteSelectedAuditLogs();
    return;
  }
}

function rerenderColumnSettings(scope, keepOpen = true) {
  const pageTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const currentMenu = moduleContent.querySelector(`[data-column-menu-scope="${scope}"]`);
  const menuTop = currentMenu?.scrollTop || 0;
  state.ui.openColumnSettings = keepOpen ? scope : "";
  if (scope.startsWith("metric:")) {
    openDashboardMetricDialog(scope.slice("metric:".length));
    return;
  }
  if (scope === "shipment:customer-history" && state.ui.customerShipmentHistory?.customerCode) {
    openCustomerShipmentHistory(state.ui.customerShipmentHistory.customerCode, state.ui.customerShipmentHistory);
    return;
  }
  render();
  requestAnimationFrame(() => {
    window.scrollTo(0, pageTop);
    const nextMenu = moduleContent.querySelector(`[data-column-menu-scope="${scope}"]`);
    if (nextMenu) nextMenu.scrollTop = menuTop;
  });
}

function handleShipmentColumnDragStart(event) {
  const row = event.target.closest("[data-column-drag-key]");
  if (!row) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.columnDragKey);
  event.dataTransfer.setData("application/x-apollo-column-scope", row.dataset.columnScope || "shipment:register");
  row.style.opacity = "0.55";
}

function handleShipmentColumnDragOver(event) {
  const row = event.target.closest("[data-column-drag-key]");
  if (!row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleShipmentColumnDrop(event) {
  const target = event.target.closest("[data-column-drag-key]");
  if (!target) return;
  event.preventDefault();
  const sourceKey = event.dataTransfer.getData("text/plain");
  const sourceScope = event.dataTransfer.getData("application/x-apollo-column-scope") || "shipment:register";
  const targetScope = target.dataset.columnScope || "shipment:register";
  const targetKey = target.dataset.columnDragKey;
  if (!sourceKey || !targetKey || sourceKey === targetKey || sourceScope !== targetScope) return;
  const settings = shipmentColumnSettings(targetScope, columnSettingsDefaults(targetScope));
  const order = settings.order.filter((key) => key !== sourceKey);
  const targetIndex = order.indexOf(targetKey);
  order.splice(targetIndex < 0 ? order.length : targetIndex, 0, sourceKey);
  state.ui[shipmentColumnSettingsKey(targetScope)] = { ...settings, order };
  saveState();
  rerenderColumnSettings(targetScope);
}

function handleColumnResizeStart(event) {
  const handle = event.target.closest(".col-resize-handle");
  if (!handle) return;
  event.preventDefault();

  const scope = handle.dataset.resizeScope;
  const key = handle.dataset.resizeKey;
  if (isColumnWidthLocked(scope)) return;
  const th = handle.closest("th");
  const headerRow = th.parentElement;
  const allThs = Array.from(headerRow.querySelectorAll("th"));

  state.ui.columnWidths = state.ui.columnWidths || {};
  if (!state.ui.columnWidths[scope]) {
    state.ui.columnWidths[scope] = {};
    allThs.forEach((cell) => {
      const cellHandle = cell.querySelector(".col-resize-handle");
      const cellKey = cellHandle?.dataset.resizeKey;
      if (cellKey) {
        const currentWidth = Math.round(cell.getBoundingClientRect().width);
        state.ui.columnWidths[scope][cellKey] = currentWidth;
        cell.style.width = `${currentWidth}px`;
      }
    });
    th.closest("table").style.tableLayout = "fixed";
  }

  const startX = event.clientX;
  const startWidth = th.getBoundingClientRect().width;
  const MIN_WIDTH = 40;

  function onMouseMove(moveEvent) {
    const newWidth = Math.max(MIN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));
    th.style.width = `${newWidth}px`;
    state.ui.columnWidths[scope][key] = newWidth;
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    saveState();
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function handleModuleLinkClick(event) {
  const customerDetailsButton = event.target.closest("[data-customer-details]");
  if (customerDetailsButton) {
    openCustomerDetails(customerDetailsButton.dataset.customerDetails || "");
    return;
  }
  const recordButton = event.target.closest("[data-record-open]");
  if (recordButton) {
    const recordType = recordButton.dataset.recordType || "";
    const recordId = recordButton.dataset.recordId || "";
    if (recordType && recordId) openRecord(recordType, recordId);
    return;
  }

  const auditButton = event.target.closest("[data-audit-open]");
  if (auditButton) {
    openAuditDetailDialog(auditButton.dataset.auditRef || "");
    return;
  }

  const shipmentButton = event.target.closest("[data-shipment-open]");
  if (shipmentButton) {
    const shipmentId = shipmentButton.dataset.shipmentId || "";
    if (shipmentId) {
      openRecord("shipment", shipmentId);
    }
    return;
  }

  const metricCard = event.target.closest("[data-dashboard-metric]");
  if (metricCard) {
    openDashboardMetricDialog(metricCard.dataset.dashboardMetric);
  }
}

function handleModuleKeydown(event) {
  if (event.key === "Enter" && event.target.id === "quickOpenShipmentRequestInput") {
    event.preventDefault();
    openShipmentRequestByNumber(event.target.value);
    return;
  }
  if (event.key === "Enter" && event.target.id === "quickOpenQuotationInput") {
    event.preventDefault();
    openQuotationByNumber(event.target.value);
    return;
  }
  if (event.key === "Enter" && event.target.id === "quickOpenInvoiceInput") {
    event.preventDefault();
    openInvoiceByNumber(event.target.value);
    return;
  }
  if (event.key === "Enter" && event.target.id === "quickOpenShipmentInput") {
    event.preventDefault();
    openShipmentByNumber(event.target.value);
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  const metricCard = event.target.closest("[data-dashboard-metric]");
  if (!metricCard) return;
  event.preventDefault();
  openDashboardMetricDialog(metricCard.dataset.dashboardMetric);
}

function selectedRecordId(type) {
  // The searchable selector is the source of truth for action buttons. The legacy
  // activeShipmentNo value can point at a previously opened or latest shipment and
  // must never override the user's current selection.
  return String(moduleContent.querySelector(`[data-load-select='${type}']`)?.value || "").trim();
}

function selectedNewRecordType(type) {
  return moduleContent.querySelector(`[data-new-select='${type}']`)?.value || type;
}

function handleLoadRecord(type) {
  let selectedId = selectedRecordId(type);

  if (type === "load") {
    if (!selectedId) {
      window.alert("Select a consolidation first.");
      return;
    }
    state.ui.selectedLoadNo = selectedId;
    saveState();
    render();
    return;
  }

  if (type === "status") {
    if (!selectedId) {
      window.alert("Select a shipment first.");
      return;
    }
    state.ui.expandedStatusJob = selectedId;
    saveState();
    render();
    return;
  }

  if (type === "pod") {
    openPodDialog(selectedId);
    return;
  }

  if (!selectedId) {
    const fallback = collectionFor(type)[0];
    selectedId = fallback ? rowId(type, fallback) : "";
  }

  if (selectedId) {
    openRecord(type, selectedId);
    return;
  }

  openLoadDialog(type);
}

function openRecord(type, id, presetRecord) {
  const collection = collectionFor(type);
  const record = presetRecord || collection.find((row) => rowId(type, row) === id);
  if (!record) return;
  if (type === "shipment") {
    state.ui.activeShipmentNo = rowId("shipment", record);
    saveState();
  }
  if (recordDialog.open) {
    skipNextDialogCloseReset = true;
    recordDialog.close();
  }

  if (type === "shipment" && (record.entryMode === "airway" || (String(record.jobNo || "").startsWith("AWB") && record.airwayBillNo === record.jobNo))) {
    openShipmentFromAirwayBill(record, record.airwayBillNo || record.jobNo, record.branch);
    return;
  }

  if (type === "adminRequest") {
    openAdminRequestDialog(record);
    return;
  }

  if (type === "unblock") {
    openBlockRequestDialog(record);
    return;
  }

  if (type === "userRequest") {
    if (record.sourceType === "adminRequest") openAdminRequestDialog(record);
    else openBlockRequestDialog(record);
    return;
  }

  if (type === "tariff") {
    editing = { type, id, record };
    dialogState = null;
    openDialog({
      title: `Tariff - ${id}`,
      typeLabel: "Tariff",
      saveLabel: "Save Changes",
      body: tariffDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        rememberDropdownOptions(data);
        const updatedRecord = buildTariffRecord(data, record);
        state.tariffs = state.tariffs.map((row) => rowId("tariff", row) === id ? updatedRecord : row);
        await persistRecord("tariff", updatedRecord);
        saveState();
        recordDialog.close();
        render();
      },
      afterOpen: () => {
        bindTariffWeightRates();
        bindTariffAdditionalCharges(record.additionalChargesJson || "[]");
      }
    });
    return;
  }

  if (type === "shipmentRequest") {
    editing = { type, id, record };
    dialogState = null;
    const isPending = ["SUBMITTED", "PENDING_REVIEW"].includes(String(record.status || "").toUpperCase());
    openDialog({
      title: `Shipment Request - ${id}`,
      typeLabel: "Shipment Request",
      saveLabel: "Save Notes",
      secondaryLabel: isPending ? "Approve" : "",
      onSecondary: isPending ? () => approveShipmentRequest(id, true) : null,
      body: shipmentRequestDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        const updatedRecord = { ...record, approvalNotes: data.approvalNotes || record.approvalNotes || "" };
        state.shipmentRequests = state.shipmentRequests.map((row) => rowId("shipmentRequest", row) === id ? updatedRecord : row);
        await persistRecord("shipmentRequest", updatedRecord);
        saveState();
        recordDialog.close();
        render();
        notifySuccess("Notes saved", `${id} was updated.`);
      },
      afterOpen: () => {
        dialogBody.querySelector("[data-dialog-action='send-back-request']")?.addEventListener("click", () => sendBackShipmentRequest(id, true));
      }
    });
    return;
  }

  if (type === "quotation") {
    editing = { type, id, record };
    dialogState = null;
    openDialog({
      title: `Quotation - ${id}`,
      typeLabel: "Quotation",
      saveLabel: "Save Changes",
      body: quotationDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        rememberDropdownOptions(data);
        const updatedRecord = {
          ...record,
          date: data.date || record.date || today(),
          status: data.status || record.status || "Draft",
          branch: normalizeBranchName(data.branch || record.branch || defaultUserBranch()),
          customerName: data.customerName || record.customerName || "",
          customerContactPerson: data.customerContactPerson || record.customerContactPerson || "",
          customerMobile: data.customerMobile || record.customerMobile || "",
          customerEmail: data.customerEmail || record.customerEmail || "",
          cargoItemsJson: data.cargoItemsJson || record.cargoItemsJson || "[]",
          natureOfGoods: data.natureOfGoods || record.natureOfGoods || "",
          volumeCategory: data.volumeCategory || record.volumeCategory || "1 CBM = 250 KG",
          cbm: Number(data.cbm || record.cbm || 0),
          actualKg: Number(data.actualKg || record.actualKg || 0),
          notes: data.notes || record.notes || "",
          convertedJobNo: data.convertedJobNo || record.convertedJobNo || ""
        };
        state.quotations = state.quotations.map((row) => rowId("quotation", row) === id ? updatedRecord : row);
        await persistRecord("quotation", updatedRecord);
        saveState();
        recordDialog.close();
        render();
      },
      afterOpen: () => {
        bindPalletDimensionBuilder();
      }
    });
    return;
  }

  if (type === "customerUser") {
    editing = { type, id, record };
    dialogState = null;
    openDialog({
      title: `Customer Portal Account - ${id}`,
      typeLabel: "Customer Portal Account",
      saveLabel: "Save Changes",
      body: customerUserDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        const updatedRecord = {
          ...record,
          customerCode: data.customerCode || record.customerCode || "",
          email: data.email || record.email || "",
          status: data.status || record.status || "ACTIVE"
        };
        const payload = { ...updatedRecord };
        if (String(data.password || "").trim()) {
          payload.password = data.password;
        }
        const saved = await persistRecord("customerUser", payload);
        if (!saved) {
          notifyDenied("Not saved", "This account could not be saved to the server. Please try again.");
          return;
        }
        state.customerUsers = state.customerUsers.map((row) => rowId("customerUser", row) === id ? updatedRecord : row);
        saveState();
        recordDialog.close();
        render();
        notifySuccess("Account updated", `${id} was updated successfully.`);
      }
    });
    return;
  }

  if (type === "user") {
    editing = { type, id, record };
    dialogState = null;
    openDialog({
      title: `User - ${id}`,
      typeLabel: "User",
      saveLabel: "Save Changes",
      body: userDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        const updatedRecord = {
          ...record,
          email: data.email || record.email || "",
          role: data.role || record.role || "Operations",
          accountStatus: data.accountStatus || record.accountStatus || "Active",
          branchAccess: data.branchAccess || record.branchAccess || "",
          branchViewScope: normalizeBranchViewScope(data.branchViewScope || record.branchViewScope),
          sectionAccess: data.sectionAccess || record.sectionAccess || "",
          canViewAllEntry: isChecked(data.canViewAllEntry),
          canViewOnlySelfEntry: isChecked(data.canViewOnlySelfEntry),
          canEditAllEntry: isChecked(data.canEditAllEntry),
          canViewUpdatedHistory: isChecked(data.canViewUpdatedHistory),
          canBillingSalesEntry: isChecked(data.canBillingSalesEntry),
          canBillingCostEntry: isChecked(data.canBillingCostEntry),
          hrPortalAccess: isChecked(data.hrPortalAccess),
          erpPortalAccess: isChecked(data.erpPortalAccess),
          isHrAdmin: isChecked(data.isHrAdmin),
          maintenancePortalAccess: isChecked(data.maintenancePortalAccess),
          crmPortalAccess: isChecked(data.crmPortalAccess),
          crmRole: data.crmRole || record.crmRole || "Sales Executive",
          crmViewAllAccounts: isChecked(data.crmViewAllAccounts),
          crmManageAssignments: isChecked(data.crmManageAssignments),
          crmExportAccess: isChecked(data.crmExportAccess),
          crmArchiveAccess: isChecked(data.crmArchiveAccess),
          crmViewTeamReports: isChecked(data.crmViewTeamReports),
          crmAdminAccess: isChecked(data.crmAdminAccess),
          aiAccess: isChecked(data.aiAccess),
          notes: data.notes || record.notes || ""
        };
        const payload = { ...updatedRecord };
        if (String(data.password || "").trim()) {
          payload.password = data.password;
        }
        const saved = await persistRecord("user", payload);
        if (!saved) {
          notifyDenied("Not saved", "This user could not be saved to the server. Please try again.");
          return;
        }
        state.users = state.users.map((row) => rowId("user", row) === id ? updatedRecord : row);
        saveState();
        recordDialog.close();
        render();
        notifySuccess("User updated", `${id} was updated successfully.`);
      }
    });
    return;
  }

  if (type === "invoice") {
    editing = { type, id, record };
    dialogState = null;
    openDialog({
      title: `Invoice - ${id}`,
      typeLabel: "Invoice",
      saveLabel: "Save Changes",
      body: invoiceDialogBody(record),
      onSave: async () => {
        const data = collectFormValues(dialogBody.closest("form"));
        rememberDropdownOptions(data);
        const selectedCurrency = String(data.currency || record.currency || "KD").trim();
        const invoiceSnapshot = parseJsonMeta(data.invoiceSnapshotJson || record.invoiceSnapshotJson || "{}");
        const updatedRecord = {
          ...record,
          customer: data.customer || record.customer || "",
          shipmentNo: data.shipmentNo || record.shipmentNo || "",
          tariffNo: data.tariffNo || record.tariffNo || "",
          tariffName: data.tariffName || record.tariffName || "",
          chargeableWeight: Number(data.chargeableWeight || record.chargeableWeight || 0),
          grossWeight: Number(data.grossWeight || record.grossWeight || 0),
          volumeWeight: Number(data.volumeWeight || record.volumeWeight || 0),
          currency: selectedCurrency,
          taxPercent: Number(data.taxPercent || record.taxPercent || 0),
          revenue: canBillingSalesEntry() ? Number(data.revenue || record.revenue || 0) : Number(record.revenue || 0),
          supplierCost: canBillingCostEntry() ? Number(data.supplierCost || data.totalCost || record.supplierCost || 0) : Number(record.supplierCost || 0),
          totalCost: canBillingCostEntry() ? Number(data.totalCost || record.totalCost || data.supplierCost || 0) : Number(record.totalCost || 0),
          taxAmount: canBillingSalesEntry() ? Number(data.taxAmount || record.taxAmount || 0) : Number(record.taxAmount || 0),
          grossProfit: canBillingSalesEntry() && canBillingCostEntry() && canViewProfitMargin() ? Number(data.grossProfit || record.grossProfit || 0) : Number(record.grossProfit || 0),
          profitPercent: canBillingSalesEntry() && canBillingCostEntry() && canViewProfitMargin() ? Number(data.profitPercent || record.profitPercent || 0) : Number(record.profitPercent || 0),
          grandTotal: canBillingSalesEntry() ? Number(data.grandTotal || record.grandTotal || 0) : Number(record.grandTotal || 0),
          status: data.status || record.status || "Draft",
          date: data.date || record.date || today(),
          invoiceLinesJson: data.invoiceLinesJson || record.invoiceLinesJson || "[]",
          tariffSnapshotJson: data.tariffSnapshotJson || record.tariffSnapshotJson || "{}",
          invoiceSnapshotJson: JSON.stringify({
            ...invoiceSnapshot,
            currency: selectedCurrency,
            shipmentVia: shipmentViaValue(state.shipments.find((shipmentItem) => shipmentItem.jobNo === (data.shipmentNo || record.shipmentNo))),
            from: (() => { const s = state.shipments.find((shipmentItem) => shipmentItem.jobNo === (data.shipmentNo || record.shipmentNo)); return s?.origin || s?.shipperName || s?.pickupLocation || ""; })(),
            to: (() => { const s = state.shipments.find((shipmentItem) => shipmentItem.jobNo === (data.shipmentNo || record.shipmentNo)); return s?.destination || s?.consigneeName || s?.deliveryLocation || ""; })(),
            loadType: (() => { const s = state.shipments.find((shipmentItem) => shipmentItem.jobNo === (data.shipmentNo || record.shipmentNo)); return s?.loadType || ""; })(),
            grossWeight: Number(data.grossWeight || record.grossWeight || invoiceSnapshot.grossWeight || 0),
            volumeWeight: Number(data.volumeWeight || record.volumeWeight || invoiceSnapshot.volumeWeight || 0)
          })
        };
        const saved = await persistRecord("invoice", updatedRecord);
        if (!saved) {
          notifyDenied("Invoice not saved", "The live database could not save this invoice. Please correct the displayed error and try again.");
          return false;
        }
        state.invoices = state.invoices.map((row) => rowId("invoice", row) === id ? updatedRecord : row);
        saveState();
        recordDialog.close();
        render();
        notifySuccess("Invoice saved", `${id} was saved successfully.`);
        return true;
      },
      afterOpen: bindInvoiceShipmentTariff
    });
    return;
  }

  editing = { type, id, record };
  dialogState = null;
  dialogType.textContent = `${type} record`;
  dialogTitle.textContent = id;
  dialogSave.textContent = type === "charge" && !isAdminSession() ? "Send Change Request" : "Save Changes";
  dialogSecondary.classList.add("is-hidden");
  dialogBody.innerHTML = type === "shipment"
    ? shipmentDialogBody(record.entryMode || "shipment", record)
    : Object.entries(record)
      .map(([key, value]) => detailFieldControl(type, key, value, record))
      .join("");
  if (type === "shipment") bindShipmentDirectionDialog();
  if (type === "shipment") bindShipmentCustomerTariffs();
  if (type === "shipment") bindShipmentCustomerAutofill();
  if (type === "shipment") bindShipmentCopySections();
  if (type === "shipment") bindTransporterAutofill();
  if (type === "shipment") bindTariffFinancialAutofill();
  if (type === "shipment") bindVolumeCalculator();
  if (type === "shipment") bindPalletDimensionBuilder();
  if (type === "shipment") bindAwbFetchButton();
  if (type === "tariff") bindTariffAdditionalCharges(record.additionalChargesJson || "[]");
  if (type === "load") bindConsolidationJobPicker();
  if (type === "invoice") bindInvoiceShipmentTariff();
  if (type === "shipment" && shipmentIsReadOnlyForCurrentUser(record)) applyShipmentReadOnlyLock();
  bindDialogPasswordToggles();
  resetDialogChrome();
  moveToastStackIntoDialog();
  recordDialog.showModal();
}

// Locks a shipment dialog to view-only: disables every field/control in the body and hides the
// Save/secondary buttons. Used for Delivered shipments opened by a non-admin - admins are never
// affected (shipmentIsReadOnlyForCurrentUser already returns false for them).
function applyShipmentReadOnlyLock() {
  dialogBody.querySelectorAll("input, select, textarea, button").forEach((field) => { field.disabled = true; });
  dialogSave.classList.add("is-hidden");
  dialogSecondary.classList.add("is-hidden");
  const notice = document.createElement("p");
  notice.className = "empty-state";
  notice.textContent = "This shipment is Delivered. It is read-only for your account - contact an admin if it needs changes.";
  dialogBody.prepend(notice);
}

function duplicateRecordExists(type, id) {
  const normalized = String(id || "").trim().toLowerCase();
  if (!normalized) return false;
  return allCollectionFor(type).some((row) => String(rowId(type, row) || "").trim().toLowerCase() === normalized);
}

function allCollectionFor(type) {
  const collections = {
    shipment: state.shipments,
    load: state.loads,
    customers: state.customers,
    suppliers: state.suppliers,
    tariff: state.tariffs,
    document: state.documents,
    charge: state.additionalCharges,
    invoice: state.invoices,
    quotation: state.quotations,
    shipmentRequest: state.shipmentRequests,
    user: state.users,
    customerUser: state.customerUsers,
    unblock: state.unblockRequests,
    adminRequest: state.adminRequests,
    employee: state.employees,
    leaveRequest: state.leaveRequests,
    payslip: state.payslips,
    hrAnnouncement: state.hrAnnouncements
  };
  return collections[type] || collectionFor(type);
}

function notifyDuplicate(id) {
  const message = `${id} is already used. Enter a different serial number.`;
  notifyDenied("Already used", message);
  window.alert(`Already used\n${message}`);
}

function isDuplicateCustomerDetails(name, email, mobile, excludeCode = "") {
  const normalizedName = String(name || "").trim().toLowerCase();
  if (!normalizedName) return false;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedMobile = String(mobile || "").trim().toLowerCase();
  const normalizedExclude = String(excludeCode || "").trim().toLowerCase();
  return state.customers.some((row) => {
    if (String(row.code || "").trim().toLowerCase() === normalizedExclude) return false;
    if (String(row.name || "").trim().toLowerCase() !== normalizedName) return false;
    const rowEmail = String(row.email || "").trim().toLowerCase();
    const rowMobile = String(row.mobile || "").trim().toLowerCase();
    return (normalizedEmail && rowEmail === normalizedEmail) || (normalizedMobile && rowMobile === normalizedMobile);
  });
}

function notifyDuplicateCustomer() {
  notifyDenied("Duplicate customer", "Another customer already exists with this same name and email or mobile number.");
}

// Airway Bill numbers must be unique per branch (the same AWB can legitimately be reused across
// different branches, e.g. Kuwait HO and Dubai each running their own numbering) but never twice
// within the same branch. excludeJobNo lets an edit compare against every OTHER shipment without
// flagging itself as a duplicate of its own current AWB.
function duplicateAirwayBillExists(awbNo, branch, excludeJobNo = "") {
  const normalizedAwb = String(awbNo || "").trim().toLowerCase();
  if (!normalizedAwb) return false;
  const normalizedBranch = normalizeBranchName(branch).toLowerCase();
  const excludeNormalized = String(excludeJobNo || "").trim().toLowerCase();
  return state.shipments.some((row) => {
    if (excludeNormalized && String(row.jobNo || "").trim().toLowerCase() === excludeNormalized) return false;
    if (String(row.airwayBillNo || "").trim().toLowerCase() !== normalizedAwb) return false;
    return normalizeBranchName(row.branch).toLowerCase() === normalizedBranch;
  });
}

function notifyDuplicateAirwayBill(awbNo, branch) {
  const message = `Airway Bill ${awbNo} is already used by another shipment in ${branch || "this branch"}. Enter a different AWB number.`;
  notifyDenied("Airway Bill already used", message);
  window.alert(`Airway Bill already used\n${message}`);
}

function detailFieldControl(type, key, value, record) {
  const readonlyKeys = new Set(["jobNo", "loadNo", "code", "tariffNo", "documentNo", "invoiceNo", "refNo", "userName", "requestNo", "payslipNo"]);
  const options = detailFieldOptions(type, key, record);
  if (type === "shipment" && ["sell", "buyCost"].includes(key)) {
    return "";
  }
  if (type === "shipment" && ["transitPoint", "route", "invoiceCopy", "packingListCopy", "podCopy", "customsDocuments", "otherDocuments"].includes(key)) {
    return `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}" />`;
  }
  if (type === "shipment" && key === "actualKg" && record?.entryMode === "airway") {
    return `<input type="hidden" name="actualKg" value="${escapeHtml(value ?? 0)}" />`;
  }
  if (["shipment", "load"].includes(type) && key === "notes") {
    return "";
  }
  if (type === "tariff" && key === "additionalChargesJson") {
    return tariffAdditionalChargesBuilder(value || "[]");
  }
  if (type === "tariff" && ["additionalChargesTotal", "grandTotal"].includes(key)) {
    return "";
  }
  if (type === "shipment" && key === "cargoItemsJson") {
    return cargoItemsBuilder(
      value || record.palletDimensionsJson || "[]",
      record.tariffNo,
      record.customer,
      record.natureOfGoods,
      record.volumeCategory
    );
  }
  if (type === "shipment" && key === "palletDimensionsJson") {
    return record.cargoItemsJson ? "" : cargoItemsBuilder(
  value || "[]",
  record.tariffNo,
  record.customer,
  record.natureOfGoods,
  record.volumeCategory
)
  }
  if (type === "shipment" && key === "tcnNumber") {
    return `${input(key, labelize(key), value ?? "", true)}<div class="action-row"><button type="button" class="secondary-button" data-dialog-action="generate-tcn">Generate TCN Number</button></div>`;
  }
  if (type === "invoice" && key === "tariffNo") {
    return `${selectFrom(key, labelize(key), tariffSelectionOptions(), String(value ?? ""))}${tariffPreviewShell("invoice")}`;
  }
  if (type === "user" && key === "password") {
    return passwordField(key, labelize(key), value ?? "");
  }
  if (type === "user" && key === "sectionAccess") {
    return sectionAccessCheckboxes(sectionAccessSet(value));
  }
  if (type === "load" && key === "jobNumbers") {
    return consolidationShipmentPicker(value, record.loadNo);
  }
  if (type === "document" && key === "storageUrl") {
    // Was previously falling through to the generic branch below, which rendered the raw
    // storage URL as plain text in an editable input - nothing to click, so "View" never actually
    // opened the uploaded file (POD or otherwise). No name attribute here on purpose: this isn't a
    // form field the user edits, so it's fine that it isn't included when the form is submitted -
    // saveDialogRecordInner only overwrites fields present in the submitted data and leaves
    // everything else (including storageUrl) untouched on the existing record.
    const fileUrl = String(value || "").trim();
    return fileUrl
      ? `<label>File<span class="action-row"><button type="button" class="secondary-button" data-action="view-document" data-document-no="${escapeHtml(record.documentNo || "")}">Open / View File</button></span></label>`
      : `<label>File<span class="empty-state">No file uploaded yet.</span></label>`;
  }
  if (typeof value === "boolean") {
    return checkbox(key, labelize(key), value);
  }

  if (options.length) {
    const optionKey = dropdownKeyForField(key);
    const fieldLabel = type === "shipment" && key === "shipmentDirection" ? "Shipment Type" : labelize(key);
    return optionKey ? selectEditable(key, fieldLabel, optionKey, options, String(value ?? "")) : select(key, fieldLabel, options, String(value ?? ""));
  }

  const inputType = key.toLowerCase().includes("date") ? "date" : typeof value === "number" ? "number" : "text";
  const readonly = readonlyKeys.has(key);
  return input(key, labelize(key), value ?? "", readonly, inputType);
}

function passwordField(name, label, value = "") {
  return `<label>${escapeHtml(label)}<span class="password-input-wrap"><input name="${escapeHtml(name)}" type="password" value="${escapeHtml(value)}" /><button type="button" class="password-toggle" data-dialog-action="toggle-password" aria-label="Show password" title="Show password">View</button></span></label>`;
}

function detailFieldOptions(type, key, record) {
  const common = {
    branch: branchOptions(),
    status: statusOptions(),
    podStatus: ["Pending", "Uploaded", "Missing", "Disputed", "Approved"],
    invoiceStatus: ["Unbilled", "Draft", "Approved", "Sent", "Paid", "Overdue", ...state.invoices.map((row) => row.invoiceNo)],
    shipmentDirection: shipmentDirectionOptions(),
    shipmentService: shipmentServiceOptions(record.shipmentDirection || "Export"),
    volumeCategory: volumeCategoryOptions(),
    manifestStatus: manifestStatusOptions(),
    chargeType: chargeTypeOptions(),
    chargeBasis: chargeBasisOptions(),
    currency: currencyOptions(),
    accountStatus: accountStatusOptions(),
    role: roleOptions(),
    branchAccess: branchAccessOptions()
  };

  if (key === "customer") return state.customers.map((row) => row.name);
  if (key === "tariffNo" && type === "shipment" && record?.entryMode !== "airway") return tariffOptionsForCustomer(record.customer);
  if (key === "tariffNo") return visibleRows(state.tariffs).map((row) => row.tariffNo);
  if (key === "branchViewScope") return branchViewScopeOptions();
  if (key === "mainSection") return dropdownOptions("mainSection", ["FTL", "LTL"]);
  if (key === "weightSection") return dropdownOptions("weightSection", ["Minimum", "Up to 100 KG", "300 KG", "500 KG", "1000 KG", "More"]);
  if (key === "minUpTo") return dropdownOptions("minUpTo", ["Minimum", "100 KG", "300 KG", "500 KG", "1000 KG", "More"]);
  if (key === "supplier") return state.suppliers.map((row) => row.name);
  if (key === "shipmentNo" || key === "linkedNo" || key === "jobNo") return shipmentOptions();
  if (type === "load" && key === "jobNumbers") return [];
  if (type === "leaveRequest" && key === "status") return ["Pending", "Approved", "Rejected", "Cancelled"];
  if (type === "leaveRequest" && key === "leaveType") return dropdownOptions("leaveType", ["Annual", "Sick", "Unpaid", "Emergency", "Maternity/Paternity"]);
  if (type === "payslip" && key === "status") return ["Issued", "Draft", "Paid"];
  if (type === "employee" && key === "employmentStatus") return ["Active", "On Leave", "Inactive", "Resigned"];
  if (type === "employee" && key === "department") return dropdownOptions("department", ["Operations", "Sales", "Finance", "HR", "Management", "IT"]);
  if (type === "hrAnnouncement" && key === "audience") return ["All", "Management", "Operations", "Finance"];
  return common[key] || [];
}

function labelize(key) {
  return String(key)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function branchViewScopeOptions() {
  return ["Assigned Branch Only", "All Branches"];
}

let isSavingDialogRecord = false;

async function saveDialogRecord() {
  if (isSavingDialogRecord) return;
  isSavingDialogRecord = true;
  const originalButtonText = dialogSave.textContent;
  dialogSave.disabled = true;
  dialogSave.textContent = "Saving...";
  try {
    await saveDialogRecordInner();
  } catch (error) {
    console.error("Dialog save failed:", error);
    notifyFailed("Save failed", error?.message || "The record could not be saved. Please try again.");
  } finally {
    isSavingDialogRecord = false;
    dialogSave.disabled = false;
    dialogSave.textContent = originalButtonText;
  }
}

async function saveDialogRecordInner() {
  if (dialogState?.onSave) {
    await dialogState.onSave();
    return;
  }

  if (!editing) return;
  if (editing.type === "shipment" && shipmentIsReadOnlyForCurrentUser(editing.record)) {
    notifyDenied("Read-only shipment", "This shipment is Delivered. Only an admin can edit it.");
    return;
  }
  const data = collectFormValues(dialogBody.closest("form"));
  rememberDropdownOptions(data);
  const updatedRecord = { ...editing.record };
  Object.keys(data).forEach((key) => {
    updatedRecord[key] = coerceValue(updatedRecord[key], data[key]);
  });
  if (editing.type === "shipment") {
    if (!String(updatedRecord.billTo1 || "").trim() && !String(updatedRecord.billTo2 || "").trim()) {
      notifyDenied("Bill To required", "Enter at least one Bill To value.");
      return;
    }
    if (duplicateAirwayBillExists(updatedRecord.airwayBillNo, updatedRecord.branch, editing.id)) {
      notifyDuplicateAirwayBill(updatedRecord.airwayBillNo, updatedRecord.branch);
      return;
    }
    updatedRecord.notes = shipmentMetaNotes(updatedRecord);
  }
  if (editing.type === "load") {
    const jobs = normalizeConsolidationJobs(updatedRecord.jobNumbers, editing.id);
    if (!jobs.length) {
      notifyDenied("Consolidation not saved", "Add at least one unassigned shipment with service type Consolidation.");
      return;
    }
    updatedRecord.jobNumbers = jobs.join(", ");
    updatedRecord.notes = loadMetaNotes(updatedRecord);
    recalculateLoad(updatedRecord);
  }

  if (editing.type === "charge" && !isAdminSession()) {
    await submitAdminRequest(
      "Additional Charges",
      editing.id,
      "Charge change request submitted by non-admin user.",
      summarizeChanges(editing.record, updatedRecord, Object.keys(data)),
      "Charge Change Request"
    );
    addHistory("Submitted charge change request", editing.id);
    saveState();
    resetDialogShell();
    recordDialog.close();
    notifySuccess("Request submitted", `${editing.id} was sent to admin approval.`);
    render();
    return;
  }

  // Only require approval for a non-admin's manifest edit once the manifest itself is already
  // Delivered or Closed - before that point, edits save directly like any other record (adding/
  // removing jobs, updating trip details, etc. are routine and shouldn't need admin sign-off every
  // single time). This mirrors the same "Delivered = admin-only" rule already applied to shipments.
  const manifestNeedsApproval = editing.type === "load" && !isAdminSession() && ["delivered", "closed"].includes(String(editing.record.status || "").trim().toLowerCase());
  if (manifestNeedsApproval) {
    const request = await submitAdminRequest(
      "Consolidation",
      editing.id,
      "Consolidation change request submitted by non-admin user.",
      summarizeChanges(editing.record, updatedRecord, Object.keys(data)),
      "Manifest Approval"
    );
    editing.record.manifestStatus = "Pending Approval";
    editing.record.lastManifestRequestNo = request.requestNo;
    await persistRecord("load", editing.record);
    addHistory("Submitted consolidation change request", editing.id);
    saveState();
    resetDialogShell();
    recordDialog.close();
    notifySuccess("Request submitted", `${editing.id} was sent to admin approval.`);
    render();
    return;
  }

  const changeSummary = summarizeChanges(editing.record, updatedRecord, Object.keys(data));
  const originalSnapshot = { ...editing.record };
  Object.assign(editing.record, updatedRecord);
  const editedType = editing.type;
  const editedId = editing.id;
  const saved = await persistRecord(editing.type, editing.record);
  if (!saved) {
    Object.assign(editing.record, originalSnapshot);
    notifyDenied("Not saved", "This change could not be saved to the server. Please try again.");
    return;
  }
  addHistory(`Updated ${editing.type}`, editing.id, changeSummary);
  if (editedType === "load") await syncManifestShipmentStatuses(editing.record);
  if (editedType === "shipment") await createShipmentDocument(data, editedId);
  saveState();
  resetDialogShell();
  recordDialog.close();
  if (editedType === "user") {
    notifySuccess("User updated", `${editedId} was saved successfully.`);
    setTimeout(() => syncFromApi(), 300);
  } else {
    notifySuccess("Record updated", `${editedId} was saved successfully.`);
  }
  render();
}

function resetDialogShell() {
  editing = null;
  dialogState = null;
  dialogSecondary.classList.add("is-hidden");
  dialogSecondary.textContent = "Secondary";
  dialogSave.textContent = "Save Changes";
  dialogBody.classList.remove("single-column");
  resetDialogChrome();
  moveToastStackToBody();
}

function moveToastStackIntoDialog() {
  if (toastStack && recordDialog && toastStack.parentElement !== recordDialog) {
    recordDialog.appendChild(toastStack);
  }
}

function moveToastStackToBody() {
  if (toastStack && document.body && toastStack.parentElement !== document.body) {
    document.body.appendChild(toastStack);
  }
}

function resetDialogChrome() {
  recordDialog.classList.remove("is-minimized", "is-maximized");
  dialogMinimize?.setAttribute("aria-pressed", "false");
  dialogMaximize?.setAttribute("aria-pressed", "false");
}

function toggleDialogMinimized() {
  const minimized = recordDialog.classList.toggle("is-minimized");
  if (minimized) recordDialog.classList.remove("is-maximized");
  dialogMinimize?.setAttribute("aria-pressed", String(minimized));
  dialogMaximize?.setAttribute("aria-pressed", String(recordDialog.classList.contains("is-maximized")));
}

function toggleDialogMaximized() {
  const maximized = recordDialog.classList.toggle("is-maximized");
  if (maximized) recordDialog.classList.remove("is-minimized");
  dialogMaximize?.setAttribute("aria-pressed", String(maximized));
  dialogMinimize?.setAttribute("aria-pressed", String(recordDialog.classList.contains("is-minimized")));
}

function openDialog({ title, typeLabel, body, saveLabel, secondaryLabel = "", onSave = null, onSecondary = null, afterOpen = null, singleColumn = false }) {
  if (recordDialog.open) recordDialog.close();
  resetDialogShell();
  dialogType.textContent = typeLabel;
  dialogTitle.textContent = title;
  dialogBody.innerHTML = body;
  dialogBody.classList.toggle("single-column", Boolean(singleColumn));
  if (dialogBody._tablePageHandler) {
    dialogBody.removeEventListener("click", dialogBody._tablePageHandler);
  }
  dialogBody._tablePageHandler = (event) => {
    if (event.target.closest("[data-action='table-page'], [data-action='export-dashboard-metric']")) {
      handleModuleClick(event);
    }
  };
  dialogBody.addEventListener("click", dialogBody._tablePageHandler);
  dialogSave.textContent = saveLabel || "Save Changes";
  dialogState = { onSave, onSecondary };
  if (secondaryLabel && onSecondary) {
    dialogSecondary.textContent = secondaryLabel;
    dialogSecondary.classList.remove("is-hidden");
  }
  recordDialog.showModal();
  moveToastStackIntoDialog();
  afterOpen?.();
  bindDialogPasswordToggles();
}

function openNewDialog(type, mode = "") {
  const config = dialogConfigFor(type, mode);
  if (!config) return;
  openDialog({
    title: config.title,
    typeLabel: config.typeLabel,
    body: config.body,
    saveLabel: config.saveLabel,
    async onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      rememberDropdownOptions(data);
      const saved = await config.onSave(data);
      if (saved === false) {
        return;
      }
      saveState();
      recordDialog.close();
      render();
    },
    afterOpen: config.afterOpen
  });
}

function openLoadDialog(type) {
  const collection = collectionFor(type);
  if (!collection.length) {
    window.alert(`No ${type} records available yet.`);
    return;
  }
  const firstId = rowId(type, collection[0] || {});
  openDialog({
    title: `Load ${type}`,
    typeLabel: "Load",
    body: `<label>Select existing record<select name="selectedId">${collection.map((row) => `<option value="${escapeHtml(rowId(type, row))}">${escapeHtml(rowId(type, row))}</option>`).join("")}</select></label>`,
    saveLabel: `Load ${type}`,
    onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      const selectedId = data.selectedId || firstId;
      recordDialog.close();
      openRecord(type, selectedId);
    }
  });
}

function openPodDialog(jobNo = "") {
  const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo) || visibleRows(state.shipments)[0] || {};
  openDialog({
    title: jobNo ? `POD / Delivery - ${jobNo}` : "Delivery Update",
    typeLabel: "POD",
    body: `
      ${selectFrom("jobNo", "Shipment No", shipmentOptions(), shipmentItem.jobNo || "")}
      <div data-pod-shipment-fields>${podShipmentFields(shipmentItem)}</div>
    `,
    saveLabel: "Save Delivery",
    async onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      const saved = await savePodDelivery(data);
      if (!saved) return;
      saveState();
      recordDialog.close();
      render();
    },
    afterOpen: bindPodShipmentDialog
  });
}

function podShipmentFields(shipmentItem = {}) {
  const totalPieces = Number(shipmentItem.pieces || 0);
  const splits = parsePodSplits(shipmentItem.podSplitsJson);
  const latestSplit = splits[splits.length - 1] || {};
  const savedPodValue = (key, fallback = "") => latestSplit[key] ?? shipmentItem[key] ?? fallback;
  const deliveredPieces = podSplitsDeliveredPieces(splits);
  const remainingPieces = totalPieces ? Math.max(0, totalPieces - deliveredPieces) : 0;
  const isFullyDelivered = totalPieces > 0 && remainingPieces === 0;
  return `
    ${podCargoSummary(shipmentItem)}
    ${podSplitHistoryMarkup(shipmentItem, splits, totalPieces)}
    ${isFullyDelivered
      ? `<p class="empty-state">All ${totalPieces} piece(s) have been delivered across ${splits.length} delivery${splits.length === 1 ? "" : "ies"}. To correct a mistake, edit the delivery details directly in the list above (via your database/admin tools) - this form can no longer add pieces since none remain.</p>`
      : totalPieces
        ? `<p class="empty-state">Recording delivery ${splits.length + 1}. ${remainingPieces} of ${totalPieces} piece(s) still need to be delivered.</p>`
        : `<p class="empty-state">No total piece count is set on this shipment, so this delivery will be treated as the complete delivery.</p>`}
    ${totalPieces && !isFullyDelivered ? input("splitPieces", `Pieces Delivered In This Trip (max ${remainingPieces})`, remainingPieces, false, "number") : ""}
    ${input("deliveryNoteNo", "Delivery Note No", nextDeliveryNoteNumber())}
    ${input("ginNo", "GIN Number", "")}
    ${input("customerReference", "Customer Reference", shipmentItem.customerReference || "")}
    ${input("deliveryLocation", "Delivery Location", savedPodValue("deliveryLocation", shipmentItem.destination || ""))}
    ${input("deliveryAddress", "Delivery Address", savedPodValue("deliveryAddress", shipmentItem.consigneeAddress || ""))}
    <p class="empty-state">Location/Address are pre-filled from the shipment's booking details - edit them if this particular delivery is going somewhere else.</p>
    ${textarea("deliveryRemarks", "Delivery Remarks / Coordinates", savedPodValue("deliveryRemarks"), false, 3)}
    ${input("pocName", "POC Name", savedPodValue("pocName", shipmentItem.deliveryContactPerson || ""))}
    ${input("pocMobile", "POC Mobile Number", savedPodValue("pocMobile", shipmentItem.deliveryMobile || ""))}
    ${input("additionalContact", "Additional Contact Person", savedPodValue("additionalContact"))}
    ${input("preparedBy", "Prepared By", savedPodValue("preparedBy", currentUserName()))}
    ${input("deliveredBy", "Delivered By", savedPodValue("deliveredBy", shipmentItem.driverName || ""))}
    ${input("receivedBy", "Goods Received By", savedPodValue("receivedBy"))}
    ${input("receiverPhone", "Receiver Telephone Number", savedPodValue("receiverPhone"))}
    ${input("receiverSignature", "Receiver Signature", savedPodValue("receiverSignature"))}
    ${input("deliveryDatetime", "Delivery Date & Time", savedPodValue("deliveryDatetime", localDateTimeInput()), false, "datetime-local")}
    <label>Signed POD File (upload after delivery)<input name="podFileUpload" type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" /></label>
    <p class="empty-state">${totalPieces ? "Saving records this delivery as a split. The shipment becomes Delivered automatically once every piece is accounted for across all deliveries." : "Saving marks this shipment as Delivered."} The signed file is stored in Documents as its own POD attachment.</p>
    <div class="action-row">
      <button type="button" class="secondary-button" data-dialog-action="save-and-generate-pod">Save &amp; Generate POD</button>
    </div>
  `;
}

// Shows every delivery already recorded for this shipment (each with its own pieces/location/
// date and a "View POD" link to its own file, if uploaded) - so a shipment delivered in several
// parts has a clear running record instead of the newest delivery silently overwriting the last.
function podSplitHistoryMarkup(shipmentItem, splits, totalPieces) {
  if (!splits.length) return "";
  const rows = splits.map((split) => {
    const podDoc = state.documents.find((row) => row.type === "POD" && row.documentNo === split.documentNo);
    return `
      <tr>
        <td>${escapeHtml(String(split.splitNo || ""))}</td>
        <td>${escapeHtml(String(split.pieces || 0))}${totalPieces ? ` / ${escapeHtml(String(totalPieces))}` : ""}</td>
        <td>${escapeHtml(split.deliveryLocation || "-")}<br /><small class="empty-state">${escapeHtml(split.deliveryAddress || "No address saved")}</small></td>
        <td>${escapeHtml(split.deliveryDatetime ? formatDateDisplay(split.deliveryDatetime) : "-")}</td>
        <td>${escapeHtml(split.receivedBy || "-")}</td>
        <td>
          <button type="button" class="table-inline-link" data-pod-split-note data-job-no="${escapeHtml(shipmentItem.jobNo)}" data-split-no="${escapeHtml(String(split.splitNo || ""))}">Part ${escapeHtml(String(split.splitNo || ""))} - View</button><br />
          <button type="button" class="table-inline-link" data-pod-split-download data-job-no="${escapeHtml(shipmentItem.jobNo)}" data-split-no="${escapeHtml(String(split.splitNo || ""))}">Part ${escapeHtml(String(split.splitNo || ""))} - Download</button>
        </td>
        <td>
          ${podDoc?.storageUrl ? `<button type="button" class="table-inline-link" data-pod-split-view="${escapeHtml(podDoc.documentNo)}">POD ${escapeHtml(String(split.splitNo || ""))} - View</button>` : `<span class="empty-state">Not uploaded</span>`}<br />
          <button type="button" class="table-inline-link" data-pod-split-upload data-job-no="${escapeHtml(shipmentItem.jobNo)}" data-split-no="${escapeHtml(String(split.splitNo || ""))}">POD ${escapeHtml(String(split.splitNo || ""))} - ${podDoc?.storageUrl ? "Replace" : "Upload"}</button>
        </td>
      </tr>`;
  }).join("");
  return `
    <section class="pod-split-history">
      <strong>Deliveries recorded so far (${splits.length})</strong>
      <p class="empty-state">Each delivery has its own printable Delivery Note (view or download any time) and its own signed POD file - upload or replace each part independently below.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Pieces</th><th>Location / Address</th><th>Date</th><th>Received By</th><th>Delivery Note</th><th>Signed POD</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

function podCargoSummary(shipmentItem = {}) {
  const lines = parsePalletDimensions(shipmentItem.cargoItemsJson || shipmentItem.palletDimensionsJson || "[]");
  if (!lines.length) {
    return `<section class="pod-cargo-summary"><strong>Cargo Details</strong><span>No pallet or carton details entered for this shipment.</span></section>`;
  }
  const packages = lines.map((line) => `${Number(line.quantity || line.count || 0)} ${line.packageType || "Package"}`).join(", ");
  return `<section class="pod-cargo-summary"><strong>Cargo Details</strong><span>${escapeHtml(packages)}</span></section>`;
}

function bindPodShipmentDialog() {
  const shipmentField = dialogBody.querySelector("[name='jobNo']");
  const details = dialogBody.querySelector("[data-pod-shipment-fields]");
  if (!shipmentField || !details) return;
  const refreshShipmentDetails = () => {
    const shipmentItem = state.shipments.find((row) => row.jobNo === String(shipmentField.value || "").trim());
    if (!shipmentItem) return;
    details.innerHTML = podShipmentFields(shipmentItem);
    dialogTitle.textContent = `POD / Delivery - ${shipmentItem.jobNo}`;
  };
  shipmentField.addEventListener("change", refreshShipmentDetails);
  shipmentField.addEventListener("input", refreshShipmentDetails);
  // Delegated (not bound to the button directly) since podShipmentFields() - and the button inside
  // it - gets fully replaced by refreshShipmentDetails() above whenever the shipment selection
  // changes. Saves whatever is currently typed in the form first, then generates the POD from
  // that just-saved record - so edits made here always show up in the generated PDF, instead of
  // the separate panel-level "Generate POD" button silently using stale saved data.
  dialogBody.addEventListener("click", async (event) => {
    const historyViewButton = event.target.closest("[data-pod-split-view]");
    if (historyViewButton) {
      const viewer=window.open("", "_blank");
      try { const result=await fetchJson(`/api/documents/${encodeURIComponent(historyViewButton.dataset.podSplitView)}/view`); if(!result?.url) throw new Error("The POD file could not be opened."); if(viewer){viewer.opener=null;viewer.location.href=result.url;} }
      catch(error){if(viewer)viewer.close();notifyDenied("POD not available",error.message||"The POD file could not be opened.");}
      return;
    }
    // Regenerates the printable Delivery Note for ANY past delivery on demand (Part 1, Part 2,
    // etc.) - not just the latest one. The delivery note itself is never stored anywhere; it's
    // always rebuilt fresh from that split's saved data, so this always reflects it accurately.
    const noteButton = event.target.closest("[data-pod-split-note]");
    if (noteButton) {
      const found = findShipmentAndPodSplit(noteButton.dataset.jobNo, noteButton.dataset.splitNo);
      if (!found) {
        notifyDenied("Delivery not found", "That delivery could not be found - refresh and try again.");
        return;
      }
      openPrintableDocument(podSplitDocumentHtml(found.shipment, found.split));
      return;
    }
    // Downloads that same Delivery Note as an .html file (same document as "View", saved to disk
    // instead of opened in a new tab) - the per-part equivalent of the panel's "Save / Export".
    const downloadButton = event.target.closest("[data-pod-split-download]");
    if (downloadButton) {
      const found = findShipmentAndPodSplit(downloadButton.dataset.jobNo, downloadButton.dataset.splitNo);
      if (!found) {
        notifyDenied("Delivery not found", "That delivery could not be found - refresh and try again.");
        return;
      }
      const fileName = `pod-${found.shipment.jobNo}-part-${found.split.splitNo}.html`.toLowerCase();
      downloadHtml(fileName, podSplitDocumentHtml(found.shipment, found.split));
      return;
    }
    // Uploads/replaces the signed POD file for this exact delivery part - independent of whichever
    // part is currently "latest", so Part 1 can be uploaded even after Part 2 already exists. The
    // dialog refreshes itself from inside uploadPodFileForSelectedShipment's own file-picker
    // callback once the upload actually finishes (see the comment there) - not here, since
    // opening the native file picker returns immediately, before the user has picked anything.
    const uploadButton = event.target.closest("[data-pod-split-upload]");
    if (uploadButton) {
      await uploadPodFileForSelectedShipment(uploadButton.dataset.jobNo, Number(uploadButton.dataset.splitNo));
      return;
    }
    const trigger = event.target.closest("[data-dialog-action='save-and-generate-pod']");
    if (!trigger) return;
    const data = collectFormValues(dialogBody.closest("form"));
    const savedSplit = await savePodDelivery(data);
    if (!savedSplit) return;
    saveState();
    const jobNo = String(data.jobNo || "").trim();
    const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
    openPrintableDocument(podSplitDocumentHtml(shipmentItem, savedSplit));
    recordDialog.close();
    render();
  });
}

// Uploads one delivery's signed POD file. splitNo (optional) keeps each delivery's file/document
// separate instead of overwriting the previous delivery's POD - omit it for a shipment with no
// piece count set, where a single delivery covers the whole shipment.
async function uploadPodDocument(jobNo, file, splitNo = "") {
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (!file || !allowedMimeTypes.includes(String(file.type || "").toLowerCase())) {
    throw new Error("POD file must be a PDF, JPG, JPEG, or PNG file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("POD file must be 10 MB or smaller.");
  }
  const contentBase64 = await readFileAsBase64(file);
  const shipmentForPod = state.shipments.find((row) => row.jobNo === jobNo);
  const result = await fetchJson("/api/pod-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobNo, airwayBillNo: shipmentForPod?.airwayBillNo || "", fileName: file.name, mimeType: file.type, contentBase64, splitNo: String(splitNo || "") })
  });
  const documentItem = apiDocument(result.row || {});
  (Array.isArray(result.relatedRows) ? result.relatedRows : []).forEach((row) => {
    const local = state.shipments.find((item) => item.jobNo === row.job_no || item.jobNo === row.jobNo);
    if (local) Object.assign(local, apiShipment(row));
  });
  (Array.isArray(result.relatedDocuments) ? result.relatedDocuments : []).forEach((row) => {
    const relatedDocument = apiDocument(row || {});
    state.documents = [...state.documents.filter((item) => item.documentNo !== relatedDocument.documentNo), relatedDocument];
  });
  // Only replace a document with the SAME document number (i.e. re-uploading the same split's
  // file) - different splits get different document numbers from the server, so their documents
  // co-exist instead of one overwriting another.
  state.documents = [...state.documents.filter((item) => item.documentNo !== documentItem.documentNo), documentItem];
  return documentItem;
}

async function savePodDelivery(data) {
  const jobNo = String(data.jobNo || "").trim();
  const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
  if (!shipmentItem) {
    notifyDenied("Shipment not found", "Select a valid shipment in the POD form.");
    return false;
  }

  const totalPieces = Number(shipmentItem.pieces || 0);
  const existingSplits = parsePodSplits(shipmentItem.podSplitsJson);
  const deliveredSoFar = podSplitsDeliveredPieces(existingSplits);
  const remainingPieces = totalPieces ? Math.max(0, totalPieces - deliveredSoFar) : 0;
  // If the shipment has no piece count recorded, treat this as one single, complete delivery
  // (the pre-split behavior) rather than forcing a piece count the user has no way to know.
  const splitPieces = totalPieces ? Number(data.splitPieces || 0) : (deliveredSoFar ? 0 : 1);

  if (totalPieces) {
    if (!splitPieces || splitPieces <= 0) {
      notifyDenied("Enter pieces delivered", "Enter how many pieces were delivered in this trip.");
      return false;
    }
    if (splitPieces > remainingPieces) {
      notifyDenied("Too many pieces", `Only ${remainingPieces} piece(s) remain to be delivered for this shipment - reduce the amount or correct an earlier delivery first.`);
      return false;
    }
  }

  const uploadedFile = data.podFileUpload;
  const hasPodFile = uploadedFile && typeof uploadedFile === "object" && uploadedFile.name;
  const splitNo = existingSplits.length + 1;
  const newSplit = {
    splitNo,
    pieces: totalPieces ? splitPieces : totalPieces || Number(shipmentItem.pieces || 0) || 1,
    deliveryNoteNo: String(data.deliveryNoteNo || nextDeliveryNoteNumber()).trim(),
    ginNo: String(data.ginNo || "").trim(),
    customerReference: String(data.customerReference || shipmentItem.customerReference || "").trim(),
    deliveryLocation: String(data.deliveryLocation || "").trim(),
    deliveryAddress: String(data.deliveryAddress || "").trim(),
    deliveryRemarks: String(data.deliveryRemarks || "").trim(),
    pocName: String(data.pocName || "").trim(),
    pocMobile: String(data.pocMobile || "").trim(),
    additionalContact: String(data.additionalContact || "").trim(),
    preparedBy: String(data.preparedBy || currentUserName()).trim(),
    deliveredBy: String(data.deliveredBy || "").trim(),
    receivedBy: String(data.receivedBy || "").trim(),
    receiverPhone: String(data.receiverPhone || "").trim(),
    receiverSignature: String(data.receiverSignature || "").trim(),
    deliveryDatetime: String(data.deliveryDatetime || localDateTimeInput()).trim(),
    documentNo: "",
    fileName: ""
  };

  const newDeliveredTotal = deliveredSoFar + newSplit.pieces;
  const isFullyDelivered = !totalPieces || newDeliveredTotal >= totalPieces;
  const updatedSplits = [...existingSplits, newSplit];
  const previousPodStatus = shipmentItem.podStatus || "Pending";
  const updatedShipment = {
    ...shipmentItem,
    status: isFullyDelivered ? "Delivered" : "Partially Delivered",
    podSplitsJson: JSON.stringify(updatedSplits),
    podStatus: isFullyDelivered ? (hasPodFile || existingSplits.some((split) => split.documentNo) ? "Uploaded" : previousPodStatus) : "Partial",
    // Kept in sync with the LATEST delivery for any older code/reports that still read these
    // shipment-level fields directly instead of the split history.
    deliveryNoteNo: newSplit.deliveryNoteNo,
    ginNo: newSplit.ginNo,
    customerReference: newSplit.customerReference,
    deliveryLocation: newSplit.deliveryLocation,
    deliveryAddress: newSplit.deliveryAddress,
    deliveryRemarks: newSplit.deliveryRemarks,
    pocName: newSplit.pocName,
    pocMobile: newSplit.pocMobile,
    additionalContact: newSplit.additionalContact,
    preparedBy: newSplit.preparedBy,
    deliveredBy: newSplit.deliveredBy,
    receivedBy: newSplit.receivedBy,
    receiverPhone: newSplit.receiverPhone,
    receiverSignature: newSplit.receiverSignature,
    deliveryDatetime: newSplit.deliveryDatetime
  };
  // notes is how this app actually persists dozens of "extra" shipment fields (including all the
  // delivery ones just set above) to the database - collectValues() on the server only reads the
  // `notes` column itself, not each flat field individually, so without repacking it here the
  // split history (podSplitsJson, a real column) would still save correctly, but these top-level
  // convenience fields would silently revert to stale data after the next page reload.
  updatedShipment.notes = shipmentMetaNotes(updatedShipment);

  const saved = await persistRecord("shipment", updatedShipment);
  if (!saved) {
    notifyDenied("POD not saved", "The delivery update could not be saved. Please try again.");
    return false;
  }

  // Compute the diff BEFORE shipmentItem gets overwritten below, using the exact same
  // "field: before -> after" format the generic edit-save flow uses, so POD saves show up in the
  // audit trail with proper before/after just like every other kind of edit.
  const podChangeSummary = summarizeChanges(shipmentItem, updatedShipment);
  Object.assign(shipmentItem, updatedShipment);

  if (hasPodFile) {
    try {
      const documentItem = await uploadPodDocument(jobNo, uploadedFile, totalPieces ? splitNo : "");
      newSplit.documentNo = documentItem.documentNo;
      newSplit.fileName = documentItem.fileName;
      shipmentItem.podSplitsJson = JSON.stringify(updatedSplits);
      await persistRecord("shipment", shipmentItem);
    } catch (error) {
      notifyDenied("Delivery saved", `Delivery ${splitNo} for ${jobNo} was saved, but the POD file was not uploaded: ${error.message}`);
      return newSplit;
    }
  }
  addHistory(
    isFullyDelivered ? "Saved POD / Delivery (complete)" : "Saved POD / Delivery (partial)",
    jobNo,
    totalPieces ? `Delivery ${splitNo}: ${newSplit.pieces} of ${totalPieces} pcs -> ${newSplit.deliveryLocation || "-"}. ${podChangeSummary}` : podChangeSummary
  );
  notifySuccess(
    isFullyDelivered ? "Delivery complete" : "Partial delivery saved",
    totalPieces
      ? `${jobNo}: ${newDeliveredTotal} of ${totalPieces} piece(s) delivered${hasPodFile ? " and the POD file was attached" : ""}.`
      : `${jobNo} is marked Delivered${hasPodFile ? " and the POD file was attached" : ""}.`
  );
  return newSplit;
}

// Uploads/replaces the signed POD file for ONE specific delivery (splitNo). Used both by the
// panel-level "Upload POD File" button (targets whichever delivery is latest) and by the "Upload"
// button next to each individual delivery in the split history list (targets that exact one) -
// so any part's file can be attached or replaced independently, at any time, not only the most
// recently recorded delivery.
async function uploadPodFileForSelectedShipment(jobNo, targetSplitNo = null) {
  const shipmentItem = state.shipments.find((row) => row.jobNo === String(jobNo || "").trim());
  if (!shipmentItem) {
    notifyDenied("POD file not uploaded", "Select a saved shipment first.");
    return;
  }
  const statusKey = String(shipmentItem.status || "").trim().toLowerCase();
  if (!["delivered", "partially delivered"].includes(statusKey)) {
    notifyDenied("Mark delivery first", "Save the delivery details before uploading the signed POD file.");
    return;
  }
  const splits = parsePodSplits(shipmentItem.podSplitsJson);
  const targetSplit = targetSplitNo != null ? splits.find((split) => Number(split.splitNo) === Number(targetSplitNo)) : splits[splits.length - 1];
  if (targetSplitNo != null && !targetSplit) {
    notifyDenied("Delivery not found", "That delivery could not be found - refresh and try again.");
    return;
  }
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".pdf,.jpg,.jpeg,.png,image/*,application/pdf";
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const documentItem = await uploadPodDocument(shipmentItem.jobNo, file, targetSplit ? targetSplit.splitNo : "");
      if (targetSplit) {
        targetSplit.documentNo = documentItem.documentNo;
        targetSplit.fileName = documentItem.fileName;
        shipmentItem.podSplitsJson = JSON.stringify(splits);
      }
      const isFullyDelivered = statusKey === "delivered";
      if (isFullyDelivered) shipmentItem.podStatus = "Uploaded";
      const shipmentSaved = await persistRecord("shipment", shipmentItem);
      if (!shipmentSaved) return;
      addHistory("Uploaded signed POD", shipmentItem.jobNo, targetSplit ? `Delivery ${targetSplit.splitNo}: ${file.name}` : file.name);
      saveState();
      render();
      // If the POD dialog is open on this same shipment, refresh its split-history list too - this
      // runs from inside the file picker's own "change" callback (the only point the upload has
      // actually finished), not from the caller, since opening the native file picker itself
      // doesn't block/await the caller until a file is actually chosen.
      const openJobField = dialogBody.querySelector("[name='jobNo']");
      const detailsContainer = dialogBody.querySelector("[data-pod-shipment-fields]");
      if (recordDialog.open && openJobField && detailsContainer && openJobField.value === shipmentItem.jobNo) {
        detailsContainer.innerHTML = podShipmentFields(shipmentItem);
      }
      notifySuccess("POD file uploaded", `${file.name} was attached to ${shipmentItem.jobNo}${targetSplit ? ` (Delivery ${targetSplit.splitNo})` : ""}.`);
    } catch (error) {
      notifyDenied("POD file not uploaded", error.message || "The POD file could not be uploaded.");
    }
  }, { once: true });
  fileInput.click();
}

// All signed POD documents for a shipment - a shipment delivered in multiple parts can have more
// than one, one per split. This is the "View POD" action on the POD Pending / Delivery Board.
function findPodDocuments(jobNo) {
  return state.documents.filter((row) => row.type === "POD" && row.linkedNo === jobNo);
}

async function viewStoredDocument(documentNo) {
  if (!documentNo) {
    notifyDenied("File not opened", "The uploaded document reference is missing.");
    return;
  }
  const viewer = window.open("", "_blank");
  try {
    const result = await fetchJson(`/api/documents/${encodeURIComponent(documentNo)}/view`);
    if (!result?.url) throw new Error("The uploaded file could not be opened.");
    if (viewer) {
      viewer.opener = null;
      viewer.location.href = result.url;
    } else {
      window.location.assign(result.url);
    }
  } catch (error) {
    if (viewer) viewer.close();
    notifyDenied("File not opened", error.message || "The uploaded file could not be opened.");
  }
}

async function viewPodFileForSelectedShipment(jobNo) {
  const trimmedJobNo = String(jobNo || "").trim();
  if (!trimmedJobNo) {
    notifyDenied("POD not available", "Select a saved shipment first.");
    return;
  }
  const podDocuments = findPodDocuments(trimmedJobNo).filter((row) => row.storageUrl);
  if (!podDocuments.length) {
    notifyDenied("POD not available", "No signed POD file has been uploaded for this shipment yet.");
    return;
  }
  if (podDocuments.length === 1) {
    await viewStoredDocument(podDocuments[0].documentNo);
    return;
  }
  // More than one delivery has a signed POD - open the delivery dialog instead of guessing which
  // one to show, since its split history list lets you view each one individually.
  openPodDialog(trimmedJobNo);
  notifySuccess("Multiple PODs", `${trimmedJobNo} has ${podDocuments.length} signed PODs - use the delivery list below to view each one.`);
}

function openAdminRequestDialog(record) {
  openDialog({
    title: record.requestNo,
    typeLabel: "Approval Request",
    body: `
      <label>Request Type<input value="${escapeHtml(record.requestType)}" readonly /></label>
      <label>Module<input value="${escapeHtml(record.targetModule)}" readonly /></label>
      <label>Reference No<input value="${escapeHtml(record.referenceNo)}" readonly /></label>
      <label>Requested By<input value="${escapeHtml(record.requestedBy)}" readonly /></label>
      <label>Status<input value="${escapeHtml(record.status)}" readonly /></label>
      <label>Details<textarea name="details" rows="4" readonly>${escapeHtml(record.details)}</textarea></label>
      <label>Proposed Values<textarea name="proposedValues" rows="5" readonly>${escapeHtml(record.proposedValues)}</textarea></label>
      <label>Approval Notes<textarea name="approvalNotes" rows="4">${escapeHtml(record.approvalNotes || "")}</textarea></label>
    `,
    saveLabel: "Approve Request",
    secondaryLabel: "Reject Request",
    async onSave() {
      const data = collectFormValues(dialogBody.closest("form"));
      await approveAdminRequest(record, data.approvalNotes || "");
      recordDialog.close();
      render();
    },
    async onSecondary() {
      const data = collectFormValues(dialogBody.closest("form"));
      await rejectAdminRequest(record, data.approvalNotes || "");
      recordDialog.close();
      render();
    }
  });
}

function dialogConfigFor(type, mode = "") {
  const configs = {
    shipment: {
      title: mode === "airway" ? "New Airway Bill" : "New Shipment",
      typeLabel: mode === "airway" ? "Airway Bill" : "Shipment",
      saveLabel: mode === "airway" ? "Create Airway Bill" : "Create Shipment",
      body: shipmentDialogBody(mode),
      onSave: createShipment,
      afterOpen: () => {
        bindShipmentDirectionDialog();
        bindShipmentCustomerTariffs();
        bindShipmentCustomerAutofill();
        bindShipmentCopySections();
        bindTransporterAutofill();
        bindTariffFinancialAutofill();
        bindVolumeCalculator();
        bindPalletDimensionBuilder();
        bindAwbFetchButton();
      }
    },
    quotation: {
      title: "New Quotation",
      typeLabel: "Quotation",
      saveLabel: "Save Quotation",
      body: quotationDialogBody(),
      onSave: createQuotation,
      afterOpen: () => {
        bindPalletDimensionBuilder();
      }
    },
    load: {
      title: "New Manifest",
      typeLabel: "Manifest",
      saveLabel: "Create Manifest",
      body: `
        ${input("loadNo", "Manifest No", nextConsolidationNumber(), false)}
        ${input("tripDate", "Trip Date", today(), false, "date")}
        ${input("origin", "Origin", "")}
        ${input("destination", "Destination", "")}
        ${formSection("Transport Information", `
          ${selectFrom("transporter", "Transporter", state.suppliers.map((row) => ({ value: row.name, label: `${row.code} | ${row.name}` })), "Al Dana Transport")}
          ${selectFrom("transporterCode", "Transporter Number", state.suppliers.map((row) => ({ value: row.code, label: `${row.code} | ${row.name}` })), "")}
          ${input("vehicleNo", "Vehicle No", "KWT-00000")}
          ${input("driverName", "Driver Name", "")}
          ${input("driverNumber", "Driver Number", "")}
          ${input("driverMobile", "Driver Mobile", "")}
        `, true)}
        ${strictSelect("status", "Status", manifestUpdateStatusOptions(), "Draft")}
        ${strictSelect("manifestStatus", "Manifest Status", manifestStatusOptions(), "Not Generated")}
        ${consolidationShipmentPicker()}
        ${input("lastManifestRequestNo", "Last Manifest Request No", "")}
      `,
      onSave: createLoad,
      afterOpen: bindConsolidationJobPicker
    },
    customers: partyDialogConfig("customers", "Customer"),
    suppliers: partyDialogConfig("suppliers", "Supplier / Transporter"),
    tariff: {
      title: "New Tariff",
      typeLabel: "Tariff",
      saveLabel: "Create Tariff",
      body: tariffDialogBody(),
      onSave: createTariff,
      afterOpen: () => {
        bindTariffWeightRates();
        bindTariffAdditionalCharges();
      }
    },
    document: {
      title: "New Document Tag",
      typeLabel: "Document",
      saveLabel: "Save Document Tag",
      body: `
        ${input("documentNo", "Document No", nextNumber("DOC", state.documents, "documentNo"), false)}
        ${selectFrom("linkedNo", "Attach To", shipmentOptions())}
        ${select("type", "Document Type", ["Waybill", "LR", "CMR", "Commercial Invoice", "Packing List", "POD", "Supplier Invoice"])}
        ${select("status", "Status", ["Uploaded", "Attached", "Missing", "Issued", "Stored", "Replaced"])}
        ${input("date", "Date", today(), false, "date")}
        ${input("owner", "Owner", currentUserName())}
        <label>Upload File<input name="fileUpload" type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" /></label>
      `,
      onSave: createDocument
    },
    charge: {
      title: "New Additional Charge",
      typeLabel: "Additional Charges",
      saveLabel: isAdminSession() ? "Save Charge" : "Send for Approval",
      body: chargeDialogBody(),
      onSave: createCharge,
      afterOpen: bindChargeLineBuilder
    },
    invoice: {
      title: "New Invoice",
      typeLabel: "Invoice",
      saveLabel: "Create Invoice",
      body: invoiceDialogBody(),
      onSave: createInvoice,
      afterOpen: bindInvoiceShipmentTariff
    },
    user: {
      title: "Create User / Permissions",
      typeLabel: "User",
      saveLabel: "Create User",
      body: userDialogBody(),
      onSave: createUser
    },
    customerUser: {
      title: "New Customer Portal Account",
      typeLabel: "Customer Portal Account",
      saveLabel: "Create Account",
      body: customerUserDialogBody(),
      onSave: createCustomerUserAccount
    },
    employee: {
      title: "New Employee Profile",
      typeLabel: "Employee",
      saveLabel: "Save Employee",
      body: employeeDialogBody(),
      onSave: createEmployee
    },
    leaveRequest: {
      title: "Apply for Leave",
      typeLabel: "Leave Request",
      saveLabel: "Submit Leave Request",
      body: leaveRequestDialogBody(),
      onSave: createLeaveRequest
    },
    payslip: {
      title: "Issue Payslip",
      typeLabel: "Payslip",
      saveLabel: "Save Payslip",
      body: payslipDialogBody(),
      onSave: createPayslip
    },
    hrAnnouncement: {
      title: "Post Announcement",
      typeLabel: "Announcement",
      saveLabel: "Post Announcement",
      body: hrAnnouncementDialogBody(),
      onSave: createHrAnnouncement
    }
  };

  return configs[type];
}

function partyDialogConfig(key, label) {
  return {
    title: `New ${label}`,
    typeLabel: label,
    saveLabel: `Create ${label}`,
    body: `
      ${input("code", `${label} Code`, key === "customers" ? nextCustomerNumber() : nextSupplierNumber(), false)}
      ${input("name", "Name", "")}
      ${input("locationOrLane", "Lane / Location", "")}
      ${key === "customers" ? textarea("fullAddress", "Full Address / Shipping Delivery Address", "", false, 3) : ""}
      ${input("email", "Contact Email", "", false, "email")}
      ${input("mobile", "Mobile Number", "")}
      ${key === "customers" ? strictSelect("terms", "Credit Limit Days", creditLimitOptions(), "15 Days") : select("terms", "Credit Limit Days", ["15 days", "30 days", "45 days"])}
      ${key === "customers" ? strictSelect("status", "Status", customerStatusOptions(), "Active") : select("status", "Status", ["Active", "Inactive", "Blocked"])}
      ${strictSelect("branch", "Branch", branchOptions(), defaultUserBranch())}
    `,
    onSave: (data) => createParty(key, data)
  };
}

function shipmentDialogBody(mode = "shipment", record = null) {
  const actualMode = record?.entryMode || mode || "shipment";
  const isAirway = actualMode === "airway";
  const isNewFromAirway = Boolean(record?.isNewFromAirway);
  const loaded = Boolean(record) && !isNewFromAirway;
  const tcnAvailable = Boolean(record && state.shipments.some((shipmentItem) => shipmentItem.jobNo === record.jobNo));
  const sectionOpen = loaded;
  const defaultCustomer = record?.customer || "";
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  return `
    <input type="hidden" name="entryMode" value="${escapeHtml(actualMode)}" />
    ${formSection("Shipment Information", `
      ${input("jobNo", isAirway ? "Airway Bill Number" : "Shipment Number", fieldValue("jobNo", isAirway ? nextNumber("AWB", state.shipments, "jobNo") : nextShipmentNumber()), loaded)}
      ${input("bookingDate", "Booking Date", fieldValue("bookingDate", today()), false, "date")}
      ${input("shipmentDate", "Shipment Date", fieldValue("shipmentDate", today()), false, "date")}
      ${strictSelect("status", "Status", statusOptions(), fieldValue("status", "Booked"))}
      ${strictSelect("loadType", "Load Type", ["LTL", "FTL", "AIR", "SEA"], fieldValue("loadType", "LTL"))}
      ${strictSelect("shipmentVia", "Shipment Via", ["Air", "Sea", "Land", "Warehouse"], fieldValue("shipmentVia", shipmentViaValue(record) || "Land"))}
      ${strictSelect("shipmentDirection", "Shipment Type", shipmentDirectionOptions(), fieldValue("shipmentDirection", "Export"))}
      ${strictSelect("shipmentService", "Service Type", shipmentServiceOptions(fieldValue("shipmentDirection", "Export")), fieldValue("shipmentService", "LE"))}
      ${selectEditable("origin", "Origin", "origin", [], loaded ? fieldValue("origin") : "", false)}
      ${selectEditable("destination", "Destination", "destination", [], loaded ? fieldValue("destination") : "", false)}
      ${input("customerReference", "Customer Reference", fieldValue("customerReference"))}
      ${textarea("shipmentRemarks", "Remarks", fieldValue("shipmentRemarks"), false, 2)}
      ${strictSelect("branch", "Branch", branchOptions(), normalizeBranchName(fieldValue("branch", defaultUserBranch())))}
      ${input("salesPerson", "Sales Person", fieldValue("salesPerson", currentUserName()))}
      <label>Airway Bill / Bill of Lading
        <span class="inline-input-button">
          <input name="airwayBillNo" type="text" value="${escapeHtml(fieldValue("airwayBillNo", isAirway ? "" : nextAirwayBillNumber()))}" />
          <button type="button" class="secondary-button" data-dialog-action="fetch-awb-data">Fetch</button>
        </span>
      </label>
    `, true, sectionOpen)}
    ${formSection("Customer Information", `
      ${selectFrom("customer", "Customer Name", state.customers.map((row) => row.name), defaultCustomer)}
      ${selectFrom("customerCode", "Customer Code", state.customers.map((row) => ({ value: row.code, label: `${row.code} | ${row.name}` })), fieldValue("customerCode"))}
      ${input("customerContactPerson", "Contact Person", fieldValue("customerContactPerson"))}
      ${input("customerMobile", "Mobile Number", fieldValue("customerMobile"))}
      ${input("customerEmail", "Email Address", fieldValue("customerEmail"), false, "email")}
      ${textarea("customerAddress", "Address", fieldValue("customerAddress"), false, 3)}
    `, true, sectionOpen)}
    ${formSection("Shipper Information", `
      ${checkbox("copyCustomerToShipper", "Same as customer information")}
      ${input("shipperName", "Shipper Name", fieldValue("shipperName"))}
      ${textarea("shipperAddress", "Shipper Address", fieldValue("shipperAddress"), false, 3)}
      ${input("shipperContactPerson", "Contact Person", fieldValue("shipperContactPerson"))}
      ${input("shipperMobile", "Mobile Number", fieldValue("shipperMobile"))}
      ${input("shipperEmail", "Email Address", fieldValue("shipperEmail"), false, "email")}
      ${input("shipperVatTrn", "VAT / TRN Number", fieldValue("shipperVatTrn"))}
      ${input("shipperCountry", "Country", fieldValue("shipperCountry", ""))}
    `, true, sectionOpen)}
    ${formSection("Consignee Information", `
      ${checkbox("copyCustomerToConsignee", "Same as customer information")}
       ${selectFrom("consigneeName", "Consignee Name", state.customers.map((row) => row.name), fieldValue("consigneeName", ""))}
      ${textarea("consigneeAddress", "Consignee Address", fieldValue("consigneeAddress"), false, 3)}
      ${input("consigneeContactPerson", "Contact Person", fieldValue("consigneeContactPerson"))}
      ${input("consigneeMobile", "Mobile Number", fieldValue("consigneeMobile"))}
      ${input("consigneeEmail", "Email Address", fieldValue("consigneeEmail"), false, "email")}
      ${input("consigneeCountry", "Country", fieldValue("consigneeCountry"))}
    `, true, sectionOpen)}
    ${formSection("Pickup Information", `
      ${checkbox("copyCustomerToPickup", "Same as customer information")}
      ${input("pickupLocation", "Pickup Location", fieldValue("pickupLocation"))}
      ${textarea("pickupAddress", "Pickup Address", fieldValue("pickupAddress"), false, 3)}
      ${input("pickupContactPerson", "Pickup Contact Person", fieldValue("pickupContactPerson"))}
      ${input("pickupMobile", "Pickup Mobile", fieldValue("pickupMobile"))}
      ${input("pickupDate", "Pickup Date", fieldValue("pickupDate", today()), false, "date")}
      ${input("pickupTime", "Pickup Time", fieldValue("pickupTime"), false, "time")}
    `, true, sectionOpen)}
    ${formSection("Delivery Information", `
      ${selectFrom("deliveryLocation", "Delivery Location / Customer", state.customers.map((row) => row.name), fieldValue("deliveryLocation"))}
      ${textarea("deliveryAddress", "Delivery Address", fieldValue("deliveryAddress"), false, 3)}
      ${input("deliveryContactPerson", "Delivery Contact Person", fieldValue("deliveryContactPerson"))}
      ${input("deliveryMobile", "Delivery Mobile", fieldValue("deliveryMobile"))}
      ${input("deliveryDate", "Delivery Date", fieldValue("deliveryDate"), false, "date")}
      ${input("deliveryTime", "Delivery Time", fieldValue("deliveryTime"), false, "time")}
    `, true, sectionOpen)}
    ${formSection("Transport Information", `
      ${selectFrom("transporter", "Transporter", state.suppliers.map((row) => ({ value: row.name, label: `${row.code} | ${row.name}` })), fieldValue("transporter"))}
      ${selectFrom("transporterCode", "Transporter Number", state.suppliers.map((row) => ({ value: row.code, label: `${row.code} | ${row.name}` })), fieldValue("transporterCode"))}
      ${input("vehicleNo", "Vehicle No", fieldValue("vehicleNo"))}
      ${input("driverName", "Driver Name", fieldValue("driverName"))}
      ${input("driverNumber", "Driver Number", fieldValue("driverNumber"))}
      ${input("driverMobile", "Driver Mobile", fieldValue("driverMobile"))}
    `, true, sectionOpen)}
    ${formSection("Billing Party 1", `
      ${checkbox("copyCustomerToBilling1", "Same as customer information")}
      ${selectFrom("billTo1", "Billing Party Name", state.customers.map((row) => row.name), fieldValue("billTo1", defaultCustomer))}
      ${textarea("billingParty1Address", "Billing Address", fieldValue("billingParty1Address"), false, 3)}
      ${input("billingParty1ContactPerson", "Contact Person", fieldValue("billingParty1ContactPerson"))}
      ${input("billingParty1Mobile", "Mobile Number", fieldValue("billingParty1Mobile"))}
      ${input("billingParty1Email", "Email Address", fieldValue("billingParty1Email"), false, "email")}
      ${selectEditable("billingParty1CreditTerms", "Credit Terms", "creditTerms", ["Cash", "15 days", "30 days", "45 days"], fieldValue("billingParty1CreditTerms"))}
    `, true, sectionOpen)}
    ${cargoItemsBuilder(
      fieldValue("cargoItemsJson", record?.palletDimensionsJson || "[]"),
      fieldValue("tariffNo"),
      defaultCustomer,
      fieldValue("natureOfGoods"),
      fieldValue("volumeCategory", "")
    )}
    <input type="hidden" name="transportMode" value="" />
    <input type="hidden" name="deliveryNoteNo" value="${escapeHtml(fieldValue("deliveryNoteNo"))}" />
    <input type="hidden" name="tcnNumber" value="${escapeHtml(fieldValue("tcnNumber"))}" />
    <input type="hidden" name="transitDays" value="${escapeHtml(fieldValue("transitDays", "3"))}" />
    <input type="hidden" name="shipmentServiceOther" value="${escapeHtml(fieldValue("shipmentServiceOther"))}" />
    <input class="is-hidden" name="shipmentDocumentUpload" type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf" />
    <div class="action-row shipment-document-actions">
      ${checkbox("printOnlyCargoDetails", "Cargo Summary", fieldValue("printOnlyCargoDetails", false))}
      <button type="button" class="secondary-button" data-dialog-action="save-draft">Save Draft</button>
      <button type="button" class="primary-button shipment-primary-action" data-dialog-action="create-shipment">${loaded ? "Save Changes" : "Create Shipment"}</button>
      <button type="button" class="secondary-button" data-dialog-action="upload-shipment-document">Upload Documents</button>
      <button type="button" class="secondary-button" data-dialog-action="generate-tcn" ${tcnAvailable ? "" : "disabled title=\"Save the shipment before generating a TCN\""}>Generate TCN</button>
      <button type="button" class="secondary-button" data-dialog-action="view-tcn" ${tcnAvailable ? "" : "disabled title=\"Save the shipment before viewing a TCN\""}>View TCN</button>
      <button type="button" class="secondary-button" data-dialog-action="generate-pod">Delivery Note / POD</button>
      <button type="button" class="secondary-button" data-dialog-action="duplicate-tcn" ${tcnAvailable ? "" : "disabled title=\"Save the shipment before duplicating a TCN\""}>Duplicate TCN</button>
      <span class="empty-state shipment-document-name" data-shipment-document-name></span>
    </div>
  `;
}

function formSection(title, body, collapsible = false, open = false) {
  const sectionBody = `<div class="form-section-grid">${body}</div>`;
  if (!collapsible) return `<section class="form-section"><h3>${escapeHtml(title)}</h3>${sectionBody}</section>`;
  return `<details class="form-section collapsible-section" ${open ? "open" : ""}><summary>${escapeHtml(title)}</summary>${sectionBody}</details>`;
}

function shipmentRequestComplianceMarkup(requestDetails) {
  const compliance = requestDetails?.compliance;
  if (!compliance || !compliance.status) return "";
  const lines = Array.isArray(compliance.lines) ? compliance.lines : [];
  const attention = lines.filter((line) => String(line.status || "").toUpperCase() !== "PASS");
  const status = String(compliance.status || "").toUpperCase();
  const ready = status === "READY_TO_BOOK";
  const statusText = ready ? "Apollo Shield — Ready to Book" : status.replace(/_/g, " ");
  const rows = lines.map((line) => `<tr><td>${escapeHtml(line.description || "-")}</td><td>${escapeHtml(line.submittedHsCode || "-")}</td><td>${escapeHtml(line.effectiveHsCode || "-")}</td><td>${escapeHtml(String(line.confidence ?? 0))}%</td><td>${escapeHtml(line.status || "-")}</td></tr>`).join("");
  return `<div class="form-section"><h3>Kuwait HS Compliance</h3><div class="alert ${ready ? "success" : "warning"}"><strong>${escapeHtml(statusText)}</strong>${attention.length ? ` · ${attention.length} line item(s) need attention` : " · All checked line items passed"}</div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Description</th><th>Submitted HS</th><th>Effective HS</th><th>Confidence</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}<p class="empty-state">Analysis ID: ${escapeHtml(requestDetails.complianceAnalysisId || "-")}</p></div>`;
}

function shipmentRequestDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const requestDetails = parseJsonMeta(record?.requestDetailsJson || "{}");
  const attachments = (() => {
    try {
      const parsed = JSON.parse(record?.attachmentsJson || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  })();
  return `
    ${input("requestNo", "Request No", fieldValue("requestNo"), true)}
    ${input("createdAt", "Submitted", fieldValue("createdAt"), true)}
    ${badge(display(fieldValue("status")))}
    ${formSection("Customer", `
      ${input("customerName", "Customer Name", fieldValue("customerName"), true)}
      ${input("customerCode", "Customer Code", fieldValue("customerCode"), true)}
    `)}
    ${formSection("Shipment Details", `
      ${input("shipmentType", "Shipment Type", fieldValue("shipmentType"), true)}
      ${input("shipmentVia", "Shipment Via", requestDetails.shipmentVia || "", true)}
      ${input("origin", "Origin", fieldValue("origin"), true)}
      ${input("destination", "Destination", fieldValue("destination"), true)}
      ${input("consignee", "Consignee", fieldValue("consignee"), true)}
      ${input("consigneeContactPerson", "Delivery Contact Person", requestDetails.consigneeContactPerson || "", true)}
      ${input("consigneeMobile", "Delivery Mobile", requestDetails.consigneeMobile || "", true)}
      ${textarea("deliveryAddress", "Delivery Address", requestDetails.deliveryAddress || "", true, 2)}
      ${input("pickupDate", "Preferred Pickup Date", requestDetails.pickupDate || "", true)}
      ${input("deliveryDate", "Requested Delivery Date", requestDetails.deliveryDate || "", true)}
      ${input("itemName", "Item Name", fieldValue("itemName"), true)}
      ${input("hsCode", "HS Code", fieldValue("hsCode"), true)}
      ${input("itemCode", "Item Code", fieldValue("itemCode"), true)}
      ${input("quantity", "Quantity", fieldValue("quantity"), true)}
      ${input("weight", "Weight (KG)", fieldValue("weight"), true)}
      ${input("invoiceValue", "Invoice Value", fieldValue("invoiceValue"), true)}
    `)}
    ${formSection("Cargo Calculation", `
      ${input("pieces", "Total Pieces", requestDetails.pieces || fieldValue("quantity"), true)}
      ${input("cbm", "Grand Total CBM", requestDetails.cbm || "0", true)}
      ${input("actualKg", "Gross Weight (KG)", requestDetails.actualKg || fieldValue("weight"), true)}
      ${input("chargeableKg", "Chargeable Weight (KG)", requestDetails.chargeableKg || "0", true)}
      ${input("volumeCategory", "CBM Divisor", requestDetails.volumeCategory || "", true)}
    `)}
    ${textarea("remarks", "Customer Remarks", fieldValue("remarks"), true, 2)}
    ${attachments.length ? `<div class="form-section"><h3>Attachments</h3>${attachments.map((file) => {
      const fileName = escapeHtml(file.name || file.fileName || String(file));
      const fileUrl = String(file.url || file.storageUrl || "").trim();
      return fileUrl ? `<p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Open ${fileName}</a></p>` : `<p>${fileName}</p>`;
    }).join("")}</div>` : ""}
    ${shipmentRequestComplianceMarkup(requestDetails)}
    ${textarea("approvalNotes", "Approval / Send Back Notes", fieldValue("approvalNotes"), false, 3)}
    ${["SUBMITTED", "PENDING_REVIEW"].includes(String(fieldValue("status")).toUpperCase()) ? `<div class="action-row"><button type="button" class="secondary-button" data-dialog-action="send-back-request">Send Back to Customer</button></div>` : ""}
    <input type="hidden" name="convertedJobNo" value="${escapeHtml(fieldValue("convertedJobNo"))}" />
  `;
}

function quotationDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const loaded = Boolean(record);
  return `
    ${input("quotationNo", "Quotation No", fieldValue("quotationNo", nextQuotationNumber()), loaded)}
    ${input("date", "Date", fieldValue("date", today()), false, "date")}
    ${select("status", "Status", ["Draft", "Sent", "Converted"], fieldValue("status", "Draft"))}
    ${strictSelect("branch", "Branch", branchOptions(), normalizeBranchName(fieldValue("branch", defaultUserBranch())))}
    ${formSection("Customer Information", `
      ${selectFrom("customerName", "Customer Name", state.customers.map((row) => row.name), fieldValue("customerName"))}
      ${input("customerContactPerson", "Contact Person", fieldValue("customerContactPerson"))}
      ${input("customerMobile", "Mobile Number", fieldValue("customerMobile"))}
      ${input("customerEmail", "Email Address", fieldValue("customerEmail"), false, "email")}
    `)}
    ${cargoItemsBuilder(fieldValue("cargoItemsJson", "[]"), "", fieldValue("customerName"), fieldValue("natureOfGoods"), fieldValue("volumeCategory", "1 CBM = 250 KG"))}
    ${textarea("notes", "Notes", fieldValue("notes"), false, 3)}
    <input type="hidden" name="convertedJobNo" value="${escapeHtml(fieldValue("convertedJobNo"))}" />
  `;
}

function cargoItemsBuilder(
  initialValue = "[]",
  appliedTariffNo = "",
  customerName = "",
  natureOfGoods = "",
  volumeCategory = "1 CBM = 250 KG"
) {
  return `<section class="form-section pallet-builder" data-pallet-builder>
    <h3>Cargo Details</h3>
    <input type="hidden" name="cargoItemsJson" value="${escapeHtml(initialValue || "[]")}" />
    <input type="hidden" name="palletDimensionsJson" value="${escapeHtml(initialValue || "[]")}" />
    <div class="tariff-charge-entry cargo-entry">
      ${select("palletPackageType", "Package Type", ["Pallet", "Carton", "Crate", "Box", "Package", "Drum"], "Pallet")}
      ${input("palletCount", "Quantity", "1", false, "number")}
      ${input("palletLength", "Length", "100", false, "number")}
      ${input("palletWidth", "Width", "120", false, "number")}
      ${input("palletHeight", "Height", "100", false, "number")}
      ${select("palletDimensionUnit", "Dimension Unit", ["CM", "M", "INCH"], "CM")}
      ${input("palletWeight", "Weight Per Unit", "0", false, "number")}
      ${input("palletTotalWeight", "Total Gross Weight", "0", false, "number")}
      <button type="button" class="secondary-button" data-dialog-action="add-pallet-line">Add</button>
    </div>
    <div class="cargo-live-summary" data-cargo-live-summary>
      <span>Pieces: 1</span>
      <span>CBM: 1.2</span>
      <span>Total Gross Weight: 0 KG</span>
    </div>
    <div class="tariff-charge-table" data-pallet-lines-list></div>
    <div class="form-section-grid cargo-totals">
      ${strictSelect("volumeCategory", "", volumeCategoryOptions(), volumeCategory)}
      ${input("cbm", "Grand Total CBM", "0", true, "number")}
      ${input("actualKg", "Total Actual Weight", "0", true, "number")}
      ${input("chargeableKg", "Chargeable Weight", "0", false, "number")}
      <input type="hidden" name="pieces" value="0" />
      <input type="hidden" name="chargeableDivisor" value="${volumeDivisorFor(volumeCategory) || ""}" />
      <input type="hidden" name="manualChargeableKg" value="0" />
    </div>
    <div class="form-section-grid cargo-description-row">
      ${textarea("natureOfGoods", "Nature of Goods / Description of Goods", natureOfGoods, false, 3)}
      ${selectFrom("tariffNo", "Apply Tariff", tariffOptionsForCustomer(customerName), appliedTariffNo)}
    </div>
  </section>`;
}

function customerUserDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const loaded = Boolean(record);
  const customerOptions = state.customers.map((row) => ({ value: row.code, label: `${row.name} (${row.code})` }));
  return `
    ${strictSelect("customerCode", "Customer", customerOptions, fieldValue("customerCode"))}
    ${input("username", "Portal Username", fieldValue("username"), loaded)}
    ${input("email", "Email", fieldValue("email"), false, "email")}
    ${passwordField("password", loaded ? "Reset Password (leave blank to keep current)" : "Password", "")}
    ${strictSelect("status", "Status", ["ACTIVE", "SUSPENDED"], fieldValue("status", "ACTIVE"))}
  `;
}

function employeeDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const loaded = Boolean(record);
  const userOptions = state.users.map((row) => ({ value: row.userName, label: `${row.userName} (${row.role || "User"})` }));
  return `
    ${strictSelect("userName", "Login User", userOptions, fieldValue("userName"))}
    ${input("employeeCode", "Employee Code", fieldValue("employeeCode"))}
    ${input("fullName", "Full Name", fieldValue("fullName"))}
    ${input("department", "Department", fieldValue("department"))}
    ${input("designation", "Designation", fieldValue("designation"))}
    ${input("joinDate", "Join Date", fieldValue("joinDate", today()), false, "date")}
    ${input("phone", "Phone", fieldValue("phone"))}
    ${input("personalEmail", "Personal Email", fieldValue("personalEmail"), false, "email")}
    ${strictSelect("employmentStatus", "Employment Status", ["Active", "On Leave", "Inactive"], fieldValue("employmentStatus", "Active"))}
    ${input("reportingManager", "Reporting Manager", fieldValue("reportingManager"))}
    ${textarea("notes", "Notes", fieldValue("notes"), false, 3)}
    ${loaded ? "" : `<p class="empty-state">Tip: turn on this user's HR Portal access from Settings &gt; User Management so they can log in with Employee Login.</p>`}
  `;
}

function leaveRequestDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const employeeRecord = state.employees.find((row) => row.userName === currentUserName());
  return `
    <input type="hidden" name="requestNo" value="${escapeHtml(fieldValue("requestNo", nextNumber("LV", state.leaveRequests, "requestNo")))}" />
    <input type="hidden" name="userName" value="${escapeHtml(fieldValue("userName", currentUserName()))}" />
    ${input("employeeName", "Employee Name", fieldValue("employeeName", employeeRecord?.fullName || currentUserName()), true)}
    ${strictSelect("leaveType", "Leave Type", ["Annual", "Sick", "Unpaid", "Emergency", "Other"], fieldValue("leaveType", "Annual"))}
    ${input("startDate", "Start Date", fieldValue("startDate", today()), false, "date")}
    ${input("endDate", "End Date", fieldValue("endDate", today()), false, "date")}
    ${textarea("reason", "Reason", fieldValue("reason"), false, 3)}
  `;
}

function payslipDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const userOptions = state.users.map((row) => ({ value: row.userName, label: `${row.userName}` }));
  return `
    <input type="hidden" name="payslipNo" value="${escapeHtml(fieldValue("payslipNo", nextNumber("PAY", state.payslips, "payslipNo")))}" />
    ${strictSelect("userName", "Employee", userOptions, fieldValue("userName"))}
    ${input("employeeName", "Employee Name", fieldValue("employeeName"))}
    ${input("period", "Period (e.g. 2026-07)", fieldValue("period", new Date().toISOString().slice(0, 7)))}
    ${input("grossPay", "Gross Pay", fieldValue("grossPay", "0"), false, "number")}
    ${input("deductions", "Deductions", fieldValue("deductions", "0"), false, "number")}
    ${input("netPay", "Net Pay", fieldValue("netPay", "0"), false, "number")}
    ${strictSelect("status", "Status", ["Issued", "Paid"], fieldValue("status", "Issued"))}
    ${input("issuedDate", "Issued Date", fieldValue("issuedDate", today()), false, "date")}
  `;
}

function hrAnnouncementDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  return `
    ${input("title", "Title", fieldValue("title"))}
    ${textarea("body", "Message", fieldValue("body"), false, 5)}
    ${strictSelect("audience", "Audience", ["All"], fieldValue("audience", "All"))}
    ${strictSelect("pinned", "Pin to top", ["No", "Yes"], fieldValue("pinned") === true || fieldValue("pinned") === "Yes" ? "Yes" : "No")}
  `;
}

function userDialogBody(record) {
  const fieldValue = (key, fallback = "") => record?.[key] ?? fallback;
  const loaded = Boolean(record);
  const checkedSections = sectionAccessSet(fieldValue("sectionAccess", "Dashboard, Shipment / Airway, Reports"));
  return `
    ${input("userName", "User Name", fieldValue("userName"), loaded)}
    ${passwordField("password", loaded ? "Reset Password (leave blank to keep current)" : "Password", "")}
    ${input("email", "Email", fieldValue("email"), false, "email")}
    <div class="user-account-access-grid">
      ${strictSelect("role", "User Role", roleOptions(), fieldValue("role", "Operations"))}
      ${strictSelect("accountStatus", "User Account", accountStatusOptions(), fieldValue("accountStatus", "Active"))}
      ${strictSelect("branchAccess", "Branch Access", branchAccessOptions(), fieldValue("branchAccess", branchOptions()[0]))}
      ${strictSelect("branchViewScope", "View Scope", branchViewScopeOptions(), fieldValue("branchViewScope", "Assigned Branch Only"))}
    </div>
    ${sectionAccessCheckboxes(checkedSections, {
      billingSalesChecked: loaded ? isChecked(fieldValue("canBillingSalesEntry", true)) : true,
      billingCostChecked: loaded ? isChecked(fieldValue("canBillingCostEntry", true)) : true,
      erpPortalChecked: loaded ? isChecked(fieldValue("erpPortalAccess", true)) : true,
      hrPortalChecked: isChecked(fieldValue("hrPortalAccess", false)),
      hrAdminChecked: isChecked(fieldValue("isHrAdmin", false)),
      maintenancePortalChecked: isChecked(fieldValue("maintenancePortalAccess", false)),
      crmPortalChecked: isChecked(fieldValue("crmPortalAccess", false)),
      crmRole: fieldValue("crmRole", "Sales Executive"),
      crmViewAllChecked: isChecked(fieldValue("crmViewAllAccounts", false)),
      crmAssignChecked: isChecked(fieldValue("crmManageAssignments", false)),
      crmExportChecked: isChecked(fieldValue("crmExportAccess", false)),
      crmArchiveChecked: isChecked(fieldValue("crmArchiveAccess", false)),
      crmTeamReportsChecked: isChecked(fieldValue("crmViewTeamReports", false)),
      crmAdminChecked: isChecked(fieldValue("crmAdminAccess", false)),
      aiChecked: loaded ? isChecked(fieldValue("aiAccess", false)) : true
    })}
    ${checkbox("canViewAllEntry", "User can view all entry", isChecked(fieldValue("canViewAllEntry", false)))}
    ${checkbox("canViewOnlySelfEntry", "User can view only self entry", loaded ? isChecked(fieldValue("canViewOnlySelfEntry", true)) : true)}
    ${checkbox("canEditAllEntry", "User can edit all entry", isChecked(fieldValue("canEditAllEntry", false)))}
    ${checkbox("canViewUpdatedHistory", "User can view updated history", loaded ? isChecked(fieldValue("canViewUpdatedHistory", true)) : true)}
    ${input("notes", "Notes", fieldValue("notes", "Created from admin panel"))}
  `;
}

function changePasswordDialogBody() {
  return `
    ${input("userName", "User Name", currentUserName(), true)}
    ${passwordField("currentPassword", "Current Password", "")}
    ${passwordField("newPassword", "New Password", "")}
    ${passwordField("confirmPassword", "Confirm Password", "")}
  `;
}

function sectionAccessCheckboxes(checkedSections = new Set(), options = {}) {
  const { billingSalesChecked = true, billingCostChecked = true, erpPortalChecked = true, hrPortalChecked = false, hrAdminChecked = false, maintenancePortalChecked = false, crmPortalChecked = false, crmRole = "Sales Executive", crmViewAllChecked = false, crmAssignChecked = false, crmExportChecked = false, crmArchiveChecked = false, crmTeamReportsChecked = false, crmAdminChecked = false, aiChecked = true } = options;
  return `<fieldset class="section-access-grid">
    <legend>Menu Access Permissions</legend>
    ${modules.map(([name]) => {
      const row = checkbox("sectionAccessList", name, checkedSections.has(name), name);
      if (name === "Billing / Invoices") {
        return row + `<div class="permission-sub-options">
          ${checkbox("canBillingSalesEntry", "Allow Sales Entry (selling data)", billingSalesChecked)}
          ${checkbox("canBillingCostEntry", "Allow Cost Entry (cost data)", billingCostChecked)}
        </div>`;
      }
      return row;
    }).join("")}
    <div class="checkbox-field permission-group-label"><span>Portal Access</span></div>
    <div class="permission-sub-options">
      ${checkbox("erpPortalAccess", "Allow ERP Portal access (Company Login)", erpPortalChecked)}
      ${checkbox("hrPortalAccess", "Allow HR Portal access (Employee Login)", hrPortalChecked)}
      ${checkbox("maintenancePortalAccess", "Allow Maintenance Portal access", maintenancePortalChecked)}
      ${checkbox("crmPortalAccess", "Allow CRM / Sales Portal access", crmPortalChecked)}
      ${checkbox("aiAccess", "Allow Apollo AI access (read-only, permission-scoped)", aiChecked)}
      ${checkbox("isHrAdmin", "Is HR Admin (independent of ERP role - manage all employee records, leave, payslips, announcements)", hrAdminChecked)}
    </div>
    <div class="checkbox-field permission-group-label"><span>CRM Security & Ownership</span></div>
    <div class="permission-sub-options">
      ${strictSelect("crmRole", "CRM Role", ["Sales Executive", "Senior Sales", "Sales Manager", "Commercial Manager", "Management"], crmRole)}
      ${checkbox("crmViewAllAccounts", "CRM: View all accounts (otherwise assigned accounts only)", crmViewAllChecked)}
      ${checkbox("crmManageAssignments", "CRM: Assign / reassign customer accounts", crmAssignChecked)}
      ${checkbox("crmExportAccess", "CRM: Export / download sales data", crmExportChecked)}
      ${checkbox("crmArchiveAccess", "CRM: Archive / restore accounts", crmArchiveChecked)}
      ${checkbox("crmViewTeamReports", "CRM: View team-wide reports and audit", crmTeamReportsChecked)}
      ${checkbox("crmAdminAccess", "CRM: Administer CRM permissions", crmAdminChecked)}
    </div>
  </fieldset>`;
}

function sectionAccessSet(value) {
  const normalized = normalizeSectionAccess(value || "");
  if (normalized === "All") return new Set(modules.map(([name]) => name));
  return new Set(normalized.split(",").map((item) => item.trim()).filter(Boolean));
}

function openBlockRequestDialog(record) {
  const isPending = String(record.status || "").toLowerCase() === "pending";
  openDialog({
    title: record.requestNo,
    typeLabel: "Block / Unblock Request",
    body: `
      <label>Request Type<input value="${escapeHtml(record.requestType || "Unblock")}" readonly /></label>
      <label>Target<input value="${escapeHtml(record.targetType || "Customer")}" readonly /></label>
      <label>Reference<input value="${escapeHtml(record.referenceNo || record.customerName)}" readonly /></label>
      <label>Requested By<input value="${escapeHtml(record.requestedBy)}" readonly /></label>
      <label>Status<input value="${escapeHtml(record.status)}" readonly /></label>
      <label>Reason<textarea rows="4" readonly>${escapeHtml(record.reason)}</textarea></label>
      <label>Approval Notes<textarea name="approvalNotes" rows="4" ${isPending ? "" : "readonly"}>${escapeHtml(record.notes || "")}</textarea></label>
      ${isPending ? "" : `<p class="empty-state">This request was already ${escapeHtml(String(record.status || "").toLowerCase())} by ${escapeHtml(record.approvedBy || "-")}. No further action is needed.</p>`}
    `,
    saveLabel: isPending ? "Approve Request" : "Close",
    secondaryLabel: isPending ? "Reject Request" : "",
    async onSave() {
      if (!isPending) {
        recordDialog.close();
        return;
      }
      const data = collectFormValues(dialogBody.closest("form"));
      await approveBlockRequest(record, data.approvalNotes || "");
      recordDialog.close();
      render();
    },
    async onSecondary() {
      if (!isPending) return;
      const data = collectFormValues(dialogBody.closest("form"));
      await rejectBlockRequest(record, data.approvalNotes || "");
      recordDialog.close();
      render();
    }
  });
}

function chargeDialogBody() {
  const invoiceOptions = ["", ...state.invoices.map((row) => row.invoiceNo)];
  return `
    ${input("refNo", "Receipt / Reference No", nextAdditionalChargeNumber(), false)}
    ${selectFrom("shipmentNo", "Shipment No", shipmentOptions())}
    ${input("chargeDate", "Charge Date", today(), false, "date")}
    ${selectFrom("supplier", "Supplier / Vendor", state.suppliers.map((row) => row.name))}
    ${input("referenceNo", "Reference No", "")}
    ${select("invoiceNo", "Invoice No", invoiceOptions, "")}
    ${input("taxPercent", "Tax %", "0", false, "number")}
    ${selectEditable("currency", "Currency", "currency", currencyOptions(), "KD")}
    <input type="hidden" name="chargeLines" value="[]" />
    <section class="charge-line-builder" data-charge-line-builder>
      <div class="charge-line-entry">
        ${select("lineChargeType", "Charge Type", chargeTypeOptions())}
        ${input("lineAmount", "Amount", "0.000", false, "number")}
        <button type="button" class="secondary-button" data-dialog-action="add-charge-line">Add</button>
      </div>
      <div class="charge-line-list" data-charge-lines-list></div>
      <p class="empty-state">Add one or more charge lines to the same receipt/reference number.</p>
    </section>
    ${input("attachmentName", "Attachment Upload", "")}
    ${select("status", "Status", chargeStatusOptions(), isAdminSession() ? "Approved" : "Pending Approval")}
    ${textarea("remarks", "Remarks", "")}
  `;
}

function bindChargeLineBuilder() {
  const builder = dialogBody.querySelector("[data-charge-line-builder]");
  if (!builder) return;
  const hiddenField = dialogBody.querySelector("input[name='chargeLines']");
  const typeField = dialogBody.querySelector("select[name='lineChargeType']");
  const amountField = dialogBody.querySelector("input[name='lineAmount']");
  const list = builder.querySelector("[data-charge-lines-list]");
  const lines = [];

  const sync = () => {
    hiddenField.value = JSON.stringify(lines);
    const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    list.innerHTML = lines.length
      ? `${lines
          .map(
            (line, index) => `<div class="charge-line-row">
              <span>${escapeHtml(line.chargeType)}</span>
              <strong>${money(line.amount)}</strong>
              <button type="button" class="ghost-button" data-remove-charge-line="${index}">Remove</button>
            </div>`
          )
          .join("")}<div class="charge-line-total"><span>Total Added</span><strong>${money(total)}</strong></div>`
      : `<p class="empty-state">No charge lines added yet.</p>`;
  };

  builder.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-dialog-action='add-charge-line']");
    if (addButton) {
      const amount = Number(amountField.value || 0);
      if (!amount || amount <= 0) {
        notifyDenied("Line not added", "Enter an amount greater than zero.");
        return;
      }
      lines.push({ chargeType: typeField.value, amount });
      amountField.value = "0.000";
      sync();
      return;
    }

    const removeButton = event.target.closest("[data-remove-charge-line]");
    if (removeButton) {
      lines.splice(Number(removeButton.dataset.removeChargeLine), 1);
      sync();
    }
  });

  sync();
}

function consolidationShipmentPicker(initialJobs = "", currentLoadNo = "") {
  const shipmentOptionIds = availableConsolidationShipmentOptions(initialJobs, currentLoadNo);
  const shipmentOptionsMarkup = shipmentOptionIds.map((jobNo) => {
    const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
    return `<option value="${escapeHtml(jobNo)}" label="${escapeHtml(shipmentItem ? shipmentOptionLabel(shipmentItem) : jobNo)}"></option>`;
  }).join("");
  return `<div class="dialog-picker" data-consolidation-picker>
    <input type="hidden" name="jobNumbers" value="${escapeHtml(initialJobs)}" />
    <label>Add Shipment To Manifest
      <input type="text" data-consolidation-job-select value="${escapeHtml(shipmentOptionIds[0] || "")}" list="consolidation-shipment-options" placeholder="Type to search and select" autocomplete="off" />
      <datalist id="consolidation-shipment-options">${shipmentOptionsMarkup}</datalist>
    </label>
    <div class="action-row">
      <button type="button" class="secondary-button" data-dialog-action="add-consolidation-job">Add Shipment</button>
    </div>
    <div data-manifest-jobs-columns></div>
    <div data-consolidation-jobs-list></div>
    <div data-consolidation-jobs-totals></div>
    <p class="empty-state">${shipmentOptionIds.length ? "Already-assigned and Delivered shipments are hidden." : "No eligible shipments are available (all are already on a manifest or Delivered)."}</p>
  </div>`;
}

function bindShipmentDirectionDialog() {
  const directionSelect = dialogBody.querySelector("[name='shipmentDirection']");
  const serviceSelect = dialogBody.querySelector("[name='shipmentService']");
  const branchSelect = dialogBody.querySelector("[name='branch']");
  const jobNoField = dialogBody.querySelector("[name='jobNo']");
  if (!directionSelect || !serviceSelect) return;

  const refreshShipmentNumber = () => {
    const entryMode = dialogBody.querySelector("[name='entryMode']")?.value || "shipment";
    if (entryMode !== "shipment" || !jobNoField || jobNoField.readOnly) return;
    jobNoField.value = nextShipmentNumber(branchSelect?.value || defaultUserBranch(), serviceSelect.value);
  };

  const rebuildServiceOptions = (preserveValue) => {
    const options = shipmentServiceOptions(directionSelect.value);
    const keepValue = preserveValue && options.includes(preserveValue) ? preserveValue : "";
    const blankOption = keepValue ? "" : `<option value="" selected disabled hidden></option>`;
    serviceSelect.innerHTML = blankOption + options.map((option) => `<option value="${escapeHtml(option)}" ${option === keepValue ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
  };

  directionSelect.addEventListener("change", () => {
    rebuildServiceOptions(null);
    refreshShipmentNumber();
  });
  serviceSelect.addEventListener("change", refreshShipmentNumber);
  branchSelect?.addEventListener("change", refreshShipmentNumber);
  rebuildServiceOptions(serviceSelect.value);
  refreshShipmentNumber();
}

function bindShipmentCustomerTariffs() {
  const customerField = dialogBody.querySelector("input[name='customer']");
  const tariffField = dialogBody.querySelector("input[name='tariffNo']");
  if (!customerField || !tariffField || tariffField.type !== "text") return;
  const datalistId = tariffField.getAttribute("list");
  const datalist = datalistId ? dialogBody.querySelector(`#${CSS.escape(datalistId)}`) : null;
  if (!datalist) return;

  const syncTariffs = () => {
    const options = tariffOptionsForCustomer(customerField.value);
    datalist.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`).join("");
    if (!options.some((option) => option.value === tariffField.value)) {
      tariffField.value = options[0]?.value || "";
    }
  };

  customerField.addEventListener("input", syncTariffs);
  customerField.addEventListener("change", syncTariffs);
  syncTariffs();
}

function bindAwbFetchButton() {
  const fetchButton = dialogBody.querySelector("[data-dialog-action='fetch-awb-data']");
  fetchButton?.addEventListener("click", fetchAwbAndRefillForm);
}

function fetchAwbAndRefillForm() {
  const typedValue = dialogValue("airwayBillNo");
  const query = String(typedValue || "").trim().toLowerCase();
  if (!query) {
    window.alert("Enter an Airway Bill / Bill of Lading number first.");
    return;
  }

  const match = state.shipments.find((row) =>
    String(row.airwayBillNo || "").trim().toLowerCase() === query ||
    String(row.jobNo || "").trim().toLowerCase() === query
  );

  if (!match) {
    window.alert(`No shipment found matching Airway Bill "${typedValue}" in any branch.`);
    return;
  }

  openShipmentFromAirwayBill(
    match,
    typedValue,
    dialogValue("branch"),
    dialogValue("shipmentService"),
    dialogValue("shipmentDirection")
  );
  notifySuccess("Data fetched", `Form filled from Airway Bill ${typedValue}.`);
}

function openShipmentFromAirwayBill(sourceRecord, airwayBillNo, branch = "", service = "", direction = "") {
  const typedValue = String(airwayBillNo || sourceRecord.airwayBillNo || sourceRecord.jobNo || "").trim();
  const prefillRecord = { ...sourceRecord };
  // The source is only used as a template.  The saved record must be a new shipment,
  // while retaining the fetched AWB/Bill of Lading as its reference.
  prefillRecord.entryMode = "shipment";
  prefillRecord.isNewFromAirway = true;
  prefillRecord.airwayBillNo = typedValue;
  prefillRecord.bookingDate = today();
  prefillRecord.shipmentDate = today();
  prefillRecord.branch = normalizeBranchName(branch || defaultUserBranch());
  const availableDirections = shipmentDirectionOptions();
  const requestedDirection = String(direction || prefillRecord.shipmentDirection || "Export").trim();
  prefillRecord.shipmentDirection = availableDirections.includes(requestedDirection) ? requestedDirection : "Export";
  const availableServices = shipmentServiceOptions(prefillRecord.shipmentDirection || "Export");
  const requestedService = String(service || prefillRecord.shipmentService || "").trim();
  const selectedService = availableServices.includes(requestedService)
    ? requestedService
    : (availableServices.includes("LE") ? "LE" : availableServices[0] || "");
  prefillRecord.shipmentService = selectedService;
  prefillRecord.jobNo = nextShipmentNumber(prefillRecord.branch, selectedService);

  editing = null;
  dialogState = null;
  const saveFetchedShipment = async () => {
    const data = collectFormValues(dialogBody.closest("form"));
    rememberDropdownOptions(data);
    const saved = await createShipment(data);
    if (saved === false) return;
    saveState();
    recordDialog.close();
    render();
  };
  if (recordDialog.open) {
    resetDialogShell();
    dialogType.textContent = "Shipment";
    dialogTitle.textContent = "New Shipment (from Airway Bill)";
    dialogBody.innerHTML = shipmentDialogBody("shipment", prefillRecord);
    dialogSave.textContent = "Create Shipment";
    dialogState = { onSave: saveFetchedShipment, onSecondary: null };
    bindShipmentDirectionDialog();
    bindShipmentCustomerTariffs();
    bindShipmentCustomerAutofill();
    bindShipmentCopySections();
    bindTransporterAutofill();
    bindTariffFinancialAutofill();
    bindVolumeCalculator();
    bindPalletDimensionBuilder();
    bindAwbFetchButton();
    return;
  }
  openDialog({
    title: "New Shipment (from Airway Bill)",
    typeLabel: "Shipment",
    saveLabel: "Create Shipment",
    body: shipmentDialogBody("shipment", prefillRecord),
    onSave: saveFetchedShipment,
    afterOpen: () => {
      bindShipmentDirectionDialog();
      bindShipmentCustomerTariffs();
      bindShipmentCustomerAutofill();
      bindShipmentCopySections();
      bindTransporterAutofill();
      bindTariffFinancialAutofill();
      bindVolumeCalculator();
      bindPalletDimensionBuilder();
      bindAwbFetchButton();
    }
  });
  window.requestAnimationFrame(() => {
    if (!recordDialog.open || dialogTitle.textContent !== "New Shipment (from Airway Bill)") return;
    dialogSave.textContent = "Create Shipment";
    dialogState = { onSave: saveFetchedShipment, onSecondary: null };
  });
}

function bindShipmentCustomerAutofill() {
  const customerField = dialogBody.querySelector("input[name='customer']");
  const codeField = dialogBody.querySelector("input[name='customerCode']");
  const billToField = dialogBody.querySelector("input[name='billTo1']");
  const tariffField = dialogBody.querySelector("input[name='tariffNo']");
  const tariffDatalist = dialogBody.querySelector("#tariffNoOptions");
  if (!customerField && !codeField && !billToField) return;

  const normalizeCustomerSearch = (value) => String(value || "").trim().toLowerCase();
  const customerContactValue = (customer) => customer?.contactPerson || customer?.contact_person || customer?.contact || "";
  const customerIdentityValues = (customer) => [customer?.name, customer?.code]
    .map(normalizeCustomerSearch)
    .filter(Boolean);
  const findCustomer = (value, allowPartial = false) => {
    const query = normalizeCustomerSearch(value);
    if (!query) return null;
    const exactMatches = state.customers.filter((row) => customerIdentityValues(row).includes(query));
    const exact = exactMatches.length === 1 ? exactMatches[0] : null;
    if (exact) return exact;
    // Partial lookup is used only after the user leaves a field, and only against name/code.
    // Searching address, phone, email, or contact text can select the wrong account.
    if (!allowPartial || query.length < 3 || /[0-9@+]/.test(query)) return null;
    const matches = state.customers.filter((row) => customerIdentityValues(row).some((field) => field.includes(query)));
    return matches.length === 1 ? matches[0] : null;
  };

  const fillCustomerSection = (source, fields) => {
    const customer = findCustomer(source?.value);
    if (!customer) return;
    setDialogValue(fields.name, customer.name);
    setDialogValue(fields.address, customer.fullAddress || customer.locationOrLane);
    setDialogValue(fields.contact, customerContactValue(customer));
    setDialogValue(fields.mobile, customer.mobile);
    if (fields.email) setDialogValue(fields.email, customer.email);
  };

  // Tariff options are filtered to the selected customer only, matching the same behavior as the
  // Invoice dialog's Job No/Tariff No fields - without this, the tariff list would only reflect
  // whichever customer was set when the shipment dialog first opened, not later changes.
  const refreshTariffOptions = () => {
    if (!tariffDatalist) return;
    const options = tariffOptionsForCustomer(customerField?.value || "");
    tariffDatalist.innerHTML = options
      .map((option) => `<option value="${escapeHtml(option.value || "")}" label="${escapeHtml(option.label || option.value || "")}"></option>`)
      .join("");
    if (tariffField?.value && !options.some((option) => option.value === tariffField.value)) tariffField.value = "";
  };

  const fill = (source, allowPartial = false) => {
    const value = String(source?.value || "").trim().toLowerCase();
    refreshTariffOptions();
    if (!value) return;
    const customer = findCustomer(value, allowPartial);
    if (!customer) return;

    if (String(customer.status || "").trim().toLowerCase() === "blocked") {
      notifyDenied("Customer blocked", `${customer.name} (${customer.code}) is blocked for overdue account. This shipment cannot be saved until admin approves an unblock request.`);
    }

    setDialogValue("customer", customer.name);
    setDialogValue("customerCode", customer.code);
    setDialogValue("customerEmail", customer.email);
    setDialogValue("customerMobile", customer.mobile);
    setDialogValue("customerContactPerson", customerContactValue(customer));
    setDialogValue("customerAddress", customer.fullAddress || customer.locationOrLane);
    setDialogValue("billTo1", customer.name);
    setDialogValue("billingParty1Address", customer.fullAddress || customer.locationOrLane);
    setDialogValue("billingParty1ContactPerson", customerContactValue(customer));
    setDialogValue("billingParty1Mobile", customer.mobile);
    setDialogValue("billingParty1Email", customer.email);
    setDialogValue("billingParty1CreditTerms", customer.terms);
  };

  // Searching/typing directly into the Billing Party Name field is its own entry point - the
  // billing party isn't always the same as the shipment's operational customer (e.g. third-party
  // billing), so this only fills the billing-specific fields, not the customer/consignee ones above.
  const fillBillingPartyOnly = (source) => {
    const value = String(source?.value || "").trim().toLowerCase();
    if (!value) return;
    const customer = findCustomer(value);
    if (!customer) return;

    setDialogValue("billingParty1Address", customer.fullAddress || customer.locationOrLane);
    setDialogValue("billTo1", customer.name);
    setDialogValue("billingParty1ContactPerson", customerContactValue(customer));
    setDialogValue("billingParty1Mobile", customer.mobile);
    setDialogValue("billingParty1Email", customer.email);
    setDialogValue("billingParty1CreditTerms", customer.terms);
  };

  customerField?.addEventListener("input", () => fill(customerField));
  customerField?.addEventListener("change", () => fill(customerField, true));
  codeField?.addEventListener("input", () => fill(codeField));
  codeField?.addEventListener("change", () => fill(codeField, true));
  billToField?.addEventListener("input", () => fillBillingPartyOnly(billToField));
  billToField?.addEventListener("change", () => fillBillingPartyOnly(billToField));

  [
    [["shipperName", "shipperAddress", "shipperContactPerson", "shipperMobile", "shipperEmail"], { name: "shipperName", address: "shipperAddress", contact: "shipperContactPerson", mobile: "shipperMobile", email: "shipperEmail" }],
    [["shipperAddress", "shipperName", "shipperContactPerson", "shipperMobile", "shipperEmail"], { name: "shipperName", address: "shipperAddress", contact: "shipperContactPerson", mobile: "shipperMobile", email: "shipperEmail" }],
    [["consigneeName", "consigneeAddress", "consigneeContactPerson", "consigneeMobile", "consigneeEmail"], { name: "consigneeName", address: "consigneeAddress", contact: "consigneeContactPerson", mobile: "consigneeMobile", email: "consigneeEmail" }],
    [["consigneeAddress", "consigneeName", "consigneeContactPerson", "consigneeMobile", "consigneeEmail"], { name: "consigneeName", address: "consigneeAddress", contact: "consigneeContactPerson", mobile: "consigneeMobile", email: "consigneeEmail" }],
    [["pickupLocation", "pickupAddress", "pickupContactPerson", "pickupMobile"], { name: "pickupLocation", address: "pickupAddress", contact: "pickupContactPerson", mobile: "pickupMobile" }],
    [["pickupAddress", "pickupLocation", "pickupContactPerson", "pickupMobile"], { name: "pickupLocation", address: "pickupAddress", contact: "pickupContactPerson", mobile: "pickupMobile" }],
    [["deliveryLocation", "deliveryAddress", "deliveryContactPerson", "deliveryMobile"], { name: "deliveryLocation", address: "deliveryAddress", contact: "deliveryContactPerson", mobile: "deliveryMobile" }],
    [["deliveryAddress", "deliveryLocation", "deliveryContactPerson", "deliveryMobile"], { name: "deliveryLocation", address: "deliveryAddress", contact: "deliveryContactPerson", mobile: "deliveryMobile" }],
    [["billTo1", "billingParty1Address", "billingParty1ContactPerson", "billingParty1Mobile", "billingParty1Email", "billingParty1CreditTerms"], null]
  ].forEach(([fieldNames, fields]) => {
    fieldNames.forEach((fieldName) => {
      const field = dialogBody.querySelector(`[name='${fieldName}']`);
      if (fieldNames[0] === "billTo1") {
        field?.addEventListener("input", () => fillBillingPartyOnly(field));
        field?.addEventListener("change", () => fillBillingPartyOnly(field));
        return;
      }
      if (fieldName !== fieldNames[0]) return;
      field?.addEventListener("input", () => fillCustomerSection(field, fields));
      field?.addEventListener("change", () => fillCustomerSection(field, fields, true));
    });
  });
}

function customerDialogSnapshot() {
  return {
    name: dialogValue("customer"),
    code: dialogValue("customerCode"),
    address: dialogValue("customerAddress") || customerAddressFor(dialogValue("customer"), dialogValue("customerCode")),
    contact: dialogValue("customerContactPerson"),
    mobile: dialogValue("customerMobile"),
    email: dialogValue("customerEmail"),
    country: ""
  };
}

function deliveryDialogSnapshot() {
  return {
    name: dialogValue("deliveryLocation"),
    address: dialogValue("deliveryAddress"),
    contact: dialogValue("deliveryContactPerson"),
    mobile: dialogValue("deliveryMobile"),
    email: ""
  };
}

function customerAddressFor(name, code) {
  const lookup = [name, code].map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  const customer = state.customers.find((row) => lookup.includes(String(row.name || "").trim().toLowerCase()) || lookup.includes(String(row.code || "").trim().toLowerCase()));
  return customer?.fullAddress || customer?.locationOrLane || "";
}

function bindShipmentCopySections() {
  const mappings = [
    ["copyCustomerToShipper", customerDialogSnapshot, { shipperName: "name", shipperAddress: "address", shipperContactPerson: "contact", shipperMobile: "mobile", shipperEmail: "email", shipperCountry: "country" }],
    ["copyCustomerToConsignee", customerDialogSnapshot, { consigneeName: "name", consigneeAddress: "address", consigneeContactPerson: "contact", consigneeMobile: "mobile", consigneeEmail: "email", consigneeCountry: "country" }],
    ["copyCustomerToPickup", customerDialogSnapshot, { pickupLocation: "name", pickupAddress: "address", pickupContactPerson: "contact", pickupMobile: "mobile" }],
    ["copyCustomerToBilling1", customerDialogSnapshot, { billTo1: "name", billingParty1Address: "address", billingParty1ContactPerson: "contact", billingParty1Mobile: "mobile", billingParty1Email: "email" }],
    ["copyDeliveryToNotify", deliveryDialogSnapshot, { notifyPartyName: "name", notifyPartyAddress: "address", notifyContactPerson: "contact", notifyMobile: "mobile", notifyEmail: "email" }],
    ["copyDeliveryToBilling2", deliveryDialogSnapshot, { billTo2: "name", billingParty2Address: "address", billingParty2ContactPerson: "contact", billingParty2Mobile: "mobile", billingParty2Email: "email" }]
  ];

  mappings.forEach(([checkboxName, sourceFactory, fieldMap]) => {
    const checkboxField = dialogBody.querySelector(`input[name='${checkboxName}']`);
    if (!checkboxField) return;
    const copy = () => {
      if (!checkboxField.checked) return;
      const source = sourceFactory();
      Object.entries(fieldMap).forEach(([target, sourceKey]) => setDialogValue(target, source[sourceKey]));
    };
    checkboxField.addEventListener("change", copy);
    ["customer", "customerCode", "customerContactPerson", "customerMobile", "customerEmail", "customerAddress", "deliveryLocation", "deliveryAddress", "deliveryContactPerson", "deliveryMobile"].forEach((name) => {
      dialogBody.querySelector(`[name='${name}']`)?.addEventListener("input", copy);
    });
    copy();
  });
}

function bindTransporterAutofill() {
  const transporterField = dialogBody.querySelector("input[name='transporter']");
  const codeField = dialogBody.querySelector("input[name='transporterCode']");
  if (!transporterField && !codeField) return;
  const fill = (field) => {
    const value = String(field?.value || "").trim().toLowerCase();
    if (!value) return;
    const supplier = state.suppliers.find((row) => String(row.name || "").trim().toLowerCase() === value || String(row.code || "").trim().toLowerCase() === value);
    if (!supplier) return;
    setDialogValue("transporter", supplier.name);
    setDialogValue("transporterCode", supplier.code);
  };
  transporterField?.addEventListener("input", () => fill(transporterField));
  transporterField?.addEventListener("change", () => fill(transporterField));
  codeField?.addEventListener("input", () => fill(codeField));
  codeField?.addEventListener("change", () => fill(codeField));
}

function bindTariffFinancialAutofill() {
  const tariffField = dialogBody.querySelector("input[name='tariffNo']");
  if (!tariffField) return;
  const chargeableField = dialogBody.querySelector("input[name='chargeableKg'], input[name='chargeableWeight']");
  const fill = () => {
    const tariff = state.tariffs.find((row) => String(row.tariffNo || "").trim().toLowerCase() === String(tariffField.value || "").trim().toLowerCase());
    if (!tariff) return;
    const pricing = tariffPricingForWeight(tariff, Number(chargeableField?.value || 0));
    setDialogValue("currency", tariff.currency || dialogValue("currency"));
    setDialogValue("freightAmount", pricing.freight || pricing.rate || tariff.rate || tariff.minimumCharge || 0);
    setDialogValue("otherChargesAmount", tariff.additionalChargesTotal || 0);
    setDialogValue("totalAmount", pricing.revenue || Number((Number(pricing.freight || tariff.rate || tariff.minimumCharge || 0) + Number(tariff.additionalChargesTotal || 0)).toFixed(3)));
  };
  tariffField.addEventListener("input", fill);
  tariffField.addEventListener("change", fill);
  chargeableField?.addEventListener("input", fill);
  chargeableField?.addEventListener("change", fill);
  fill();
}

function dialogValue(name) {
  return dialogBody.querySelector(`[name='${CSS.escape(name)}']`)?.value || "";
}

function setDialogValue(name, value) {
  const field = dialogBody.querySelector(`[name='${CSS.escape(name)}']`);
  if (field && value !== undefined && value !== null && value !== "") field.value = value;
}

function bindVolumeCalculator() {
  const categoryField = dialogBody.querySelector("[name='volumeCategory']");
  const divisorField = dialogBody.querySelector("[name='chargeableDivisor']");
  const cbmField = dialogBody.querySelector("[name='cbm']");
  const chargeableField = dialogBody.querySelector("[name='chargeableKg']");
  const actualWeightField = dialogBody.querySelector("[name='actualKg']");
  if (!categoryField || !divisorField || !cbmField || !chargeableField) return;

  const syncDivisor = () => {
    if (isSameAsGrossWeightCategory(categoryField.value)) {
      divisorField.value = "";
      divisorField.readOnly = true;
      syncChargeable();
      return;
    }
    const divisor = volumeDivisorFor(categoryField.value);
    if (divisor) {
      divisorField.value = String(divisor);
      divisorField.readOnly = true;
    } else {
      divisorField.readOnly = false;
      if (!Number(divisorField.value || 0)) divisorField.value = "";
    }
    syncChargeable();
  };

  const syncChargeable = () => {
    if (isSameAsGrossWeightCategory(categoryField.value)) {
      chargeableField.value = String(roundUpToWholeKg(actualWeightField?.value || 0));
      return;
    }
    const divisor = Number(divisorField.value || 0);
    const gross = Number(actualWeightField?.value || 0);
    const cbm = Number(cbmField.value || 0);
    const volumeWeight = cbm * divisor;
    if (divisor > 0 && cbm >= 0) {
      chargeableField.value = String(roundUpToWholeKg(Math.max(gross, volumeWeight)));
    }
  };

  categoryField.addEventListener("change", syncDivisor);
  cbmField.addEventListener("input", syncChargeable);
  divisorField.addEventListener("input", syncChargeable);
  actualWeightField?.addEventListener("input", syncChargeable);
  syncDivisor();
}

function bindPalletDimensionBuilder() {
  const builder = dialogBody.querySelector("[data-pallet-builder]");
  const hiddenField = dialogBody.querySelector("input[name='cargoItemsJson']") || dialogBody.querySelector("input[name='palletDimensionsJson']");
  const legacyPalletField = dialogBody.querySelector("input[name='palletDimensionsJson']");
  const cbmField = dialogBody.querySelector("input[name='cbm']");
  const chargeableField = dialogBody.querySelector("input[name='chargeableKg']");
  const piecesField = dialogBody.querySelector("input[name='pieces']");
  const actualWeightField = dialogBody.querySelector("input[name='actualKg']");
  const manualChargeableField = dialogBody.querySelector("input[name='manualChargeableKg']");
  const shipmentRemarksField = dialogBody.querySelector("[name='shipmentRemarks']");
  const deliveryNoteField = dialogBody.querySelector("input[name='deliveryNoteNo']");
  const tcnField = dialogBody.querySelector("input[name='tcnNumber']");
  const airwayBillField = dialogBody.querySelector("input[name='airwayBillNo']");
  if (!builder || !hiddenField) return;

  const fields = {
    packageType: dialogBody.querySelector("[name='palletPackageType']"),
    count: dialogBody.querySelector("input[name='palletCount']"),
    length: dialogBody.querySelector("input[name='palletLength']"),
    width: dialogBody.querySelector("input[name='palletWidth']"),
    height: dialogBody.querySelector("input[name='palletHeight']"),
    dimensionUnit: dialogBody.querySelector("[name='palletDimensionUnit']"),
    weight: dialogBody.querySelector("input[name='palletWeight']"),
    totalWeight: dialogBody.querySelector("input[name='palletTotalWeight']")
  };
  const list = builder.querySelector("[data-pallet-lines-list]");
  const liveSummary = builder.querySelector("[data-cargo-live-summary]");
  const lines = parsePalletDimensions(hiddenField.value || "[]");
  let autoGeneratedShipmentRemark = "";
  let manualGrossTouched = false;
  let editingLineIndex = -1;

  const liveCalculation = () => {
    const count = Number(fields.count?.value || 0);
    const length = Number(fields.length?.value || 0);
    const width = Number(fields.width?.value || 0);
    const height = Number(fields.height?.value || 0);
    const weight = Number(fields.weight?.value || 0);
    const computedTotalWeight = weight * count;
    const manualTotalWeight = Number(fields.totalWeight?.value || 0);
    const totalWeight = manualGrossTouched ? manualTotalWeight : computedTotalWeight;
    const totalWeightKg = totalWeight;
    const cbm = cargoVolumeCbm(count, length, width, height, fields.dimensionUnit?.value || "CM");
    const volumeCategory = dialogBody.querySelector("[name='volumeCategory']")?.value;
    const volumeWeight = cargoVolumetricWeight(count, length, width, height, fields.dimensionUnit?.value || "CM", volumeCategory);
    const chargeable = isSameAsGrossWeightCategory(volumeCategory) ? totalWeightKg : Math.max(totalWeightKg, volumeWeight);
    if (fields.totalWeight && !manualGrossTouched) fields.totalWeight.value = String(Number(computedTotalWeight.toFixed(3)));
    if (liveSummary) {
      liveSummary.innerHTML = `
        <span>Pieces: ${escapeHtml(count || 0)}</span>
        <span>CBM: ${money(cbm)}</span>
        <span>Total Gross Weight: ${money(totalWeightKg)}</span>
      `;
    }
  };

  const currentShipmentData = () => collectFormValues(dialogBody.closest("form"));

  const printPod = () => {
    const data = currentShipmentData();
    const deliveryNo = data.deliveryNoteNo || nextDeliveryNoteNumber();
    const deliveryDatetime = data.deliveryDatetime || (data.deliveryDate ? `${data.deliveryDate}${data.deliveryTime ? `T${data.deliveryTime}` : ""}` : "");
    if (deliveryNoteField) deliveryNoteField.value = deliveryNo;
    // The main shipment form has no Delivery Remarks/POC/Prepared-Delivered-Received-By fields of
    // its own (only a hidden Delivery Note No), so this button used to print an almost-empty POD.
    // Apply the exact same field derivation the dedicated POD panel uses (podShipmentFields), so a
    // POD generated from either place captures the same delivery information the same way.
    openPrintableDocument(podDocumentHtml({
      ...data,
      deliveryNoteNo: deliveryNo,
      deliveryDatetime: deliveryDatetime || today(),
      deliveryRemarks: data.deliveryRemarks || [data.deliveryLocation, data.deliveryAddress].filter((part) => String(part || "").trim()).join(" - "),
      pocName: data.pocName || data.deliveryContactPerson || "",
      pocMobile: data.pocMobile || data.deliveryMobile || "",
      preparedBy: data.preparedBy || currentUserName(),
      deliveredBy: podDeliveredByValue(data),
      receivedBy: data.receivedBy || ""
    }));
  };

  const printTcn = (persistNumber = true) => {
    const data = currentShipmentData();
    const savedShipment = state.shipments.some((shipmentItem) => shipmentItem.jobNo === data.jobNo);
    if (!savedShipment) {
      notifyDenied("Save shipment first", "Save or create this shipment or airway bill before generating a TCN.");
      return;
    }
    const tcn = data.tcnNumber || data.airwayBillNo || nextTcnNumber();
    if (persistNumber) {
      if (tcnField) tcnField.value = tcn;
      if (airwayBillField) airwayBillField.value = tcn;
    }
    openPrintableDocument(tcnDocumentHtml({ ...data, airwayBillNo: tcn, tcnNumber: tcn, palletDimensionsJson: hiddenField.value }));
  };

  const duplicateTcn = () => {
    const data = currentShipmentData();
    const savedShipment = state.shipments.some((shipmentItem) => shipmentItem.jobNo === data.jobNo);
    if (!savedShipment) {
      notifyDenied("Save shipment first", "Save or create this shipment before duplicating a TCN.");
      return;
    }
    const companyName = "ALT EXPRESS CARGO AND CLEARING LLC";
    const logoUrl = "/assets/alt-express-logo.png";
    const tcn = data.tcnNumber || data.airwayBillNo || data.jobNo;
    openPrintableDocument(duplicateTcnDocumentHtml({ ...data, airwayBillNo: tcn, tcnNumber: tcn, palletDimensionsJson: hiddenField.value, documentCompanyName: companyName.trim(), documentCompanyLogoUrl: logoUrl.trim() }));
  };

  const sync = () => {
    const totalPieces = lines.reduce((sum, line) => sum + Number(line.count || line.quantity || 0), 0);
    const actualWeight = lines.reduce((sum, line) => sum + Number(line.weightKg || line.weight || 0), 0);
    const total = lines.reduce((sum, line) => sum + Number(line.total || line.volumeWeight || 0), 0);
    const volumeCategory = dialogBody.querySelector("[name='volumeCategory']")?.value;
    const roundedTotal = roundUpToHalf(total);
    const totalVolumetricWeight = isSameAsGrossWeightCategory(volumeCategory)
      ? actualWeight
      : Number((roundedTotal * volumeDivisorFor(volumeCategory)).toFixed(3));
    hiddenField.value = JSON.stringify(lines);
    if (legacyPalletField) legacyPalletField.value = hiddenField.value;
    if (piecesField) piecesField.value = String(totalPieces || Number(piecesField.value || 0));
    if (actualWeightField) actualWeightField.value = String(Number(actualWeight.toFixed(3)));
    if (cbmField) {
      cbmField.value = String(roundedTotal);
      cbmField.dataset.volumeWeight = String(totalVolumetricWeight);
    }
    const volumeWeight = isSameAsGrossWeightCategory(volumeCategory) ? actualWeight : totalVolumetricWeight;
    const chargeableWeight = Math.max(actualWeight, volumeWeight);
    if (chargeableField && !chargeableField.dataset.manualChargeable) chargeableField.value = String(roundUpToWholeKg(chargeableWeight));
    if (manualChargeableField && !chargeableField?.dataset.manualChargeable) manualChargeableField.value = String(roundUpToWholeKg(chargeableWeight));
    const cargoRemark = lines
      .map((line) => ({
        packageType: String(line.packageType || "Package").trim() || "Package",
        quantity: Number(line.count || line.quantity || 0)
      }))
      .filter((line) => line.quantity > 0)
      .map((line) => `${line.quantity} ${line.packageType}`)
      .join(" ");
    const packageTypeCount = new Set(lines
      .filter((line) => Number(line.count || line.quantity || 0) > 0)
      .map((line) => String(line.packageType || "Package").trim().toLowerCase()))
      .size;
    const cargoRemarkWithTotal = packageTypeCount > 1 && cargoRemark ? `${cargoRemark} Total ${totalPieces}` : "";
    if (shipmentRemarksField && (!shipmentRemarksField.value.trim() || shipmentRemarksField.value === autoGeneratedShipmentRemark)) {
      shipmentRemarksField.value = cargoRemarkWithTotal;
      autoGeneratedShipmentRemark = cargoRemarkWithTotal;
    }
    list.innerHTML = palletDimensionTable(lines, total, roundedTotal, volumeCategory);
  };

  builder.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-dialog-action='add-pallet-line']");
    if (addButton) {
      const count = Number(fields.count?.value || 0);
      const length = Number(fields.length?.value || 0);
      const width = Number(fields.width?.value || 0);
      const height = Number(fields.height?.value || 0);
      if (count <= 0 || length <= 0 || width <= 0 || height <= 0) {
        notifyDenied("Pallet line not added", "Enter pallet count, length, width, and height.");
        return;
      }
      const dimensionUnit = fields.dimensionUnit?.value || "CM";
      const weight = Number(fields.weight?.value || 0);
      const total = cargoVolumeCbm(count, length, width, height, dimensionUnit);
      const totalWeight = manualGrossTouched ? Number(fields.totalWeight?.value || 0) : weight * count;
      const weightKg = totalWeight;
      const volumetricWeight = cargoVolumetricWeight(count, length, width, height, dimensionUnit, dialogBody.querySelector("[name='volumeCategory']")?.value);
      const line = {
        packageType: fields.packageType?.value || "Pallet",
        count,
        quantity: count,
        length,
        width,
        height,
        dimensionUnit,
        weight,
        weightUnit: "KG",
        totalWeight,
        weightKg,
        volumetricWeight,
        volumeWeight: total,
        total,
        remarks: ""
      };
      if (editingLineIndex >= 0) {
        lines.splice(editingLineIndex, 1, line);
        editingLineIndex = -1;
      } else {
        lines.push(line);
      }
      manualGrossTouched = false;
      sync();
      return;
    }

    const removeButton = event.target.closest("[data-remove-pallet-line]");
    if (removeButton) {
      lines.splice(Number(removeButton.dataset.removePalletLine), 1);
      sync();
      return;
    }

    const duplicateButton = event.target.closest("[data-duplicate-pallet-line]");
    if (duplicateButton) {
      const sourceIndex = Number(duplicateButton.dataset.duplicatePalletLine);
      const source = lines[sourceIndex];
      if (!source) return;
      lines.splice(sourceIndex + 1, 0, { ...source });
      sync();
      return;
    }

    const editButton = event.target.closest("[data-edit-pallet-line]");
    if (editButton) {
      editingLineIndex = Number(editButton.dataset.editPalletLine);
      const line = lines[editingLineIndex];
      if (!line) return;
      if (fields.packageType) fields.packageType.value = line.packageType || "Pallet";
      if (fields.count) fields.count.value = line.count || line.quantity || 1;
      if (fields.length) fields.length.value = line.length || 0;
      if (fields.width) fields.width.value = line.width || 0;
      if (fields.height) fields.height.value = line.height || 0;
      if (fields.dimensionUnit) fields.dimensionUnit.value = line.dimensionUnit || "CM";
      if (fields.weight) fields.weight.value = line.weight || 0;
      if (fields.totalWeight) fields.totalWeight.value = line.weightKg || line.totalWeight || 0;
      manualGrossTouched = true;
      liveCalculation();
    }
  });

  dialogBody.querySelector("[data-dialog-action='generate-pod']")?.addEventListener("click", printPod);
  dialogBody.querySelector("[data-dialog-action='save-draft']")?.addEventListener("click", () => createShipmentDraft(currentShipmentData()));
  dialogBody.querySelector("[data-dialog-action='create-shipment']")?.addEventListener("click", () => dialogSave.click());
  dialogBody.querySelector("[data-dialog-action='generate-tcn']")?.addEventListener("click", () => printTcn(true));
  dialogBody.querySelector("[data-dialog-action='view-tcn']")?.addEventListener("click", () => printTcn(false));
  dialogBody.querySelector("[data-dialog-action='duplicate-tcn']")?.addEventListener("click", duplicateTcn);
  const shipmentDocumentUpload = dialogBody.querySelector("input[name='shipmentDocumentUpload']");
  const shipmentDocumentName = dialogBody.querySelector("[data-shipment-document-name]");
  dialogBody.querySelector("[data-dialog-action='upload-shipment-document']")?.addEventListener("click", () => shipmentDocumentUpload?.click());
  shipmentDocumentUpload?.addEventListener("change", () => {
    shipmentDocumentName.textContent = shipmentDocumentUpload.files?.[0]?.name || "";
  });

  dialogBody.querySelector("[name='volumeCategory']")?.addEventListener("change", sync);
  chargeableField?.addEventListener("input", () => {
    const roundedChargeableWeight = roundUpToWholeKg(chargeableField.value);
    chargeableField.value = String(roundedChargeableWeight);
    chargeableField.dataset.manualChargeable = "1";
    if (manualChargeableField) manualChargeableField.value = String(roundedChargeableWeight);
  });
  fields.totalWeight?.addEventListener("input", () => {
    manualGrossTouched = true;
    liveCalculation();
  });
  fields.weight?.addEventListener("input", () => {
    manualGrossTouched = false;
  });
  fields.count?.addEventListener("input", () => {
    if (Number(fields.weight?.value || 0) > 0) manualGrossTouched = false;
  });
  Object.values(fields).forEach((field) => field?.addEventListener("input", liveCalculation));
  Object.values(fields).forEach((field) => field?.addEventListener("change", liveCalculation));
  liveCalculation();
  sync();
}

function cargoVolumeCbm(count, length, width, height, unit = "CM") {
  const divisor = unit === "M" ? 1 : unit === "INCH" ? 61023.7441 : 1000000;
  return Number((count * length * width * height / divisor).toFixed(3));
}

function cargoVolumetricWeight(count, length, width, height, unit = "CM", category = "") {
  const factor = volumeDivisorFor(category);
  if (!factor) return 0;
  return Number((cargoVolumeCbm(count, length, width, height, unit) * factor).toFixed(3));
}

function palletDimensionTable(lines, total, roundedTotal, volumeCategory = "") {
  const rows = lines.length
    ? lines.map((line, index) => `<tr>
      <td>${index + 1}</td><td>${escapeHtml(line.packageType || "Pallet")}</td><td>${line.count || line.quantity}</td><td>${line.length}</td><td>${line.width}</td><td>${line.height}</td><td>${escapeHtml(line.dimensionUnit || "CM")}</td><td>${money(line.weightKg || line.totalWeight || 0)}</td><td>${money(cargoVolumetricWeight(line.count || line.quantity, line.length, line.width, line.height, line.dimensionUnit || "CM", volumeCategory))}</td>
      <td><button type="button" class="ghost-button" data-remove-pallet-line="${index}">Remove</button><button type="button" class="ghost-button" data-edit-pallet-line="${index}">Edit</button><button type="button" class="ghost-button" data-duplicate-pallet-line="${index}">Duplicate</button></td>
    </tr>`).join("")
    : `<tr><td colspan="10" class="empty-state">No cargo items added.</td></tr>`;
  return `<div class="table-wrap"><table class="tariff-charges-table pallet-dimensions-table">
    <colgroup>
      <col class="pallet-col-sr" />
      <col class="pallet-col-count" />
      <col class="pallet-col-count" />
      <col class="pallet-col-measure" />
      <col class="pallet-col-measure" />
      <col class="pallet-col-measure" />
      <col class="pallet-col-measure" />
      <col class="pallet-col-total" />
      <col class="pallet-col-total" />
      <col class="pallet-col-button" />
    </colgroup>
    <thead><tr><th>Sr no</th><th>Package Type</th><th>Qty</th><th>Length</th><th>Width</th><th>Height</th><th>Unit</th><th>Weight KG</th><th>Volume Weight</th><th>Button</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th colspan="8">Grand total CBM</th><th>${roundedTotal}</th><th></th></tr></tfoot>
  </table></div>`;
}

function tariffAdditionalChargesBuilder(initialValue = "[]") {
  return `<section class="tariff-charge-builder" data-tariff-charge-builder>
    <input type="hidden" name="additionalChargesJson" value="${escapeHtml(initialValue)}" />
    <input type="hidden" name="additionalChargesTotal" value="0" />
    <input type="hidden" name="grandTotal" value="0" />
    <div class="tariff-charge-entry">
      ${input("tariffChargeDescription", "Additional Charge Description", "")}
      ${input("tariffChargeQuotation", "Quotation Per Unit", "0.000", false, "number")}
      ${input("tariffChargeUnits", "Units", "1", false, "number")}
      <button type="button" class="secondary-button" data-dialog-action="add-tariff-charge">Add More</button>
    </div>
    <div class="tariff-charge-table" data-tariff-charge-list></div>
  </section>`;
}

function bindTariffAdditionalCharges(initialValue = "[]") {
  const builder = dialogBody.querySelector("[data-tariff-charge-builder]");
  if (!builder) return;
  const hiddenField = builder.querySelector("input[name='additionalChargesJson']");
  const totalField = builder.querySelector("input[name='additionalChargesTotal']");
  const grandField = builder.querySelector("input[name='grandTotal']");
  const minChargeField = dialogBody.querySelector("input[name='minCharge']");
  const descriptionField = builder.querySelector("input[name='tariffChargeDescription']");
  const quotationField = builder.querySelector("input[name='tariffChargeQuotation']");
  const unitsField = builder.querySelector("input[name='tariffChargeUnits']");
  const list = builder.querySelector("[data-tariff-charge-list]");
  let lines = parseTariffChargeLines(initialValue || hiddenField.value);

  const sync = () => {
    const total = lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
    const grandTotal = Number(minChargeField?.value || 0) + total;
    hiddenField.value = JSON.stringify(lines);
    totalField.value = String(total);
    grandField.value = String(grandTotal);
    list.innerHTML = tariffChargeTable(lines, total, grandTotal);
  };

  builder.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-dialog-action='add-tariff-charge']");
    if (addButton) {
      const description = descriptionField.value.trim();
      const quotation = Number(quotationField.value || 0);
      const units = Number(unitsField.value || 0);
      if (!description || quotation <= 0 || units <= 0) {
        notifyDenied("Line not added", "Enter description, quotation, and units.");
        return;
      }
      lines.push({ description, quotation, units, total: quotation * units });
      descriptionField.value = "";
      quotationField.value = "0.000";
      unitsField.value = "1";
      sync();
      return;
    }

    const removeButton = event.target.closest("[data-remove-tariff-charge]");
    if (removeButton) {
      lines.splice(Number(removeButton.dataset.removeTariffCharge), 1);
      sync();
    }
  });

  minChargeField?.addEventListener("input", sync);
  sync();
}

function parseTariffChargeLines(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.map((line, index) => ({
          description: line.description || "",
          quotation: Number(line.quotation || 0),
          units: Number(line.units || 0),
          total: Number(line.total || Number(line.quotation || 0) * Number(line.units || 0)),
          srNo: index + 1
        })).filter((line) => line.description)
      : [];
  } catch {
    return [];
  }
}

function tariffChargeTable(lines, total, grandTotal, showActions = true, options = {}) {
  const actionHeader = showActions ? "<th>Button</th>" : "";
  const footerAction = showActions ? "<th></th>" : "";
  const emptyColspan = showActions ? 6 : 5;
  const showTotalRow = options.showTotalRow !== false;
  const rows = lines.length
    ? lines.map((line, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(line.description)}</td>
        <td>${money(line.quotation)}</td>
        <td>${escapeHtml(line.units)}</td>
        <td>${money(line.total)}</td>
        ${showActions ? `<td><button type="button" class="ghost-button" data-remove-tariff-charge="${index}">Remove</button></td>` : ""}
      </tr>`).join("")
    : `<tr><td colspan="${emptyColspan}" class="empty-state">No charges added.</td></tr>`;
  return `<div class="table-wrap"><table class="tariff-charges-table">
    <thead><tr><th>Sr no</th><th>Description</th><th>Quotation per unit</th><th>Units</th><th>Total</th>${actionHeader}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      ${showTotalRow ? `<tr><th colspan="4">Total</th><th>${money(total)}</th>${footerAction}</tr>` : ""}
      <tr><th colspan="4">Grand total</th><th>${money(grandTotal)}</th>${footerAction}</tr>
    </tfoot>
  </table></div>`;
}

function normalizeLookupText(value) {
  return String(value || '').trim().toLowerCase();
}

function invoiceCustomerOptions() {
  const options = [];
  const seen = new Set();
  const addOption = (value, label) => {
    const key = normalizeLookupText(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({ value, label: label || value });
  };

  visibleRows(state.customers).forEach((row) => {
    addOption(row.name || row.customerName || '', [row.code, row.name || row.customerName || ''].filter(Boolean).join(' | '));
  });
  visibleRows(state.shipments).forEach((row) => {
    addOption(row.customer || row.customerName || row.consigneeName || row.billTo1 || '', [row.jobNo, row.customerCode, row.origin, row.destination].filter(Boolean).join(' | '));
  });

  return options;
}

function invoiceShipmentOptionsForCustomer(customerName) {
  return invoiceShipmentsForCustomer(customerName).map((row) => ({
    value: row.jobNo,
    label: row.jobNo + ' | ' + (row.customer || row.customerName || row.billTo1 || '') + ' | ' + (row.origin || '') + ' to ' + (row.destination || '')
  }));
}

function invoiceTariffOptionsForCustomer(customerName) {
  return invoiceTariffsForCustomer(customerName).map((row) => ({
    value: row.tariffNo,
    label: row.tariffNo + ' | ' + (row.customer || '') + ' | ' + (row.origin || '') + ' to ' + (row.destination || '')
  }));
}

function invoiceTariffsForCustomer(customerName) {
  const lookup = normalizeLookupText(customerName);
  if (!lookup) return [];
  return state.tariffs.filter((row) => normalizeLookupText(row.customer || '') === lookup);
}

function invoiceShipmentsForCustomer(customerName) {
  const lookup = normalizeLookupText(customerName);
  if (!lookup) return [];
  // Billing intentionally allows ALL shipments regardless of status - invoicing normally happens
  // after delivery, so Delivered shipments must stay selectable here (unlike the Manifest/POD
  // pickers, which do exclude Delivered shipments).
  return state.shipments.filter((row) => {
    const rowCustomer = normalizeLookupText(row.customer || row.customerName || row.billTo1 || '');
    return rowCustomer === lookup;
  });
}

function parseInvoiceLineItems(value) {
  try {
    var parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed)
      ? parsed.map((line, index) => ({
          id: line.id || 'invoice-line-' + (index + 1),
          source: line.source || 'manual',
          description: line.description || '',
          unit: line.unit || 'Unit',
          qty: Number(line.qty || 0),
          rate: Number(line.rate || 0),
          amount: Number(line.amount || line.total || 0),
          cost: Number(line.cost || 0),
          remarks: line.remarks || '',
          tariffNo: line.tariffNo || '',
          tariffName: line.tariffName || '',
          chargeableWeight: Number(line.chargeableWeight || 0)
        }))
      : [];
  } catch {
    return [];
  }
}

function invoiceLineAmount(line) {
  var qty = Number(line?.qty || 0);
  var rate = Number(line?.rate || 0);
  var amount = Number(line?.amount || 0);
  return amount || qty * rate;
}

function invoiceTotals(lines, taxPercent) {
  var revenue = lines.reduce((sum, line) => sum + invoiceLineAmount(line), 0);
  var cost = lines.reduce((sum, line) => sum + Number(line?.cost || 0), 0);
  var taxAmount = revenue * (Number(taxPercent || 0) / 100);
  var grandTotal = revenue + taxAmount;
  var grossProfit = revenue - cost;
  var profitPercent = revenue ? (grossProfit / revenue) * 100 : 0;
  return {
    revenue: Number(revenue.toFixed(3)),
    cost: Number(cost.toFixed(3)),
    taxAmount: Number(taxAmount.toFixed(3)),
    grandTotal: Number(grandTotal.toFixed(3)),
    grossProfit: Number(grossProfit.toFixed(3)),
    profitPercent: Number(profitPercent.toFixed(2))
  };
}

function effectiveChargeableWeightForShipment(shipmentItem) {
  const manual = Number(shipmentItem?.manualChargeableKg || 0);
  if (manual > 0) return roundUpToWholeKg(manual);
  const actual = Number(shipmentItem?.actualKg || 0);
  const cbm = Number(shipmentItem?.cbm || 0);
  const divisor = Number(shipmentItem?.chargeableDivisor || volumeDivisorFor(shipmentItem?.volumeCategory || '') || 0);
  const volumetric = divisor > 0 && cbm > 0 ? Number((cbm * divisor).toFixed(3)) : 0;
  const calculated = Math.max(actual, volumetric);
  if (calculated > 0) return roundUpToWholeKg(calculated);
  return Number(shipmentItem?.chargeableKg || 0);
}

function invoiceLinesFromTariff(shipmentItem, tariffItem, chargeableWeight = effectiveChargeableWeightForShipment(shipmentItem)) {
  if (!tariffItem) return [];
  const pricing = tariffPricingForWeight(tariffItem, chargeableWeight);
  const weightLabel = pricing.band?.label ? " (" + pricing.band.label + ")" : "";
  const lines = [{
    id: "tariff-base",
    source: "tariff-base",
    description: "Freight Charge" + weightLabel,
    unit: "KG",
    qty: chargeableWeight || 1,
    rate: pricing.rate,
    amount: pricing.freight,
    cost: Number(tariffItem.supplierCost || 0),
    remarks: pricing.band?.label || "",
    chargeableWeight,
    tariffNo: tariffItem.tariffNo || "",
    tariffName: tariffItem.customer || ""
  }];
  const extras = parseTariffChargeLines(tariffItem.additionalChargesJson || "[]").map((line, index) => ({
    id: "tariff-extra-" + (index + 1),
    source: "tariff-extra",
    description: line.description || "",
    unit: "Unit",
    qty: Number(line.units || 1),
    rate: Number(line.quotation || 0),
    amount: Number(line.total || Number(line.quotation || 0) * Number(line.units || 0)),
    cost: Number(line.cost || 0),
    remarks: String(line.remarks || ""),
    chargeableWeight,
    tariffNo: tariffItem.tariffNo || "",
    tariffName: tariffItem.customer || ""
  }));
  return lines.concat(extras);
}

function invoiceSnapshotFromSelection(shipmentItem, tariffItem, lines, taxPercent, currency = "KD") {
  var summary = invoiceTotals(lines, taxPercent);
  return {
    customerCode: shipmentItem?.customerCode || '',
    customerName: shipmentItem?.customer || '',
    shipmentNo: shipmentItem?.jobNo || '',
    tariffNo: tariffItem?.tariffNo || '',
    tariffName: tariffItem?.customer || '',
    chargeableWeight: effectiveChargeableWeightForShipment(shipmentItem),
    grossWeight: Number(shipmentItem?.actualKg || 0),
    volumeWeight: Number(shipmentItem?.cbm || 0),
    currency: String(currency || shipmentItem?.currency || "KD").trim(),
    lines: lines,
    taxPercent: Number(taxPercent || 0),
    revenue: summary.revenue,
    cost: summary.cost,
    taxAmount: summary.taxAmount,
    grandTotal: summary.grandTotal,
    grossProfit: summary.grossProfit,
    profitPercent: summary.profitPercent
  };
}

function invoiceLineTable(lines, canEditCost) {
  const showSales = canBillingSalesEntry();
  const showCost = canBillingCostEntry();
  const editable = showSales || showCost;
  var rows = lines.length ? lines.map((line, index) => {
    return '<tr data-invoice-line-row="' + index + '">' +
      '<td>' + (index + 1) + '</td>' +
      '<td><input data-invoice-line-field="description" data-line-index="' + index + '" value="' + escapeHtml(line.description || '') + '" /></td>' +
      '<td><input data-invoice-line-field="unit" data-line-index="' + index + '" value="' + escapeHtml(line.unit || '') + '" /></td>' +
      '<td><input data-invoice-line-field="qty" data-line-index="' + index + '" type="number" step="0.001" value="' + escapeHtml(line.qty ?? 0) + '" /></td>' +
      (showSales ? '<td><input data-invoice-line-field="rate" data-line-index="' + index + '" type="number" step="0.001" value="' + escapeHtml(line.rate ?? 0) + '" /></td>' : '') +
      (showSales ? '<td><input data-invoice-line-field="amount" data-line-index="' + index + '" type="number" step="0.001" value="' + escapeHtml(invoiceLineAmount(line)) + '" /></td>' : '') +
      (showCost ? '<td><input data-invoice-line-field="cost" data-line-index="' + index + '" type="number" step="0.001" ' + (canEditCost ? '' : 'readonly') + ' value="' + escapeHtml(line.cost ?? 0) + '" /></td>' : '') +
      '<td><input data-invoice-line-field="remarks" data-line-index="' + index + '" value="' + escapeHtml(line.remarks || '') + '" /></td>' +
      '<td>' + (editable ? '<button type="button" class="ghost-button" data-remove-invoice-line="' + index + '">Remove</button>' : '') + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="' + (6 + (showSales ? 2 : 0) + (showCost ? 1 : 0)) + '" class="empty-state">No tariff lines loaded yet.</td></tr>';
  return '<div class="table-wrap"><table class="tariff-charges-table invoice-lines-table"><thead><tr><th>Sr no</th><th>Description</th><th>Unit</th><th>Qty</th>' + (showSales ? '<th>Rate</th><th>Amount</th>' : '') + (showCost ? '<th>Cost</th>' : '') + '<th>Remarks</th><th>Button</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function invoicePreviewSummary(summary) {
  if (!canViewBillingSummary()) return '';
  return '<section class="summary-card invoice-summary">' +
    (canBillingSalesEntry() ? '<div><span>Revenue</span><strong data-invoice-summary="revenue">' + money(summary.revenue) + '</strong></div>' : '') +
    (canBillingCostEntry() ? '<div><span>Cost</span><strong data-invoice-summary="cost">' + money(summary.cost) + '</strong></div>' : '') +
    (canBillingSalesEntry() ? '<div><span>Tax</span><strong data-invoice-summary="taxAmount">' + money(summary.taxAmount) + '</strong></div>' : '') +
    (canViewProfitMargin() && canBillingSalesEntry() && canBillingCostEntry() ? '<div><span>Gross Profit</span><strong data-invoice-summary="grossProfit">' + money(summary.grossProfit) + '</strong></div>' : '') +
    (canViewProfitMargin() && canBillingSalesEntry() && canBillingCostEntry() ? '<div><span>Profit %</span><strong data-invoice-summary="profitPercent">' + money(summary.profitPercent) + '%</strong></div>' : '') +
    (canBillingSalesEntry() ? '<div><span>Grand Total</span><strong data-invoice-summary="grandTotal">' + money(summary.grandTotal) + '</strong></div>' : '') +
  '</section>';
}

function invoicePreviewMeta(shipmentItem, tariffItem) {
  return '<div class="tariff-preview-meta">' +
    '<div><span>Shipment</span><strong>' + escapeHtml(shipmentItem?.jobNo || '') + '</strong></div>' +
    '<div><span>Customer</span><strong>' + escapeHtml(shipmentItem?.customer || '') + '</strong></div>' +
    '<div><span>Tariff</span><strong>' + escapeHtml(tariffItem?.tariffNo || '') + '</strong></div>' +
    '<div><span>Weights</span><strong>' + escapeHtml([shipmentItem?.actualKg, shipmentItem?.cbm].filter(Boolean).join(' / ')) + '</strong></div>' +
  '</div>';
}

function invoicePreviewMarkup(shipmentItem, tariffItem, lines, taxPercent, canEditCost = true) {
  const selectedWeight = shipmentItem ? effectiveChargeableWeightForShipment(shipmentItem) : null;
  var summary = invoiceTotals(lines, taxPercent);
  return '<section class="invoice-preview-shell" data-invoice-preview-ready>' +
    invoicePreviewMeta(shipmentItem, tariffItem) +
    (tariffItem ? tariffPreviewHtml([tariffItem], 'Select a tariff to view full details.', selectedWeight) : '<p class="empty-state">Select a tariff to view full details.</p>') +
    invoicePreviewSummary(summary) +
    invoiceLineTable(lines, canEditCost && canBillingCostEntry()) +
    ((canBillingSalesEntry() || canBillingCostEntry()) ? '<div class="action-row"><button type="button" class="secondary-button" data-add-invoice-line>Add Charge</button></div>' : '') +
  '</section>';
}

function tariffSelectionOptions(customerName = "") {
  const rows = customerName ? invoiceTariffsForCustomer(customerName) : visibleRows(state.tariffs);
  return rows.map((row) => ({
    value: row.tariffNo,
    label: row.tariffNo + " | " + row.customer + " | " + row.origin + " to " + row.destination
  }));
}

function tariffPreviewShell(scope) {
  return `<section class="tariff-detail-preview" data-tariff-preview="${escapeHtml(scope)}"></section>`;
}

function summaryPair(label, value) {
  return `<p><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></p>`;
}

function tariffPreviewHtml(tariffs, emptyText = "Select a tariff to view full details.", selectedWeight = null) {
  const uniqueTariffs = [];
  const seen = new Set();
  tariffs.filter(Boolean).forEach((tariffItem) => {
    const key = String(tariffItem.tariffNo || "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueTariffs.push(tariffItem);
  });
  if (!uniqueTariffs.length) return "<p class=\"empty-state\">" + escapeHtml(emptyText) + "</p>";
  return uniqueTariffs.map((tariffItem) => {
    const charges = parseTariffChargeLines(tariffItem.additionalChargesJson || "[]");
    const pricing = tariffPricingForWeight(tariffItem, selectedWeight || 0);
    const headlineTotal = selectedWeight ? pricing.revenue : Number(tariffItem.grandTotal || tariffItem.minCharge || 0);
    return "<article class=\"tariff-preview-card\">" +
      "<div class=\"tariff-preview-heading\"><div><p class=\"eyebrow\">Tariff Details</p><h3>" + escapeHtml(tariffItem.tariffNo) + "</h3></div><strong>" + escapeHtml(tariffItem.currency || "KD") + " " + money(headlineTotal) + "</strong></div>" +
      "<div class=\"tariff-preview-grid\">" +
        summaryPair("Consignee", tariffItem.customer) +
        summaryPair("Origin", tariffItem.origin) +
        summaryPair("Destination", tariffItem.destination) +
        summaryPair("Main Section", tariffItem.mainSection) +
        tariffPreviewRateSummary(tariffItem, selectedWeight || 0) +
      "</div>" +
      tariffWeightRateTableHtml(tariffItem, { selectedWeight }) +
      tariffChargeTable(charges, Number(tariffItem.additionalChargesTotal || 0), Number(tariffItem.grandTotal || 0), false) +
    "</article>";
  }).join("");
}

function updateTariffPreview(scope, tariffs, emptyText) {
  const container = dialogBody.querySelector('[data-tariff-preview="' + scope + '"]');
  if (!container) return;
  if (scope === 'invoice') {
    const invoiceLinesField = dialogBody.querySelector('input[name="invoiceLinesJson"]');
    const taxPercentField = dialogBody.querySelector('input[name="taxPercent"]');
    container.innerHTML = invoicePreviewMarkup(null, tariffs[0] || null, parseInvoiceLineItems(invoiceLinesField?.value || '[]'), Number(taxPercentField?.value || 0), true);
    return;
  }
  container.innerHTML = tariffPreviewHtml(tariffs, emptyText);
}

function bindDialogPasswordToggles() {
  dialogBody.querySelectorAll("[data-dialog-action='toggle-password']").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.closest(".password-input-wrap")?.querySelector("input");
      if (!field) return;
      const shouldShow = field.type === "password";
      field.type = shouldShow ? "text" : "password";
      button.textContent = shouldShow ? "Hide" : "View";
    });
  });
}

// Column scope for the "jobs added to this manifest" list inside the New/Edit Manifest dialog.
// Deliberately its own scope (not "shipment:register") so a user's chosen columns here don't
// fight with their Shipment Register column choices, while still using the exact same
// column-settings storage/markup the rest of the app uses - just wired locally (see below) instead
// of through the page-level render() cycle, since this list lives inside an open modal dialog and
// a full render() would reset/close it.
const MANIFEST_JOBS_COLUMN_SCOPE = "shipment:manifest-jobs";

function bindConsolidationJobPicker() {
  const picker = dialogBody.querySelector("[data-consolidation-picker]");
  if (!picker) return;

  const scope = MANIFEST_JOBS_COLUMN_SCOPE;
  const selectField = picker.querySelector("[data-consolidation-job-select]");
  const hiddenField = picker.querySelector("input[name='jobNumbers']");
  const list = picker.querySelector("[data-consolidation-jobs-list]");
  const totalsContainer = picker.querySelector("[data-consolidation-jobs-totals]");
  const columnsContainer = picker.querySelector("[data-manifest-jobs-columns]");
  const selectedJobs = new Set(
    String(hiddenField.value || "")
      .split(",")
      .map((jobNo) => jobNo.trim())
      .filter(Boolean)
  );

  const paintColumnMenu = () => {
    if (!columnsContainer) return;
    const settings = shipmentColumnSettings(scope, shipmentColumnDefaults(scope));
    columnsContainer.innerHTML = shipmentColumnSettingsMarkup(scope, "Manifest job list columns", settings);
  };

  // Totals strip shown once 2+ shipments are added - no per-shipment tariff preview here anymore
  // (that was for a single shipment's own dialog; a manifest can hold many shipments from
  // different customers/tariffs, so a per-shipment rate breakdown didn't make sense here).
  const paintTotals = (jobNumbers) => {
    if (!totalsContainer) return;
    if (jobNumbers.length <= 1) {
      totalsContainer.innerHTML = "";
      return;
    }
    const shipmentsForTotals = jobNumbers.map((jobNo) => state.shipments.find((row) => row.jobNo === jobNo)).filter(Boolean);
    const totals = shipmentsForTotals.reduce((sum, shipmentItem) => ({
      pieces: sum.pieces + Number(shipmentItem.pieces || 0),
      gross: sum.gross + Number(shipmentItem.actualKg || 0),
      chargeable: sum.chargeable + Number(shipmentItem.manualChargeableKg || shipmentItem.chargeableKg || 0)
    }), { pieces: 0, gross: 0, chargeable: 0 });
    totalsContainer.innerHTML = `<div class="manifest-jobs-totals">
      <p><span>Total Shipments</span><strong>${jobNumbers.length}</strong></p>
      <p><span>Total Pieces / Pallets</span><strong>${money(totals.pieces)}</strong></p>
      <p><span>Total Gross Weight (KG)</span><strong>${money(totals.gross)}</strong></p>
      <p><span>Total Chargeable Weight (KG)</span><strong>${money(totals.chargeable)}</strong></p>
    </div>`;
  };

  // Renders the added jobs as a compact table matching the Shipment Register's look (same cell
  // formatting via cellHtml, same column-settings system as every other register) instead of the
  // old wide job-chip cards, with a Remove button fixed as the last column of every row.
  const syncSelectedJobs = () => {
    const jobNumbers = [...selectedJobs];
    hiddenField.value = jobNumbers.join(", ");
    if (!jobNumbers.length) {
      list.innerHTML = `<p class="empty-state">No shipments added yet.</p>`;
    } else {
      const columns = shipmentColumnsForScope(scope, defaultColumnLayouts().shipment);
      const headCells = columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
      const bodyRows = jobNumbers.map((jobNo, index) => {
        const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
        const row = shipmentItem || { jobNo };
        const cells = columns.map(([key]) => `<td>${shipmentItem ? cellHtml("shipment", key, row, index) : (key === "jobNo" ? escapeHtml(jobNo) : "")}</td>`).join("");
        const missingNote = shipmentItem ? "" : `<span class="empty-state">Shipment not found</span> `;
        return `<tr>${cells}<td>${missingNote}<button type="button" class="ghost-button" data-remove-consolidation-job="${escapeHtml(jobNo)}">Remove</button></td></tr>`;
      }).join("");
      list.innerHTML = `<div class="table-wrap"><table><thead><tr>${headCells}<th>Remove</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`;
    }
    paintTotals(jobNumbers);
    paintColumnMenu();
  };

  picker.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-dialog-action='add-consolidation-job']");
    if (addButton) {
      const jobNo = selectField?.value || "";
      if (jobNo) selectedJobs.add(jobNo);
      else notifyDenied("No shipment selected", "Create a shipment with service type Consolidation first.");
      syncSelectedJobs();
      return;
    }

    const removeButton = event.target.closest("[data-remove-consolidation-job]");
    if (removeButton) {
      selectedJobs.delete(removeButton.dataset.removeConsolidationJob);
      syncSelectedJobs();
      return;
    }

    const columnToggleButton = event.target.closest("[data-action='toggle-shipment-columns']");
    if (columnToggleButton) {
      state.ui.openColumnSettings = state.ui.openColumnSettings === scope ? "" : scope;
      paintColumnMenu();
      return;
    }

    const selectAllButton = event.target.closest("[data-action='select-all-shipment-columns']");
    if (selectAllButton) {
      const settings = shipmentColumnSettings(scope, shipmentColumnDefaults(scope));
      const visible = {};
      settings.defaults.forEach(([key]) => { visible[key] = true; });
      state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible };
      saveState();
      state.ui.openColumnSettings = scope;
      syncSelectedJobs();
      return;
    }

    const unselectAllButton = event.target.closest("[data-action='unselect-all-shipment-columns']");
    if (unselectAllButton) {
      const settings = shipmentColumnSettings(scope, shipmentColumnDefaults(scope));
      const visible = {};
      settings.order.forEach((key, index) => { visible[key] = index === 0; });
      state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible };
      saveState();
      state.ui.openColumnSettings = scope;
      syncSelectedJobs();
      return;
    }

    const resetButton = event.target.closest("[data-action='reset-shipment-columns']");
    if (resetButton) {
      state.ui[shipmentColumnSettingsKey(scope)] = null;
      saveState();
      state.ui.openColumnSettings = scope;
      syncSelectedJobs();
      return;
    }
  });

  picker.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-action='toggle-shipment-column']");
    if (!toggle) return;
    const key = toggle.dataset.columnKey;
    const settings = shipmentColumnSettings(scope, shipmentColumnDefaults(scope));
    const visibleCount = settings.order.filter((columnKey) => settings.visible[columnKey] !== false).length;
    if (toggle.checked === false && visibleCount <= 1) {
      toggle.checked = true;
      notifyDenied("Column selection", "At least one column must remain visible.");
      return;
    }
    state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, visible: { ...settings.visible, [key]: toggle.checked } };
    saveState();
    state.ui.openColumnSettings = scope;
    syncSelectedJobs();
  });

  picker.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-column-drag-key]");
    if (!row) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", row.dataset.columnDragKey);
  });

  picker.addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-column-drag-key]")) return;
    event.preventDefault();
  });

  picker.addEventListener("drop", (event) => {
    const target = event.target.closest("[data-column-drag-key]");
    if (!target) return;
    event.preventDefault();
    const sourceKey = event.dataTransfer.getData("text/plain");
    const targetKey = target.dataset.columnDragKey;
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    const settings = shipmentColumnSettings(scope, shipmentColumnDefaults(scope));
    const order = settings.order.filter((key) => key !== sourceKey);
    const targetIndex = order.indexOf(targetKey);
    order.splice(targetIndex < 0 ? order.length : targetIndex, 0, sourceKey);
    state.ui[shipmentColumnSettingsKey(scope)] = { ...settings, order };
    saveState();
    state.ui.openColumnSettings = scope;
    syncSelectedJobs();
  });

  syncSelectedJobs();
}

function collectFormValues(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  if (form.querySelectorAll("input[name='sectionAccessList']").length) {
    data.sectionAccess = normalizeSectionAccess(formData.getAll("sectionAccessList").join(", ") || "Dashboard");
  }
  form.querySelectorAll("input[type='checkbox'][name]").forEach((input) => {
    if (input.name === "sectionAccessList") return;
    data[input.name] = input.checked;
  });
  return data;
}

function bindInvoiceShipmentTariff() {
  const customerField = dialogBody.querySelector('input[name="customer"]');
  const shipmentField = dialogBody.querySelector('input[name="shipmentNo"]');
  const tariffField = dialogBody.querySelector('input[name="tariffNo"]');
  const taxPercentField = dialogBody.querySelector('input[name="taxPercent"]');
  const invoiceLinesField = dialogBody.querySelector('input[name="invoiceLinesJson"]');
  const tariffSnapshotField = dialogBody.querySelector('input[name="tariffSnapshotJson"]');
  const invoiceSnapshotField = dialogBody.querySelector('input[name="invoiceSnapshotJson"]');
  const totalCostField = dialogBody.querySelector('input[name="totalCost"]');
  const supplierCostField = dialogBody.querySelector('input[name="supplierCost"]');
  const revenueField = dialogBody.querySelector('input[name="revenue"]');
  const grandTotalField = dialogBody.querySelector('input[name="grandTotal"]');
  const profitPercentField = dialogBody.querySelector('input[name="profitPercent"]');
  const taxAmountField = dialogBody.querySelector('input[name="taxAmount"]');
  const chargeableWeightField = dialogBody.querySelector('input[name="chargeableWeight"]');
  const grossWeightField = dialogBody.querySelector('input[name="grossWeight"]');
  const volumeWeightField = dialogBody.querySelector('input[name="volumeWeight"]');
  const currencyField = dialogBody.querySelector('[name="currency"]');
  const tariffNameField = dialogBody.querySelector('input[name="tariffName"]');
  const previewContainer = dialogBody.querySelector('[data-tariff-preview="invoice"]');
  const shipmentDatalist = shipmentField?.getAttribute('list') ? dialogBody.querySelector('#' + shipmentField.getAttribute('list') + 'Options') : null;
  const tariffDatalist = tariffField?.getAttribute('list') ? dialogBody.querySelector('#' + tariffField.getAttribute('list') + 'Options') : null;
  let lines = parseInvoiceLineItems(invoiceLinesField?.value || '[]');

  const selectedShipment = () => state.shipments.find((row) => String(row.jobNo || '').trim().toLowerCase() === String(shipmentField?.value || '').trim().toLowerCase()) || null;
  const selectedTariff = () => state.tariffs.find((row) => String(row.tariffNo || '').trim().toLowerCase() === String(tariffField?.value || '').trim().toLowerCase()) || assignedTariffForShipment(selectedShipment()) || null;

  const syncDatalist = () => {
    if (shipmentDatalist) {
      const shipments = invoiceShipmentOptionsForCustomer(customerField?.value || '');
      shipmentDatalist.innerHTML = shipments.map((option) => '<option value="' + escapeHtml(option.value || '') + '" label="' + escapeHtml(option.label || option.value || '') + '"></option>').join('');
      if (shipmentField?.value && !shipments.some((option) => option.value === shipmentField.value)) shipmentField.value = '';
    }
    if (tariffDatalist) {
      const tariffs = invoiceTariffOptionsForCustomer(customerField?.value || '');
      tariffDatalist.innerHTML = tariffs.map((option) => '<option value="' + escapeHtml(option.value || '') + '" label="' + escapeHtml(option.label || option.value || '') + '"></option>').join('');
      if (tariffField?.value && !tariffs.some((option) => option.value === tariffField.value)) tariffField.value = '';
    }
  };

  const renderInvoicePreview = (shipmentItem, tariffItem, taxPercent) => {
    if (previewContainer) previewContainer.innerHTML = invoicePreviewMarkup(shipmentItem, tariffItem, lines, taxPercent, true);
  };

  const updateInvoicePreviewSummary = (summary) => {
    if (!previewContainer) return;
    const summaryMap = {
      revenue: summary.revenue,
      cost: summary.cost,
      taxAmount: summary.taxAmount,
      grossProfit: summary.grossProfit,
      profitPercent: summary.profitPercent,
      grandTotal: summary.grandTotal
    };
    Object.entries(summaryMap).forEach(([key, value]) => {
      const node = previewContainer.querySelector('[data-invoice-summary="' + key + '"]');
      if (node) node.textContent = key === 'profitPercent' ? money(value) + '%' : money(value);
    });
    lines.forEach((line, index) => {
      const amountField = previewContainer.querySelector('[data-invoice-line-row="' + index + '"] [data-invoice-line-field="amount"]');
      if (amountField) amountField.value = invoiceLineAmount(line);
    });
  };

  const syncInvoice = (renderPreview = false) => {
    const shipmentItem = selectedShipment();
    const tariffItem = selectedTariff();
    const taxPercent = Number(taxPercentField?.value || 0);
    const currentChargeable = Number(chargeableWeightField?.value || 0);
    const currentGross = Number(grossWeightField?.value || 0);
    const currentVolume = Number(volumeWeightField?.value || 0);
    if (shipmentItem) {
      customerField.value = shipmentItem.customer || shipmentItem.customerName || customerField.value || '';
    } else if (tariffItem && !customerField.value) {
      customerField.value = tariffItem.customer || '';
    }
    if (chargeableWeightField) chargeableWeightField.value = shipmentItem ? effectiveChargeableWeightForShipment(shipmentItem) : currentChargeable;
    if (grossWeightField) grossWeightField.value = shipmentItem ? Number(shipmentItem.actualKg || 0) : currentGross;
    if (volumeWeightField) volumeWeightField.value = shipmentItem ? Number(shipmentItem.cbm || 0) : currentVolume;
    if (tariffNameField) tariffNameField.value = tariffItem ? tariffItem.customer || '' : '';
    if (!lines.length && tariffItem) lines = invoiceLinesFromTariff(shipmentItem, tariffItem, Number(chargeableWeightField?.value || effectiveChargeableWeightForShipment(shipmentItem) || 0));
    const summary = invoiceTotals(lines, taxPercent);
    if (revenueField) revenueField.value = summary.revenue;
    if (supplierCostField) supplierCostField.value = summary.cost;
    if (totalCostField) totalCostField.value = summary.cost;
    if (taxAmountField) taxAmountField.value = summary.taxAmount;
    if (grandTotalField) grandTotalField.value = summary.grandTotal;
    if (profitPercentField) profitPercentField.value = summary.profitPercent;
    if (invoiceLinesField) invoiceLinesField.value = JSON.stringify(lines);
    if (tariffSnapshotField) tariffSnapshotField.value = JSON.stringify(tariffItem || {});
    if (invoiceSnapshotField) invoiceSnapshotField.value = JSON.stringify(invoiceSnapshotFromSelection(shipmentItem, tariffItem, lines, taxPercent, currencyField?.value || shipmentItem?.currency || "KD"));
    if (previewContainer) {
      if (renderPreview || !previewContainer.querySelector('[data-invoice-preview-ready]')) {
        renderInvoicePreview(shipmentItem, tariffItem, taxPercent);
      } else {
        updateInvoicePreviewSummary(summary);
      }
    }
  };

  const loadSelection = () => {
    const shipmentItem = selectedShipment();
    const tariffItem = selectedTariff();
    if (shipmentItem && !customerField.value) customerField.value = shipmentItem.customer || shipmentItem.customerName || '';
    if (shipmentItem && tariffField && !tariffField.value && tariffItem) tariffField.value = tariffItem.tariffNo || '';
    lines = parseInvoiceLineItems(invoiceLinesField?.value || '[]');
    if (!lines.length && tariffItem) lines = invoiceLinesFromTariff(shipmentItem, tariffItem, Number(chargeableWeightField?.value || effectiveChargeableWeightForShipment(shipmentItem) || 0));
    syncDatalist();
    syncInvoice(true);
  };

  const updateLineValue = (index, field, value) => {
    const line = lines[index];
    if (!line) return;
    line[field] = field === 'qty' || field === 'rate' || field === 'amount' || field === 'cost' ? Number(value || 0) : value;
    if (field === 'qty' || field === 'rate') line.amount = Number((Number(line.qty || 0) * Number(line.rate || 0)).toFixed(3));
    if (field === 'amount' && !value) line.amount = Number((Number(line.qty || 0) * Number(line.rate || 0)).toFixed(3));
    syncInvoice();
  };

  // dialogBody is a persistent, reused DOM node across every dialog open in the app - without
  // removing the previous listeners first, opening the invoice dialog N times in a session would
  // attach N separate 'input'/'click' listeners here, each closing over field references from a
  // prior dialog's now-replaced HTML. The stale ones are individually harmless (their captured
  // elements are detached, so their target checks never match), but they'd accumulate indefinitely.
  if (dialogBody._invoiceInputHandler) dialogBody.removeEventListener('input', dialogBody._invoiceInputHandler);
  if (dialogBody._invoiceClickHandler) dialogBody.removeEventListener('click', dialogBody._invoiceClickHandler);

  dialogBody._invoiceInputHandler = (event) => {
    const target = event.target;
    if (target === customerField || target === shipmentField || target === tariffField || target === taxPercentField) {
      syncDatalist();
      const shipmentItem = selectedShipment();
      const tariffItem = selectedTariff();
      if (target === customerField) {
        lines = shipmentItem && tariffItem ? parseInvoiceLineItems(invoiceLinesField?.value || '[]') : [];
      } else if (target === tariffField || target === shipmentField) {
        lines = tariffItem ? invoiceLinesFromTariff(shipmentItem, tariffItem, Number(chargeableWeightField?.value || effectiveChargeableWeightForShipment(shipmentItem) || 0)) : [];
      } else {
        lines = shipmentItem && tariffItem ? parseInvoiceLineItems(invoiceLinesField?.value || '[]') : [];
      }
      syncInvoice(true);
      return;
    }
    const lineIndex = target?.dataset?.lineIndex;
    const lineField = target?.dataset?.invoiceLineField;
    if (lineIndex !== undefined && lineField) updateLineValue(Number(lineIndex), lineField, target.value);
  };
  dialogBody.addEventListener('input', dialogBody._invoiceInputHandler);
  // Selecting a datalist suggestion by mouse click doesn't reliably fire 'input' in every browser -
  // 'change' is the one event guaranteed to fire either way, so this is a defensive second listener
  // covering the same three fields in case that's how the customer gets picked.
  dialogBody.addEventListener('change', dialogBody._invoiceInputHandler);

  dialogBody._invoiceClickHandler = (event) => {
    const addButton = event.target.closest('[data-add-invoice-line]');
    if (addButton) {
      lines.push({ id: 'manual-' + Date.now(), source: 'manual', description: '', unit: 'Unit', qty: 1, rate: 0, amount: 0, cost: 0, remarks: '' });
      syncInvoice(true);
      return;
    }
    const removeButton = event.target.closest('[data-remove-invoice-line]');
    if (removeButton) {
      lines.splice(Number(removeButton.dataset.removeInvoiceLine), 1);
      syncInvoice(true);
    }
  };
  dialogBody.addEventListener('click', dialogBody._invoiceClickHandler);

  syncDatalist();
  syncInvoice(true);
}

function assignedTariffForShipment(shipmentItem) {

  return state.tariffs.find((row) => row.tariffNo === shipmentItem?.tariffNo)
    || state.tariffs.find((row) => row.customer === shipmentItem?.customer && row.origin === shipmentItem?.origin && row.destination === shipmentItem?.destination)
    || null;
}

function numericInputValue(value) {
  return Number(value || 0).toFixed(3);
}

function applyChargeFilters() {
  state.ui.chargeFilters = {
    shipmentNo: dialogSafeValue("chargeShipmentNo"),
    chargeType: dialogSafeValue("chargeTypeFilter", "All"),
    supplier: dialogSafeValue("chargeSupplierFilter", "All"),
    status: dialogSafeValue("chargeStatusFilter", "All"),
    fromDate: dialogSafeValue("chargeFromDate"),
    toDate: dialogSafeValue("chargeToDate")
  };
  saveState();
  render();
}

function applyAuditFilters() {
  state.ui.auditFilters = {
    query: dialogSafeValue("auditQuery"),
    fromDate: dialogSafeValue("auditFromDate"),
    toDate: dialogSafeValue("auditToDate")
  };
  saveState();
  render();
}

function dialogSafeValue(name, fallback = "") {
  return moduleContent.querySelector(`[name='${name}']`)?.value || fallback;
}

function summarizeChanges(previous, next, submittedKeys = null) {
  const keys = Array.isArray(submittedKeys) ? submittedKeys : Object.keys(next);
  return [...new Set(keys)]
    .filter((key) => String(previous[key] ?? "") !== String(next[key] ?? ""))
    .map((key) => `${key}: ${previous[key] ?? ""} -> ${next[key] ?? ""}`)
    .join(" | ");
}

function coerceValue(previous, next) {
  if (typeof previous === "number") return Number(next) || 0;
  if (typeof previous === "boolean") return isChecked(next);
  return next;
}

function isChecked(value) {
  return value === true || value === "true" || value === "on" || value === "Yes";
}

function parseChangeSummary(summary) {
  return String(summary || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((patch, item) => {
      const [keyPart, valuePart] = item.split(":");
      if (!keyPart || !valuePart || !valuePart.includes("->")) return patch;
      const nextValue = valuePart.split("->").slice(1).join("->").trim();
      patch[keyPart.trim()] = nextValue;
      return patch;
    }, {});
}

function previewReport() {
  const reportType = normalizedReportType(moduleContent.querySelector("[name='reportType']")?.value || state.ui.reportType);
  const reportFormat = moduleContent.querySelector("[name='reportFormat']")?.value || state.ui.reportFormat || "PDF";
  const reportFromDate = moduleContent.querySelector("[name='reportFromDate']")?.value || "";
  const reportToDate = moduleContent.querySelector("[name='reportToDate']")?.value || "";
  const rows = reportRows(reportType, reportFromDate, reportToDate);
  const revenue = rows.reduce((sum, row) => sum + Number(row.sell || 0), 0);
  const cost = rows.reduce((sum, row) => sum + Number(row.buyCost || 0), 0);
  state.ui.reportType = reportType;
  state.ui.reportFormat = reportFormat;
  state.ui.reportFromDate = reportFromDate;
  state.ui.reportToDate = reportToDate;
  const rangeText = reportFromDate || reportToDate ? ` | ${reportFromDate || "earliest"} to ${reportToDate || "latest"}` : "";
  state.ui.reportPreview = {
    reportType,
    format: reportFormat,
    rows,
    summary: `${rows.length} shipment(s) | Revenue ${money(revenue)} | Cost ${money(cost)} | Margin ${money(revenue - cost)}${rangeText}`
  };
  saveState();
  render();
}

// The report's own From/To fields are authoritative for report generation - they were added
// specifically because relying on the ambient global date filter elsewhere on screen was
// confusing (not obviously connected to the report, easy to forget was even set). Falls back to
// the global filter only when the report's own dates are left blank, so existing habits still work.
function reportRows(reportType, reportFromDate = "", reportToDate = "") {
  const rows = visibleRows(state.shipments).filter((row) => {
    const date = recordDate(row);
    const fromMatch = !reportFromDate || !date || date >= reportFromDate;
    const toMatch = !reportToDate || !date || date <= reportToDate;
    return fromMatch && toMatch && adminBranchFilterMatch(row);
  });
  if (reportType === "Open / in-transit / delivered") {
    return rows.filter((row) => ["Booked", "In-Transit", "Delivered"].includes(row.status));
  }

  if (reportType === "Pending POD / invoice") {
    return rows.filter((row) => shipmentNeedsPendingPod(row) || ["Unbilled", "Draft", "Overdue"].includes(row.invoiceStatus));
  }
  const selectedStatus = statusOptions().find((status) => status.toLowerCase() === String(reportType || "").trim().toLowerCase());
  if (selectedStatus) {
    return rows.filter((row) => String(row.status || "").trim().toLowerCase() === selectedStatus.toLowerCase());
  }
  return rows;
}

function exportReport() {
  const preview = state.ui.reportPreview;
  if (!preview) {
    window.alert("Preview the report first.");
    return;
  }

  if (preview.format === "Excel CSV") {
    downloadCsv(preview);
    return;
  }

  const printWindow = window.open("", "_blank", "width=1080,height=760");
  if (!printWindow) {
    window.alert("Allow popups to print the PDF preview.");
    return;
  }

  const tableHtml = table("shipment", preview.rows, shipmentColumns(), false, "shipment:printPreview", false);
  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(preview.reportType)}</title>
        <style>
          body { font-family: "Segoe UI", sans-serif; padding: 24px; color: #16202a; }
          h1 { margin: 0 0 6px; font-size: 26px; }
          p { margin: 0 0 18px; color: #50606f; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d96f16; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #fff3e8; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(preview.reportType)}</h1>
        <p>${escapeHtml(preview.summary)}</p>
        ${tableHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 150);
}

function fullShipmentExportColumns() {
  return [
    ["jobNo", "Job No"],
    ["airwayBillNo", "Airway Bill / BL No"],
    ["bookingDate", "Booking Date"],
    ["shipmentDate", "Shipment Date"],
    ["status", "Status"],
    ["shipmentDirection", "Shipment Type"],
    ["shipmentService", "Service Type"],
    ["origin", "Origin"],
    ["destination", "Destination"],
    ["customerReference", "Customer Reference"],
    ["branch", "Branch"],
    ["salesPerson", "Sales Person"],
    ["transitDays", "Transit Days"],
    ["tcnNumber", "TCN Number"],
    ["deliveryNoteNo", "Delivery Note No"],
    ["customer", "Customer Name"],
    ["customerCode", "Customer Code"],
    ["customerContactPerson", "Customer Contact Person"],
    ["customerMobile", "Customer Mobile"],
    ["customerEmail", "Customer Email"],
    ["customerAddress", "Customer Address"],
    ["shipperName", "Shipper Name"],
    ["shipperAddress", "Shipper Address"],
    ["shipperContactPerson", "Shipper Contact Person"],
    ["shipperMobile", "Shipper Mobile"],
    ["shipperEmail", "Shipper Email"],
    ["shipperCountry", "Shipper Country"],
    ["shipperVatTrn", "Shipper VAT / TRN"],
    ["consigneeName", "Consignee Name"],
    ["consigneeAddress", "Consignee Address"],
    ["consigneeContactPerson", "Consignee Contact Person"],
    ["consigneeMobile", "Consignee Mobile"],
    ["consigneeEmail", "Consignee Email"],
    ["consigneeCountry", "Consignee Country"],
    ["pickupLocation", "Pickup Location"],
    ["pickupAddress", "Pickup Address"],
    ["pickupContactPerson", "Pickup Contact Person"],
    ["pickupMobile", "Pickup Mobile"],
    ["pickupDate", "Pickup Date"],
    ["pickupTime", "Pickup Time"],
    ["deliveryLocation", "Delivery Location"],
    ["deliveryAddress", "Delivery Address"],
    ["deliveryContactPerson", "Delivery Contact Person"],
    ["deliveryMobile", "Delivery Mobile"],
    ["deliveryDate", "Delivery Date"],
    ["deliveryTime", "Delivery Time"],
    ["transporter", "Transporter"],
    ["transporterCode", "Transporter Number"],
    ["vehicleNo", "Vehicle No"],
    ["driverName", "Driver Name"],
    ["driverNumber", "Driver Number"],
    ["driverMobile", "Driver Mobile"],
    ["billTo1", "Billing Party Name"],
    ["billingParty1Address", "Billing Party Address"],
    ["billingParty1ContactPerson", "Billing Party Contact Person"],
    ["billingParty1Mobile", "Billing Party Mobile"],
    ["billingParty1Email", "Billing Party Email"],
    ["billingParty1CreditTerms", "Billing Party Credit Terms"],
    ["tariffNo", "Tariff No"],
    ["natureOfGoods", "Nature of Goods"],
    ["volumeCategory", "Volume Category"],
    ["cbm", "CBM"],
    ["actualKg", "Actual Weight (KG)"],
    ["chargeableKg", "Chargeable Weight (KG)"],
    ["podStatus", "POD Status"],
    ["invoiceStatus", "Invoice Status"],
    ["sell", "Sell"],
    ["buyCost", "Buy Cost"],
    ["createdBy", "USERNAME"]
  ];
}

function downloadCsv(preview) {
  const columns = fullShipmentExportColumns();
  const header = columns.map(([, label]) => `"${label.replace(/"/g, '""')}"`).join(",");
  const lines = preview.rows.map((row) =>
    columns
      .map(([key]) => `"${String(display(row[key])).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${preview.reportType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportCollectionCsv(type) {
  const rows = collectionFor(type);
  const columns = columnsForType(type);
  if (!rows.length || !columns.length) {
    notifyDenied("Export not ready", "No rows are available for this section.");
    return;
  }
  const header = columns.map(([, label]) => `"${String(label).replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((row, index) => columns
    .map(([key]) => `"${String(displayCellValue(type, key, row, index)).replace(/"/g, '""')}"`)
    .join(","));
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${typeLabel(type).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  notifySuccess("Export ready", `${rows.length} row(s) exported.`);
}

function columnsForType(type) {
  return {
    shipment: shipmentColumns,
    pod: shipmentColumns,
    status: shipmentColumns,
    load: loadColumns,
    customers: () => partyColumns("customers"),
    suppliers: () => partyColumns("suppliers"),
    tariff: tariffColumns,
    document: documentColumns,
    charge: additionalChargeColumns,
    invoice: invoiceColumns,
    user: userColumns
  }[type]?.() || [];
}

function displayCellValue(type, key, row, index = 0) {
  if (key === "slNo") return index + 1;
  if (key === "palletCount") return cargoPalletCount(row);
  if (key === "truckDetails") return [row.vehicleNo, row.driverName, row.driverMobile].filter(Boolean).join(" / ");
  if (type === "shipment" && key === "consoleNo") return consoleNoForShipment(row.jobNo);
  if (type === "document" && key === "linkedNo") return documentLinkedToText(row);
  return formatDateDisplay(row[key] ?? "");
}

function generateRecordDocument(type, id, download = false) {
  const record = collectionFor(type).find((row) => rowId(type, row) === id);
  if (!record) {
    notifyDenied("Document not generated", "Select a saved record first.");
    return;
  }
  const documentBuilders = {
    invoice: invoiceDocumentHtml,
    tariff: tariffDocumentHtml,
    shipment: shipmentDocumentHtml,
    load: manifestDocumentHtml,
    pod: podDocumentHtml,
    status: shipmentDocumentHtml,
    tcn: tcnDocumentHtml
  };
  const builder = documentBuilders[type] || shipmentDocumentHtml;
  const html = builder(record);
  const filePrefix = { invoice: "bill", tariff: "tariff", pod: "pod", shipment: "shipment", load: "manifest", status: "shipment", tcn: "tcn" }[type] || type;
  const fileName = `${filePrefix}-${rowId(type, record)}.html`.toLowerCase();
  if (download) {
    downloadHtml(fileName, html);
    notifySuccess("Export ready", `${rowId(type, record)} was exported.`);
    return;
  }
  openPrintableDocument(html);
}


window.ApolloConnectedDocuments = {
  openTcn(jobNo, download = false) {
    const key = String(jobNo || "").trim().toLowerCase();
    const record = visibleRows(state.shipments).find((row) => String(row.jobNo || "").trim().toLowerCase() === key);
    if (!record) {
      notifyDenied("TCN not available", "This shipment is not available in your current Connected access scope.");
      return;
    }
    const html = tcnDocumentHtml(record);
    const fileName = `tcn-${record.airwayBillNo || record.tcnNumber || record.jobNo}.html`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    if (download) {
      downloadHtml(fileName, html);
      notifySuccess("TCN copy ready", `${record.airwayBillNo || record.tcnNumber || record.jobNo} was exported.`);
      return;
    }
    openPrintableDocument(html);
  },
  openShipment(jobNo) {
    openShipmentByNumber(jobNo);
  }
};

function shipmentDocumentHtml(record) {
  return documentShell(
    `Shipment ${record.jobNo}`,
    "Shipment Document",
    record.jobNo,
    record.shipmentDate || record.bookingDate || today(),
    `
      <section class="document-summary">
        <div><span>Status</span><strong class="status-pill">${escapeHtml(record.status)}</strong><small>${escapeHtml(record.shipmentService || "")} / ${escapeHtml(record.transportMode || "")}</small></div>
        <div><span>QR Reference</span>${qrMarkup(record.jobNo)}<small>${escapeHtml(record.customerReference || record.airwayBillNo || "")}</small></div>
      </section>
      ${documentBlock("Shipment Information", [
        ["Shipment Number", record.jobNo],
        ["Booking Date", record.bookingDate],
        ["Shipment Date", record.shipmentDate],
        ["Service Type", record.shipmentService],
        ["Transport Mode", record.transportMode],
        ["Origin", record.origin],
        ["Destination", record.destination],
        ["Customer Reference", record.customerReference],
        ["Internal Reference", record.internalReferenceNo],
        ["Branch", record.branch],
        ["Sales Person", record.salesPerson]
      ])}
      ${documentBlock("Customer Information", [
        ["Customer Name", record.customer],
        ["Customer Code", record.customerCode],
        ["Contact Person", record.customerContactPerson],
        ["Mobile Number", record.customerMobile],
        ["Email Address", record.customerEmail],
        ["Address", record.customerAddress || customerAddressFor(record.customer, record.customerCode)]
      ])}
      ${documentBlock("Shipper Information", [
        ["Shipper Name", record.shipperName],
        ["Address", record.shipperAddress],
        ["Contact Person", record.shipperContactPerson],
        ["Mobile Number", record.shipperMobile],
        ["Email Address", record.shipperEmail],
        ["VAT / TRN", record.shipperVatTrn],
        ["Country", record.shipperCountry]
      ])}
      ${documentBlock("Consignee Information", [
        ["Consignee Name", record.consigneeName || record.customer],
        ["Address", record.consigneeAddress],
        ["Contact Person", record.consigneeContactPerson],
        ["Mobile Number", record.consigneeMobile],
        ["Email Address", record.consigneeEmail],
        ["Country", record.consigneeCountry]
      ])}
      ${documentBlock("Pickup Information", [
        ["Pickup Location", record.pickupLocation],
        ["Pickup Address", record.pickupAddress],
        ["Pickup Contact Person", record.pickupContactPerson],
        ["Pickup Mobile", record.pickupMobile],
        ["Pickup Date", record.pickupDate],
        ["Pickup Time", record.pickupTime]
      ])}
      ${documentBlock("Delivery Information", [
        ["Delivery Location", record.deliveryLocation],
        ["Delivery Address", record.deliveryAddress],
        ["Delivery Contact Person", record.deliveryContactPerson],
        ["Delivery Mobile", record.deliveryMobile],
        ["Delivery Date", record.deliveryDate],
        ["Delivery Time", record.deliveryTime]
      ])}
      ${documentBlock("Billing Party 1", [
        ["Billing Party Name", record.billTo1],
        ["Billing Address", record.billingParty1Address],
        ["Contact Person", record.billingParty1ContactPerson],
        ["Mobile Number", record.billingParty1Mobile],
        ["Email Address", record.billingParty1Email],
        ["Credit Terms", record.billingParty1CreditTerms]
      ])}
      ${cargoItemsPrintTable(record)}
      ${documentBlock("Cargo Summary", [
        ["Nature of Goods", record.natureOfGoods]
      ])}
      <p class="footer-note">Terms and conditions apply as per Apollo Freight Solutions cargo acceptance and delivery policy.</p>
    `,
    { qrValue: record.jobNo }
  );
}

// Renders the POD/delivery-note PDF for ONE delivery (split) of a shipment. A shipment delivered
// whole still gets exactly one of these; a shipment delivered in several parts gets one per part,
// each showing only that part's pieces/location/receiver/signature - not the whole shipment's.
function podSplitDocumentHtml(record, split) {
  const totalPieces = Number(record.pieces || 0);
  const splitPieces = Number(split.pieces || totalPieces || 0);
  const isPartial = totalPieces > 0 && splitPieces < totalPieces;
  const deliveryNo = split.deliveryNoteNo || `POD-${record.jobNo}${split.splitNo ? `-${split.splitNo}` : ""}`;
  // Shows the actual recorded package type breakdown (e.g. "2 Pallets + 2 Cartons") from the
  // shipment's own cargo items, not just a bare total piece count - podCargoBreakdown() already
  // builds this correctly from cargoItemsJson. The shipment only records ONE overall type
  // breakdown (not one per delivery split), so a partial delivery shows that full breakdown
  // alongside how many of the total pieces are covered by this specific trip.
  const cargoBreakdown = podCargoBreakdown(record);
  const piecesLabel = totalPieces
    ? (isPartial ? `${splitPieces} of ${totalPieces} total piece(s) - ${cargoBreakdown}` : cargoBreakdown)
    : String(splitPieces || record.pieces || 0);
  return documentShell(
    `POD ${deliveryNo}`,
    isPartial ? `CARGO DELIVERY NOTE (PARTIAL DELIVERY ${split.splitNo || 1})` : "CARGO DELIVERY NOTE",
    deliveryNo,
    split.deliveryDatetime || today(),
    `
      <section class="document-summary">
        <div><span>File Reference Number</span><strong>${escapeHtml(deliveryNo)}</strong><small class="pod-consignee">${escapeHtml(record.consigneeName || record.customer || "")}</small></div>
        <div><span>QR Reference</span>${qrMarkup(deliveryNo)}<small>${escapeHtml(record.jobNo)}</small></div>
      </section>
      ${isPartial ? `<p class="acknowledgement">This delivery note covers a PARTIAL delivery of this shipment - see pieces below.</p>` : ""}
      ${documentBlock("Shipment Information", [
        ["From", record.origin || record.pickupLocation],
        ["To", record.destination || split.deliveryLocation],
        ["Airway Bill / Bill of Lading", record.airwayBillNo],
        ["Shipment Number (SHPT#)", record.jobNo],
        ["GIN Number", split.ginNo],
        ["Customer Reference", split.customerReference]
      ])}
      ${documentBlock("Cargo Details (This Delivery)", [
        ["Number of Pieces", piecesLabel],
        ["Weight (Kgs)", money(record.actualKg)],
        ["Vehicle Type", record.vehicleType],
        ["Nature of Goods", record.natureOfGoods]
      ])}
      ${documentBlock("Delivery Information", [
        ["Delivery Location", split.deliveryLocation],
        ["Delivery Address", split.deliveryAddress],
        ["Delivery Remarks / Coordinates", split.deliveryRemarks],
        ["POC Name", split.pocName],
        ["POC Mobile Number", split.pocMobile],
        ["Additional Contact Person", split.additionalContact]
      ])}
      <section class="receiver-remarks-block">
        <span>Receiver Remarks (to be filled manually on receipt)</span>
        <div class="remark-line"></div>
        <div class="remark-line"></div>
      </section>
      <section class="delivery-signatures">
        <div><span>Prepared By</span><strong>${escapeHtml(split.preparedBy || currentUserName())}</strong><small>Date & Time</small><em>${escapeHtml(split.deliveryDatetime ? formatDateDisplay(split.deliveryDatetime) : formatDateTimeNow())}</em></div>
        <div><span>Delivered By</span><strong>${escapeHtml(split.deliveredBy || podDeliveredByValue(record))}</strong></div>
        <div><span>Goods Received By</span><strong>${escapeHtml(split.receivedBy || "")}</strong><small>Telephone Number</small><em>${escapeHtml(split.receiverPhone || "")}</em><small>Signature</small><b>${escapeHtml(split.receiverSignature || " ")}</b><small>Date</small><b class="remark-line"></b></div>
      </section>
      <p class="acknowledgement">This is to confirm that goods have been received in good order and condition. Any discrepancy must be notified within 24 hours from the time of receipt.</p>
      <p class="acknowledgement">Shipment was opened and checked by customs</p>
    `,
    { compact: true, qrValue: deliveryNo, hideDefaultSignatures: true }
  );
}

// Generic "Generate POD" entry point (the POD Actions panel button, without a specific just-saved
// split in context) - renders the most recent delivery recorded for the shipment, or a "not yet
// delivered" placeholder if none exists yet.
function podDocumentHtml(record) {
  const splits = parsePodSplits(record.podSplitsJson);
  const latestSplit = splits[splits.length - 1];
  if (latestSplit) return podSplitDocumentHtml(record, latestSplit);
  return podSplitDocumentHtml(record, {
    splitNo: 1,
    pieces: record.pieces,
    deliveryNoteNo: record.deliveryNoteNo,
    ginNo: record.ginNo,
    customerReference: record.customerReference,
    deliveryLocation: record.deliveryLocation,
    deliveryAddress: record.deliveryAddress,
    deliveryRemarks: record.deliveryRemarks,
    pocName: record.pocName,
    pocMobile: record.pocMobile,
    additionalContact: record.additionalContact,
    preparedBy: record.preparedBy,
    deliveredBy: podDeliveredByValue(record),
    receivedBy: record.receivedBy,
    receiverPhone: record.receiverPhone,
    receiverSignature: record.receiverSignature,
    deliveryDatetime: record.deliveryDatetime
  });
}

function podCargoBreakdown(record = {}) {
  const lines = parsePalletDimensions(record.cargoItemsJson || record.palletDimensionsJson || "[]");
  if (!lines.length) return String(record.pieces || 0);
  const grouped = new Map();
  lines.forEach((line) => {
    const packageType = String(line.packageType || "Package").trim() || "Package";
    const quantity = Number(line.quantity || line.count || 0);
    grouped.set(packageType, (grouped.get(packageType) || 0) + quantity);
  });
  const total = [...grouped.values()].reduce((sum, quantity) => sum + quantity, 0);
  const detail = [...grouped.entries()]
    .map(([packageType, quantity]) => `${quantity} ${quantity === 1 ? packageType : `${packageType}s`}`)
    .join(" + ");
  return `${detail} (Total: ${total})`;
}

function manifestDocumentHtml(record) {
  const jobNos = String(record.jobNumbers || "").split(",").map((item) => item.trim()).filter(Boolean);
  const shipments = jobNos.map((jobNo) => state.shipments.find((row) => row.jobNo === jobNo)).filter(Boolean);
  const totals = shipments.reduce((sum, shipmentItem) => ({
    qty: sum.qty + Number(shipmentItem.pieces || 0),
    gross: sum.gross + Number(shipmentItem.actualKg || 0),
    net: sum.net + Number(shipmentItem.manualChargeableKg || shipmentItem.chargeableKg || 0)
  }), { qty: 0, gross: 0, net: 0 });
  // Column order per print request: Airway Bill first, Job Number second, then the rest.
  // Origin/Destination are dropped here since the manifest header above already shows the
  // route (FROM/TO), and Value is dropped in favor of a wider Commodity column.
  const rows = shipments.length
    ? shipments.map((shipmentItem) => `<tr>
        <td>${escapeHtml(shipmentItem.airwayBillNo || "")}</td>
        <td>${escapeHtml(shipmentItem.jobNo || "")}</td>
        <td>${escapeHtml(shipmentItem.shipperName || shipmentItem.customer || "")}</td>
        <td>${escapeHtml(shipmentItem.consigneeName || shipmentItem.customer || "")}</td>
        <td>${escapeHtml(shipmentItem.pieces || "")}</td>
        <td>${money(shipmentItem.actualKg || 0)}</td>
        <td>${money(shipmentItem.manualChargeableKg || shipmentItem.chargeableKg || 0)}</td>
        <td>${escapeHtml(shipmentItem.natureOfGoods || "")}</td>
        <td>${escapeHtml(shipmentItem.hsCode || shipmentItem.customsDocuments || "AS PER BOE")}</td>
        <td>${escapeHtml(shipmentItem.notifyPartyName || shipmentItem.deliveryContactPerson || "")}</td>
        <td>${escapeHtml(shipmentItem.countryOfOrigin || shipmentItem.shipperCountry || "")}</td>
      </tr>`).join("")
    : `<tr><td colspan="11">No shipments linked to this manifest.</td></tr>`;

  return documentShell(
    `Manifest ${record.loadNo}`,
    "MANIFEST",
    record.loadNo,
    record.tripDate || today(),
    `
      <section class="manifest-sheet">
        <div class="manifest-header-grid">
          <p><strong>TRUCK NO</strong><span>${escapeHtml(record.vehicleNo || "")}</span></p>
          <p><strong>FROM</strong><span>${escapeHtml(record.origin || "")}</span></p>
          <p><strong>MANIFEST NO</strong><span>${escapeHtml(record.loadNo || "")}</span></p>
          <p><strong>TO</strong><span>${escapeHtml(record.destination || "")}</span></p>
          <p><strong>DRIVER NAME</strong><span>${escapeHtml(record.driverName || "")}</span></p>
          <p><strong>ETD</strong><span>${escapeHtml(record.tripDate || "")}</span></p>
          <p><strong>MOB NO</strong><span>${escapeHtml(record.driverNumber || record.driverMobile || "")}</span></p>
        </div>
      </section>
      <table class="manifest-table">
        <colgroup>
          <col style="width:9%" /><col style="width:7%" /><col style="width:11%" /><col style="width:11%" />
          <col style="width:5%" /><col style="width:7%" /><col style="width:7%" /><col style="width:22%" />
          <col style="width:7%" /><col style="width:10%" /><col style="width:4%" />
        </colgroup>
        <thead><tr><th>AWB #</th><th>JOB #</th><th>Shipper</th><th>Consignee</th><th>QTY</th><th>Gross Weight</th><th>Net Weight</th><th>Commodity</th><th>HS Code</th><th>NOTIFY PARTY</th><th>COO</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th colspan="4">TOTAL</th><th>${escapeHtml(totals.qty)}</th><th>${money(totals.gross)}</th><th>${money(totals.net)}</th><th colspan="4"></th></tr></tfoot>
      </table>
    `,
    { qrValue: record.loadNo, landscape: true, hideDefaultSignatures: true, hidePrintedAt: true }
  );
}

function documentBlock(title, pairs) {
  return `<h2>${escapeHtml(title)}</h2><section class="meta">${pairs.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(display(value ?? ""))}</span></p>`).join("")}</section>`;
}

function cargoItemsPrintTable(record) {
  const lines = parsePalletDimensions(record.cargoItemsJson || record.palletDimensionsJson || "[]");
  const rows = lines.length
    ? lines.map((line, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(line.packageType || "Pallet")}</td><td>${escapeHtml(line.quantity || line.count || "")}</td><td>${escapeHtml(line.length || "")}</td><td>${escapeHtml(line.width || "")}</td><td>${escapeHtml(line.height || "")}</td><td>${escapeHtml(line.dimensionUnit || "CM")}</td><td>${money(line.weightKg || line.weight || 0)}</td><td>${money(line.volumeWeight || line.total || 0)}</td><td>${escapeHtml(line.remarks || "")}</td></tr>`).join("")
    : `<tr><td colspan="10">No cargo items recorded.</td></tr>`;
  return `<h2>Cargo Dimensions Table</h2><table><thead><tr><th>Sr No</th><th>Package Type</th><th>Quantity</th><th>Length</th><th>Width</th><th>Height</th><th>Unit</th><th>Weight</th><th>Volume Weight</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function qrMarkup(value) {
  const text = String(value || "").trim();
  let src = "";
  if (text && typeof window.qrcode === "function") {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(text, "Byte");
      qr.make();
      src = qr.createDataURL(3, 4);
    } catch (error) {
      console.warn("Unable to generate local QR code:", error);
    }
  }
  return src
    ? `<img class="qr-code" decoding="sync" src="${src}" alt="QR ${escapeHtml(text)}" />`
    : `<span class="qr-code qr-code-unavailable" role="img" aria-label="QR unavailable">QR unavailable</span>`;
}

function invoiceDocumentHtml(record) {
  const shipmentItem = state.shipments.find((row) => row.jobNo === record.shipmentNo);
  const tariffItem = assignedTariffForShipment(shipmentItem);
  const customerItem = state.customers.find((row) => row.name === record.customer || row.code === shipmentItem?.customerCode);
  const invoiceLines = invoiceChargeLines(record, shipmentItem, tariffItem);
  const invoiceTotal = invoiceLines.reduce((sum, line) => sum + Number(line.amount || 0), 0) || Number(record.revenue || 0);
  const billToAddress = shipmentItem?.billingParty1Address || shipmentItem?.customerAddress || customerItem?.fullAddress || customerItem?.locationOrLane || "";
  const shipToName = shipmentItem?.consigneeName || shipmentItem?.deliveryLocation || shipmentItem?.customer || record.customer;
  const shipToAddress = shipmentItem?.consigneeAddress || shipmentItem?.deliveryAddress || "";
  return documentShell(
    `Bill ${record.invoiceNo}`,
    "Invoice",
    record.invoiceNo,
    record.date,
    `
      <section class="invoice-party-grid">
        <div><h2>BILL TO</h2><strong>${escapeHtml(shipmentItem?.billTo1 || record.customer)}</strong><p>${escapeHtml(billToAddress)}</p><p>${escapeHtml(shipmentItem?.billingParty1Email || customerItem?.email || "")}</p></div>
        <div><h2>SHIP TO</h2><strong>${escapeHtml(shipToName)}</strong><p>${escapeHtml(shipToAddress)}</p><p>${escapeHtml(shipmentItem?.deliveryMobile || shipmentItem?.consigneeMobile || "")}</p></div>
      </section>
      <table class="invoice-info-table"><tbody>
        <tr><th>INVOICE NO.</th><th>DATE</th><th>TOTAL DUE</th><th>DUE DATE</th><th>TERMS</th><th>ENCLOSED</th></tr>
        <tr><td>${escapeHtml(record.invoiceNo)}</td><td>${escapeHtml(display(record.date))}</td><td>${escapeHtml(invoiceCurrency(record, shipmentItem))} ${money(invoiceTotal)}</td><td>${escapeHtml(display(invoiceDueDate(record.date, shipmentItem?.billingParty1CreditTerms)))}</td><td>${escapeHtml(shipmentItem?.billingParty1CreditTerms || customerItem?.terms || "Net 30")}</td><td></td></tr>
      </tbody></table>
      <table class="invoice-info-table"><tbody>
        <tr><th>SHIP VIA</th><th>TRACKING NO.</th><th>FROM / TO</th><th>GR / VOL WEIGHT</th><th>JOB NO.</th></tr>
        <tr><td>${escapeHtml(shipmentViaValue(shipmentItem))}</td><td>${escapeHtml(shipmentItem?.airwayBillNo || shipmentItem?.tcnNumber || "")}</td><td>${escapeHtml(invoiceFromTo(shipmentItem))}</td><td>${escapeHtml(invoiceWeightText(shipmentItem))}</td><td>${escapeHtml(record.shipmentNo)}</td></tr>
      </tbody></table>
      <table class="invoice-lines-table">
        <thead><tr><th>ACTIVITY</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead>
        <tbody>${invoiceLines.map((line) => `<tr><td>${escapeHtml(line.activity)}</td><td>${escapeHtml(line.qty)}</td><td>${money(line.rate)}</td><td>${money(line.amount)}</td></tr>`).join("")}</tbody>
      </table>
      <section class="invoice-footer-grid">
        <div>
          <strong>Banking Details:</strong>
          <p>National Bank Of Kuwait (NBK)</p>
          <p>Apollo Freight Solutions Co. W.L.L</p>
          <p>Account No.2018077826</p>
          <p>IBAN: KW52NBOK0000000000002018077826</p>
          <p>Swift Code: NBOKKWKW</p>
        </div>
        <div class="invoice-balance"><span>BALANCE DUE</span><strong>${escapeHtml(invoiceCurrency(record, shipmentItem))} ${money(invoiceTotal)}</strong></div>
      </section>
      <section class="invoice-note">
        <strong>Note:</strong>
        <p>- Additional 1% of invoice value will be charged if credit limits exceeded.</p>
        <p>- Any disputed amount or clarification must be raised within maximum 7 days from invoice receipt, otherwise the invoice is considered accepted in full and due for payment.</p>
      </section>
    `
  );
}

function invoiceChargeLines(record, shipmentItem, tariffItem) {
  const savedLines = parseInvoiceLineItems(record.invoiceLinesJson || "[]").map((line) => ({
    activity: line.description || line.activity || "Charges",
    qty: Number(line.qty || 1),
    rate: Number(line.rate || 0),
    amount: Number(line.amount || invoiceLineAmount(line) || 0)
  }));
  if (savedLines.length) return savedLines;
  const chargeableWeight = Number(record.chargeableWeight || effectiveChargeableWeightForShipment(shipmentItem) || 0);
  const tariffLines = invoiceLinesFromTariff(shipmentItem, tariffItem, chargeableWeight)
    .map((line) => ({ activity: line.description || "Charges", qty: Number(line.qty || 1), rate: Number(line.rate || 0), amount: Number(line.amount || invoiceLineAmount(line) || 0) }));
  const approvedCharges = state.additionalCharges
    .filter((row) => row.shipmentNo === record.shipmentNo && row.status !== "Rejected")
    .map((row) => ({ activity: row.chargeType || "Charges", qty: 1, rate: row.totalAmount || row.amount || 0, amount: row.totalAmount || row.amount || 0 }));
  const lines = [...tariffLines, ...approvedCharges];
  if (lines.length) return lines;
  return [{ activity: shipmentItem?.natureOfGoods || "Freight Charges", qty: 1, rate: Number(record.revenue || 0), amount: Number(record.revenue || 0) }];
}

function invoiceCurrency(record, shipmentItem) {
  return record?.currency || shipmentItem?.currency || state.additionalCharges.find((row) => row.shipmentNo === record.shipmentNo)?.currency || "KWD";
}

function invoiceDueDate(dateValue, terms = "") {
  const days = Number(String(terms || "").match(/\d+/)?.[0] || 30);
  const base = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function shipmentViaValue(shipmentItem) {
  if (!shipmentItem) return "";
  const explicit = String(shipmentItem.shipmentVia || shipmentItem.transportMode || "").trim();
  if (explicit) return explicit;
  const service = String(shipmentItem.shipmentService || "").trim().toUpperCase();
  const viaByService = {
    AE: "Air", AI: "Air",
    SE: "Sea", SI: "Sea",
    LE: "Land", LI: "Land",
    FE: "FTL", FI: "FTL",
    WHC: "Warehouse",
    CONSOLIDATION: "Consolidation"
  };
  return viaByService[service] || "";
}

function invoiceFromTo(shipmentItem) {
  if (!shipmentItem) return "";
  const from = shipmentItem.origin || shipmentItem.shipperName || shipmentItem.pickupLocation || "";
  const to = shipmentItem.destination || shipmentItem.consigneeName || shipmentItem.deliveryLocation || "";
  return [from, to].filter(Boolean).join(" / ");
}

function invoiceWeightText(shipmentItem) {
  if (!shipmentItem) return "";
  const gross = Number(shipmentItem.actualKg || 0);
  const chargeable = effectiveChargeableWeightForShipment(shipmentItem);
  return `${money(gross || chargeable)} KGS`;
}

function tariffDocumentHtml(record) {
  const charges = parseTariffChargeLines(record.additionalChargesJson || "[]");
  return documentShell(
    `Tariff ${record.tariffNo}`,
    "Tariff Quotation",
    record.tariffNo,
    today(),
    `
      <section class="document-summary">
        <div>
          <span>Customer</span>
          <strong>${escapeHtml(record.consigneeName || record.customer)}</strong>
          <small>${escapeHtml(record.origin)} to ${escapeHtml(record.destination)}</small>
        </div>
        <div>
          <span>Grand Total</span>
          <strong>${money(record.grandTotal)}</strong>
          <small>${escapeHtml(record.tariffNo)}</small>
        </div>
      </section>
      <section class="meta">
        <p><strong>Tariff Number</strong><span>${escapeHtml(record.tariffNo)}</span></p>
        <p><strong>Customer</strong><span>${escapeHtml(record.customer)}</span></p>
        <p><strong>Origin</strong><span>${escapeHtml(record.origin)}</span></p>
        <p><strong>Destination</strong><span>${escapeHtml(record.destination)}</span></p>
        <p><strong>Main Section</strong><span>${escapeHtml(record.mainSection)}</span></p>
        <p><strong>Currency</strong><span>${escapeHtml(record.currency || "KD")}</span></p>
      </section>
      <h2>Weight Section</h2>
      ${tariffWeightRateTableHtml(record)}
      <h2>Charges</h2>
      ${tariffChargeTable(charges, Number(record.additionalChargesTotal || 0), Number(record.grandTotal || 0), false, { showTotalRow: false })}
    `
  );
}

function tcnDocumentHtml(record) {
  const shipmentRecord = shipmentForTcn(record);
  const mergedRecord = mergeFilled(shipmentRecord, record);
  const cargoLines = parsePalletDimensions(mergedRecord.cargoItemsJson || mergedRecord.palletDimensionsJson || "[]");
  const printOnlyCargoDetails = isChecked(mergedRecord.printOnlyCargoDetails);
  const totalVolumetricWeight = cargoLines.reduce((sum, line) => sum + cargoVolumetricWeight(line.count || line.quantity, line.length, line.width, line.height, line.dimensionUnit || "CM", mergedRecord.volumeCategory), 0);
  const cargoPieces = cargoLines.reduce((sum, line) => sum + Number(line.quantity || line.count || 0), 0);
  const totalPieces = Number(mergedRecord.pieces || 0) || cargoPieces || "";
  const totalGrossWeight = cargoLines.reduce((sum, line) => sum + Number(line.weightKg || line.weight || 0), 0) || Number(mergedRecord.actualKg || 0);
  const grandTotalCbm = Number(mergedRecord.cbm || roundUpToHalf(cargoLines.reduce((sum, line) => sum + cargoVolumeCbm(line.count || line.quantity, line.length, line.width, line.height, line.dimensionUnit || "CM"), 0)));
  const chargeableWeight = roundUpToWholeKg(Math.max(totalGrossWeight, totalVolumetricWeight, Number(mergedRecord.chargeableKg || 0)));
  return documentShell(
    `TCN ${mergedRecord.tcnNumber || mergedRecord.jobNo}`,
    "Truck Consignment Note - TCN / WAYBILL",
    mergedRecord.tcnNumber || mergedRecord.jobNo,
    mergedRecord.bookingDate || today(),
    `
      <section class="tcn-grid">
        <div><span>WAYBILL NUMBER</span><strong>${escapeHtml(mergedRecord.tcnNumber || mergedRecord.airwayBillNo || mergedRecord.jobNo)}</strong></div>
        <div><span>DATE</span><strong>${escapeHtml(mergedRecord.bookingDate || today())}</strong></div>
        <div><span>PLACE</span><strong>${escapeHtml(mergedRecord.origin || mergedRecord.pickupLocation || "")}</strong></div>
        <div><span>ORIGIN</span><strong>${escapeHtml(mergedRecord.origin || "")}</strong></div>
        <div><span>DESTINATION</span><strong>${escapeHtml(mergedRecord.destination || "")}</strong></div>
        <div><span>CARRIER No & DATE</span><strong>${escapeHtml(mergedRecord.vehicleNo || mergedRecord.tripNo || "")} ${escapeHtml(mergedRecord.shipmentDate || "")}</strong></div>
      </section>
      <section class="tcn-two-col">
        <div><span>SHIPPER</span><strong>${escapeHtml(mergedRecord.shipperName || mergedRecord.customer || "")}</strong><p>${escapeHtml(mergedRecord.shipperAddress || "")}</p><p>${escapeHtml(mergedRecord.shipperCountry || "")}</p></div>
        <div><span>PICKUP LOCATION</span><strong>${escapeHtml(mergedRecord.pickupLocation || "")}</strong><p>${escapeHtml(mergedRecord.pickupAddress || "")}</p><p>${escapeHtml(mergedRecord.pickupContactPerson || "")} ${escapeHtml(mergedRecord.pickupMobile || "")}</p></div>
      </section>
      <section class="tcn-two-col">
        <div><span>CONSIGNEE</span><strong>${escapeHtml(mergedRecord.consigneeName || mergedRecord.customer || "")}</strong><p>${escapeHtml(mergedRecord.consigneeAddress || "")}</p><p>${escapeHtml(mergedRecord.consigneeCountry || "")}</p></div>
        <div><span>NOTIFY & DELIVERY ADDRESS</span><strong>${escapeHtml(mergedRecord.deliveryLocation || mergedRecord.notifyPartyName || "")}</strong><p>${escapeHtml(mergedRecord.deliveryAddress || mergedRecord.notifyPartyAddress || "")}</p><p>${escapeHtml([mergedRecord.deliveryContactPerson || mergedRecord.notifyContactPerson || "", mergedRecord.deliveryMobile || mergedRecord.notifyMobile || ""].filter(Boolean).join(" | "))}</p></div>
      </section>
      <section class="tcn-grid tcn-cargo-head">
        <div><span>CARGO TYPE</span><strong>${escapeHtml(mergedRecord.vehicleType || mergedRecord.transportMode || "GENERAL CARGO")}</strong></div>
        <div><span>LOAD TYPE</span><strong>${escapeHtml(mergedRecord.loadType || "")}</strong></div>
        <div><span>CUSTOMER REFERENCE</span><strong>${escapeHtml(mergedRecord.customerReference || "")}</strong></div>
        <div><span>REMARKS</span><strong>${escapeHtml(mergedRecord.shipmentRemarks || "")}</strong></div>
      </section>
      <h2>CARGO DETAILS</h2>
      <table class="tcn-cargo-table">
        <thead><tr><th>No Of Pieces / Pallets</th><th>Grand Total CBM</th><th>Gross Weight (Kgs)</th><th>Chargeable Weight (Kgs)</th><th>Nature of Goods</th></tr></thead>
        <tbody><tr><td>${escapeHtml(totalPieces)}</td><td>${escapeHtml(grandTotalCbm)}</td><td>${money(totalGrossWeight)}</td><td>${money(chargeableWeight)}</td><td>${escapeHtml(mergedRecord.natureOfGoods || "")}</td></tr></tbody>
      </table>
      ${printOnlyCargoDetails ? "" : tcnDimensionsTable(cargoLines, mergedRecord.volumeCategory)}
      <section class="tcn-terms-tracking-layout">
        <div class="tcn-terms-column">${tcnTermsHtml()}</div>
        <aside class="tcn-tracking-notice">
          <strong>Track your shipment</strong><a href="https://www.apollo-freight.com/tracking.html">https://www.apollo-freight.com/tracking.html</a>
        </aside>
      </section>
      <section class="tcn-signatures">
      </section>
    `,
    { hideDefaultSignatures: true, companyName: record.documentCompanyName, logoUrl: record.documentCompanyLogoUrl }
  );
}

function shipmentForTcn(record) {
  const byJob = state.shipments.find((row) => record.jobNo && row.jobNo === record.jobNo);
  if (byJob) return byJob;
  const byTcn = state.shipments.find((row) => record.tcnNumber && row.tcnNumber === record.tcnNumber);
  if (byTcn) return byTcn;
  return state.shipments.find((row) => record.airwayBillNo && row.airwayBillNo === record.airwayBillNo) || {};
}

function mergeFilled(base, override) {
  const merged = { ...(base || {}) };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") merged[key] = value;
  });
  return merged;
}

function tcnDimensionsTable(lines, volumeCategory = "") {
  const rows = lines.length
    ? lines.map((line, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(line.packageType || "Pallet")}</td><td>${escapeHtml(line.quantity || line.count || "")}</td><td>${escapeHtml(line.length || "")}</td><td>${escapeHtml(line.width || "")}</td><td>${escapeHtml(line.height || "")}</td><td>${escapeHtml(line.dimensionUnit || "CM")}</td><td>${money(line.weightKg || line.weight || 0)}</td></tr>`).join("")
    : `<tr><td colspan="8">No dimensions recorded.</td></tr>`;
  return `<h2>DIMENSIONS</h2><table><thead><tr><th>Sr</th><th>Package</th><th>Qty</th><th>Length</th><th>Width</th><th>Height</th><th>Unit</th><th>Gross Weight</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tcnTermsHtml() {
  const terms = [
"These Terms apply to all transport, freight forwarding, customs clearance coordination, storage, handling, collection and delivery services performed by the Company.",
"By placing a booking, accepting a quotation, handing over cargo, signing a TCN, receiving delivery, or paying any invoice, the Customer accepts these Terms.",
"These Terms override any conflicting terms issued by the Customer, consignee, supplier or third party, unless the Company agrees otherwise in writing.",
"The Customer confirms that it is the owner of the cargo or is authorized by the owner to instruct the Company.",
"The Customer is fully responsible for providing accurate and complete shipment details, including cargo description, quantity, weight, dimensions, value, HS code, origin, destination, invoice, packing list, permits and customs documents.",
"The Customer is responsible for all consequences arising from incorrect, incomplete, late or misleading documents or declarations, including customs fines, penalties, delays, storage, demurrage, seizure, re-export, destruction or additional charges.",
"The Customer must declare in writing before collection if the cargo is fragile, valuable, dangerous, restricted, perishable, temperature-sensitive, bonded, time-critical or requires special handling.",
"The Customer is responsible for proper packing, wrapping, palletizing, labeling and cargo readiness. The Company is not liable for loss or damage caused by weak packing, poor palletizing, concealed damage, leakage, breakage, insufficient wrapping or unsuitable packaging.",
"Unless agreed in writing, loading at origin and unloading at destination are the Customer’s responsibility. Any assistance by the Company, driver or subcontractor is at the Customer’s risk unless proven gross negligence is established.",
"The Company is not responsible for the contents, count, weight, condition or shortage inside sealed cartons, pallets, trailers, containers or packages. Acceptance of cargo confirms only apparent external condition.",
"Any weights, quantities, measurements or descriptions shown on the TCN are based on information supplied by the Customer unless verified and confirmed by the Company in writing.",
"Transit times, border crossing times, customs clearance times and delivery dates are estimates only and are not guaranteed unless expressly agreed in writing.",
"The Company may choose the route, vehicle, driver, border, subcontractor, consolidation method and delivery sequence at its discretion.",
"The Company may consolidate, reload, transfer, cross-dock, store or transship cargo where operationally required, unless the Customer has paid for a dedicated exclusive truck service.",
"The Company is not liable for delay caused by customs, border congestion, government action, road closure, accident, breakdown, weather, war, unrest, force majeure, incomplete documents, customer delay, consignee delay or events outside the Company’s reasonable control.",
"Freight charges do not include cargo insurance unless expressly agreed and charged separately. The Customer is responsible for arranging cargo insurance for the full cargo value if full-value protection is required.",
"The Company shall only be liable for direct physical loss of or damage to cargo where the Customer proves that such loss or damage was directly caused by the Company’s proven fault during the period in which the cargo was in the Company’s care, custody and control.",
"The Company’s liability, if any, shall be strictly limited to the coverage, terms, conditions, exclusions, deductibles and maximum limits of the Company’s applicable haulage / carrier liability insurance policy.",
"The Company shall not be liable for any amount, loss, claim or damage that is not admitted, covered or paid by the insurer under the applicable haulage / carrier liability insurance policy, unless mandatory law provides otherwise.",
"The Company’s liability shall never exceed the amount actually recoverable and paid under the applicable haulage / carrier liability insurance policy for the affected shipment, after application of all deductibles, exclusions, depreciation, survey findings and policy limits.",
"The Company’s liability is not cargo insurance and shall not be treated as full-value protection for the cargo. The Customer is responsible for arranging its own cargo insurance if it requires protection for the full invoice value, commercial value, profit, delay risk or consequential loss.",
"The Company shall not be liable for loss of profit, loss of sales, loss of market, business interruption, contractual penalties, production delay, loss of goodwill, indirect loss, special loss, punitive loss or consequential damages, whether or not such losses were foreseeable.",
"Nothing in these Terms shall make the Company liable for loss, damage, delay, shortage, customs penalties, authority action, confiscation, rejection, seizure or additional charges caused by incorrect documents, poor packing, inherent nature of the cargo, loading or unloading by others, customer delay, consignee delay, undeclared cargo risks, force majeure, government action, customs action or events outside the Company’s reasonable control.",
"Dangerous, prohibited, illegal, restricted, hazardous, flammable, explosive, toxic, controlled or sanctioned cargo must not be handed to the Company unless declared in writing and accepted by the Company in writing before collection.",
"The Customer is fully liable for all claims, fines, penalties, damages, injury, clean-up cost, delay, legal cost or authority action arising from undeclared, misdeclared, illegal, dangerous or restricted cargo.",
"The Company may refuse, suspend, return, unload, store, abandon, destroy or hand over to authorities any cargo that is unsafe, illegal, misdeclared, restricted, unpaid, undocumented or unsuitable for transport, at the Customer’s risk and expense.",
"All customs duties, taxes, deposits, government charges, inspection fees, penalties, storage, demurrage, waiting time, re-delivery, cancellation, documentation and additional charges are payable by the Customer on demand.",
"If no credit facility is approved in writing, all charges are payable before release or delivery.",
"The Customer shall pay all invoices without set-off, deduction, withholding or counterclaim. Any claim must be handled separately and does not justify withholding freight, duties, deposits or other charges.",
"The Company may suspend services, hold cargo, hold documents, cancel credit terms, require advance payment, or refuse delivery if any amount is overdue or if payment risk becomes unacceptable.",
"The Company has a general and particular lien over all cargo, documents and goods in its possession or control for any amount owed by the Customer, whether related to the same shipment or any previous shipment.",
"If payment is not made after notice, the Company may store, sell, dispose of, return or otherwise deal with the cargo as permitted by law, and all related costs remain payable by the Customer.",
"The Company may subcontract all or part of the services. All protections, exclusions, defenses and limits of liability available to the Company also apply to its employees, drivers, agents, subcontractors and service providers.",
"The Customer shall indemnify and protect the Company against all claims, losses, damages, fines, penalties, costs and legal expenses arising from incorrect documents, misdeclaration, unpaid charges, customs issues, poor packing, illegal cargo, dangerous cargo, customer delay, consignee delay, or breach of these Terms.",
"Any visible loss or damage must be clearly written on the delivery note or TCN at the time of delivery. A clean signature is evidence that the cargo was received in good apparent order and condition.",
"Concealed damage must be reported in writing within 3 calendar days from delivery. Non-delivery, shortage or delay claims must be reported in writing within 7 calendar days.",
"All claims must be supported by documents, photos, invoice value, packing list, damage report, proof of actual loss and any other evidence requested by the Company.",
"No claim shall be accepted if the cargo, packaging or evidence is not preserved for inspection by the Company or its insurer.",
"Any legal action against the Company must be started within 9 months from the delivery date, expected delivery date, or the date the services ended, whichever is earlier, unless mandatory law provides otherwise.",
"The Company is not liable for failure or delay caused by force majeure, including war, civil unrest, border closure, customs system failure, government restriction, accident, road closure, natural disaster, fire, flood, strike, fuel shortage, cyberattack, sanctions, epidemic, pandemic, or any event beyond the Company’s reasonable control.",
"Email, WhatsApp, scanned copies, electronic signatures, digital proof of delivery and electronic shipment records are valid evidence of instructions, acceptance, delivery and charges.",
"Delivery may be made to the consignee, warehouse, receiving staff, security gate, nominated agent or any person appearing to have authority to receive cargo at the stated delivery location.",
"If the consignee refuses or delays delivery, or if documents or payment are missing, the Company may store, return, re-route or hold the cargo at the Customer’s risk and expense.",
"These Terms are governed by the laws of the United Arab Emirates, unless mandatory law requires otherwise. Any dispute shall be subject to the courts or dispute forum selected by the Company, unless otherwise agreed in writing.",
"By instructing the Company, the Customer confirms that it accepts these Terms and understands that the Company’s liability is limited and that cargo insurance should be arranged separately for full-value protection."

  ];
  return `<section class="tcn-terms"><h2>Terms and Conditions:</h2><ol>${terms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol></section>`;
}

// A shipment can be delivered in multiple parts (e.g. 10 of 26 pallets to one location today, the
// other 16 to a different location later) - each part is a "split", stored as one entry in this
// array on the shipment (podSplitsJson). Every split has its own delivery location/receiver/
// signature/date and its own POD file/PDF; the shipment only becomes fully "Delivered" once the
// pieces across all splits add up to the shipment's total pieces.
function parsePodSplits(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function podDeliveredByValue(record = {}) {
  const existing = String(record.deliveredBy || "").trim();
  if (existing) return existing;
  return [
    ["Name", record.driverName],
    ["Number", record.driverNumber || record.driverMobile],
    ["Vehicle", record.vehicleNo]
  ]
    .filter(([, value]) => String(value || "").trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join(" / ");
}
function podSplitsDeliveredPieces(splits) {
  return splits.reduce((sum, split) => sum + Number(split.pieces || 0), 0);
}
function podSplitsRemainingPieces(shipmentItem) {
  const totalPieces = Number(shipmentItem.pieces || 0);
  if (!totalPieces) return 0;
  const delivered = podSplitsDeliveredPieces(parsePodSplits(shipmentItem.podSplitsJson));
  return Math.max(0, totalPieces - delivered);
}

// Shared lookup for the per-part POD dialog actions (View, Download, Upload) - finds the shipment
// and the exact recorded delivery (split) by job number + split number, or null if either is
// missing (e.g. stale DOM after a reload).
function findShipmentAndPodSplit(jobNo, splitNo) {
  const shipment = state.shipments.find((row) => row.jobNo === String(jobNo || "").trim());
  if (!shipment) return null;
  const split = parsePodSplits(shipment.podSplitsJson).find((item) => Number(item.splitNo) === Number(splitNo));
  if (!split) return null;
  return { shipment, split };
}

function parsePalletDimensions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function roundUpToHalf(value) {
  return Math.ceil(Number(value || 0) * 10) / 10;
}

function roundUpToWholeKg(value) {
  return Math.ceil(Number(value || 0));
}

function palletDimensionPrintTable(lines, roundedTotal) {
  const rows = lines.length
    ? lines.map((line, index) => `<tr><td>${index + 1}</td><td>${line.count}</td><td>${line.length}</td><td>${line.width}</td><td>${line.height}</td><td>${money(line.total)}</td></tr>`).join("")
    : `<tr><td colspan="6">No pallet dimensions added.</td></tr>`;
  return `<h2>Pallet Dimensions</h2><table>
    <thead><tr><th>Sr no</th><th>No of pallets</th><th>Length</th><th>Width</th><th>Height</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th colspan="5">Grand total CBM</th><th>${roundedTotal}</th></tr></tfoot>
  </table>`;
}

function documentShell(title, documentLabel, documentNo, documentDate, body, options = {}) {
  const printedAt = formatDateTimeNow();
  const generatedBy = currentUserName();
  const companyName = options.companyName || state.settings.companyName || "APOLLO FREIGHT SOLUTIONS";
  const logoUrl = String(options.logoUrl || state.settings.companyLogoUrl || "").trim() || defaultDocumentLogoUrl();
  const pageSize = options.landscape ? "A4 landscape" : "A4 portrait";
  const pageWidth = options.landscape ? "297mm" : "210mm";
  const pageMinHeight = options.landscape ? "210mm" : "297mm";
  const fallbackLogoUrl = defaultDocumentLogoUrl();
  const logoMarkup = `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo" onerror="this.onerror=null;this.src='${escapeHtml(fallbackLogoUrl)}'" />`;
  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(title)}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #edf2f7; color: #172033; font-family: Arial, sans-serif; }
        .page { width: ${pageWidth}; min-height: ${pageMinHeight}; margin: 0 auto; background: #fff; box-shadow: 0 20px 55px rgba(22, 32, 51, .16); }
        .toolbar { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; background: #fff8f2; border-bottom: 1px solid #d96f16; }
        button { border: 0; border-radius: 6px; padding: 10px 14px; background: #d96f16; color: #fff; font-weight: 700; cursor: pointer; }
        .document-head { display: grid; grid-template-columns: 1fr auto; gap: 20px; padding: 28px 34px; color: #172033; background: #fff; border-top: 8px solid #d96f16; border-bottom: 1px solid #d96f16; }
        .brand { display: flex; align-items: center; gap: 16px; }
        .logo { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 12px; background: #fff; color: #d96f16; font-size: 22px; font-weight: 800; overflow: hidden; border: 1px solid #d96f16; }
        .logo img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
        h1 { margin: 0; color: #111; font-size: 28px; letter-spacing: 0; }
        h1 .afs-initial { color: #d96f16; }
        .brand p, .doc-meta p { margin: 4px 0 0; color: #607080; }
        .doc-meta { text-align: right; min-width: 210px; }
        .doc-meta strong { display: block; color: #111; font-size: 20px; }
        main { padding: 28px 34px 34px; }
        .document-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
        .document-summary div { padding: 18px; border-left: 5px solid #d96f16; background: #fff8f2; }
        .document-summary span, .meta strong, th, .signature span { color: #5d6c7b; text-transform: uppercase; font-size: 11px; font-weight: 800; letter-spacing: 0; }
        .document-summary strong { display: block; margin-top: 7px; color: #172033; font-size: 22px; }
        .document-summary small { display: block; margin-top: 5px; color: #607080; }
        .document-summary .pod-consignee { color: #172033; font-size: 18px; font-weight: 800; }
        h2 { margin: 26px 0 8px; color: #111; }
        .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
        .meta p { display: grid; gap: 5px; margin: 0; padding: 12px; border: 1px solid #d96f16; background: #fff; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #fff3e8; text-align: left; }
        th, td { border: 1px solid #d96f16; padding: 10px; }
        tfoot th { background: #fff3e8; color: #172033; font-size: 13px; }
        .qr-code { width: 76px; height: 76px; display: block; margin-top: 8px; }
        .status-pill { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #fff3e8; color: #111; font-size: 16px; }
        .signature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 48px; }
        .signature { min-height: 86px; border-top: 1px solid #d96f16; padding-top: 10px; }
        .signature strong { display: block; margin-top: 5px; }
        .delivery-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
        .delivery-signatures div { min-height: 92px; border: 1px solid #d96f16; padding: 8px; background: #fff; }
        .delivery-signatures span, .delivery-signatures small { display: block; color: #5d6c7b; text-transform: uppercase; font-size: 11px; font-weight: 800; margin-top: 6px; }
        .delivery-signatures strong, .delivery-signatures em, .delivery-signatures b { display: block; min-height: 20px; margin-top: 4px; color: #172033; font-style: normal; }
        .delivery-signatures .remark-line { border-bottom: 1px solid #172033; height: 16px; min-height: 16px; margin-top: 2px; }
        .receiver-remarks-block { grid-column: 1 / -1; margin-top: 10px; border: 1px solid #d96f16; padding: 10px 12px; background: #fff; }
        .receiver-remarks-block > span { display: block; color: #5d6c7b; text-transform: uppercase; font-size: 11px; font-weight: 800; margin-bottom: 8px; }
        .receiver-remarks-block .remark-line { border-bottom: 1px solid #172033; height: 22px; }
        .receiver-remarks-block .remark-line + .remark-line { margin-top: 12px; }
        .acknowledgement { border: 1px solid #d96f16; padding: 10px 12px; margin: 12px 0 0; font-size: 12px; color: #172033; }
        .tcn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border: 1px solid #d96f16; margin-bottom: 10px; }
        .tcn-grid div, .tcn-two-col div { min-height: 62px; padding: 9px; border-right: 1px solid #d96f16; overflow-wrap: anywhere; }
        .tcn-grid div:last-child, .tcn-two-col div:last-child { border-right: 0; }
        .tcn-grid span, .tcn-two-col span, .tcn-signatures span { display: block; color: #172033; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
        .tcn-grid strong, .tcn-two-col strong { display: block; font-size: 14px; color: #172033; }
        .tcn-two-col { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #d96f16; margin-bottom: 10px; }
        .tcn-two-col p { margin: 5px 0 0; font-size: 13px; line-height: 1.35; }
        .tcn-cargo-head { grid-template-columns: 1fr 1fr; }
        .tcn-cargo-table th, .tcn-cargo-table td { text-align: center; }
        .tcn-cargo-table td { font-size: 11px; }
        .tcn-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 44px; }
        .tcn-signatures div { min-height: 92px; border-top: 1px solid #d96f16; padding-top: 8px; }
        .tcn-terms { margin-top: 18px; font-size: 10px; line-height: 1.35; }
        .tcn-terms h2 { margin-top: 0; font-size: 14px; }
        .tcn-terms ol { margin: 6px 0 0 18px; padding: 0; }
        .tcn-terms p { font-weight: 700; margin-top: 8px; }
        .tcn-terms-tracking-layout { position: relative; margin-top: 18px; page-break-inside: auto; break-inside: auto; page-break-before: auto; break-before: auto; }
        .tcn-terms-column { width: 100%; }
        .tcn-terms-column .tcn-terms { margin-top: 0; }
        .tcn-terms-column .tcn-terms h2 { display: block; padding-right: 280px; }
        .tcn-tracking-notice { position: absolute; top: 0; right: 0; margin: 0; padding: 0; text-align: right; white-space: nowrap; }
        .tcn-tracking-notice strong, .tcn-tracking-notice a { display: inline; }
        .tcn-tracking-notice strong { color: #172033; font-size: 10px; font-weight: 700; }
        .tcn-tracking-notice a { margin-left: 4px; color: #075985; font-size: 9px; font-weight: 700; overflow-wrap: anywhere; text-decoration: underline; }
        .manifest-header-grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d96f16; margin-bottom: 10px; }
        .manifest-header-grid p { min-height: 42px; margin: 0; padding: 7px; border-right: 1px solid #d96f16; border-bottom: 1px solid #d96f16; }
        .manifest-header-grid p:nth-child(4n) { border-right: 0; }
        .manifest-header-grid strong { display: block; font-size: 10px; color: #172033; text-transform: uppercase; }
        .manifest-header-grid span { display: block; margin-top: 4px; font-size: 12px; color: #172033; overflow-wrap: anywhere; }
        .manifest-table { table-layout: fixed; font-size: 9px; }
        .manifest-table th, .manifest-table td { padding: 5px; border-color: #d96f16; vertical-align: middle; text-align: center; overflow-wrap: anywhere; }
        .manifest-table th { background: #fff3e8; color: #172033; }
        .manifest-table tfoot th { font-size: 10px; }
        .manifest-declaration { display: grid; grid-template-columns: 140px 1fr 120px; align-items: center; gap: 10px; margin-top: 12px; font-size: 11px; }
        .manifest-declaration p { margin: 0; }
        .manifest-declaration span { text-align: right; font-weight: 700; }
        .manifest-stamps { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 20px; }
        .manifest-stamps div { min-height: 72px; border-top: 1px solid #d96f16; padding-top: 8px; font-size: 11px; font-weight: 700; text-align: center; }
        .invoice-party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 16px; }
        .invoice-party-grid div { min-height: 104px; border: 1px solid #d96f16; padding: 12px; background: #fff; }
        .invoice-party-grid h2 { margin: 0 0 8px; font-size: 13px; color: #111; }
        .invoice-party-grid strong, .invoice-party-grid p { display: block; margin: 4px 0; overflow-wrap: anywhere; }
        .invoice-info-table { table-layout: fixed; margin-top: 10px; font-size: 11px; }
        .invoice-info-table th, .invoice-info-table td { text-align: center; padding: 8px 6px; overflow-wrap: anywhere; }
        .invoice-lines-table { margin-top: 18px; }
        .invoice-lines-table th:nth-child(2), .invoice-lines-table th:nth-child(3), .invoice-lines-table th:nth-child(4),
        .invoice-lines-table td:nth-child(2), .invoice-lines-table td:nth-child(3), .invoice-lines-table td:nth-child(4) { text-align: right; width: 90px; }
        .invoice-footer-grid { display: grid; grid-template-columns: 1fr 240px; gap: 20px; margin-top: 18px; align-items: start; }
        .invoice-footer-grid p { margin: 3px 0; font-size: 11px; }
        .invoice-balance { border-top: 2px solid #d96f16; padding-top: 10px; text-align: right; }
        .invoice-balance span { display: block; color: #5d6c7b; font-size: 11px; font-weight: 800; }
        .invoice-balance strong { display: block; margin-top: 6px; color: #111; font-size: 18px; }
        .invoice-note { margin-top: 14px; font-size: 10px; line-height: 1.35; }
        .invoice-note p { margin: 3px 0; }
        .footer-note { margin-top: 26px; padding-top: 14px; border-top: 1px solid #d96f16; color: #607080; font-size: 12px; text-align: center; }
        @page { size: ${pageSize}; margin: 8mm; }
        @media print {
          body { background: #fff; font-size: 10px; }
          .toolbar { display: none; }
          .page { width: auto; min-height: auto; box-shadow: none; }
          .document-head { padding: 10px 16px; border-top-width: 5px; }
          .logo { width: 58px; height: 58px; border-radius: 8px; }
          h1 { font-size: 20px; }
          .doc-meta strong { font-size: 15px; }
          main { padding: 10px 16px 8mm; }
          h2 { margin: 12px 0 6px; font-size: 14px; break-after: avoid; }
          .document-summary { gap: 8px; margin-bottom: 10px; }
          .document-summary div { padding: 10px; }
          .document-summary strong { font-size: 16px; }
          .meta { gap: 6px; margin-bottom: 8px; }
          .meta p { padding: 7px; }
          th, td { padding: 5px; }
          .signature-grid { margin-top: 24px; gap: 12px; }
          .signature { min-height: 54px; }
          .delivery-signatures { margin-top: 6px; gap: 6px; }
          .delivery-signatures div { min-height: 56px; padding: 6px; }
          .delivery-signatures span, .delivery-signatures small { margin-top: 3px; }
          .delivery-signatures .remark-line { height: 12px; min-height: 12px; margin-top: 1px; }
          .receiver-remarks-block { margin-top: 6px; padding: 6px 8px; }
          .receiver-remarks-block > span { margin-bottom: 5px; }
          .receiver-remarks-block .remark-line { height: 16px; }
          .receiver-remarks-block .remark-line + .remark-line { margin-top: 8px; }
          .acknowledgement { padding: 6px 8px; margin-top: 8px; font-size: 10px; }
          .tcn-terms-tracking-layout { gap: 8px; margin-top: 8px; }
          .tcn-tracking-notice strong { font-size: 9px; }
          .tcn-tracking-notice a { margin-left: 3px; font-size: 8px; }
          .document-summary strong { font-size: 14px; }
          .footer-note { margin-top: 10px; padding-top: 8px; font-size: 10px; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="toolbar"><button id="documentPrintButton" type="button">Print / Save PDF</button></div>
        <header class="document-head">
          <div class="brand">
            <div class="logo">${logoMarkup}</div>
            <div>
              <h1>${companyNameMarkup(companyName)}</h1>
              <p>Freight, logistics and customs documentation</p>
            </div>
          </div>
          <div class="doc-meta">
            <strong>${escapeHtml(documentLabel)}</strong>
            <p>No: ${escapeHtml(documentNo)}</p>
            <p>Date: ${escapeHtml(documentDate)}</p>
          </div>
        </header>
        <main>
          ${body}
          ${options.hideDefaultSignatures ? "" : `<section class="signature-grid">
            <div class="signature"><span>Generated By</span><strong>${escapeHtml(generatedBy)}</strong></div>
            <div class="signature"><span>Receiver Sign</span><strong>&nbsp;</strong></div>
            <div class="signature"><span>Authorized Signature</span><strong>&nbsp;</strong></div>
          </section>`}
          ${options.hidePrintedAt ? "" : `<p class="footer-note">Printed date and time: ${escapeHtml(printedAt)}</p>`}
        </main>
      </div>
    </body>
  </html>`;
}

function defaultDocumentLogoUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAA7CAYAAAA+XsUpAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6RjZGNTc1MjdFMjQ0MTFFNzlBMEFCMjUwMDBGM0Y4OEMiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6RjZGNTc1MjhFMjQ0MTFFNzlBMEFCMjUwMDBGM0Y4OEMiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpGNkY1NzUyNUUyNDQxMUU3OUEwQUIyNTAwMEYzRjg4QyIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpGNkY1NzUyNkUyNDQxMUU3OUEwQUIyNTAwMEYzRjg4QyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PrIqhDoAABeQSURBVHja7F0HmFzVdT6vzM7sSlvVACEkIRACLCEJoQhTjE1zjE1JZIpD+ACbYj5wgNBMDDaQOBgSgmkhIAQ2YDAEMGAwsiSaKYaIthJYCFUkivoWbZudmZd7dv67c/bufW8WrF2ttO9839l9be675bR7zr3nOQ0X7kH9GBygK85d8d81nnEs98znPKDbwzJ88d8Xv+XjBI49cU8+51ne54nnXOO+7ZpZRgIon3WNY69IWWG/G6bwXYXHKtzAHR7kAvJLXCorV8UFRUYr5dFDr22i7z31Ke0o4IMYyhSWKizBtRJgQhwnxXEKvykRxCAHrkScl1jK0/eSQJMBzEG2EbwNbfc9cd0ziD2G7nCgwr00g1Qoov9gY5punbeOBiXcSEnmuw7dXVu/Q3WGJpK0+C8JybEQqSsYwjOksommNPUNwteM50cQuyTqMOknnykRkt21SGFTe/ghUt430A2R6J7oBxJ1lxrQsWg/px/Txd4KX81rBZc2ZwO68936ASkteOBZcbYDY7D3kWdhRBvj2zSfjXn9iPL8CAHjGs8lhRUgGTxhMcVci3CwCb6RsA7ICTrUAr32cfOAHvwYoiEDHEjgqamHU1nuB7e+tIEue379gB18N6b/GCyQraz0g/verqMfzV83oDsiZpAYQijDobVNmbgbYkqIoQdQqfB4hTUxg8QQg4LWhgxdOK2aZu41mE/ZhXWiwmsHWj84/TxQ2O/7j6I9QmHxGNM9bD5neq6KxX9s6JM9iCljU2Eetyo1SV9cmXJvblNW1q53LKMNLVnWIE8oPEXhwwNlgM3or4xxaJekDhD6ooMTIYMoffyeICJb3CJBxV2POlZgEpIjrpnXo+pFojwzXmMSky2y7VgI3hbncIznnSKE7hj95Ie0uc80vpqCrE5ngoca07m1uPScws8V/pryMZLVA4VB9GCXCAZgphhE+ei6jrInqRBtTwnGSVDXGID09fsWqZUwGNC3oBkkDFtO4Ra5LwN4MXwx2EVpkUklnjN396oEa5BWdW2Bwm8rfFDhEVQIMO/QDKKDhP01GuRQ94i5a5HyNuYxI94JC0NHReu9IuemRrWZMvLcj2Bs13guLHLvU/TaqmIazbFYDDbN5KVzwaSKcn/uTYcPp4Mf+Jiv/QkMcojCGxReOBAYpL8Dx3OzwIE0t/EofG2Zbe2ZafKRYaaGLdh0LOUwk9aoix9y77e053S9nocw5fv/pPANhQ/FDBLDthAK/TEI8YFCViXjcH4L5Vf//mVHHYjYzRtDcW4tLHNnM/w1cWuowtsUVsQaJIaBCWqmnvS6+Dl4HvKP4vwb0Czs1VoDDaNxA65/QtvpYtg4DhJD0cnQ4JRH99fW02nPspeXpin8vy9QxBaFSxQuByO9r3CxwpUKG2IGiWFb07fpObPtowk7L1HWVXuQpSWVw5O5I2avpPkrmkap669Tfln8l4UsmOYvYLZl+L+yv5tYZjDKsXhGzOuB5T5Zfmcem89GDXJgHBd7v+kajnKLhgUqzWCorQyfwl3BUdtbzV2Y8jmHoveVmO8KC3LKmFOU+zdsuzH/L1V/tjgezaC27Ir2TIc3aw00gGaQXyn8DJplrMKdKB87ixpTruPewL/DtTqFtQrnUt5bxjGXdH9jEG7YYHRqClhKhcBg0nIuj02/fxiaW3htO/jM2IJ57sUKok+AaWKMwhV6zg7P1eE4f0XhLBwzbeymkM2S8Qp3xn/G0SgrDKoUHgq8TuE7YJY/QmM19wcGaYP6iwqe+T2QlLYlFiZKYrctxZBlmerflHwe2dcwuT3QHmGmhlwl4IX0gV+kj4pt37Vphv4Ix1N77oVzJlfSy6tb+PxtcW+qOOabHwKfEddZ6O5O+b3uByicovBvFJZHvHMK8DLMXR5VOBuT/3gO0o9terfIfyeEiV0Lw0tt61k0ZVRmkhKyL4R0jGtkMRfNTC0+2bf08juGK3wp6TnXb1Gljbt9OdW1ZCfxNUh9JtwTv0Q/7iaY4AgwWqrI79gMe0zhTWCaPtcgMUSDjuoPRMngtDXnAk4DBE/UJ2CQ1Jfsx1XA3yn8KeYjRyv8DuUzq5SGmGHfp/yK4rsU/lxhr+4HjgOFMfSMUBwn2NiSpfZspxdq8VYWsuzRuhlzm8kKLzBMOXNexOvAFin8h5hBYtjm4CUcmr2wnpozneuy3hMeqa29YppdwLdhvnKcwhdDnmPz7wFM6mMGiWHbQaY9R5dMr6aKZCfJLBTzid4C5sanoFWOpPziSBv8BIwSM0gM2wbS2YB2Kffpsumd29LXCCIOevn1/I55Cv+W8rESDU1g1MUwtU6KJ+nbyAQne65f03tk2z5r/jYsy6L0bplJ5Ex3cZgLOmpPS9T+FjPvrxm8LM/maDWlvCtnjCmt61iNVdhR2JfBvM2Uj7tMEtdOgdNgWG8I/DAG0cE/7U408+vqQUpaOtmMT5gEZYux2OIXjmXQzbSdZhluBDG7ogNlWbYNSg6FpxcNW5ZhS5WaIPu+DnMbstvvtblDGWrJ/veE8kTdpGFJql3fVg8P0sY+rskyccy7XseDQXrFm+VHSEyd2jIlGEZH0UvF9ZQgBDPqHbb91kxiLZNZpwwJadsHL/34tmUZMfQCrTS0ZseMHFW68Nh9yqn2pTYOKnNc4rM+rocZ/2Cz64lea3TI9WbqndC+08NnzHVVQUgZTkTZDnVf7yS1g8lsNpPDNFdsuXXNPLqu5dimJc1ovS0Kb9M0cudgsQQaZh2L7VCMSp5R6rjODGrLPd3a0hkK4jjG533MICspv4x+KM4PhiZp6jMG4VhQiedQaYmztadfwVZ6piiLKZuZmtI5K0fyC1x1Y3BJP1I2qj7N6YAyajLsOFtNGMnofNiSm56cc1nl6s9azvae9DsqyNqeV+C+sw1MrFWCQfak/DqvD/qEQXj3WGV1gra05mjR2lZKeNtfUhAmMt7DMHqnVJ7bbQyknlnyeSvlFCM5Tv+o89gRKaooU/SYDbaWMNKJt9u2CrspgfKHt+roF69v0p6l+6mP10ZRfuMVe9D2FzQ8pdcYpLwy0fWKYog3lzXR3e/U0aza+u0yZw5TxljVrhu+PoyaCwkHCh4IJQHXN2fp4vnrKc1pzPtJna+YUUMH7VpKm1r632oWtijq23Kqz9ZRJuj0Xm2rvehmTq7DKJ+KaOsr9tO/UtGtIx5bsoU2tgzIJUcxbB/AiyN/K87fovx+lG0yaY6h/4NjODRcw+ERlQ7Ido9CzuWGOtcoy3TD2/KWhSX68yxlUEiZzTCprsHcioGX2Z8ORhlKhe0U2gSTmT49UW/bimz20DYqfFZhthiDJC1eGOnKdal7ClFfVNAhe35Zc0Bs6USdiMHyjMGx5X5yLIMYRQye0aFuCEF4IYMXRShhHxM1g4sJyzuCkHZSxLlvaYvt03ZhqVDJIFqzTNfST2EBUFscqjcEc8ao718LvGp4drGtrhVUSDeqP9opzxNwsSUEM8mdgjKnrxkLccj+FdkEhW9pDWNWv8h9MxLtxNozhiLAm74OKUYkXyTmIFX8F/1dQNH7y21lR9XB9l6zbJuGcizmhM09ajt3I8q27f+WGsan6N2PYe+NSr8qjxMWAeFFmD62lQNRn7A2Vw8khMaJ2vvuFNFCURiWAHxrwl2xFI2hV7yjIYxnW24UtrynJ593MHdDRi1r8qjnQVL+PX80qDUeyhhiiCGGGP4692AoVKVcOndyVYcBX5X06MWPm2nOiqbtvuFlvkPnTqnqWDaRFbFEXkkwtNyjBz9opNrPdkwNW17idrSdF0nwBqhX17TQM8uaYm6w2YqVSft6JI6aXjC1is7bv4om7Ir98wmXTlvXRq+ozjxv3rrtLpioZ+pnTqygi6bX0D6qXa5LXVd/8TKP0WW0aPaqHYpBeDkNM/+5kyvpgmnVtLdqe8cSGzWmn61vozdXNNMlL62npZvbY66QDLL4B2OsN7K5gGrKE1SqGKgRnZZT10aUenSi6uSLX9z+Pi7PixPfOHUU7TUiRa4ijMb67sSQUwxSOShNbtuOtZKgJuXRm6rto4ckO/aXN9YVxrRa9ctxB9bQqKEltP+slTFXSAYZUuqFSpx0JkcNSpPoxXyu61B7e0BbWjMyJf52JUVHDPbJVUzQ0NzeLxYp9qX25LazPdnQEnQd00xAqYZ2SibirTTdGKQ1ExQlqh0FmBjYpGjfekvKtytoUWOdUH0Q2vZsEHOEySA9fG4XhRcrvJfy2xsl8OeBOZ/qZir4pPkjK89ahNhRlN8BxqkoeaMNZ+V7TzzDaR7PpXzK/P+hrrvV+Df82a8hCu+jrpv3JXAyZM6CwTsTOeU+f7K4Y5tmnZozvby8iY4fP5haC8TA37rgPEx1OOfVA0vxfk5mdhoVNo9xmZyS5knx/D4Kz6D8+p2ACjEATurMM99zqOBbZ7vtfipsG+V3fU/hflRITPAkjhl4lcLZ6Jf/VfgC5VcqnIVr3H+cO+p8tqJEPbkenNaT1yY9whem75yiMt/VPLAr2r0H6shlv2zpS06C8HW0ievMK2bl8vavUj5ZAuftvZW6LqvnPj0Tv7sT96ajPQtw7VTKZ1TcLOrN48xL159GOzlZHK+1KhPt1X3DYzMFfct0NJu6bvTjd/GW4MfEta+g7WnUeR2uT0d7uR9XafrrKYN8S+E/U+HbdBJ407wt9SR/5PFycX495fOsSvgXNOJuQWz8Hl5X84zBIBy4uZryy1fesTAIEw5/L+8E4/qF6BD+jDHd9nYdHT+pknKtuY5NUxjgo43fLEIHMQFdYWmb/pglf99iosJLLM/UYuB/alz/AESzJ4hgL3HvPMpvH2WmaUWbL1I4CucvgDD42u7oH8afkP0rTy+C+HNXHjqUyso9amzIcFm/p66JDy4AMd8r+vo3GHcJ50MY/BHnh6DOa9FfkkFmoNzlEAp872uUX+M0BQzCBH6kpd68Eesjhf9KhfVpDJ+CQSaAWacavzsL47kI54fi/BghsCcKOnwEDDITgtQzxuKwnhid/KPvam3B+6mUIKIRZZ1lrRX/OTfR6zi/CB1IIHpdKZZATwkJfJd4rl4re+q+5TdNhQQBtg1ANwvm4A76A4iKV3fyt715cz/NX9VMd7y2kSorfVkuw8qODguU9nOdeeAerWbaQVRPQOJyfa/Slosohzucl2E/jgFejHpomIfBdyEN90JbHkGfZNCGu0V/6PK1sGimwjbXNIiGJeR8KiQuWAiBwJg7a79KOmiXFLVs6XA8XAvmWA0hpol9NvnOeBzfKpijFs+kYUncg/+6XwiCwPRq1Iux0uO10bBcWNDMhVYmtOtZ1Psjrf0E0/wJx3cK5nhVaL9JqB8Z72Mh8U0cZ8S4bcDx1cLy+Xf0DWdJuaUnDDINphHDbplccPYgxRy3HzlCmk66oiypD0ZjEuJ35+D/G7h/HKT2ZuN+WpRps5TDVoPuC01GGMxJGOAz0CHc2B92cnRTlrT6EFKDpflJjksHUSZ3UZCfm+n8sNyRp8N8u12oZMkg9ZDCJyv8e8p/ImANTMaMEBRsjvwIZpWW3iehT1ii/lm0X7rZdF2qBIGVQwicib7W5uoDMGV/wSdjqtVQqDFrz9tXo/HMr6HhuU2XKtvr9vqW7Ke4/2088xjqeTTekYN5doZ2+hnjYprU5rFMps3H16Hev8H1P0PaX40+v1TQyBXo02OhiRhuAj3x+c/EuBxn1KsUfbITFRLeuRA2o0E/BKF3JTQPlz2nJwxymeBgbZKU5rpvHW8RnbZBcOseMCcYrqHCbrA3Fd6I468ZDPJFYX+YBY0wd3TlHhZmwzRDXZOwexlGqoOxruccSu25kZnWrMmY+rlhhvTUgz4EfcRag3M3jRTzDFfMoxgOwv/noC0SILp1IIpHqZCUQTPXxZCqb1hMCy2Vk2KulJ9slPs0cw/12oaMnpzr73z8EIR5sWrZ02r2fv4nm9JbQHDVMB+lefggJDHDAfj/ZQNFJvEMMoSAvG5OAw4QpuqPxfVrMOfScyOpLfT4PA7tr5fGD8J8Q8+rb4d2Ogqa5MZic5A9IWE+x48e7pAmAR2upNHvjWenwL6cDOlFIJRhgvhXW+x0LQnNjovyM5mMXYn/TGDmNlD9zmpM9OrN0Iee3Dvc1o4aODc6jiPnS8NgwjhC8r9kDKqLST3DzmLQPUu9y4y6TcUEMxAT0okwFQOhOaqKeHK79dmE4UkaP2YQ1a9rzXvxiP4NYzRVa90gCK5VDPKo5ztyLrlBMJNpTtcIUzhsvIIIhggbT9dy3THGqUrUzxSomwx60L/5EH16IISpD+bWAus6zKEmAAnnPy6mQU7D/7dRmQ7vizI/Tt5351KaNrILw/MEexYmctreng9Jm8bkeqJR/tGCsGUHpS1zEMdi35Jhn/P3u79h3NPSdo3ld12cnCxZ8vxBba7TbaAmC+aYS4WEya6okzYdZ1Lhe3ubxUDVi8GV0pC9Zr+DiVRmaGQtxH4F6XcSFTKrF4V0Wr1aaUO30KDlIJIZcGDco1RLm9Ka3x1S6k8XfTlG1K+T38Q8koRGbqfuaXdK8L9JaJo28TvPwkAmIzUaZjeJ+ddYMRfSjDPWeMYXwuwU9GmJ5V2ssYfDfLsU80GGy6MYpBI/0F6sJszsaUtb7pRhe5fvc+pXh8gXfQ4X5RxIKT1hXgAO1jbjt2ACnAH7nMRENiE6dywk8b7CHteENgpSbF88+woGnuE/cZ3f8XO4oaXEJ8+1Si/2gA1VZsgkxSY3pfP2emDMQeYIjedaGOwtMM8CMTh7iGfH4f8TwhV6p5icv4Lr76M9MnP6e7j/JNmzCAYRhCbnMY9R4RuDv2QTS7V5KYuGYVWJaXCyLEedbwBTlOH4SKMvpUk3Ae2bIBiDoFUPEF4v7WjI9IC/xwhzcTf8fx7tGwWTaCdo+NvQ1wTBLJlqb8yRTzTG6zNYSQvBFCzU/gOOjA56jGKQkzDZTYP46yHpWzs6r6H9ImrOSHPhVRDjN+F23CLK0rbsTpCUa4TtzWr7FsNGLwHTrIaZMROSWL/rDjRuEZiA6/dfws/9Ju5rG/VddGBHPOAqxdjNhWUmuhPbg4DqB9eULHx8SePm3y5ulOaRBwl+lXBh/swwoWpAWG1Q9SxcDsNguYIxTkAfPCgcFCvQVq19bwMRVIvyqwVR1hhSWtcjYRAulXDur1KvY0kJJGgO3rNHQBhsHezbpLTMPmPKFt141PAWxJn0hHcBPGWXirnobKPt42AuL8VEeyIYeRlMzTnQOmeLuaHpojfbMxVubT3m90Ggvk6FTO7H453LqfCdkEeFt8vsD54W/EDMb/QcpBTTgleFkOsQVGEMkoLXQvuK90QnsOvqqoDXmaRz34Gcag6ZYEnQvv31qPQQdO77IP5lFjPKFwNQatx3RWcmBVFdCkYuE7bq83BTd1A8r2R1FMGIbECd+7hLEw41bUrT/QvqyOJ1GQbi0Nk0LgehfmKYFQnRh7aPVup6fR/u1DSIf1fU8SpolTDvkNQQTsgcpPP6gk9a6A3F7JUFt/y58Nh5ECY8rulcjs6iEvflysG+tsmvRH0GCZv+ORCibaGa1P6DofFPhraqgMTPwoq4PqQ9OSMwnDSeKxcxilnou0HifbOEhy1sHnsPHDkOtGgatL4U5U/FeLDwPSvsG4VJuLp8qPVGqaYVf8yoGJGs+OXLG1658Lm1ZfAQrYCkjoIhcIGOA7E9I2xtTTzThAdC7zBbAKl8EIguLRhnKVDDaDDdUJgCc/QAeMqWeGbmSDp6bBk1pnMy4stBt4XlKe+j2rWttN+9q/S9EahPPbxH7bBVJ4I55sOUOAx10gkWEghmpmFeSHfou4aJxANwBDTPXCp8VkALielgzncghV3MIXaGBlghiGF/2OW1Yg5EVyuNec1RwzsXKAKOQb03QQguKx9TRnc/v57OfqozPjsOGq8G0nyuMZ6jwGQtQqPkMF6NwiFxAohxHtm/GjUO87tlwlU9CG330Y8pCNQ1hpY5Bn3yrPC0ahiPufEq6poB0sWEfYkYi2rUcwLGiIV6y/8LMABSXLKGd0tYOAAAAABJRU5ErkJggg==";
}
function companyNameMarkup(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `<span class="afs-initial">${escapeHtml(word.slice(0, 1))}</span>${escapeHtml(word.slice(1))}`)
    .join(" ");
}

async function approveShipmentRequest(id, fromDialog = false) {
  const record = state.shipmentRequests.find((row) => row.requestNo === id);
  if (!record) return;
  const notes = fromDialog ? (dialogValue("approvalNotes") || record.approvalNotes || "") : (record.approvalNotes || "");
  const updatedRecord = { ...record, status: "APPROVED", approvalNotes: notes };
  const saved = await persistRecord("shipmentRequest", updatedRecord);
  if (!saved) {
    notifyFailed("Approval not saved", "Could not save this to the server. Please try again.");
    return;
  }
  state.shipmentRequests = state.shipmentRequests.map((row) => rowId("shipmentRequest", row) === id ? updatedRecord : row);
  saveState();
  if (fromDialog) recordDialog.close();
  render();
  notifySuccess("Request approved", `${id} was approved and the customer has been notified.`);
}

async function sendBackShipmentRequest(id, fromDialog = false) {
  const record = state.shipmentRequests.find((row) => row.requestNo === id);
  if (!record) return;
  let notes = fromDialog ? (dialogValue("approvalNotes") || record.approvalNotes || "") : (record.approvalNotes || "");
  if (!notes.trim()) {
    notes = window.prompt("Let the customer know what needs to change before this can be approved:", "") || "";
    if (!notes.trim()) {
      notifyDenied("Send back cancelled", "A note is required so the customer knows what to fix.");
      return;
    }
  }
  const updatedRecord = { ...record, status: "SENT_BACK", approvalNotes: notes };
  const saved = await persistRecord("shipmentRequest", updatedRecord);
  if (!saved) {
    notifyFailed("Send back not saved", "Could not save this to the server. Please try again.");
    return;
  }
  state.shipmentRequests = state.shipmentRequests.map((row) => rowId("shipmentRequest", row) === id ? updatedRecord : row);
  saveState();
  if (fromDialog) recordDialog.close();
  render();
  notifySuccess("Request sent back", `${id} was sent back to the customer for review.`);
}

function convertShipmentRequestToShipment(id) {
  const record = state.shipmentRequests.find((row) => row.requestNo === id);
  if (!record) {
    window.alert("Shipment request not found.");
    return;
  }
  if (denyIfCustomerBlocked(record.customerName, currentBlockCheckBranch(record.branch))) return;
  editing = null;
  dialogState = null;
  const directionMap = { export: "Export", import: "Import", consolidation: "Consolidation" };
  const requestDetails = parseJsonMeta(record.requestDetailsJson || "{}");
  const prefillRecord = {
    customer: record.customerName || "",
    shipmentDirection: directionMap[String(record.shipmentType || "").toLowerCase()] || "",
    origin: record.origin || "",
    destination: record.destination || "",
    consigneeName: record.consignee || "",
    consigneeContactPerson: requestDetails.consigneeContactPerson || "",
    consigneeMobile: requestDetails.consigneeMobile || "",
    deliveryLocation: requestDetails.deliveryLocation || "",
    deliveryAddress: requestDetails.deliveryAddress || "",
    pickupDate: requestDetails.pickupDate || "",
    deliveryDate: requestDetails.deliveryDate || "",
    shipmentVia: requestDetails.shipmentVia || "",
    cargoItemsJson: requestDetails.cargoItemsJson || "[]",
    palletDimensionsJson: requestDetails.cargoItemsJson || "[]",
    pieces: Number(requestDetails.pieces || record.quantity || 0),
    cbm: Number(requestDetails.cbm || 0),
    actualKg: Number(requestDetails.actualKg || record.weight || 0),
    chargeableKg: Number(requestDetails.chargeableKg || 0),
    volumeCategory: requestDetails.volumeCategory || "1 CBM = 250 KG",
    chargeableDivisor: Number(requestDetails.chargeableDivisor || 250),
    natureOfGoods: (() => {
      const complianceLines = Array.isArray(requestDetails?.compliance?.lines) ? requestDetails.compliance.lines : [];
      if (complianceLines.length) return complianceLines.map((line) => [line.description, (line.effectiveHsCode || line.submittedHsCode) ? `HS Code: ${line.effectiveHsCode || line.submittedHsCode}` : ""].filter(Boolean).join(" - ")).join(" | ");
      return [record.itemName, record.hsCode ? `HS Code: ${record.hsCode}` : ""].filter(Boolean).join(" - ");
    })(),
    customerReference: requestDetails.customerReference || record.itemCode || "",
    shipmentRemarks: record.remarks || "",
    branch: defaultUserBranch()
  };
  openDialog({
    title: `New Shipment (from ${record.requestNo})`,
    typeLabel: "Shipment",
    saveLabel: "Create Shipment",
    body: shipmentDialogBody("shipment", prefillRecord),
    onSave: async () => {
      const data = collectFormValues(dialogBody.closest("form"));
      rememberDropdownOptions(data);
      const saved = await createShipment(data);
      if (saved === false) return;
      const updatedRecord = { ...record, convertedJobNo: data.jobNo || "" };
      state.shipmentRequests = state.shipmentRequests.map((row) => rowId("shipmentRequest", row) === id ? updatedRecord : row);
      await persistRecord("shipmentRequest", updatedRecord);
      saveState();
      recordDialog.close();
      render();
    },
    afterOpen: () => {
      bindShipmentDirectionDialog();
      bindShipmentCustomerTariffs();
      bindShipmentCustomerAutofill();
      bindShipmentCopySections();
      bindTransporterAutofill();
      bindTariffFinancialAutofill();
      bindVolumeCalculator();
      bindPalletDimensionBuilder();
      bindAwbFetchButton();
    }
  });
}

function printQuotation(id) {
  const record = state.quotations.find((row) => rowId("quotation", row) === id);
  if (!record) {
    window.alert("Quotation not found.");
    return;
  }
  const lines = parsePalletDimensions(record.cargoItemsJson || "[]");
  const body = `
    <div class="document-summary">
      <div><span>Customer</span><strong>${escapeHtml(record.customerName || "-")}</strong><small>${escapeHtml(record.customerContactPerson || "")}</small></div>
      <div><span>Contact</span><strong>${escapeHtml(record.customerMobile || "-")}</strong><small>${escapeHtml(record.customerEmail || "")}</small></div>
    </div>
    ${palletDimensionPrintTable(lines, record.cbm)}
    <h2>Nature of Goods</h2>
    <p>${escapeHtml(record.natureOfGoods || "-")}</p>
    <h2>Volume Category</h2>
    <p>${escapeHtml(record.volumeCategory || "-")}</p>
    ${record.notes ? `<h2>Notes</h2><p>${escapeHtml(record.notes)}</p>` : ""}
  `;
  const html = documentShell(`Quotation ${record.quotationNo}`, "Quotation", record.quotationNo, record.date || today(), body);
  openPrintableDocument(html);
}

function convertQuotationToShipment(id) {
  const record = state.quotations.find((row) => rowId("quotation", row) === id);
  if (!record) {
    window.alert("Quotation not found.");
    return;
  }
  if (denyIfCustomerBlocked(record.customerName, currentBlockCheckBranch(record.branch))) return;
  editing = null;
  dialogState = null;
  const prefillRecord = {
    customer: record.customerName || "",
    customerContactPerson: record.customerContactPerson || "",
    customerMobile: record.customerMobile || "",
    customerEmail: record.customerEmail || "",
    cargoItemsJson: record.cargoItemsJson || "[]",
    natureOfGoods: record.natureOfGoods || "",
    volumeCategory: record.volumeCategory || "1 CBM = 250 KG",
    cbm: record.cbm || 0,
    actualKg: record.actualKg || 0,
    branch: record.branch || defaultUserBranch()
  };
  openDialog({
    title: `New Shipment (from ${record.quotationNo})`,
    typeLabel: "Shipment",
    saveLabel: "Create Shipment",
    body: shipmentDialogBody("shipment", prefillRecord),
    onSave: async () => {
      const data = collectFormValues(dialogBody.closest("form"));
      rememberDropdownOptions(data);
      const saved = await createShipment(data);
      if (saved === false) return;
      record.status = "Converted";
      record.convertedJobNo = data.jobNo || "";
      state.quotations = state.quotations.map((row) => rowId("quotation", row) === id ? record : row);
      await persistRecord("quotation", record);
      saveState();
      recordDialog.close();
      render();
    },
    afterOpen: () => {
      bindShipmentDirectionDialog();
      bindShipmentCustomerTariffs();
      bindShipmentCustomerAutofill();
      bindShipmentCopySections();
      bindTransporterAutofill();
      bindTariffFinancialAutofill();
      bindVolumeCalculator();
      bindPalletDimensionBuilder();
      bindAwbFetchButton();
    }
  });
}

function openPrintableDocument(html) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) {
    notifyDenied("Popup blocked", "Allow popups to preview the document.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const printButton = printWindow.document.querySelector(
    "#tcnPrintButton, #documentPrintButton"
  );
  if (printButton) {
    printButton.addEventListener("click", () => {
      const images = [...printWindow.document.images];
      const imageReady = images.length
        ? Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          })))
        : Promise.resolve();
      imageReady.finally(() => {
        printWindow.focus();
        printWindow.print();
      });
    });
  }
  printWindow.focus();
}

function downloadHtml(fileName, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function submitAdminRequest(targetModule, referenceNo, details, proposedValues, requestType = "Change Request") {
  const request = adminRequest(
    nextNumber("ADM", state.adminRequests, "requestNo"),
    requestType,
    targetModule,
    referenceNo,
    currentSession()?.userName || "operations",
    "Pending",
    today(),
    details,
    proposedValues
  );
  state.adminRequests.unshift(request);
  await postRecord("adminRequest", request);
  return request;
}

async function submitBlockRequest(type, id, requestType, branch = "") {
  const record = collectionFor(type).find((row) => rowId(type, row) === id);
  if (!record) {
    notifyDenied("Request not sent", "Select a saved record first.");
    return false;
  }
  const targetType = type === "shipment" ? "Shipment" : type === "suppliers" ? "Supplier" : "Customer";
  const displayName = record.customer || record.name || id;
  const currentStatus = String(record.status || "").trim().toLowerCase();
  const isBlockAsk = String(requestType || "").toLowerCase() === "block";
  const chosenBranch = normalizeBranchName(branch || record.branch || defaultUserBranch());
  if (isBlockAsk && currentStatus === "blocked") {
    notifyDenied("Already blocked", `${displayName} is already blocked.`);
    return false;
  }
  if (!isBlockAsk && currentStatus !== "blocked") {
    notifyDenied("Not blocked", `${displayName} is not currently blocked, so there is nothing to unblock.`);
    return false;
  }
  const duplicatePending = (state.unblockRequests || []).some((row) =>
    row.referenceNo === id &&
    String(row.status || "").toLowerCase() === "pending" &&
    String(row.requestType || "").toLowerCase() === String(requestType || "").toLowerCase()
  );
  if (duplicatePending) {
    notifyDenied("Request already pending", `A ${requestType.toLowerCase()} request for ${displayName} is already awaiting admin approval.`);
    return false;
  }
  const adminActing = isAdminSession();
  const request = {
    requestNo: nextNumber("REQ", state.unblockRequests, "requestNo"),
    requestType,
    targetType,
    referenceNo: id,
    customerName: displayName,
    branch: chosenBranch,
    requestedBy: currentUserName(),
    reason: `${requestType} requested for ${targetType.toLowerCase()} ${id} (Branch: ${chosenBranch})`,
    status: adminActing ? "Approved" : "Pending",
    date: today(),
    approvedBy: adminActing ? currentUserName() : "",
    notes: adminActing ? "Applied directly by admin - no approval step required" : ""
  };
  state.unblockRequests.unshift(request);
  const requestSaved = await postRecord("unblock", request);
  if (!requestSaved) {
    state.unblockRequests = state.unblockRequests.filter((row) => row.requestNo !== request.requestNo);
    notifyDenied("Request not sent", "This request could not be saved to the server. Please try again.");
    render();
    return false;
  }

  if (adminActing) {
    const applied = await applyBlockRequestToRecord(request);
    if (!applied) {
      request.status = "Failed";
      request.notes = "Could not save to the database - the block/unblock did not take effect.";
      await persistRecord("unblock", request);
      notifyDenied(`${requestType} not saved`, `${id} could not be ${requestType.toLowerCase()}ed - the change could not be saved to the server. Please try again.`);
      render();
      return false;
    }
    addHistory(`${requestType} applied directly`, `${targetType} ${id}`);
    saveState();
    notifySuccess(`${targetType} ${requestType}ed`, `${id} was ${requestType.toLowerCase()}ed immediately.`);
    render();
    return true;
  }

  addHistory(`Submitted ${requestType.toLowerCase()} request`, `${targetType} ${id}`);
  saveState();
  notifySuccess("Request sent", `${requestType} request for ${id} was sent to admin.`);
  render();
  return true;
}

async function approveBlockRequest(request, approvalNotes = "") {
  if (String(request.status || "").toLowerCase() !== "pending") {
    notifyDenied("Already actioned", `Request ${request.requestNo} was already ${String(request.status || "").toLowerCase()} - it cannot be approved again.`);
    return;
  }
  const applied = await applyBlockRequestToRecord(request);
  if (!applied) {
    notifyDenied("Not applied", `${request.requestType} for ${request.referenceNo || request.customerName} could not be saved to the server. The request is still pending - please try approving it again.`);
    render();
    return;
  }
  request.status = "Approved";
  request.approvedBy = currentUserName();
  request.notes = approvalNotes;
  const requestSaved = await persistRecord("unblock", request);
  if (!requestSaved) {
    notifyDenied("Partially saved", `${request.requestType} for ${request.referenceNo || request.customerName} was applied, but the request record itself could not be updated. Refresh and check its status.`);
  }
  addHistory(`Approved ${String(request.requestType || "").toLowerCase()} request`, request.referenceNo || request.customerName);
  saveState();
  notifySuccess(`Request approved`, `${request.requestType} for ${request.referenceNo || request.customerName} is now in effect.`);
  render();
}

async function rejectBlockRequest(request, approvalNotes = "") {
  if (String(request.status || "").toLowerCase() !== "pending") {
    notifyDenied("Already actioned", `Request ${request.requestNo} was already ${String(request.status || "").toLowerCase()} - it cannot be rejected again.`);
    return;
  }
  request.status = "Rejected";
  request.approvedBy = currentUserName();
  request.notes = approvalNotes;
  await persistRecord("unblock", request);
  addHistory(`Rejected ${String(request.requestType || "").toLowerCase()} request`, request.referenceNo || request.customerName);
  saveState();
  notifySuccess("Request rejected", `${request.requestType} for ${request.referenceNo || request.customerName} was rejected. No change was applied.`);
}

// Looks up the customer record matching a name or code and returns it only when that customer is
// currently Blocked (i.e. a Block request has been approved by admin and no matching Unblock
// approval has been applied since). Returns null for everyone else, including customers with a
// Pending block/unblock request that hasn't been approved yet - only an approved block counts.
// True if this customer/supplier record is blocked for the given branch specifically - checks the
// per-branch blockedBranches list ("Both" or the matching branch name), not just the overall
// status flag, so a block on one branch never affects shipments booked under another branch.
// Falls back to the plain status flag only for legacy records blocked before per-branch tracking
// existed (status = Blocked but blockedBranches empty) so those stay blocked everywhere, as before.
// The branch a customer-block check should be evaluated against: the CURRENT STAFF USER's own
// branch (their account's branchAccess), not the customer's branch (set once at customer
// creation) and not necessarily the shipment form's branch field. A block on "Kuwait HO" should
// only stop Kuwait HO staff from transacting with that customer - Dubai staff are unaffected.
// Only when the logged-in user has "Both" branch access (e.g. admin) do we fall back to whichever
// branch they explicitly picked for this shipment, since their own account isn't tied to one.
// The branch a customer-block check should be evaluated against: the actual transaction's own
// branch (the shipment's stored branch, or whatever branch was picked on the shipment form) - NOT
// the logged-in staff member's own account branch. Using the operator's account branch broke bulk
// operations like "Update Manifest Status", which loops through many shipments as one admin click
// - that admin's own branch has nothing to do with which branch each individual shipment actually
// belongs to, so it was flagging shipments as blocked even when only a *different* branch was
// actually blocked for that customer.
function currentBlockCheckBranch(explicitBranch) {
  return normalizeBranchName(explicitBranch || defaultUserBranch());
}

// If the branch can't be determined at all, we do NOT treat that as "blocked" - a block set for a
// specific branch should only ever stop transactions we can actually confirm are in that branch;
// silently blocking everything we're unsure about caused legitimate cross-branch operations (like
// bulk manifest status updates on old shipments with no branch recorded) to fail incorrectly. A
// customer blocked the old way (status = Blocked, no specific branch recorded at all) still blocks
// everywhere via the status fallback below, regardless of this.
function isRecordBlockedForBranch(record, branch) {
  // The customer status is authoritative. A previous unblock can leave stale branch metadata
  // behind in older databases; that metadata must never make an explicitly Active customer look
  // blocked in the shipment form.
  if (String(record.status || "").trim().toLowerCase() !== "blocked") return false;
  const blockedBranches = String(record.blockedBranches || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (blockedBranches.length) {
    if (blockedBranches.includes("Both")) return true;
    const normalizedBranch = normalizeBranchName(branch || "");
    return normalizedBranch ? blockedBranches.includes(normalizedBranch) : false;
  }
  return String(record.status || "").trim().toLowerCase() === "blocked";
}

function blockedCustomerRecord(customerNameOrCode, branch) {
  const lookup = String(customerNameOrCode || "").trim().toLowerCase();
  if (!lookup) return null;
  return state.customers.find((row) => {
    const matchesCustomer = String(row.name || "").trim().toLowerCase() === lookup || String(row.code || "").trim().toLowerCase() === lookup;
    return matchesCustomer && isRecordBlockedForBranch(row, branch);
  }) || null;
}

// Shared guard used by every shipment-creation entry point (draft or final). Returns true and
// shows a denial notice if the shipment's customer is currently blocked for the shipment's branch,
// so no shipment - draft or otherwise - can be created or continued for a blocked account/branch
// until admin approves an unblock.
function denyIfCustomerBlocked(customerNameOrCode, branch) {
  const blocked = blockedCustomerRecord(customerNameOrCode, branch);
  if (!blocked) return false;
  notifyDenied(
    "Customer blocked",
    `${blocked.name} (${blocked.code}) is blocked for overdue account${branch ? ` in ${branch}` : ""}. Ask admin to approve an unblock request before creating or editing shipments for this customer.`
  );
  return true;
}

// Applies an approved (or immediately-admin-actioned) block/unblock to the actual customer /
// supplier / shipment record and persists it to the server. Returns true only if the database
// write actually succeeded - callers must check this before reporting success to the user.
// On failure, the in-memory change is rolled back so the UI never shows "Active"/"Blocked" state
// that doesn't match what's actually saved (previously this wasn't checked at all: the record was
// mutated and re-rendered as if it worked even when persistRecord failed underneath, which is why
// an "unblocked" customer could keep showing blocked errors when creating shipments - the browser
// showed the unblock as successful, but the database never actually got the update).
async function applyBlockRequestToRecord(request) {
  const isBlock = String(request.requestType || "").toLowerCase() === "block";
  const target = String(request.targetType || "").toLowerCase();
  const id = request.referenceNo || request.customerName;
  if (target === "shipment") {
    const shipmentItem = state.shipments.find((row) => row.jobNo === id);
    if (!shipmentItem) return false;
    const previousStatus = shipmentItem.status;
    shipmentItem.status = isBlock ? "Blocked" : "Booked";
    const saved = await persistRecord("shipment", shipmentItem);
    if (!saved) shipmentItem.status = previousStatus;
    return saved;
  }

  const collectionKey = target === "supplier" ? "suppliers" : "customers";
  const record = state[collectionKey].find((row) => row.code === id || row.name === id);
  if (!record) return false;
  const previousBlockedBranches = record.blockedBranches;
  const previousStatus = record.status;
  const previousOverdue = record.isAccountOverdue;
  // Track which branch(es) are blocked. "Both" always replaces the whole set; a single branch
  // is added to or removed from the existing blocked-branch list, so blocking/unblocking one
  // branch never affects another branch's block.
  const requestedBranch = normalizeBranchName(request.branch || record.branch || defaultUserBranch());
  const currentBlocked = new Set(String(record.blockedBranches || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (isBlock) {
    if (requestedBranch === "Both") { currentBlocked.clear(); currentBlocked.add("Both"); }
    else { currentBlocked.delete("Both"); currentBlocked.add(requestedBranch); }
  } else if (requestedBranch === "Both") {
    currentBlocked.clear();
  } else {
    currentBlocked.delete("Both");
    currentBlocked.delete(requestedBranch);
  }
  record.blockedBranches = [...currentBlocked].join(", ");
  // status/isAccountOverdue are derived from blockedBranches (non-empty = Blocked), not set
  // independently - otherwise unblocking one branch would wipe out a still-active block on the
  // other branch (both used to be set unconditionally from isBlock, regardless of branch).
  record.status = currentBlocked.size > 0 ? "Blocked" : "Active";
  record.isAccountOverdue = currentBlocked.size > 0;
  const saved = await persistRecord(collectionKey, record);
  if (!saved) {
    record.blockedBranches = previousBlockedBranches;
    record.status = previousStatus;
    record.isAccountOverdue = previousOverdue;
  }
  return saved;
}

async function approveAdminRequest(request, approvalNotes = "") {
  request.status = "Approved";
  request.approvedBy = currentSession()?.userName || "admin";
  request.approvalNotes = approvalNotes;
  await persistRecord("adminRequest", request);

  if (request.targetModule === "Additional Charges") {
    const charge = state.additionalCharges.find((row) => row.refNo === request.referenceNo);
    if (charge) {
      const changes = parseChangeSummary(request.proposedValues);
      Object.entries(changes).forEach(([key, value]) => {
        if (["amount", "taxPercent", "taxAmount", "totalAmount"].includes(key)) {
          charge[key] = Number(value) || 0;
        } else {
          charge[key] = value;
        }
      });
      const refreshed = additionalCharge(
        charge.refNo,
        charge.shipmentNo,
        charge.chargeDate,
        charge.chargeType,
        charge.chargeBasis,
        charge.supplier,
        charge.referenceNo,
        charge.invoiceNo,
        charge.amount,
        charge.taxPercent,
        charge.currency,
        charge.remarks,
        charge.attachmentName,
        "Approved",
        charge.requestedBy || request.requestedBy,
        request.approvedBy,
        approvalNotes
      );
      Object.assign(charge, refreshed);
      await persistRecord("charge", charge);
    }
  }

  if (request.targetModule === "Consolidation") {
    const loadItem = state.loads.find((row) => row.loadNo === request.referenceNo);
    if (loadItem) {
      const changes = parseChangeSummary(request.proposedValues);
      Object.entries(changes).forEach(([key, value]) => {
        if (["pieces", "actualKg", "cbm", "chargeableKg"].includes(key)) {
          loadItem[key] = Number(value) || 0;
        } else {
          loadItem[key] = value;
        }
      });
      loadItem.manifestStatus = "Approved";
      loadItem.lastManifestRequestNo = request.requestNo;
      recalculateLoad(loadItem);
      await persistRecord("load", loadItem);
      await syncManifestShipmentStatuses(loadItem);
    }
  }

  addHistory("Approved admin request", request.requestNo);
  saveState();
}

async function rejectAdminRequest(request, approvalNotes = "") {
  request.status = "Rejected";
  request.approvedBy = currentSession()?.userName || "admin";
  request.approvalNotes = approvalNotes;
  await persistRecord("adminRequest", request);

  if (request.targetModule === "Additional Charges") {
    const charge = state.additionalCharges.find((row) => row.refNo === request.referenceNo && row.status === "Pending Approval");
    if (charge) {
      charge.status = "Rejected";
      charge.approvedBy = request.approvedBy;
      charge.approvalNotes = approvalNotes;
      await persistRecord("charge", charge);
    }
  }

  if (request.targetModule === "Consolidation") {
    const loadItem = state.loads.find((row) => row.loadNo === request.referenceNo);
    if (loadItem) {
      loadItem.manifestStatus = "Rejected";
      loadItem.lastManifestRequestNo = request.requestNo;
      await persistRecord("load", loadItem);
    }
  }

  addHistory("Rejected admin request", request.requestNo);
  saveState();
}

function manifestChangeSummary(loadItem) {
  return [
    `route: ${loadItem.route}`,
    `transporter: ${loadItem.transporter}`,
    `vehicleNo: ${loadItem.vehicleNo}`,
    `tripDate: ${loadItem.tripDate}`,
    `status: ${loadItem.status}`,
    `jobNumbers: ${loadItem.jobNumbers}`
  ].join(" | ");
}

// Generating/finalizing a manifest is a routine action available to any user directly - no
// approval-request detour needed (that friction was removed; the separate, still-required
// approval flow for EDITING an already-Delivered/Closed manifest, in saveDialogRecordInner, is
// untouched).
async function approveLoadManifest(loadNo) {
  const loadItem = state.loads.find((row) => row.loadNo === loadNo);
  if (!loadItem) return;
  loadItem.manifestStatus = "Approved";
  const saved = await persistRecord("load", loadItem);
  if (!saved) {
    notifyDenied("Manifest not generated", "The manifest status could not be saved. Please try again.");
    return;
  }
  addHistory("Generated manifest", loadNo);
  saveState();
  render();
  generateRecordDocument("load", loadNo);
}

async function handleModuleSubmit(event) {
  event.preventDefault();
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  rememberDropdownOptions(data);
  const type = form.dataset.form;
  const handlers = {
    shipment: () => createShipment(data),
    load: () => createLoad(data),
    customers: () => createParty("customers", data),
    suppliers: () => createParty("suppliers", data),
    user: () => createUser(data),
    tariff: () => createTariff(data),
    document: () => createDocument(data),
    invoice: () => createInvoice(data),
    pod: () => updatePod(data),
    status: () => updateStatus(data),
    "load-status": () => updateLoadStatus(data),
    settings: () => updateSettings(data),
    "customer-shipment-request": () => submitCustomerShipmentRequest(data, form),
    "customer-profile": () => updateCustomerProfile(data),
    "employee-profile": () => updateEmployeeProfile(data)
  };
  const saved = await handlers[type]?.();
  if (saved === false) {
    return;
  }
  saveState();
  render();
}

async function updateSettings(data) {
  state.settings = { ...state.settings, ...data, settingsKey: state.settings.settingsKey || "default" };
  const saved = await persistRecord("settings", state.settings);
  if (saved) {
    notifySuccess("Settings saved", "Company settings were updated successfully.");
  } else {
    notifyDenied("Saved locally only", "Could not reach the server, so this may not sync for other users yet.");
  }
  return true;
}

async function createTariff(data) {
  const tariffNo = String(data.tariffNo || nextNumber("TAR", state.tariffs, "tariffNo")).trim();
  if (duplicateRecordExists("tariff", tariffNo)) {
    notifyDuplicate(tariffNo);
    return false;
  }
  const record = buildTariffRecord({ ...data, tariffNo });
  state.tariffs.unshift(record);
  await postRecord("tariff", record);
  addHistory("Created tariff", record.tariffNo);
  notifySuccess("Tariff created", record.tariffNo + " was saved successfully.");
  return true;
}

async function createLoad(data) {
  const loadNo = String(data.loadNo || nextConsolidationNumber()).trim();
  if (duplicateRecordExists("load", loadNo)) {
    notifyDuplicate(loadNo);
    return false;
  }
  const jobs = normalizeConsolidationJobs(data.jobNumbers || "");
  if (!jobs.length) {
    notifyDenied("Manifest not created", "Add at least one consolidation shipment.");
    return false;
  }
  const record = load(
    loadNo,
    data.tripDate || today(),
    [data.origin, data.destination].filter((part) => String(part || "").trim()).join(" - "),
    data.transporter || "",
    data.vehicleNo || "",
    data.status || "Planned",
    jobs.join(", "),
    data.manifestStatus || "Not Generated",
    data.lastManifestRequestNo || "",
    currentUserName(),
    loadMetaNotes(data)
  );
  recalculateLoad(record);
  state.loads.unshift(record);
  await postRecord("load", record);
  addHistory("Created consolidation", loadNo);
  notifySuccess("Manifest created", loadNo + " was saved successfully.");
  return true;
}

async function createParty(key, data) {
  const isCustomer = key === "customers";
  const code = String(data.code || (isCustomer ? nextCustomerNumber() : nextSupplierNumber())).trim();
  const name = String(data.name || "").trim();
  if (!name) {
    notifyDenied("Record not created", "Enter a name first.");
    return false;
  }
  if (duplicateRecordExists(key, code)) {
    notifyDuplicate(code);
    return false;
  }
  if (isCustomer && isDuplicateCustomerDetails(name, data.email, data.mobile)) {
    notifyDuplicateCustomer();
    return false;
  }
  const record = party(
    code,
    name,
    String(data.locationOrLane || "").trim(),
    String(data.email || "").trim(),
    String(data.terms || "").trim(),
    String(data.status || "Active").trim(),
    false,
    String(data.branch || defaultUserBranch()).trim(),
    currentUserName(),
    isCustomer ? String(data.fullAddress || "").trim() : "",
    String(data.mobile || "").trim()
  );
  state[key].unshift(record);
  await postRecord(key, record);
  addHistory("Created " + (isCustomer ? "customer" : "supplier"), code);
  notifySuccess((isCustomer ? "Customer" : "Supplier") + " created", code + " was saved successfully.");
  return true;
}

async function createDocument(data) {
  const documentNo = String(data.documentNo || nextNumber("DOC", state.documents, "documentNo")).trim();
  if (duplicateRecordExists("document", documentNo)) {
    notifyDuplicate(documentNo);
    return false;
  }
  const upload = data.fileUpload;
  const fileName = upload && typeof upload === "object" && upload.name ? upload.name : String(data.fileName || data.attachmentName || "").trim();
  const record = documentRow(
    documentNo,
    String(data.linkedNo || "").trim(),
    String(data.type || "Waybill").trim(),
    String(data.status || "Uploaded").trim(),
    data.date || today(),
    String(data.owner || currentUserName()).trim(),
    fileName,
    currentUserName()
  );
  record.notes = String(data.notes || "").trim();
  record.storageUrl = String(data.storageUrl || "").trim();
  state.documents.unshift(record);
  await postRecord("document", record);
  addHistory("Created document", documentNo);
  notifySuccess("Document saved", documentNo + " was saved successfully.");
  return true;
}

async function createShipmentDocument(data, shipmentNo) {
  const upload = data?.shipmentDocumentUpload;
  if (!upload || typeof upload !== "object" || !upload.name || !shipmentNo) return true;
  if (!["application/pdf", "image/jpeg", "image/png"].includes(String(upload.type || "").toLowerCase())) throw new Error("Shipment document must be a PDF, JPG, JPEG, or PNG file.");
  if (upload.size > 10 * 1024 * 1024) throw new Error("Shipment document must be 10 MB or smaller.");
  const result = await fetchJson("/api/shipment-documents", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({shipmentNo,fileName:upload.name,mimeType:upload.type,contentBase64:await readFileAsBase64(upload)}) });
  state.documents.unshift(apiDocument(result.row || {}));
  return true;
}

async function createCharge(data) {
  const baseRef = String(data.refNo || nextAdditionalChargeNumber()).trim();
  if (duplicateRecordExists("charge", baseRef)) {
    notifyDuplicate(baseRef);
    return false;
  }
  const lines = parseChargeLines(data);
  const normalizedLines = lines.length ? lines : ((String(data.lineChargeType || "").trim() && Number(data.lineAmount || 0) > 0)
    ? [{ chargeType: String(data.lineChargeType || "").trim(), amount: Number(data.lineAmount || 0), chargeBasis: "Per Shipment" }]
    : []);
  if (!normalizedLines.length) {
    notifyDenied("Charge not created", "Add at least one charge line.");
    return false;
  }
  const records = normalizedLines.map((line, index) => additionalCharge(
    chargeLineRef(baseRef, index, normalizedLines.length),
    String(data.shipmentNo || "").trim(),
    data.chargeDate || today(),
    String(line.chargeType || data.chargeType || "Charges").trim(),
    String(line.chargeBasis || data.chargeBasis || "Per Shipment").trim(),
    String(data.supplier || "").trim(),
    String(data.referenceNo || "").trim(),
    String(data.invoiceNo || "").trim(),
    Number(line.amount || data.amount || 0),
    Number(data.taxPercent || 0),
    String(data.currency || "KD").trim(),
    String(data.remarks || "").trim(),
    String(data.attachmentName || "").trim(),
    String(data.status || (isAdminSession() ? "Approved" : "Pending Approval")).trim(),
    currentUserName(),
    String(data.approvedBy || "").trim(),
    String(data.approvalNotes || "").trim(),
    currentUserName()
  ));
  state.additionalCharges.unshift(...records);
  await Promise.all(records.map((record) => postRecord("charge", record)));
  addHistory("Created additional charge", baseRef);
  notifySuccess("Additional charge created", baseRef + " was saved successfully.");
  return true;
}

async function createCustomerUserAccount(data) {
  const username = String(data.username || "").trim();
  if (!username) {
    notifyDenied("Account not created", "Enter a portal username first.");
    return false;
  }
  if (duplicateRecordExists("customerUser", username)) {
    notifyDuplicate(username);
    return false;
  }
  const customerCode = String(data.customerCode || "").trim();
  if (!customerCode) {
    notifyDenied("Account not created", "Select a customer first.");
    return false;
  }
  const password = String(data.password || "");
  if (!password) {
    notifyDenied("Account not created", "Enter a password first.");
    return false;
  }
  const record = {
    customerCode,
    username,
    email: String(data.email || "").trim(),
    status: String(data.status || "ACTIVE").trim(),
    lastLogin: "",
    createdAt: today()
  };
  state.customerUsers.unshift(record);
  await postRecord("customerUser", { ...record, password });
  addHistory("Created customer portal account", username);
  notifySuccess("Account created", username + " can now log into the Customer Portal.");
  return true;
}

async function createUser(data) {
  const userName = String(data.userName || "").trim();
  if (!userName) {
    notifyDenied("User not created", "Enter a user name first.");
    return false;
  }
  if (duplicateRecordExists("user", userName)) {
    notifyDuplicate(userName);
    return false;
  }
  const password = String(data.password || "");
  if (!password) {
    notifyDenied("User not created", "Enter a password first.");
    return false;
  }
  const record = user(
    userName,
    String(data.email || "").trim(),
    String(data.role || "Operations").trim(),
    String(data.accountStatus || "Active").trim(),
    String(data.branchAccess || defaultUserBranch()).trim(),
    String(data.branchViewScope || "Assigned Branch Only").trim(),
    String(data.sectionAccess || "Dashboard").trim(),
    data.canViewAllEntry,
    data.canViewOnlySelfEntry,
    data.canEditAllEntry,
    data.canViewUpdatedHistory,
    password,
    String(data.notes || "").trim(),
    data.createdDate || today(),
    data.hrPortalAccess,
    isChecked(data.canBillingSalesEntry),
    isChecked(data.canBillingCostEntry),
    isChecked(data.erpPortalAccess),
    isChecked(data.isHrAdmin),
    isChecked(data.maintenancePortalAccess),
    isChecked(data.crmPortalAccess),
    String(data.crmRole || "Sales Executive").trim(),
    isChecked(data.crmViewAllAccounts),
    isChecked(data.crmManageAssignments),
    isChecked(data.crmExportAccess),
    isChecked(data.crmArchiveAccess),
    isChecked(data.crmViewTeamReports),
    isChecked(data.crmAdminAccess),
    isChecked(data.aiAccess)
  );
  state.users.unshift(record);
  await postRecord("user", record);
  addHistory("Created user", userName);
  notifySuccess("User created", userName + " was saved successfully.");
  return true;
}

function nextHrNumber(prefix, collection, key) {
  return nextNumber(prefix, collection, key);
}

async function createEmployee(data) {
  const userName = String(data.userName || "").trim();
  if (!userName) {
    notifyDenied("Employee not saved", "Select a user account first.");
    return false;
  }
  if (duplicateRecordExists("employee", userName)) {
    notifyDuplicate(userName);
    return false;
  }
  const record = {
    userName,
    employeeCode: String(data.employeeCode || "").trim(),
    fullName: String(data.fullName || "").trim(),
    department: String(data.department || "").trim(),
    designation: String(data.designation || "").trim(),
    joinDate: data.joinDate || today(),
    phone: String(data.phone || "").trim(),
    personalEmail: String(data.personalEmail || "").trim(),
    employmentStatus: String(data.employmentStatus || "Active").trim(),
    reportingManager: String(data.reportingManager || "").trim(),
    notes: String(data.notes || "").trim()
  };
  state.employees.unshift(record);
  await postRecord("employee", record);
  addHistory("Created employee profile", userName);
  notifySuccess("Employee saved", userName + " was saved successfully.");
  return true;
}

async function createLeaveRequest(data) {
  const startDate = data.startDate || today();
  const endDate = data.endDate || startDate;
  if (new Date(endDate) < new Date(startDate)) {
    notifyDenied("Leave not submitted", "End date cannot be before the start date.");
    return false;
  }
  const totalDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1);
  const userName = currentUserName();
  const employeeRecord = state.employees.find((row) => row.userName === userName);
  const record = {
    requestNo: nextHrNumber("LV", state.leaveRequests, "requestNo"),
    userName,
    employeeName: employeeRecord?.fullName || userName,
    leaveType: String(data.leaveType || "Annual").trim(),
    startDate,
    endDate,
    totalDays,
    reason: String(data.reason || "").trim(),
    status: "Pending",
    approvedBy: "",
    approvedAt: "",
    appliedAt: new Date().toISOString()
  };
  state.leaveRequests.unshift(record);
  await postRecord("leaveRequest", record);
  addHistory("Applied for leave", record.requestNo);
  notifySuccess("Leave request submitted", `${record.requestNo} was submitted for approval.`);
  return true;
}

async function decideLeaveRequest(requestNo, approved) {
  if (!isHrAdmin()) {
    notifyDenied("Not allowed", "Only HR admins can approve or reject leave requests.");
    return;
  }
  const record = state.leaveRequests.find((row) => row.requestNo === requestNo);
  if (!record) return;
  const status = approved ? "Approved" : "Rejected";
  const updated = {
    ...record,
    status,
    approvedBy: currentUserName(),
    approvedAt: new Date().toISOString()
  };
  const saved = await persistRecord("leaveRequest", updated);
  if (!saved) return;
  Object.assign(record, updated);
  addHistory(status === "Approved" ? "Approved leave request" : "Rejected leave request", requestNo);
  notifySuccess(`Leave ${status.toLowerCase()}`, `${requestNo} was ${status.toLowerCase()}.`);
  saveState();
  render();
}

async function createPayslip(data) {
  const userName = String(data.userName || "").trim();
  if (!userName) {
    notifyDenied("Payslip not saved", "Select an employee first.");
    return false;
  }
  const employeeRecord = state.employees.find((row) => row.userName === userName);
  const grossPay = Number(data.grossPay || 0);
  const deductions = Number(data.deductions || 0);
  const record = {
    payslipNo: nextHrNumber("PAY", state.payslips, "payslipNo"),
    userName,
    employeeName: employeeRecord?.fullName || userName,
    period: String(data.period || "").trim(),
    grossPay,
    deductions,
    netPay: Number(data.netPay || (grossPay - deductions)),
    status: String(data.status || "Issued").trim(),
    issuedDate: data.issuedDate || today(),
    storageUrl: ""
  };
  state.payslips.unshift(record);
  await postRecord("payslip", record);
  addHistory("Issued payslip", record.payslipNo);
  notifySuccess("Payslip issued", `${record.payslipNo} was issued to ${record.employeeName}.`);
  return true;
}

async function createHrAnnouncement(data) {
  const title = String(data.title || "").trim();
  if (!title) {
    notifyDenied("Announcement not posted", "Enter a title first.");
    return false;
  }
  const record = {
    id: `new-${Date.now()}`,
    title,
    body: String(data.body || "").trim(),
    postedBy: currentUserName(),
    audience: String(data.audience || "All").trim(),
    pinned: String(data.pinned || "No") === "Yes",
    postedAt: new Date().toISOString()
  };
  state.hrAnnouncements.unshift(record);
  const saved = await postRecord("hrAnnouncement", record);
  if (saved && typeof saved === "object" && saved.id !== undefined) {
    record.id = String(saved.id);
  }
  addHistory("Posted announcement", title);
  notifySuccess("Announcement posted", title + " was published.");
  return true;
}

async function changeCurrentPassword(data) {
  const userName = currentUserName();
  const currentPassword = String(data.currentPassword || "");
  const newPassword = String(data.newPassword || "");
  const confirmPassword = String(data.confirmPassword || "");

  if (!currentPassword) {
    notifyDenied("Password not changed", "Enter your current password first.");
    return false;
  }
  if (!newPassword) {
    notifyDenied("Password not changed", "Enter a new password first.");
    return false;
  }
  if (newPassword !== confirmPassword) {
    notifyDenied("Password not changed", "New password and confirm password do not match.");
    return false;
  }

  try {
    await fetchJson("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, currentPassword, newPassword })
    });
  } catch (error) {
    notifyDenied("Password not changed", error.message || "The current password is incorrect.");
    return false;
  }

  addHistory("Changed password", userName);
  notifySuccess("Password updated", "Your password was changed successfully.");
  return true;
}

// Saves whatever is currently in the New Shipment form, skipping the requirements that only
// matter once a shipment is ready to move forward (Bill To, tariff-customer matching) - a draft is
// allowed to be incomplete. If this is editing an existing shipment already (i.e. continuing a
// draft that was opened again), this updates that same record instead of creating a duplicate.
async function createShipmentDraft(data) {
  if (denyIfCustomerBlocked(data.customer, currentBlockCheckBranch(data.branch))) return false;
  data.chargeableKg = effectiveChargeableWeightForShipment(data);
  if (editing && editing.type === "shipment") {
    const updatedRecord = { ...editing.record };
    Object.keys(data).forEach((key) => {
      updatedRecord[key] = coerceValue(updatedRecord[key], data[key]);
    });
    updatedRecord.status = "Draft";
    updatedRecord.notes = shipmentMetaNotes(updatedRecord);
    const changeSummary = summarizeChanges(editing.record, updatedRecord, Object.keys(data));
    const saved = await persistRecord("shipment", updatedRecord);
    if (!saved) {
      notifyDenied("Draft not saved", "The draft could not be saved. Check the connection and try again.");
      return false;
    }
    Object.assign(editing.record, updatedRecord);
    addHistory("Saved shipment as draft", updatedRecord.jobNo, changeSummary);
    notifySuccess("Draft saved", `${updatedRecord.jobNo} was updated and kept as a draft.`);
    editing = null;
    recordDialog.close();
    render();
    return true;
  }

  if (!String(data.jobNo || "").trim()) {
    notifyDenied("Draft not saved", "A job number is required, even for a draft.");
    return false;
  }
  if (duplicateRecordExists("shipment", data.jobNo)) {
    notifyDuplicate(data.jobNo);
    return false;
  }
  if (duplicateAirwayBillExists(data.airwayBillNo, data.branch)) {
    notifyDuplicateAirwayBill(data.airwayBillNo, data.branch);
    return false;
  }
  const tariffItem = state.tariffs.find((row) => row.tariffNo === data.tariffNo) || assignedTariffForShipment({ customer: data.customer, origin: data.origin, destination: data.destination, tariffNo: data.tariffNo });
  const chargeableWeight = Number(data.chargeableKg || 0);
  const pricing = tariffPricingForWeight(tariffItem, chargeableWeight);
  const record = shipment(
    data.jobNo, data.branch, data.customer, data.origin, data.destination, "Draft",
    Number(data.pieces), Number(data.actualKg), Number(data.cbm), Number(data.chargeableKg), pricing.revenue, 0,
    "Pending", "Unbilled", data.bookingDate || today(), data.airwayBillNo || "",
    data.tariffNo || "", Number(data.transitDays || 0), data.shipmentDirection || "Export", data.shipmentService || "AE",
    data.shipmentServiceOther || "", data.volumeCategory || "Land", Number(data.chargeableDivisor || volumeDivisorFor(data.volumeCategory || "Land") || 0),
    currentUserName(), shipmentMetaNotes(data)
  );
  const saved = await postRecord("shipment", record);
  if (!saved) {
    notifyDenied("Draft not saved", "The draft could not be saved. Check the connection and try again.");
    return false;
  }
  const finalRecord = typeof saved === "object" ? apiShipment(saved) : record;
  state.shipments.unshift(finalRecord);
  addHistory("Saved shipment as draft", finalRecord.jobNo);
  notifySuccess("Draft saved", `${finalRecord.jobNo} was saved as a draft. Open it anytime from the Shipment Register to continue.`);
  recordDialog.close();
  render();
  return true;
}

async function createShipment(data) {
  if (denyIfCustomerBlocked(data.customer, currentBlockCheckBranch(data.branch))) return false;
  data.chargeableKg = effectiveChargeableWeightForShipment(data);
  if (duplicateRecordExists("shipment", data.jobNo)) {
    notifyDuplicate(data.jobNo);
    return false;
  }
  const awbForCreate = data.airwayBillNo || data.jobNo?.replace("AFS", "AWB");
  if (duplicateAirwayBillExists(awbForCreate, data.branch)) {
    notifyDuplicateAirwayBill(awbForCreate, data.branch);
    return false;
  }
  if (!String(data.billTo1 || "").trim() && !String(data.billTo2 || "").trim()) {
    notifyDenied("Bill To required", "Enter at least one Bill To value.");
    return false;
  }
  if (data.entryMode !== "airway") {
    const allowedTariffs = tariffOptionsForCustomer(data.customer).map((option) => option.value);
    if (data.tariffNo && !allowedTariffs.includes(data.tariffNo)) {
      notifyDenied("Tariff not allowed", "Select a tariff created for the selected consignee.");
      return false;
    }
  }
  const tariffItem = state.tariffs.find((row) => row.tariffNo === data.tariffNo) || assignedTariffForShipment({ customer: data.customer, origin: data.origin, destination: data.destination, tariffNo: data.tariffNo });
  const chargeableWeight = Number(data.chargeableKg || 0);
  const pricing = tariffPricingForWeight(tariffItem, chargeableWeight);
  const record = shipment(
    data.jobNo, data.branch, data.customer, data.origin, data.destination, data.status || "Booked",
    Number(data.pieces), Number(data.actualKg), Number(data.cbm), Number(data.chargeableKg), pricing.revenue, 0,
    "Pending", "Unbilled", data.bookingDate || today(), data.airwayBillNo || data.jobNo?.replace("AFS", "AWB"),
    data.tariffNo || "", Number(data.transitDays || 0), data.shipmentDirection || "Export", data.shipmentService || "AE",
    data.shipmentServiceOther || "", data.volumeCategory || "Land", Number(data.chargeableDivisor || volumeDivisorFor(data.volumeCategory || "Land") || 0),
    currentUserName(), shipmentMetaNotes(data)
  );
  const saved = await postRecord("shipment", record);
  if (!saved) {
    notifyDenied("Shipment not saved", "The shipment could not be saved. Check the connection and try again before generating a TCN.");
    return false;
  }
  const finalRecord = typeof saved === "object" ? apiShipment(saved) : record;
  const renumbered = finalRecord.jobNo && finalRecord.jobNo !== data.jobNo;
  state.shipments.unshift(finalRecord);
  await createShipmentDocument(data, finalRecord.jobNo);
  addHistory("Created shipment", finalRecord.jobNo);
  if (renumbered) {
    notifySuccess("Shipment created", `${data.jobNo} was already taken by another user's shipment saved moments earlier, so this one was saved as ${finalRecord.jobNo} instead.`);
  } else {
    notifySuccess("Shipment created", finalRecord.jobNo + " was saved successfully.");
  }
  return true;
}

function parseChargeLines(data) {
  try {
    const parsed = JSON.parse(data.chargeLines || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .map((line) => ({ chargeType: line.chargeType, amount: Number(line.amount || 0), chargeBasis: line.chargeBasis || "Per Shipment" }))
        .filter((line) => line.chargeType && line.amount > 0);
    }
  } catch {}

  if (data.chargeType && Number(data.amount || 0) > 0) {
    return [{ chargeType: data.chargeType, amount: Number(data.amount || 0), chargeBasis: data.chargeBasis || "Per Shipment" }];
  }
  return [];
}

function chargeLineRef(baseRef, index, count) {
  return count <= 1 ? baseRef : `${baseRef}-${String(index + 1).padStart(2, "0")}`;
}

async function createQuotation(data) {
  const quotationNo = String(data.quotationNo || nextQuotationNumber()).trim();
  if (duplicateRecordExists("quotation", quotationNo)) {
    notifyDuplicate(quotationNo);
    return false;
  }
  const record = quotation(quotationNo, data.customerName || "", data.status || "Draft", data.date || today());
  Object.assign(record, {
    branch: normalizeBranchName(data.branch || defaultUserBranch()),
    customerContactPerson: data.customerContactPerson || "",
    customerMobile: data.customerMobile || "",
    customerEmail: data.customerEmail || "",
    cargoItemsJson: data.cargoItemsJson || "[]",
    natureOfGoods: data.natureOfGoods || "",
    volumeCategory: data.volumeCategory || "1 CBM = 250 KG",
    cbm: Number(data.cbm || 0),
    actualKg: Number(data.actualKg || 0),
    notes: data.notes || ""
  });
  state.quotations.unshift(record);
  await postRecord("quotation", record);
  addHistory("Created quotation", quotationNo);
  notifySuccess("Quotation saved", quotationNo + " was saved successfully.");
  return true;
}

async function createInvoice(data) {
  const invoiceNo = String(data.invoiceNo || nextInvoiceNumber()).trim();
  if (duplicateRecordExists("invoice", invoiceNo)) {
    notifyDuplicate(invoiceNo);
    return false;
  }
  const shipmentItem = state.shipments.find((row) => row.jobNo === data.shipmentNo);
  const tariffItem = state.tariffs.find((row) => row.tariffNo === data.tariffNo) || assignedTariffForShipment(shipmentItem);
  const chargeableWeight = Number(data.chargeableWeight || effectiveChargeableWeightForShipment(shipmentItem) || 0);
  const lines = parseInvoiceLineItems(data.invoiceLinesJson || JSON.stringify(invoiceLinesFromTariff(shipmentItem, tariffItem, chargeableWeight)));
  const totals = invoiceTotals(lines, Number(data.taxPercent || 0));
  const customer = shipmentItem?.customer || data.customer;
  const selectedCurrency = String(data.currency || shipmentItem?.currency || "KD").trim();
  const invoiceSnapshot = parseJsonMeta(data.invoiceSnapshotJson || "{}");
  const record = invoice(invoiceNo, customer, data.shipmentNo, canBillingSalesEntry() ? Number(data.revenue || totals.revenue || 0) : 0, canBillingCostEntry() ? Number(data.supplierCost || data.totalCost || totals.cost || 0) : 0, data.status || "Draft", data.date || today());
  Object.assign(record, {
    customerCode: shipmentItem?.customerCode || data.customerCode || "",
    tariffNo: data.tariffNo || tariffItem?.tariffNo || "",
    tariffName: data.tariffName || tariffItem?.customer || "",
    chargeableWeight,
    grossWeight: Number(data.grossWeight || shipmentItem?.actualKg || 0),
    volumeWeight: Number(data.volumeWeight || shipmentItem?.cbm || 0),
    currency: selectedCurrency,
    totalCost: canBillingCostEntry() ? Number(data.totalCost || data.supplierCost || totals.cost || 0) : 0,
    taxPercent: Number(data.taxPercent || 0),
    taxAmount: Number(data.taxAmount || totals.taxAmount || 0),
    grandTotal: Number(data.grandTotal || totals.grandTotal || 0),
    profitPercent: Number(data.profitPercent || totals.profitPercent || 0),
    invoiceLinesJson: data.invoiceLinesJson || JSON.stringify(lines),
    tariffSnapshotJson: data.tariffSnapshotJson || JSON.stringify(tariffItem || {}),
    invoiceSnapshotJson: JSON.stringify({
      ...invoiceSnapshotFromSelection(shipmentItem, tariffItem, lines, Number(data.taxPercent || 0), selectedCurrency),
      ...invoiceSnapshot,
      currency: selectedCurrency,
      shipmentVia: shipmentViaValue(shipmentItem),
      from: shipmentItem?.origin || shipmentItem?.shipperName || shipmentItem?.pickupLocation || "",
      to: shipmentItem?.destination || shipmentItem?.consigneeName || shipmentItem?.deliveryLocation || "",
      loadType: shipmentItem?.loadType || "",
      grossWeight: Number(data.grossWeight || shipmentItem?.actualKg || invoiceSnapshot.grossWeight || 0),
      volumeWeight: Number(data.volumeWeight || shipmentItem?.cbm || invoiceSnapshot.volumeWeight || 0)
    })
  });
  const saved = await postRecord("invoice", record);
  if (!saved) {
    notifyDenied("Invoice not saved", "The live database could not save this invoice. Please correct the displayed error and try again.");
    return false;
  }
  state.invoices.unshift(record);
  if (shipmentItem) shipmentItem.invoiceStatus = invoiceNo;
  addHistory("Generated invoice", invoiceNo);
  notifySuccess("Invoice saved", invoiceNo + " was saved successfully.");
  return true;
}

function endpointFor(type) {
  return {
    shipment: "shipments",
    load: "consolidations",
    customers: "customers",
    suppliers: "suppliers",
    tariff: "tariffs",
    document: "documents",
    podDocument: "documents",
    charge: "additional-charges",
    invoice: "invoices",
    quotation: "quotations",
    shipmentRequest: "shipment-requests",
    statusHistory: "shipment-status-history",
    user: "users",
    customerUser: "customer-users",
    unblock: "unblock-requests",
    adminRequest: "admin-requests",
    audit: "audit",
    settings: "settings",
    employee: "employees",
    leaveRequest: "leave-requests",
    payslip: "payslips",
    hrAnnouncement: "hr-announcements"
  }[type];
}

function mergeSynchronizedShipmentRows(rows) {
  if (!Array.isArray(rows)) return;
  rows.forEach((row) => {
    const normalized = apiShipment(row || {});
    const index = state.shipments.findIndex((item) => String(item.jobNo || "") === String(normalized.jobNo || ""));
    if (index >= 0) state.shipments[index] = { ...state.shipments[index], ...normalized };
  });
}

async function postRecord(type, record) {
  const endpoint = endpointFor(type);
  if (!endpoint) return false;
  try {
    const result = await fetchJson(`/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    if (result.mode === "demo") throw new Error("Database tables are not ready yet.");
    if (type === "shipment") mergeSynchronizedShipmentRows(result.relatedRows);
    return result.row || true;
  } catch (error) {
    if (/already exists/i.test(error?.message || "")) {
      notifyDenied("Already used", error.message);
      window.alert(`Already used\n${error.message}`);
      return false;
    }
    markApiWriteError(error);
    return false;
  }
}

async function persistRecord(type, record) {
  const endpoint = endpointFor(type);
  const id = rowId(type, record);
  if (!endpoint || !id || type === "audit") return false;
  try {
    const result = await fetchJson(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    if (result.mode === "demo") throw new Error("Database tables are not ready yet.");
    if (type === "shipment") mergeSynchronizedShipmentRows(result.relatedRows);
    return true;
  } catch (error) {
    markApiWriteError(error);
    return false;
  }
}

async function deleteRecord(type, id) {
  const endpoint = endpointFor(type);
  if (!endpoint || !id) return false;
  try {
    const result = await fetchJson(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (result.mode === "demo") throw new Error("Database tables are not ready yet.");
    return true;
  } catch (error) {
    markApiWriteError(error);
    return false;
  }
}

function markApiWriteError(error) {
  state.api = {
    ...state.api,
    status: "API save warning",
    database: state.api.database || "unknown",
    mode: "browser",
    error: error?.message || "Live database save failed."
  };
  notifyFailed("Live database save failed", state.api.error);
}

// hrAdminDeletePanel() already restricts who even SEES a payslip/announcement delete button to
// HR Admins (isHrAdmin() - portal "employee", role admin/hr). But the click just fires the same
// shared delete-record action as every main-ERP delete panel, which used to check isAdminSession()
// unconditionally - and isAdminSession() is defined to explicitly exclude any "employee" portal
// session, so it's always false for an HR Admin. That meant an HR Admin could see the Delete
// Payslip button, but clicking it always failed with "Only admin users can delete records," no
// matter who they were. Main-ERP record types (shipment, customer, tariff, user, etc.) still
// require isAdminSession() exactly as before - only these HR-portal-only types switch to the
// matching isHrAdmin() check.
const HR_ADMIN_DELETE_TYPES = new Set(["payslip", "hrAnnouncement"]);
function canDeleteRecordType(type) {
  return HR_ADMIN_DELETE_TYPES.has(type) ? isHrAdmin() : isAdminSession();
}

function selectedDeleteId(type) {
  return moduleContent.querySelector(`[data-delete-select='${type}']`)?.value || "";
}

function typeLabel(type) {
  return {
    shipment: "shipment",
    load: "consolidation",
    customers: "customer",
    suppliers: "supplier / transporter",
    tariff: "tariff",
    document: "document",
    podDocument: "POD document",
    statusHistory: "shipment status history",
    charge: "additional charge",
    invoice: "invoice",
    quotation: "quotation",
    shipmentRequest: "shipment request",
    user: "user account",
    customerUser: "customer portal account"
  }[type] || type;
}

async function deleteSelectedRecord(type) {
  if (!canDeleteRecordType(type)) {
    notifyDenied("Delete denied", "You do not have permission to delete this record.");
    return;
  }

  const id = selectedDeleteId(type);
  if (!id) {
    notifyDenied("Delete denied", `Select a ${typeLabel(type)} to delete.`);
    return;
  }

  const record = collectionFor(type).find((row) => String(rowId(type, row)) === String(id));
  if (!record) {
    notifyFailed("Delete failed", `${typeLabel(type)} not found.`);
    return;
  }

  if (type === "user" && id === currentSession()?.userName) {
    notifyDenied("Delete denied", "You cannot delete the user account you are currently using.");
    return;
  }

  const message = type === "shipment"
    ? `Delete shipment ${id} and its linked records?`
    : `Delete ${typeLabel(type)} ${id}?`;
  if (!window.confirm(message)) return;

  if (type === "shipment") {
    await deleteShipmentById(id);
    return;
  }

  const affectedShipments = type === "invoice"
    ? state.shipments.filter((shipmentItem) => shipmentItem.invoiceStatus === id)
    : [];
  const deleted = await deleteRecord(type, id);
  if (!deleted) return;
  removeLocalRecord(type, id);
  await Promise.all(affectedShipments.map((shipmentItem) => persistRecord("shipment", shipmentItem)));
  addHistory(`Deleted ${typeLabel(type)}`, id);
  saveState();
  notifySuccess("Record deleted", `${id} was deleted successfully.`);
  render();
}

async function deleteRecordById(type, id) {
  if (!canDeleteRecordType(type)) {
    notifyDenied("Delete denied", "You do not have permission to delete this record.");
    return;
  }
  if (!id) {
    notifyDenied("Delete denied", `Select a ${typeLabel(type)} to delete.`);
    return;
  }
  if (!window.confirm(`Delete ${typeLabel(type)} ${id}?`)) return;
  const deleted = await deleteRecord(type, id);
  if (!deleted) return;
  removeLocalRecord(type, id);
  addHistory(`Deleted ${typeLabel(type)}`, id);
  saveState();
  notifySuccess("Record deleted", `${id} was deleted successfully.`);
  render();
}

async function deleteSelectedAuditLogs() {
  if (!isAdminSession()) {
    notifyDenied("Delete denied", "Only admin users can delete audit logs.");
    return;
  }
  const checked = Array.from(moduleContent.querySelectorAll(".audit-row-checkbox:checked"));
  if (!checked.length) {
    notifyDenied("Delete denied", "Select at least one log entry to delete.");
    return;
  }
  const ids = checked.map((box) => box.dataset.auditId).filter(Boolean);
  const skipped = checked.length - ids.length;
  if (!ids.length) {
    notifyDenied("Delete denied", "Selected log(s) are still saving. Wait a moment and try again.");
    return;
  }
  if (!window.confirm(`Delete ${ids.length} selected audit log ${ids.length === 1 ? "entry" : "entries"}?`)) return;

  const deletedIds = [];
  for (const id of ids) {
    const deleted = await deleteRecord("audit", id);
    if (deleted) deletedIds.push(id);
  }
  if (deletedIds.length) {
    state.audit = state.audit.filter((row) => !deletedIds.includes(String(rowId("audit", row))));
    saveState();
    const failedCount = ids.length - deletedIds.length;
    notifySuccess(
      "Audit logs deleted",
      `${deletedIds.length} of ${ids.length} selected log(s) were deleted.${failedCount ? ` ${failedCount} failed - see the warning above.` : ""}${skipped ? ` ${skipped} were still saving and were skipped - refresh and try again for those.` : ""}`
    );
    render();
  }
}

function removeLocalRecord(type, id) {
  const keep = (row) => rowId(type, row) !== id;
  if (type === "load") {
    state.loads = state.loads.filter(keep);
    if (state.ui.selectedLoadNo === id) state.ui.selectedLoadNo = "";
    return;
  }
  if (type === "customers") state.customers = state.customers.filter(keep);
  if (type === "suppliers") state.suppliers = state.suppliers.filter(keep);
  if (type === "tariff") state.tariffs = state.tariffs.filter(keep);
  if (type === "document" || type === "podDocument") state.documents = state.documents.filter((row) => String(rowId(type, row)) !== String(id));
  if (type === "statusHistory") state.shipmentStatusHistory = state.shipmentStatusHistory.filter((row) => String(rowId(type, row)) !== String(id));
  if (type === "charge") state.additionalCharges = state.additionalCharges.filter(keep);
  if (type === "invoice") {
    state.invoices = state.invoices.filter(keep);
    state.shipments.forEach((shipmentItem) => {
      if (shipmentItem.invoiceStatus === id) shipmentItem.invoiceStatus = "Unbilled";
    });
  }
  if (type === "user") state.users = state.users.filter(keep);
  if (type === "customerUser") state.customerUsers = state.customerUsers.filter(keep);
  if (type === "quotation") state.quotations = state.quotations.filter(keep);
}

async function deleteShipmentById(jobNo) {
  const linkedDocuments = state.documents.filter((row) => row.linkedNo === jobNo);
  const linkedInvoices = state.invoices.filter((row) => row.shipmentNo === jobNo);
  const linkedCharges = state.additionalCharges.filter((row) => row.shipmentNo === jobNo);

  const shipmentDeleted = await deleteRecord("shipment", jobNo);
  if (!shipmentDeleted) return;
  await Promise.all([
    ...linkedDocuments.map((row) => deleteRecord("document", row.documentNo)),
    ...linkedInvoices.map((row) => deleteRecord("invoice", row.invoiceNo)),
    ...linkedCharges.map((row) => deleteRecord("charge", row.refNo))
  ]);

  state.shipments = state.shipments.filter((row) => row.jobNo !== jobNo);
  state.documents = state.documents.filter((row) => row.linkedNo !== jobNo);
  state.invoices = state.invoices.filter((row) => row.shipmentNo !== jobNo);
  state.additionalCharges = state.additionalCharges.filter((row) => row.shipmentNo !== jobNo);

  for (const loadItem of state.loads) {
    const jobs = String(loadItem.jobNumbers || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item !== jobNo);
    loadItem.jobNumbers = jobs.join(", ");
    recalculateLoad(loadItem);
    await persistRecord("load", loadItem);
  }

  addHistory("Deleted shipment", jobNo);
  saveState();
  notifySuccess("Shipment deleted", `${jobNo} and linked records were deleted successfully.`);
  render();
}

async function removeJobFromLoad(loadNo, jobNo) {
  if (!isAdminSession()) {
    notifyDenied("Remove denied", "Only admin users can remove shipments from a consolidation.");
    return;
  }

  const loadItem = state.loads.find((row) => row.loadNo === loadNo);
  if (!loadItem) return;

  loadItem.jobNumbers = String(loadItem.jobNumbers || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== jobNo)
    .join(", ");

  recalculateLoad(loadItem);
  await persistRecord("load", loadItem);
  addHistory("Removed shipment from consolidation", `${loadNo} - ${jobNo}`);
  saveState();
  notifySuccess("Shipment removed", `${jobNo} was removed from ${loadNo}.`);
  render();
}

async function submitCustomerShipmentRequest(data, form) {
  const session = currentSession();
  if (!session?.token) { notifyDenied("Login required", "Please login again."); return false; }
  const requiredFields = ["shipmentType", "shipmentVia", "origin", "destination", "pickupDate", "consignee", "consigneeContactPerson", "consigneeMobile", "deliveryLocation", "deliveryAddress"];
  for (const fieldName of requiredFields) {
    const field = form.querySelector(`[name='${fieldName}']`);
    if (!String(field?.value || "").trim()) {
      notifyDenied("Missing booking details", `Please complete ${field?.closest("label")?.textContent?.trim() || fieldName}.`);
      field?.focus();
      return false;
    }
  }
  const requestNo = String(data.requestNo || "").trim();
  const existingRequest = requestNo ? portalRows("shipmentRequests").find((row) => String(row.request_no || row.requestNo || "") === requestNo) : null;
  const resubmitting = portalStatus(existingRequest?.status) === "SENT_BACK";
  const files = Array.from(form.querySelector("input[type='file']")?.files || []);
  const existingFiles = parseJsonMeta(existingRequest?.attachments_json || existingRequest?.attachmentsJson || "[]");
  if (!files.length && (!resubmitting || !Array.isArray(existingFiles) || !existingFiles.length)) { notifyDenied("Documents required", "Upload at least one shipment document before selecting the item and submitting the request."); return false; }
  if (files.length > 5) throw new Error("You can upload a maximum of 5 attachments per shipment request.");
  if (!String(data.itemName || "").trim()) { notifyDenied("Item required", "Enter the item name or description. If no HS code is found, the company team will review it."); return false; }
  const cargoItems = parsePalletDimensions(data.cargoItemsJson || "[]");
  if (!cargoItems.length) { notifyDenied("Cargo details required", "Add at least one pallet, carton, or package before submitting."); return false; }
  const requestDetails = {
    shipmentVia: data.shipmentVia || "", pickupDate: data.pickupDate || "", deliveryDate: data.deliveryDate || "",
    consigneeContactPerson: data.consigneeContactPerson || "", consigneeMobile: data.consigneeMobile || "",
    deliveryLocation: data.deliveryLocation || "", deliveryAddress: data.deliveryAddress || "", customerReference: data.customerReference || "",
    cargoItemsJson: data.cargoItemsJson || "[]", pieces: Number(data.pieces || 0), cbm: Number(data.cbm || 0),
    complianceAnalysisId: data.complianceAnalysisId || "",
    actualKg: Number(data.actualKg || 0), chargeableKg: Number(data.chargeableKg || 0),
    volumeCategory: data.volumeCategory || "1 CBM = 250 KG", chargeableDivisor: Number(data.chargeableDivisor || 0)
  };
  const result = await fetchJson(resubmitting ? `/api/customer/shipment-requests/${encodeURIComponent(requestNo)}` : "/api/customer/shipment-requests", { method: resubmitting ? "PUT" : "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token }, body: JSON.stringify({ ...data, quantity: Number(data.pieces || 0), weight: Number(data.actualKg || 0), attachments: [], requestDetails }) });
  const savedRequestNo = resubmitting ? requestNo : (result?.row?.requestNo || result?.row?.request_no);
  if (!savedRequestNo) throw new Error("Shipment request was saved but its reference number was not returned.");
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
    const contentBase64 = await readFileAsBase64(file);
    await fetchJson(`/api/customer/shipment-requests/${encodeURIComponent(savedRequestNo)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64 })
    });
  }
  state.ui.customerRequestEditNo = "";
  notifySuccess(resubmitting ? "Request resubmitted" : "Request submitted", "Shipment request " + savedRequestNo + (resubmitting ? " was returned to company review." : " was saved with " + files.length + " attachment(s)."));
  await syncCustomerPortal();
  activeModule = "Customer Shipments";
  return true;
}

function bindCustomerShipmentRequestForm() {
  const form = moduleContent.querySelector("form[data-form='customer-shipment-request']");
  if (!form) return;
  const documentField = form.querySelector("input[name='attachments']");
  const documentStatus = form.querySelector("[data-customer-document-status]");
  const hsStep = form.querySelector("[data-customer-hs-step]");
  const itemField = form.querySelector("input[name='itemName']");
  const hsCodeField = form.querySelector("input[name='hsCode']");
  const itemCodeField = form.querySelector("input[name='itemCode']");
  const masterItems = portalRows("hsCodeMaster");
  const syncDocuments = () => {
    const files = Array.from(documentField?.files || []);
    const retainedDocuments = Boolean(form.querySelector("[name='requestNo']")?.value);
    const valid = retainedDocuments || (files.length > 0 && files.length <= 5 && files.every((file) => file.size <= 10 * 1024 * 1024));
    if (hsStep) hsStep.hidden = !valid;
    if (documentStatus) documentStatus.textContent = retainedDocuments && !files.length ? "Existing documents are retained. You can edit the item and HS code." : !files.length ? "Select at least one file. Maximum 5 files, 10 MB each." : valid ? `${files.length} document(s) selected. You can now select the item and HS code.` : "Use up to 5 files, each 10 MB or smaller.";
  };
  const syncHsCode = () => {
    const selected = masterItems.find((row) => String(row.item_name || row.itemName || "").trim().toLowerCase() === String(itemField?.value || "").trim().toLowerCase());
    if (!selected) return;
    if (hsCodeField) hsCodeField.value = selected.hs_code || selected.hsCode || "";
    if (itemCodeField) itemCodeField.value = selected.item_code || selected.itemCode || "";
  };
  documentField?.addEventListener("change", syncDocuments);
  itemField?.addEventListener("change", syncHsCode);
  itemField?.addEventListener("input", syncHsCode);
  syncDocuments();

  const cargoRoot = form.querySelector("[data-customer-cargo]");
  if (!cargoRoot) return;
  const linesField = cargoRoot.querySelector("input[name='cargoItemsJson']");
  const list = cargoRoot.querySelector("[data-customer-cargo-lines]");
  const fields = Object.fromEntries(["cargoPackageType", "cargoQuantity", "cargoLength", "cargoWidth", "cargoHeight", "cargoDimensionUnit", "cargoWeightPerUnit", "volumeCategory", "cbm", "actualKg", "chargeableKg", "pieces", "chargeableDivisor"].map((name) => [name, form.querySelector(`[name='${name}']`)]));
  const lines = parsePalletDimensions(linesField?.value || "[]");
  const syncCargo = () => {
    const category = fields.volumeCategory?.value || "1 CBM = 250 KG";
    const divisor = volumeDivisorFor(category);
    const pieces = lines.reduce((sum, line) => sum + Number(line.count || 0), 0);
    const gross = lines.reduce((sum, line) => sum + Number(line.weightKg || 0), 0);
    const rawCbm = lines.reduce((sum, line) => sum + Number(line.total || 0), 0);
    const cbm = roundUpToHalf(rawCbm);
    const volumeWeight = isSameAsGrossWeightCategory(category) ? gross : cbm * divisor;
    const chargeable = roundUpToWholeKg(Math.max(gross, volumeWeight));
    if (linesField) linesField.value = JSON.stringify(lines);
    if (fields.pieces) fields.pieces.value = String(pieces);
    if (fields.cbm) fields.cbm.value = String(cbm);
    if (fields.actualKg) fields.actualKg.value = String(Number(gross.toFixed(3)));
    if (fields.chargeableKg) fields.chargeableKg.value = String(chargeable);
    if (fields.chargeableDivisor) fields.chargeableDivisor.value = isSameAsGrossWeightCategory(category) ? "" : String(divisor);
    if (list) list.innerHTML = lines.length ? `<div class="table-wrap"><table class="tariff-charges-table"><thead><tr><th>Package</th><th>Qty</th><th>Dimensions</th><th>Gross KG</th><th>CBM</th><th></th></tr></thead><tbody>${lines.map((line, index) => `<tr><td>${escapeHtml(line.packageType)}</td><td>${line.count}</td><td>${line.length} × ${line.width} × ${line.height} ${escapeHtml(line.dimensionUnit)}</td><td>${money(line.weightKg)}</td><td>${money(line.total)}</td><td><button type="button" class="ghost-button" data-customer-remove-cargo="${index}">Remove</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty-state">No cargo added yet.</p>`;
  };
  cargoRoot.addEventListener("apollo:replace-cargo", (event) => {
    const replacement = Array.isArray(event.detail?.lines) ? event.detail.lines : [];
    lines.splice(0, lines.length, ...replacement);
    syncCargo();
  });
  cargoRoot.addEventListener("click", (event) => {
    const add = event.target.closest("[data-customer-add-cargo]");
    if (add) {
      const count = Number(fields.cargoQuantity?.value || 0); const length = Number(fields.cargoLength?.value || 0); const width = Number(fields.cargoWidth?.value || 0); const height = Number(fields.cargoHeight?.value || 0); const weight = Number(fields.cargoWeightPerUnit?.value || 0);
      if (count <= 0 || length <= 0 || width <= 0 || height <= 0 || weight < 0) { notifyDenied("Cargo line not added", "Enter quantity, dimensions, and gross weight per unit."); return; }
      const dimensionUnit = fields.cargoDimensionUnit?.value || "CM";
      lines.push({ packageType: fields.cargoPackageType?.value || "Package", count, quantity: count, length, width, height, dimensionUnit, weight, weightKg: weight * count, totalWeight: weight * count, total: cargoVolumeCbm(count, length, width, height, dimensionUnit) });
      syncCargo();
      return;
    }
    const remove = event.target.closest("[data-customer-remove-cargo]");
    if (remove) { lines.splice(Number(remove.dataset.customerRemoveCargo), 1); syncCargo(); }
  });
  fields.volumeCategory?.addEventListener("change", syncCargo);
  syncCargo();
}

async function updateCustomerProfile(data) {
  const session = currentSession();
  if (!session?.token) return false;
  await fetchJson("/api/customer/profile", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token }, body: JSON.stringify(data) });
  notifySuccess("Profile saved", "Your customer profile was updated.");
  return true;
}

function employeeDocumentUploadRule(documentType) {
  const rules = {
    "Employee Photo": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Civil ID Front": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Civil ID Back": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Passport Front": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Passport Back": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Work Permit": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" },
    "Other": { accept: "application/pdf,.pdf,image/jpeg,image/png", mimeTypes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024, label: "PDF, JPG or PNG" }
  };
  return rules[documentType] || null;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

async function uploadEmployeeProfileDocument(documentType) {
  const rule = employeeDocumentUploadRule(documentType);
  if (!rule || !isHrSession()) return;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = rule.accept;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!rule.mimeTypes.includes(String(file.type || "").toLowerCase())) {
      notifyDenied("File not uploaded", `${documentType} must be a ${rule.label} file.`);
      return;
    }
    if (file.size > rule.maxBytes) {
      notifyDenied("File not uploaded", `${documentType} must be ${rule.maxBytes / 1024 / 1024} MB or smaller.`);
      return;
    }
    try {
      notifySuccess("Uploading document", `Uploading ${documentType}...`);
      const contentBase64 = await readFileAsBase64(file);
      const result = await fetchJson("/api/employee-profile-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, fileName: file.name, mimeType: file.type, contentBase64 })
      });
      const documentItem = apiDocument(result.row || {});
      const current = Array.isArray(state.employeeProfileDocuments) ? state.employeeProfileDocuments : [];
      state.employeeProfileDocuments = [...current.filter((item) => item.type !== documentType), documentItem];
      saveState();
      render();
      notifySuccess("Document uploaded", `${documentType} was uploaded successfully.`);
    } catch (error) {
      notifyDenied("File not uploaded", error.message || "The document could not be uploaded.");
    }
  }, { once: true });
  fileInput.click();
}

async function viewEmployeeProfileDocument(documentNo) {
  if (!documentNo || !isHrSession()) return;
  const viewer = window.open("", "_blank");
  try {
    const result = await fetchJson(`/api/employee-profile-documents/${encodeURIComponent(documentNo)}/view`);
    if (!result?.url) throw new Error("The file could not be opened.");
    if (viewer) {
      viewer.opener = null;
      viewer.location.href = result.url;
    } else {
      window.location.assign(result.url);
    }
  } catch (error) {
    if (viewer) viewer.close();
    notifyDenied("File not opened", error.message || "The file could not be opened.");
  }
}

async function deleteEmployeeProfileDocument(documentNo) {
  if (!documentNo || !isHrSession() || !window.confirm("Delete this document? You can upload a replacement afterward.")) return;
  try {
    await fetchJson(`/api/employee-profile-documents/${encodeURIComponent(documentNo)}`, { method: "DELETE" });
    state.employeeProfileDocuments = (state.employeeProfileDocuments || []).filter((item) => item.documentNo !== documentNo);
    saveState(); render(); notifySuccess("Document deleted", "The employee document was removed.");
  } catch (error) { notifyDenied("Document not deleted", error.message || "The document could not be deleted."); }
}

const EMPLOYEE_DOCUMENT_TYPES_FOR_DIALOG = [
  ["Employee Photo", "Profile Photo", "JPG, JPEG or PNG • Maximum 10 MB"],
  ["Civil ID Front", "Civil ID — Front", "PDF, JPG or PNG • Maximum 10 MB"],
  ["Civil ID Back", "Civil ID — Back", "PDF, JPG or PNG • Maximum 10 MB"],
  ["Passport Front", "Passport — Front", "PDF, JPG or PNG • Maximum 10 MB"],
  ["Passport Back", "Passport — Back", "PDF, JPG or PNG • Maximum 10 MB"],
  ["Work Permit", "Work Permit", "PDF, JPG or PNG • Maximum 10 MB"],
  ["Other", "Other Document", "PDF, JPG or PNG • Maximum 10 MB"]
];

function employeeDocumentsDialogBody(userName, documents) {
  return `<div class="employee-document-list">
    ${EMPLOYEE_DOCUMENT_TYPES_FOR_DIALOG.map(([type, label, help]) => {
      const documentItem = documents.find((item) => item.type === type);
      const locked = documentItem?.locked === true;
      return `<article class="employee-document-row${locked ? " is-locked" : ""}">
        <div class="employee-document-row-main"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small>${type === "Employee Photo" && documentItem?.storageUrl ? `<img class="employee-profile-thumbnail" src="${escapeHtml(documentItem.storageUrl)}" alt="Employee profile" />` : ""}</div>
        <span class="${documentItem?.storageUrl ? "document-uploaded" : "document-missing"}">${documentItem?.storageUrl ? "Uploaded" : "Not uploaded"}</span>
        ${locked ? `<span class="document-locked">Locked</span>` : `<span class="document-unlocked">Unlocked</span>`}
        <div class="employee-document-row-actions">${documentItem?.documentNo ? `<button type="button" class="secondary-button" data-action="view-employee-document" data-document-no="${escapeHtml(documentItem.documentNo)}">View</button>` : ""}<button type="button" class="secondary-button" data-action="upload-employee-document-admin" data-document-type="${escapeHtml(type)}" data-employee="${escapeHtml(userName)}">${documentItem?.storageUrl ? "Change" : "Upload"}</button>${documentItem?.documentNo ? `<button type="button" class="${locked ? "secondary-button" : "ghost-button"}" data-action="toggle-employee-document-lock" data-document-no="${escapeHtml(documentItem.documentNo)}" data-locked="${locked ? "true" : "false"}">${locked ? "Unlock" : "Lock"}</button>` : ""}</div>
      </article>`;
    }).join("")}
  </div>`;
}

// HR Admin viewing/managing one employee's documents on their behalf - separate from the
// employee's own state.employeeProfileDocuments (that array is specifically "my documents" and
// must not get overwritten by whichever other employee an admin happens to be looking at).
async function openEmployeeDocumentsDialog(userName) {
  if (!userName || !isHrAdmin()) return;
  state.ui.openEmployeeDocumentsUserName = userName;
  let documents = [];
  try {
    const result = await fetchJson(`/api/employee-profile-documents?employee=${encodeURIComponent(userName)}`);
    documents = (result.rows || []).map(apiDocument);
  } catch (error) {
    notifyDenied("Could not load documents", error.message || "The employee's documents could not be loaded.");
    return;
  }
  const employeeRecord = state.employees.find((row) => row.userName === userName);
  openDialog({
    title: `Documents - ${employeeRecord?.fullName || userName}`,
    typeLabel: "Employee Documents",
    body: employeeDocumentsDialogBody(userName, documents),
    saveLabel: "Close",
    singleColumn: true,
    onSave() {
      recordDialog.close();
    }
  });
}

async function toggleEmployeeDocumentLock(documentNo, locked) {
  if (!documentNo || !isHrAdmin()) return;
  try {
    await fetchJson(`/api/employee-profile-documents/${encodeURIComponent(documentNo)}/lock`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: Boolean(locked) })
    });
    notifySuccess(locked ? "Document locked" : "Document unlocked", locked ? "The employee cannot change or delete this document now." : "The employee can change or delete this document again.");
    await openEmployeeDocumentsDialog(state.ui.openEmployeeDocumentsUserName || "");
  } catch (error) {
    notifyDenied("Document access not changed", error.message || "The document lock state could not be updated.");
  }
}

// Same upload flow as the employee's own self-service upload, but tagged with employeeUserName so
// the server saves it against that employee instead of the admin's own account, and refreshes the
// currently-open admin dialog in place afterward instead of touching the employee's own
// state.employeeProfileDocuments (which belongs to whoever is logged in, not who's being viewed).
async function uploadEmployeeProfileDocumentAsAdmin(userName, documentType) {
  const rule = employeeDocumentUploadRule(documentType);
  if (!rule || !userName || !isHrAdmin()) return;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = rule.accept;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!rule.mimeTypes.includes(String(file.type || "").toLowerCase())) {
      notifyDenied("File not uploaded", `${documentType} must be a ${rule.label} file.`);
      return;
    }
    if (file.size > rule.maxBytes) {
      notifyDenied("File not uploaded", `${documentType} must be ${rule.maxBytes / 1024 / 1024} MB or smaller.`);
      return;
    }
    try {
      notifySuccess("Uploading document", `Uploading ${documentType}...`);
      const contentBase64 = await readFileAsBase64(file);
      await fetchJson("/api/employee-profile-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeUserName: userName, documentType, fileName: file.name, mimeType: file.type, contentBase64 })
      });
      notifySuccess("Document uploaded", `${documentType} was uploaded for ${userName}.`);
      await openEmployeeDocumentsDialog(userName);
    } catch (error) {
      notifyDenied("File not uploaded", error.message || "The document could not be uploaded.");
    }
  }, { once: true });
  fileInput.click();
}

async function updateEmployeeProfile(data) {
  const userName = currentUserName();
  const existing = myEmployeeRecord();
  const record = {
    ...(existing || {}),
    userName,
    employeeCode: existing?.employeeCode || "",
    fullName: String(data.fullName || "").trim(),
    department: existing?.department || "",
    designation: existing?.designation || "",
    joinDate: existing?.joinDate || "",
    phone: String(data.phone || "").trim(),
    personalEmail: String(data.personalEmail || "").trim(),
    employmentStatus: existing?.employmentStatus || "Active",
    reportingManager: existing?.reportingManager || "",
    notes: existing?.notes || "",
    nationality: String(data.nationality || "").trim(),
    dateOfBirth: String(data.dateOfBirth || "").trim(),
    civilIdNo: String(data.civilIdNo || "").trim(),
    passportNo: String(data.passportNo || "").trim(),
    passportExpiry: String(data.passportExpiry || "").trim(),
    currentAddress: String(data.currentAddress || "").trim(),
    permanentAddress: String(data.permanentAddress || "").trim(),
    emergencyContactName: String(data.emergencyContactName || "").trim(),
    emergencyContactPhone: String(data.emergencyContactPhone || "").trim()
  };
  if (!record.fullName) {
    notifyDenied("Profile not saved", "Enter your full name first.");
    return false;
  }
  const saved = existing ? await persistRecord("employee", record) : await postRecord("employee", record);
  if (!saved) {
    notifyDenied("Profile not saved", "Could not save your profile. Please try again.");
    return false;
  }
  if (existing) Object.assign(existing, record);
  else state.employees.unshift(record);
  addHistory("Updated employee profile", userName);
  notifySuccess("Profile saved", "Your employee profile was updated.");
  return true;
}

async function updatePod(data) {
  return savePodDelivery(data);
}

async function updateStatus(data) {
  const jobNo = String(data.jobNo || "").trim();
  const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
  if (!shipmentItem) {
    notifyDenied("Shipment not found", "Select a valid Job No.");
    return false;
  }
  const requestedStatus = String(data.status || "").trim();
  const newStatus = statusOptions().find((option) => option.toLowerCase() === requestedStatus.toLowerCase()) || "";
  if (!newStatus) {
    notifyDenied("Status not selected", "Choose a valid shipment status before saving the update.");
    return false;
  }
  const oldStatus = shipmentItem.status;
  const airwayBillNo = String(shipmentItem.airwayBillNo || "").trim();
  const normalizedAwb = airwayBillNo.toLowerCase();
  const awbGroup = normalizedAwb
    ? state.shipments.filter((row) => String(row.airwayBillNo || "").trim().toLowerCase() === normalizedAwb)
    : [shipmentItem];
  if (newStatus.toLowerCase() === String(oldStatus || "").trim().toLowerCase() && (!airwayBillNo || awbGroup.every((row) => String(row.status || "").trim().toLowerCase() === newStatus.toLowerCase()))) {
    notifyDenied("Status already selected", `${jobNo} is already ${oldStatus}. Choose a different status to create a new journey update.`);
    return false;
  }
  const remark = data.notes || "";
  const entryDate = data.date || today();
  if (isBranchTransferStatus(newStatus) && !data.expectedArrivalDate && !shipmentItem.expectedArrivalDate) {
    notifyDenied("Expected arrival required", "Enter the expected arrival date before dispatching this shipment to the receiving branch.");
    return false;
  }
  if (isBranchTransferStatus(newStatus)) {
    shipmentItem.receivingBranch = shipmentReceivingBranch(shipmentItem);
    if (data.expectedArrivalDate) shipmentItem.expectedArrivalDate = data.expectedArrivalDate;
  }
  if (!airwayBillNo) {
    shipmentItem.status = newStatus;
    shipmentItem.notes = shipmentMetaNotes(shipmentItem);
    const saved = await persistRecord("shipment", shipmentItem);
    if (!saved) return false;
  } else {
    try {
      const result = await fetchJson("/api/shipments/status-by-awb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airwayBillNo, status: newStatus, notes: remark, updatedBy: currentUserName(), updatedAt: entryDate })
      });
      const serverRows = Array.isArray(result.rows) ? result.rows : [];
      if (serverRows.length) {
        serverRows.forEach((row) => {
          const local = state.shipments.find((item) => item.jobNo === row.job_no || item.jobNo === row.jobNo);
          if (local) Object.assign(local, apiShipment(row));
        });
      } else {
        awbGroup.forEach((row) => {
          row.status = newStatus;
          row.notes = shipmentMetaNotes(row);
        });
      }
    } catch (error) {
      notifyDenied("Status not saved", error.message || "The Airway Bill status could not be updated.");
      return false;
    }
  }
  const updatedGroup = airwayBillNo ? awbGroup : [shipmentItem];
  for (const row of updatedGroup) {
    const historyEntry = {
      jobNo: row.jobNo,
      status: newStatus,
      podStatus: row.podStatus,
      invoiceStatus: row.invoiceStatus,
      notes: airwayBillNo ? (remark ? `${remark} | AWB ${airwayBillNo}` : `Updated by AWB ${airwayBillNo}`) : remark,
      updatedBy: currentUserName(),
      updatedAt: entryDate
    };
    state.shipmentStatusHistory.unshift(historyEntry);
    if (!airwayBillNo) await postRecord("statusHistory", historyEntry);
  }
  const statusDetails = `status: ${oldStatus} -> ${newStatus}`;
  addHistory("Updated shipment status", `${airwayBillNo ? `AWB ${airwayBillNo}` : jobNo} -> ${newStatus}`, statusDetails);
  notifySuccess("Status updated", airwayBillNo ? `AWB ${airwayBillNo} and ${updatedGroup.length} related shipment(s) are now ${newStatus}.` : `${jobNo} is now ${newStatus}.`);
  if (airwayBillNo) {
    state.ui.expandedStatusAwb = airwayBillNo;
    state.ui.expandedStatusJob = "";
  } else {
    state.ui.expandedStatusJob = jobNo;
    state.ui.expandedStatusAwb = "";
  }
}


// Manifest ("load") status update - deliberately separate from the normal Edit Manifest dialog
// save path, which routes non-admin changes through an admin-approval request (see
// saveDialogRecordInner's "load" branch). A status change made here applies immediately for any
// user, no approval needed, and - like the Shipment Status Register's own Update Status form -
// takes a Status, Date, and Manual Remark. It then pushes that same status, date, and remark onto
// every shipment currently linked to this manifest, writing a normal statusHistory entry for each
// one so it shows up in that shipment's own tracking history exactly like a manual update would.
async function updateLoadStatus(data) {
  const loadNo = data.loadNo;
  const loadItem = state.loads.find((row) => row.loadNo === loadNo);
  if (!loadItem) {
    notifyDenied("Manifest not found", "Select a valid Manifest No.");
    return false;
  }

  const newStatus = String(data.status || loadItem.status).trim();
  const oldStatus = loadItem.status;
  if (newStatus.toLowerCase() === String(oldStatus || "").trim().toLowerCase()) {
    notifyDenied("Status already selected", `${loadNo} is already ${oldStatus}. Choose a different status to create a new update.`);
    return false;
  }
  const remark = data.notes || "";
  const entryDate = data.date || today();

  const previousStatus = loadItem.status;
  loadItem.status = newStatus;
  const savedLoad = await persistRecord("load", loadItem);
  if (!savedLoad) {
    loadItem.status = previousStatus;
    notifyDenied("Not saved", "This manifest status could not be saved to the server. Please try again.");
    return false;
  }

  const jobs = String(loadItem.jobNumbers || "").split(",").map((jobNo) => jobNo.trim()).filter(Boolean);
  let updatedShipments = 0;
  for (const jobNo of jobs) {
    const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
    if (!shipmentItem || String(shipmentItem.status || "").trim().toLowerCase() === newStatus.toLowerCase()) continue;
    const shipmentOldStatus = shipmentItem.status;
    shipmentItem.status = newStatus;
    shipmentItem.notes = shipmentMetaNotes(shipmentItem);
    const savedShipment = await persistRecord("shipment", shipmentItem);
    if (!savedShipment) {
      shipmentItem.status = shipmentOldStatus;
      continue;
    }
    updatedShipments += 1;

    const historyEntry = {
      jobNo,
      status: newStatus,
      podStatus: shipmentItem.podStatus,
      invoiceStatus: shipmentItem.invoiceStatus,
      notes: remark ? `${remark} (via Manifest ${loadNo})` : `Updated via Manifest ${loadNo}`,
      updatedBy: currentUserName(),
      updatedAt: entryDate
    };
    state.shipmentStatusHistory.unshift(historyEntry);
    await postRecord("statusHistory", historyEntry);
  }

  const statusDetails = `status: ${oldStatus} -> ${newStatus}`;
  addHistory("Updated manifest status", `${loadNo} -> ${newStatus}`, statusDetails);
  notifySuccess("Manifest status updated", `${loadNo} is now ${newStatus}${updatedShipments ? ` - ${updatedShipments} linked shipment(s) updated too.` : "."}`);
  return true;
}

async function sendShipmentStatusEmail(jobNo) {
  const shipmentItem = state.shipments.find((row) => row.jobNo === jobNo);
  if (!shipmentItem) {
    window.alert("Select a shipment first.");
    return;
  }
  try {
    const result = await fetchJson("/api/shipments/status-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobNo: shipmentItem.jobNo })
    });
    notifySuccess("Status update sent", `The shipment update was emailed to ${result.recipient}.`);
  } catch (error) {
    notifyDenied("Status update not sent", error.message || "The customer status email could not be sent.");
  }
}

boot();

/* APOLLO_DASHBOARD_LAYOUT_FEATURE */
(function () {
  "use strict";

  // Dashboard has its own independent settings, mirrored into the durable app settings snapshot.
  const STORAGE = "apollo.dashboard.columns.v3";
  const ROOTS = [
    '[data-page="dashboard"]',
    '#dashboard-page',
    '#dashboard',
    '.dashboard-page'
  ];

  function root() {
    for (const s of ROOTS) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function state() {
    try {
      const x = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      return x && typeof x === "object" ? x : {};
    } catch (_) { return {}; }
  }

  function save(x) {
    try { localStorage.setItem(STORAGE, JSON.stringify(x)); } catch (_) {}
    window.apolloPersistColumnLayout?.();
  }

  function getItems(r) {
    return Array.from(r.children).filter(el =>
      el.nodeType === 1 &&
      !el.matches("#apollo-dashboard-controls") &&
      !el.matches("#apollo-dashboard-layout-panel")
    );
  }

  function ensureIds(r) {
    return getItems(r).map((el, i) => {
      if (!el.dataset.apolloDashboardColumnId) {
        el.dataset.apolloDashboardColumnId =
          el.id || el.getAttribute("data-key") ||
          el.getAttribute("data-widget") || `dashboard-${i}`;
      }
      return el;
    });
  }

  function apply(r) {
    const items = ensureIds(r);
    const s = state();
    const hidden = s.hidden || {};
    const order = Array.isArray(s.order) ? s.order : [];

    order.forEach(id => {
      const el = items.find(x => x.dataset.apolloDashboardColumnId === id);
      if (el) r.appendChild(el);
    });

    items.forEach(el => {
      el.style.display = hidden[el.dataset.apolloDashboardColumnId] ? "none" : "";
    });

    // Dashboard lock mirrors the register concept: it controls rearrangement.
    if (s.locked) r.dataset.apolloDashboardLocked = "true";
    else delete r.dataset.apolloDashboardLocked;
  }

  function openColumns() {
    const r = root();
    if (!r) return;

    const old = document.getElementById("apollo-dashboard-layout-panel");
    if (old) { old.remove(); return; }

    const items = ensureIds(r);
    const s = state();

    const panel = document.createElement("div");
    panel.id = "apollo-dashboard-layout-panel";
    panel.style.cssText =
      "position:fixed;right:20px;top:80px;z-index:99999;background:#fff;" +
      "border:1px solid #ccc;border-radius:8px;padding:12px;min-width:290px;" +
      "max-height:70vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.18);";

    const title = document.createElement("div");
    title.textContent = "Dashboard Columns";
    title.style.cssText = "font-weight:600;margin-bottom:10px;";
    panel.appendChild(title);

    const list = document.createElement("div");

    items.forEach(el => {
      const id = el.dataset.apolloDashboardColumnId;
      const row = document.createElement("div");
      row.draggable = !s.locked;
      row.dataset.id = id;
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:7px 0;" +
        (s.locked ? "opacity:.65;cursor:not-allowed;" : "cursor:grab;");

      const grip = document.createElement("span");
      grip.textContent = "☰";
      grip.style.opacity = ".6";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !Boolean(s.hidden?.[id]);
      check.addEventListener("change", () => {
        const current = state();
        current.hidden = current.hidden || {};
        current.hidden[id] = !check.checked;
        save(current);
        el.style.display = check.checked ? "" : "none";
      });

      const name = document.createElement("span");
      name.textContent =
        el.getAttribute("data-title") ||
        el.getAttribute("aria-label") ||
        id;

      row.append(grip, check, name);

      row.addEventListener("dragstart", e => {
        if (state().locked) { e.preventDefault(); return; }
        e.dataTransfer.setData("text/plain", id);
      });

      row.addEventListener("dragover", e => {
        if (!state().locked) e.preventDefault();
      });

      row.addEventListener("drop", e => {
        if (state().locked) return;
        e.preventDefault();

        const fromId = e.dataTransfer.getData("text/plain");
        if (!fromId || fromId === id) return;

        const from = list.querySelector(`[data-id="${CSS.escape(fromId)}"]`);
        if (from) list.insertBefore(from, row);

        const current = state();
        current.order = Array.from(list.children).map(x => x.dataset.id);
        save(current);

        const source = items.find(x => x.dataset.apolloDashboardColumnId === fromId);
        const target = items.find(x => x.dataset.apolloDashboardColumnId === id);
        if (source && target) r.insertBefore(source, target);
      });

      list.appendChild(row);
    });

    panel.appendChild(list);

    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex;gap:8px;margin-top:10px;padding-top:10px;" +
      "border-top:1px solid #eee;";

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset Default";
    reset.onclick = () => {
      localStorage.removeItem(STORAGE);
      location.reload();
    };

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.onclick = () => panel.remove();

    actions.append(reset, close);
    panel.appendChild(actions);
    document.body.appendChild(panel);
  }

  function toggleLock(button) {
    const s = state();
    s.locked = !s.locked;
    save(s);
    button.textContent = s.locked ? "🔒 Locked" : "🔓 Unlocked";
    apply(root());
  }

  function ensureControls(r) {
    if (!r) return;

    let controls = document.getElementById("apollo-dashboard-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "apollo-dashboard-controls";
      controls.style.cssText =
        "display:flex;gap:8px;align-items:center;margin-bottom:10px;";

      const columns = document.createElement("button");
      columns.type = "button";
      columns.id = "apollo-dashboard-columns-button";
      columns.textContent = "⚙ Columns";
      columns.title = "Show, hide and arrange Dashboard columns";
      columns.onclick = openColumns;

      const lock = document.createElement("button");
      lock.type = "button";
      lock.id = "apollo-dashboard-lock-button";
      lock.onclick = () => toggleLock(lock);

      controls.append(columns, lock);
      r.insertBefore(controls, r.firstChild);
    }

    const lock = document.getElementById("apollo-dashboard-lock-button");
    if (lock) lock.textContent = state().locked ? "🔒 Locked" : "🔓 Unlocked";
  }

  function init() {
    const r = root();
    if (!r) return;
    ensureIds(r);
    apply(r);
    ensureControls(r);
  }

  window.apolloDashboardLayout = {
    init,
    open: openColumns,
    reset: () => {
      localStorage.removeItem(STORAGE);
      location.reload();
    }
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  new MutationObserver(init).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
function duplicateTcnDocumentHtml(record) {
  const lines = parsePalletDimensions(record.cargoItemsJson || record.palletDimensionsJson || "[]");
  const pieces = Number(record.pieces || 0) || lines.reduce((sum, line) => sum + Number(line.quantity || line.count || 0), 0);
  const weight = Number(record.actualKg || 0) || lines.reduce((sum, line) => sum + Number(line.weightKg || line.weight || 0), 0);
  const description = record.natureOfGoods || record.goodsDescription || "";
  const logo = String(record.documentCompanyLogoUrl || "/assets/alt-express-logo.png").trim();
  const company = String(record.documentCompanyName || "ALT EXPRESS CARGO AND CLEARING LLC").trim();
  const bookingParty = "Apollo Freight Solutions";
  const date = record.bookingDate || today();
  const remark = record.shipmentRemarks || record.remarks || "";
  const secondLogo = "/assets/second-tcn-logo.bmp";
  const displayDate = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-") : "";
  const cell = (label, value, extra = "") => `<div class="dw-cell"><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "")}</span>${extra}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(record.tcnNumber || record.jobNo || "Duplicate TCN")}</title><style>
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:10px}.waybill{width:190mm;margin:10mm auto 0;border:1px solid #111}.top{padding:5px 7px;border-bottom:1px solid #111;font-weight:700}.top span{float:right;font-size:20px;letter-spacing:.04em}.top small{font-size:8px}.grid{display:grid;grid-template-columns:1fr 1fr}.dw-cell{min-height:28mm;padding:5px 7px;border-bottom:1px solid #111}.grid>.dw-cell:nth-child(odd){border-right:1px solid #111}.dw-cell b{display:block;text-decoration:underline;margin-bottom:8px}.dw-cell span{display:block;white-space:pre-line;font-size:14px;line-height:1.35}.logo-cell{text-align:center}.logo-cell img{display:block;width:48mm;height:22mm;object-fit:contain;margin:2px auto}.small{min-height:12mm}.cargo{border-bottom:1px solid #111}.cargo-title{text-align:center;font-weight:700;padding:4px;border-bottom:1px solid #111}.cargo-head,.cargo-row{display:grid;grid-template-columns:1.1fr 1.1fr 2fr;border-bottom:1px solid #111}.cargo-head b,.cargo-row span{padding:4px 7px;border-right:1px solid #111}.cargo-head b:last-child,.cargo-row span:last-child{border-right:0}.total{padding:5px 7px;border-bottom:1px solid #111}.total-split{display:grid;grid-template-columns:1fr 1fr;padding:0}.total-split span{padding:5px 7px}.total-split span+span{border-left:1px solid #111}.notes{min-height:42mm;padding:6px 7px;border-bottom:1px solid #111}.charges{display:grid;grid-template-columns:1fr 1fr;min-height:25mm;border-bottom:1px solid #111}.charges>div{padding:5px 7px}.charges>div:first-child{border-right:1px solid #111}.alt-ref-cell{display:flex;align-items:center;justify-content:space-between;gap:8px}.alt-ref-cell img{width:30mm;height:16mm;object-fit:contain}.footer{text-align:center;padding:4px}.print{position:fixed;right:12px;top:12px;padding:7px 12px;border:1px solid #555;background:#eee;font-family:Arial,sans-serif}@media print{.print{display:none}.waybill{width:190mm;margin:10mm auto 0}}
  </style></head><body><button class="print" id="tcnPrintButton" type="button">Print</button><main class="waybill">
    <div class="top">TRUCK WAY BILL NUMBER <span>: ${escapeHtml(record.tcnNumber || record.jobNo || "")}</span><small><br>To be used for Single Consignment, Full Truck Load and Less Truck Load</small></div>
    <div class="grid">${cell("Shipper's Name and Address:", [record.shipperName || record.customer || "", record.shipperAddress || "", record.shipperCountry || ""].filter(Boolean).join("\n"))}${cell("TRUCK WAY BILL NUMBER", record.tcnNumber || record.airwayBillNo || record.jobNo || "")}${cell("Consignee Name and Address:", [record.consigneeName || record.customer || "", record.consigneeAddress || "", record.consigneeCountry || ""].filter(Boolean).join("\n"))}${cell("Truck AWB Issued By", "", '<div class="logo-cell"><img src="' + escapeHtml(logo) + '" alt="' + escapeHtml(company) + '"><span>' + escapeHtml(company) + '</span></div>')}${cell("Delivery Agent", bookingParty)}${cell("Booking Party", bookingParty)}${cell("Origin", [record.origin || record.pickupLocation || "", record.originCity || ""].filter(Boolean).join("     "))}${cell("Destination", [record.destination || record.deliveryLocation || "", record.destinationCity || ""].filter(Boolean).join("     "))}</div>
    <section class="cargo"><div class="cargo-title">PARTICULARS FURNISHED BY SHIPPER - CARRIER/AGENT NOT RESPONSIBLE</div><div class="cargo-head"><b>No of Pieces</b><b>Gross Weight (kgs.)</b><b>Description</b></div><div class="cargo-row"><span>${escapeHtml(pieces ? `${pieces} PACKAGE` : "")}</span><span>${escapeHtml(weight ? `${weight.toLocaleString()} Kgs` : "")}</span><span>${escapeHtml(description)}</span></div><div class="total total-split"><span>Total&nbsp;&nbsp; ${escapeHtml(pieces ? `${pieces} PACKAGE` : "")}&nbsp;&nbsp;&nbsp; ${escapeHtml(weight ? `${weight.toLocaleString()} Kgs` : "")}</span><span>Remark: ${escapeHtml(remark)}</span></div></section>
    <div class="notes">Invoice : ${escapeHtml(record.invoiceNo || "")}<br>Customer Reference : ${escapeHtml(record.customerReference || "")}<br><br>The particulars given above are as stated by shipper. The actual weight, measure, quantity, condition, content and value of the Goods are unknown to the Carrier.</div>
    <div class="charges"><div>Move Type　　　　　　　　 BND<br>Freight Charges<br>Duty and Other Charges<br>Origin Charges<br>Destination Charges</div><div class="alt-ref-cell"><img src="${escapeHtml(secondLogo)}" alt="Reference logo"><strong>THIS AWB IS ONLY FOR THE ALT REF.</strong></div></div><div class="footer">DATE　　 ${escapeHtml(displayDate)}</div>
  </main></body></html>`;
}

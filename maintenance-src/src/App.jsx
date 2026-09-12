import { useEffect, useMemo, useState } from "react";
import logo from "./assets/logo.png";

const DEFAULT_API_BASE_URL = import.meta.env.PROD
  ? "https://apollo-freighterp-f9kt.onrender.com"
  : "http://localhost:4000";
const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const REPORT_FOOTER_TEXT =
  "Designed by ApolloIT | Copyright \u00a9 2026 Apollo-Freight Solutions. All rights reserved.";

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function initialErpToken() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const handoffToken = hashParams.get("erpToken") || queryParams.get("erpToken");
  if (handoffToken) {
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.setItem("afs_token", handoffToken);
    return handoffToken;
  }
  return localStorage.getItem("afs_token") || "";
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => initialErpToken());
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [reportVehicleId, setReportVehicleId] = useState("all");
  const [reportExpenseType, setReportExpenseType] = useState("all");
  const [reportStart, setReportStart] = useState(() => isoDateDaysAgo(30));
  const [reportEnd, setReportEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [historySearch, setHistorySearch] = useState("");
  const [historySearchDraft, setHistorySearchDraft] = useState("");
  const [historyVehicleFilter, setHistoryVehicleFilter] = useState("");
  const [historyVehicleDraft, setHistoryVehicleDraft] = useState("");
  const [historyDriverFilter, setHistoryDriverFilter] = useState("");
  const [historyDriverDraft, setHistoryDriverDraft] = useState("");
  const [historyExpenseType, setHistoryExpenseType] = useState("all");
  const [historyPaidStatus, setHistoryPaidStatus] = useState("all");
  const [historyStart, setHistoryStart] = useState(() => isoDateDaysAgo(30));
  const [historyEnd, setHistoryEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [resetForm, setResetForm] = useState({ email: "", otp: "", password: "" });
  const [userForm, setUserForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "staff"
  });
  const [userPermissions, setUserPermissions] = useState({
    create: true,
    updateOwn: false,
    viewAll: false,
    editAll: false
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [vehicleForm, setVehicleForm] = useState({
    name: "",
    plateNumber: "",
    type: "Truck",
    driverName: "",
    routeName: "",
    status: "Active"
  });
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    vehicleId: "",
    type: "Fuel",
    amount: "",
    currency: "KWD",
    paidStatus: "unpaid",
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [successConfig, setSuccessConfig] = useState(null);
  const [historyConfig, setHistoryConfig] = useState(null);
  const [activeSection, setActiveSection] = useState("reports");

  const canViewAllExpenses = Boolean(
    user?.role === "admin" ||
      user?.role === "accountant" ||
      user?.permissions?.viewAll ||
      user?.permissions?.editAll
  );

  const canDeleteEntries = Boolean(user?.role === "admin" || user?.permissions?.editAll);

  useEffect(() => {
    if (activeSection === "userManagement" && user?.role !== "admin") {
      setActiveSection("reports");
    }
  }, [activeSection, user?.role]);

  useEffect(() => {
    // If we have a saved token, restore the session and load data.
    async function restore() {
      if (!token) {
        setStatus("ready");
        return;
      }

      try {
        setStatus("loading");
        const meRes = await fetch(apiUrl("/api/maintenance/auth/me"), {
          headers: authHeaders(token)
        });
        if (!meRes.ok) {
          throw new Error("Session expired. Please login again.");
        }
        const me = await meRes.json();
        setUser(me);
        const { usersData, vehiclesData, expensesData } = await loadAuthedData(token, me);
        setUsers(usersData);
        setVehicles(
          vehiclesData.map((vehicle) => ({
            id: vehicle.id,
            name: vehicle.name,
            plateNumber: vehicle.plate_number,
            type: vehicle.type,
            driverName: vehicle.driver_name,
            routeName: vehicle.route_name,
            status: vehicle.status,
            createdAt: vehicle.created_at,
            updatedAt: vehicle.updated_at,
            createdBy: vehicle.created_by,
            createdByName: vehicle.created_by_name,
            createdByUsername: vehicle.created_by_username
          }))
        );
        setExpenses(
          expensesData.map((expense) => ({
            id: expense.id,
            vehicleId: expense.vehicle_id,
            type: expense.type,
            amount: Number(expense.amount),
            currency: expense.currency,
            date: expense.expense_date,
            notes: expense.notes || "",
            paidStatus: expense.paid_status || "unpaid",
            createdAt: expense.created_at,
            updatedAt: expense.updated_at,
            createdBy: expense.created_by,
            createdByName: expense.created_by_name,
            createdByUsername: expense.created_by_username
          }))
        );
        setStatus("ready");
      } catch (restoreError) {
        setToken("");
        localStorage.removeItem("afs_token");
        setUser(null);
        setUsers([]);
        setVehicles([]);
        setExpenses([]);
        setError(restoreError.message);
        setStatus("ready");
      }
    }

    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token || !user) return undefined;

    let timeoutId;
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "focus"];

    function logoutForInactivity() {
      setUser(null);
      setToken("");
      localStorage.removeItem("afs_token");
      setUsers([]);
      setVehicles([]);
      setExpenses([]);
      setMessage("You were logged out after 30 minutes of inactivity.");
    }

    function resetInactivityTimer() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutForInactivity, INACTIVITY_TIMEOUT_MS);
    }

    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer));
    };
  }, [token, user]);

  const summary = useMemo(() => {
    const totals = expenses.reduce(
      (acc, item) => {
        acc[item.currency] = (acc[item.currency] || 0) + item.amount;
        return acc;
      },
      {}
    );

    return ["KWD", "AED"]
      .filter((currency) => totals[currency])
      .map((currency) => formatCurrency(totals[currency], currency))
      .join(" | ");
  }, [expenses]);

  const reportExpenses = useMemo(() => {
    const rangeFiltered = expenses.filter((expense) => isWithinRange(expense.date, reportStart, reportEnd));
    return rangeFiltered.filter((expense) => {
      const matchesVehicle = reportVehicleId === "all" || expense.vehicleId === reportVehicleId;
      const matchesType = reportExpenseType === "all" || expense.type === reportExpenseType;
      return matchesVehicle && matchesType;
    });
  }, [expenses, reportEnd, reportExpenseType, reportStart, reportVehicleId]);

  const reportSummary = useMemo(() => {
    const totals = reportExpenses.reduce(
      (acc, item) => {
        acc[item.currency] = (acc[item.currency] || 0) + item.amount;
        return acc;
      },
      {}
    );

    const formatted = ["KWD", "AED"]
      .filter((currency) => totals[currency])
      .map((currency) => formatCurrency(totals[currency], currency))
      .join(" | ");

    return formatted || "No totals";
  }, [reportExpenses]);

  const activeVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "Active").length,
    [vehicles]
  );

  const historyExpenses = useMemo(() => {
    const base = expenses.filter((expense) => isWithinRange(expense.date, historyStart, historyEnd));
    const vehicleQuery = historyVehicleFilter.trim().toLowerCase();
    const driverQuery = historyDriverFilter.trim().toLowerCase();
    const query = historySearch.trim().toLowerCase();

    const filteredByVehicleAndType = base.filter((expense) => {
      const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
      const vehicleName = (vehicle?.name || "").toLowerCase();
      const vehiclePlate = (vehicle?.plateNumber || "").toLowerCase();
      const driverName = (vehicle?.driverName || "").toLowerCase();
      const matchesVehicle = !vehicleQuery || vehicleName.includes(vehicleQuery) || vehiclePlate.includes(vehicleQuery);
      const matchesDriver = !driverQuery || driverName.includes(driverQuery);
      const matchesType = historyExpenseType === "all" || expense.type === historyExpenseType;
      const matchesPaid = historyPaidStatus === "all" || expense.paidStatus === historyPaidStatus;
      return matchesVehicle && matchesDriver && matchesType && matchesPaid;
    });

    if (!query) return filteredByVehicleAndType;

    return filteredByVehicleAndType.filter((expense) => {
      const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
      const vehicleName = (vehicle?.name || "").toLowerCase();
      const vehiclePlate = (vehicle?.plateNumber || "").toLowerCase();
      const driverName = (vehicle?.driverName || "").toLowerCase();
      return (
        expense.type.toLowerCase().includes(query) ||
        expense.notes.toLowerCase().includes(query) ||
        vehicleName.includes(query) ||
        vehiclePlate.includes(query) ||
        driverName.includes(query)
      );
    });
  }, [
    expenses,
    historyDriverFilter,
    historyEnd,
    historyExpenseType,
    historyPaidStatus,
    historySearch,
    historyStart,
    historyVehicleFilter,
    vehicles
  ]);

  const historySummary = useMemo(() => {
    const totals = historyExpenses.reduce(
      (acc, item) => {
        acc[item.currency] = (acc[item.currency] || 0) + item.amount;
        return acc;
      },
      {}
    );

    const formatted = ["KWD", "AED"]
      .filter((currency) => totals[currency])
      .map((currency) => formatCurrency(totals[currency], currency))
      .join(" | ");

    return formatted || "No totals";
  }, [historyExpenses]);

  const filteredVehicles = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();
    if (!query) return vehicles;

    return vehicles.filter((vehicle) => {
      return (
        vehicle.name.toLowerCase().includes(query) ||
        vehicle.plateNumber.toLowerCase().includes(query) ||
        (vehicle.driverName || "").toLowerCase().includes(query) ||
        (vehicle.routeName || "").toLowerCase().includes(query)
      );
    });
  }, [vehicleSearch, vehicles]);

  const menuItems = [
    { id: "reports", label: "Report" },
    { id: "addVehicle", label: "Add Vehicle" },
    { id: "addExpense", label: "Add Expense" },
    ...(user?.role === "admin" ? [{ id: "userManagement", label: "User Management" }] : []),
    { id: "vehicles", label: "Vehicle List History" },
    { id: "expenseHistory", label: "Expense History" }
  ];

  if (status === "loading") {
    return <div className="shell"><div className="panel">Loading live fleet data...</div></div>;
  }

  if (status === "error") {
    return <div className="shell"><div className="panel">API error: {error}</div></div>;
  }

  if (!user && !token) {
    return (
      <div className="shell">
        <div className="panel auth-panel">
          <img className="company-logo auth-logo" src={logo} alt="Apollo-Freight Solutions logo" />
          <p className="eyebrow auth-eyebrow">Apollo-Freight Solutions</p>
          <h1><BrandName /></h1>
          <p className="hero-copy auth-copy">Please sign in to the ERP portal and open Maintenance Portal from Switch Portal.</p>
          {error ? <p className="auth-error">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="shell">
        <section className="auth-wrap">
          <div className="panel auth-panel">
            <img className="company-logo auth-logo" src={logo} alt="Apollo-Freight Solutions logo" />
            <p className="eyebrow auth-eyebrow">Apollo-Freight Solutions</p>
            <h1><BrandName /></h1>
            <p className="hero-copy auth-copy">
              {authMode === "login"
                ? "Secure access for Apollo-Freight Solutions users."
                : authMode === "forgot"
                  ? "Enter the registered email to receive a password reset OTP."
                  : "Enter the OTP from your email and choose a new password."}
            </p>
            {authMode === "login" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <input
                  value={authForm.username}
                  onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Username"
                />
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Password"
                />
                <button className="primary-action" type="submit">Login</button>
                <button className="link-action" type="button" onClick={() => switchAuthMode("forgot")}>
                  Forgot password?
                </button>
              </form>
            ) : null}

            {authMode === "forgot" ? (
              <form className="auth-form" onSubmit={handleForgotPassword}>
                <input
                  type="email"
                  value={resetForm.email}
                  onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Registered email"
                  required
                />
                <button className="primary-action" type="submit">Send OTP</button>
                <button className="secondary-form-action" type="button" onClick={() => switchAuthMode("login")}>
                  Back to Login
                </button>
              </form>
            ) : null}

            {authMode === "reset" ? (
              <form className="auth-form" onSubmit={handleResetPassword}>
                <input
                  type="email"
                  value={resetForm.email}
                  onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Registered email"
                  required
                />
                <input
                  value={resetForm.otp}
                  onChange={(event) => setResetForm((current) => ({ ...current, otp: event.target.value }))}
                  placeholder="Email OTP"
                  required
                />
                <input
                  type="password"
                  value={resetForm.password}
                  onChange={(event) => setResetForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="New password"
                  required
                />
                <button className="primary-action" type="submit">Reset Password</button>
                <button className="secondary-form-action" type="button" onClick={() => switchAuthMode("login")}>
                  Back to Login
                </button>
              </form>
            ) : null}
            {authError ? <p className="error-text">{authError}</p> : null}
            {message ? <p className="auth-note">{message}</p> : null}
          </div>
        </section>
        <FooterNote />
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <img className="company-logo header-logo" src={logo} alt="Apollo-Freight Solutions logo" />
          <p className="eyebrow">Apollo-Freight Solutions</p>
          <h1><BrandName /></h1>
          <p className="hero-copy hero-tagline">
            We bring continents closer...
          </p>
        </div>
        <div className="hero-card">
          <span>Signed in as</span>
          <strong>{user?.name || "No user"}</strong>
          <span className="role-badge">{user?.role || "unknown"}</span>
          <div className="portal-actions">
            {user?.erpPortalAccess !== false ? (
              <button className="secondary-action" type="button" onClick={handleBackToErp}>Back to ERP Portal</button>
            ) : null}
            <button className="secondary-action" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="grid">
        {message ? <section className="panel success-banner">{message}</section> : null}

        <section className="panel stats">
          <article>
            <span>Total Vehicles</span>
            <strong>{vehicles.length}</strong>
          </article>
          <article>
            <span>Total Expenses</span>
            <strong>{summary || "No totals yet"}</strong>
          </article>
          <article>
            <span>Active Vehicles</span>
            <strong>{activeVehicles}</strong>
          </article>
        </section>

        <section className="panel menu-panel">
          <div className="section-head stack-on-mobile">
            <div>
              <h2>Menu</h2>
              <p>Open one workspace at a time.</p>
            </div>
          </div>
          <div className="menu-grid">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className={`menu-button${activeSection === item.id ? " is-active" : ""}`}
                type="button"
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {activeSection === "reports" ? (
        <section className="panel">
          <div className="section-head stack-on-mobile">
            <div>
              <h2>Reports</h2>
              <p>Date range + vehicle + type filters with totals and exports.</p>
            </div>
          </div>
          <div className="report-grid">
            <label className="report-field">
              <span>Start Date</span>
              <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
            </label>
            <label className="report-field">
              <span>End Date</span>
              <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
            </label>
            <label className="report-field">
              <span>Vehicle</span>
              <select value={reportVehicleId} onChange={(e) => setReportVehicleId(e.target.value)}>
                <option value="all">All vehicles</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} - {vehicle.plateNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="report-field">
              <span>Expense Type</span>
              <select value={reportExpenseType} onChange={(e) => setReportExpenseType(e.target.value)}>
                <option value="all">All types</option>
                <option>Fuel</option>
                <option>Maintenance</option>
                <option>Driver Allowance</option>
                <option>Tires</option>
                <option>Tolls</option>
                <option>Insurance</option>
                <option>Other</option>
              </select>
            </label>
            <div className="report-field">
              <span>Total (Filters)</span>
              <strong>{reportSummary}</strong>
            </div>
            <div className="report-actions">
              <button className="primary-action" type="button" onClick={() => exportExcelReport(reportExpenses, reportStart, reportEnd, "report")}>
                Export Excel
              </button>
              <button className="secondary-form-action" type="button" onClick={() => exportPdfReport(reportExpenses, reportStart, reportEnd, reportSummary, "report")}>
                Export PDF
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activeSection === "addVehicle" ? (
          <section className="panel">
            <div className="section-head stack-on-mobile">
              <div>
                <h2>Add Vehicle</h2>
                <p>Add and update vehicle details.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleVehicleSubmit}>
              <input
                value={vehicleForm.name}
                onChange={(event) => setVehicleForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Vehicle name"
                required
              />
              <input
                value={vehicleForm.plateNumber}
                onChange={(event) => setVehicleForm((current) => ({ ...current, plateNumber: event.target.value }))}
                placeholder="Plate number"
                required
              />
              <select
                value={vehicleForm.type}
                onChange={(event) => setVehicleForm((current) => ({ ...current, type: event.target.value }))}
              >
                <option>Truck</option>
                <option>Bus</option>
                <option>Van</option>
                <option>Pickup</option>
                <option>Trailer</option>
              </select>
              <input
                value={vehicleForm.driverName}
                onChange={(event) => setVehicleForm((current) => ({ ...current, driverName: event.target.value }))}
                placeholder="Driver name"
              />
              <input
                value={vehicleForm.routeName}
                onChange={(event) => setVehicleForm((current) => ({ ...current, routeName: event.target.value }))}
                placeholder="Route"
              />
              <select
                value={vehicleForm.status}
                onChange={(event) => setVehicleForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option>Active</option>
                <option>In Maintenance</option>
                <option>Inactive</option>
              </select>
              <button className="primary-action" type="submit">
                {editingVehicleId ? "Update Vehicle" : "Save Vehicle"}
              </button>
              {editingVehicleId ? (
                <button className="secondary-form-action" type="button" onClick={resetVehicleForm}>
                  Cancel
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {activeSection === "addExpense" ? (
          <section className="panel">
            <div className="section-head stack-on-mobile">
              <div>
                <h2>Add Expense</h2>
                <p>Add and update expense details.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={handleExpenseSubmit}>
              <select
                value={expenseForm.vehicleId}
                onChange={(event) => setExpenseForm((current) => ({ ...current, vehicleId: event.target.value }))}
                required
              >
                <option value="">Select vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} - {vehicle.plateNumber}
                  </option>
                ))}
              </select>
              <select
                value={expenseForm.type}
                onChange={(event) => setExpenseForm((current) => ({ ...current, type: event.target.value }))}
              >
                <option>Fuel</option>
                <option>Maintenance</option>
                <option>Driver Allowance</option>
                <option>Tires</option>
                <option>Tolls</option>
                <option>Insurance</option>
                <option>Other</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.001"
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="Amount"
                required
              />
              <select
                value={expenseForm.paidStatus}
                onChange={(event) => setExpenseForm((current) => ({ ...current, paidStatus: event.target.value }))}
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
              <select
                value={expenseForm.currency}
                onChange={(event) => setExpenseForm((current) => ({ ...current, currency: event.target.value }))}
              >
                <option value="KWD">KWD</option>
                <option value="AED">AED</option>
              </select>
              <input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))}
                required
              />
              <input
                value={expenseForm.notes}
                onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notes"
              />
              <button className="primary-action" type="submit">
                {editingExpenseId ? "Update Expense" : "Save Expense"}
              </button>
              {editingExpenseId ? (
                <button className="secondary-form-action" type="button" onClick={resetExpenseForm}>
                  Cancel
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {activeSection === "userManagement" ? (
        <section className="panel">
          <div className="section-head stack-on-mobile">
            <div>
              <h2>User Management</h2>
              <p>
                {user?.role === "admin"
                  ? "Manage users, roles, and permissions."
                  : "User records are hidden from the user portal."}
              </p>
            </div>
          </div>

          {user?.role === "admin" ? (
            <>
              <form className="form-grid user-form" onSubmit={handleUserSubmit}>
                <input
                  value={userForm.name}
                  onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Full name"
                  required
                />
                <input
                  value={userForm.username}
                  onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Username"
                  required
                />
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="User email"
                  required
                />
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={editingUserId ? "Password unchanged" : "Password"}
                  required={!editingUserId}
                />
              <select
                value={userForm.role}
                onChange={(event) => {
                  const role = event.target.value;
                  setUserForm((current) => ({ ...current, role }));
                  if (role === "accountant") {
                    setUserPermissions((current) => ({
                      ...current,
                      viewAll: true
                    }));
                  }
                  if (role === "admin") {
                    setUserPermissions({
                      create: true,
                      updateOwn: true,
                      viewAll: true,
                      editAll: true
                    });
                  }
                }}
              >
                <option value="staff">Staff</option>
                <option value="accountant">Accountant</option>
                <option value="admin">Admin</option>
              </select>
              <div className="perm-box">
                <label className="perm-item">
                  <input
                    type="checkbox"
                    checked={userPermissions.create}
                    onChange={(e) => setUserPermissions((c) => ({ ...c, create: e.target.checked }))}
                  />
                  Only entry (create)
                </label>
                <label className="perm-item">
                  <input
                    type="checkbox"
                    checked={userPermissions.updateOwn}
                    onChange={(e) => setUserPermissions((c) => ({ ...c, updateOwn: e.target.checked }))}
                  />
                  Can update own entries
                </label>
                <label className="perm-item">
                  <input
                    type="checkbox"
                    checked={userPermissions.viewAll}
                    onChange={(e) => setUserPermissions((c) => ({ ...c, viewAll: e.target.checked }))}
                  />
                  View all user data
                </label>
                <label className="perm-item">
                  <input
                    type="checkbox"
                    checked={userPermissions.editAll}
                    onChange={(e) =>
                      setUserPermissions((c) => ({
                        ...c,
                        editAll: e.target.checked,
                        viewAll: e.target.checked ? true : c.viewAll
                      }))
                    }
                  />
                  Edit all user data
                </label>
              </div>
              <button className="primary-action" type="submit">
                {editingUserId ? "Update User" : "Create User"}
              </button>
                {editingUserId ? (
                  <button className="secondary-form-action" type="button" onClick={resetUserForm}>
                    Cancel
                  </button>
                ) : null}
              </form>

              <div className="list">
                {users.length ? (
                  users.map((listedUser) => (
                    <article key={listedUser.id} className="list-card">
                      <h3>{listedUser.name}</h3>
                      <p>Username: {listedUser.username}</p>
                      <p>Email: {listedUser.email || "Not set"}</p>
                      <p>Role: {listedUser.role}</p>
                      <div className="action-row">
                        <button className="inline-action" type="button" onClick={() => handleEditUser(listedUser)}>
                          Edit
                        </button>
                        <button className="inline-action" type="button" onClick={() => handleChangePassword(listedUser)}>
                          Change Password
                        </button>
                        <button className="inline-action danger-action" type="button" onClick={() => handleDeleteUser(listedUser)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">No users found.</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">User list is hidden for non-admin accounts.</div>
          )}
        </section>
        ) : null}

        {activeSection === "vehicles" ? (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Vehicle List History</h2>
                <p>Search by vehicle name, plate number, driver, or route.</p>
              </div>
              <input
                value={vehicleSearch}
                onChange={(event) => setVehicleSearch(event.target.value)}
                placeholder="Search vehicles"
              />
            </div>

            <div className="list">
              {filteredVehicles.length ? (
                filteredVehicles.map((vehicle) => (
                  <article key={vehicle.id} className="list-card">
                    <h3>{vehicle.name}</h3>
                    <p>Plate: {vehicle.plateNumber}</p>
                    <p>Type: {vehicle.type}</p>
                    <p>Driver: {vehicle.driverName || "Not assigned"}</p>
                    <p>Route: {vehicle.routeName || "Not assigned"}</p>
                    {vehicle.createdByUsername ? (
                      <p>Entered by: {vehicle.createdByName || "Unknown"} ({vehicle.createdByUsername})</p>
                    ) : null}
                    <strong>{vehicle.status}</strong>
                    {isUpdated(vehicle.createdAt, vehicle.updatedAt) ? (
                      <div className="updated-badge">Updated: {formatDateTime(vehicle.updatedAt)}</div>
                    ) : null}
                    <div className="action-row">
                      <button className="inline-action" type="button" onClick={() => handleEditVehicle(vehicle)}>
                        Edit
                      </button>
                      <button className="inline-action" type="button" onClick={() => viewVehicleHistory(vehicle)}>
                        History
                      </button>
                      {canDeleteEntries ? (
                        <button className="inline-action danger-action" type="button" onClick={() => handleDeleteVehicle(vehicle)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No vehicles found.</div>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "expenseHistory" ? (
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Expense History</h2>
                <p>Separate filters for history list, totals, and exports.</p>
              </div>
              <form className="expense-filters" onSubmit={handleHistorySearchSubmit}>
                <input
                  type="date"
                  value={historyStart}
                  onChange={(event) => setHistoryStart(event.target.value)}
                />
                <input
                  type="date"
                  value={historyEnd}
                  onChange={(event) => setHistoryEnd(event.target.value)}
                />
                <input
                  value={historyVehicleDraft}
                  onChange={(event) => setHistoryVehicleDraft(event.target.value)}
                  placeholder="Vehicle name or plate"
                />
                <input
                  value={historyDriverDraft}
                  onChange={(event) => setHistoryDriverDraft(event.target.value)}
                  placeholder="Driver name"
                />
                <select
                  value={historyExpenseType}
                  onChange={(event) => setHistoryExpenseType(event.target.value)}
                >
                  <option value="all">All types</option>
                  <option>Fuel</option>
                  <option>Maintenance</option>
                  <option>Driver Allowance</option>
                  <option>Tires</option>
                  <option>Tolls</option>
                  <option>Insurance</option>
                  <option>Other</option>
                </select>
                <select
                  value={historyPaidStatus}
                  onChange={(event) => setHistoryPaidStatus(event.target.value)}
                >
                  <option value="all">Paid/Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
                <input
                  value={historySearchDraft}
                  onChange={(event) => setHistorySearchDraft(event.target.value)}
                  placeholder="Search notes/type"
                />
                <button className="primary-action" type="submit">
                  Search
                </button>
              </form>
            </div>

            <div className="range-summary">
              <strong>Filtered total:</strong> {historySummary}
              <span className="range-summary-count">Records: {historyExpenses.length}</span>
              <div className="range-summary-actions">
                <button className="primary-action" type="button" onClick={() => exportExcelReport(historyExpenses, historyStart, historyEnd, "history")}>
                  Export Excel
                </button>
                <button className="secondary-form-action" type="button" onClick={() => exportPdfReport(historyExpenses, historyStart, historyEnd, historySummary, "history")}>
                  Export PDF
                </button>
              </div>
            </div>

            <div className="table-scroll">
              {historyExpenses.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sr. No</th>
                      <th>Date of Entry</th>
                      <th>Vehicle Name</th>
                      <th>Driver Name</th>
                      <th>Type of Expense</th>
                      <th>KD</th>
                      <th>AED</th>
                      <th>Status</th>
                      <th>History</th>
                      <th>Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyExpenses.map((expense, index) => {
                      const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
                      return (
                        <tr key={expense.id}>
                          <td>{index + 1}</td>
                          <td>{formatDateOnly(expense.date)}</td>
                          <td>{vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : "Unknown vehicle"}</td>
                          <td>{vehicle?.driverName || "Not assigned"}</td>
                          <td>
                            <strong>{expense.type}</strong>
                            {expense.notes ? <span className="table-note">{expense.notes}</span> : null}
                            {canViewAllExpenses && expense.createdByUsername ? (
                              <span className="table-note">Entered by {expense.createdByName || "Unknown"} ({expense.createdByUsername})</span>
                            ) : null}
                            {isUpdated(expense.createdAt, expense.updatedAt) ? (
                              <span className="table-note">Updated {formatDateTime(expense.updatedAt)}</span>
                            ) : null}
                          </td>
                          <td>{expense.currency === "KWD" ? formatAmount(expense.amount) : "-"}</td>
                          <td>{expense.currency === "AED" ? formatAmount(expense.amount) : "-"}</td>
                          <td className="paid-status">{expense.paidStatus}</td>
                          <td>
                            <button className="inline-action compact-action" type="button" onClick={() => viewExpenseHistory(expense)}>
                              History
                            </button>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button className="inline-action compact-action" type="button" onClick={() => handleEditExpense(expense)}>
                                Edit
                              </button>
                              {canDeleteEntries ? (
                                <button className="inline-action compact-action danger-action" type="button" onClick={() => handleDeleteExpense(expense)}>
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">No expenses found.</div>
              )}
            </div>
          </section>
        ) : null}

      </main>
      <FooterNote />

      {passwordModalUser ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Change Password</h3>
            <p>Set a new password for {passwordModalUser.username}.</p>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
            <div className="modal-actions">
              <button className="primary-action" type="button" onClick={submitPasswordChange}>
                Save Password
              </button>
              <button className="secondary-form-action" type="button" onClick={closePasswordModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmConfig ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>{confirmConfig.title}</h3>
            <p>{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="primary-action" type="button" onClick={confirmConfig.onConfirm}>
                Confirm
              </button>
              <button className="secondary-form-action" type="button" onClick={() => setConfirmConfig(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {successConfig ? (
        <div className="modal-backdrop">
          <div className="modal-card status-modal">
            <div className="status-icon">Success</div>
            <h3>{successConfig.title || "Success"}</h3>
            <p>{successConfig.message}</p>
            <div className="modal-actions">
              <button className="primary-action" type="button" onClick={() => setSuccessConfig(null)}>
                Success
              </button>
              <button className="secondary-form-action" type="button" onClick={() => setSuccessConfig(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyConfig ? (
        <div className="modal-backdrop">
          <div className="modal-card modal-wide">
            <h3>{historyConfig.title}</h3>
            <p>{historyConfig.subtitle}</p>
            <div className="history-list">
              {historyConfig.items.length ? (
                historyConfig.items.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-meta">
                      <strong>{formatDateOnly(item.changed_at)}</strong>
                    </div>
                    <div className="history-grid">
                      <div>
                        <div className="history-label">Previous</div>
                        <pre className="history-pre">{formatHistoryRow(item.old_row)}</pre>
                      </div>
                      <div>
                        <div className="history-label">Updated</div>
                        <pre className="history-pre">{formatHistoryRow(item.new_row)}</pre>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">No history found.</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="secondary-form-action" type="button" onClick={() => setHistoryConfig(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    setMessage("");

    try {
      const response = await fetch(apiUrl("/api/maintenance/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authForm)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      setUser({
        id: data.id,
        name: data.name,
        username: data.username,
        email: data.email,
        role: data.role,
        permissions: data.permissions || {}
      });
      setToken(data.token);
      localStorage.setItem("afs_token", data.token);
      const { usersData, vehiclesData, expensesData } = await loadAuthedData(data.token, data);
      setUsers(usersData);
      setVehicles(
        vehiclesData.map((vehicle) => ({
          id: vehicle.id,
          name: vehicle.name,
          plateNumber: vehicle.plate_number,
          type: vehicle.type,
          driverName: vehicle.driver_name,
          routeName: vehicle.route_name,
          status: vehicle.status,
          createdAt: vehicle.created_at,
          updatedAt: vehicle.updated_at,
          createdBy: vehicle.created_by,
          createdByName: vehicle.created_by_name,
          createdByUsername: vehicle.created_by_username
        }))
      );
      setExpenses(
        expensesData.map((expense) => ({
          id: expense.id,
          vehicleId: expense.vehicle_id,
          type: expense.type,
          amount: Number(expense.amount),
          currency: expense.currency,
          date: expense.expense_date,
          notes: expense.notes || "",
          paidStatus: expense.paid_status || "unpaid",
          createdAt: expense.created_at,
          updatedAt: expense.updated_at,
          createdBy: expense.created_by,
          createdByName: expense.created_by_name,
          createdByUsername: expense.created_by_username
        }))
      );
      setMessage(`Welcome back, ${data.name || data.username || "ERP user"}.`);
    } catch (loginError) {
      setAuthError(loginError.message);
    }
  }

  function switchAuthMode(nextMode) {
    setAuthMode(nextMode);
    setAuthError("");
    setMessage("");
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setAuthError("");
    setMessage("");

    try {
      const response = await fetch(apiUrl("/api/maintenance/auth/forgot-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: resetForm.email })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to send reset OTP.");
      }

      setAuthMode("reset");
      setMessage(data.message || "OTP sent. Please check your email.");
    } catch (forgotError) {
      setAuthError(forgotError.message);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setAuthError("");
    setMessage("");

    try {
      const response = await fetch(apiUrl("/api/maintenance/auth/reset-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(resetForm)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to reset password.");
      }

      setResetForm({ email: "", otp: "", password: "" });
      setAuthMode("login");
      setMessage(data.message || "Password reset successfully.");
    } catch (resetError) {
      setAuthError(resetError.message);
    }
  }

  function handleBackToErp() {
    if (!token) {
      window.location.assign("/");
      return;
    }
    window.location.assign(`/#erpToken=${encodeURIComponent(token)}`);
  }

  function handleLogout() {
    setUser(null);
    setMessage("");
    setToken("");
    localStorage.removeItem("afs_token");
    setUsers([]);
    setVehicles([]);
    setExpenses([]);
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(
      editingUserId
        ? apiUrl(`/api/maintenance/users/${editingUserId}`)
        : apiUrl("/api/maintenance/users"),
      {
        method: editingUserId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token)
        },
      body: JSON.stringify({
        ...userForm,
        permissions: userPermissions
      })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Unable to create user.");
      return;
    }

    setUsers((current) =>
      editingUserId
        ? current.map((listedUser) => (listedUser.id === editingUserId ? data : listedUser))
        : [data, ...current]
    );
    resetUserForm();
    showSuccess(`User ${data.username} ${editingUserId ? "updated" : "created"} successfully.`);
  }

  async function handleVehicleSubmit(event) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(
      editingVehicleId
        ? apiUrl(`/api/maintenance/vehicles/${editingVehicleId}`)
        : apiUrl("/api/maintenance/vehicles"),
      {
        method: editingVehicleId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token)
        },
        body: JSON.stringify(vehicleForm)
      }
    );

    if (!response.ok) {
      setMessage("Unable to save vehicle.");
      return;
    }

    const created = await response.json();
    const mappedVehicle = {
      id: created.id,
      name: created.name,
      plateNumber: created.plate_number,
      type: created.type,
      driverName: created.driver_name,
      routeName: created.route_name,
      status: created.status,
      createdAt: created.created_at,
      updatedAt: created.updated_at
      ,createdBy: created.created_by || user?.id
      ,createdByName: created.created_by_name || user?.name
      ,createdByUsername: created.created_by_username || user?.username
    };

    setVehicles((current) =>
      editingVehicleId
        ? current.map((vehicle) => (vehicle.id === editingVehicleId ? mappedVehicle : vehicle))
        : [mappedVehicle, ...current]
    );
    setExpenseForm((current) => ({
      ...current,
      vehicleId: current.vehicleId || mappedVehicle.id
    }));
    resetVehicleForm();
    showSuccess(`Vehicle ${mappedVehicle.name} ${editingVehicleId ? "updated" : "saved"} successfully.`);
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(
      editingExpenseId
        ? apiUrl(`/api/maintenance/expenses/${editingExpenseId}`)
        : apiUrl("/api/maintenance/expenses"),
      {
        method: editingExpenseId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token)
        },
        body: JSON.stringify({
          ...expenseForm,
          amount: Number(expenseForm.amount)
        })
      }
    );

    if (!response.ok) {
      setMessage("Unable to save expense.");
      return;
    }

    const created = await response.json();
      const mappedExpense = {
        id: created.id,
        vehicleId: created.vehicle_id,
        type: created.type,
        amount: Number(created.amount),
        currency: created.currency,
        date: created.expense_date,
        notes: created.notes || "",
        paidStatus: created.paid_status || expenseForm.paidStatus || "unpaid",
        createdAt: created.created_at,
        updatedAt: created.updated_at
        ,createdBy: created.created_by || user?.id
        ,createdByName: created.created_by_name || user?.name
        ,createdByUsername: created.created_by_username || user?.username
      };
    setExpenses((current) =>
      editingExpenseId
        ? current.map((expense) => (expense.id === editingExpenseId ? mappedExpense : expense))
        : [mappedExpense, ...current]
    );
    resetExpenseForm();
    showSuccess(`Expense ${created.type} ${editingExpenseId ? "updated" : "saved"} successfully.`);
  }

  function handleEditVehicle(vehicle) {
    setActiveSection("addVehicle");
    setEditingVehicleId(vehicle.id);
    setVehicleForm({
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      type: vehicle.type,
      driverName: vehicle.driverName || "",
      routeName: vehicle.routeName || "",
      status: vehicle.status
    });
  }

  function handleEditExpense(expense) {
    setActiveSection("addExpense");
    setEditingExpenseId(expense.id);
    setExpenseForm({
      vehicleId: expense.vehicleId,
      type: expense.type,
      amount: String(expense.amount),
      currency: expense.currency,
      paidStatus: expense.paidStatus || "unpaid",
      expenseDate: expense.date,
      notes: expense.notes || ""
    });
  }

  async function viewVehicleHistory(vehicle) {
    try {
      const response = await fetch(apiUrl(`/api/maintenance/vehicles/${vehicle.id}/history`), {
        headers: authHeaders(token)
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Unable to load vehicle history.");
        return;
      }
      setHistoryConfig({
        title: `Vehicle History: ${vehicle.name}`,
        subtitle: `Plate: ${vehicle.plateNumber}`,
        items: data
      });
    } catch (historyError) {
      setMessage(`Unable to load vehicle history: ${historyError.message}`);
    }
  }

  async function viewExpenseHistory(expense) {
    try {
      const response = await fetch(apiUrl(`/api/maintenance/expenses/${expense.id}/history`), {
        headers: authHeaders(token)
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message || "Unable to load expense history.");
        return;
      }
      const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
      setHistoryConfig({
        title: `Expense History: ${expense.type}`,
        subtitle: vehicle ? `${vehicle.name} (${vehicle.plateNumber})` : "Unknown vehicle",
        items: data
      });
    } catch (historyError) {
      setMessage(`Unable to load expense history: ${historyError.message}`);
    }
  }

  function handleEditUser(listedUser) {
    setActiveSection("userManagement");
    setEditingUserId(listedUser.id);
    setUserForm({
      name: listedUser.name,
      username: listedUser.username,
      email: listedUser.email || "",
      password: "",
      role: listedUser.role
    });
    setUserPermissions({
      create: Boolean(listedUser.permissions?.create),
      updateOwn: Boolean(listedUser.permissions?.updateOwn),
      viewAll: Boolean(listedUser.permissions?.viewAll),
      editAll: Boolean(listedUser.permissions?.editAll)
    });
  }

  function handleChangePassword(listedUser) {
    setPasswordModalUser(listedUser);
    setNewPassword("");
  }

  async function submitPasswordChange() {
    if (!passwordModalUser || !newPassword) {
      return;
    }

    const response = await fetch(apiUrl(`/api/maintenance/users/${passwordModalUser.id}/password`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token)
      },
      body: JSON.stringify({ password: newPassword })
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Unable to change password.");
      return;
    }

    closePasswordModal();
    showSuccess(`Password changed for ${data.username}.`);
  }

  async function handleDeleteUser(listedUser) {
    if (listedUser.id === user?.id) {
      setMessage("You cannot delete the current logged-in admin user.");
      return;
    }

    setConfirmConfig({
      title: "Delete User",
      message: `Are you sure you want to delete ${listedUser.username}?`,
      onConfirm: async () => {
        const response = await fetch(apiUrl(`/api/maintenance/users/${listedUser.id}`), {
          method: "DELETE",
          headers: authHeaders(token)
        });

        const data = await response.json();
        if (!response.ok) {
          setMessage(data.message || "Unable to delete user.");
          setConfirmConfig(null);
          return;
        }

        setUsers((current) => current.filter((item) => item.id !== listedUser.id));
        setConfirmConfig(null);
        showSuccess(`${listedUser.username} deleted successfully.`);
      }
    });
  }

  async function handleDeleteVehicle(vehicle) {
    setConfirmConfig({
      title: "Delete Vehicle",
      message: `Are you sure you want to delete ${vehicle.name}?`,
      onConfirm: async () => {
        const response = await fetch(apiUrl(`/api/maintenance/vehicles/${vehicle.id}`), {
          method: "DELETE",
          headers: authHeaders(token)
        });

        const data = await response.json();
        if (!response.ok) {
          setMessage(data.message || "Unable to delete vehicle.");
          setConfirmConfig(null);
          return;
        }

        setVehicles((current) => current.filter((item) => item.id !== vehicle.id));
        setExpenses((current) => current.filter((item) => item.vehicleId !== vehicle.id));
        setConfirmConfig(null);
        showSuccess(`${vehicle.name} deleted successfully.`);
      }
    });
  }

  async function handleDeleteExpense(expense) {
    setConfirmConfig({
      title: "Delete Expense",
      message: `Are you sure you want to delete ${expense.type}?`,
      onConfirm: async () => {
        const response = await fetch(apiUrl(`/api/maintenance/expenses/${expense.id}`), {
          method: "DELETE",
          headers: authHeaders(token)
        });

        const data = await response.json();
        if (!response.ok) {
          setMessage(data.message || "Unable to delete expense.");
          setConfirmConfig(null);
          return;
        }

        setExpenses((current) => current.filter((item) => item.id !== expense.id));
        setConfirmConfig(null);
        showSuccess(`${expense.type} deleted successfully.`);
      }
    });
  }

  function showSuccess(message, title = "Success") {
    setMessage("");
    setSuccessConfig({ title, message });
  }

  function resetUserForm() {
    setUserForm({
      name: "",
      username: "",
      email: "",
      password: "",
      role: "staff"
    });
    setUserPermissions({
      create: true,
      updateOwn: false,
      viewAll: false,
      editAll: false
    });
    setEditingUserId(null);
  }

  function resetVehicleForm() {
    setVehicleForm({
      name: "",
      plateNumber: "",
      type: "Truck",
      driverName: "",
      routeName: "",
      status: "Active"
    });
    setEditingVehicleId(null);
  }

  function resetExpenseForm() {
    setExpenseForm((current) => ({
      ...current,
      type: "Fuel",
      amount: "",
      currency: "KWD",
      paidStatus: "unpaid",
      expenseDate: new Date().toISOString().slice(0, 10),
      notes: ""
    }));
    setEditingExpenseId(null);
  }

  function closePasswordModal() {
    setPasswordModalUser(null);
    setNewPassword("");
  }

  function handleHistorySearchSubmit(event) {
    event.preventDefault();
    setHistoryVehicleFilter(historyVehicleDraft);
    setHistoryDriverFilter(historyDriverDraft);
    setHistorySearch(historySearchDraft);
  }

  function getReportGeneratedBy() {
    const displayName = user?.name || user?.username || "Unknown user";
    return user?.username && user.username !== displayName ? `${displayName} (${user.username})` : displayName;
  }

  async function exportExcelReport(exportExpenses, start, end, kind) {
    try {
      const XLSX = await import("xlsx");
      const generatedBy = getReportGeneratedBy();

      const rows = exportExpenses.map((expense) => {
        const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
        return {
          Date: expense.date,
          Vehicle: vehicle?.name || "Unknown",
          Plate: vehicle?.plateNumber || "",
          ExpenseType: expense.type,
          Amount: expense.amount,
          Currency: expense.currency,
          PaidStatus: expense.paidStatus || "",
          Notes: expense.notes || "",
          EnteredBy: expense.createdByUsername ? `${expense.createdByName || "Unknown"} (${expense.createdByUsername})` : ""
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.sheet_add_aoa(
        worksheet,
        [
          [],
          ["Generated by", generatedBy],
          ["Report footer", REPORT_FOOTER_TEXT]
        ],
        { origin: -1 }
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");

      const filename = `apollo-freight-expenses_${kind}_${start}_to_${end}.xlsx`;
      XLSX.writeFile(workbook, filename);
      setMessage(`Excel report exported: ${filename}`);
    } catch (exportError) {
      setMessage(`Excel export failed: ${exportError.message}`);
    }
  }

  async function exportPdfReport(exportExpenses, start, end, totalsText, kind) {
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const generatedBy = getReportGeneratedBy();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      function drawReportFooter() {
        doc.setFontSize(9);
        doc.setTextColor(90, 86, 78);
        doc.text(`Generated by: ${generatedBy}`, 40, pageHeight - 44);
        doc.text(REPORT_FOOTER_TEXT, 40, pageHeight - 26);
        doc.setTextColor(0, 0, 0);
      }

      doc.setFontSize(16);
      doc.text("Apollo-Freight Solutions - Expense Report", 40, 40);
      doc.setFontSize(11);
      doc.text(`Range: ${start} to ${end}`, 40, 62);
      doc.text(`Total: ${totalsText}`, 40, 82);
      doc.text(`Generated by: ${generatedBy}`, pageWidth - 260, 62);

      const body = exportExpenses.map((expense) => {
        const vehicle = vehicles.find((item) => item.id === expense.vehicleId);
        return [
          expense.date,
          vehicle?.name || "Unknown",
          vehicle?.plateNumber || "",
          expense.type,
          String(expense.amount),
          expense.currency,
          expense.paidStatus || "",
          expense.notes || ""
        ];
      });

      autoTable(doc, {
        head: [["Date", "Vehicle", "Plate", "Type", "Amount", "Currency", "Paid", "Notes"]],
        body,
        startY: 104,
        margin: { bottom: 70 },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [234, 88, 12] },
        didDrawPage: drawReportFooter
      });

      const filename = `apollo-freight-expenses_${kind}_${start}_to_${end}.pdf`;
      doc.save(filename);
      setMessage(`PDF report exported: ${filename}`);
    } catch (exportError) {
      setMessage(`PDF export failed: ${exportError.message}`);
    }
  }
}

function authHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function loadAuthedData(token, meOrLoginPayload) {
  const meRole = meOrLoginPayload?.role;
  const headers = authHeaders(token);

  const requests = [
    fetch(apiUrl("/api/maintenance/vehicles"), { headers }),
    fetch(apiUrl("/api/maintenance/expenses"), { headers })
  ];

  // Only admins should load the full users list (API is admin-only).
  if (meRole === "admin") {
    requests.unshift(fetch(apiUrl("/api/maintenance/users"), { headers }));
  } else {
    requests.unshift(Promise.resolve({ ok: true, json: async () => [] }));
  }

  const [usersRes, vehiclesRes, expensesRes] = await Promise.all(requests);
  if (!usersRes.ok || !vehiclesRes.ok || !expensesRes.ok) {
    throw new Error("Failed to load API data.");
  }

  const [usersData, vehiclesData, expensesData] = await Promise.all([
    usersRes.json(),
    vehiclesRes.json(),
    expensesRes.json()
  ]);

  // These setters are closures inside App; so this function is used via await loadAuthedData(...)
  // with setters in scope. To keep it simple, we return the raw payloads and let App set state.
  return { usersData, vehiclesData, expensesData };
}

function BrandName() {
  return (
    <>
      <span className="brand-mark">A</span>pollo <span className="brand-mark">F</span>reight <span className="brand-mark">S</span>olutions
    </>
  );
}

function FooterNote() {
  return (
    <footer className="app-footer">
      Designed by <span className="footer-credit">ApolloIT</span> | Copyright &copy; 2026{" "}
      <span className="footer-brand"><BrandName /></span>. All rights reserved.
    </footer>
  );
}

function isoDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function toComparableDate(dateString) {
  if (!dateString) return "";
  return dateString.slice(0, 10);
}

function isWithinRange(dateString, startDate, endDate) {
  const value = toComparableDate(dateString);
  if (!value) return false;

  const start = toComparableDate(startDate);
  const end = toComparableDate(endDate);

  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
}

function isUpdated(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;
  return String(createdAt) !== String(updatedAt);
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDateOnly(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value).slice(0, 10);
  }
}

function formatHistoryRow(row) {
  if (!row) return "";
  return JSON.stringify(row, null, 2);
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(value);
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  }).format(value);
}

export default App;

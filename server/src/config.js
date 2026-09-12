const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const port = Number.parseInt(process.env.PORT || "4000", 10);
const databaseSources = [
  ["NEON_DATABASE_URL", process.env.NEON_DATABASE_URL],
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["POSTGRES_URL", process.env.POSTGRES_URL],
  ["POSTGRESQL_URL", process.env.POSTGRESQL_URL],
  ["PG_CONNECTION_STRING", process.env.PG_CONNECTION_STRING],
  ["RENDER_DATABASE_URL", process.env.RENDER_DATABASE_URL],
  ["CLOUD_SQL_DATABASE_URL", process.env.CLOUD_SQL_DATABASE_URL]
];
const databaseConfig = databaseSources.find(([, value]) => typeof value === "string" && value.trim());
const databaseUrlValue = databaseConfig?.[1]?.trim() || "";
const isCloudSqlSocket = /[?&]host=%2Fcloudsql%2F|[?&]host=\/cloudsql\//.test(databaseUrlValue);
const databaseHost = (() => {
  if (isCloudSqlSocket) {
    const match = databaseUrlValue.match(/host=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : "cloudsql";
  }
  try {
    return databaseUrlValue ? new URL(databaseUrlValue).hostname : "";
  } catch {
    return "";
  }
})();
const isNeonDatabase = databaseHost.includes("neon.tech");
// One Cloud Run service now serves both the app and the API from the same origin, so CORS is no
// longer the write-protection boundary (the login-token middleware is) - default to allowing any
// origin, still fully overridable via ALLOWED_ORIGIN if you want to lock it down later.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const configuredSecret = process.env.CUSTOMER_PORTAL_SECRET || process.env.SESSION_SECRET || process.env.API_SECRET || "";
const isProduction = (process.env.NODE_ENV || "development").toLowerCase() === "production";
// NOTE: this used to fall back to crypto.randomBytes(32) here, generating a brand new secret every
// time the process started. On a serverless/multi-instance host (Vercel, Cloud Run, etc.) that meant
// every cold start invalidated every token issued by every other instance - users got kicked out with
// "Login required" mid-session, repeatedly, even though they never logged out. The fallback is now
// resolved once at startup (see ensurePortalSecret in index.js), persisted to the database, and reused
// by every instance so it stays stable across restarts and cold starts without requiring the env var.
// Setting CUSTOMER_PORTAL_SECRET explicitly is still the recommended, more secure option.

module.exports = {
  port: Number.isNaN(port) ? 4000 : port,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: databaseUrlValue,
  databaseUrlSource: databaseConfig?.[0] || "",
  databaseHost,
  isNeonDatabase,
  isCloudSqlSocket,
  allowedOrigins,
  configuredSecret,
  // Production must not replay the entire historical migration directory on every restart.
  // Run `npm run migrate` explicitly for a newly reviewed migration; local development can
  // still opt in with AUTO_MIGRATE=true.
  autoMigrate: !isProduction && process.env.AUTO_MIGRATE === "true"
};

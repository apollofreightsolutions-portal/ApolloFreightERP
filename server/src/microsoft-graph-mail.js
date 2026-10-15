"use strict";

const nodemailer = require("nodemailer");

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw);
}

function mailConfig() {
  const provider = String(process.env.MAIL_PROVIDER || "microsoft_graph").trim().toLowerCase();
  const smtpPort = Math.max(1, Number(process.env.SMTP_PORT || 587));
  return {
    enabled: envFlag("MAIL_SEND_ENABLED", false),
    provider,
    tenantId: String(process.env.M365_TENANT_ID || "").trim(),
    clientId: String(process.env.M365_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.M365_CLIENT_SECRET || ""),
    from: String(process.env.MAIL_FROM || process.env.SMTP_USER || "").trim().toLowerCase(),
    timeoutMs: Math.max(3000, Number(process.env.MAIL_GRAPH_TIMEOUT_MS || process.env.SMTP_TIMEOUT_MS || 15000)),
    smtpHost: String(process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    smtpPort,
    smtpSecure: envFlag("SMTP_SECURE", smtpPort === 465),
    smtpUser: String(process.env.SMTP_USER || "").trim(),
    smtpPassword: String(process.env.SMTP_PASSWORD || "")
  };
}

function assertMailEnabled(config) {
  if (!config.enabled) {
    const error = new Error("Central email sending is disabled. Set MAIL_SEND_ENABLED=true after the selected email provider is configured.");
    error.status = 503;
    throw error;
  }
}

function assertGraphMailConfig(config) {
  assertMailEnabled(config);
  if (config.provider !== "microsoft_graph") {
    const error = new Error("MAIL_PROVIDER must be microsoft_graph for Microsoft Graph email sending.");
    error.status = 503;
    throw error;
  }
  const missing = [];
  if (!config.tenantId) missing.push("M365_TENANT_ID");
  if (!config.clientId) missing.push("M365_CLIENT_ID");
  if (!config.clientSecret) missing.push("M365_CLIENT_SECRET");
  if (!config.from) missing.push("MAIL_FROM");
  if (missing.length) {
    const error = new Error(`Microsoft Graph mail configuration is incomplete: ${missing.join(", ")}.`);
    error.status = 503;
    throw error;
  }
}

function assertSmtpMailConfig(config) {
  assertMailEnabled(config);
  if (config.provider !== "smtp") {
    const error = new Error("MAIL_PROVIDER must be smtp for SMTP email sending.");
    error.status = 503;
    throw error;
  }
  const missing = [];
  if (!config.smtpHost) missing.push("SMTP_HOST");
  if (!config.smtpUser) missing.push("SMTP_USER");
  if (!config.smtpPassword) missing.push("SMTP_PASSWORD");
  if (!config.from) missing.push("MAIL_FROM or SMTP_USER");
  if (missing.length) {
    const error = new Error(`SMTP mail configuration is incomplete: ${missing.join(", ")}.`);
    error.status = 503;
    throw error;
  }
}

function normalizeRecipients(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[;,]/);
  const seen = new Set();
  return items
    .map((item) => typeof item === "string" ? item : item?.address)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Microsoft Graph request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function graphAccessToken(config = mailConfig()) {
  assertGraphMailConfig(config);
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60000) return cachedAccessToken;

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });

  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, config.timeoutMs);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    const error = new Error(`Microsoft Graph token request failed: ${detail}`);
    error.status = 502;
    throw error;
  }

  cachedAccessToken = String(payload.access_token);
  cachedAccessTokenExpiresAt = Date.now() + (Math.max(60, Number(payload.expires_in || 3600)) * 1000);
  return cachedAccessToken;
}

function validateMessage({ to, subject, html, text }) {
  const recipients = normalizeRecipients(to);
  if (!recipients.length) {
    const error = new Error("No valid customer email address is available for this shipment.");
    error.status = 400;
    throw error;
  }
  const cleanSubject = String(subject || "Apollo Connected Update").trim().slice(0, 240);
  const content = String(html || text || "").trim();
  if (!content) {
    const error = new Error("Email content is empty.");
    error.status = 400;
    throw error;
  }
  return { recipients, cleanSubject, content };
}

async function sendGraphMail({ recipients, cleanSubject, content, html, config, attachments }) {
  const token = await graphAccessToken(config);
  const endpoint = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.from)}/sendMail`;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: cleanSubject,
        body: {
          contentType: html ? "HTML" : "Text",
          content
        },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        ...(attachments.length?{attachments:attachments.map(a=>({'@odata.type':'#microsoft.graph.fileAttachment',...a}))}:{})
      },
      saveToSentItems: true
    })
  }, config.timeoutMs);

  if (response.status !== 202) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.error?.message || payload?.error_description || payload?.error || `HTTP ${response.status}`;
    const error = new Error(`Microsoft Graph sendMail failed: ${detail}`);
    error.status = 502;
    throw error;
  }
}

async function sendSmtpMail({ recipients, cleanSubject, content, html, config, attachments }) {
  assertSmtpMailConfig(config);
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPassword
    },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs
  });
  try {
    await transporter.sendMail({
      from: config.from,
      to: recipients,
      subject: cleanSubject,
      attachments: attachments.map(a=>({filename:a.name,content:Buffer.from(a.contentBytes,'base64'),contentType:a.contentType,cid:a.contentId,contentDisposition:a.isInline?'inline':'attachment'})),
      ...(html ? { html } : { text: content })
    });
  } catch (error) {
    const smtpError = new Error(`SMTP email send failed: ${error?.message || error}`);
    smtpError.status = 502;
    throw smtpError;
  } finally {
    transporter.close();
  }
}

async function sendMicrosoftGraphMail({ to, subject, html, text = "", attachments = [] }) {
  const config = mailConfig();
  const message = validateMessage({ to, subject, html, text });
  if (config.provider === "smtp") {
    await sendSmtpMail({ ...message, html, config, attachments });
  } else {
    await sendGraphMail({ ...message, html, config, attachments });
  }
  return { accepted: true, from: config.from, to: message.recipients };
}

function graphMailStatus() {
  const config = mailConfig();
  const configured = config.provider === "smtp"
    ? Boolean(config.smtpHost && config.smtpUser && config.smtpPassword && config.from)
    : Boolean(config.tenantId && config.clientId && config.clientSecret && config.from);
  return {
    enabled: config.enabled,
    provider: config.provider,
    configured,
    from: config.from || "",
    smtpHost: config.provider === "smtp" ? config.smtpHost : "",
    timeoutMs: config.timeoutMs
  };
}

module.exports = {
  graphMailStatus,
  normalizeRecipients,
  sendMicrosoftGraphMail
};

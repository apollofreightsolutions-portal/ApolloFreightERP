'use strict';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function passwordResetEmailHtml({ resetUrl, expiresMinutes = 30 }) {
  const safeUrl = escapeHtml(resetUrl);
  const safeMinutes = Math.max(1, Number(expiresMinutes) || 30);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8"><tr><td align="center" style="padding:20px 8px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;text-align:left;background:#ffffff;border:1px solid #e5e7eb"><tr><td style="background:#101827;padding:22px 24px;color:#ffffff;border-bottom:3px solid #F15A24"><img src="cid:apollo-brand" width="218" alt="Apollo Freight Solutions" style="display:block;width:100%;max-width:218px;height:auto;border:0"><div style="font-size:13px;margin-top:12px;color:#cbd5e1">Apollo Connected account security</div></td></tr><tr><td style="padding:24px;font-size:15px;line-height:1.55"><h1 style="margin:0 0 16px;color:#0A1C2E;font-size:22px">Reset your password</h1><p style="margin:0 0 16px">We received a request to reset the password for an Apollo Connected account associated with this email address.</p><p style="margin:22px 0"><a href="${safeUrl}" style="display:inline-block;background:#F15A24;color:#ffffff;font-weight:bold;text-decoration:none;padding:13px 20px;border-radius:4px">Set a new password</a></p><p style="margin:0 0 12px">This link expires in ${safeMinutes} minutes and can be used once. If the button does not work, open this link:</p><p style="margin:0 0 18px;overflow-wrap:anywhere"><a href="${safeUrl}" style="color:#0A1C2E">${safeUrl}</a></p><p style="margin:0 0 16px">If you did not request this, ignore this message. Your current password will not change.</p><p style="margin:0;color:#647180;font-size:12px">This is an automated message from Apollo Connected. Please do not reply; this mailbox is not monitored.</p></td></tr></table></td></tr></table></body></html>`;
}

function passwordResetEmailText({ resetUrl, expiresMinutes = 30 }) {
  const safeMinutes = Math.max(1, Number(expiresMinutes) || 30);
  return [
    'Apollo Connected password reset',
    '',
    'We received a request to reset the password for an Apollo Connected account associated with this email address.',
    `Set a new password using this one-time link (expires in ${safeMinutes} minutes):`,
    resetUrl,
    '',
    'If you did not request this, ignore this message. Your current password will not change.',
    'This is an automated message. Please do not reply.'
  ].join('\n');
}

module.exports = { passwordResetEmailHtml, passwordResetEmailText };

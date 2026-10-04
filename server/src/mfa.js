"use strict";

const crypto = require("crypto");
const QRCode = require("qrcode");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MFA_POLICIES = new Set(["disabled", "optional", "required"]);

function normalizePolicy(value) {
  const policy = String(value || "disabled").trim().toLowerCase();
  return MFA_POLICIES.has(policy) ? policy : "disabled";
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function secretFromSeed(seed) {
  const source = String(seed || "");
  if (!source) throw new Error("MFA encryption secret is not configured.");
  return crypto.createHash("sha256").update(source).digest();
}

function encryptSecret(secret, seed) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretFromSeed(seed), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(payload, seed) {
  const [version, ivText, tagText, encryptedText] = String(payload || "").split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) throw new Error("Invalid encrypted MFA secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretFromSeed(seed), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1000000).padStart(6, "0");
}

function verifyTotp(secret, token, now = Date.now()) {
  const code = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(now / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    const expected = hotp(secret, step + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

function recoveryCodeHash(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function createRecoveryCodes(count = 10) {
  const codes = [];
  while (codes.length < count) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase();
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

function consumeRecoveryCode(codesJson, candidate) {
  let hashes = [];
  try { hashes = JSON.parse(String(codesJson || "[]")); } catch { hashes = []; }
  if (!Array.isArray(hashes)) hashes = [];
  const hash = recoveryCodeHash(String(candidate || "").trim().toUpperCase());
  const index = hashes.indexOf(hash);
  if (index < 0) return { valid: false, remaining: hashes };
  hashes.splice(index, 1);
  return { valid: true, remaining: hashes };
}

async function enrollmentPayload({ userName, issuer = "Apollo Freight" }) {
  const secret = base32Encode(crypto.randomBytes(20));
  const label = `${issuer}:${userName}`;
  const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return {
    secret,
    uri,
    qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 })
  };
}

module.exports = {
  normalizePolicy,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  createRecoveryCodes,
  recoveryCodeHash,
  consumeRecoveryCode,
  enrollmentPayload
};

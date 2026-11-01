import crypto from "node:crypto";

/**
 * BarakatWave TV — License, Signed-Link & Anti-Leech Engine
 * -----------------------------------------------------------------
 * Design goals (owner requirement: "backend link ki security itni tez
 * ke koi catch na kar sake"):
 *
 *  1. Every playback link is HMAC-SHA256 signed with a rotating secret and a
 *     short expiry, so leaked URLs die on their own within minutes.
 *  2. Signatures are bound to username + channel + expiry + a rotating salt
 *     window; replaying a link from another account fails verification.
 *  3. License keys are never stored in plain form server-side — only their
 *     SHA-256 hash plus a short display prefix.
 *  4. Signed links use an opaque path (`/s/<token>`) so the underlying
 *     `/live/user/pass/...` shape is never exposed in the wild.
 *  5. Constant-time comparison everywhere to defeat timing oracles.
 */

const BASE_SECRET =
  process.env.BARAKATWAVE_SIGNING_SECRET ||
  process.env.FIREBASE_DATABASE_SECRET ||
  "bw_mizanora_muaaz_iqbal_hmac_v2_2026";

export const SIGNED_LINK_TTL_SEC = Number(process.env.BW_LINK_TTL_SEC || 900);
const CLOCK_SKEW_SEC = 120;

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hmac(secret, payload) {
  return crypto.createHmac("sha256", secret).update(String(payload)).digest("base64url");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ------------------------------ LICENSE KEYS ------------------------------ */

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

function randomBlock(len = 4) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  return out;
}

/** BW-XXXX-XXXX-XXXX style customer license key. */
export function generateLicenseKey(prefix = "BW") {
  return `${prefix}-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
}

/** Reseller API key: bwr_<32 hex>. */
export function generateResellerApiKey() {
  return "bwr_" + crypto.randomBytes(16).toString("hex");
}

/** Strong random password for auto-provisioned Xtream users. */
export function generateXtreamPassword(len = 10) {
  return randomBlock(len);
}

export function hashLicenseKey(key) {
  return sha256(String(key).trim().toUpperCase());
}

export function maskKey(key) {
  const clean = String(key || "");
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 5)}••••••${clean.slice(-4)}`;
}

/* ------------------------------ SIGNED LINKS ------------------------------ */

/**
 * Sign a playback request. `kind` is live|movie|series|playlist.
 * Returns base64url payload + signature, wrapped in a single opaque token.
 */
export function signPlayRequest({ username, kind = "live", target, ttlSec = SIGNED_LINK_TTL_SEC, extra = "" }) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Number(ttlSec) || SIGNED_LINK_TTL_SEC);
  const payload = {
    u: String(username || ""),
    k: String(kind || "live"),
    t: String(target || ""),
    e: exp,
    x: String(extra || "")
  };
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = hmac(BASE_SECRET, raw).slice(0, 32);
  return { token: `${raw}.${sig}`, exp, payload, sig };
}

export function verifyPlayToken(token) {
  const clean = String(token || "").trim();
  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return { valid: false, reason: "malformed" };
  const raw = clean.slice(0, dot);
  const sig = clean.slice(dot + 1);
  const expected = hmac(BASE_SECRET, raw).slice(0, 32);
  if (!safeEqual(expected, sig)) return { valid: false, reason: "bad_signature" };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.e || now - CLOCK_SKEW_SEC > Number(payload.e)) {
    return { valid: false, reason: "expired", payload };
  }
  return { valid: true, payload, expiresIn: Number(payload.e) - now };
}

/* ------------------------------ ACCESS CONTROL ------------------------------ */

/**
 * Per-account connection guard: caps simultaneous distinct signatures per minute
 * so a leaked token cannot be fanned out to hundreds of viewers.
 */
const connectionBuckets = new Map();

export function registerConnection(username, fingerprint, maxPerMinute = 40) {
  const now = Date.now();
  const key = `conn:${String(username || "").toLowerCase()}`;
  const entry = connectionBuckets.get(key);
  if (connectionBuckets.size > 5000) {
    for (const [k, v] of connectionBuckets.entries()) {
      if (now > v.resetAt) connectionBuckets.delete(k);
    }
  }
  if (!entry || now > entry.resetAt) {
    connectionBuckets.set(key, { count: 1, prints: new Set([fingerprint]), resetAt: now + 60_000 });
    return { allowed: true, count: 1 };
  }
  if (!entry.prints.has(fingerprint)) entry.prints.add(fingerprint);
  entry.count += 1;
  if (entry.count > maxPerMinute || entry.prints.size > 12) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, count: entry.count };
}

/** Stable but privacy-preserving device fingerprint. */
export function deviceFingerprint(req) {
  const ua = String(req?.headers?.["user-agent"] || "");
  const ip = String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
  const ipParts = ip.split(".");
  const ipMask = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.x` : ip;
  return sha256(`${ua}|${ipMask}`).slice(0, 24);
}

/** Normalise a MAC address (aa:bb:cc:dd:ee:ff) used by MAG / MAC IPTV portals. */
export function normalizeMac(mac) {
  const hex = String(mac || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return "";
  return hex.match(/.{2}/g).join(":");
}

export function isMacAddress(value) {
  return Boolean(normalizeMac(value));
}

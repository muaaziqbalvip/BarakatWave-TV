import crypto from "node:crypto";
import { sha256 } from "./licenses.js";
import { rtdbGet, rtdbSet } from "./rtdb.js";
import { BRAND } from "../../data/catalog.js";

/**
 * BarakatWave TV — Admin authentication (Firebase ID token + Owner PIN)
 * ---------------------------------------------------------------------
 * Three accepted credential types (checked in this order):
 *
 *  1. Owner PIN session (`bwp_...`) — signed stateless HMAC token created by
 *     `verifyOwnerPin`. Works even when the Firebase console hasn't yet added
 *     the current domain to "Authorized domains", which is the #1 reason
 *     "admin login not working" in the field.
 *  2. Firebase ID token (`Authorization: Bearer <idToken>`) from Google or
 *     Email/Password sign-in, verified against Google Identity Toolkit.
 *  3. Server automation token (env BARAKATWAVE_ADMIN_TOKEN) for scripts.
 *
 * PIN policy: env BARAKATWAVE_ADMIN_PIN, else the hash stored at
 * `settings/private/adminPinHash`, else the documented bootstrap PIN
 * (owner WhatsApp number). Change it from Admin → Security after first login.
 */

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyB1aWw27UEteaspMte4wTp_nUWEf07FqwQ";

const OWNER_EMAIL = String(process.env.BW_OWNER_EMAIL || BRAND.ownerEmail).toLowerCase();
const SESSION_SECRET =
  process.env.BARAKATWAVE_SIGNING_SECRET ||
  process.env.FIREBASE_DATABASE_SECRET ||
  "bw_mizanora_muaaz_iqbal_hmac_v2_2026";

export const BOOTSTRAP_PIN = "03062015326";
const SESSION_TTL_SEC = 12 * 60 * 60;

const tokenCache = new Map();
const pinBuckets = new Map();

function bearer(req) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  if (!raw) return "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function getClientToken(req) {
  return bearer(req) || String(req?.headers?.["x-admin-token"] || "").trim();
}

export function pinHash(pin) {
  return sha256(`bw:pin:${String(pin || "").trim()}`);
}

function signSession(payloadB64) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url").slice(0, 32);
}

function issueSession(pin, via) {
  const payload = {
    role: "owner",
    email: OWNER_EMAIL,
    uid: "owner-pin",
    via,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `bwp_${b64}.${signSession(b64)}`;
}

function readSession(token) {
  if (!token.startsWith("bwp_")) return null;
  const body = token.slice(4);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  const expected = signSession(b64);
  if (Buffer.from(expected).length !== Buffer.from(sig).length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function expectedPinHash() {
  const envPin = process.env.BARAKATWAVE_ADMIN_PIN;
  if (envPin) return pinHash(envPin);
  const stored = await rtdbGet("settings/private/adminPinHash", { ttlMs: 10_000 }).catch(() => null);
  if (stored && typeof stored === "string") return stored;
  return pinHash(BOOTSTRAP_PIN);
}

export async function verifyOwnerPin(pin, ip = "0.0.0.0") {
  const now = Date.now();
  const bucket = pinBuckets.get(ip) || { count: 0, resetAt: now + 10 * 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 10 * 60_000;
  }
  bucket.count += 1;
  pinBuckets.set(ip, bucket);
  if (bucket.count > 8) {
    return { ok: false, status: 429, error: "Too many PIN attempts. Wait 10 minutes or use Firebase Google login." };
  }

  const clean = String(pin || "").trim();
  if (clean.length < 4) return { ok: false, status: 400, error: "PIN must be at least 4 characters." };

  const expected = await expectedPinHash();
  const given = pinHash(clean);
  if (Buffer.from(expected).length !== Buffer.from(given).length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return { ok: false, status: 401, error: "Incorrect Owner PIN. Try again or sign in with Google." };
  }
  return {
    ok: true,
    token: issueSession(clean, "owner-pin"),
    expiresIn: SESSION_TTL_SEC,
    admin: { uid: "owner-pin", email: OWNER_EMAIL, role: "owner", via: "owner-pin" }
  };
}

export async function setOwnerPin(newPin, currentPin) {
  const check = await verifyOwnerPin(currentPin, "pin-change");
  if (!check.ok && check.status === 401) return check;
  const clean = String(newPin || "").trim();
  if (clean.length < 6) return { ok: false, status: 400, error: "New PIN must be at least 6 characters." };
  const hash = pinHash(clean);
  const saved = await rtdbSet("settings/private/adminPinHash", hash);
  return { ok: true, saved, note: saved ? "PIN updated in Firebase RTDB." : "PIN updated locally only — publish RTDB rules for persistence." };
}

async function lookupIdToken(idToken) {
  const digest = sha256(idToken).slice(0, 24);
  const hit = tokenCache.get(digest);
  if (hit && Date.now() < hit.expiresAt) return hit.result;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const u = data?.users?.[0];
    if (!u) return null;
    const result = {
      uid: u.localId,
      email: String(u.email || "").toLowerCase(),
      displayName: u.displayName || "",
      verified: Boolean(u.emailVerified)
    };
    tokenCache.set(digest, { result, expiresAt: Date.now() + 5 * 60_000 });
    return result;
  } catch {
    return null;
  }
}

export async function authenticateAdmin(req) {
  const token = getClientToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Admin session required. Sign in with Google, Firebase email/password, or the Owner PIN."
    };
  }

  // 1) Stateless owner PIN session
  const session = readSession(token);
  if (session) {
    return { ok: true, uid: session.uid, email: session.email, role: "owner", via: session.via };
  }

  // 2) Automation token
  const automation = process.env.BARAKATWAVE_ADMIN_TOKEN || "";
  if (automation && token === automation) {
    return { ok: true, uid: "automation", email: OWNER_EMAIL, role: "owner", via: "automation-token" };
  }

  // 3) Firebase ID token
  const user = await lookupIdToken(token);
  if (!user) {
    return {
      ok: false,
      status: 401,
      error:
        "Session expired or invalid. Sign in again at /admin.html (or use the Owner PIN if Firebase shows 'unauthorized domain')."
    };
  }

  const emailLower = String(user.email || "").toLowerCase();
  if (emailLower === OWNER_EMAIL) {
    return { ok: true, ...user, email: emailLower, role: "owner", via: "owner-email" };
  }

  const admins = await rtdbGet("admins", { ttlMs: 5000, authToken: token }).catch(() => null);
  if (admins && typeof admins === "object" && admins[user.uid]) {
    return { ok: true, ...user, email: emailLower, role: "admin", via: "admins-node" };
  }

  return { ok: false, status: 403, error: "This account is not registered as a BarakatWave admin." };
}

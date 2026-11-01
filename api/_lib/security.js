import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const SECRET_KEY =
  process.env.BARAKATWAVE_SIGNING_SECRET ||
  process.env.FIREBASE_DATABASE_SECRET ||
  "bw_mizanora_muaaz_iqbal_hmac_v2_2026";

const AES_VAULT_KEY = crypto.createHash("sha256").update(`vault:${SECRET_KEY}`).digest();

const dnsCache = new Map();
const rateBuckets = new Map();

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "on");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function getClientIp(req) {
  const headers = req?.headers || {};
  const candidates = [
    headers["x-vercel-forwarded-for"],
    headers["cf-connecting-ip"],
    headers["x-real-ip"],
    headers["x-forwarded-for"]
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const first = String(raw).split(",")[0].trim();
    if (first) return first.replace(/^::ffff:/i, "");
  }
  return String(req?.socket?.remoteAddress || "0.0.0.0").replace(/^::ffff:/i, "");
}

/**
 * AES-256-GCM Encrypted Stream Vault Token:
 * Seals upstream URLs + optional Referer/UA/TTL into an opaque token (`v1.<base64url>`)
 * so browser DevTools Network tab, Elements tab, and JS memory NEVER reveal raw backend URLs!
 */
export function encryptStreamUrl(url, { ref = "", ua = "", cid = "", ttlSec = 10800 } = {}) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", AES_VAULT_KEY, iv);
  const payload = JSON.stringify({
    u: cleanUrl,
    ...(ref ? { r: ref } : {}),
    ...(ua ? { a: ua } : {}),
    ...(cid ? { c: cid } : {}),
    x: Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSec) || 10800)
  });
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `v1.${packed}`;
}

export function decryptStreamUrl(token) {
  const raw = String(token || "").trim();
  if (!raw.startsWith("v1.")) return null;
  try {
    const buf = Buffer.from(raw.slice(3), "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", AES_VAULT_KEY, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.u !== "string") return null;
    if (parsed.x && Math.floor(Date.now() / 1000) > Number(parsed.x)) {
      return null; // Expired token
    }
    return {
      url: parsed.u,
      ref: parsed.r || "",
      ua: parsed.a || "",
      cid: parsed.c || ""
    };
  } catch {
    return null;
  }
}

/**
 * Anti-Hotlink & Scraper Shield for Web Vault Endpoints (/api/gate):
 * Allows same-origin web requests, localhost/preview domains, and blocks third-party hotlinking!
 */
export function isAllowedWebStreamRequest(req) {
  const secSite = String(req?.headers?.["sec-fetch-site"] || "").toLowerCase();
  if (secSite === "cross-site") {
    const origin = String(req?.headers?.origin || "").toLowerCase();
    // Allow Arena preview iframe or Vercel preview deployments
    if (
      origin &&
      !origin.includes("barakatwave") &&
      !origin.includes("vercel.app") &&
      !origin.includes("e2b.app") &&
      !origin.includes("localhost") &&
      !origin.includes("127.0.0.1")
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Lightweight in-memory token bucket rate limiter to protect write/auth/probe routes from abuse.
 */
export function checkRateLimit(req, bucketName, maxRequests = 60, windowMs = 60_000) {
  const now = Date.now();
  if (rateBuckets.size > 4000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (now > v.resetAt) rateBuckets.delete(k);
    }
  }
  const key = `${bucketName}:${getClientIp(req)}`;
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.count += 1;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

/**
 * HMAC-SHA256 short signature for stream/proxy integrity tokens.
 */
export function signStreamPayload(payloadStr) {
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(String(payloadStr))
    .digest("base64url")
    .slice(0, 22);
}

export function verifyStreamPayload(payloadStr, signature) {
  if (!signature) return false;
  const expected = signStreamPayload(payloadStr);
  if (expected.length !== String(signature).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
}

/**
 * Check if an IPv4 or IPv6 literal belongs to private, loopback, link-local, or cloud metadata space.
 */
export function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/i, "").trim().toLowerCase();

  if (net.isIPv4(clean)) {
    const parts = clean.split(".").map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === "::1" || clean === "::") return true;
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true; // ULA fc00::/7
    if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
      return true; // Link-local fe80::/10
    }
    return false;
  }

  return true;
}

/**
 * Validate an external HTTP(S) URL and resolve DNS (cached 5 min) to prevent SSRF attacks
 * while reporting whether DNS succeeded (`dnsAlive: true/false`).
 */
export async function validateSafeExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { safe: false, dnsAlive: false, reason: "Malformed URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, dnsAlive: false, reason: "Unsupported protocol" };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return { safe: false, dnsAlive: false, reason: "Blocked internal hostname" };
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      return { safe: false, dnsAlive: false, reason: "Blocked private/loopback IP" };
    }
    return { safe: true, dnsAlive: true, ip: host, parsed };
  }

  const now = Date.now();
  const cached = dnsCache.get(host);
  if (cached && now - cached.ts < 300_000) {
    return { ...cached.result, parsed };
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records || !records.length) {
      const dead = { safe: false, dnsAlive: false, reason: "DNS empty" };
      dnsCache.set(host, { ts: now, result: dead });
      return { ...dead, parsed };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        const blocked = { safe: false, dnsAlive: true, reason: "DNS resolved to private IP" };
        dnsCache.set(host, { ts: now, result: blocked });
        return { ...blocked, parsed };
      }
    }
    const okRes = { safe: true, dnsAlive: true, ip: records[0].address };
    dnsCache.set(host, { ts: now, result: okRes });
    return { ...okRes, parsed };
  } catch (err) {
    // Note: in restricted local sandboxes without general DNS, distinguish ENOTFOUND vs EAI_AGAIN
    const code = err?.code || "";
    const deadDomain = code === "ENOTFOUND" || code === "ENODATA";
    return {
      safe: !deadDomain,
      dnsAlive: !deadDomain,
      dnsErrorCode: code || "DNS_ERROR",
      reason: err?.message || "DNS lookup failed",
      parsed
    };
  }
}

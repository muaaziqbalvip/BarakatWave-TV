import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const SECRET_KEY =
  process.env.BARAKATWAVE_SIGNING_SECRET ||
  process.env.FIREBASE_DATABASE_SECRET ||
  "bw_mizanora_muaaz_iqbal_hmac_v2_2026";

const dnsCache = new Map();
const rateBuckets = new Map();

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "on");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function getClientIp(req) {
  const xff = (req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req?.socket?.remoteAddress || "0.0.0.0";
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

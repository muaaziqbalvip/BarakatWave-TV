import zlib from "node:zlib";
import { BRAND } from "../../data/catalog.js";
import { setSecurityHeaders } from "./security.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB DoS guard

export function getRequestBaseUrl(req) {
  const protoHeader = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (hostHeader) {
    const isLocal = hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1");
    const proto = protoHeader || (isLocal ? "http" : "https");
    return `${proto}://${hostHeader}`;
  }
  return (process.env.PUBLIC_BASE_URL || BRAND.siteUrl).replace(/\/+$/, "");
}

export function getCanonicalBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || BRAND.siteUrl).replace(/\/+$/, "");
}

export function setCorsHeaders(res) {
  setSecurityHeaders(res);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range, X-Admin-Token");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type");
}

export function handleOptions(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function maybeGzipAndSend(res, rawBuf) {
  const acceptEnc = String(res.req?.headers?.["accept-encoding"] || "");
  if (rawBuf.length >= 8192 && /\bgzip\b/i.test(acceptEnc)) {
    const gz = zlib.gzipSync(rawBuf, { level: 5 });
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Content-Length", gz.length);
    res.end(gz);
    return;
  }
  res.setHeader("Content-Length", rawBuf.length);
  res.end(rawBuf);
}

export function sendJson(res, statusCode, data, cacheControl = "no-store") {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  const rawBuf = Buffer.from(JSON.stringify(data), "utf8");
  maybeGzipAndSend(res, rawBuf);
}

export function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8", cacheControl = "no-store") {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  const rawBuf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  maybeGzipAndSend(res, rawBuf);
}

export async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length > 0) {
    return parseRawString(req.body.slice(0, MAX_BODY_BYTES), req.headers["content-type"] || "");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_BODY_BYTES) break;
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return parseRawString(raw, req.headers["content-type"] || "");
}

function parseRawString(raw, contentType) {
  if (contentType.includes("application/json") || raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to urlencoded
    }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export function parseQuery(req) {
  if (req.query && typeof req.query === "object" && Object.keys(req.query).length > 0) {
    return { ...req.query };
  }
  const u = new URL(req.url || "/", "http://localhost");
  const out = {};
  for (const [k, v] of u.searchParams.entries()) out[k] = v;
  return out;
}

import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { validateSafeExternalUrl } from "./security.js";

/**
 * Pooled keep-alive agents for external IPTV streams.
 * Many IPTV panels on custom ports (e.g. https://live.nowiretv.com:5789/live/auto/3383.m3u8,
 * :8080, :25461, :8443) use self-signed or incomplete intermediate SSL certificates that
 * ExoPlayer/Televizo/VLC accept natively while Node's default undici fetch() rejects them.
 * SSRF safety is enforced BEFORE every request + redirect hop via validateSafeExternalUrl().
 */
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, timeout: 10000 });
const httpsIptvAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  rejectUnauthorized: false,
  timeout: 10000
});

export const DEFAULT_IPTV_UA =
  "VLC/3.0.20 LibVLC/3.0.20 (BarakatWaveTV/2.3; Android 13; Televizo Compatible)";

/**
 * Detect whether a stream URL or playlist uses IP-locked tokens, custom IPTV panel ports
 * (:5789, :8080, :25461, :8880, :8443, etc.), or Flussonic `/live/auto/` edge routing
 * where the end-user's IPTV player (Televizo/Smarters/TiviMate) MUST connect directly from
 * the viewer's own IP address so session tokens & geo-locks match 100%!
 */
export function isClientDirectIptvUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || "").trim());
    // Any explicit port other than standard 80 / 443 is an IPTV streaming panel (:5789, :8080, :25461, :8880, etc.)
    if (u.port && u.port !== "80" && u.port !== "443") {
      return true;
    }
    const pathLower = u.pathname.toLowerCase();
    const searchLower = u.search.toLowerCase();

    // Flussonic / Xtream / Stalker / Nimble dynamic per-IP auto-session endpoints
    if (
      pathLower.includes("/live/auto/") ||
      pathLower.includes("/play/live.php") ||
      pathLower.endsWith(".ts")
    ) {
      return true;
    }

    // Per-IP signed token query parameters
    if (
      /(?:^|[?&])(token|wmsauthsign|nimblesessionid|auth_key|hdnea|hdnts|play_token|md5)=/i.test(
        searchLower
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function hasIpBoundTokensInManifest(manifestText, finalUrl = "") {
  if (isClientDirectIptvUrl(finalUrl)) return true;
  const sample = String(manifestText || "").slice(0, 4096);
  return /(?:[?&])(token|wmsauthsign|nimblesessionid|auth_key|hdnea|hdnts|play_token)=/i.test(sample);
}

/**
 * Fetch an external IPTV manifest or stream sample with:
 *  - Full custom-port (:5789, :8443, :25461) self-signed TLS support
 *  - Up to 6 HTTP 301/302/303/307/308 redirects with SSRF check on every hop
 *  - Accurate `finalUrl` tracking so relative .m3u8/.ts URLs resolve against the redirected edge host!
 *  - Byte cap (`maxBytes`) so hitting a live endless MPEG-TS stream returns immediately instead of hanging!
 */
export async function upstreamFetch(
  targetUrl,
  {
    timeoutMs = 4500,
    maxBytes = 262_144,
    maxRedirects = 6,
    headers = {},
    allowLocalOrigin = false
  } = {}
) {
  let currentUrl = String(targetUrl || "").trim();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed;
    let dnsAlive = true;

    if (allowLocalOrigin) {
      parsed = new URL(currentUrl);
    } else {
      const check = await validateSafeExternalUrl(currentUrl);
      if (!check.safe) {
        return {
          ok: false,
          status: 0,
          finalUrl: currentUrl,
          dnsAlive: Boolean(check.dnsAlive),
          blocked: true,
          error: check.reason || "Blocked or dead host"
        };
      }
      parsed = check.parsed;
      dnsAlive = Boolean(check.dnsAlive);
    }

    const singleHop = await performSingleRequest(parsed, {
      timeoutMs,
      maxBytes,
      headers
    });

    if (
      singleHop.status >= 300 &&
      singleHop.status < 400 &&
      singleHop.headers?.location &&
      hop < maxRedirects
    ) {
      try {
        currentUrl = new URL(singleHop.headers.location, currentUrl).toString();
        continue;
      } catch {
        return { ...singleHop, ok: false, finalUrl: currentUrl, dnsAlive };
      }
    }

    return {
      ...singleHop,
      finalUrl: currentUrl,
      dnsAlive
    };
  }

  return {
    ok: false,
    status: 0,
    finalUrl: currentUrl,
    dnsAlive: true,
    error: "Too many redirects"
  };
}

function performSingleRequest(parsedUrl, { timeoutMs, maxBytes, headers }) {
  return new Promise((resolve) => {
    const isHttps = parsedUrl.protocol === "https:";
    const mod = isHttps ? https : http;
    const reqHeaders = {
      "User-Agent": headers["User-Agent"] || headers["user-agent"] || DEFAULT_IPTV_UA,
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate",
      Connection: "keep-alive",
      ...headers
    };

    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const req = mod.request(
      parsedUrl,
      {
        method: "GET",
        headers: reqHeaders,
        agent: isHttps ? httpsIptvAgent : httpAgent
      },
      (res) => {
        const status = res.statusCode || 0;
        const respHeaders = res.headers || {};

        if (status >= 300 && status < 400 && respHeaders.location) {
          res.resume();
          return done({ ok: false, status, headers: respHeaders, buffer: Buffer.alloc(0), text: "" });
        }

        const encoding = String(respHeaders["content-encoding"] || "").toLowerCase();
        let stream = res;
        if (encoding === "gzip") {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === "deflate") {
          stream = res.pipe(zlib.createInflate());
        }

        const chunks = [];
        let total = 0;
        let truncated = false;

        stream.on("data", (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (total + buf.length > maxBytes) {
            const slice = buf.subarray(0, Math.max(0, maxBytes - total));
            if (slice.length) chunks.push(slice);
            total += slice.length;
            truncated = true;
            req.destroy();
            return;
          }
          chunks.push(buf);
          total += buf.length;
        });

        const finalizeBody = () => {
          const buffer = Buffer.concat(chunks);
          const ct = String(respHeaders["content-type"] || "").toLowerCase();
          const isBinaryTs =
            ct.includes("mp2t") ||
            ct.includes("octet-stream") ||
            (buffer.length >= 189 && buffer[0] === 0x47 && buffer[188] === 0x47);
          const text = isBinaryTs ? "" : buffer.toString("utf8");
          done({
            ok: status >= 200 && status < 300,
            status,
            headers: respHeaders,
            contentType: ct,
            isBinaryTs,
            truncated,
            buffer,
            text
          });
        };

        stream.on("end", finalizeBody);
        stream.on("close", finalizeBody);
        stream.on("error", () => {
          if (chunks.length > 0) finalizeBody();
          else done({ ok: false, status, headers: respHeaders, error: "Decompression error" });
        });
      }
    );

    const timer = setTimeout(() => {
      req.destroy(new Error("ETIMEDOUT"));
    }, timeoutMs);

    req.on("error", (err) => {
      done({
        ok: false,
        status: 0,
        headers: {},
        errorCode: err?.code || err?.message || "NETWORK_ERROR",
        error: err?.message || "Connection failed"
      });
    });

    req.end();
  });
}

/**
 * Open a streaming proxy request (supports binary .ts segments, Range requests & custom TLS ports).
 */
export async function openUpstreamStream(targetUrl, { timeoutMs = 11000, headers = {}, maxRedirects = 5 } = {}) {
  let currentUrl = String(targetUrl || "").trim();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateSafeExternalUrl(currentUrl);
    if (!check.safe) {
      return { ok: false, status: 400, error: check.reason || "Disallowed target URL" };
    }
    const parsed = check.parsed;
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const hopRes = await new Promise((resolve) => {
      const reqHeaders = {
        "User-Agent": headers["User-Agent"] || DEFAULT_IPTV_UA,
        Accept: "*/*",
        Connection: "keep-alive",
        ...headers
      };
      const req = mod.request(
        parsed,
        {
          method: "GET",
          headers: reqHeaders,
          agent: isHttps ? httpsIptvAgent : httpAgent
        },
        (res) => {
          clearTimeout(timer);
          resolve({ ok: true, req, res, status: res.statusCode || 0, headers: res.headers || {} });
        }
      );
      const timer = setTimeout(() => req.destroy(new Error("ETIMEDOUT")), timeoutMs);
      req.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, status: 502, error: err?.message || "Upstream error" });
      });
      req.end();
    });

    if (!hopRes.ok) return hopRes;

    if (hopRes.status >= 300 && hopRes.status < 400 && hopRes.headers.location && hop < maxRedirects) {
      hopRes.res.resume();
      currentUrl = new URL(hopRes.headers.location, currentUrl).toString();
      continue;
    }

    return {
      ok: hopRes.status >= 200 && hopRes.status < 300,
      status: hopRes.status,
      headers: hopRes.headers,
      stream: hopRes.res,
      req: hopRes.req,
      finalUrl: currentUrl
    };
  }

  return { ok: false, status: 502, error: "Too many upstream redirects" };
}

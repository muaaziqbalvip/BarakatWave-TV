/**
 * BarakatWave Live TV — Stream Vault Client (Zero-Exposure Source Resolver)
 * Under Mizanora Projects by Muaaz Iqbal
 *
 * Resolves the real playback sources for any channel through the server-side
 * AES-256-GCM vault (`/api/gate`). Raw upstream `.m3u8` / `.mpd` / IPTV panel URLs
 * are NEVER present in the browser bundle, DOM, JS memory, or Network tab.
 */

const GATE_CACHE = new Map();
const CACHE_TTL_MS = 8 * 60 * 1000;

function cacheKey(channel, plan) {
  return `${channel?.id || channel?.streamId || channel?.slug || "?"}::${plan}`;
}

function sanitizeSource(src) {
  if (!src || typeof src !== "object") return null;
  const url = String(src.url || "").trim();
  if (!url) return null;
  return {
    url,
    proto: String(src.proto || "hls").toLowerCase(),
    label: String(src.label || "Studio HD").slice(0, 40)
  };
}

/**
 * @returns {Promise<{sources: Array<{url:string,proto:string,label:string}>, lockedPro?:boolean, drm?:object}|null>}
 */
export async function resolveChannelSources(channel, { plan = "free", sid = "", userEmail = "" } = {}) {
  if (!channel) return null;
  const key = cacheKey(channel, plan);
  const hit = GATE_CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;

  const id = encodeURIComponent(channel.id || channel.streamId || channel.slug || "");
  if (!id) return null;

  const qs = new URLSearchParams({ cid: String(channel.id || channel.streamId || channel.slug), plan });
  if (sid) qs.set("sid", sid);
  if (userEmail) qs.set("u", userEmail);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`/api/gate?${qs.toString()}`, {
      signal: ctrl.signal,
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok === false) return null;

    const sources = (Array.isArray(data.sources) ? data.sources : []).map(sanitizeSource).filter(Boolean);
    const value = {
      sources,
      lockedPro: Boolean(data.lockedPro),
      drm: {
        scheme: data.drmScheme || "",
        key: data.drmKey || "",
        licenseUrl: data.drmLicenseUrl || ""
      }
    };
    GATE_CACHE.set(key, { ts: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

export function clearVaultCache() {
  GATE_CACHE.clear();
}

/**
 * Send a custom (Stream Lab / Admin) URL to the vault for AES-256-GCM sealing before playback.
 */
export async function sealCustomStreamUrl(url, format = "auto") {
  try {
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format }),
      credentials: "omit",
      cache: "no-store"
    });
    if (!res.ok) return null;
    const data = await res.json();
    return sanitizeSource(data?.source);
  } catch {
    return null;
  }
}

/**
 * BarakatWave Live TV — Stateless HLS Manifest Parser, Rewriter & Stitcher
 * Zero filesystem tracing of public/ so Vercel @vercel/node builds cleanly with zero bloat.
 */

const BUILTIN_LOCAL_CLIPS = {
  "/media/welcome/index.m3u8": [
    { duration: 2.0, rel: "/media/welcome/seg0.m2ts" },
    { duration: 2.0, rel: "/media/welcome/seg1.m2ts" },
    { duration: 2.0, rel: "/media/welcome/seg2.m2ts" }
  ],
  "/media/pro-unlock/index.m3u8": [
    { duration: 2.0, rel: "/media/pro-unlock/seg0.m2ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg1.m2ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg2.m2ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg3.m2ts" }
  ],
  "/media/demo-live/index.m3u8": [
    { duration: 2.0, rel: "/media/demo-live/seg0.m2ts" },
    { duration: 2.0, rel: "/media/demo-live/seg1.m2ts" },
    { duration: 2.0, rel: "/media/demo-live/seg2.m2ts" },
    { duration: 2.0, rel: "/media/demo-live/seg3.m2ts" }
  ]
};

function getBuiltinClipSegments(cleanPath, baseUrl) {
  const list = BUILTIN_LOCAL_CLIPS[cleanPath];
  if (!list) return null;
  return list.map((s) => ({
    duration: s.duration,
    infLine: `#EXTINF:${s.duration.toFixed(3)},`,
    url: `${baseUrl}${s.rel}`
  }));
}

/**
 * Parse an HLS media playlist text into structured segments + targetDuration + mediaSequence.
 */
export function parseMediaPlaylist(m3uText, sourcePlaylistUrl, baseUrl, useProxy = false) {
  const lines = String(m3uText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let targetDuration = 4;
  let mediaSequence = 0;
  let isMaster = false;
  const variants = [];
  const segments = [];
  let pendingInf = null;
  let pendingDiscontinuity = false;
  let pendingKeyLine = null;
  let pendingMapLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      isMaster = true;
      const next = lines[i + 1];
      if (next && !next.startsWith("#")) {
        variants.push({
          inf: line,
          url: resolveUrl(next, sourcePlaylistUrl)
        });
        i++;
      }
      continue;
    }
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      const n = parseFloat(line.split(":")[1]);
      if (Number.isFinite(n) && n > 0) targetDuration = Math.ceil(n);
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const n = parseInt(line.split(":")[1], 10);
      if (Number.isFinite(n)) mediaSequence = n;
    } else if (line === "#EXT-X-DISCONTINUITY") {
      pendingDiscontinuity = true;
    } else if (line.startsWith("#EXT-X-KEY:")) {
      pendingKeyLine = rewriteAttributeUri(line, sourcePlaylistUrl, baseUrl, useProxy);
    } else if (line.startsWith("#EXT-X-MAP:")) {
      pendingMapLine = rewriteAttributeUri(line, sourcePlaylistUrl, baseUrl, useProxy);
    } else if (line.startsWith("#EXTINF:")) {
      const durMatch = line.match(/#EXTINF:([0-9.]+)/);
      const dur = durMatch ? parseFloat(durMatch[1]) : 2.0;
      pendingInf = { raw: line, duration: Number.isFinite(dur) && dur > 0 ? dur : 2.0 };
    } else if (!line.startsWith("#")) {
      const abs = resolveUrl(line, sourcePlaylistUrl);
      const finalUrl = useProxy ? `${baseUrl}/api/proxy?u=${encodeURIComponent(abs)}` : abs;
      segments.push({
        duration: pendingInf ? pendingInf.duration : 2.0,
        infLine: pendingInf ? pendingInf.raw : "#EXTINF:2.000,",
        url: finalUrl,
        discontinuity: pendingDiscontinuity,
        keyLine: pendingKeyLine,
        mapLine: pendingMapLine
      });
      pendingInf = null;
      pendingDiscontinuity = false;
    }
  }

  return { isMaster, variants, targetDuration, mediaSequence, segments };
}

function resolveUrl(relOrAbs, basePlaylistUrl) {
  if (/^https?:\/\//i.test(relOrAbs)) return relOrAbs;
  try {
    return new URL(relOrAbs, basePlaylistUrl).toString();
  } catch {
    return relOrAbs;
  }
}

function rewriteAttributeUri(line, sourcePlaylistUrl, baseUrl, useProxy) {
  return line.replace(/URI="([^"]+)"/i, (_, uri) => {
    const abs = resolveUrl(uri, sourcePlaylistUrl);
    const rewritten = useProxy ? `${baseUrl}/api/proxy?u=${encodeURIComponent(abs)}` : abs;
    return `URI="${rewritten}"`;
  });
}

/**
 * Load a built-in /media/*.m3u8 or remote .m3u8/.ts/.mts clip into HLS segment descriptors.
 */
export async function loadClipSegments(videoUrl, baseUrl, fallbackLocalPath = "/media/welcome/index.m3u8") {
  const target = String(videoUrl || fallbackLocalPath).trim() || fallbackLocalPath;

  // Case 1: Built-in local broadcast bumper (zero disk / network latency)
  if (target.startsWith("/")) {
    const cleanRelPath = "/" + target.split("?")[0].replace(/^\/+/, "");
    const builtin = getBuiltinClipSegments(cleanRelPath, baseUrl);
    if (builtin) return builtin;

    if (/\.(ts|mts|m2ts)$/i.test(cleanRelPath)) {
      return [{ duration: 4.0, infLine: "#EXTINF:4.000,", url: `${baseUrl}${cleanRelPath}` }];
    }
    if (cleanRelPath.endsWith(".m3u8")) {
      const fullLocalUrl = `${baseUrl}${cleanRelPath}`;
      const txt = await fetchTextWithTimeout(fullLocalUrl, 2500);
      if (txt) {
        const parsed = parseMediaPlaylist(txt, fullLocalUrl, baseUrl, false);
        if (parsed.segments.length) return parsed.segments;
      }
    }
  }

  // Case 2: Remote URL (.ts, .mts, or .m3u8)
  if (/^https?:\/\//i.test(target)) {
    const cleanPath = target.split("?")[0].toLowerCase();
    if (/\.(ts|mts|m2ts)$/.test(cleanPath)) {
      return [{ duration: 6.0, infLine: "#EXTINF:6.000,", url: `${baseUrl}/api/proxy?u=${encodeURIComponent(target)}` }];
    }
    if (cleanPath.endsWith(".m3u8")) {
      try {
        const fetched = await fetchTextWithTimeout(target, 3500);
        if (fetched) {
          let parsed = parseMediaPlaylist(fetched, target, baseUrl, true);
          if (parsed.isMaster && parsed.variants.length) {
            const subTxt = await fetchTextWithTimeout(parsed.variants[0].url, 3500);
            if (subTxt) {
              parsed = parseMediaPlaylist(subTxt, parsed.variants[0].url, baseUrl, true);
            }
          }
          if (parsed.segments.length) return parsed.segments;
        }
      } catch {
        // fall back to built-in local HD broadcast bumper
      }
    }
  }

  return getBuiltinClipSegments(fallbackLocalPath, baseUrl) || [];
}

/**
 * Synthesize an infinite 24/7 sliding-window LIVE HLS Media Playlist from a short looping segment set.
 * Fully RFC 8216 compliant with #EXT-X-MEDIA-SEQUENCE & #EXT-X-DISCONTINUITY-SEQUENCE!
 */
export function buildLoopingLiveM3u8(segments, windowSize = 6) {
  if (!segments || !segments.length) {
    return "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-ENDLIST\n";
  }
  const N = segments.length;
  const avgDur = segments.reduce((acc, s) => acc + (s.duration || 2), 0) / N || 2;
  const maxDur = Math.max(2, Math.ceil(Math.max(...segments.map((s) => s.duration || 2))));
  const nowSec = Date.now() / 1000;
  const mediaSeq = Math.floor(nowSec / avgDur);
  const discSeq = Math.floor(mediaSeq / N);

  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-TARGETDURATION:${maxDur}`,
    `#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`
  ];

  for (let i = 0; i < windowSize; i++) {
    const seq = mediaSeq + i;
    const segIdx = ((seq % N) + N) % N;
    const seg = segments[segIdx];
    if (i > 0 && segIdx === 0) {
      out.push("#EXT-X-DISCONTINUITY");
    }
    if (seg.keyLine) out.push(seg.keyLine);
    if (seg.mapLine) out.push(seg.mapLine);
    out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
    out.push(seg.url);
  }

  return out.join("\n") + "\n";
}

/**
 * Fetch & rewrite a live channel's media playlist, optionally stitching the Welcome Pre-Roll
 * bumper cleanly via #EXT-X-DISCONTINUITY during the initial session window!
 */
export async function buildChannelLiveMediaM3u8({
  channel,
  settings,
  baseUrl,
  sessionStartSec = 0,
  skipIntro = false
}) {
  const candidates = [channel.url, ...(channel.backupUrls || [])].filter(Boolean);

  const introUrl = channel.introVideoUrl || settings.welcomeVideoUrl || "/media/welcome/index.m3u8";
  const introEnabled = !skipIntro && Boolean(settings.welcomeVideoEnabled && introUrl);
  let introSegments = [];
  let introTotalSec = 0;
  if (introEnabled && sessionStartSec > 0) {
    introSegments = await loadClipSegments(introUrl, baseUrl, "/media/welcome/index.m3u8");
    introTotalSec = introSegments.reduce((s, seg) => s + (seg.duration || 2), 0);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = sessionStartSec > 0 ? Math.max(0, nowSec - sessionStartSec) : 999999;
  const showPreRollNow = introEnabled && introSegments.length > 0 && elapsed < Math.ceil(introTotalSec);

  let liveSegments = [];
  let liveTargetDur = 4;
  let liveMediaSeq = 0;
  let liveDiscSeq = 0;

  for (const src of candidates) {
    if (src.startsWith("/")) {
      const localSegs = await loadClipSegments(src, baseUrl, "/media/demo-live/index.m3u8");
      if (localSegs.length) {
        if (!showPreRollNow) {
          return buildLoopingLiveM3u8(localSegs, 6);
        }
        const N = localSegs.length;
        for (let i = 0; i < 4; i++) {
          liveSegments.push(localSegs[i % N]);
        }
        liveTargetDur = Math.max(2, Math.ceil(Math.max(...localSegs.map((s) => s.duration || 2))));
        break;
      }
    } else if (/^https?:\/\//i.test(src)) {
      const resolved = await fetchLiveMediaSegments(src, baseUrl, channel.headers || {});
      if (resolved && resolved.segments.length) {
        liveSegments = resolved.segments.slice(-6);
        liveTargetDur = resolved.targetDuration;
        liveMediaSeq = resolved.mediaSequence;
        break;
      }
    }
  }

  if (!liveSegments.length) {
    const fbSegs = await loadClipSegments("/media/demo-live/index.m3u8", baseUrl, "/media/demo-live/index.m3u8");
    if (!showPreRollNow) {
      return buildLoopingLiveM3u8(fbSegs, 6);
    }
    liveSegments = fbSegs.slice(0, 4);
  }

  const maxTarget = Math.max(
    liveTargetDur,
    ...introSegments.map((s) => Math.ceil(s.duration || 2)),
    4
  );

  if (showPreRollNow) {
    const out = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      `#EXT-X-TARGETDURATION:${maxTarget}`,
      `#EXT-X-MEDIA-SEQUENCE:${liveMediaSeq}`,
      `#EXT-X-DISCONTINUITY-SEQUENCE:${liveDiscSeq}`
    ];
    for (const seg of introSegments) {
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    out.push("#EXT-X-DISCONTINUITY");
    for (const seg of liveSegments) {
      if (seg.discontinuity) out.push("#EXT-X-DISCONTINUITY");
      if (seg.keyLine) out.push(seg.keyLine);
      if (seg.mapLine) out.push(seg.mapLine);
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    return out.join("\n") + "\n";
  }

  const hadIntro = introEnabled && sessionStartSec > 0 ? 1 : 0;
  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${maxTarget}`,
    `#EXT-X-MEDIA-SEQUENCE:${liveMediaSeq + (hadIntro ? introSegments.length : 0)}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${liveDiscSeq + hadIntro}`
  ];
  for (const seg of liveSegments) {
    if (seg.discontinuity) out.push("#EXT-X-DISCONTINUITY");
    if (seg.keyLine) out.push(seg.keyLine);
    if (seg.mapLine) out.push(seg.mapLine);
    out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
    out.push(seg.url);
  }
  return out.join("\n") + "\n";
}

async function fetchLiveMediaSegments(url, baseUrl, customHeaders = {}) {
  try {
    const text = await fetchTextWithTimeout(url, 4000, customHeaders);
    if (!text || !text.includes("#EXTM3U")) return null;
    let parsed = parseMediaPlaylist(text, url, baseUrl, true);
    if (parsed.isMaster && parsed.variants.length) {
      const chosen = parsed.variants[Math.min(parsed.variants.length - 1, 1)] || parsed.variants[0];
      const subText = await fetchTextWithTimeout(chosen.url, 4000, customHeaders);
      if (subText && subText.includes("#EXTM3U")) {
        parsed = parseMediaPlaylist(subText, chosen.url, baseUrl, true);
      }
    }
    return parsed.segments.length ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchTextWithTimeout(url, timeoutMs = 4000, extraHeaders = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          extraHeaders["User-Agent"] ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarakatWaveTV/2.0",
        Accept: "*/*",
        ...extraHeaders
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

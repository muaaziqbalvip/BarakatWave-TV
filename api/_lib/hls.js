/**
 * BarakatWave Live TV — Universal RFC 8216 HLS Manifest Parser, Classifier & Pre-Roll Stitcher v2.3
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Guarantees across Televizo, IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, VLC & Web:
 *  1) Smart IPTV Panel & Custom-Port (:5789, :8080, :25461, /live/auto/, IP-token) Detection:
 *     Hands IP-bound / custom-port streams (like https://live.nowiretv.com:5789/live/auto/3383.m3u8)
 *     directly to Televizo/ExoPlayer via 302 so tokens match the viewer's own IP 100%!
 *  2) RFC 8216 Invariant `seq = K + (U - U0)` 3-Phase Intro -> Live Stitcher for public CDN &
 *     studio streams — zero MEDIA-SEQUENCE scrambling across playlist reloads!
 *  3) Full 301/302 Redirect `finalUrl` tracking + custom-port TLS support via `upstream.js`!
 *  4) Automatic Channel Offline Standby Video whenever a channel is genuinely 404 / 5xx / dead!
 */

import {
  hasIpBoundTokensInManifest,
  isClientDirectIptvUrl,
  upstreamFetch
} from "./upstream.js";

const BUILTIN_LOCAL_CLIPS = {
  "/media/welcome/index.m3u8": [
    { duration: 2.0, rel: "/media/welcome/seg0.ts" },
    { duration: 2.0, rel: "/media/welcome/seg1.ts" },
    { duration: 2.0, rel: "/media/welcome/seg2.ts" },
    { duration: 2.0, rel: "/media/welcome/seg3.ts" }
  ],
  "/media/channel-offline/index.m3u8": [
    { duration: 2.0, rel: "/media/channel-offline/seg0.ts" },
    { duration: 2.0, rel: "/media/channel-offline/seg1.ts" },
    { duration: 2.0, rel: "/media/channel-offline/seg2.ts" },
    { duration: 2.0, rel: "/media/channel-offline/seg3.ts" }
  ],
  "/media/coming-soon/index.m3u8": [
    { duration: 2.0, rel: "/media/coming-soon/seg0.ts" },
    { duration: 2.0, rel: "/media/coming-soon/seg1.ts" },
    { duration: 2.0, rel: "/media/coming-soon/seg2.ts" },
    { duration: 2.0, rel: "/media/coming-soon/seg3.ts" }
  ],
  "/media/pro-unlock/index.m3u8": [
    { duration: 2.0, rel: "/media/pro-unlock/seg0.ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg1.ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg2.ts" },
    { duration: 2.0, rel: "/media/pro-unlock/seg3.ts" }
  ],
  "/media/demo-live/index.m3u8": [
    { duration: 2.0, rel: "/media/demo-live/seg0.ts" },
    { duration: 2.0, rel: "/media/demo-live/seg1.ts" },
    { duration: 2.0, rel: "/media/demo-live/seg2.ts" },
    { duration: 2.0, rel: "/media/demo-live/seg3.ts" }
  ]
};

const LOCAL_MP4_TO_HLS = {
  "/media/welcome/video.mp4": "/media/welcome/index.m3u8",
  "/media/channel-offline/video.mp4": "/media/channel-offline/index.m3u8",
  "/media/coming-soon/video.mp4": "/media/coming-soon/index.m3u8",
  "/media/pro-unlock/video.mp4": "/media/pro-unlock/index.m3u8"
};

// Warm caches for blazing-fast (< 2ms) repeated tunes and RFC 8216 sequence stability
const deliveryModeCache = new Map();
const sessionSeqAnchors = new Map();

export function clearDeliveryCache() {
  deliveryModeCache.clear();
}

function getBuiltinClipSegments(cleanPath, baseUrl) {
  const mappedPath = LOCAL_MP4_TO_HLS[cleanPath] || cleanPath;
  const list = BUILTIN_LOCAL_CLIPS[mappedPath];
  if (!list) return null;
  return list.map((s) => ({
    duration: s.duration,
    infLine: `#EXTINF:${s.duration.toFixed(3)},`,
    url: `${baseUrl}${s.rel}`
  }));
}

/**
 * Classify how `live.js` should deliver a channel to Televizo / IPTV Smarters / TiviMate / VLC:
 *  - "direct": 302-redirect player straight to `url` (for :5789, :8080, /live/auto/, IP-token, or geo-restricted streams)
 *  - "stitch": 3-Phase Televizo Intro -> Live Channel HLS stitcher
 *  - "offline": Continuous Channel Offline Standby Video
 */
export async function classifyChannelDelivery(channel, settings = {}, { skipIntro = false } = {}) {
  if (!channel || channel.status === "offline") {
    return { mode: "offline", url: "" };
  }

  const candidates = [channel.url, ...(channel.backupUrls || [])].map((u) => String(u || "").trim()).filter(Boolean);
  if (!candidates.length) {
    return { mode: "offline", url: "" };
  }

  const introEnabled = !skipIntro && settings.welcomeVideoEnabled !== false;

  for (const src of candidates) {
    // 1. Local built-in broadcast stream -> instant 0ms stitch (or direct local media)
    if (src.startsWith("/")) {
      return { mode: "stitch", url: src };
    }

    if (!/^https?:\/\//i.test(src)) continue;

    // Explicit Admin directPlay flag
    if (channel.directPlay === true) {
      return { mode: "direct", url: src };
    }

    const cacheKey = `${src}|${introEnabled ? "1" : "0"}`;
    const now = Date.now();
    const cached = deliveryModeCache.get(cacheKey);
    if (cached && now - cached.ts < 45_000) {
      return cached.val;
    }

    // 2. Fast-path for custom IPTV panel ports (:5789, :8080, :25461, :8880, :8443), /live/auto/, or IP-token URLs:
    //    Verify quickly (1.5s cap) that it's not an explicit 404/dead domain; otherwise hand directly to Televizo
    //    so client IP tokens, multi-bitrate auto variants, and port :5789 TLS work natively on the viewer's device!
    if (isClientDirectIptvUrl(src)) {
      const quick = await upstreamFetch(src, {
        timeoutMs: 1500,
        maxBytes: 16_384,
        headers: channel.headers || {}
      });

      if (quick.blocked || !quick.dnsAlive || quick.status === 404 || quick.status === 410 || quick.status >= 500) {
        continue; // Genuinely dead -> try backupUrl or fall through to offline
      }

      const decision = { mode: "direct", url: src };
      deliveryModeCache.set(cacheKey, { ts: now, val: decision });
      return decision;
    }

    // 3. Standard HTTP/HTTPS (:80 / :443) stream inspection
    const res = await upstreamFetch(src, {
      timeoutMs: 2800,
      maxBytes: 131_072,
      headers: channel.headers || {}
    });

    // Blocked private IP, nonexistent domain, explicit 404/410/5xx, or local refused port -> dead candidate
    if (
      res.blocked ||
      !res.dnsAlive ||
      res.status === 404 ||
      res.status === 410 ||
      res.status >= 500
    ) {
      continue;
    }

    // Datacenter/AWS IP blocked (401/403/451) or raw MPEG-TS stream on a live domain -> let viewer's residential IP play directly!
    if (res.isBinaryTs || res.status === 401 || res.status === 403 || res.status === 451) {
      const decision = { mode: "direct", url: src };
      deliveryModeCache.set(cacheKey, { ts: now, val: decision });
      return decision;
    }

    // Valid #EXTM3U response
    if (res.ok && res.text && res.text.includes("#EXTM3U")) {
      // If redirected to an IP-tokenized edge URL or segments carry per-IP tokens -> direct 302 handoff!
      if (!introEnabled || hasIpBoundTokensInManifest(res.text, res.finalUrl)) {
        const decision = { mode: "direct", url: src };
        deliveryModeCache.set(cacheKey, { ts: now, val: decision });
        return decision;
      }

      const decision = { mode: "stitch", url: src };
      deliveryModeCache.set(cacheKey, { ts: now, val: decision });
      return decision;
    }

    // If connection timed out or TLS handshake was reset by an ASN/WAF firewall on an external domain whose DNS is alive,
    // try backup first; if it's the last candidate, allow direct client playback from the viewer's residential IP!
    if (
      res.status === 0 &&
      res.dnsAlive &&
      (res.errorCode === "ETIMEDOUT" || res.errorCode === "ECONNRESET") &&
      src === candidates[candidates.length - 1]
    ) {
      const decision = { mode: "direct", url: src };
      deliveryModeCache.set(cacheKey, { ts: now, val: decision });
      return decision;
    }
  }

  return { mode: "offline", url: "" };
}

/**
 * Parse an HLS media or master playlist text into structured segments + metadata.
 * Resolves all relative URLs against `sourcePlaylistUrl` (the post-redirect `finalUrl`!).
 */
export function parseMediaPlaylist(m3uText, sourcePlaylistUrl, baseUrl, useProxy = false) {
  const lines = String(m3uText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let targetDuration = 4;
  let mediaSequence = 0;
  let discontinuitySequence = 0;
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
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 1_500_000;
      const isAudioOnly = /CODECS="[^"]*"/i.test(line) && !/avc1|hev1|hvc1|vp09|av01/i.test(line);
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("#")) j++;
      if (j < lines.length) {
        variants.push({
          inf: line,
          bandwidth,
          isAudioOnly,
          url: resolveUrl(lines[j], sourcePlaylistUrl)
        });
        i = j;
      }
      continue;
    }
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      const n = parseFloat(line.split(":")[1]);
      if (Number.isFinite(n) && n > 0) targetDuration = Math.ceil(n);
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const n = parseInt(line.split(":")[1], 10);
      if (Number.isFinite(n)) mediaSequence = n;
    } else if (line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:")) {
      const n = parseInt(line.split(":")[1], 10);
      if (Number.isFinite(n)) discontinuitySequence = n;
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
      const upstreamSeq = mediaSequence + segments.length;
      segments.push({
        upstreamSeq,
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

  return {
    isMaster,
    variants,
    targetDuration,
    mediaSequence,
    discontinuitySequence,
    segments
  };
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

function selectBestVariant(variants) {
  if (!variants || !variants.length) return null;
  const videoVariants = variants.filter((v) => !v.isAudioOnly);
  const pool = videoVariants.length ? videoVariants : variants;
  // Prefer crisp 720p/1080p stream up to 4.5 Mbps for fast mobile + TV startup, or highest below cap
  const sorted = [...pool].sort((a, b) => a.bandwidth - b.bandwidth);
  const underCap = sorted.filter((v) => v.bandwidth <= 4_500_000);
  return underCap.length ? underCap[underCap.length - 1] : sorted[0];
}

/**
 * Load a built-in /media/*.m3u8 OR Admin-configured remote .m3u8 / .ts clip into HLS segments.
 */
export async function loadClipSegments(
  videoUrl,
  baseUrl,
  fallbackLocalPath = "/media/welcome/index.m3u8",
  defaultClipDurationSec = 8
) {
  const target = String(videoUrl || fallbackLocalPath).trim() || fallbackLocalPath;
  const clipDur = Math.max(2, Math.min(45, Number(defaultClipDurationSec) || 8));

  if (target.startsWith("/")) {
    const cleanRelPath = "/" + target.split("?")[0].replace(/^\/+/, "");
    const builtin = getBuiltinClipSegments(cleanRelPath, baseUrl);
    if (builtin) return builtin;

    if (/\.(ts|mts|m2ts)$/i.test(cleanRelPath)) {
      return [
        {
          duration: clipDur,
          infLine: `#EXTINF:${clipDur.toFixed(3)},`,
          url: `${baseUrl}${cleanRelPath}`
        }
      ];
    }
    if (cleanRelPath.endsWith(".m3u8")) {
      const fullLocalUrl = `${baseUrl}${cleanRelPath}`;
      const res = await upstreamFetch(fullLocalUrl, { timeoutMs: 2500, allowLocalOrigin: true });
      if (res.ok && res.text) {
        const parsed = parseMediaPlaylist(res.text, res.finalUrl || fullLocalUrl, baseUrl, false);
        if (parsed.segments.length) return parsed.segments;
      }
    }
  }

  if (/^https?:\/\//i.test(target)) {
    const cleanPath = target.split("?")[0].toLowerCase();
    if (/\.(ts|mts|m2ts|mp4|m4v|webm|mov)$/.test(cleanPath)) {
      return [
        {
          duration: clipDur,
          infLine: `#EXTINF:${clipDur.toFixed(3)},`,
          url: target
        }
      ];
    }

    const res = await upstreamFetch(target, { timeoutMs: 3500 });
    if (res.ok && res.text && res.text.includes("#EXTM3U")) {
      let parsed = parseMediaPlaylist(res.text, res.finalUrl || target, baseUrl, false);
      if (parsed.isMaster && parsed.variants.length) {
        const best = selectBestVariant(parsed.variants);
        const sub = await upstreamFetch(best.url, { timeoutMs: 3500 });
        if (sub.ok && sub.text && sub.text.includes("#EXTM3U")) {
          parsed = parseMediaPlaylist(sub.text, sub.finalUrl || best.url, baseUrl, false);
        }
      }
      if (parsed.segments.length) return parsed.segments;
    } else if (res.ok) {
      return [
        {
          duration: clipDur,
          infLine: `#EXTINF:${clipDur.toFixed(3)},`,
          url: target
        }
      ];
    }
  }

  return getBuiltinClipSegments(fallbackLocalPath, baseUrl) || [];
}

/**
 * Synthesize an infinite 24/7 sliding-window LIVE HLS Media Playlist from a looping clip.
 */
export function buildLoopingLiveM3u8(segments, windowSize = 6, anchorEpochSec = 0, seqOffset = 0, baseDiscSeq = 0) {
  if (!segments || !segments.length) {
    return "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-ENDLIST\n";
  }
  const N = segments.length;
  const avgDur = segments.reduce((acc, s) => acc + (s.duration || 2), 0) / N || 2;
  const maxDur = Math.max(2, Math.ceil(Math.max(...segments.map((s) => s.duration || 2))));
  const nowSec = Date.now() / 1000;

  const rawStep = anchorEpochSec > 0
    ? Math.max(0, Math.floor((nowSec - anchorEpochSec) / avgDur))
    : Math.floor(nowSec / avgDur);

  const mediaSeq = seqOffset + rawStep;
  const discSeq = baseDiscSeq + Math.floor(rawStep / N);

  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-TARGETDURATION:${maxDur}`,
    `#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`
  ];

  for (let i = 0; i < windowSize; i++) {
    const stepIdx = rawStep + i;
    const segIdx = ((stepIdx % N) + N) % N;
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
 * Build a finite VOD HLS playlist (with #EXT-X-ENDLIST) for Movies/Series Coming Soon or Intro preview.
 */
export function buildFiniteVodM3u8(segments) {
  if (!segments || !segments.length) {
    return "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-ENDLIST\n";
  }
  const maxDur = Math.max(2, Math.ceil(Math.max(...segments.map((s) => s.duration || 2))));
  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-TARGETDURATION:${maxDur}`,
    "#EXT-X-MEDIA-SEQUENCE:0"
  ];
  for (const seg of segments) {
    out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
    out.push(seg.url);
  }
  out.push("#EXT-X-ENDLIST");
  return out.join("\n") + "\n";
}

/**
 * Televizo-Verified 3-Phase RFC 8216 Live HLS Pre-Roll + Channel Offline Failover Stitcher
 * with Invariant `seq = K + (U - U0)` Upstream Sequence Anchoring!
 */
export async function buildChannelLiveMediaM3u8({
  channel,
  settings,
  baseUrl,
  sessionStartSec = 0,
  skipIntro = false,
  forceBridge = false
}) {
  const candidates = [channel.url, ...(channel.backupUrls || [])].filter(Boolean);
  const customIntroDur = Number(settings.welcomeDurationSec) || 8;
  const introUrl = (channel.introVideoUrl || settings.welcomeVideoUrl || "/media/welcome/index.m3u8").trim();
  const offlineUrl = (
    channel.offlineVideoUrl ||
    settings.channelOfflineVideoUrl ||
    "/media/channel-offline/index.m3u8"
  ).trim();
  const introEnabled = !skipIntro && settings.welcomeVideoEnabled !== false && Boolean(introUrl);

  let introSegments = [];
  let introTotalSec = 0;
  if (introEnabled && sessionStartSec > 0) {
    introSegments = await loadClipSegments(introUrl, baseUrl, "/media/welcome/index.m3u8", customIntroDur);
    introTotalSec = introSegments.reduce((s, seg) => s + (seg.duration || 2), 0);
  }

  const K = introSegments.length;
  const nowSec = Date.now() / 1000;
  const elapsed = sessionStartSec > 0 ? Math.max(0, nowSec - sessionStartSec) : 999999;

  const introHoldSec = Math.max(2.5, Math.min(introTotalSec - 2.2, introTotalSec * 0.68));
  const isPhase1PureIntro = !forceBridge && introEnabled && K > 0 && elapsed < introHoldSec;
  const isPhase2Bridge =
    !isPhase1PureIntro && introEnabled && K > 0 && (forceBridge || elapsed < introTotalSec + 7.5);

  if (isPhase1PureIntro) {
    const introMaxTarget = Math.max(2, ...introSegments.map((s) => Math.ceil(s.duration || 2)));
    const out = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES",
      `#EXT-X-TARGETDURATION:${introMaxTarget}`,
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-DISCONTINUITY-SEQUENCE:0"
    ];
    for (const seg of introSegments) {
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    return out.join("\n") + "\n";
  }

  let isLocalLoop = false;
  let localLoopSegs = [];
  let liveSegments = [];
  let liveTargetDur = 4;
  let liveMediaSeq = 0;
  let liveDiscSeq = 0;

  for (const src of candidates) {
    if (src.startsWith("/")) {
      const segs = await loadClipSegments(src, baseUrl, "/media/demo-live/index.m3u8");
      if (segs.length) {
        isLocalLoop = true;
        localLoopSegs = segs;
        liveTargetDur = Math.max(2, Math.ceil(Math.max(...segs.map((s) => s.duration || 2))));
        break;
      }
    } else if (/^https?:\/\//i.test(src)) {
      const needProxy = Boolean(
        channel.useProxy ||
          (channel.headers && Object.keys(channel.headers).length) ||
          isClientDirectIptvUrl(src)
      );
      const resolved = await fetchLiveMediaSegments(src, baseUrl, channel.headers || {}, needProxy);
      if (resolved && resolved.segments.length) {
        liveSegments = resolved.segments;
        liveTargetDur = resolved.targetDuration;
        liveMediaSeq = resolved.mediaSequence;
        liveDiscSeq = resolved.discontinuitySequence || 0;
        break;
      }
    }
  }

  // Automatic Channel Offline Standby Video when all upstream URLs are genuinely offline
  if (!isLocalLoop && !liveSegments.length) {
    localLoopSegs = await loadClipSegments(
      offlineUrl,
      baseUrl,
      "/media/channel-offline/index.m3u8",
      8
    );
    isLocalLoop = true;
    liveTargetDur = Math.max(2, Math.ceil(Math.max(...localLoopSegs.map((s) => s.duration || 2))));
  }

  if (!introEnabled || K === 0 || sessionStartSec <= 0) {
    if (isLocalLoop) {
      return buildLoopingLiveM3u8(localLoopSegs, 6);
    }
    const tail = liveSegments.slice(-6);
    const seqStart = tail[0]?.upstreamSeq ?? liveMediaSeq;
    return serializeLiveWindow(tail, Math.max(liveTargetDur, 4), seqStart, liveDiscSeq);
  }

  if (isLocalLoop) {
    const N = localLoopSegs.length;
    const maxTarget = Math.max(
      liveTargetDur,
      ...introSegments.map((s) => Math.ceil(s.duration || 2)),
      3
    );

    if (isPhase2Bridge) {
      const out = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES",
        `#EXT-X-TARGETDURATION:${maxTarget}`,
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-DISCONTINUITY-SEQUENCE:0"
      ];
      for (const seg of introSegments) {
        out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
        out.push(seg.url);
      }
      out.push("#EXT-X-DISCONTINUITY");
      for (let i = 0; i < 4; i++) {
        if (i > 0 && i % N === 0) out.push("#EXT-X-DISCONTINUITY");
        const seg = localLoopSegs[i % N];
        out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
        out.push(seg.url);
      }
      return out.join("\n") + "\n";
    }

    return buildLoopingLiveM3u8(
      localLoopSegs,
      6,
      sessionStartSec + Math.ceil(introTotalSec),
      K,
      1
    );
  }

  // ==================== RFC 8216 INVARIANT REMOTE LIVE CHANNEL HANDOFF ====================
  // Anchor U0 (first live segment sequence seen in this session) so every upstream segment U
  // ALWAYS maps to the exact same sequence number `K + (U - U0)` across Phase 2 & Phase 3!
  if (sessionSeqAnchors.size > 2000) {
    const firstKey = sessionSeqAnchors.keys().next().value;
    if (firstKey) sessionSeqAnchors.delete(firstKey);
  }

  const tailWindow = liveSegments.slice(-6);
  const anchorKey = `${channel.streamId || channel.id}:${sessionStartSec}`;
  if (!sessionSeqAnchors.has(anchorKey)) {
    const initialU0 = tailWindow[0]?.upstreamSeq ?? liveMediaSeq;
    sessionSeqAnchors.set(anchorKey, initialU0);
  }
  const U0 = sessionSeqAnchors.get(anchorKey);

  const maxTarget = Math.max(
    liveTargetDur,
    ...introSegments.map((s) => Math.ceil(s.duration || 2)),
    4
  );

  // Keep Intro attached ONLY while tailWindow still starts at U0 during Phase 2;
  // the instant upstream advances past U0 (or Phase 3 begins), slide cleanly to `K + (U - U0)`!
  const firstTailU = tailWindow[0]?.upstreamSeq ?? U0;
  if (isPhase2Bridge && firstTailU === U0) {
    const out = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "#EXT-X-START:TIME-OFFSET=0,PRECISE=YES",
      `#EXT-X-TARGETDURATION:${maxTarget}`,
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-DISCONTINUITY-SEQUENCE:0"
    ];
    for (const seg of introSegments) {
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    out.push("#EXT-X-DISCONTINUITY");
    for (const seg of tailWindow) {
      if (seg.discontinuity) out.push("#EXT-X-DISCONTINUITY");
      if (seg.keyLine) out.push(seg.keyLine);
      if (seg.mapLine) out.push(seg.mapLine);
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    return out.join("\n") + "\n";
  }

  const validLive = tailWindow.filter((s) => (s.upstreamSeq ?? firstTailU) >= U0);
  const finalWindow = validLive.length ? validLive : tailWindow;
  const winStartU = finalWindow[0]?.upstreamSeq ?? firstTailU;
  const invariantSeq = winStartU >= U0 ? K + (winStartU - U0) : K + Math.max(1, Math.floor(elapsed));

  return serializeLiveWindow(finalWindow, maxTarget, invariantSeq, 1 + liveDiscSeq);
}

function serializeLiveWindow(segments, targetDuration, mediaSeq, discSeq) {
  const out = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`
  ];
  for (const seg of segments) {
    if (seg.discontinuity) out.push("#EXT-X-DISCONTINUITY");
    if (seg.keyLine) out.push(seg.keyLine);
    if (seg.mapLine) out.push(seg.mapLine);
    out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
    out.push(seg.url);
  }
  return out.join("\n") + "\n";
}

export async function fetchLiveMediaSegments(url, baseUrl, customHeaders = {}, useProxy = false) {
  try {
    let curUrl = url;
    for (let depth = 0; depth < 3; depth++) {
      const res = await upstreamFetch(curUrl, {
        timeoutMs: 3800,
        maxBytes: 196_608,
        headers: customHeaders
      });
      if (!res.ok || !res.text || !res.text.includes("#EXTM3U")) return null;

      const effectiveBase = res.finalUrl || curUrl;
      const proxyNeeded = useProxy || hasIpBoundTokensInManifest(res.text, effectiveBase);
      const parsed = parseMediaPlaylist(res.text, effectiveBase, baseUrl, proxyNeeded);

      if (parsed.isMaster && parsed.variants.length) {
        const chosen = selectBestVariant(parsed.variants);
        if (!chosen) return null;
        curUrl = chosen.url;
        continue;
      }

      return parsed.segments.length ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

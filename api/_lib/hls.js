/**
 * BarakatWave Live TV — Universal RFC 8216 HLS Manifest Parser, Rewriter & Pre-Roll Stitcher
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Guarantees across Televizo, IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, VLC & Web:
 *  1) Pure-Intro Phase 1 -> Bridge Phase 2 -> Live Phase 3 so Live-Edge players (like Televizo /
 *     ExoPlayer) ALWAYS play the Intro Video from 0.0s first and transition seamlessly to Live TV!
 *  2) Automatic Channel Offline Broadcast Video whenever an upstream live channel fails or is down!
 *  3) Continuous PRO VIP Unlock Broadcast (0306-2015326) & Coming Soon VOD Broadcast!
 *  4) Uses .ts URLs inside manifests (mapped to .m2ts on disk) for 100% ExoPlayer TS compatibility!
 */

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

// Map local .mp4 aliases (e.g. /media/welcome/video.mp4) to their corresponding HLS .ts segments for HLS stitcher!
const LOCAL_MP4_TO_HLS = {
  "/media/welcome/video.mp4": "/media/welcome/index.m3u8",
  "/media/channel-offline/video.mp4": "/media/channel-offline/index.m3u8",
  "/media/coming-soon/video.mp4": "/media/coming-soon/index.m3u8",
  "/media/pro-unlock/video.mp4": "/media/pro-unlock/index.m3u8"
};

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
 * Parse an HLS media or master playlist text into structured segments + metadata.
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

/**
 * Load a built-in /media/*.m3u8 OR Admin-configured remote .m3u8 / .ts clip
 * into HLS segment descriptors so Admin custom videos work everywhere!
 */
export async function loadClipSegments(
  videoUrl,
  baseUrl,
  fallbackLocalPath = "/media/welcome/index.m3u8",
  defaultClipDurationSec = 8
) {
  const target = String(videoUrl || fallbackLocalPath).trim() || fallbackLocalPath;
  const clipDur = Math.max(2, Math.min(45, Number(defaultClipDurationSec) || 8));

  // Case 1: Local path on BarakatWave origin
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
      const txt = await fetchTextWithTimeout(fullLocalUrl, 2500);
      if (txt) {
        const parsed = parseMediaPlaylist(txt, fullLocalUrl, baseUrl, false);
        if (parsed.segments.length) return parsed.segments;
      }
    }
  }

  // Case 2: Remote Admin Video URL (.m3u8, .ts/.m2ts, or custom URL)
  if (/^https?:\/\//i.test(target)) {
    const cleanPath = target.split("?")[0].toLowerCase();

    if (/\.(ts|mts|m2ts)$/.test(cleanPath)) {
      return [
        {
          duration: clipDur,
          infLine: `#EXTINF:${clipDur.toFixed(3)},`,
          url: target
        }
      ];
    }

    if (/\.(mp4|m4v|webm|mov)$/.test(cleanPath)) {
      return [
        {
          duration: clipDur,
          infLine: `#EXTINF:${clipDur.toFixed(3)},`,
          url: target
        }
      ];
    }

    try {
      const fetched = await fetchTextWithTimeout(target, 3500);
      if (fetched && fetched.includes("#EXTM3U")) {
        let parsed = parseMediaPlaylist(fetched, target, baseUrl, false);
        if (parsed.isMaster && parsed.variants.length) {
          const subTxt = await fetchTextWithTimeout(parsed.variants[0].url, 3500);
          if (subTxt && subTxt.includes("#EXTM3U")) {
            parsed = parseMediaPlaylist(subTxt, parsed.variants[0].url, baseUrl, false);
          }
        }
        if (parsed.segments.length) return parsed.segments;
      } else if (fetched !== null) {
        return [
          {
            duration: clipDur,
            infLine: `#EXTINF:${clipDur.toFixed(3)},`,
            url: target
          }
        ];
      }
    } catch {
      // fall back to built-in HD bumper below
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
 * Televizo-Verified 3-Phase RFC 8216 Live HLS Pre-Roll + Channel Offline Failover Stitcher:
 *
 *  - Phase 1 (Pure Intro: elapsed < introHoldSec, e.g. 0..5.5s):
 *      Emits ONLY Intro segments (no live segments at the bottom yet!) so Live-Edge IPTV apps
 *      like Televizo, TiviMate, IPTV Smarters & VLC CANNOT skip past the Intro to the live edge!
 *      Because there is NO #EXT-X-ENDLIST and TARGETDURATION=2, Televizo polls again in ~2s!
 *
 *  - Phase 2 (Seamless Bridge: introHoldSec <= elapsed < introTotalSec + 7.5s):
 *      Keeps Intro segments at MEDIA-SEQUENCE:0 + appends #EXT-X-DISCONTINUITY + Live Channel
 *      segments (or Channel Offline Fallback segments if the channel stream is down!).
 *      Televizo finishes the final Intro segment and crosses #EXT-X-DISCONTINUITY straight into Live TV!
 *
 *  - Phase 3 (Steady Live Broadcast: elapsed >= introTotalSec + 7.5s):
 *      Slides Intro off (#EXT-X-DISCONTINUITY-SEQUENCE increments by 1) and streams pure Live TV
 *      (or Channel Offline Fallback if upstream fails) 24/7 with strictly monotonic sequence!
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

  // Phase 1 holds ONLY Intro segments on screen for ~65% of intro duration (e.g. 5.2s of an 8s intro)
  // so Televizo/ExoPlayer starts right at seg0.ts and plays the full Intro before polling Phase 2!
  const introHoldSec = Math.max(2.5, Math.min(introTotalSec - 2.2, introTotalSec * 0.68));
  const isPhase1PureIntro = !forceBridge && introEnabled && K > 0 && elapsed < introHoldSec;
  const isPhase2Bridge =
    !isPhase1PureIntro && introEnabled && K > 0 && (forceBridge || elapsed < introTotalSec + 7.5);

  // FAST PATH FOR PHASE 1 (Pure Intro): 0ms instant response — don't even wait on slow upstream yet!
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

  // Resolve live channel source (local built-in or remote live HLS)
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
      const needProxy = Boolean(channel.useProxy || (channel.headers && Object.keys(channel.headers).length));
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

  // AUTOMATIC CHANNEL OFFLINE FALLBACK VIDEO:
  // Whenever a channel's stream URLs fail / 404 / timeout, play the Admin's Channel Offline Video!
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

  // If no intro was configured for this session, serve pure live stream (or offline fallback) directly
  if (!introEnabled || K === 0 || sessionStartSec <= 0) {
    if (isLocalLoop) {
      return buildLoopingLiveM3u8(localLoopSegs, 6);
    }
    const tail = liveSegments.slice(-6);
    const seqStart = liveMediaSeq + Math.max(0, liveSegments.length - tail.length);
    return serializeLiveWindow(tail, Math.max(liveTargetDur, 4), seqStart, liveDiscSeq);
  }

  // Local 24/7 channel OR Channel Offline Fallback with Intro -> Direct Live handoff
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

  // Remote Live HLS Channel with Intro -> Direct Live Channel handoff!
  const chosenLive = liveSegments.slice(-5);
  const maxTarget = Math.max(
    liveTargetDur,
    ...introSegments.map((s) => Math.ceil(s.duration || 2)),
    4
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
    for (const seg of chosenLive) {
      if (seg.discontinuity) out.push("#EXT-X-DISCONTINUITY");
      if (seg.keyLine) out.push(seg.keyLine);
      if (seg.mapLine) out.push(seg.mapLine);
      out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
      out.push(seg.url);
    }
    return out.join("\n") + "\n";
  }

  // Phase 3: Pure Live Channel forever with monotonic session sequence
  const avgDur =
    chosenLive.reduce((a, s) => a + (s.duration || 4), 0) / Math.max(1, chosenLive.length) || 4;
  const fallbackStep = Math.max(0, Math.floor((elapsed - introTotalSec) / avgDur));
  const monotonicSeq = K + fallbackStep;

  return serializeLiveWindow(chosenLive, maxTarget, monotonicSeq, 1 + liveDiscSeq);
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

async function fetchLiveMediaSegments(url, baseUrl, customHeaders = {}, useProxy = false) {
  try {
    const text = await fetchTextWithTimeout(url, 3800, customHeaders);
    if (!text || !text.includes("#EXTM3U")) return null;
    let parsed = parseMediaPlaylist(text, url, baseUrl, useProxy);
    if (parsed.isMaster && parsed.variants.length) {
      const chosen = parsed.variants[Math.min(parsed.variants.length - 1, 1)] || parsed.variants[0];
      const subText = await fetchTextWithTimeout(chosen.url, 3800, customHeaders);
      if (subText && subText.includes("#EXTM3U")) {
        parsed = parseMediaPlaylist(subText, chosen.url, baseUrl, useProxy);
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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarakatWaveTV/2.2",
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

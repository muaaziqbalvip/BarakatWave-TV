/**
 * BarakatWave Live TV — Custom 3D Universal Broadcast Player Engine v4.0
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Custom Studio Player + Multi-Protocol Media Core:
 *  - MPEG-DASH (.mpd) Live & VOD + ClearKey DRM (kid:key / JSON) + Widevine DRM via Shaka Player
 *  - Apple HLS (.m3u8 / .m3u) Live & VOD + AES-128 + Custom Port (:5789) Failover via hls.js / Safari
 *  - Live Raw MPEG-TS (.ts / .m2ts) & HTTP-FLV (.flv) Streams via mpegts.js MSE
 *  - Progressive Cinema & Audio (.mp4, .webm, .mkv, .mov, .mp3, .aac, .m4a, .opus)
 *  - 4-Video Broadcast Suite: Welcome Intro -> Live Channel, PRO VIP Unlock (0306-2015326),
 *    Channel Offline Standby, and Movies/Series Coming Soon Broadcast
 *  - Custom Branded 3D Studio Chrome: Scrub Timeline, Live Sync, Aspect Ratio (Fit/Fill/16:9/4:3),
 *    Unified HLS+DASH Quality & Audio/CC Selectors, 3D Ambilight Glow, Double-Tap Seek,
 *    Fullscreen Channel Zapping, Mobile Landscape Lock, PiP & Frame Screenshot!
 */

const scriptLoadPromises = new Map();

function loadVendorScriptOnce(src, globalCheck) {
  if (globalCheck()) return Promise.resolve(true);
  if (scriptLoadPromises.has(src)) return scriptLoadPromises.get(src);

  const p = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(globalCheck())), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      setTimeout(() => resolve(Boolean(globalCheck())), 2500);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(Boolean(globalCheck()));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });

  scriptLoadPromises.set(src, p);
  return p;
}

async function ensureShakaPlayer() {
  const ok = await loadVendorScriptOnce(
    "/assets/vendor/shaka-player.min.js",
    () => typeof window !== "undefined" && Boolean(window.shaka?.Player)
  );
  if (ok && window.shaka?.polyfill && !window.__bwShakaPolyfilled) {
    window.__bwShakaPolyfilled = true;
    try {
      window.shaka.polyfill.installAll();
    } catch {
      // ignore
    }
  }
  return ok && Boolean(window.shaka?.Player?.isBrowserSupported?.() ?? window.shaka?.Player);
}

async function ensureHlsLibrary() {
  const ok = await loadVendorScriptOnce(
    "/assets/vendor/hls.min.js",
    () => typeof window !== "undefined" && Boolean(window.Hls)
  );
  return ok;
}

async function ensureMpegtsPlayer() {
  const ok = await loadVendorScriptOnce(
    "/assets/vendor/mpegts.min.js",
    () => typeof window !== "undefined" && Boolean(window.mpegts?.createPlayer)
  );
  return ok && Boolean(window.mpegts?.isSupported?.());
}

/**
 * Parse ClearKey strings in any common IPTV format:
 *  - "kidHex:keyHex" or "kid1:key1,kid2:key2"
 *  - '{"keys":[{"kty":"oct","kid":"...","k":"..."}]}' (JWK Base64url)
 *  - '{"kidHex":"keyHex"}'
 */
export function parseClearKeyConfig(rawKey) {
  const str = String(rawKey || "").trim();
  if (!str) return null;

  const b64UrlToHex = (b64u) => {
    try {
      const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      return Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  };

  if (str.startsWith("{")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed.keys)) {
        const out = {};
        for (const k of parsed.keys) {
          const kidHex = b64UrlToHex(k.kid || "");
          const keyHex = b64UrlToHex(k.k || "");
          if (kidHex && keyHex) out[kidHex.toLowerCase()] = keyHex.toLowerCase();
        }
        return Object.keys(out).length ? out : null;
      }
      const out = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") {
          out[k.replace(/-/g, "").toLowerCase()] = v.replace(/-/g, "").toLowerCase();
        }
      }
      return Object.keys(out).length ? out : null;
    } catch {
      // fall through to colon pair parsing
    }
  }

  const out = {};
  const pairs = str.split(/[,;\s]+/).filter(Boolean);
  for (const pair of pairs) {
    const [kid, key] = pair.split(":");
    if (kid && key) {
      const cleanKid = kid.replace(/-/g, "").trim().toLowerCase();
      const cleanKey = key.replace(/-/g, "").trim().toLowerCase();
      if (/^[0-9a-f]{16,64}$/.test(cleanKid) && /^[0-9a-f]{16,64}$/.test(cleanKey)) {
        out[cleanKid] = cleanKey;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Detect optimal playback engine for any stream URL + optional format hint.
 */
export function detectStreamProtocol(url, formatHint = "auto") {
  const hint = String(formatHint || "auto").toLowerCase().trim();
  if (["dash", "mpd"].includes(hint)) return "dash";
  if (["hls", "m3u8"].includes(hint)) return "hls";
  if (["mpegts", "ts"].includes(hint)) return "mpegts";
  if (hint === "flv") return "flv";
  if (["mp4", "html5", "direct", "audio"].includes(hint)) return "html5";

  const raw = String(url || "").trim();
  let checkTarget = raw;
  // Unwrap /api/proxy?u=... to inspect inner upstream extension!
  if (raw.includes("/api/proxy?")) {
    try {
      const uObj = new URL(raw, "http://localhost");
      const inner = uObj.searchParams.get("u") || uObj.searchParams.get("url");
      if (inner) checkTarget = inner;
    } catch {
      // keep raw
    }
  }

  const cleanPath = checkTarget.split("?")[0].split("#")[0].toLowerCase();
  const queryPart = (checkTarget.split("?")[1] || "").toLowerCase();

  if (
    cleanPath.endsWith(".mpd") ||
    cleanPath.includes(".mpd/") ||
    /(?:format|manifest|type|output)=mpd\b/.test(queryPart)
  ) {
    return "dash";
  }
  if (
    cleanPath.endsWith(".m3u8") ||
    cleanPath.endsWith(".m3u") ||
    cleanPath.includes(".m3u8/") ||
    cleanPath.startsWith("/api/stream") ||
    /(?:format|output|type)=m3u8\b/.test(queryPart)
  ) {
    return "hls";
  }
  if (cleanPath.endsWith(".flv") || /(?:format|output)=flv\b/.test(queryPart)) {
    return "flv";
  }
  if (
    cleanPath.endsWith(".ts") ||
    cleanPath.endsWith(".m2ts") ||
    /\/live\/[^/]+\/[^/]+\/\d+\.ts$/i.test(cleanPath)
  ) {
    return "mpegts";
  }
  if (/\.(mp4|m4v|webm|mkv|mov|ogv|ogg|mp3|aac|m4a|opus|flac|wav)$/.test(cleanPath)) {
    return "html5";
  }
  // Extensionless IPTV panel stream (e.g. http://panel:8080/user/pass/12345) -> try HLS first, then MPEG-TS
  return "hls";
}

function formatClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const s = Math.floor(sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

const ASPECT_MODES = [
  { id: "fit", label: "16:9 Fit", css: "contain" },
  { id: "fill", label: "Zoom Fill", css: "cover" },
  { id: "stretch", label: "Stretch", css: "fill" },
  { id: "43", label: "4:3 TV", css: "contain", ratio43: true }
];

export class BarakatPlayer {
  constructor({
    videoEl,
    stageEl,
    statusEl,
    codecBadgeEl,
    qualitySelectEl,
    audioSelectEl,
    subtitleSelectEl,
    introOverlayEl,
    introCountdownEl,
    skipIntroBtnEl,
    proOverlayEl,
    onStateChange,
    onStepChannel,
    sourceResolver
  }) {
    this.video = videoEl;
    this.stage = stageEl || videoEl?.closest(".player-stage") || videoEl?.parentElement;
    this.statusEl = statusEl;
    this.codecBadgeEl = codecBadgeEl;
    this.qualitySelect = qualitySelectEl;
    this.audioSelect = audioSelectEl;
    this.subtitleSelect = subtitleSelectEl;
    this.introOverlay = introOverlayEl;
    this.introCountdown = introCountdownEl;
    this.skipIntroBtn = skipIntroBtnEl;
    this.proOverlay = proOverlayEl;
    this.onStateChange = onStateChange || (() => {});
    this.onStepChannel = onStepChannel || null;
    /**
     * Stream Vault resolver (see `vault.js`). When provided, real playback URLs are
     * fetched from the encrypted server vault instead of the public channel object,
     * so backend links never appear in the browser.
     */
    this.sourceResolver = sourceResolver || null;
    this.lastPlayedAt = 0;

    this.hls = null;
    this.shaka = null;
    this.mpegtsPlayer = null;
    this.activeEngine = "idle";
    this.isLiveMode = true;
    this.currentChannel = null;
    this.settings = {};
    this.userPlan = "free";
    this.playToken = 0;
    this.introTimer = null;
    this.introGuardTimer = null;
    this.aspectIdx = 0;
    this.ambilightEnabled = localStorage.getItem("bw_ambilight") !== "0";
    this.ambilightTimer = null;
    this.uiHideTimer = null;
    this.isScrubbing = false;
    this.sessionIntroPlayed = false;

    if (this.video) {
      // Replace default browser controls with BarakatWave Custom Studio Chrome!
      this.video.controls = false;
      this.video.playsInline = true;
    }

    this.mountCustomChrome();
    this.bindCoreEvents();
    this.startAmbilightLoop();
  }

  mountCustomChrome() {
    if (!this.stage || !this.video) return;
    this.stage.classList.add("bw-custom-player");

    // 1. Mount 3D Ambilight Halo Canvas right inside player-shell (behind stage)
    const shell = this.stage.closest(".player-shell");
    if (shell && !shell.querySelector(".bw-ambilight-canvas")) {
      shell.classList.add("bw-shell-3d");
      const canvas = document.createElement("canvas");
      canvas.className = "bw-ambilight-canvas";
      canvas.width = 28;
      canvas.height = 16;
      canvas.setAttribute("aria-hidden", "true");
      shell.prepend(canvas);
      this.ambilightCanvas = canvas;
      shell.classList.toggle("ambilight-off", !this.ambilightEnabled);
    }

    // 2. Mount Custom Center Spinner, Play Pulse, Gesture Zones & Studio Bottom Control Deck
    if (!this.stage.querySelector(".bw-studio-chrome")) {
      const chrome = document.createElement("div");
      chrome.className = "bw-studio-chrome";
      chrome.innerHTML = `
        <div class="bw-buffer-ring" id="bwBufferRing" hidden>
          <div class="bw-spinner-orb"></div>
          <span class="bw-buffer-label" id="bwBufferLabel">Tuning Stream...</span>
        </div>

        <button type="button" class="bw-center-play-btn" id="bwCenterPlayBtn" aria-label="Play or Pause" hidden>
          <span>▶</span>
        </button>

        <div class="bw-seek-ripple left" id="bwRippleLeft" hidden>⏪ -10s</div>
        <div class="bw-seek-ripple right" id="bwRippleRight" hidden>+10s ⏩</div>

        <div class="bw-bottom-deck" id="bwBottomDeck">
          <div class="bw-timeline-wrap" id="bwTimelineWrap">
            <div class="bw-timeline-track" id="bwTimelineTrack">
              <div class="bw-timeline-buffered" id="bwTimelineBuffered"></div>
              <div class="bw-timeline-progress" id="bwTimelineProgress">
                <span class="bw-timeline-thumb"></span>
              </div>
            </div>
          </div>

          <div class="bw-deck-row">
            <div class="bw-deck-left">
              <button type="button" class="bw-ctrl-btn" id="bwPlayPauseBtn" title="Play / Pause (Space)" aria-label="Play or Pause">⏸</button>
              <button type="button" class="bw-ctrl-btn" id="bwDeckPrevBtn" title="Previous Channel" aria-label="Previous Channel">⏮</button>
              <button type="button" class="bw-ctrl-btn" id="bwDeckNextBtn" title="Next Channel" aria-label="Next Channel">⏭</button>

              <div class="bw-vol-group">
                <button type="button" class="bw-ctrl-btn" id="bwMuteBtn" title="Mute / Unmute (M)" aria-label="Mute">🔊</button>
                <input type="range" class="bw-vol-slider" id="bwVolSlider" min="0" max="1" step="0.02" value="1" aria-label="Volume" />
              </div>

              <button type="button" class="bw-live-sync-pill" id="bwTimeOrLiveBtn" title="Jump to Live Edge">
                <span class="bw-live-dot"></span>
                <span id="bwTimeText">LIVE</span>
              </button>
            </div>

            <div class="bw-deck-right">
              <span class="bw-engine-badge" id="bwEngineBadge">HLS • AUTO</span>
              <button type="button" class="bw-ctrl-btn bw-pill-ctrl" id="bwAspectBtn" title="Switch Aspect Ratio (Fit / Fill / 16:9 / 4:3)">16:9</button>
              <button type="button" class="bw-ctrl-btn bw-pill-ctrl" id="bwSpeedBtn" title="Playback Speed" hidden>1x</button>
              <button type="button" class="bw-ctrl-btn" id="bwGlowToggleBtn" title="Toggle 3D Ambilight Glow">✨</button>
              <button type="button" class="bw-ctrl-btn" id="bwSnapBtn" title="Capture HD Frame">📸</button>
              <button type="button" class="bw-ctrl-btn" id="bwDeckPipBtn" title="Picture-in-Picture (P)">⧉</button>
              <button type="button" class="bw-ctrl-btn bw-fs-btn" id="bwFullscreenBtn" title="Fullscreen (F)" aria-label="Fullscreen">⛶</button>
            </div>
          </div>
        </div>
      `;
      this.stage.appendChild(chrome);
    }

    this.els = {
      bufferRing: this.stage.querySelector("#bwBufferRing"),
      bufferLabel: this.stage.querySelector("#bwBufferLabel"),
      centerPlayBtn: this.stage.querySelector("#bwCenterPlayBtn"),
      rippleLeft: this.stage.querySelector("#bwRippleLeft"),
      rippleRight: this.stage.querySelector("#bwRippleRight"),
      timelineWrap: this.stage.querySelector("#bwTimelineWrap"),
      timelineTrack: this.stage.querySelector("#bwTimelineTrack"),
      timelineBuffered: this.stage.querySelector("#bwTimelineBuffered"),
      timelineProgress: this.stage.querySelector("#bwTimelineProgress"),
      playPauseBtn: this.stage.querySelector("#bwPlayPauseBtn"),
      prevBtn: this.stage.querySelector("#bwDeckPrevBtn"),
      nextBtn: this.stage.querySelector("#bwDeckNextBtn"),
      muteBtn: this.stage.querySelector("#bwMuteBtn"),
      volSlider: this.stage.querySelector("#bwVolSlider"),
      timeOrLiveBtn: this.stage.querySelector("#bwTimeOrLiveBtn"),
      timeText: this.stage.querySelector("#bwTimeText"),
      engineBadge: this.stage.querySelector("#bwEngineBadge"),
      aspectBtn: this.stage.querySelector("#bwAspectBtn"),
      speedBtn: this.stage.querySelector("#bwSpeedBtn"),
      glowBtn: this.stage.querySelector("#bwGlowToggleBtn"),
      snapBtn: this.stage.querySelector("#bwSnapBtn"),
      pipBtn: this.stage.querySelector("#bwDeckPipBtn"),
      fsBtn: this.stage.querySelector("#bwFullscreenBtn")
    };
  }

  bindCoreEvents() {
    if (!this.video || !this.stage) return;

    if (this.skipIntroBtn) {
      this.skipIntroBtn.addEventListener("click", () => {
        if (this._finishIntroNow) this._finishIntroNow();
      });
    }

    if (this.qualitySelect) {
      this.qualitySelect.addEventListener("change", () => {
        const val = this.qualitySelect.value;
        if (this.activeEngine === "hls" && this.hls) {
          const lvl = parseInt(val, 10);
          this.hls.currentLevel = Number.isNaN(lvl) ? -1 : lvl;
        } else if (this.activeEngine === "dash" && this.shaka) {
          if (val === "-1") {
            this.shaka.configure({ abr: { enabled: true } });
          } else {
            const tracks = this.shaka.getVariantTracks() || [];
            const chosen = tracks.find((t) => String(t.id) === String(val));
            if (chosen) {
              this.shaka.configure({ abr: { enabled: false } });
              this.shaka.selectVariantTrack(chosen, true);
            }
          }
        }
      });
    }

    if (this.audioSelect) {
      this.audioSelect.addEventListener("change", () => {
        const val = this.audioSelect.value;
        if (this.activeEngine === "hls" && this.hls) {
          const idx = parseInt(val, 10);
          if (!Number.isNaN(idx)) this.hls.audioTrack = idx;
        } else if (this.activeEngine === "dash" && this.shaka) {
          this.shaka.selectAudioLanguage(val);
        }
      });
    }

    if (this.subtitleSelect) {
      this.subtitleSelect.addEventListener("change", () => {
        const val = this.subtitleSelect.value;
        if (this.activeEngine === "hls" && this.hls) {
          const idx = parseInt(val, 10);
          this.hls.subtitleTrack = Number.isNaN(idx) ? -1 : idx;
        } else if (this.activeEngine === "dash" && this.shaka) {
          if (val === "off") {
            this.shaka.setTextTrackVisibility(false);
          } else {
            this.shaka.selectTextLanguage(val);
            this.shaka.setTextTrackVisibility(true);
          }
        }
      });
    }

    // Play / Pause
    const togglePlay = () => {
      if (!this.video) return;
      if (this.video.paused) {
        this.safePlay(this.video);
      } else {
        this.video.pause();
      }
      this.bumpControlsVisibility();
    };

    this.els?.playPauseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay();
    });
    this.els?.centerPlayBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlay();
    });

    // Prev / Next Channel inside Studio Deck
    this.els?.prevBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStepChannel) this.onStepChannel(-1);
    });
    this.els?.nextBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStepChannel) this.onStepChannel(1);
    });

    // Volume & Mute
    const syncVolumeUi = () => {
      if (!this.els?.muteBtn || !this.video) return;
      const muted = this.video.muted || this.video.volume === 0;
      this.els.muteBtn.textContent = muted ? "🔇" : this.video.volume < 0.5 ? "🔉" : "🔊";
      if (this.els.volSlider) {
        this.els.volSlider.value = muted ? "0" : String(this.video.volume);
      }
    };

    this.els?.muteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.video.muted = !this.video.muted;
      if (!this.video.muted && this.video.volume === 0) this.video.volume = 0.8;
      syncVolumeUi();
    });

    this.els?.volSlider?.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = parseFloat(e.target.value);
      this.video.volume = Number.isFinite(v) ? v : 1;
      this.video.muted = v === 0;
      syncVolumeUi();
    });

    this.video.addEventListener("volumechange", syncVolumeUi);

    // Live Sync / Time Button
    this.els?.timeOrLiveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.jumpToLiveEdge();
    });

    // Aspect Ratio Switcher
    this.els?.aspectBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.aspectIdx = (this.aspectIdx + 1) % ASPECT_MODES.length;
      const mode = ASPECT_MODES[this.aspectIdx];
      this.video.style.objectFit = mode.css;
      this.video.style.maxWidth = mode.ratio43 ? "75%" : "100%";
      this.video.style.margin = mode.ratio43 ? "0 auto" : "0";
      if (this.els.aspectBtn) this.els.aspectBtn.textContent = mode.label;
    });

    // Playback Speed (VOD / Cinema)
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    this.els?.speedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const cur = this.video.playbackRate || 1;
      const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length] || 1;
      this.video.playbackRate = next;
      this.els.speedBtn.textContent = `${next}x`;
    });

    // 3D Ambilight Toggle
    this.els?.glowBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.ambilightEnabled = !this.ambilightEnabled;
      localStorage.setItem("bw_ambilight", this.ambilightEnabled ? "1" : "0");
      this.stage.closest(".player-shell")?.classList.toggle("ambilight-off", !this.ambilightEnabled);
      this.els.glowBtn.classList.toggle("active-glow", this.ambilightEnabled);
    });
    this.els?.glowBtn?.classList.toggle("active-glow", this.ambilightEnabled);

    // Frame Screenshot
    this.els?.snapBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.captureScreenshot();
    });

    // PiP
    this.els?.pipBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (this.video.requestPictureInPicture) {
          await this.video.requestPictureInPicture();
        }
      } catch {
        // ignore
      }
    });

    // Fullscreen + Mobile Landscape Auto-Lock
    this.els?.fsBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", () => {
      const isFs = Boolean(document.fullscreenElement);
      if (this.els?.fsBtn) this.els.fsBtn.textContent = isFs ? "🗗" : "⛶";
      if (!isFs && screen.orientation?.unlock) {
        try {
          screen.orientation.unlock();
        } catch {
          // ignore
        }
      }
    });

    // Timeline Scrubbing
    const seekFromPointer = (clientX) => {
      if (!this.els?.timelineTrack || !this.video) return;
      const rect = this.els.timelineTrack.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = this.getSeekableDuration();
      if (dur.seekable) {
        this.video.currentTime = dur.start + ratio * (dur.end - dur.start);
      }
    };

    this.els?.timelineTrack?.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.isScrubbing = true;
      seekFromPointer(e.clientX);
      const onMove = (ev) => seekFromPointer(ev.clientX);
      const onUp = () => {
        this.isScrubbing = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    // Video State Listeners -> Update Custom Chrome
    this.video.addEventListener("play", () => {
      if (this.els?.playPauseBtn) this.els.playPauseBtn.textContent = "⏸";
      if (this.els?.centerPlayBtn) this.els.centerPlayBtn.hidden = true;
      this.bumpControlsVisibility();
    });

    this.video.addEventListener("pause", () => {
      if (this.els?.playPauseBtn) this.els.playPauseBtn.textContent = "▶";
      if (this.els?.centerPlayBtn) this.els.centerPlayBtn.hidden = false;
      this.stage.classList.remove("bw-controls-autohide");
    });

    this.video.addEventListener("waiting", () => this.showBuffering(true));
    this.video.addEventListener("playing", () => {
      this.showBuffering(false);
      if (this.els?.centerPlayBtn) this.els.centerPlayBtn.hidden = true;
      this.refreshResolutionBadge();
    });
    this.video.addEventListener("canplay", () => this.showBuffering(false));
    this.video.addEventListener("timeupdate", () => this.updateTimelineUi());
    this.video.addEventListener("progress", () => this.updateTimelineUi());
    this.video.addEventListener("resize", () => this.refreshResolutionBadge());

    // Stage Tap / Double-Tap Seek (Mobile) & Click / Double-Click Fullscreen (Laptop)
    let lastTapTime = 0;
    let singleTapTimer = null;
    this.stage.addEventListener("click", (e) => {
      if (
        e.target.closest(".bw-bottom-deck") ||
        e.target.closest(".intro-overlay") ||
        e.target.closest(".pro-unlock-overlay") ||
        e.target.closest(".bw-center-play-btn")
      ) {
        return;
      }

      const now = Date.now();
      const rect = this.stage.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const isTouch = window.matchMedia?.("(pointer: coarse)")?.matches;

      if (now - lastTapTime < 290) {
        clearTimeout(singleTapTimer);
        lastTapTime = 0;
        if (isTouch) {
          if (relX < 0.36) {
            this.seekRelative(-10);
          } else if (relX > 0.64) {
            this.seekRelative(10);
          } else {
            this.toggleFullscreen();
          }
        } else {
          this.toggleFullscreen();
        }
        return;
      }

      lastTapTime = now;
      singleTapTimer = setTimeout(() => {
        if (isTouch) {
          if (this.stage.classList.contains("bw-controls-autohide")) {
            this.bumpControlsVisibility();
          } else {
            this.stage.classList.add("bw-controls-autohide");
          }
        } else {
          togglePlay();
        }
      }, 240);
    });

    this.stage.addEventListener("pointermove", () => this.bumpControlsVisibility());

    // Laptop / Desktop Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
        return;
      }
      const liveSection = document.getElementById("view-live");
      if (liveSection && liveSection.hidden) return;

      if (e.code === "Space" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        this.video.muted = !this.video.muted;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.seekRelative(-10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.seekRelative(10);
      }
    });
  }

  bumpControlsVisibility() {
    if (!this.stage) return;
    this.stage.classList.remove("bw-controls-autohide");
    clearTimeout(this.uiHideTimer);
    if (this.video && !this.video.paused) {
      this.uiHideTimer = setTimeout(() => {
        if (this.video && !this.video.paused && !this.isScrubbing) {
          this.stage.classList.add("bw-controls-autohide");
        }
      }, 3600);
    }
  }

  showBuffering(active, label = "Tuning HD Stream...") {
    if (!this.els?.bufferRing) return;
    this.els.bufferRing.hidden = !active;
    if (active && this.els.bufferLabel) {
      this.els.bufferLabel.textContent = label;
    }
  }

  setEngineBadge(protocolLabel) {
    const up = String(protocolLabel || "AUTO").toUpperCase();
    if (this.els?.engineBadge) this.els.engineBadge.textContent = up;
    if (this.codecBadgeEl) this.codecBadgeEl.textContent = up;
  }

  refreshResolutionBadge() {
    const h = this.video?.videoHeight || 0;
    const proto =
      this.activeEngine === "dash"
        ? "DASH MPD"
        : this.activeEngine === "mpegts"
          ? "MPEG-TS"
          : this.activeEngine === "flv"
            ? "HTTP-FLV"
            : this.activeEngine === "hls"
              ? "HLS"
              : "MEDIA";
    const resLabel = h >= 2160 ? "4K UHD" : h >= 1080 ? "1080p FHD" : h >= 720 ? "720p HD" : h > 0 ? `${h}p` : "HD";
    const drmSuffix = this.currentChannel?.drmKey || this.currentChannel?.drmLicenseUrl ? " • DRM" : "";
    this.setEngineBadge(`${proto} • ${resLabel}${drmSuffix}`);
  }

  getSeekableDuration() {
    if (!this.video) return { seekable: false, start: 0, end: 0 };
    const d = this.video.duration;
    if (Number.isFinite(d) && d > 0 && d < 86400 * 2) {
      return { seekable: true, start: 0, end: d };
    }
    const sr = this.video.seekable;
    if (sr && sr.length > 0) {
      const start = sr.start(0);
      const end = sr.end(sr.length - 1);
      if (end - start > 4) {
        return { seekable: true, start, end };
      }
    }
    return { seekable: false, start: 0, end: 0 };
  }

  updateTimelineUi() {
    if (!this.video || !this.els?.timelineProgress) return;
    const info = this.getSeekableDuration();
    const cur = this.video.currentTime || 0;

    if (this.els.speedBtn) {
      this.els.speedBtn.hidden = Boolean(this.isLiveMode);
    }

    if (!this.isLiveMode && info.seekable) {
      const span = Math.max(0.1, info.end - info.start);
      const pct = Math.max(0, Math.min(100, ((cur - info.start) / span) * 100));
      this.els.timelineProgress.style.width = `${pct}%`;

      if (this.els.timelineBuffered && this.video.buffered?.length) {
        const bEnd = this.video.buffered.end(this.video.buffered.length - 1);
        const bPct = Math.max(0, Math.min(100, ((bEnd - info.start) / span) * 100));
        this.els.timelineBuffered.style.width = `${bPct}%`;
      }
      if (this.els.timeText) {
        this.els.timeText.textContent = `${formatClock(cur)} / ${formatClock(info.end)}`;
      }
      this.els.timeOrLiveBtn?.classList.remove("is-live");
    } else {
      // Live Broadcast Mode (with DVR edge indicator)
      let pct = 100;
      let behindSec = 0;
      if (info.seekable) {
        behindSec = Math.max(0, info.end - cur);
        const span = Math.max(1, info.end - info.start);
        pct = Math.max(0, Math.min(100, ((cur - info.start) / span) * 100));
      }
      this.els.timelineProgress.style.width = `${pct}%`;
      if (this.els.timelineBuffered) this.els.timelineBuffered.style.width = "100%";
      const atLiveEdge = behindSec < 12;
      if (this.els.timeText) {
        this.els.timeText.textContent = atLiveEdge ? "LIVE" : `-${formatClock(behindSec)} • GO LIVE`;
      }
      this.els.timeOrLiveBtn?.classList.toggle("is-live", atLiveEdge);
    }
  }

  jumpToLiveEdge() {
    if (!this.video) return;
    if (this.activeEngine === "hls" && this.hls?.liveSyncPosition) {
      this.video.currentTime = this.hls.liveSyncPosition;
    } else if (this.activeEngine === "dash" && this.shaka?.seekRange) {
      const range = this.shaka.seekRange();
      if (range && range.end > 0) this.video.currentTime = Math.max(range.start, range.end - 1.5);
    } else {
      const info = this.getSeekableDuration();
      if (info.seekable) this.video.currentTime = Math.max(info.start, info.end - 1);
    }
    this.safePlay(this.video);
  }

  seekRelative(deltaSec) {
    if (!this.video) return;
    const info = this.getSeekableDuration();
    if (!info.seekable) return;
    this.video.currentTime = Math.max(info.start, Math.min(info.end, (this.video.currentTime || 0) + deltaSec));
    const el = deltaSec < 0 ? this.els?.rippleLeft : this.els?.rippleRight;
    if (el) {
      el.hidden = false;
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.hidden = true;
      }, 520);
    }
  }

  async toggleFullscreen() {
    const target = this.stage || this.video;
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
        if (screen.orientation?.lock && window.innerWidth < 960) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      } else if (this.video?.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen();
      }
    } catch {
      if (this.video?.webkitEnterFullscreen) {
        try {
          this.video.webkitEnterFullscreen();
        } catch {
          // ignore
        }
      }
    }
  }

  captureScreenshot() {
    if (!this.video || !this.video.videoWidth) return;
    try {
      const c = document.createElement("canvas");
      c.width = this.video.videoWidth;
      c.height = this.video.videoHeight;
      c.getContext("2d").drawImage(this.video, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `barakatwave-${Date.now()}.png`;
      a.click();
    } catch {
      // Cross-origin frame security restriction -> ignore cleanly
    }
  }

  startAmbilightLoop() {
    if (this.ambilightTimer) clearInterval(this.ambilightTimer);
    let phase = 0;
    this.ambilightTimer = setInterval(() => {
      if (!this.ambilightEnabled || !this.ambilightCanvas || document.hidden) return;
      const ctx = this.ambilightCanvas.getContext("2d", { willReadFrequently: false });
      if (!ctx) return;

      if (this.video && !this.video.paused && this.video.readyState >= 2 && !this._ambilightTainted) {
        try {
          ctx.drawImage(this.video, 0, 0, this.ambilightCanvas.width, this.ambilightCanvas.height);
          return;
        } catch {
          this._ambilightTainted = true;
        }
      }
      // Smooth procedural broadcast wave glow when cross-origin video restricts pixel sampling
      phase += 0.14;
      const g = ctx.createLinearGradient(0, 0, this.ambilightCanvas.width, this.ambilightCanvas.height);
      const r1 = Math.round(12 + 25 * Math.sin(phase));
      const g1 = Math.round(145 + 55 * Math.cos(phase * 0.8));
      g.addColorStop(0, `rgb(${r1}, ${g1}, 235)`);
      g.addColorStop(0.55, "rgb(14, 116, 194)");
      g.addColorStop(1, "rgb(234, 165, 28)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.ambilightCanvas.width, this.ambilightCanvas.height);
    }, 110);
  }

  destroyEngines() {
    if (this.introTimer) {
      clearInterval(this.introTimer);
      this.introTimer = null;
    }
    if (this.introGuardTimer) {
      clearTimeout(this.introGuardTimer);
      this.introGuardTimer = null;
    }
    this._finishIntroNow = null;
    this._ambilightTainted = false;

    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // ignore
      }
      this.hls = null;
    }

    if (this.shaka) {
      const shakaInst = this.shaka;
      this.shaka = null;
      try {
        shakaInst.destroy();
      } catch {
        // ignore
      }
    }

    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.unload();
        this.mpegtsPlayer.detachMediaElement();
        this.mpegtsPlayer.destroy();
      } catch {
        // ignore
      }
      this.mpegtsPlayer = null;
    }

    this.activeEngine = "idle";

    if (this.video) {
      this.video.onplaying = null;
      this.video.onended = null;
      this.video.onerror = null;
      this.video.onloadedmetadata = null;
      this.video.loop = false;
      this.video.playbackRate = 1;
      if (this.els?.speedBtn) this.els.speedBtn.textContent = "1x";
    }
  }

  // Alias kept for backwards compatibility
  destroyHls() {
    this.destroyEngines();
  }

  setStatus(text, tone = "live") {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.dataset.tone = tone;
  }

  hideOverlays() {
    if (this.introOverlay) this.introOverlay.hidden = true;
    if (this.proOverlay) this.proOverlay.hidden = true;
  }

  async loadChannel(channel, { settings = {}, userPlan = "free", skipWelcome = false } = {}) {
    if (!channel || !this.video) return;
    const token = ++this.playToken;
    this.currentChannel = channel;
    this.settings = settings || {};
    this.userPlan = userPlan || "free";
    this.isLiveMode = true;

    this.destroyEngines();
    this.hideOverlays();
    this.resetSelectors();
    this.showBuffering(true, `Tuning ${channel.name || "Live TV"}...`);

    const isLockedPro = channel.tier === "pro" && this.userPlan !== "pro";

    if (isLockedPro) {
      await this.playProLockedStream(channel, token);
      return;
    }

    const welcomeUrl = (
      channel.introVideoUrl ||
      this.settings.welcomeVideoUrl ||
      "/media/welcome/index.m3u8"
    ).trim();
    // Ultra-smooth zapping: play the branded intro bumper only on the first tune-in of a session
    // (or every channel when the admin explicitly enables `alwaysShowIntro`).
    const isFirstTuneInThisSession = !this.sessionIntroPlayed;
    const shouldPlayWelcome =
      !skipWelcome &&
      this.settings.welcomeVideoEnabled !== false &&
      Boolean(welcomeUrl) &&
      (this.settings.alwaysShowIntro === true || isFirstTuneInThisSession);
    if (shouldPlayWelcome) this.sessionIntroPlayed = true;

    if (shouldPlayWelcome) {
      await this.playWelcomeBumper(welcomeUrl, token);
      if (token !== this.playToken) return;
    }

    await this.playLiveCandidates(channel, token);
  }

  async loadVod(vodItem, { settings = {}, userPlan = "free" } = {}) {
    if (!vodItem || !this.video) return;
    const token = ++this.playToken;
    this.currentChannel = vodItem;
    this.settings = settings || {};
    this.userPlan = userPlan || "free";
    this.isLiveMode = false;

    this.destroyEngines();
    this.hideOverlays();
    this.resetSelectors();

    if (vodItem.tier === "pro" && this.userPlan !== "pro") {
      await this.playProLockedStream(vodItem, token);
      return;
    }

    let customStream = String(vodItem.streamUrl || vodItem.url || "").trim();
    if (customStream === "shielded://vault") customStream = "";
    if (customStream) {
      this.setStatus(`🎬 LOADING • ${vodItem.title || vodItem.name}`, "loading");
      this.showBuffering(true, `Loading ${vodItem.title || "Cinema Stream"}...`);
      await this.attachUniversalSource(customStream, {
        token,
        loop: false,
        isLive: false,
        formatHint: vodItem.streamFormat || "auto",
        drmScheme: vodItem.drmScheme || "",
        drmKey: vodItem.drmKey || "",
        drmLicenseUrl: vodItem.drmLicenseUrl || "",
        onPlaying: () => {
          this.setStatus(`🎬 HD • ${vodItem.title || vodItem.name}`, "live");
          this.onStateChange("vod_playing", vodItem);
        },
        onError: () => {
          if (token === this.playToken) this.playComingSoonVod(vodItem, token);
        }
      });
      return;
    }

    this.playComingSoonVod(vodItem, token);
  }

  /**
   * Direct Universal URL Player — plays ANY .mpd (DASH + ClearKey/Widevine), .m3u8 (HLS),
   * .ts/.m2ts (MPEG-TS), .flv (HTTP-FLV), .mp4/.mkv/.webm, or audio stream!
   */
  async playCustomStream({
    url,
    title = "Custom Universal Stream",
    format = "auto",
    drmKey = "",
    drmLicenseUrl = "",
    isLive = true
  } = {}) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl || !this.video) return;
    const token = ++this.playToken;
    const customItem = {
      id: "custom_universal",
      name: title,
      title,
      url: cleanUrl,
      streamFormat: format,
      drmScheme: drmLicenseUrl ? "widevine" : drmKey ? "clearkey" : "",
      drmKey,
      drmLicenseUrl,
      tier: "free"
    };
    this.currentChannel = customItem;
    this.isLiveMode = Boolean(isLive);

    this.destroyEngines();
    this.hideOverlays();
    this.resetSelectors();
    this.showBuffering(true, "Connecting Universal Media Engine...");
    this.setStatus(`🎛 TUNING • ${title}`, "loading");

    // Try direct first, then automatic /api/proxy relay if CORS/mixed-content blocks direct playback!
    const candidates = [cleanUrl];
    if (/^https?:\/\//i.test(cleanUrl)) {
      candidates.push(`/api/proxy?u=${encodeURIComponent(cleanUrl)}`);
    }

    let cIdx = 0;
    const tryCandidate = async () => {
      if (token !== this.playToken) return;
      if (cIdx >= candidates.length) {
        this.showBuffering(false);
        this.setStatus("⚠️ STREAM UNREACHABLE • CHECK URL OR DRM KEY", "error");
        return;
      }
      const nextUrl = candidates[cIdx++];
      await this.attachUniversalSource(nextUrl, {
        token,
        loop: false,
        isLive,
        formatHint: format,
        drmScheme: customItem.drmScheme,
        drmKey,
        drmLicenseUrl,
        onPlaying: () => {
          this.showBuffering(false);
          this.setStatus(`● PLAYING • ${title}`, "live");
          this.onStateChange("playing", customItem);
        },
        onError: () => {
          if (token === this.playToken) tryCandidate();
        }
      });
    };

    await tryCandidate();
  }

  playComingSoonVod(vodItem, token) {
    if (token !== this.playToken) return;
    this.isLiveMode = false;
    const csUrl = (this.settings.comingSoonVideoUrl || "/media/coming-soon/video.mp4").trim();
    const playTarget =
      csUrl === "/media/coming-soon/index.m3u8" ? "/media/coming-soon/video.mp4" : csUrl;
    this.setStatus("🎬 SERVICE BUILDING • COMING SOON", "intro");
    this.onStateChange("coming_soon", vodItem);
    this.attachUniversalSource(playTarget, {
      token,
      loop: true,
      isLive: false,
      onError: () => {
        if (token === this.playToken) {
          this.attachUniversalSource("/media/coming-soon/index.m3u8", {
            token,
            loop: true,
            isLive: false
          });
        }
      }
    });
  }

  playOfflineStandby(channel, token) {
    if (token !== this.playToken) return;
    const offlineUrl = (
      channel.offlineVideoUrl ||
      this.settings.channelOfflineVideoUrl ||
      "/media/channel-offline/index.m3u8"
    ).trim();
    const isDirect = /\.(mp4|m4v|webm|ogg|mov)(\?|$)/i.test(offlineUrl);
    const playTarget = isDirect
      ? offlineUrl
      : `/api/stream?mode=offline&id=${encodeURIComponent(channel.streamId || channel.id || "1001")}`;

    this.setStatus("📡 STREAM OFFLINE • AUTO-RECOVERING", "error");
    this.onStateChange("offline_standby", channel);
    this.attachUniversalSource(playTarget, {
      token,
      loop: true,
      isLive: !isDirect,
      onError: () => {
        if (token === this.playToken) {
          this.attachUniversalSource("/media/channel-offline/video.mp4", {
            token,
            loop: true,
            isLive: false
          });
        }
      }
    });
  }

  playWelcomeBumper(welcomeUrl, token) {
    return new Promise((resolve) => {
      if (token !== this.playToken) return resolve();

      const configuredDur = Math.max(3, Math.min(45, Number(this.settings.welcomeDurationSec) || 6));
      const skippable = this.settings.welcomeSkippable !== false;
      let remaining = configuredDur;
      let startedPlayback = false;
      let done = false;

      if (this.introOverlay) this.introOverlay.hidden = false;
      if (this.skipIntroBtn) this.skipIntroBtn.hidden = !skippable;
      if (this.introCountdown) this.introCountdown.textContent = `${remaining}s`;
      this.setStatus("🎬 INTRO • STARTING CHANNEL...", "intro");

      const finish = () => {
        if (done) return;
        done = true;
        if (this.introTimer) {
          clearInterval(this.introTimer);
          this.introTimer = null;
        }
        if (this.introGuardTimer) {
          clearTimeout(this.introGuardTimer);
          this.introGuardTimer = null;
        }
        if (this.introOverlay) this.introOverlay.hidden = true;
        this.destroyEngines();
        resolve();
      };

      this._finishIntroNow = finish;

      this.introGuardTimer = setTimeout(() => {
        if (!startedPlayback && !done) finish();
      }, 4500);

      const startCountdownOncePlaying = () => {
        if (startedPlayback || done) return;
        startedPlayback = true;
        this.showBuffering(false);
        if (this.introGuardTimer) {
          clearTimeout(this.introGuardTimer);
          this.introGuardTimer = null;
        }
        const natDur = Number(this.video?.duration);
        if (Number.isFinite(natDur) && natDur > 1.5 && natDur <= 45) {
          remaining = Math.min(Math.ceil(natDur), Math.max(configuredDur, Math.ceil(natDur)));
        }
        if (this.introCountdown) this.introCountdown.textContent = `${remaining}s`;

        this.introTimer = setInterval(() => {
          remaining -= 1;
          if (this.introCountdown && remaining >= 0) {
            this.introCountdown.textContent = `${remaining}s`;
          }
          if (remaining <= 0) finish();
        }, 1000);
      };

      this.attachUniversalSource(welcomeUrl, {
        token,
        loop: false,
        isLive: false,
        onPlaying: startCountdownOncePlaying,
        onEnded: finish,
        onError: finish
      });
    });
  }

  async playProLockedStream(channel, token) {
    if (token !== this.playToken) return;
    if (this.proOverlay) this.proOverlay.hidden = false;
    this.setStatus("👑 PRO VIP UNLOCK • 0306-2015326", "pro");
    this.onStateChange("pro_locked", channel);

    const customProUrl = (
      channel.proUnlockVideoUrl ||
      this.settings.proUnlockVideoUrl ||
      "/media/pro-unlock/index.m3u8"
    ).trim();
    const isDirectVideo = /\.(mp4|m4v|webm|ogg|mov)(\?|$)/i.test(customProUrl);

    const streamToPlay = isDirectVideo
      ? customProUrl
      : `/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId || channel.id)}`;

    this.attachUniversalSource(streamToPlay, {
      token,
      loop: true,
      isLive: !isDirectVideo,
      onError: () => {
        if (token !== this.playToken) return;
        this.attachUniversalSource("/media/pro-unlock/index.m3u8", {
          token,
          loop: true,
          isLive: false
        });
      }
    });
  }

  /**
   * Play a server-sealed source list (already AES-256-GCM encrypted `/api/proxy?e=...` links).
   * Each entry is tried in order with a fast watchdog timer, ending on the Channel Offline standby.
   */
  async tryVaultedSources(sources, channel, token) {
    let idx = 0;
    const tryNext = async () => {
      if (token !== this.playToken) return;
      if (idx >= sources.length) {
        this.playOfflineStandby(channel, token);
        return;
      }
      const source = sources[idx++];
      this.setStatus(`CONNECTING (${source.label || "Secure HD"})...`, "loading");
      this.showBuffering(true, `Connecting ${source.label || "Secure HD"}...`);

      let settled = false;
      const timeoutMs = source.proto === "html5" ? 9000 : 11000;
      const failTimer = setTimeout(() => {
        if (!settled && token === this.playToken) {
          settled = true;
          tryNext();
        }
      }, timeoutMs);

      await this.attachUniversalSource(source.url, {
        token,
        loop: source.url.startsWith("/media/"),
        isLive: true,
        formatHint: source.proto,
        drmScheme: channel.drmScheme || "",
        drmKey: channel.drmKey || "",
        drmLicenseUrl: channel.drmLicenseUrl || "",
        onPlaying: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          this.showBuffering(false);
          this.setStatus(`● LIVE • ${source.label || "Secure HD"}`, "live");
          this.lastPlayedAt = Date.now();
          this.onStateChange("playing", channel);
        },
        onError: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          tryNext();
        }
      });
    };
    await tryNext();
  }

  async playLiveCandidates(channel, token) {
    // 1) Try the encrypted Stream Vault first (zero backend-link exposure in DevTools)
    if (this.sourceResolver) {
      try {
        this.setStatus("🔐 OPENING SECURE STREAM VAULT...", "loading");
        const vaulted = await this.sourceResolver(channel, {
          plan: this.userPlan,
          sid: this.sessionId || ""
        });
        if (token !== this.playToken) return;

        if (vaulted?.lockedPro) {
          await this.playProLockedStream(channel, token);
          return;
        }
        if (vaulted?.sources?.length) {
          if (vaulted.drm?.key) channel.drmKey = vaulted.drm.key;
          if (vaulted.drm?.licenseUrl) channel.drmLicenseUrl = vaulted.drm.licenseUrl;
          if (vaulted.drm?.scheme) channel.drmScheme = vaulted.drm.scheme;
          await this.tryVaultedSources(vaulted.sources, channel, token);
          return;
        }
      } catch {
        // Vault unreachable (offline dev / preview) -> transparently fall back to catalog candidates
      }
      if (token !== this.playToken) return;
    }

    const rawList = [channel.url, ...(channel.backupUrls || [])].filter(Boolean);
    const expanded = [];
    const isHttpsPage = typeof window !== "undefined" && window.location?.protocol === "https:";

    for (const rawSrc of rawList) {
      // `shielded://vault` placeholders only exist in the public bundle: swap them for the
      // zero-knowledge server route `/ch/:slug`, which 302-redirects to the sealed real stream.
      const src =
        rawSrc === "shielded://vault"
          ? `/ch/${encodeURIComponent(channel.slug || channel.id || channel.streamId || "")}`
          : rawSrc;
      if (!src || src === "/ch/") continue;
      const isRemote = /^https?:\/\//i.test(src);
      const isInsecureHttpOnHttps = isHttpsPage && /^http:\/\//i.test(src);
      const proto = detectStreamProtocol(
        src,
        rawSrc === channel.url || rawSrc === "shielded://vault" ? channel.streamFormat : "auto"
      );
      let hasCustomPort = false;
      if (isRemote) {
        try {
          const u = new URL(src);
          hasCustomPort = Boolean(u.port && u.port !== "80" && u.port !== "443");
        } catch {
          // ignore
        }
      }

      const refParam =
        channel.headers && channel.headers.Referer
          ? `&ref=${encodeURIComponent(channel.headers.Referer)}`
          : "";
      const segFlag = proto === "mpegts" || proto === "flv" || proto === "html5" ? "&seg=1" : "";
      const relayCandidate = isRemote
        ? {
            url: `/api/proxy?u=${encodeURIComponent(src)}${refParam}${segFlag}`,
            label: proto === "dash" ? "Relay DASH" : "Relay HD",
            formatHint: proto,
            timeoutMs: 9000
          }
        : null;
      const directCandidate = {
        url: src,
        label: proto === "dash" ? "DASH MPD" : proto === "mpegts" ? "MPEG-TS" : "Direct HD",
        formatHint: proto,
        timeoutMs: hasCustomPort ? 4500 : 7000
      };

      if (isInsecureHttpOnHttps && relayCandidate) {
        expanded.push(relayCandidate);
      } else if (hasCustomPort && relayCandidate) {
        expanded.push(directCandidate, relayCandidate);
      } else {
        expanded.push(directCandidate);
        if (relayCandidate) expanded.push(relayCandidate);
      }
    }

    let idx = 0;
    const tryNext = async () => {
      if (token !== this.playToken) return;
      if (idx >= expanded.length) {
        this.playOfflineStandby(channel, token);
        return;
      }
      const candidate = expanded[idx++];
      this.setStatus(`CONNECTING (${candidate.label})...`, "loading");
      this.showBuffering(true, `Connecting ${candidate.label}...`);

      let settled = false;
      const failTimer = setTimeout(() => {
        if (!settled && token === this.playToken) {
          settled = true;
          tryNext();
        }
      }, candidate.timeoutMs || 7000);

      await this.attachUniversalSource(candidate.url, {
        token,
        loop: candidate.url.startsWith("/media/"),
        isLive: true,
        formatHint: candidate.formatHint,
        drmScheme: channel.drmScheme || "",
        drmKey: channel.drmKey || "",
        drmLicenseUrl: channel.drmLicenseUrl || "",
        onPlaying: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          this.showBuffering(false);
          this.setStatus(`● LIVE • ${candidate.label}`, "live");
          this.onStateChange("playing", channel);
        },
        onError: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          tryNext();
        }
      });
    };

    await tryNext();
  }

  /**
   * Universal Multi-Protocol Media Attacher:
   * Automatically routes .mpd -> Shaka DASH (+ ClearKey/Widevine), .m3u8 -> hls.js / Safari,
   * .ts/.flv -> mpegts.js MSE, and .mp4/.mkv/.webm/audio -> HTML5 Progressive!
   */
  async attachUniversalSource(
    url,
    {
      token = this.playToken,
      loop = false,
      isLive = true,
      formatHint = "auto",
      drmScheme = "",
      drmKey = "",
      drmLicenseUrl = "",
      onPlaying,
      onEnded,
      onError
    } = {}
  ) {
    if (token !== this.playToken) return;
    this.destroyEngines();

    // Check inline ?ck=kid:key query param if drmKey wasn't explicitly passed
    let effectiveDrmKey = drmKey;
    try {
      const parsedU = new URL(url, window.location.origin);
      if (!effectiveDrmKey && parsedU.searchParams.get("ck")) {
        effectiveDrmKey = parsedU.searchParams.get("ck");
      }
    } catch {
      // ignore
    }

    const protocol = detectStreamProtocol(url, formatHint);
    const video = this.video;
    video.loop = Boolean(loop);
    video.playsInline = true;

    // ==================== ENGINE 1: MPEG-DASH (.MPD) + DRM (SHAKA PLAYER) ====================
    if (protocol === "dash") {
      this.activeEngine = "dash";
      this.setEngineBadge(effectiveDrmKey || drmLicenseUrl ? "DASH • MPD • DRM" : "DASH • MPD");

      const shakaReady = await ensureShakaPlayer();
      if (token !== this.playToken) return;
      if (!shakaReady) {
        if (onError) onError(new Error("DASH engine unavailable"));
        return;
      }

      try {
        const shakaPlayer = new window.shaka.Player();
        await shakaPlayer.attach(video);
        if (token !== this.playToken) {
          shakaPlayer.destroy().catch(() => {});
          return;
        }
        this.shaka = shakaPlayer;

        const drmConfig = {};
        const clearKeys = parseClearKeyConfig(effectiveDrmKey);
        if (clearKeys) {
          drmConfig.clearKeys = clearKeys;
        }
        if (drmLicenseUrl) {
          drmConfig.servers = {
            [drmScheme === "playready" ? "com.microsoft.playready" : "com.widevine.alpha"]:
              drmLicenseUrl
          };
        }

        shakaPlayer.configure({
          streaming: {
            bufferingGoal: isLive ? 14 : 24,
            rebufferingGoal: 2,
            lowLatencyMode: isLive,
            retryParameters: { maxAttempts: 2, timeout: 7000 }
          },
          ...(Object.keys(drmConfig).length ? { drm: drmConfig } : {})
        });

        shakaPlayer.addEventListener("error", (ev) => {
          const detail = ev?.detail;
          if (detail && detail.severity === 2 && onError) {
            onError(detail);
          }
        });

        video.onplaying = () => {
          this.populateShakaTracks(shakaPlayer);
          this.refreshResolutionBadge();
          if (onPlaying) onPlaying();
        };
        video.onended = () => {
          if (loop) {
            video.currentTime = 0;
            this.safePlay(video);
          } else if (onEnded) {
            onEnded();
          }
        };

        await shakaPlayer.load(url);
        if (token !== this.playToken) return;
        this.populateShakaTracks(shakaPlayer);
        this.safePlay(video);
        return;
      } catch (err) {
        if (onError) onError(err);
        return;
      }
    }

    // ==================== ENGINE 2: LIVE MPEG-TS (.TS / .M2TS) & HTTP-FLV (.FLV) ====================
    if (protocol === "mpegts" || protocol === "flv") {
      this.activeEngine = protocol;
      this.setEngineBadge(protocol === "flv" ? "HTTP-FLV • LIVE" : "MPEG-TS • LIVE");

      const mpegtsReady = await ensureMpegtsPlayer();
      if (token !== this.playToken) return;
      if (mpegtsReady) {
        try {
          const mts = window.mpegts.createPlayer(
            {
              type: protocol === "flv" ? "flv" : "mpegts",
              isLive: Boolean(isLive),
              url,
              cors: true
            },
            {
              enableWorker: true,
              enableStashBuffer: false,
              stashInitialSize: 128
            }
          );
          this.mpegtsPlayer = mts;
          mts.attachMediaElement(video);
          mts.on(window.mpegts.Events.ERROR, (errType, errDetail) => {
            if (onError) onError({ errType, errDetail });
          });
          video.onplaying = () => {
            this.refreshResolutionBadge();
            if (onPlaying) onPlaying();
          };
          video.onended = () => {
            if (onEnded) onEnded();
          };
          mts.load();
          this.safePlay(video);
          return;
        } catch (err) {
          if (onError) onError(err);
          return;
        }
      }
    }

    // ==================== ENGINE 3: APPLE HLS (.M3U8) VIA HLS.JS ====================
    if (protocol === "hls" && !(window.Hls && window.Hls.isSupported())) {
      // Lazy-load / recover the vendored HLS engine on demand (never blocks first paint)
      await ensureHlsLibrary();
      if (token !== this.playToken) return;
    }
    const HlsLib = window.Hls;
    if (protocol === "hls" && HlsLib && HlsLib.isSupported()) {
      this.activeEngine = "hls";
      this.setEngineBadge("HLS • AUTO");

      const hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: 30,
        maxBufferLength: 22,
        manifestLoadingTimeOut: 5500,
        manifestLoadingMaxRetry: 0,
        levelLoadingTimeOut: 6000,
        levelLoadingMaxRetry: 1,
        fragLoadingTimeOut: 8500
      });
      this.hls = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(HlsLib.Events.MANIFEST_PARSED, (_, data) => {
        this.populateQualityLevels(data.levels || []);
        this.safePlay(video);
      });

      hls.on(HlsLib.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        this.populateAudioTracks(data.audioTracks || []);
      });

      hls.on(HlsLib.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
        this.populateHlsSubtitles(data.subtitleTracks || []);
      });

      video.onplaying = () => {
        this.refreshResolutionBadge();
        if (onPlaying) onPlaying();
      };

      video.onended = () => {
        if (loop) {
          video.currentTime = 0;
          this.safePlay(video);
        } else if (onEnded) {
          onEnded();
        }
      };

      hls.on(HlsLib.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else if (onError) {
            onError(data);
          }
        }
      });
      return;
    }

    // ==================== ENGINE 4: NATIVE HLS (SAFARI / iOS) & PROGRESSIVE MP4/WEBM/MKV/AUDIO ====================
    this.activeEngine = protocol === "hls" ? "hls" : "html5";
    this.setEngineBadge(protocol === "hls" ? "HLS • NATIVE" : "MP4 / DIRECT");

    video.src = url;
    video.onloadedmetadata = () => this.safePlay(video);
    video.onplaying = () => {
      this.refreshResolutionBadge();
      if (onPlaying) onPlaying();
    };
    video.onended = () => {
      if (loop) {
        video.currentTime = 0;
        this.safePlay(video);
      } else if (onEnded) {
        onEnded();
      }
    };
    video.onerror = (e) => {
      if (onError) onError(e);
    };
  }

  // Alias kept for backwards compatibility
  attachSource(url, opts = {}) {
    return this.attachUniversalSource(url, opts);
  }

  safePlay(video) {
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }

  resetSelectors() {
    if (this.qualitySelect) {
      this.qualitySelect.innerHTML = `<option value="-1">Quality: Auto HD</option>`;
    }
    if (this.audioSelect) {
      this.audioSelect.innerHTML = `<option value="0">Audio: Default</option>`;
      this.audioSelect.hidden = true;
    }
    if (this.subtitleSelect) {
      this.subtitleSelect.innerHTML = `<option value="off">Subtitles: Off</option>`;
      this.subtitleSelect.hidden = true;
    }
  }

  populateQualityLevels(levels) {
    if (!this.qualitySelect) return;
    let html = `<option value="-1">Quality: Auto (${levels.length ? "Adaptive" : "HD"})</option>`;
    levels.forEach((lvl, idx) => {
      const h = lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 1500000) / 1000)}kbps`;
      html += `<option value="${idx}">${h}</option>`;
    });
    this.qualitySelect.innerHTML = html;
  }

  populateAudioTracks(tracks) {
    if (!this.audioSelect) return;
    if (!tracks || tracks.length <= 1) {
      this.audioSelect.hidden = true;
      return;
    }
    this.audioSelect.hidden = false;
    this.audioSelect.innerHTML = tracks
      .map((t, idx) => `<option value="${idx}">Audio: ${t.name || t.lang || `Track ${idx + 1}`}</option>`)
      .join("");
  }

  populateHlsSubtitles(tracks) {
    if (!this.subtitleSelect) return;
    if (!tracks || !tracks.length) {
      this.subtitleSelect.hidden = true;
      return;
    }
    this.subtitleSelect.hidden = false;
    this.subtitleSelect.innerHTML =
      `<option value="-1">CC: Off</option>` +
      tracks
        .map((t, idx) => `<option value="${idx}">CC: ${t.name || t.lang || `Sub ${idx + 1}`}</option>`)
        .join("");
  }

  populateShakaTracks(shakaPlayer) {
    if (!shakaPlayer) return;

    // 1. Resolution / Bitrate Variants for DASH .mpd
    if (this.qualitySelect) {
      const variants = shakaPlayer.getVariantTracks() || [];
      const seenHeights = new Map();
      for (const v of variants) {
        const key = v.height ? `${v.height}p` : `${Math.round((v.bandwidth || 1500000) / 1000)}kbps`;
        const prev = seenHeights.get(key);
        if (!prev || (v.bandwidth || 0) > (prev.bandwidth || 0)) {
          seenHeights.set(key, v);
        }
      }
      const sorted = [...seenHeights.entries()].sort(
        (a, b) => (b[1].height || b[1].bandwidth || 0) - (a[1].height || a[1].bandwidth || 0)
      );
      let html = `<option value="-1">Quality: Auto DASH (${sorted.length || 1} Levels)</option>`;
      for (const [label, track] of sorted) {
        const kbps = track.bandwidth ? ` • ${(track.bandwidth / 1_000_000).toFixed(1)} Mbps` : "";
        html += `<option value="${track.id}">${label}${kbps}</option>`;
      }
      this.qualitySelect.innerHTML = html;
    }

    // 2. Multi-Audio Languages for DASH .mpd
    if (this.audioSelect) {
      const langs = shakaPlayer.getAudioLanguagesAndRoles?.() || [];
      if (langs.length > 1) {
        this.audioSelect.hidden = false;
        this.audioSelect.innerHTML = langs
          .map((l) => `<option value="${l.language}">Audio: ${String(l.language || "und").toUpperCase()}</option>`)
          .join("");
      } else {
        this.audioSelect.hidden = true;
      }
    }

    // 3. Text / Subtitle Tracks for DASH .mpd
    if (this.subtitleSelect) {
      const textTracks = shakaPlayer.getTextTracks?.() || [];
      if (textTracks.length > 0) {
        this.subtitleSelect.hidden = false;
        const uniqueLangs = [...new Set(textTracks.map((t) => t.language).filter(Boolean))];
        this.subtitleSelect.innerHTML =
          `<option value="off">CC: Off</option>` +
          uniqueLangs.map((lang) => `<option value="${lang}">CC: ${lang.toUpperCase()}</option>`).join("");
      } else {
        this.subtitleSelect.hidden = true;
      }
    }
  }
}

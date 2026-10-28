/**
 * BarakatWave Live TV — Broadcast HLS / MP4 Player Engine v2.1
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Guarantees:
 *  1) Plays Admin's Welcome / Intro Video FIRST (supporting .m3u8, .m2ts/.ts, or .mp4),
 *     and the instant Intro ends, switches DIRECTLY to the Live Channel!
 *  2) PRO VIP Channels remain visible to Free/Guest users and play Admin's Premium Unlock Video
 *     continuously (0306-2015326) until upgraded to PRO VIP!
 *  3) Automatic Direct HD -> Same-Origin Relay Proxy -> Backup Server failover!
 */

export class BarakatPlayer {
  constructor({
    videoEl,
    statusEl,
    qualitySelectEl,
    audioSelectEl,
    introOverlayEl,
    introCountdownEl,
    skipIntroBtnEl,
    proOverlayEl,
    onStateChange
  }) {
    this.video = videoEl;
    this.statusEl = statusEl;
    this.qualitySelect = qualitySelectEl;
    this.audioSelect = audioSelectEl;
    this.introOverlay = introOverlayEl;
    this.introCountdown = introCountdownEl;
    this.skipIntroBtn = skipIntroBtnEl;
    this.proOverlay = proOverlayEl;
    this.onStateChange = onStateChange || (() => {});

    this.hls = null;
    this.currentChannel = null;
    this.settings = {};
    this.userPlan = "free";
    this.playToken = 0;
    this.introTimer = null;
    this.introGuardTimer = null;

    if (this.skipIntroBtn) {
      this.skipIntroBtn.addEventListener("click", () => {
        if (this._finishIntroNow) this._finishIntroNow();
      });
    }

    if (this.qualitySelect) {
      this.qualitySelect.addEventListener("change", () => {
        if (!this.hls) return;
        const val = parseInt(this.qualitySelect.value, 10);
        this.hls.currentLevel = Number.isNaN(val) ? -1 : val;
      });
    }

    if (this.audioSelect) {
      this.audioSelect.addEventListener("change", () => {
        if (!this.hls) return;
        const val = parseInt(this.audioSelect.value, 10);
        if (!Number.isNaN(val)) this.hls.audioTrack = val;
      });
    }
  }

  destroyHls() {
    if (this.introTimer) {
      clearInterval(this.introTimer);
      this.introTimer = null;
    }
    if (this.introGuardTimer) {
      clearTimeout(this.introGuardTimer);
      this.introGuardTimer = null;
    }
    this._finishIntroNow = null;
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // ignore
      }
      this.hls = null;
    }
    if (this.video) {
      this.video.onplaying = null;
      this.video.onended = null;
      this.video.onerror = null;
      this.video.onloadedmetadata = null;
      this.video.loop = false;
    }
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

    this.destroyHls();
    this.hideOverlays();
    this.resetSelectors();

    const isLockedPro = channel.tier === "pro" && this.userPlan !== "pro";

    // Case A: PRO VIP Channel opened by Free/Guest user -> Play Continuous Premium Unlock Video!
    if (isLockedPro) {
      await this.playProLockedStream(channel, token);
      return;
    }

    // Case B: Allowed Channel -> Step 1: Play Admin Intro Video first, Step 2: Switch directly to Live Channel!
    const welcomeUrl = (
      channel.introVideoUrl ||
      this.settings.welcomeVideoUrl ||
      "/media/welcome/index.m3u8"
    ).trim();
    const shouldPlayWelcome =
      !skipWelcome &&
      this.settings.welcomeVideoEnabled !== false &&
      Boolean(welcomeUrl);

    if (shouldPlayWelcome) {
      await this.playWelcomeBumper(welcomeUrl, token);
      if (token !== this.playToken) return;
    }

    await this.playLiveCandidates(channel, token);
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
        this.destroyHls();
        resolve();
      };
      this._finishIntroNow = finish;

      // Safety guard: if a custom remote intro takes > 4.5s to start buffering, jump straight to live channel!
      this.introGuardTimer = setTimeout(() => {
        if (!startedPlayback && !done) finish();
      }, 4500);

      const startCountdownOncePlaying = () => {
        if (startedPlayback || done) return;
        startedPlayback = true;
        if (this.introGuardTimer) {
          clearTimeout(this.introGuardTimer);
          this.introGuardTimer = null;
        }
        // Respect natural clip duration if shorter/known (up to configuredDur + 15s)
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

      this.attachSource(welcomeUrl, {
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
    this.onStateChange({ mode: "pro_locked", channel });

    const customProUrl = (
      channel.proUnlockVideoUrl ||
      this.settings.proUnlockVideoUrl ||
      "/media/pro-unlock/index.m3u8"
    ).trim();
    const isDirectVideo = /\.(mp4|m4v|webm|ogg|mov)(\?|$)/i.test(customProUrl);

    const streamToPlay = isDirectVideo
      ? customProUrl
      : `/api/stream?mode=pro_lock&id=${encodeURIComponent(channel.streamId || channel.id)}`;

    this.attachSource(streamToPlay, {
      loop: true,
      isLive: !isDirectVideo,
      onError: () => {
        if (token !== this.playToken) return;
        this.attachSource("/media/pro-unlock/index.m3u8", { loop: true, isLive: false });
      }
    });
  }

  async playLiveCandidates(channel, token) {
    const rawList = [channel.url, ...(channel.backupUrls || [])].filter(Boolean);
    const expanded = [];

    for (const src of rawList) {
      expanded.push({ url: src, label: "Direct HD" });
      if (/^https?:\/\//i.test(src)) {
        const refParam =
          channel.headers && channel.headers.Referer
            ? `&ref=${encodeURIComponent(channel.headers.Referer)}`
            : "";
        expanded.push({
          url: `/api/proxy?u=${encodeURIComponent(src)}${refParam}`,
          label: "Relay HD"
        });
      }
    }
    if (!expanded.some((x) => x.url.includes("/media/demo-live/"))) {
      expanded.push({ url: `/api/stream?mode=live&id=1001&nointro=1`, label: "Network Feed" });
    }

    let idx = 0;
    const tryNext = () => {
      if (token !== this.playToken) return;
      if (idx >= expanded.length) {
        this.setStatus("STREAM OFFLINE", "error");
        return;
      }
      const candidate = expanded[idx++];
      this.setStatus(`CONNECTING (${candidate.label})...`, "loading");

      let settled = false;
      const failTimer = setTimeout(() => {
        if (!settled && token === this.playToken) {
          settled = true;
          tryNext();
        }
      }, 9000);

      this.attachSource(candidate.url, {
        loop: candidate.url.startsWith("/media/"),
        isLive: true,
        onPlaying: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          this.setStatus(`● LIVE • ${candidate.label}`, "live");
          this.onStateChange({ mode: "playing", channel, source: candidate.label });
        },
        onError: () => {
          if (settled) return;
          settled = true;
          clearTimeout(failTimer);
          tryNext();
        }
      });
    };

    tryNext();
  }

  attachSource(url, { loop = false, isLive = true, onPlaying, onEnded, onError } = {}) {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // ignore
      }
      this.hls = null;
    }

    const video = this.video;
    video.loop = Boolean(loop);
    video.playsInline = true;

    const cleanPath = String(url || "").split("?")[0].toLowerCase();
    const isDirectVideoFile = /\.(mp4|m4v|webm|ogg|mov)$/.test(cleanPath);
    const HlsLib = window.Hls;

    if (!isDirectVideoFile && HlsLib && HlsLib.isSupported()) {
      const hls = new HlsLib({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: 30,
        maxBufferLength: 20,
        manifestLoadingTimeOut: 7000,
        levelLoadingTimeOut: 7000,
        fragLoadingTimeOut: 10000
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

      video.onplaying = () => {
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
          } else {
            if (onError) onError(data);
          }
        }
      });
      return;
    }

    // Native HLS (Safari / iOS) or Direct MP4/WebM
    video.src = url;
    video.onloadedmetadata = () => this.safePlay(video);
    video.onplaying = () => {
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
}

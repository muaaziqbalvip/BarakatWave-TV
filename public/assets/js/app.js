/**
 * BarakatWave Live TV — Main User Web App Controller
 * Under Mizanora Projects | Founded & Engineered by Muaaz Iqbal
 */

import {
  BRAND,
  CATEGORIES,
  VOD_CATEGORIES,
  SERIES_CATEGORIES,
  DEFAULT_SETTINGS,
  DEFAULT_CHANNELS,
  DEFAULT_MOVIES,
  DEFAULT_SERIES,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  DEFAULT_FAQS,
  THEMES,
  resolveCategoryMeta,
  getCategoryPriority
} from "./default-data.js";
import { fetchImdbTitle } from "./imdb-client.js";
import {
  subscribeAuth,
  loginWithGoogle,
  registerWithEmailPassword,
  loginWithEmailPassword,
  resetUserPassword,
  startPreviewSession,
  logoutUser,
  isSandboxPreviewHost,
  dbRead,
  dbWatch,
  dbWrite,
  dbMerge,
  dbPushItem
} from "./firebase-client.js";
import { BarakatPlayer } from "./player.js";
import { exportChannelsToM3u } from "./m3u-parser.js";
import { resolveChannelSources, sealCustomStreamUrl } from "./vault.js";
import {
  initAnalytics,
  trackPlay,
  trackStop,
  trackView,
  setTrackedUser,
  analyticsSession
} from "./analytics.js";
import { mountImdbCinemaPlayer, normalizeImdbId } from "./cinema-player.js";

const state = {
  user: null,
  userProfile: null,
  xtreamAccount: null,
  xtreamPassVisible: false,
  channels: [...DEFAULT_CHANNELS],
  movies: [...DEFAULT_MOVIES],
  series: [...DEFAULT_SERIES],
  baseCatalogMovies: [...DEFAULT_MOVIES],
  baseCatalogSeries: [...DEFAULT_SERIES],
  rtdbMoviesOverride: null,
  rtdbSeriesOverride: null,
  cinemaType: "all",
  cinemaCategory: "ALL",
  cinemaYear: "ALL",
  cinemaLimit: 60,
  cinemaQuery: "",
  settings: { ...DEFAULT_SETTINGS },
  blogs: [...DEFAULT_BLOGS],
  reviews: [...DEFAULT_REVIEWS],
  favorites: new Set(JSON.parse(localStorage.getItem("bw_favorites") || "[]")),
  watchlist: new Set(JSON.parse(localStorage.getItem("bw_watchlist") || "[]")),
  deferredInstallPrompt: null,
  activeSeriesItem: null,
  activeEpisodeIdx: 0,
  activeCategory: "ALL",
  searchQuery: "",
  viewerSort: "priority",
  wallMode: "grouped",
  currentChannel: null,
  playlist: {
    id: "",
    name: "My BarakatWave Favorites",
    channelIds: [],
    customStreams: []
  },
  authMode: "login"
};

let player = null;

function init() {
  renderThemeSwitcher();
  initAnalytics();
  bindHeaderScrollState();
  initPlayer();
  bindUniversalStreamLab();
  bindPwaInstaller();
  bind3dCardTiltEffects();
  bindNavigation();
  bindAuthModal();
  bindGuideControls();
  bindCinemaHub();
  bindXtreamActions();
  bindPlaylistStudio();
  bindReviewsAndSupport();
  renderFaqs();

  // Register PWA Service Worker safely
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Subscribe to Realtime Database live nodes
  dbWatch("settings/defaults", (val) => {
    if (val && typeof val === "object") {
      state.settings = { ...DEFAULT_SETTINGS, ...val };
      applyDynamicSiteSettings();
    }
  }, DEFAULT_SETTINGS);

  dbWatch("channels", (val) => {
    if (val && typeof val === "object") {
      const arr = Array.isArray(val)
        ? val.filter(Boolean)
        : Object.entries(val).map(([id, item]) => ({ id, ...item }));
      if (arr.length) {
        state.channels = arr
          .filter((c) => c.status !== "inactive")
          .map((c, idx) => {
            const meta = resolveCategoryMeta(c.category, c.name, c.country, false);
            const safe = shieldChannelForClient(c);
            return {
              ...safe,
              category: meta.name,
              categoryId: meta.id,
              order: typeof safe.order === "number" ? safe.order : idx + 1
            };
          })
          .sort((a, b) => {
            if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
            return (a.order ?? 9999) - (b.order ?? 9999);
          });
      }
    }
    renderCategoryChips();
    renderChannelGuide();
    renderChannelCards();
    renderPlaylistCatalogChecks();
    if (!state.currentChannel && state.channels.length) {
      selectInitialChannel();
    }
  }, null);

  dbWatch("blogs", (val) => {
    const map = new Map(DEFAULT_BLOGS.map((b) => [b.slug, b]));
    if (val && typeof val === "object") {
      Object.entries(val).forEach(([k, item]) => {
        if (item && item.title) map.set(item.slug || k, { ...item, slug: item.slug || k });
      });
    }
    state.blogs = [...map.values()];
    renderBlogsGrid();
  }, null);

  dbWatch("reviews", (val) => {
    if (val && typeof val === "object") {
      const arr = Object.entries(val)
        .map(([id, r]) => ({ id, ...r }))
        .filter((r) => r && r.comment)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      if (arr.length) state.reviews = arr;
    }
    renderReviews();
  }, null);

  dbWatch("movies", (val) => {
    state.rtdbMoviesOverride = val && typeof val === "object" ? val : null;
    recomputeMergedCinemaState();
    renderCinemaHub();
  }, null);

  dbWatch("series", (val) => {
    state.rtdbSeriesOverride = val && typeof val === "object" ? val : null;
    recomputeMergedCinemaState();
    renderCinemaHub();
  }, null);

  // Hydrate full 1,570+ (2000–2026) IMDb Movies & Series catalog asynchronously (gzipped, non-blocking!)
  hydrateFullImdbCatalog();

  // Initial immediate render using built-in curated data (0ms first meaningful UI)
  renderCategoryChips();
  renderChannelGuide();
  renderChannelCards();
  renderCinemaHub();
  renderPlaylistCatalogChecks();
  renderBlogsGrid();
  renderReviews();
  selectInitialChannel();

  // Handle URL hash or query param routing
  handleInitialUrlRouting();

  // Auth subscription
  subscribeAuth(async (user) => {
    state.user = user;
    await onUserChanged(user);
  });
}

/**
 * Stream Shield (client-side): strips every real upstream playback URL from a channel
 * record before it ever reaches DOM, JS state, DevTools Network or the Elements tab.
 * Remote sources become `shielded://vault` (resolved server-side by /api/gate).
 */
function shieldChannelForClient(channel) {
  if (!channel || typeof channel !== "object") return channel;
  const isLocal = (u) => typeof u === "string" && (u.startsWith("/") || u.startsWith("shielded://"));
  return {
    ...channel,
    url: isLocal(channel.url) && channel.url !== "shielded://vault"
      ? channel.url
      : channel.url
        ? "shielded://vault"
        : "",
    backupUrls: Array.isArray(channel.backupUrls)
      ? channel.backupUrls.filter((u) => isLocal(u) && u !== "shielded://vault")
      : [],
    // DRM keys & custom headers are injected only by the server vault at play time
    drmKey: "",
    drmLicenseUrl: "",
    headers: undefined
  };
}

/* ==================== THEME ENGINE ==================== */
function renderThemeSwitcher() {
  const wrap = document.getElementById("themeSwitcher");
  if (!wrap) return;

  const paint = () => {
    const activeTheme = document.documentElement.getAttribute("data-theme") || "daylight";
    const curObj = THEMES.find((t) => t.id === activeTheme) || THEMES[0];
    const isLight = curObj.mode === "light";
    wrap.innerHTML =
      `<button type="button" class="theme-mode-btn" data-toggle-mode="1" title="Switch Light / Dark Mode">${
        isLight ? "☀️ Light" : "🌙 Dark"
      }</button>` +
      THEMES.map(
        (t) =>
          `<button type="button" class="theme-dot ${t.id === activeTheme ? "active" : ""}" data-theme-id="${t.id}" style="background:${t.swatch}" title="${t.name} — ${t.desc}" aria-label="${t.name}"></button>`
      ).join("");
  };

  paint();

  wrap.addEventListener("click", (e) => {
    if (e.target.closest("[data-toggle-mode]")) {
      const cur = document.documentElement.getAttribute("data-theme") || "daylight";
      const curObj = THEMES.find((t) => t.id === cur) || THEMES[0];
      const nextId = curObj.mode === "light" ? "barakat" : "daylight";
      document.documentElement.setAttribute("data-theme", nextId);
      localStorage.setItem("bw_theme", nextId);
      paint();
      showToast(`Switched to ${THEMES.find((x) => x.id === nextId)?.name || nextId}`);
      return;
    }
    const btn = e.target.closest("[data-theme-id]");
    if (!btn) return;
    const id = btn.dataset.themeId;
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("bw_theme", id);
    paint();
    showToast(`Theme: ${THEMES.find((x) => x.id === id)?.name || id}`);
  });
}

function applyDynamicSiteSettings() {
  // Live ticker text (keeps both marquee copies in sync)
  const seqs = document.querySelectorAll("#siteTicker .ticker-seq");
  if (seqs.length && state.settings.siteAnnouncement) {
    const text = `🌊 ${state.settings.siteAnnouncement}`;
    seqs.forEach((seq) => {
      seq.innerHTML = `<span>${escHtml(text)}</span><span class="ticker-dot">•</span><span>PRO VIP WhatsApp: <strong>0306-2015326</strong></span><span class="ticker-dot">•</span><span>🎬 IMDb Movies &amp; Series 2000–2026</span>`;
    });
  }

  // Search Console / Bing verification meta tags from admin settings (instant indexing)
  const gsc = String(state.settings.gscVerification || "").trim();
  if (gsc && !document.querySelector('meta[name="google-site-verification"]')) {
    const m = document.createElement("meta");
    m.name = "google-site-verification";
    m.content = gsc.replace(/^<meta[^>]*content=["']([^"']+)["'][^>]*>$/i, "$1").replace(/^content=["']?|["']$/g, "");
    document.head.appendChild(m);
  }
  const bing = String(state.settings.bingVerification || "").trim();
  if (bing && !document.querySelector('meta[name="msvalidate.01"]')) {
    const m = document.createElement("meta");
    m.name = "msvalidate.01";
    m.content = bing;
    document.head.appendChild(m);
  }
}

/* Compact sticky header: add depth shadow after scrolling (no layout shift) */
function bindHeaderScrollState() {
  const header = document.getElementById("siteHeader");
  if (!header) return;
  let ticking = false;
  const apply = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    },
    { passive: true }
  );
  apply();
}

/* ==================== BROADCAST PLAYER ==================== */
function initPlayer() {
  player = new BarakatPlayer({
    videoEl: document.getElementById("liveVideo"),
    stageEl: document.getElementById("playerStage"),
    statusEl: document.getElementById("playerStatusPill"),
    codecBadgeEl: document.getElementById("playerCodecPill"),
    qualitySelectEl: document.getElementById("qualitySelect"),
    audioSelectEl: document.getElementById("audioSelect"),
    subtitleSelectEl: document.getElementById("subtitleSelect"),
    introOverlayEl: document.getElementById("introOverlay"),
    introCountdownEl: document.getElementById("introCountdown"),
    skipIntroBtnEl: document.getElementById("skipIntroBtn"),
    proOverlayEl: document.getElementById("proUnlockOverlay"),
    onStepChannel: (delta) => stepChannel(delta),
    sourceResolver: (channel, opts) =>
      resolveChannelSources(channel, {
        plan: getEffectiveUserPlan(),
        sid: analyticsSession.sessionId,
        userEmail: state.user?.email || ""
      }),
    onStateChange: (mode, item) => {
      if (mode === "playing" && item) {
        trackPlay({
          title: item.name || item.title || "Live Channel",
          itemId: item.id || "",
          contentType: "Live TV",
          category: item.category || "",
          engine: player?.activeEngine ? String(player.activeEngine).toUpperCase() : "HLS",
          surface: "Web 3D Studio"
        });
      } else if (mode === "vod_playing" && item) {
        trackPlay({
          title: item.title || item.name || "Cinema",
          itemId: item.id || "",
          imdbId: item.imdbId || "",
          contentType: Array.isArray(item.episodes) ? "Series" : "Movie",
          category: item.category || "IMDb Cinema",
          engine: player?.activeEngine ? String(player.activeEngine).toUpperCase() : "MP4",
          surface: "Web Cinema Player"
        });
      }

      const subEl = document.getElementById("nowPlayingSub");
      if (!subEl) return;
      if (mode === "offline_standby") {
        subEl.textContent = `📡 ${item?.name || "Channel"} • Signal Restoring — Broadcast Standby Active`;
      } else if (mode === "coming_soon") {
        subEl.textContent = `🎬 ${item?.title || item?.name || "Cinema VOD"} • Service Is Building — Coming Soon!`;
        if (item) {
          trackPlay({
            title: item.title || item.name || "Cinema",
            itemId: item.id || "",
            imdbId: item.imdbId || "",
            contentType: "Cinema Broadcast",
            engine: "COMING-SOON",
            surface: "Web Cinema Player"
          });
        }
      }
    }
  });

  document.getElementById("prevChBtn")?.addEventListener("click", () => stepChannel(-1));
  document.getElementById("nextChBtn")?.addEventListener("click", () => stepChannel(1));

  document.getElementById("pipBtn")?.addEventListener("click", async () => {
    const v = document.getElementById("liveVideo");
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {
      showToast("Picture-in-Picture is ready once video is playing");
    }
  });

  document.getElementById("theaterBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("theater-mode");
  });

  document.getElementById("shareChBtn")?.addEventListener("click", () => {
    if (!state.currentChannel) return;
    const url = `${window.location.origin}/?channel=${encodeURIComponent(state.currentChannel.slug)}`;
    copyText(url, `Channel link copied: ${state.currentChannel.name}`);
  });

  document.getElementById("copyProPhoneBtn")?.addEventListener("click", () => {
    copyText(BRAND.proPhoneLocal, `PRO VIP Number copied: ${BRAND.proPhoneDisplay}`);
  });
}

function selectInitialChannel() {
  const params = new URLSearchParams(window.location.search);
  const qSlug = params.get("channel");
  const qSearch = params.get("q");
  if (qSearch) {
    state.searchQuery = qSearch;
    const inp = document.getElementById("channelSearchInput");
    if (inp) inp.value = qSearch;
    renderChannelGuide();
    renderChannelCards();
  }
  const target =
    (qSlug && state.channels.find((c) => c.slug === qSlug || String(c.streamId) === qSlug)) ||
    state.channels[0];
  if (target) playChannel(target, { skipWelcome: false });
}

function playChannel(channel, { skipWelcome = false } = {}) {
  trackStop();
  state.currentChannel = channel;
  state.activeSeriesItem = null;
  const epTray = document.getElementById("activeSeriesEpisodeTray");
  if (epTray) epTray.hidden = true;

  const logoEl = document.getElementById("nowPlayingLogo");
  const titleEl = document.getElementById("nowPlayingTitle");
  const subEl = document.getElementById("nowPlayingSub");
  const tierEl = document.getElementById("nowPlayingTier");

  if (logoEl) logoEl.src = channel.logo || BRAND.logoPrimary;
  if (titleEl) titleEl.textContent = channel.name;
  if (subEl) subEl.textContent = `${channel.category} • ${channel.nowPlaying || "Live Broadcast"}`;
  if (tierEl) {
    tierEl.className = channel.tier === "pro" ? "badge badge-gold" : "badge badge-free";
    tierEl.textContent = channel.tier === "pro" ? "👑 PRO VIP" : "FREE HD";
  }

  const waBtn = document.getElementById("proOverlayWhatsappBtn");
  if (waBtn) {
    const xtInfo = state.xtreamAccount ? ` (My Xtream Username: ${state.xtreamAccount.username})` : "";
    waBtn.href = `https://wa.me/923062015326?text=${encodeURIComponent(
      `Assalam o Alaikum! I want to unlock "${channel.name}" & BarakatWave TV PRO VIP${xtInfo}.`
    )}`;
  }

  const effectivePlan = getEffectiveUserPlan();
  player.loadChannel(channel, {
    settings: state.settings,
    userPlan: effectivePlan,
    skipWelcome
  });

  renderChannelGuide();
}

function stepChannel(delta) {
  const list = getFilteredChannels();
  if (!list.length) return;
  const idx = list.findIndex((c) => c.id === state.currentChannel?.id);
  const next = list[(idx + delta + list.length) % list.length];
  if (next) playChannel(next);
}

function getEffectiveUserPlan() {
  if (state.xtreamAccount && String(state.xtreamAccount.plan).toLowerCase() === "pro") return "pro";
  if (state.userProfile && String(state.userProfile.plan).toLowerCase() === "pro") return "pro";
  return "free";
}

/* ==================== NAVIGATION ==================== */
function bindNavigation() {
  document.querySelectorAll(".nav-tab[data-view], .mob-nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.jump));
  });
}

function switchView(viewName) {
  const valid = ["live", "cinema", "xtream", "playlist", "pro", "blogs", "support"];
  const target = valid.includes(viewName) ? viewName : "live";
  trackView(target);
  valid.forEach((v) => {
    const sec = document.getElementById(`view-${v}`);
    if (sec) sec.hidden = v !== target;
  });
  document.querySelectorAll(".nav-tab[data-view], .mob-nav-btn[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === target);
  });
  if (target !== "live") {
    window.location.hash = target;
  } else if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleInitialUrlRouting() {
  // Support #cinema, ?view=cinema (PWA shortcuts & sitemap deep links) and ?channel=slug
  const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  const qView = (new URLSearchParams(window.location.search).get("view") || "").toLowerCase();
  const wants = qView || hash;
  if (["cinema", "xtream", "playlist", "pro", "blogs", "support"].includes(wants)) {
    switchView(wants);
  }
}

/* ==================== CHANNEL GUIDE & FILTERING ==================== */
function bindGuideControls() {
  const searchInp = document.getElementById("channelSearchInput");
  searchInp?.addEventListener("input", () => {
    state.searchQuery = searchInp.value.trim();
    renderChannelGuide();
    renderChannelCards();
  });

  const sortSel = document.getElementById("viewerSortSelect");
  sortSel?.addEventListener("change", () => {
    state.viewerSort = sortSel.value || "priority";
    renderChannelGuide();
    renderChannelCards();
  });

  const grpBtn = document.getElementById("wallGroupedBtn");
  const flatBtn = document.getElementById("wallFlatBtn");
  grpBtn?.addEventListener("click", () => {
    state.wallMode = "grouped";
    grpBtn.className = "btn btn-sm btn-primary";
    if (flatBtn) flatBtn.className = "btn btn-sm btn-outline";
    renderChannelCards();
  });
  flatBtn?.addEventListener("click", () => {
    state.wallMode = "flat";
    flatBtn.className = "btn btn-sm btn-primary";
    if (grpBtn) grpBtn.className = "btn btn-sm btn-outline";
    renderChannelCards();
  });
}

function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  if (!wrap) return;
  const uniqueCats = [...new Set(state.channels.map((c) => c.category).filter(Boolean))].sort(
    (a, b) => getCategoryPriority(a) - getCategoryPriority(b)
  );
  const chips = [
    { key: "ALL", label: "🌐 All" },
    ...uniqueCats.map((c) => {
      const meta = CATEGORIES.find((m) => m.name === c);
      return { key: `CAT:${c}`, label: meta ? meta.shortLabel : c };
    }),
    { key: "FREE", label: "🟢 Free HD" },
    { key: "PRO", label: "👑 PRO VIP" },
    { key: "FAV", label: "★ Favorites" },
    { key: "MY_PL", label: "📋 My Playlist" }
  ];

  wrap.innerHTML = chips
    .map(
      (c) =>
        `<button type="button" class="chip ${state.activeCategory === c.key ? "active" : ""}" data-cat-key="${escAttr(c.key)}">${escHtml(c.label)}</button>`
    )
    .join("");

  wrap.querySelectorAll("[data-cat-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategory = btn.dataset.catKey;
      renderCategoryChips();
      renderChannelGuide();
      renderChannelCards();
    });
  });
}

function getFilteredChannels() {
  let list = [...state.channels];

  if (state.activeCategory === "FREE") {
    list = list.filter((c) => c.tier !== "pro");
  } else if (state.activeCategory === "PRO") {
    list = list.filter((c) => c.tier === "pro");
  } else if (state.activeCategory === "FAV") {
    list = list.filter((c) => state.favorites.has(c.id));
  } else if (state.activeCategory === "MY_PL") {
    const set = new Set(state.playlist.channelIds || []);
    const customMapped = (state.playlist.customStreams || []).map((cs, i) => ({
      id: `custom_${i}`,
      slug: `custom-${i}`,
      name: cs.name || `Custom Stream ${i + 1}`,
      category: cs.category || "📺 ✨ My Custom Channels",
      tier: "free",
      logo: BRAND.logoPrimary,
      url: cs.url,
      nowPlaying: "Personal Custom M3U8 Stream",
      order: 900 + i
    }));
    list = [...list.filter((c) => set.has(c.id)), ...customMapped];
  } else if (state.activeCategory.startsWith("CAT:")) {
    const cat = state.activeCategory.slice(4);
    list = list.filter((c) => c.category === cat);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.category || "").toLowerCase().includes(q) ||
        String(c.country || "").toLowerCase().includes(q) ||
        String(c.language || "").toLowerCase().includes(q) ||
        String(c.streamId || "").includes(q)
    );
  }

  // Apply Viewer Sort Mode
  list.sort((a, b) => {
    if (state.viewerSort === "az") {
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (state.viewerSort === "free_first") {
      if ((a.tier === "pro") !== (b.tier === "pro")) return a.tier === "pro" ? 1 : -1;
    } else if (state.viewerSort === "pro_first") {
      if ((a.tier === "pro") !== (b.tier === "pro")) return a.tier === "pro" ? -1 : 1;
    } else if (state.viewerSort === "order") {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return (a.order ?? 9999) - (b.order ?? 9999);
    }
    // Default "priority": Pinned -> Admin Order / Category Priority (PK Top -> Islamic -> Drama -> News -> Movies -> Others)
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const pa = getCategoryPriority(a.category, a.categoryId);
    const pb = getCategoryPriority(b.category, b.categoryId);
    const oa = typeof a.order === "number" ? a.order : 9999;
    const ob = typeof b.order === "number" ? b.order : 9999;
    if (state.viewerSort === "priority" && oa === ob && pa !== pb) return pa - pb;
    if (oa !== ob) return oa - ob;
    if (pa !== pb) return pa - pb;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return list;
}

function renderChannelGuide() {
  const listEl = document.getElementById("channelList");
  const countEl = document.getElementById("channelCountLabel");
  if (!listEl) return;

  const filtered = getFilteredChannels();
  if (countEl) countEl.textContent = `${filtered.length} Channels`;

  const freeTotal = state.channels.filter((c) => c.tier !== "pro").length;
  const proTotal = state.channels.filter((c) => c.tier === "pro").length;
  const freeBadge = document.getElementById("heroFreeCountBadge");
  const proBadge = document.getElementById("heroProCountBadge");
  if (freeBadge) freeBadge.textContent = `🟢 ${freeTotal} FREE HD`;
  if (proBadge) proBadge.textContent = `👑 ${proTotal} PRO VIP`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="muted-sm" style="padding:20px;text-align:center;">No channels match this filter. Try clicking "All".</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((ch, idx) => {
      const isActive = state.currentChannel?.id === ch.id;
      const isFav = state.favorites.has(ch.id);
      const rankNum = ch.order || idx + 1;
      const badge =
        ch.tier === "pro"
          ? `<span class="badge badge-gold">👑 PRO</span>`
          : `<span class="badge badge-free">FREE</span>`;
      return `
        <div class="channel-item ${isActive ? "active" : ""}" data-play-id="${escAttr(ch.id)}">
          <span class="ch-rank-pill">${ch.pinned ? "📌" : `#${rankNum}`}</span>
          <img src="${escAttr(ch.logo || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" alt="" />
          <div class="channel-item-info">
            <div class="channel-item-name">${escHtml(ch.name)}</div>
            <div class="channel-item-cat">${escHtml(ch.category)} &bull; ${escHtml(ch.country || "HD")}</div>
          </div>
          ${badge}
          <button type="button" class="fav-btn ${isFav ? "starred" : ""}" data-fav-id="${escAttr(ch.id)}" title="Favorite">★</button>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-play-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-fav-id]")) return;
      const id = row.dataset.playId;
      const found = filtered.find((c) => c.id === id) || state.channels.find((c) => c.id === id);
      if (found) playChannel(found);
    });
  });

  listEl.querySelectorAll("[data-fav-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favId);
    });
  });
}

function renderChannelCards() {
  const grid = document.getElementById("channelCardsGrid");
  if (!grid) return;
  const filtered = getFilteredChannels();

  const renderCardHtml = (ch) => {
    const badge =
      ch.tier === "pro"
        ? `<span class="badge badge-gold">👑 PRO VIP</span>`
        : `<span class="badge badge-free">🟢 FREE HD</span>`;
    return `
      <div class="ch-card glass-card" data-card-play="${escAttr(ch.id)}">
        <div class="ch-card-top">
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="${escAttr(ch.logo || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" alt="${escAttr(ch.name)}" />
            <span class="ch-rank-pill">${ch.pinned ? "📌 #1" : `#${ch.order || 1}`}</span>
          </div>
          ${badge}
        </div>
        <div>
          <div style="font-weight:800;font-size:0.94rem;">${escHtml(ch.name)}</div>
          <div class="muted-sm">${escHtml(ch.category)} &bull; ${escHtml(ch.language || "HD")}</div>
        </div>
        <div class="muted-sm" style="font-size:0.76rem;margin-top:auto;color:var(--primary);font-weight:700;">▶ Click to Watch Live</div>
      </div>
    `;
  };

  if (!filtered.length) {
    grid.className = "";
    grid.innerHTML = `<div class="glass-card" style="padding:24px;text-align:center;">No channels match this filter.</div>`;
    return;
  }

  if (state.wallMode === "grouped" && state.activeCategory === "ALL" && !state.searchQuery) {
    const groupMap = new Map();
    for (const ch of filtered) {
      const g = ch.category || "🌍 📡 World & International TV";
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(ch);
    }
    const orderedGroups = [...groupMap.entries()].sort(
      (a, b) => getCategoryPriority(a[0]) - getCategoryPriority(b[0])
    );

    grid.className = "group-sections-stack";
    grid.innerHTML = orderedGroups
      .map(
        ([grpName, items], gIdx) => `
        <div class="group-section-block">
          <div class="group-section-header">
            <h3 class="group-section-title">
              <span class="badge badge-cyan">#${gIdx + 1}</span>
              <span>${escHtml(grpName)}</span>
            </h3>
            <span class="badge badge-gold">${items.length} ${items.length === 1 ? "Channel" : "Channels"}</span>
          </div>
          <div class="channel-cards-grid">
            ${items.map(renderCardHtml).join("")}
          </div>
        </div>`
      )
      .join("");
  } else {
    grid.className = "channel-cards-grid";
    grid.innerHTML = filtered.map(renderCardHtml).join("");
  }

  grid.querySelectorAll("[data-card-play]").forEach((card) => {
    card.addEventListener("click", () => {
      const ch = filtered.find((c) => c.id === card.dataset.cardPlay) || state.channels.find((c) => c.id === card.dataset.cardPlay);
      if (ch) {
        playChannel(ch);
        document.getElementById("playerStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });
}

function toggleFavorite(chId) {
  if (state.favorites.has(chId)) {
    state.favorites.delete(chId);
  } else {
    state.favorites.add(chId);
  }
  const arr = [...state.favorites];
  localStorage.setItem("bw_favorites", JSON.stringify(arr));
  if (state.user) {
    dbMerge(`users/${state.user.uid}`, { favorites: arr });
  }
  renderChannelGuide();
}

/* ==================== AUTHENTICATION (GOOGLE + GMAIL/PASSWORD) ==================== */
function bindAuthModal() {
  const modal = document.getElementById("authModal");
  const openBtn = document.getElementById("openAuthBtn");
  const closeBtn = document.getElementById("closeAuthModalBtn");
  const xtPromptBtn = document.getElementById("xtreamLoginPromptBtn");
  const googleBtn = document.getElementById("googleSignInBtn");
  const form = document.getElementById("emailAuthForm");
  const previewBox = document.getElementById("previewQuickLoginBox");
  const previewBtn = document.getElementById("previewQuickLoginBtn");

  if (isSandboxPreviewHost() && previewBox) {
    previewBox.hidden = false;
  }

  const openModal = () => {
    if (modal) modal.hidden = false;
  };
  const closeModal = () => {
    if (modal) modal.hidden = true;
    setAuthError("");
  };

  openBtn?.addEventListener("click", openModal);
  xtPromptBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.querySelectorAll("[data-auth-mode]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.authMode = tab.dataset.authMode;
      document.querySelectorAll("[data-auth-mode]").forEach((t) =>
        t.classList.toggle("active", t.dataset.authMode === state.authMode)
      );
      const nameGrp = document.getElementById("authNameGroup");
      const passGrp = document.getElementById("authPassGroup");
      const passInp = document.getElementById("authPassInput");
      const submitBtn = document.getElementById("emailAuthSubmitBtn");

      if (nameGrp) nameGrp.hidden = state.authMode !== "register";
      if (passGrp) passGrp.hidden = state.authMode === "reset";
      if (passInp) passInp.required = state.authMode !== "reset";
      if (submitBtn) {
        submitBtn.textContent =
          state.authMode === "register"
            ? "Create My BarakatWave Account"
            : state.authMode === "reset"
            ? "Send Password Reset Link"
            : "Sign In with Email";
      }
      setAuthError("");
    });
  });

  googleBtn?.addEventListener("click", async () => {
    setAuthError("");
    googleBtn.disabled = true;
    const res = await loginWithGoogle();
    googleBtn.disabled = false;
    if (res.ok) {
      if (!res.redirecting) {
        closeModal();
        showToast("Signed in with Google! Welcome to BarakatWave TV");
      }
    } else {
      setAuthError(res.error);
      if (res.code === "auth/unauthorized-domain" && previewBox) {
        previewBox.hidden = false;
      }
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthError("");
    const name = document.getElementById("authNameInput")?.value || "";
    const email = document.getElementById("authEmailInput")?.value || "";
    const pass = document.getElementById("authPassInput")?.value || "";
    const btn = document.getElementById("emailAuthSubmitBtn");
    if (btn) btn.disabled = true;

    let res;
    if (state.authMode === "register") {
      res = await registerWithEmailPassword(name, email, pass);
    } else if (state.authMode === "reset") {
      res = await resetUserPassword(email);
      if (btn) btn.disabled = false;
      if (res.ok) {
        showToast("Password reset email sent! Check your Gmail inbox.");
      } else {
        setAuthError(res.error);
      }
      return;
    } else {
      res = await loginWithEmailPassword(email, pass);
    }

    if (btn) btn.disabled = false;
    if (res.ok) {
      closeModal();
      showToast("Welcome to BarakatWave Live TV!");
    } else {
      setAuthError(res.error);
    }
  });

  previewBtn?.addEventListener("click", async () => {
    const emailVal = document.getElementById("authEmailInput")?.value.trim() || "viewer@barakatwave.tv";
    const nameVal = document.getElementById("authNameInput")?.value.trim() || emailVal.split("@")[0];
    await startPreviewSession({ name: nameVal, email: emailVal });
    closeModal();
    showToast(`Signed in as ${nameVal}! Your Xtream & Playlist tools are ready.`);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await logoutUser();
    showToast("Signed out safely");
  });

  document.getElementById("userAccountBtn")?.addEventListener("click", () => {
    switchView("xtream");
  });
}

function setAuthError(msg) {
  const el = document.getElementById("authErrorMsg");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function onUserChanged(user) {
  const openBtn = document.getElementById("openAuthBtn");
  const chipWrap = document.getElementById("userChipWrap");
  const acctBtn = document.getElementById("userAccountBtn");
  const planBadge = document.getElementById("userPlanBadge");
  const revName = document.getElementById("revNameInput");

  if (!user) {
    state.userProfile = null;
    state.xtreamAccount = null;
    if (openBtn) openBtn.hidden = false;
    if (chipWrap) chipWrap.hidden = true;
    setTrackedUser(null, null);
    renderXtreamPanelState();
    renderUserTickets();
    return;
  }

  if (openBtn) openBtn.hidden = true;
  if (chipWrap) chipWrap.hidden = false;
  if (acctBtn) acctBtn.textContent = user.displayName || user.email || "My Account";
  if (revName && !revName.value) revName.value = user.displayName || user.email?.split("@")[0] || "";

  // Load user profile + existing 1-time Xtream Server + Personal Playlist from Firebase RTDB
  const profile = (await dbRead(`users/${user.uid}`, null)) || {};
  state.userProfile = profile;
  setTrackedUser(user, profile);

  if (Array.isArray(profile.favorites) && profile.favorites.length) {
    profile.favorites.forEach((f) => state.favorites.add(f));
  }

  if (profile.xtreamUsername) {
    const xt = await dbRead(`xtreamAccounts/${profile.xtreamUsername}`, null);
    if (xt && xt.username) {
      state.xtreamAccount = xt;
    }
  }

  if (profile.playlistId) {
    const pl = await dbRead(`playlists/${profile.playlistId}`, null);
    if (pl && typeof pl === "object") {
      state.playlist = {
        id: profile.playlistId,
        name: pl.name || "My BarakatWave Playlist",
        channelIds: Array.isArray(pl.channelIds) ? pl.channelIds : [],
        customStreams: Array.isArray(pl.customStreams) ? pl.customStreams : []
      };
    }
  }

  const effectivePlan = getEffectiveUserPlan();
  if (planBadge) {
    planBadge.className = effectivePlan === "pro" ? "badge badge-gold" : "badge badge-cyan";
    planBadge.textContent = effectivePlan === "pro" ? "👑 PRO VIP" : "FREE";
  }

  renderXtreamPanelState();
  renderPlaylistCatalogChecks();
  renderCustomStreamsList();
  updatePlaylistPreview();
  renderUserTickets();

  // If currently viewing a locked PRO channel and user IS PRO, immediately unlock live playback!
  if (state.currentChannel?.tier === "pro" && effectivePlan === "pro") {
    playChannel(state.currentChannel, { skipWelcome: true });
  }
}

/* ==================== 1-TIME FREE XTREAM SERVER GENERATOR ==================== */
function bindXtreamActions() {
  document.getElementById("claimXtreamBtn")?.addEventListener("click", claimOneTimeFreeXtreamServer);

  document.getElementById("toggleXtPassBtn")?.addEventListener("click", () => {
    state.xtreamPassVisible = !state.xtreamPassVisible;
    renderXtreamPanelState();
  });

  document.getElementById("testXtreamApiBtn")?.addEventListener("click", testLiveXtreamEndpoint);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy-target]");
    if (!btn) return;
    const targetId = btn.dataset.copyTarget;
    if (targetId === "xtPassVal" && state.xtreamAccount) {
      copyText(state.xtreamAccount.password, "Xtream Password copied!");
      return;
    }
    const el = document.getElementById(targetId);
    if (el) copyText(el.textContent.trim(), "Copied to clipboard!");
  });
}

async function claimOneTimeFreeXtreamServer() {
  if (!state.user) {
    document.getElementById("authModal").hidden = false;
    return;
  }

  // Enforce 1 Free Xtream Server per User Account ("APNI IK BAR BNA SKE")
  const freshProfile = await dbRead(`users/${state.user.uid}`, null);
  if (freshProfile?.xtreamUsername) {
    const existingXt = await dbRead(`xtreamAccounts/${freshProfile.xtreamUsername}`, null);
    if (existingXt) {
      state.xtreamAccount = existingXt;
      renderXtreamPanelState();
      showToast("Your personal Xtream Server is already active!");
      return;
    }
  }

  const btn = document.getElementById("claimXtreamBtn");
  if (btn) btn.disabled = true;

  const baseSlug = String(state.user.displayName || state.user.email?.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "viewer";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const username = `bw_${baseSlug}${suffix}`;
  const password = generateCleanPassword(10);
  const isOwner = String(state.user.email || "").toLowerCase() === BRAND.ownerEmail;
  const plan = isOwner || state.userProfile?.plan === "pro" ? "pro" : "free";

  const xtRecord = {
    username,
    password,
    uid: state.user.uid,
    email: state.user.email || "",
    displayName: state.user.displayName || baseSlug,
    plan,
    status: "Active",
    maxConnections: plan === "pro" ? 5 : 1,
    createdAt: new Date().toISOString(),
    expDate: null
  };

  await dbWrite(`xtreamAccounts/${username}`, xtRecord);
  await dbMerge(`users/${state.user.uid}`, { xtreamUsername: username });

  state.xtreamAccount = xtRecord;
  state.xtreamPassVisible = true;
  if (btn) btn.disabled = false;

  renderXtreamPanelState();
  showToast("🎉 Your Free Personal Xtream Server is LIVE!");
}

function renderXtreamPanelState() {
  const guestBox = document.getElementById("xtreamGuestBox");
  const claimBox = document.getElementById("xtreamClaimBox");
  const vault = document.getElementById("xtreamActiveVault");

  const hostUrl = getEffectiveServerOrigin();
  const guideUrl = document.getElementById("xtGuideUrl");
  if (guideUrl) guideUrl.textContent = hostUrl;

  if (!state.user) {
    if (guestBox) guestBox.hidden = false;
    if (claimBox) claimBox.hidden = true;
    if (vault) vault.hidden = true;
    return;
  }

  if (!state.xtreamAccount) {
    if (guestBox) guestBox.hidden = true;
    if (claimBox) claimBox.hidden = false;
    if (vault) vault.hidden = true;
    return;
  }

  if (guestBox) guestBox.hidden = true;
  if (claimBox) claimBox.hidden = true;
  if (vault) vault.hidden = false;

  const xt = state.xtreamAccount;
  const isPro = String(xt.plan || "free").toLowerCase() === "pro";

  const planBadge = document.getElementById("xtVaultPlanBadge");
  if (planBadge) {
    planBadge.className = isPro ? "badge badge-gold" : "badge badge-cyan";
    planBadge.textContent = isPro
      ? `👑 BARAKAT PRO VIP (${xt.maxConnections || 5} CONNECTIONS)`
      : "FREE PLAN (1 CONNECTION • UPGRADE: 0306-2015326)";
  }

  setText("xtNameVal", `BarakatWave TV (${xt.username})`);
  setText("xtHostVal", hostUrl);
  setText("xtUserVal", xt.username);
  setText("xtPassVal", state.xtreamPassVisible ? xt.password : "••••••••••");
  setText("xtCreatedVal", String(xt.createdAt || "").slice(0, 10) || "Active");

  const m3uLink = `${hostUrl}/get.php?username=${encodeURIComponent(xt.username)}&password=${encodeURIComponent(xt.password)}&type=m3u_plus&output=m3u8`;
  const epgLink = `${hostUrl}/xmltv.php?username=${encodeURIComponent(xt.username)}&password=${encodeURIComponent(xt.password)}`;

  setText("xtM3uVal", m3uLink);
  setText("xtEpgVal", epgLink);

  const dlBtn = document.getElementById("xtM3uDownloadBtn");
  if (dlBtn) dlBtn.href = m3uLink;

  const waUpgrade = document.getElementById("xtreamUpgradeWaBtn");
  if (waUpgrade) {
    waUpgrade.href = `https://wa.me/923062015326?text=${encodeURIComponent(
      `Assalam o Alaikum! Please upgrade my BarakatWave Xtream Server to PRO VIP.\nUsername: ${xt.username}\nEmail: ${state.user.email || ""}`
    )}`;
  }
}

async function testLiveXtreamEndpoint() {
  if (!state.xtreamAccount) return;
  const box = document.getElementById("xtApiTestOutput");
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<span class="muted-sm">Testing /player_api.php with your credentials...</span>`;

  try {
    const xt = state.xtreamAccount;
    const url = `/player_api.php?username=${encodeURIComponent(xt.username)}&password=${encodeURIComponent(xt.password)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.user_info?.auth === 1) {
      box.innerHTML = `
        <div class="text-success" style="font-weight:700;">✅ Xtream Server Verified &amp; Responding!</div>
        <div class="muted-sm" style="margin-top:4px;">Status: <strong>${escHtml(data.user_info.status)}</strong> &bull; Max Connections: <strong>${escHtml(data.user_info.max_connections)}</strong> &bull; Timezone: <strong>${escHtml(data.server_info.timezone)}</strong></div>
      `;
    } else {
      box.innerHTML = `<div class="text-danger" style="font-weight:700;">⚠ Auth check returned auth=0. Syncing your account now...</div>`;
      await dbWrite(`xtreamAccounts/${xt.username}`, xt);
    }
  } catch (err) {
    box.innerHTML = `<div class="text-danger" style="font-weight:700;">Error testing API: ${escHtml(err?.message || "Failed")}</div>`;
  }
}

/* ==================== CUSTOM PLAYLIST STUDIO ==================== */
function bindPlaylistStudio() {
  document.getElementById("plSelectAllBtn")?.addEventListener("click", () => {
    state.playlist.channelIds = state.channels.map((c) => c.id);
    renderPlaylistCatalogChecks();
    updatePlaylistPreview();
  });

  document.getElementById("plClearAllBtn")?.addEventListener("click", () => {
    state.playlist.channelIds = [];
    renderPlaylistCatalogChecks();
    updatePlaylistPreview();
  });

  document.getElementById("plNameInput")?.addEventListener("input", (e) => {
    state.playlist.name = e.target.value;
    updatePlaylistPreview();
  });

  document.getElementById("addCustomStreamBtn")?.addEventListener("click", () => {
    const nameEl = document.getElementById("customChName");
    const urlEl = document.getElementById("customChUrl");
    const name = nameEl?.value.trim();
    const url = urlEl?.value.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      showToast("Enter a valid https:// .m3u8 stream link");
      return;
    }
    state.playlist.customStreams.push({
      name: name || `My Channel ${state.playlist.customStreams.length + 1}`,
      category: "My Custom Channels",
      url
    });
    if (nameEl) nameEl.value = "";
    if (urlEl) urlEl.value = "";
    renderCustomStreamsList();
    updatePlaylistPreview();
  });

  document.getElementById("savePlaylistBtn")?.addEventListener("click", saveCloudPlaylist);

  document.getElementById("downloadLocalM3uBtn")?.addEventListener("click", () => {
    const m3uText = buildCurrentPersonalM3uString();
    const blob = new Blob([m3uText], { type: "audio/x-mpegurl;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "barakatwave-my-playlist.m3u8";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Downloaded barakatwave-my-playlist.m3u8!");
  });

  document.getElementById("playMyPlaylistBtn")?.addEventListener("click", () => {
    if (!state.playlist.channelIds.length && !state.playlist.customStreams.length) {
      showToast("Select at least 1 channel first!");
      return;
    }
    state.activeCategory = "MY_PL";
    renderCategoryChips();
    renderChannelGuide();
    renderChannelCards();
    const list = getFilteredChannels();
    if (list[0]) playChannel(list[0]);
    switchView("live");
  });
}

function renderPlaylistCatalogChecks() {
  const wrap = document.getElementById("plCatalogChecks");
  if (!wrap) return;
  if (!state.playlist.channelIds.length && state.channels.length) {
    // Pre-select first 5 free channels as a helpful starter
    state.playlist.channelIds = state.channels.filter((c) => c.tier === "free").slice(0, 5).map((c) => c.id);
  }
  const selected = new Set(state.playlist.channelIds);
  wrap.innerHTML = state.channels
    .map(
      (ch) => `
      <label class="check-card">
        <input type="checkbox" value="${escAttr(ch.id)}" ${selected.has(ch.id) ? "checked" : ""} />
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(ch.name)}</span>
        <span class="badge ${ch.tier === "pro" ? "badge-gold" : "badge-free"}">${ch.tier.toUpperCase()}</span>
      </label>`
    )
    .join("");

  wrap.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.addEventListener("change", () => {
      const checked = [...wrap.querySelectorAll("input[type='checkbox']:checked")].map((x) => x.value);
      state.playlist.channelIds = checked;
      updatePlaylistPreview();
    });
  });

  updatePlaylistPreview();
}

function renderCustomStreamsList() {
  const wrap = document.getElementById("customStreamsList");
  if (!wrap) return;
  wrap.innerHTML = (state.playlist.customStreams || [])
    .map(
      (cs, idx) => `
      <div class="cred-box" style="padding:8px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="min-width:0;">
          <strong style="font-size:0.84rem;">${escHtml(cs.name)}</strong>
          <div class="muted-sm" style="font-size:0.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(cs.url)}</div>
        </div>
        <button type="button" class="btn btn-sm btn-danger" data-del-custom="${idx}">✕</button>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-del-custom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delCustom);
      state.playlist.customStreams.splice(idx, 1);
      renderCustomStreamsList();
      updatePlaylistPreview();
    });
  });
}

function buildCurrentPersonalM3uString() {
  const chosen = state.channels.filter((c) => state.playlist.channelIds.includes(c.id));
  const origin = getEffectiveServerOrigin();
  const baseM3u = exportChannelsToM3u(chosen, {
    baseUrl: origin,
    useCleanLinks: true,
    title: state.playlist.name || "My BarakatWave Playlist"
  });
  const extra = (state.playlist.customStreams || [])
    .map((cs) => `#EXTINF:-1 group-title="My Custom Channels",${cs.name}\n${cs.url}`)
    .join("\n");
  return extra ? `${baseM3u}${extra}\n` : baseM3u;
}

function updatePlaylistPreview() {
  const pre = document.getElementById("plRawPreview");
  if (pre) pre.textContent = buildCurrentPersonalM3uString();
  const urlVal = document.getElementById("plCloudUrlVal");
  if (urlVal && state.playlist.id) {
    urlVal.textContent = `${getEffectiveServerOrigin()}/playlist/${state.playlist.id}.m3u8`;
  }
}

async function saveCloudPlaylist() {
  if (!state.user) {
    document.getElementById("authModal").hidden = false;
    showToast("Sign in first to save your personal cloud playlist!");
    return;
  }
  const plId =
    state.playlist.id ||
    `pl_${state.user.uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}_${Math.floor(100 + Math.random() * 900)}`;

  const payload = {
    id: plId,
    uid: state.user.uid,
    name: document.getElementById("plNameInput")?.value.trim() || "My BarakatWave Playlist",
    channelIds: state.playlist.channelIds,
    customStreams: state.playlist.customStreams,
    xtreamUsername: state.xtreamAccount?.username || "",
    xtreamPassword: state.xtreamAccount?.password || "",
    updatedAt: new Date().toISOString()
  };

  await dbWrite(`playlists/${plId}`, payload);
  await dbMerge(`users/${state.user.uid}`, { playlistId: plId });
  state.playlist.id = plId;
  updatePlaylistPreview();
  showToast("✅ Personal Cloud M3U8 Playlist Saved!");
}

/* ==================== BLOGS, REVIEWS & SUPPORT ==================== */
function renderBlogsGrid() {
  const grid = document.getElementById("inAppBlogsGrid");
  if (!grid) return;
  grid.innerHTML = state.blogs
    .map(
      (b) => `
      <article class="blog-card glass-card">
        <div class="blog-card-meta">
          <span class="badge badge-cyan">${escHtml(b.category || "Guide")}</span>
          <span class="muted-sm">${escHtml(b.readTime || "5 min read")}</span>
        </div>
        <h3 style="margin:4px 0;"><a href="/blog/${escAttr(b.slug)}">${escHtml(b.title)}</a></h3>
        <p class="muted-sm" style="margin:0;">${escHtml(b.excerpt || "")}</p>
        <div class="blog-card-footer">
          <span class="muted-sm">By <strong>${escHtml(b.author || BRAND.founder)}</strong></span>
          <a href="/blog/${escAttr(b.slug)}" class="btn btn-sm btn-outline">Read Full Guide &rarr;</a>
        </div>
      </article>`
    )
    .join("");
}

function bindReviewsAndSupport() {
  document.getElementById("reviewForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userName = document.getElementById("revNameInput")?.value.trim();
    const rating = Number(document.getElementById("revRatingInput")?.value || 5);
    const comment = document.getElementById("revCommentInput")?.value.trim();
    if (!userName || !comment) return;

    const item = {
      uid: state.user?.uid || "guest",
      userName,
      userPlan: getEffectiveUserPlan(),
      rating,
      comment,
      helpful: 1,
      reply: "",
      createdAt: new Date().toISOString()
    };

    const res = await dbPushItem("reviews", item);
    state.reviews.unshift(res.item);
    document.getElementById("revCommentInput").value = "";
    renderReviews();
    showToast("⭐ JazakAllah! Your review is live.");
  });

  document.getElementById("ticketForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.user) {
      document.getElementById("authModal").hidden = false;
      showToast("Please sign in to submit and track your support ticket!");
      return;
    }
    const subject = document.getElementById("tktSubject")?.value.trim();
    const phone = document.getElementById("tktPhone")?.value.trim();
    const message = document.getElementById("tktMessage")?.value.trim();
    if (!subject || !message) return;

    const ticket = {
      uid: state.user.uid,
      email: state.user.email || "",
      userName: state.user.displayName || "Viewer",
      xtreamUsername: state.xtreamAccount?.username || "",
      subject,
      phone,
      message,
      status: "Open",
      adminReply: "",
      createdAt: new Date().toISOString()
    };

    await dbPushItem("tickets", ticket);
    document.getElementById("tktSubject").value = "";
    document.getElementById("tktMessage").value = "";
    await renderUserTickets();
    showToast("🎫 Support Ticket submitted! For instant PRO unlock also message 0306-2015326.");
  });
}

function renderReviews() {
  const wrap = document.getElementById("reviewsList");
  if (!wrap) return;
  wrap.innerHTML = state.reviews
    .slice(0, 12)
    .map((r) => {
      const stars = "★".repeat(Math.max(1, Math.min(5, Number(r.rating) || 5)));
      const badge =
        r.userPlan === "pro"
          ? `<span class="badge badge-gold">PRO VIP</span>`
          : `<span class="badge badge-cyan">VERIFIED</span>`;
      return `
        <div class="review-card glass-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${escHtml(r.userName || "Viewer")}</strong>
            ${badge}
          </div>
          <div class="stars" style="margin:4px 0;">${stars}</div>
          <p style="margin:6px 0;font-size:0.88rem;">${escHtml(r.comment)}</p>
          ${
            r.reply
              ? `<div style="margin-top:8px;padding:8px 10px;border-radius:9px;background:var(--bg-soft);font-size:0.8rem;border-left:3px solid var(--gold);"><strong>Official Reply:</strong> ${escHtml(r.reply)}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

async function renderUserTickets() {
  const wrap = document.getElementById("myTicketsWrap");
  if (!wrap) return;
  if (!state.user) {
    wrap.innerHTML = "";
    return;
  }
  const all = await dbRead("tickets", {});
  const mine = Object.values(all || {}).filter((t) => t && t.uid === state.user.uid);
  if (!mine.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <strong style="font-size:0.84rem;">Your Recent Tickets (${mine.length})</strong>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
      ${mine
        .map(
          (t) => `
        <div class="cred-box">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <strong>${escHtml(t.subject)}</strong>
            <span class="badge ${t.status === "Resolved" ? "badge-free" : "badge-gold"}">${escHtml(t.status || "Open")}</span>
          </div>
          <div class="muted-sm" style="margin-top:4px;">${escHtml(t.message)}</div>
          ${t.adminReply ? `<div style="margin-top:6px;color:var(--primary);font-size:0.82rem;"><strong>Support Reply:</strong> ${escHtml(t.adminReply)}</div>` : ""}
        </div>`
        )
        .join("")}
    </div>
  `;
}

function renderFaqs() {
  const wrap = document.getElementById("faqAccordion");
  if (!wrap) return;
  wrap.innerHTML = DEFAULT_FAQS.map(
    (f) => `
      <details class="cred-box" style="cursor:pointer;">
        <summary style="font-weight:700;font-size:0.88rem;">${escHtml(f.q)}</summary>
        <p class="muted-sm" style="margin:8px 0 0;">${escHtml(f.a)}</p>
      </details>`
  ).join("");
}

/* ==================== IMDb MOVIES & SERIES CINEMA HUB (2000–2026) ==================== */
async function hydrateFullImdbCatalog() {
  try {
    const res = await fetch("/api/imdb?action=catalog");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.movies) && data.movies.length) {
      state.baseCatalogMovies = data.movies;
    }
    if (Array.isArray(data.series) && data.series.length) {
      state.baseCatalogSeries = data.series;
    }
    recomputeMergedCinemaState();
    populateCinemaYearSelect();
    renderCinemaHub();
  } catch {
    // keep built-in seed fallback
  }
}

function recomputeMergedCinemaState() {
  const mergeByImdb = (baseArr, rtdbObj) => {
    const map = new Map();
    for (const item of baseArr) {
      map.set(String(item.imdbId || item.id).toLowerCase(), { ...item });
    }
    if (rtdbObj && typeof rtdbObj === "object") {
      const overrides = Array.isArray(rtdbObj)
        ? rtdbObj.filter(Boolean)
        : Object.entries(rtdbObj).map(([id, v]) => ({ id, ...v }));
      for (const ov of overrides) {
        const key = String(ov.imdbId || ov.id || "").toLowerCase();
        if (!key) continue;
        if (ov._deleted) {
          map.delete(key);
        } else if (map.has(key)) {
          const prev = map.get(key);
          map.set(key, {
            ...prev,
            ...ov,
            category: ov.customCategory ? ov.category : prev.category,
            categoryId: ov.customCategory ? ov.categoryId : prev.categoryId
          });
        } else {
          map.set(key, { ...ov, _adminCustom: true });
        }
      }
    }
    return [...map.values()];
  };

  state.movies = mergeByImdb(state.baseCatalogMovies, state.rtdbMoviesOverride);
  state.series = mergeByImdb(state.baseCatalogSeries, state.rtdbSeriesOverride);
}

function populateCinemaYearSelect() {
  const sel = document.getElementById("cinemaYearFilter");
  if (!sel) return;
  const current = state.cinemaYear || "ALL";
  const opts = ['<option value="ALL">📅 All Years (2000–2026)</option>'];
  for (let yr = 2026; yr >= 2000; yr--) {
    opts.push(`<option value="${yr}">${yr} Releases</option>`);
  }
  sel.innerHTML = opts.join("");
  sel.value = current;
}

function bindCinemaHub() {
  populateCinemaYearSelect();

  document.querySelectorAll("#cinemaTypeTabs [data-cin-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cinemaType = btn.dataset.cinType || "all";
      state.cinemaCategory = "ALL";
      state.cinemaLimit = 60;
      document.querySelectorAll("#cinemaTypeTabs [data-cin-type]").forEach((b) => {
        b.className = b === btn ? "btn btn-sm btn-primary" : "btn btn-sm btn-outline";
      });
      renderCinemaHub();
    });
  });

  const yearSel = document.getElementById("cinemaYearFilter");
  yearSel?.addEventListener("change", () => {
    state.cinemaYear = yearSel.value || "ALL";
    state.cinemaLimit = 60;
    renderCinemaHub();
  });

  const searchInp = document.getElementById("cinemaSearchInput");
  searchInp?.addEventListener("input", () => {
    state.cinemaQuery = searchInp.value.trim();
    state.cinemaLimit = 60;
    renderCinemaHub();
  });

  document.getElementById("cinemaLoadMoreBtn")?.addEventListener("click", () => {
    state.cinemaLimit += 60;
    renderCinemaHub();
  });

  document.getElementById("closeCinemaModalBtn")?.addEventListener("click", () => {
    const m = document.getElementById("cinemaDetailModal");
    if (m) m.hidden = true;
  });

  document.getElementById("cinemaDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "cinemaDetailModal") e.target.hidden = true;
  });

  document.getElementById("userImdbLookupBtn")?.addEventListener("click", async () => {
    const inp = document.getElementById("userImdbLookupInput");
    const raw = inp?.value.trim() || "";
    if (!raw) return showToast("Paste an IMDb ID like tt1375666 or tt4320258!");
    try {
      showToast("⚡ Fetching official IMDb rating & metadata...");
      const item = await fetchImdbTitle(raw, "auto");
      openCinemaDetailModal(item);
    } catch (err) {
      showToast(err?.message || "Could not load IMDb ID");
    }
  });
}

function getCombinedCinemaItems() {
  const movs = state.movies.map((m) => ({ ...m, _mediaType: "movie" }));
  const sers = state.series.map((s) => ({ ...s, _mediaType: "series" }));
  const allCombined = [...movs, ...sers];
  setText("cinCountAll", String(allCombined.length));
  setText("cinCountMovies", String(movs.length));
  setText("cinCountSeries", String(sers.length));
  setText(
    "cinCountWatchlist",
    String(allCombined.filter((x) => state.watchlist.has(x.imdbId || x.id)).length)
  );

  let list =
    state.cinemaType === "movie"
      ? movs
      : state.cinemaType === "series"
        ? sers
        : state.cinemaType === "watchlist"
          ? allCombined.filter((x) => state.watchlist.has(x.imdbId || x.id))
          : allCombined;

  if (state.cinemaCategory !== "ALL") {
    list = list.filter((x) => x.category === state.cinemaCategory);
  }

  if (state.cinemaYear && state.cinemaYear !== "ALL") {
    list = list.filter((x) => String(x.year || "").startsWith(state.cinemaYear));
  }

  if (state.cinemaQuery) {
    const q = state.cinemaQuery.toLowerCase();
    list = list.filter(
      (x) =>
        String(x.title || "").toLowerCase().includes(q) ||
        String(x.imdbId || "").toLowerCase().includes(q) ||
        String(x.year || "").toLowerCase().includes(q) ||
        String(x.cast || "").toLowerCase().includes(q) ||
        String(x.director || "").toLowerCase().includes(q) ||
        String((x.genres || []).join(" ")).toLowerCase().includes(q)
    );
  }
  return list;
}

function renderCinemaHub() {
  const chipsEl = document.getElementById("cinemaCategoryChips");
  const gridEl = document.getElementById("cinemaCardsGrid");
  const moreWrap = document.getElementById("cinemaLoadMoreWrap");
  const moreBtn = document.getElementById("cinemaLoadMoreBtn");
  if (!gridEl) return;

  const baseCategories =
    state.cinemaType === "movie"
      ? VOD_CATEGORIES.map((c) => c.name)
      : state.cinemaType === "series"
        ? SERIES_CATEGORIES.map((c) => c.name)
        : [...VOD_CATEGORIES.map((c) => c.name), ...SERIES_CATEGORIES.map((c) => c.name)];

  if (chipsEl) {
    const allChipItems = ["ALL", ...baseCategories];
    chipsEl.innerHTML = allChipItems
      .map(
        (cat) =>
          `<button type="button" class="chip ${state.cinemaCategory === cat ? "active" : ""}" data-cin-cat="${escAttr(cat)}">${escHtml(cat === "ALL" ? "🌐 All Genres & Categories" : cat)}</button>`
      )
      .join("");
    chipsEl.querySelectorAll("[data-cin-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.cinemaCategory = btn.dataset.cinCat || "ALL";
        state.cinemaLimit = 60;
        renderCinemaHub();
      });
    });
  }

  const items = getCombinedCinemaItems();
  renderCinemaFeaturedSpotlight(items[0] || state.movies[0]);

  if (!items.length) {
    if (moreWrap) moreWrap.hidden = true;
    gridEl.innerHTML = `<div class="glass-card" style="grid-column:1/-1;padding:28px;text-align:center;">${
      state.cinemaType === "watchlist"
        ? "Your ❤️ Watchlist is empty — tap the heart icon on any Movie or Series poster to save it!"
        : "No Movies or Series match your filter. Try pasting any <code>tt...</code> IMDb ID above!"
    }</div>`;
    return;
  }

  const visibleItems = items.slice(0, state.cinemaLimit || 60);
  if (moreWrap && moreBtn) {
    if (items.length > visibleItems.length) {
      moreWrap.hidden = false;
      moreBtn.textContent = `⬇ Load More IMDb Titles (${visibleItems.length} of ${items.length} shown)`;
    } else {
      moreWrap.hidden = true;
    }
  }

  gridEl.innerHTML = visibleItems
    .map((item) => {
      const isSeries = item._mediaType === "series" || item.type === "series";
      const rating = Number(item.imdbRating || 8.0).toFixed(1);
      const wlKey = item.imdbId || item.id;
      const inWl = state.watchlist.has(wlKey);
      const statusRibbon = item.streamUrl
        ? "▶ STREAMING NOW IN HD"
        : "🎬 SERVICE BUILDING • COMING SOON";
      return `
        <article class="cinema-card" data-open-cin="${escAttr(item.id || item.imdbId)}" data-cin-kind="${isSeries ? "series" : "movie"}">
          <div class="cinema-poster-wrap">
            <img
              src="${escAttr(item.poster || BRAND.logoPrimary)}"
              onerror="this.onerror=null;this.src='${escAttr(BRAND.logoPrimary)}';"
              alt="${escAttr(item.title)}"
              loading="lazy"
            />
            <span class="imdb-rating-pill">⭐ ${escHtml(rating)}</span>
            <span class="cinema-type-pill">${isSeries ? "📺 SERIES" : "🎬 MOVIE"}</span>
            <button type="button" class="cinema-fav-heart ${inWl ? "saved" : ""}" data-wl-toggle="${escAttr(wlKey)}" title="Save to My Watchlist">${inWl ? "❤️" : "🤍"}</button>
            <div class="cinema-coming-ribbon">${escHtml(statusRibbon)}</div>
          </div>
          <div class="cinema-card-body">
            <div class="cinema-card-title">${escHtml(item.title)}</div>
            <div class="muted-sm" style="font-size:0.75rem;">
              ${escHtml(item.year || "HD")} &bull; <code>${escHtml(item.imdbId || "")}</code>
              ${item.tier === "pro" ? `<span class="badge badge-gold" style="margin-left:4px;padding:1px 6px;font-size:0.65rem;">👑 PRO</span>` : ""}
            </div>
            <div class="muted-sm" style="font-size:0.73rem;margin-top:auto;">
              ${escHtml(Array.isArray(item.genres) ? item.genres.slice(0, 3).join(" • ") : item.category || "")}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  gridEl.querySelectorAll("[data-wl-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWatchlist(btn.dataset.wlToggle);
    });
  });

  gridEl.querySelectorAll("[data-open-cin]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-wl-toggle]")) return;
      const key = card.dataset.openCin;
      const found = visibleItems.find((x) => (x.id || x.imdbId) === key);
      if (found) openCinemaDetailModal(found);
    });
  });
}

function openCinemaDetailModal(item) {
  const modal = document.getElementById("cinemaDetailModal");
  const content = document.getElementById("cinemaModalContent");
  if (!modal || !content || !item) return;

  const isSeries = item._mediaType === "series" || item.type === "series" || Array.isArray(item.episodes);
  const rating = Number(item.imdbRating || 8.0).toFixed(1);
  const genres = Array.isArray(item.genres) ? item.genres.join(" • ") : String(item.genres || "Drama");
  const episodes = Array.isArray(item.episodes) ? item.episodes : [];

  content.innerHTML = `
    <div class="cinema-modal-hero" style="background-image:url('${escAttr(item.backdrop || item.poster || BRAND.logoPrimary)}');">
      <div class="cinema-modal-hero-inner">
        <img
          src="${escAttr(item.poster || BRAND.logoPrimary)}"
          onerror="this.onerror=null;this.src='${escAttr(BRAND.logoPrimary)}';"
          alt="${escAttr(item.title)}"
          style="width:100%;max-width:155px;border-radius:14px;border:2px solid rgba(255,255,255,0.22);box-shadow:0 12px 30px rgba(0,0,0,0.45);"
        />
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            <span class="badge badge-gold">⭐ IMDb ${escHtml(rating)} / 10</span>
            <span class="badge badge-cyan">${isSeries ? "📺 TV SERIES" : "🎬 FEATURE MOVIE"}</span>
            <code style="background:rgba(255,255,255,0.14);padding:3px 8px;border-radius:6px;color:#fff;font-size:0.76rem;">${escHtml(item.imdbId || "")}</code>
            ${item.tier === "pro" ? `<span class="badge badge-gold">👑 PRO VIP</span>` : `<span class="badge badge-free">🟢 FREE ACCESS</span>`}
          </div>
          <h2 id="cinModalTitle" style="margin:0 0 6px;font-size:1.5rem;color:#fff;">${escHtml(item.title)} (${escHtml(item.year || "HD")})</h2>
          <div style="font-size:0.84rem;color:#cbd5e1;margin-bottom:10px;">
            ${escHtml(genres)} &bull; ${escHtml(item.runtime || "HD")} &bull; ${escHtml(item.language || "Multi Audio")}
          </div>
          <p style="margin:0 0 14px;font-size:0.9rem;line-height:1.55;color:#e2e8f0;">${escHtml(item.plot || "")}</p>
          <div style="font-size:0.8rem;color:#cbd5e1;margin-bottom:14px;">
            <strong>Director:</strong> ${escHtml(item.director || "IMDb Selection")}<br/>
            <strong>Cast:</strong> ${escHtml(item.cast || "Featured Cast")}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="cinWatchMainBtn">
              ▶ ${item.streamUrl ? "Watch Now in HD" : "Play in IMDb Cinema Player"}
            </button>
            ${
              item.imdbId
                ? `<button type="button" class="btn btn-gold" id="cinImdbBtn">🎬 IMDb ID Player (${escHtml(item.imdbId)})</button>`
                : ""
            }
            ${
              !item.streamUrl
                ? `<button type="button" class="btn btn-outline" id="cinComingSoonBtn" style="color:#fff;border-color:rgba(255,255,255,0.3);">📺 Coming Soon Broadcast</button>`
                : ""
            }
            <a href="https://www.imdb.com/title/${escAttr(item.imdbId || "")}/" target="_blank" rel="noopener" class="btn btn-outline" style="color:#fff;border-color:rgba(255,255,255,0.3);">
              🌟 View on IMDb (${escHtml(item.imdbId || "")})
            </a>
          </div>
        </div>
      </div>
    </div>
    <div style="padding:18px 24px 22px;">
      <div class="cred-box" style="margin-bottom:${isSeries && episodes.length ? "14px" : "0"};">
        <strong>📡 Xtream Codes VOD &amp; Series Sync Active:</strong>
        <span class="muted-sm">This title (<code>${escHtml(item.imdbId || "")}</code> • ⭐ ${escHtml(rating)}) also appears automatically inside <strong>Televizo, IPTV Smarters Pro &amp; TiviMate</strong> under <em>${escHtml(item.category || "IMDb Cinema")}</em>!</span>
      </div>
      ${
        isSeries && episodes.length
          ? `
        <h3 style="margin:8px 0 10px;font-size:1rem;">📺 Episodes (${episodes.length})</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;">
          ${episodes
            .map(
              (ep, idx) => `
            <button type="button" class="cred-box" style="text-align:left;cursor:pointer;" data-play-ep-idx="${idx}">
              <div style="font-weight:800;font-size:0.84rem;">▶ S${String(ep.season || 1).padStart(2, "0")}E${String(ep.episode || idx + 1).padStart(2, "0")} — ${escHtml(ep.title)}</div>
              <div class="muted-sm" style="font-size:0.74rem;margin-top:3px;">${ep.streamUrl ? "🟢 HD Stream Ready" : "🎬 Coming Soon Broadcast"}</div>
            </button>`
            )
            .join("")}
        </div>`
          : ""
      }
    </div>
  `;

  modal.hidden = false;

  document.getElementById("cinImdbBtn")?.addEventListener("click", () => {
    modal.hidden = true;
    openImdbCinemaPlayer(item, isSeries ? "series" : "movie");
  });

  // Keep the classic Coming Soon broadcast available for titles without a custom stream
  document.getElementById("cinComingSoonBtn")?.addEventListener("click", () => {
    modal.hidden = true;
    switchView("live");
    state.activeSeriesItem = isSeries ? item : null;
    setText("nowPlayingTitle", item.title || "Cinema");
    setText("nowPlayingSub", `${item.category || "IMDb Cinema"} • Coming Soon Broadcast`);
    player?.loadVod({ ...item, streamUrl: "" }, { settings: state.settings, userPlan: getEffectiveUserPlan() });
  });

  document.getElementById("cinWatchMainBtn")?.addEventListener("click", () => {
    modal.hidden = true;
    if (isSeries && episodes.length) {
      playVodInStudio(
        {
          ...item,
          title: `${item.title} — ${episodes[0].title || "S01E01"}`,
          streamUrl: episodes[0].streamUrl || item.streamUrl || ""
        },
        item,
        0
      );
    } else {
      playVodInStudio(item, null, 0);
    }
  });

  content.querySelectorAll("[data-play-ep-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const epIdx = Number(btn.dataset.playEpIdx) || 0;
      const ep = episodes[epIdx];
      modal.hidden = true;
      playVodInStudio(
        {
          ...item,
          title: ep ? `${item.title} — ${ep.title}` : item.title,
          streamUrl: (ep && ep.streamUrl) || item.streamUrl || ""
        },
        item,
        epIdx
      );
    });
  });
}

function renderCinemaFeaturedSpotlight(item) {
  const hero = document.getElementById("cinemaFeaturedHero");
  if (!hero || !item) return;
  const isSeries = item._mediaType === "series" || item.type === "series" || Array.isArray(item.episodes);
  const rating = Number(item.imdbRating || 8.4).toFixed(1);
  const wlKey = item.imdbId || item.id;
  const inWl = state.watchlist.has(wlKey);

  hero.style.backgroundImage = `url('${escAttr(item.backdrop || item.poster || BRAND.logoPrimary)}')`;
  hero.innerHTML = `
    <div class="cinema-3d-hero-inner">
      <div style="max-width:640px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
          <span class="badge badge-gold">🌟 FEATURED 3D CINEMA SPOTLIGHT</span>
          <span class="badge badge-cyan">⭐ IMDb ${escHtml(rating)}</span>
          <span class="badge badge-free">${isSeries ? "📺 TV SERIES" : "🎬 BLOCKBUSTER"}</span>
        </div>
        <h2 style="margin:0 0 6px;font-size:1.65rem;line-height:1.2;">${escHtml(item.title)} (${escHtml(item.year || "HD")})</h2>
        <p style="margin:0 0 14px;font-size:0.9rem;color:#cbd5e1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          ${escHtml(item.plot || "")}
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" id="heroSpotPlayBtn">▶ Play Now</button>
          <button type="button" class="btn btn-outline" id="heroSpotInfoBtn" style="color:#fff;border-color:rgba(255,255,255,0.3);">ℹ️ Details${isSeries ? " & Episodes" : ""}</button>
          <button type="button" class="btn btn-outline" id="heroSpotWlBtn" style="color:#fff;border-color:rgba(255,255,255,0.3);">${inWl ? "❤️ Saved in My List" : "🤍 Add to My List"}</button>
        </div>
      </div>
    </div>
  `;

  hero.querySelector("#heroSpotPlayBtn")?.addEventListener("click", () => {
    const eps = Array.isArray(item.episodes) ? item.episodes : [];
    if (isSeries && eps.length) {
      playVodInStudio(
        { ...item, title: `${item.title} — ${eps[0].title || "S01E01"}`, streamUrl: eps[0].streamUrl || item.streamUrl || "" },
        item,
        0
      );
    } else {
      playVodInStudio(item, null, 0);
    }
  });
  hero.querySelector("#heroSpotInfoBtn")?.addEventListener("click", () => openCinemaDetailModal(item));
  hero.querySelector("#heroSpotWlBtn")?.addEventListener("click", () => toggleWatchlist(wlKey));
}

function toggleWatchlist(wlKey) {
  if (!wlKey) return;
  if (state.watchlist.has(wlKey)) {
    state.watchlist.delete(wlKey);
    showToast("Removed from ❤️ My List");
  } else {
    state.watchlist.add(wlKey);
    showToast("Saved to ❤️ My List!");
  }
  localStorage.setItem("bw_watchlist", JSON.stringify([...state.watchlist]));
  renderCinemaHub();
}

/**
 * IMDb Cinema Player — plays any Movie or Series straight from its IMDb ID.
 * Uses the multi-server IMDb engine in `cinema-player.js`.
 */
function openImdbCinemaPlayer(item, type = "movie") {
  const host = document.getElementById("imdbCinemaPlayerModal");
  if (!host || !item) return;
  switchView("cinema");
  if (normalizeImdbId(item.imdbId || item.id || "")) {
    trackPlay({
      title: item.title || "Cinema",
      itemId: item.id || "",
      imdbId: normalizeImdbId(item.imdbId || item.id || ""),
      contentType: type === "series" ? "Series" : "Movie",
      category: item.category || "IMDb Cinema",
      engine: "IMDB-EMBED",
      surface: "IMDb Cinema Player"
    });
  }
  mountImdbCinemaPlayer({
    container: host,
    item,
    type,
    onClose: () => {
      host.hidden = true;
      host.innerHTML = "";
    }
  });
  setTimeout(() => {
    try {
      host.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } catch {
      // ignore unsupported scrollIntoView
    }
  }, 60);
}

function playVodInStudio(vodItem, seriesParent = null, epIdx = 0) {
  // Titles without a custom HD stream but WITH an IMDb ID play instantly in the IMDb Cinema Player!
  const hasStream = Boolean(String(vodItem.streamUrl || "").trim());
  if (!hasStream && normalizeImdbId(vodItem.imdbId || vodItem.id || "")) {
    const isSeries = Boolean(seriesParent) || Array.isArray(vodItem.episodes);
    state.activeSeriesItem = seriesParent || (Array.isArray(vodItem.episodes) ? vodItem : null);
    state.activeEpisodeIdx = epIdx;
    openImdbCinemaPlayer(vodItem, isSeries ? "series" : "movie");
    return;
  }

  switchView("live");
  state.activeSeriesItem = seriesParent || (Array.isArray(vodItem.episodes) ? vodItem : null);
  state.activeEpisodeIdx = epIdx;

  setText("nowPlayingTitle", `${vodItem.title} ⭐ ${vodItem.imdbRating || "8.0"}`);
  setText(
    "nowPlayingSub",
    `${vodItem.category || "IMDb Cinema"} • IMDb ${vodItem.imdbId || ""} • ${vodItem.streamUrl ? "HD Cinema Stream" : "Service Building — Coming Soon"}`
  );
  const logoEl = document.getElementById("nowPlayingLogo");
  if (logoEl) logoEl.src = vodItem.poster || BRAND.logoPrimary;
  const tierEl = document.getElementById("nowPlayingTier");
  if (tierEl) {
    tierEl.className = vodItem.tier === "pro" ? "badge badge-gold" : "badge badge-cyan";
    tierEl.textContent = state.activeSeriesItem ? "📺 SERIES" : "🎬 CINEMA";
  }

  renderActiveSeriesEpisodeTray();

  player?.loadVod(vodItem, {
    settings: state.settings,
    userPlan: getEffectiveUserPlan()
  });

  setTimeout(() => {
    document.getElementById("playerStage")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 120);
}

function renderActiveSeriesEpisodeTray() {
  const tray = document.getElementById("activeSeriesEpisodeTray");
  if (!tray) return;
  const ser = state.activeSeriesItem;
  const eps = Array.isArray(ser?.episodes) ? ser.episodes : [];
  if (!ser || !eps.length) {
    tray.hidden = true;
    tray.innerHTML = "";
    return;
  }

  tray.hidden = false;
  tray.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <strong style="font-size:0.84rem;">📺 ${escHtml(ser.title)} — Select Episode (${eps.length})</strong>
      <button type="button" class="btn btn-sm btn-outline" id="backToCinemaFromPlayerBtn">← Back to Movies &amp; Series</button>
    </div>
    <div class="episode-pills-scroll">
      ${eps
        .map(
          (ep, idx) => `
        <button type="button" class="ep-quick-pill ${idx === state.activeEpisodeIdx ? "active" : ""}" data-tray-ep="${idx}">
          ▶ S${String(ep.season || 1).padStart(2, "0")}E${String(ep.episode || idx + 1).padStart(2, "0")}
        </button>`
        )
        .join("")}
    </div>
  `;

  tray.querySelector("#backToCinemaFromPlayerBtn")?.addEventListener("click", () => switchView("cinema"));
  tray.querySelectorAll("[data-tray-ep]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.trayEp) || 0;
      const ep = eps[idx];
      if (!ep) return;
      playVodInStudio(
        {
          ...ser,
          title: `${ser.title} — ${ep.title || `S01E${idx + 1}`}`,
          streamUrl: ep.streamUrl || ser.streamUrl || ""
        },
        ser,
        idx
      );
    });
  });
}

/* ==================== UNIVERSAL STREAM LAB, 3D TILT & PWA INSTALLER ==================== */
function bindUniversalStreamLab() {
  const drawer = document.getElementById("universalStreamDrawer");
  const toggleDrawer = () => {
    if (!drawer) return;
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) {
      document.getElementById("customStreamUrlInput")?.focus();
    }
  };

  document.getElementById("openStreamLabBtn")?.addEventListener("click", toggleDrawer);
  document.getElementById("heroOpenStreamLabBtn")?.addEventListener("click", () => {
    if (drawer) drawer.hidden = false;
    drawer?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("customStreamUrlInput")?.focus();
  });

  document.querySelectorAll("[data-sample-stream]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.sampleStream;
      const urlInp = document.getElementById("customStreamUrlInput");
      const fmtSel = document.getElementById("customStreamFormatSelect");
      const drmInp = document.getElementById("customStreamDrmInput");
      if (!urlInp || !fmtSel) return;

      if (kind === "dash") {
        urlInp.value = "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd";
        fmtSel.value = "dash";
        if (drmInp) drmInp.value = "";
      } else if (kind === "local_dash") {
        urlInp.value = "/media/demo-dash/index.mpd";
        fmtSel.value = "dash";
        if (drmInp) drmInp.value = "";
      } else {
        urlInp.value = "/media/demo-live/index.m3u8";
        fmtSel.value = "hls";
        if (drmInp) drmInp.value = "";
      }
      document.getElementById("customUniversalStreamForm")?.requestSubmit();
    });
  });

  document.getElementById("customUniversalStreamForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = document.getElementById("customStreamUrlInput")?.value.trim() || "";
    const format = document.getElementById("customStreamFormatSelect")?.value || "auto";
    const drmRaw = document.getElementById("customStreamDrmInput")?.value.trim() || "";
    if (!url) return showToast("Paste a stream URL (.mpd, .m3u8, .ts, .flv, or .mp4)");

    const isLicenseUrl = /^https?:\/\//i.test(drmRaw);
    const shortHost = (() => {
      try {
        return new URL(url, window.location.origin).hostname;
      } catch {
        return "Universal Stream";
      }
    })();

    setText("nowPlayingTitle", `Universal Stream (${shortHost})`);
    setText(
      "nowPlayingSub",
      `BarakatWave Universal Engine • ${format.toUpperCase()}${drmRaw ? " • DRM Active" : ""}`
    );
    const tierEl = document.getElementById("nowPlayingTier");
    if (tierEl) {
      tierEl.className = "badge badge-cyan";
      tierEl.textContent = /\.mpd(\?|$)/i.test(url) || format === "dash" ? "DASH .MPD" : "UNIVERSAL";
    }

    // Seal remote links through the AES-256-GCM vault so the raw URL never sits in the DOM
    let playbackUrl = url;
    if (/^https?:\/\//i.test(url)) {
      const sealed = await sealCustomStreamUrl(url, format);
      if (sealed?.url) playbackUrl = sealed.url;
    }

    trackPlay({
      title: `Universal Stream (${shortHost})`,
      contentType: "Custom Stream",
      engine: (format === "auto" ? "AUTO" : format).toUpperCase(),
      surface: "Universal Stream Lab"
    });

    await player?.playCustomStream({
      url: playbackUrl,
      title: `Universal Stream (${shortHost})`,
      format,
      drmKey: isLicenseUrl ? "" : drmRaw,
      drmLicenseUrl: isLicenseUrl ? drmRaw : "",
      isLive: !/\.(mp4|mkv|webm|mov)(\?|$)/i.test(url)
    });
    showToast("▶ Playing stream in BarakatWave Universal 3D Player!");
  });
}

function bindPwaInstaller() {
  const modal = document.getElementById("pwaInstallModal");
  const nativeBox = document.getElementById("pwaNativePromptBox");
  const nativeBtn = document.getElementById("pwaTriggerNativeBtn");
  const headerBtn = document.getElementById("installAppHeaderBtn");
  const mobBtn = document.getElementById("mobileInstallDockBtn");
  const closeBtn = document.getElementById("closePwaModalBtn");

  // Hide install button if already running as installed standalone PWA
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  if (isStandalone && headerBtn) {
    headerBtn.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    if (nativeBox) nativeBox.hidden = false;
    if (headerBtn) headerBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    if (modal) modal.hidden = true;
    if (headerBtn) headerBtn.hidden = true;
    showToast("🎉 BarakatWave TV 3D App installed on your device!");
  });

  const triggerInstallFlow = async () => {
    if (state.deferredInstallPrompt) {
      try {
        state.deferredInstallPrompt.prompt();
        const choice = await state.deferredInstallPrompt.userChoice;
        if (choice?.outcome === "accepted") {
          state.deferredInstallPrompt = null;
          return;
        }
      } catch {
        // fall through to guide modal
      }
    }
    if (modal) modal.hidden = false;
  };

  headerBtn?.addEventListener("click", triggerInstallFlow);
  mobBtn?.addEventListener("click", triggerInstallFlow);
  nativeBtn?.addEventListener("click", triggerInstallFlow);
  closeBtn?.addEventListener("click", () => {
    if (modal) modal.hidden = true;
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}

function bind3dCardTiltEffects() {
  if (!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches) return;

  let activeCard = null;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".channel-item, .cinema-card, .feature-card, .blog-card");
    if (activeCard && activeCard !== card) {
      activeCard.style.removeProperty("--rx");
      activeCard.style.removeProperty("--ry");
      activeCard = null;
    }
    if (!card) return;
    activeCard = card;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width);
    const py = (e.clientY - rect.top) / Math.max(1, rect.height);
    const ry = ((px - 0.5) * 9).toFixed(2);
    const rx = ((0.5 - py) * 9).toFixed(2);
    card.style.setProperty("--rx", `${rx}deg`);
    card.style.setProperty("--ry", `${ry}deg`);
    card.style.setProperty("--mx", `${Math.round(px * 100)}%`);
    card.style.setProperty("--my", `${Math.round(py * 100)}%`);
  });
}

/* ==================== UTILITIES ==================== */
function getEffectiveServerOrigin() {
  return window.location.origin;
}

function generateCleanPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "BW";
  for (let i = 0; i < len - 2; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function copyText(text, msg = "Copied!") {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => showToast(msg),
    () => showToast(msg)
  );
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(message) {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return escHtml(s).replace(/'/g, "&#39;");
}

init();

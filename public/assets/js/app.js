/**
 * BarakatWave Live TV — Main User Web App Controller
 * Under Mizanora Projects | Founded & Engineered by Muaaz Iqbal
 */

import {
  BRAND,
  DEFAULT_SETTINGS,
  DEFAULT_CHANNELS,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  DEFAULT_FAQS,
  THEMES
} from "./default-data.js";
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

const state = {
  user: null,
  userProfile: null,
  xtreamAccount: null,
  xtreamPassVisible: false,
  channels: [...DEFAULT_CHANNELS],
  settings: { ...DEFAULT_SETTINGS },
  blogs: [...DEFAULT_BLOGS],
  reviews: [...DEFAULT_REVIEWS],
  favorites: new Set(JSON.parse(localStorage.getItem("bw_favorites") || "[]")),
  activeCategory: "ALL",
  searchQuery: "",
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
  initPlayer();
  bindNavigation();
  bindAuthModal();
  bindGuideControls();
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
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
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

  // Initial immediate render using built-in curated data (0ms first meaningful UI)
  renderCategoryChips();
  renderChannelGuide();
  renderChannelCards();
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

/* ==================== THEME ENGINE ==================== */
function renderThemeSwitcher() {
  const wrap = document.getElementById("themeSwitcher");
  if (!wrap) return;
  const activeTheme = document.documentElement.getAttribute("data-theme") || "barakat";
  wrap.innerHTML = THEMES.map(
    (t) =>
      `<button type="button" class="theme-dot ${t.id === activeTheme ? "active" : ""}" data-theme-id="${t.id}" style="background:${t.swatch}" title="${t.name}: ${t.desc}" aria-label="${t.name}"></button>`
  ).join("");

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-id]");
    if (!btn) return;
    const id = btn.dataset.themeId;
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("bw_theme", id);
    wrap.querySelectorAll(".theme-dot").forEach((d) => d.classList.toggle("active", d.dataset.themeId === id));
    showToast(`Theme switched to ${THEMES.find((x) => x.id === id)?.name || id}`);
  });
}

function applyDynamicSiteSettings() {
  const ticker = document.getElementById("siteTicker");
  if (ticker && state.settings.siteAnnouncement) {
    ticker.textContent = `🌊 ${state.settings.siteAnnouncement}`;
  }
}

/* ==================== BROADCAST PLAYER ==================== */
function initPlayer() {
  player = new BarakatPlayer({
    videoEl: document.getElementById("liveVideo"),
    statusEl: document.getElementById("playerStatusPill"),
    qualitySelectEl: document.getElementById("qualitySelect"),
    audioSelectEl: document.getElementById("audioSelect"),
    introOverlayEl: document.getElementById("introOverlay"),
    introCountdownEl: document.getElementById("introCountdown"),
    skipIntroBtnEl: document.getElementById("skipIntroBtn"),
    proOverlayEl: document.getElementById("proUnlockOverlay")
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
  state.currentChannel = channel;
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
  document.querySelectorAll(".nav-tab[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.jump));
  });
}

function switchView(viewName) {
  const valid = ["live", "xtream", "playlist", "pro", "blogs", "support"];
  const target = valid.includes(viewName) ? viewName : "live";
  valid.forEach((v) => {
    const sec = document.getElementById(`view-${v}`);
    if (sec) sec.hidden = v !== target;
  });
  document.querySelectorAll(".nav-tab[data-view]").forEach((btn) => {
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
  const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  if (["xtream", "playlist", "pro", "blogs", "support"].includes(hash)) {
    switchView(hash);
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
}

function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  if (!wrap) return;
  const uniqueCats = [...new Set(state.channels.map((c) => c.category).filter(Boolean))];
  const chips = [
    { key: "ALL", label: "All" },
    { key: "FREE", label: "Free HD" },
    { key: "PRO", label: "👑 PRO VIP" },
    { key: "FAV", label: "★ Favorites" },
    { key: "MY_PL", label: "📋 My Playlist" },
    ...uniqueCats.map((c) => ({ key: `CAT:${c}`, label: c }))
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
      category: cs.category || "My Custom Channels",
      tier: "free",
      logo: BRAND.logoPrimary,
      url: cs.url,
      nowPlaying: "Personal Custom M3U8 Stream"
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
        String(c.language || "").toLowerCase().includes(q)
    );
  }

  return list;
}

function renderChannelGuide() {
  const listEl = document.getElementById("channelList");
  const countEl = document.getElementById("channelCountLabel");
  if (!listEl) return;

  const filtered = getFilteredChannels();
  if (countEl) countEl.textContent = `${filtered.length} Channels`;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="muted-sm" style="padding:20px;text-align:center;">No channels match this filter. Try clicking "All".</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((ch) => {
      const isActive = state.currentChannel?.id === ch.id;
      const isFav = state.favorites.has(ch.id);
      const badge =
        ch.tier === "pro"
          ? `<span class="badge badge-gold">PRO</span>`
          : `<span class="badge badge-free">FREE</span>`;
      return `
        <div class="channel-item ${isActive ? "active" : ""}" data-play-id="${escAttr(ch.id)}">
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

  grid.innerHTML = filtered
    .map((ch) => {
      const badge =
        ch.tier === "pro"
          ? `<span class="badge badge-gold">👑 PRO VIP</span>`
          : `<span class="badge badge-free">FREE HD</span>`;
      return `
        <div class="ch-card glass-card" data-card-play="${escAttr(ch.id)}">
          <div class="ch-card-top">
            <img src="${escAttr(ch.logo || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" alt="${escAttr(ch.name)}" />
            ${badge}
          </div>
          <div>
            <div style="font-weight:800;font-size:0.95rem;">${escHtml(ch.name)}</div>
            <div class="muted-sm">${escHtml(ch.category)} &bull; ${escHtml(ch.language || "HD")}</div>
          </div>
          <div class="muted-sm" style="font-size:0.76rem;margin-top:auto;">▶ Click to Watch Live</div>
        </div>
      `;
    })
    .join("");

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
        <div style="color:var(--success);font-weight:700;">✅ Xtream Server Verified &amp; Responding!</div>
        <div class="muted-sm" style="margin-top:4px;">Status: <strong>${escHtml(data.user_info.status)}</strong> &bull; Max Connections: <strong>${escHtml(data.user_info.max_connections)}</strong> &bull; Timezone: <strong>${escHtml(data.server_info.timezone)}</strong></div>
      `;
    } else {
      box.innerHTML = `<div style="color:#fca5a5;">⚠ Auth check returned auth=0. Syncing your account now...</div>`;
      await dbWrite(`xtreamAccounts/${xt.username}`, xt);
    }
  } catch (err) {
    box.innerHTML = `<div style="color:#fca5a5;">Error testing API: ${escHtml(err?.message || "Failed")}</div>`;
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

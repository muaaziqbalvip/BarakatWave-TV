/**
 * BarakatWave Live TV — Enterprise Admin Command Center Controller
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
  THEMES,
  decorateGroupTitle,
  resolveCategoryMeta,
  getCategoryPriority,
  autoSortAndReindexChannels,
  moveChannelToPosition,
  insertOrUpdateChannelSmart,
  extractImdbId,
  metahubPoster,
  metahubBackdrop
} from "./default-data.js";
import { fetchImdbTitle } from "./imdb-client.js";
import {
  subscribeAuth,
  loginWithGoogle,
  loginWithEmailPassword,
  registerWithEmailPassword,
  startPreviewSession,
  logoutUser,
  isSandboxPreviewHost,
  dbRead,
  dbWrite,
  dbMerge,
  dbDelete
} from "./firebase-client.js";
import { parseM3uPlaylist, exportChannelsToM3u, slugify } from "./m3u-parser.js";

const admState = {
  user: null,
  isAdmin: false,
  channels: [...DEFAULT_CHANNELS],
  movies: [...DEFAULT_MOVIES],
  series: [...DEFAULT_SERIES],
  pendingImdbEpisodes: null,
  settings: { ...DEFAULT_SETTINGS },
  xtreamAccounts: [],
  blogs: [...DEFAULT_BLOGS],
  reviews: [...DEFAULT_REVIEWS],
  tickets: [],
  parsedBulk: [],
  selectedChannelIds: new Set(),
  dragSourceId: null,
  previewHls: null
};

function initAdmin() {
  renderAdminThemes();
  bindAdminTabs();
  bindAdminAuth();
  bindOverviewActions();
  bindChannelManager();
  bindImdbStudio();
  bindBulkImportExport();
  bindGitHubPublisher();
  bindDefaultsEditor();
  bindXtreamManager();
  bindSeoAndBlogs();
  bindSupportAndRules();

  subscribeAuth(async (user) => {
    admState.user = user;
    await evaluateAdminAccess(user);
  });
}

function renderAdminThemes() {
  const wrap = document.getElementById("adminThemeSwitcher");
  if (!wrap) return;

  const paint = () => {
    const active = document.documentElement.getAttribute("data-theme") || "daylight";
    const curObj = THEMES.find((t) => t.id === active) || THEMES[0];
    const isLight = curObj.mode === "light";
    wrap.innerHTML =
      `<button type="button" class="theme-mode-btn" data-toggle-mode="1" title="Switch Light / Dark Mode">${
        isLight ? "☀️ Light" : "🌙 Dark"
      }</button>` +
      THEMES.map(
        (t) =>
          `<button type="button" class="theme-dot ${t.id === active ? "active" : ""}" data-theme-id="${t.id}" style="background:${t.swatch}" title="${t.name}"></button>`
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
      return;
    }
    const b = e.target.closest("[data-theme-id]");
    if (!b) return;
    document.documentElement.setAttribute("data-theme", b.dataset.themeId);
    localStorage.setItem("bw_theme", b.dataset.themeId);
    paint();
  });
}

function bindAdminTabs() {
  document.querySelectorAll("[data-adm-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.admTab));
  });
  document.querySelectorAll("[data-jump-adm]").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.jumpAdm));
  });
}

function switchAdminTab(tab) {
  document.querySelectorAll("[data-adm-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.admTab === tab)
  );
  document.querySelectorAll("[data-adm-panel]").forEach((p) => {
    p.hidden = p.dataset.admPanel !== tab;
  });
}

/* ==================== ADMIN AUTH & OWNER BOOTSTRAP ==================== */
function bindAdminAuth() {
  const previewBox = document.getElementById("admPreviewBox");
  if (isSandboxPreviewHost() && previewBox) previewBox.hidden = false;

  document.getElementById("adminGoogleBtn")?.addEventListener("click", async () => {
    const res = await loginWithGoogle();
    if (!res.ok) showAdmErr(res.error);
  });

  document.getElementById("adminLoginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAdmErr("");
    const email = document.getElementById("admEmail").value.trim();
    const pass = document.getElementById("admPass").value;
    const res = await loginWithEmailPassword(email, pass);
    if (!res.ok) showAdmErr(res.error);
  });

  document.getElementById("admRegisterBtn")?.addEventListener("click", async () => {
    showAdmErr("");
    const email = document.getElementById("admEmail").value.trim();
    const pass = document.getElementById("admPass").value;
    if (!email || pass.length < 6) {
      showAdmErr("Enter your email and a 6+ character password first.");
      return;
    }
    const res = await registerWithEmailPassword("Muaaz Iqbal (Admin)", email, pass);
    if (!res.ok) showAdmErr(res.error);
  });

  document.getElementById("admPreviewBtn")?.addEventListener("click", async () => {
    await startPreviewSession({
      name: "Muaaz Iqbal",
      email: "muaaziqbal.vip@gmail.com",
      asAdmin: true
    });
    toast("Opened Admin Studio in Owner Mode!");
  });

  document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
    await logoutUser();
  });

  document.getElementById("claimFirstAdminBtn")?.addEventListener("click", async () => {
    if (!admState.user) return;
    await dbWrite(`admins/${admState.user.uid}`, true);
    await dbMerge(`users/${admState.user.uid}`, { role: "admin", plan: "pro" });
    toast("👑 Super Admin Ownership Claimed!");
    await evaluateAdminAccess(admState.user);
  });
}

function showAdmErr(msg) {
  const el = document.getElementById("admAuthErr");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function evaluateAdminAccess(user) {
  const gate = document.getElementById("adminAuthGate");
  const claimSec = document.getElementById("adminClaimSection");
  const workspace = document.getElementById("adminWorkspace");
  const badge = document.getElementById("adminIdentityBadge");
  const outBtn = document.getElementById("adminLogoutBtn");

  if (!user) {
    if (gate) gate.hidden = false;
    if (claimSec) claimSec.hidden = true;
    if (workspace) workspace.hidden = true;
    if (badge) badge.hidden = true;
    if (outBtn) outBtn.hidden = true;
    return;
  }

  if (outBtn) outBtn.hidden = false;
  if (gate) gate.hidden = true;

  const emailLower = String(user.email || "").toLowerCase();
  const isOwnerEmail = emailLower === BRAND.ownerEmail || Boolean(user.isAdminHint);
  const adminsMap = (await dbRead("admins", null)) || {};
  const hasAnyAdmin = Object.keys(adminsMap).length > 0;
  const isListedAdmin = Boolean(adminsMap[user.uid]);

  if (isOwnerEmail && !isListedAdmin) {
    await dbWrite(`admins/${user.uid}`, true);
  }

  if (isOwnerEmail || isListedAdmin) {
    admState.isAdmin = true;
    if (claimSec) claimSec.hidden = true;
    if (workspace) workspace.hidden = false;
    if (badge) {
      badge.hidden = false;
      badge.textContent = `👑 ${user.displayName || user.email || "ADMIN"}`;
    }
    await loadAllAdminData();
    return;
  }

  // First login when no admins exist yet -> allow 1-click Owner Bootstrap!
  if (workspace) workspace.hidden = true;
  if (claimSec) claimSec.hidden = false;
  const txt = document.getElementById("adminClaimText");
  const claimBtn = document.getElementById("claimFirstAdminBtn");
  if (!hasAnyAdmin) {
    if (txt) txt.textContent = `Welcome ${user.email || user.displayName}! No Admin owner is registered yet in Firebase RTDB. Click below to claim Super Admin ownership.`;
    if (claimBtn) claimBtn.hidden = false;
  } else {
    if (txt) txt.textContent = `Signed in as ${user.email}. This account is not listed in /admins. Sign in with ${BRAND.ownerEmail} or ask the Super Admin to grant access.`;
    if (claimBtn) claimBtn.hidden = true;
  }
}

async function loadAllAdminData() {
  const [chRaw, movRaw, serRaw, settingsRaw, xtRaw, blogsRaw, revRaw, tktRaw] = await Promise.all([
    dbRead("channels", null),
    dbRead("movies", null),
    dbRead("series", null),
    dbRead("settings/defaults", null),
    dbRead("xtreamAccounts", null),
    dbRead("blogs", null),
    dbRead("reviews", null),
    dbRead("tickets", null)
  ]);

  if (chRaw && typeof chRaw === "object") {
    const list = Array.isArray(chRaw)
      ? chRaw.filter(Boolean)
      : Object.entries(chRaw).map(([id, c]) => ({ id, ...c }));
    if (list.length) {
      admState.channels = list
        .map((c, idx) => {
          const meta = resolveCategoryMeta(c.category, c.name, c.country, false);
          return {
            ...c,
            category: meta.name,
            categoryId: meta.id,
            pinned: Boolean(c.pinned),
            order: typeof c.order === "number" ? c.order : idx + 1
          };
        })
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return (a.order ?? 9999) - (b.order ?? 9999);
        })
        .map((c, i) => ({ ...c, order: i + 1 }));
    }
  }

  // Hydrate full 1,570+ (2000–2026) IMDb Movies & Series catalog + merge RTDB overrides cleanly!
  let baseMovies = [...DEFAULT_MOVIES];
  let baseSeries = [...DEFAULT_SERIES];
  try {
    const catRes = await fetch("/api/imdb?action=catalog");
    if (catRes.ok) {
      const catJson = await catRes.json();
      if (Array.isArray(catJson.movies) && catJson.movies.length) baseMovies = catJson.movies;
      if (Array.isArray(catJson.series) && catJson.series.length) baseSeries = catJson.series;
    }
  } catch {
    // keep built-in seed fallback
  }

  const mergeAdminImdb = (baseArr, rawObj) => {
    const map = new Map();
    for (const item of baseArr) {
      map.set(String(item.imdbId || item.id).toLowerCase(), { ...item });
    }
    if (rawObj && typeof rawObj === "object") {
      const overrides = Array.isArray(rawObj)
        ? rawObj.filter(Boolean)
        : Object.entries(rawObj).map(([id, v]) => ({ id, ...v }));
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

  admState.movies = mergeAdminImdb(baseMovies, movRaw);
  admState.series = mergeAdminImdb(baseSeries, serRaw);

  if (settingsRaw && typeof settingsRaw === "object") {
    admState.settings = { ...DEFAULT_SETTINGS, ...settingsRaw };
  }

  admState.xtreamAccounts = xtRaw && typeof xtRaw === "object" ? Object.values(xtRaw).filter((x) => x && x.username) : [];

  const blogMap = new Map(DEFAULT_BLOGS.map((b) => [b.slug, b]));
  if (blogsRaw && typeof blogsRaw === "object") {
    Object.entries(blogsRaw).forEach(([k, b]) => {
      if (b && b.title) blogMap.set(b.slug || k, { ...b, slug: b.slug || k });
    });
  }
  admState.blogs = [...blogMap.values()];

  if (revRaw && typeof revRaw === "object") {
    const revs = Object.entries(revRaw).map(([id, r]) => ({ id, ...r })).filter((r) => r && r.comment);
    if (revs.length) admState.reviews = revs;
  }

  admState.tickets = tktRaw && typeof tktRaw === "object"
    ? Object.entries(tktRaw).map(([id, t]) => ({ id, ...t })).filter((t) => t && t.subject)
    : [];

  renderKpis();
  populateEmojiGroupSelects();
  renderAdminChannelsTable();
  renderAdminImdbTable();
  populateDefaultsForm();
  renderXtreamTable();
  renderAdminBlogsTable();
  renderAdminTicketsAndReviews();
}

function renderKpis() {
  const totalCh = admState.channels.length;
  const proCh = admState.channels.filter((c) => c.tier === "pro").length;
  const freeCh = totalCh - proCh;
  setTxt("kpiChannels", totalCh);
  setTxt("kpiChannelsSub", `${freeCh} Free • ${proCh} PRO VIP`);

  const proXt = admState.xtreamAccounts.filter((x) => x.plan === "pro").length;
  setTxt("kpiXtream", admState.xtreamAccounts.length);
  setTxt("kpiXtreamSub", `${proXt} PRO VIP Active`);

  setTxt("kpiBlogs", admState.blogs.length);
  setTxt("kpiTickets", admState.tickets.filter((t) => t.status !== "Resolved").length);
  setTxt("kpiReviewsSub", `${admState.reviews.length} Community Reviews`);
  setTxt("kpiImdb", admState.movies.length + admState.series.length);
  setTxt("kpiImdbSub", `${admState.movies.length} Movies • ${admState.series.length} Series`);
}

function bindOverviewActions() {
  document.getElementById("seedRtdbBtn")?.addEventListener("click", async () => {
    const chObj = {};
    admState.channels.forEach((c, idx) => {
      const id = c.id || `ch_${1001 + idx}`;
      chObj[id] = { ...c, id, order: idx + 1 };
    });
    const blogObj = {};
    admState.blogs.forEach((b) => {
      blogObj[b.slug] = b;
    });
    await dbWrite("channels", chObj);
    await dbWrite("settings/defaults", admState.settings);
    await dbWrite("blogs", blogObj);
    toast(`✅ Synced ${admState.channels.length} Channels & ${admState.blogs.length} Blogs to RTDB! (${admState.movies.length + admState.series.length} 2000–2026 IMDb Titles Auto-Active!)`);
  });

  document.getElementById("quickPingSeoBtn")?.addEventListener("click", () => {
    switchAdminTab("seo");
    document.getElementById("pingIndexNowBtn")?.click();
  });
}

/* ==================== TAB 2: CHANNELS, SORTING, DRAG-DROP & AUTO-ADJUST ==================== */
function populateEmojiGroupSelects(selectedValue = "") {
  const chSel = document.getElementById("chCategorySelect");
  const chCustomInp = document.getElementById("chCategory");
  const grpFilter = document.getElementById("admGroupFilter");
  const bulkSel = document.getElementById("admBulkGroupSelect");

  const canonicalNames = CATEGORIES.map((c) => c.name);
  const extraCustom = [
    ...new Set(
      admState.channels
        .map((c) => c.category)
        .filter((g) => g && !canonicalNames.includes(g))
    )
  ];
  const allGroups = [...canonicalNames, ...extraCustom];

  if (chSel) {
    chSel.innerHTML = [
      ...CATEGORIES.map(
        (c) => `<option value="${escAttr(c.name)}">#${c.priority} — ${esc(c.name)}</option>`
      ),
      ...extraCustom.map(
        (g) => `<option value="${escAttr(g)}">✨ ${esc(g)}</option>`
      ),
      `<option value="__CUSTOM__">➕ Custom Emoji Group...</option>`
    ].join("");

    if (selectedValue) {
      if (allGroups.includes(selectedValue)) {
        chSel.value = selectedValue;
        if (chCustomInp) {
          chCustomInp.hidden = true;
          chCustomInp.value = selectedValue;
        }
      } else {
        chSel.value = "__CUSTOM__";
        if (chCustomInp) {
          chCustomInp.hidden = false;
          chCustomInp.value = selectedValue;
        }
      }
    } else if (chCustomInp) {
      chCustomInp.hidden = chSel.value !== "__CUSTOM__";
    }
  }

  if (grpFilter) {
    const prev = grpFilter.value || "ALL";
    grpFilter.innerHTML = [
      `<option value="ALL">🗂 All Emoji Groups (${admState.channels.length})</option>`,
      ...allGroups.map((g) => {
        const cnt = admState.channels.filter((c) => c.category === g).length;
        return `<option value="${escAttr(g)}">${esc(g)} (${cnt})</option>`;
      })
    ].join("");
    grpFilter.value = allGroups.includes(prev) ? prev : "ALL";
  }

  if (bulkSel) {
    bulkSel.innerHTML = CATEGORIES.map(
      (c) => `<option value="${escAttr(c.name)}">${esc(c.name)}</option>`
    ).join("");
  }
}

function bindChannelManager() {
  populateEmojiGroupSelects();

  const chSel = document.getElementById("chCategorySelect");
  const chCustomInp = document.getElementById("chCategory");
  chSel?.addEventListener("change", () => {
    if (!chCustomInp) return;
    if (chSel.value === "__CUSTOM__") {
      chCustomInp.hidden = false;
      chCustomInp.value = "";
      chCustomInp.focus();
    } else {
      chCustomInp.hidden = true;
      chCustomInp.value = chSel.value;
    }
  });

  const runAutoDetectGroup = () => {
    const nm = document.getElementById("chName")?.value.trim() || "";
    const ctry = document.getElementById("chCountry")?.value.trim() || "PK";
    if (!nm) return toast("Type a Channel Name first so we can auto-detect its Emoji Group!");
    const detected = resolveCategoryMeta("", nm, ctry, true);
    populateEmojiGroupSelects(detected.name);
    toast(`✨ Auto-Detected Group: ${detected.name}`);
  };

  document.getElementById("autoDetectGroupBtn")?.addEventListener("click", runAutoDetectGroup);

  document.getElementById("chName")?.addEventListener("blur", () => {
    const isEditing = Boolean(document.getElementById("chEditId")?.value);
    const nm = document.getElementById("chName")?.value.trim() || "";
    if (!isEditing && nm && chSel && chSel.value !== "__CUSTOM__") {
      const detected = resolveCategoryMeta("", nm, document.getElementById("chCountry")?.value || "PK", true);
      populateEmojiGroupSelects(detected.name);
    }
  });

  document.getElementById("probeSingleBtn")?.addEventListener("click", async () => {
    const url = document.getElementById("chUrl")?.value.trim();
    if (!url) return toast("Paste an .m3u8 URL first!");
    const box = document.getElementById("probeSingleResult");
    box.hidden = false;
    box.innerHTML = `<span class="muted-sm">Probing stream health &amp; latency...</span>`;

    try {
      const res = await fetch(`/api/probe?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      const item = data?.results?.[0];
      if (item?.ok) {
        box.innerHTML = `<div class="text-success" style="font-weight:700;">✅ Stream Working! HTTP ${item.status} • Latency: ${item.latencyMs}ms ${item.isHls ? "• Valid HLS (.m3u8)" : ""}</div>`;
      } else {
        box.innerHTML = `<div class="text-danger" style="font-weight:700;">⚠ Server probe note: ${esc(item?.error || "Check browser preview below (stream may require browser/CORS playback)")}</div>`;
      }
    } catch {
      box.innerHTML = `<span class="muted-sm">Opening browser HLS preview...</span>`;
    }
    openMiniVideoPreview("adminPreviewVideo", "adminMiniPreviewWrap", url);
  });

  document.getElementById("closeMiniPreviewBtn")?.addEventListener("click", () => {
    stopMiniPreview("adminPreviewVideo", "adminMiniPreviewWrap");
  });

  document.getElementById("chResetBtn")?.addEventListener("click", resetChannelForm);

  document.getElementById("channelForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("chEditId").value.trim();
    const name = document.getElementById("chName").value.trim();
    const selVal = document.getElementById("chCategorySelect")?.value || "";
    const rawCat =
      selVal === "__CUSTOM__"
        ? decorateGroupTitle(document.getElementById("chCategory")?.value.trim() || "Custom Live TV")
        : selVal || CATEGORIES[0].name;
    const tier = document.getElementById("chTier").value === "pro" ? "pro" : "free";
    const country = document.getElementById("chCountry").value.trim() || "PK";
    const orderRaw = document.getElementById("chOrderInput")?.value.trim() || "";
    const pinned = Boolean(document.getElementById("chPinnedCheck")?.checked);
    const url = document.getElementById("chUrl").value.trim();
    const logo = document.getElementById("chLogo").value.trim() || BRAND.logoPrimary;
    const backups = document.getElementById("chBackups").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const introVideoUrl = document.getElementById("chIntroOverride").value.trim();
    const proUnlockVideoUrl = document.getElementById("chProUnlockOverride")?.value.trim() || "";
    const offlineVideoUrl = document.getElementById("chOfflineOverride")?.value.trim() || "";

    const catMeta = resolveCategoryMeta(rawCat, name, country, false);
    const slug = slugify(name) || `channel-${Date.now()}`;
    const existing = admState.channels.find((c) => c.id === editId);
    const maxStreamId = admState.channels.reduce((m, c) => Math.max(m, Number(c.streamId) || 1000), 1000);

    const record = {
      ...(existing || {}),
      id: editId || `ch_${slug}_${Math.floor(100 + Math.random() * 900)}`,
      streamId: existing ? existing.streamId : maxStreamId + 1,
      slug,
      name,
      category: catMeta.name,
      categoryId: catMeta.id,
      country,
      language: existing?.language || "Urdu / English",
      tier,
      pinned,
      status: "active",
      logo,
      epgId: existing?.epgId || `${slug}.bw`,
      url,
      backupUrls: backups,
      introVideoUrl,
      proUnlockVideoUrl,
      offlineVideoUrl
    };

    const parsedOrder = Number(orderRaw);
    let explicitPos = Number.isFinite(parsedOrder) && parsedOrder >= 1 ? Math.round(parsedOrder) : null;
    // If editing an existing channel without changing its category and order box left unchanged, keep its relative slot unless group changed
    if (!explicitPos && existing && existing.category === record.category && Boolean(existing.pinned) === pinned) {
      explicitPos = existing.order;
    }

    admState.channels = insertOrUpdateChannelSmart(admState.channels, record, {
      explicitPosition: explicitPos
    });

    await persistAllChannels();
    resetChannelForm();
    populateEmojiGroupSelects();
    renderAdminChannelsTable();
    renderKpis();
    const saved = admState.channels.find((c) => c.id === record.id);
    toast(`✅ Saved "${name}" at #${saved?.order || 1} (${catMeta.shortLabel || catMeta.name}) — All other channels auto-adjusted!`);
  });

  // 1-Click Smart Priority Auto-Sort All (PK Top -> Islamic -> Drama -> News -> Movies & Others)
  document.getElementById("smartAutoSortBtn")?.addEventListener("click", async () => {
    admState.channels = autoSortAndReindexChannels(admState.channels, { reclassify: true });
    await persistAllChannels();
    populateEmojiGroupSelects();
    renderAdminChannelsTable();
    toast("✨ Smart Auto-Sort Complete! 1. 🇵🇰 PK Top ➔ 2. 🕌 Islamic ➔ 3. 🎭 Drama ➔ 4. 📰 News ➔ 5. 🎬 Movies & Others!");
  });

  // Sort A–Z inside Priority Groups
  document.getElementById("admSortAzBtn")?.addEventListener("click", async () => {
    const sorted = [...admState.channels].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const pa = getCategoryPriority(a.category, a.categoryId);
      const pb = getCategoryPriority(b.category, b.categoryId);
      if (pa !== pb) return pa - pb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    admState.channels = sorted.map((c, idx) => ({ ...c, order: idx + 1 }));
    await persistAllChannels();
    renderAdminChannelsTable();
    toast("🔤 Sorted A–Z inside each Priority Emoji Group & re-indexed #1..#N!");
  });

  // Filters & View Sort
  document.getElementById("admChFilter")?.addEventListener("input", renderAdminChannelsTable);
  document.getElementById("admGroupFilter")?.addEventListener("change", renderAdminChannelsTable);
  document.getElementById("admTierFilter")?.addEventListener("change", renderAdminChannelsTable);
  document.getElementById("admSortSelect")?.addEventListener("change", renderAdminChannelsTable);

  // Select All Checkbox
  document.getElementById("selectAllChCheck")?.addEventListener("change", (e) => {
    const visibleIds = getFilteredAdminChannels().map((c) => c.id);
    if (e.target.checked) {
      visibleIds.forEach((id) => admState.selectedChannelIds.add(id));
    } else {
      visibleIds.forEach((id) => admState.selectedChannelIds.delete(id));
    }
    renderAdminChannelsTable();
  });

  // Bulk Actions (Move to Emoji Group / Tier / Delete with Auto-Adjust)
  document.getElementById("admBulkApplyGroupBtn")?.addEventListener("click", async () => {
    const targetGrp = document.getElementById("admBulkGroupSelect")?.value;
    if (!targetGrp || !admState.selectedChannelIds.size) return;
    const catMeta = resolveCategoryMeta(targetGrp, "", "PK", false);
    admState.channels = admState.channels.map((c) =>
      admState.selectedChannelIds.has(c.id)
        ? { ...c, category: catMeta.name, categoryId: catMeta.id }
        : c
    );
    admState.channels = autoSortAndReindexChannels(admState.channels, { reclassify: false });
    const count = admState.selectedChannelIds.size;
    admState.selectedChannelIds.clear();
    await persistAllChannels();
    populateEmojiGroupSelects();
    renderAdminChannelsTable();
    toast(`🗂 Moved ${count} channels to ${catMeta.name} & auto-sorted #1..#N!`);
  });

  document.getElementById("admBulkSetFreeBtn")?.addEventListener("click", async () => {
    if (!admState.selectedChannelIds.size) return;
    admState.channels.forEach((c) => {
      if (admState.selectedChannelIds.has(c.id)) c.tier = "free";
    });
    const count = admState.selectedChannelIds.size;
    admState.selectedChannelIds.clear();
    await persistAllChannels();
    renderAdminChannelsTable();
    renderKpis();
    toast(`🟢 Switched ${count} channels to FREE HD!`);
  });

  document.getElementById("admBulkSetProBtn")?.addEventListener("click", async () => {
    if (!admState.selectedChannelIds.size) return;
    admState.channels.forEach((c) => {
      if (admState.selectedChannelIds.has(c.id)) c.tier = "pro";
    });
    const count = admState.selectedChannelIds.size;
    admState.selectedChannelIds.clear();
    await persistAllChannels();
    renderAdminChannelsTable();
    renderKpis();
    toast(`👑 Switched ${count} channels to PRO VIP!`);
  });

  document.getElementById("admBulkDeleteBtn")?.addEventListener("click", async () => {
    if (!admState.selectedChannelIds.size) return;
    const count = admState.selectedChannelIds.size;
    admState.channels = admState.channels
      .filter((c) => !admState.selectedChannelIds.has(c.id))
      .map((c, idx) => ({ ...c, order: idx + 1 }));
    admState.selectedChannelIds.clear();
    await persistAllChannels();
    populateEmojiGroupSelects();
    renderAdminChannelsTable();
    renderKpis();
    toast(`Removed ${count} channels — remaining ${admState.channels.length} channels auto-adjusted (#1..#${admState.channels.length})!`);
  });
}

function resetChannelForm() {
  document.getElementById("channelForm")?.reset();
  document.getElementById("chEditId").value = "";
  const ordInp = document.getElementById("chOrderInput");
  if (ordInp) ordInp.value = "";
  const pinChk = document.getElementById("chPinnedCheck");
  if (pinChk) pinChk.checked = false;
  populateEmojiGroupSelects(CATEGORIES[0].name);
  setTxt("chFormHeading", "➕ Add / Edit Live Channel & Test Working M3U8");
  document.getElementById("probeSingleResult").hidden = true;
  stopMiniPreview("adminPreviewVideo", "adminMiniPreviewWrap");
}

async function persistAllChannels() {
  admState.channels = admState.channels.map((c, i) => ({ ...c, order: i + 1 }));
  const map = {};
  admState.channels.forEach((c) => {
    map[c.id] = c;
  });
  await dbWrite("channels", map);
  // Instant server-cache sync for Xtream API & M3U endpoints
  fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "channels", value: map })
  }).catch(() => {});
}

function getFilteredAdminChannels() {
  const q = (document.getElementById("admChFilter")?.value || "").trim().toLowerCase();
  const grp = document.getElementById("admGroupFilter")?.value || "ALL";
  const tier = document.getElementById("admTierFilter")?.value || "ALL";
  const viewSort = document.getElementById("admSortSelect")?.value || "order";

  let list = [...admState.channels];

  if (grp !== "ALL") {
    list = list.filter((c) => c.category === grp);
  }
  if (tier === "free") {
    list = list.filter((c) => c.tier !== "pro");
  } else if (tier === "pro") {
    list = list.filter((c) => c.tier === "pro");
  } else if (tier === "pinned") {
    list = list.filter((c) => Boolean(c.pinned));
  }

  if (q) {
    list = list.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.category || "").toLowerCase().includes(q) ||
        String(c.country || "").toLowerCase().includes(q) ||
        String(c.url || "").toLowerCase().includes(q) ||
        String(c.streamId || "").includes(q) ||
        `#${c.order || ""}` === q
    );
  }

  list.sort((a, b) => {
    if (viewSort === "az") {
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    if (viewSort === "stream_id") {
      return (Number(a.streamId) || 0) - (Number(b.streamId) || 0);
    }
    if (viewSort === "priority") {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const pa = getCategoryPriority(a.category, a.categoryId);
      const pb = getCategoryPriority(b.category, b.categoryId);
      if (pa !== pb) return pa - pb;
      return (a.order ?? 9999) - (b.order ?? 9999);
    }
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (a.order ?? 9999) - (b.order ?? 9999);
  });

  return list;
}

function updateBulkToolbarState(visibleList) {
  const bulkBar = document.getElementById("admBulkBar");
  const countSpan = document.getElementById("admBulkSelectedCount");
  const selectAllChk = document.getElementById("selectAllChCheck");

  // Prune deleted IDs
  const validSet = new Set(admState.channels.map((c) => c.id));
  for (const id of [...admState.selectedChannelIds]) {
    if (!validSet.has(id)) admState.selectedChannelIds.delete(id);
  }

  const selCount = admState.selectedChannelIds.size;
  if (bulkBar) bulkBar.hidden = selCount === 0;
  if (countSpan) countSpan.textContent = String(selCount);
  if (selectAllChk) {
    selectAllChk.checked =
      visibleList.length > 0 && visibleList.every((c) => admState.selectedChannelIds.has(c.id));
  }
}

function renderAdminChannelsTable() {
  const tbody = document.getElementById("admChannelsTbody");
  if (!tbody) return;
  const list = getFilteredAdminChannels();

  setTxt("admChCount", list.length);
  updateBulkToolbarState(list);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;" class="muted-sm">No channels match your current search/filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((ch) => {
      const checked = admState.selectedChannelIds.has(ch.id) ? "checked" : "";
      const pos = ch.order || 1;
      return `
      <tr draggable="true" data-row-id="${escAttr(ch.id)}" data-row-pos="${pos}">
        <td>
          <input type="checkbox" data-sel-ch="${escAttr(ch.id)}" ${checked} />
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="drag-handle" title="Drag to reorder — other channels auto-adjust!">⠿</span>
            <input
              type="number"
              min="1"
              max="${admState.channels.length}"
              value="${pos}"
              class="input-field order-num-input"
              data-order-input="${escAttr(ch.id)}"
              title="Type new position # and press Enter — all other channels auto-adjust!"
            />
            <div class="mini-move-btns">
              <button type="button" class="mini-move-btn" data-move-top="${escAttr(ch.id)}" title="Move to #1">⏫</button>
              <button type="button" class="mini-move-btn" data-move-up="${escAttr(ch.id)}" title="Move Up 1">⬆️</button>
              <button type="button" class="mini-move-btn" data-move-down="${escAttr(ch.id)}" title="Move Down 1">⬇️</button>
              <button type="button" class="mini-move-btn ${ch.pinned ? "pinned-active" : ""}" data-pin-ch="${escAttr(ch.id)}" title="Pin / Unpin Top">📌</button>
            </div>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:9px;">
            <img src="${escAttr(ch.logo || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" style="width:32px;height:32px;border-radius:7px;object-fit:contain;" alt="" />
            <div>
              <strong>${esc(ch.name)}</strong> <code style="font-size:0.7rem;">#${ch.streamId || 1001}</code>
              <div class="muted-sm" style="font-size:0.72rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ch.url)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge badge-cyan" style="font-size:0.73rem;">${esc(ch.category)}</span>
        </td>
        <td>
          <button type="button" class="badge ${ch.tier === "pro" ? "badge-gold" : "badge-free"}" style="cursor:pointer;" data-toggle-tier="${escAttr(ch.id)}" title="Click to switch Free / PRO VIP">
            ${ch.tier === "pro" ? "👑 PRO VIP" : "🟢 FREE"}
          </button>
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-outline" data-edit-ch="${escAttr(ch.id)}" title="Edit Channel">✏️ Edit</button>
            <button type="button" class="btn btn-sm btn-outline" data-copy-ch="${escAttr(ch.slug)}" title="Copy Clean BarakatWave M3U8 URL">🔗 M3U8</button>
            <button type="button" class="btn btn-sm btn-outline" data-copy-xt="${escAttr(ch.streamId || 1001)}" title="Copy Xtream Test Stream Link (/live/demo/demo/...)">📺 Xtream</button>
            <button type="button" class="btn btn-sm btn-outline" data-dl-ch="${escAttr(ch.id)}" title="Download Channel .M3U8 File">⬇</button>
            <button type="button" class="btn btn-sm btn-danger" data-del-ch="${escAttr(ch.id)}" title="Delete & Auto-Adjust Remaining">✕</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  // Row selection checkboxes
  tbody.querySelectorAll("[data-sel-ch]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.selCh;
      if (chk.checked) admState.selectedChannelIds.add(id);
      else admState.selectedChannelIds.delete(id);
      updateBulkToolbarState(list);
    });
  });

  // Direct Position # Input -> Move & Auto-Adjust all other channels!
  tbody.querySelectorAll("[data-order-input]").forEach((inp) => {
    const applyOrderChange = async () => {
      const id = inp.dataset.orderInput;
      const current = admState.channels.find((c) => c.id === id);
      const target = Math.max(1, Math.min(admState.channels.length, Number(inp.value) || 1));
      if (!current || current.order === target) {
        inp.value = current ? current.order : 1;
        return;
      }
      admState.channels = moveChannelToPosition(admState.channels, id, target);
      await persistAllChannels();
      renderAdminChannelsTable();
      toast(`🔢 Moved "${current.name}" to #${target} — all other channels auto-adjusted!`);
    };
    inp.addEventListener("change", applyOrderChange);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.blur();
      }
    });
  });

  // Move to #1 / Up / Down / Pin -> Auto-Adjust all other channels!
  tbody.querySelectorAll("[data-move-top]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.moveTop;
      const ch = admState.channels.find((c) => c.id === id);
      if (!ch) return;
      admState.channels = moveChannelToPosition(admState.channels, id, 1);
      await persistAllChannels();
      renderAdminChannelsTable();
      toast(`⏫ Moved "${ch.name}" to #1 — remaining channels shifted cleanly!`);
    });
  });

  tbody.querySelectorAll("[data-move-up]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.moveUp;
      const ch = admState.channels.find((c) => c.id === id);
      if (!ch || ch.order <= 1) return;
      admState.channels = moveChannelToPosition(admState.channels, id, ch.order - 1);
      await persistAllChannels();
      renderAdminChannelsTable();
    });
  });

  tbody.querySelectorAll("[data-move-down]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.moveDown;
      const ch = admState.channels.find((c) => c.id === id);
      if (!ch || ch.order >= admState.channels.length) return;
      admState.channels = moveChannelToPosition(admState.channels, id, ch.order + 1);
      await persistAllChannels();
      renderAdminChannelsTable();
    });
  });

  tbody.querySelectorAll("[data-pin-ch]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.pinCh;
      const ch = admState.channels.find((c) => c.id === id);
      if (!ch) return;
      ch.pinned = !ch.pinned;
      if (ch.pinned) {
        admState.channels = moveChannelToPosition(admState.channels, id, 1);
      } else {
        admState.channels = autoSortAndReindexChannels(admState.channels, { reclassify: false });
      }
      await persistAllChannels();
      renderAdminChannelsTable();
      toast(ch.pinned ? `📌 Pinned "${ch.name}" to Top (#1)!` : `Unpinned "${ch.name}" — auto-adjusted into group!`);
    });
  });

  // HTML5 Drag-and-Drop Row Reordering with Auto-Adjust!
  tbody.querySelectorAll("tr[data-row-id]").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") {
        e.preventDefault();
        return;
      }
      admState.dragSourceId = row.dataset.rowId;
      row.classList.add("dragging-row");
      e.dataTransfer?.setData("text/plain", row.dataset.rowId);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging-row");
      tbody.querySelectorAll(".drag-over-row").forEach((r) => r.classList.remove("drag-over-row"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (admState.dragSourceId && admState.dragSourceId !== row.dataset.rowId) {
        row.classList.add("drag-over-row");
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-row");
    });
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drag-over-row");
      const sourceId = admState.dragSourceId || e.dataTransfer?.getData("text/plain");
      const targetPos = Number(row.dataset.rowPos) || 1;
      admState.dragSourceId = null;
      if (!sourceId || sourceId === row.dataset.rowId) return;
      const moved = admState.channels.find((c) => c.id === sourceId);
      admState.channels = moveChannelToPosition(admState.channels, sourceId, targetPos);
      await persistAllChannels();
      renderAdminChannelsTable();
      toast(`⠿ Dropped "${moved?.name || "Channel"}" at #${targetPos} — all other channels auto-adjusted!`);
    });
  });

  tbody.querySelectorAll("[data-toggle-tier]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ch = admState.channels.find((c) => c.id === btn.dataset.toggleTier);
      if (!ch) return;
      ch.tier = ch.tier === "pro" ? "free" : "pro";
      await persistAllChannels();
      renderAdminChannelsTable();
      renderKpis();
      toast(`Switched "${ch.name}" to ${ch.tier.toUpperCase()}`);
    });
  });

  tbody.querySelectorAll("[data-copy-ch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const link = `${window.location.origin}/ch/${btn.dataset.copyCh}.m3u8`;
      navigator.clipboard?.writeText(link);
      toast(`Copied Channel M3U8: ${link}`);
    });
  });

  tbody.querySelectorAll("[data-copy-xt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const link = `${window.location.origin}/live/demo/demo/${btn.dataset.copyXt}.m3u8`;
      navigator.clipboard?.writeText(link);
      toast(`Copied Xtream Stream Link: ${link}`);
    });
  });

  tbody.querySelectorAll("[data-dl-ch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = admState.channels.find((c) => c.id === btn.dataset.dlCh);
      if (!ch) return;
      const content = exportChannelsToM3u([ch], {
        baseUrl: window.location.origin,
        useCleanLinks: true,
        title: ch.name
      });
      downloadFile(`${ch.slug}.m3u8`, content, "audio/x-mpegurl");
    });
  });

  tbody.querySelectorAll("[data-edit-ch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = admState.channels.find((c) => c.id === btn.dataset.editCh);
      if (!ch) return;
      document.getElementById("chEditId").value = ch.id;
      document.getElementById("chName").value = ch.name || "";
      populateEmojiGroupSelects(ch.category || CATEGORIES[0].name);
      document.getElementById("chTier").value = ch.tier === "pro" ? "pro" : "free";
      document.getElementById("chCountry").value = ch.country || "PK";
      const ordInp = document.getElementById("chOrderInput");
      if (ordInp) ordInp.value = ch.order || "";
      const pinChk = document.getElementById("chPinnedCheck");
      if (pinChk) pinChk.checked = Boolean(ch.pinned);
      document.getElementById("chUrl").value = ch.url || "";
      document.getElementById("chLogo").value = ch.logo || "";
      document.getElementById("chBackups").value = (ch.backupUrls || []).join(", ");
      document.getElementById("chIntroOverride").value = ch.introVideoUrl || "";
      const proOv = document.getElementById("chProUnlockOverride");
      if (proOv) proOv.value = ch.proUnlockVideoUrl || "";
      const offOv = document.getElementById("chOfflineOverride");
      if (offOv) offOv.value = ch.offlineVideoUrl || "";
      setTxt("chFormHeading", `✏️ Editing #${ch.order || 1}: ${ch.name}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  tbody.querySelectorAll("[data-del-ch]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const removed = admState.channels.find((c) => c.id === btn.dataset.delCh);
      admState.channels = admState.channels
        .filter((c) => c.id !== btn.dataset.delCh)
        .map((c, idx) => ({ ...c, order: idx + 1 }));
      admState.selectedChannelIds.delete(btn.dataset.delCh);
      await persistAllChannels();
      populateEmojiGroupSelects();
      renderAdminChannelsTable();
      renderKpis();
      toast(`Removed "${removed?.name || "Channel"}" — remaining channels auto-adjusted (#1..#${admState.channels.length})!`);
    });
  });
}

/* ==================== TAB 2B: IMDb MOVIES & SERIES AUTO-LOADER STUDIO ==================== */
function populateImdbCategoryOptions(kind = "movie", selectedVal = "") {
  const sel = document.getElementById("imdbCategorySelect");
  if (!sel) return;
  const cats = kind === "series" ? SERIES_CATEGORIES : VOD_CATEGORIES;
  sel.innerHTML = cats
    .map((c) => `<option value="${escAttr(c.name)}">${esc(c.name)}</option>`)
    .join("");
  if (selectedVal && cats.some((c) => c.name === selectedVal)) {
    sel.value = selectedVal;
  }
}

function bindImdbStudio() {
  populateImdbCategoryOptions("movie");

  const kindSel = document.getElementById("imdbKindSelect");
  kindSel?.addEventListener("change", () => {
    populateImdbCategoryOptions(kindSel.value);
  });

  document.getElementById("admFetchImdbBtn")?.addEventListener("click", async () => {
    const raw = document.getElementById("admImdbIdInput")?.value.trim() || "";
    const prefType = document.getElementById("admImdbTypeSelect")?.value || "auto";
    if (!raw) return toast("Paste an IMDb ID first (e.g. tt1375666 or tt4320258)!");
    toast("⚡ Loading official IMDb Rating, Poster, Cast & Plot...");
    try {
      const item = await fetchImdbTitle(raw, prefType);
      const isSeries = item.type === "series" || Array.isArray(item.episodes);
      document.getElementById("admImdbIdInput").value = item.imdbId || raw;
      document.getElementById("imdbTitleInput").value = item.title || "";
      document.getElementById("imdbKindSelect").value = isSeries ? "series" : "movie";
      populateImdbCategoryOptions(isSeries ? "series" : "movie", item.category);
      document.getElementById("imdbRatingInput").value = item.imdbRating || "8.2";
      document.getElementById("imdbYearInput").value = item.year || "2024";
      document.getElementById("imdbPosterInput").value = item.poster || "";
      document.getElementById("imdbBackdropInput").value = item.backdrop || "";
      document.getElementById("imdbGenresInput").value = Array.isArray(item.genres)
        ? item.genres.join(", ")
        : String(item.genres || "");
      document.getElementById("imdbDirectorInput").value = item.director || "";
      document.getElementById("imdbCastInput").value = item.cast || "";
      document.getElementById("imdbPlotInput").value = item.plot || "";
      admState.pendingImdbEpisodes = isSeries ? item.episodes || null : null;
      toast(`✅ Loaded "${item.title}" (⭐ ${item.imdbRating} on IMDb) — Click Save to publish!`);
    } catch (err) {
      toast(err?.message || "Failed to load IMDb ID");
    }
  });

  document.getElementById("imdbResetBtn")?.addEventListener("click", resetImdbForm);

  document.getElementById("imdbForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editKey = document.getElementById("imdbEditKey")?.value.trim() || "";
    const rawImdb = document.getElementById("admImdbIdInput")?.value.trim() || "";
    const imdbId = extractImdbId(rawImdb) || `tt${Math.floor(1000000 + Math.random() * 8999999)}`;
    const kind = document.getElementById("imdbKindSelect")?.value === "series" ? "series" : "movie";
    const title = document.getElementById("imdbTitleInput")?.value.trim() || `IMDb Title (${imdbId})`;
    const imdbRating = document.getElementById("imdbRatingInput")?.value.trim() || "8.0";
    const year = document.getElementById("imdbYearInput")?.value.trim() || "2024";
    const category = document.getElementById("imdbCategorySelect")?.value || "";
    const tier = document.getElementById("imdbTierSelect")?.value === "pro" ? "pro" : "free";
    const poster = document.getElementById("imdbPosterInput")?.value.trim() || metahubPoster(imdbId);
    const backdrop = document.getElementById("imdbBackdropInput")?.value.trim() || metahubBackdrop(imdbId);
    const streamUrl = document.getElementById("imdbStreamUrlInput")?.value.trim() || "";
    const genres = (document.getElementById("imdbGenresInput")?.value || "Drama")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const director = document.getElementById("imdbDirectorInput")?.value.trim() || "IMDb Selection";
    const cast = document.getElementById("imdbCastInput")?.value.trim() || "Featured Cast";
    const plot = document.getElementById("imdbPlotInput")?.value.trim() || `${title} on BarakatWave Cinema.`;

    if (kind === "movie") {
      const catMeta = VOD_CATEGORIES.find((c) => c.name === category) || VOD_CATEGORIES[0];
      const existingIdx = admState.movies.findIndex((m) => m.id === editKey || m.imdbId === imdbId);
      const maxSid = admState.movies.reduce((acc, m) => Math.max(acc, Number(m.streamId) || 5000), 5000);
      const rec = {
        id: existingIdx >= 0 ? admState.movies[existingIdx].id : `mov_${imdbId}`,
        streamId: existingIdx >= 0 ? admState.movies[existingIdx].streamId : maxSid + 1,
        imdbId,
        title,
        year,
        imdbRating,
        runtime: "135 min",
        genres,
        category: catMeta.name,
        categoryId: catMeta.id,
        customCategory: true,
        director,
        cast,
        plot,
        poster,
        backdrop,
        tier,
        streamUrl,
        order: existingIdx >= 0 ? admState.movies[existingIdx].order : 0
      };
      if (existingIdx >= 0) admState.movies[existingIdx] = rec;
      else admState.movies.unshift(rec);
      await persistSingleImdbItem("movie", rec);
    } else {
      const catMeta = SERIES_CATEGORIES.find((c) => c.name === category) || SERIES_CATEGORIES[0];
      const existingIdx = admState.series.findIndex((s) => s.id === editKey || s.imdbId === imdbId);
      const maxSeriesId = admState.series.reduce((acc, s) => Math.max(acc, Number(s.seriesId) || 10000), 10000);
      const seriesId = existingIdx >= 0 ? admState.series[existingIdx].seriesId : maxSeriesId + 1;
      const episodes =
        admState.pendingImdbEpisodes ||
        (existingIdx >= 0 ? admState.series[existingIdx].episodes : null) || [
          {
            id: `${seriesId}0101`,
            season: 1,
            episode: 1,
            title: `${title} — S01E01`,
            plot,
            duration: "45 min",
            streamUrl
          }
        ];
      const rec = {
        id: existingIdx >= 0 ? admState.series[existingIdx].id : `ser_${imdbId}`,
        seriesId,
        imdbId,
        title,
        year,
        imdbRating,
        runtime: "45 min",
        genres,
        category: catMeta.name,
        categoryId: catMeta.id,
        customCategory: true,
        director,
        cast,
        plot,
        poster,
        backdrop,
        tier,
        streamUrl,
        episodes,
        seasonsCount: new Set(episodes.map((ep) => Number(ep.season) || 1)).size || 1,
        order: existingIdx >= 0 ? admState.series[existingIdx].order : 0
      };
      if (existingIdx >= 0) admState.series[existingIdx] = rec;
      else admState.series.unshift(rec);
      await persistSingleImdbItem("series", rec);
    }

    resetImdbForm();
    renderAdminImdbTable();
    renderKpis();
    toast(`🎬 Saved "${title}" (${imdbId} • ⭐ ${imdbRating}) to RTDB & Xtream Panel!`);
  });

  // Bulk IMDb IDs Importer
  document.getElementById("admBulkImdbImportBtn")?.addEventListener("click", async () => {
    const raw = document.getElementById("admBulkImdbIds")?.value || "";
    const ids = [...new Set((raw.match(/tt\d{6,10}/gi) || []).map((x) => x.toLowerCase()))];
    if (!ids.length) return toast("Paste at least one valid tt... IMDb ID!");

    toast(`⚡ Auto-loading ${ids.length} IMDb IDs...`);
    let addedCount = 0;
    for (const id of ids) {
      try {
        const item = await fetchImdbTitle(id, "auto");
        if (item.type === "series") {
          const exists = admState.series.findIndex((s) => s.imdbId === item.imdbId);
          const maxSid = admState.series.reduce((m, s) => Math.max(m, Number(s.seriesId) || 10000), 10000);
          const rec = {
            ...item,
            id: `ser_${item.imdbId}`,
            seriesId: exists >= 0 ? admState.series[exists].seriesId : maxSid + 1,
            tier: "free",
            streamUrl: ""
          };
          if (exists >= 0) admState.series[exists] = rec;
          else admState.series.unshift(rec);
          await persistSingleImdbItem("series", rec);
        } else {
          const exists = admState.movies.findIndex((m) => m.imdbId === item.imdbId);
          const maxSid = admState.movies.reduce((acc, m) => Math.max(acc, Number(m.streamId) || 5000), 5000);
          const rec = {
            ...item,
            id: `mov_${item.imdbId}`,
            streamId: exists >= 0 ? admState.movies[exists].streamId : maxSid + 1,
            tier: "free",
            streamUrl: ""
          };
          if (exists >= 0) admState.movies[exists] = rec;
          else admState.movies.unshift(rec);
          await persistSingleImdbItem("movie", rec);
        }
        addedCount++;
      } catch {
        // continue next ID
      }
    }

    document.getElementById("admBulkImdbIds").value = "";
    renderAdminImdbTable();
    renderKpis();
    toast(`🎉 Imported & synced ${addedCount} IMDb Movies/Series to RTDB & Xtream VOD!`);
  });

  document.getElementById("admImdbFilterKind")?.addEventListener("change", renderAdminImdbTable);
  document.getElementById("admImdbFilterSearch")?.addEventListener("input", renderAdminImdbTable);
}

function resetImdbForm() {
  document.getElementById("imdbForm")?.reset();
  const editKey = document.getElementById("imdbEditKey");
  if (editKey) editKey.value = "";
  const idInp = document.getElementById("admImdbIdInput");
  if (idInp) idInp.value = "";
  admState.pendingImdbEpisodes = null;
  populateImdbCategoryOptions("movie");
  setTxt("imdbFormHeading", "🎬 Add / Edit Movie or TV Series via IMDb ID");
}

async function persistSingleImdbItem(kind, rec) {
  const rootNode = kind === "series" ? "series" : "movies";
  const nodeKey = rec.id || `${kind === "series" ? "ser" : "mov"}_${rec.imdbId}`;
  const path = `${rootNode}/${nodeKey}`;
  await dbWrite(path, rec);
  fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, value: rec })
  }).catch(() => {});
}

function renderAdminImdbTable() {
  const tbody = document.getElementById("admImdbTbody");
  if (!tbody) return;

  const filterKind = document.getElementById("admImdbFilterKind")?.value || "all";
  const q = (document.getElementById("admImdbFilterSearch")?.value || "").trim().toLowerCase();

  let combined = [
    ...admState.movies.map((m) => ({ ...m, _kind: "movie" })),
    ...admState.series.map((s) => ({ ...s, _kind: "series" }))
  ];

  if (filterKind !== "all") {
    combined = combined.filter((x) => x._kind === filterKind);
  }
  if (q) {
    combined = combined.filter(
      (x) =>
        String(x.title || "").toLowerCase().includes(q) ||
        String(x.imdbId || "").toLowerCase().includes(q) ||
        String(x.year || "").toLowerCase().includes(q) ||
        String(x.category || "").toLowerCase().includes(q)
    );
  }

  setTxt("admImdbCount", combined.length);

  if (!combined.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:22px;" class="muted-sm">No IMDb titles match your filter.</td></tr>`;
    return;
  }

  const visibleRows = combined.slice(0, 80);

  tbody.innerHTML = visibleRows
    .map(
      (item) => `
      <tr>
        <td>
          <code>${esc(item.imdbId || "")}</code>
          <div style="margin-top:4px;"><span class="badge badge-gold">⭐ ${esc(item.imdbRating || "8.0")}</span></div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:9px;">
            <img src="${escAttr(item.poster || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" style="width:34px;height:48px;border-radius:6px;object-fit:cover;" alt="" loading="lazy" />
            <div>
              <strong>${esc(item.title)}</strong> <span class="muted-sm">(${esc(item.year || "")})</span>
              <div class="muted-sm" style="font-size:0.72rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.cast || "")}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge badge-cyan">${item._kind === "series" ? "📺 SERIES" : "🎬 MOVIE"}</span>
          <div class="muted-sm" style="font-size:0.73rem;margin-top:3px;">${esc(item.category || "")}</div>
        </td>
        <td>
          ${
            item.streamUrl
              ? `<span class="badge badge-free">🟢 Custom Stream Active</span>`
              : `<span class="badge badge-cyan">🎬 Coming Soon Video</span>`
          }
        </td>
        <td>
          <button type="button" class="badge ${item.tier === "pro" ? "badge-gold" : "badge-free"}" style="cursor:pointer;" data-imdb-tier="${escAttr(item.id)}" data-imdb-kind="${item._kind}">
            ${item.tier === "pro" ? "👑 PRO VIP" : "🟢 FREE"}
          </button>
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-outline" data-imdb-edit="${escAttr(item.id)}" data-imdb-kind="${item._kind}">✏️ Edit</button>
            <button type="button" class="btn btn-sm btn-danger" data-imdb-del="${escAttr(item.id)}" data-imdb-kind="${item._kind}">✕</button>
          </div>
        </td>
      </tr>`
    )
    .join("") +
    (combined.length > visibleRows.length
      ? `<tr><td colspan="6" style="text-align:center;padding:12px;" class="muted-sm">Showing top <strong>${visibleRows.length}</strong> of <strong>${combined.length}</strong> auto-indexed 2000–2026 IMDb titles — use Search above to jump to any title, year, or <code>tt...</code> ID instantly!</td></tr>`
      : "");

  tbody.querySelectorAll("[data-imdb-tier]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.imdbTier;
      const kind = btn.dataset.imdbKind;
      const arr = kind === "series" ? admState.series : admState.movies;
      const found = arr.find((x) => x.id === id);
      if (!found) return;
      found.tier = found.tier === "pro" ? "free" : "pro";
      await persistSingleImdbItem(kind, found);
      renderAdminImdbTable();
      toast(`Switched "${found.title}" to ${found.tier.toUpperCase()}`);
    });
  });

  tbody.querySelectorAll("[data-imdb-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.imdbEdit;
      const kind = btn.dataset.imdbKind;
      const arr = kind === "series" ? admState.series : admState.movies;
      const item = arr.find((x) => x.id === id);
      if (!item) return;

      document.getElementById("imdbEditKey").value = item.id;
      document.getElementById("admImdbIdInput").value = item.imdbId || "";
      document.getElementById("imdbTitleInput").value = item.title || "";
      document.getElementById("imdbKindSelect").value = kind;
      populateImdbCategoryOptions(kind, item.category);
      document.getElementById("imdbRatingInput").value = item.imdbRating || "8.0";
      document.getElementById("imdbYearInput").value = item.year || "";
      document.getElementById("imdbTierSelect").value = item.tier === "pro" ? "pro" : "free";
      document.getElementById("imdbPosterInput").value = item.poster || "";
      document.getElementById("imdbBackdropInput").value = item.backdrop || "";
      document.getElementById("imdbStreamUrlInput").value = item.streamUrl || "";
      document.getElementById("imdbGenresInput").value = Array.isArray(item.genres)
        ? item.genres.join(", ")
        : String(item.genres || "");
      document.getElementById("imdbDirectorInput").value = item.director || "";
      document.getElementById("imdbCastInput").value = item.cast || "";
      document.getElementById("imdbPlotInput").value = item.plot || "";
      admState.pendingImdbEpisodes = kind === "series" ? item.episodes || null : null;
      setTxt("imdbFormHeading", `✏️ Editing IMDb Title: ${item.title} (${item.imdbId})`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  tbody.querySelectorAll("[data-imdb-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.imdbDel;
      const kind = btn.dataset.imdbKind;
      const arr = kind === "series" ? admState.series : admState.movies;
      const existing = arr.find((x) => x.id === id);
      if (kind === "series") {
        admState.series = admState.series.filter((s) => s.id !== id);
      } else {
        admState.movies = admState.movies.filter((m) => m.id !== id);
      }
      if (existing) {
        await persistSingleImdbItem(kind, { id, imdbId: existing.imdbId, _deleted: true });
      }
      renderAdminImdbTable();
      renderKpis();
      toast("Removed IMDb title from catalog");
    });
  });
}

/* ==================== TAB 3: BULK M3U IMPORT / EXPORT ==================== */
function bindBulkImportExport() {
  document.getElementById("bulkFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    document.getElementById("bulkM3uTextarea").value = text;
    toast(`Loaded ${file.name} — click Parse M3U Channels!`);
  });

  document.getElementById("fetchRemoteM3uBtn")?.addEventListener("click", async () => {
    const remote = document.getElementById("bulkRemoteUrl")?.value.trim();
    if (!remote) return toast("Enter remote M3U URL first");
    try {
      const res = await fetch(`/api/proxy?u=${encodeURIComponent(remote)}`);
      const text = await res.text();
      document.getElementById("bulkM3uTextarea").value = text;
      toast("Fetched remote playlist! Click Parse M3U Channels.");
    } catch {
      toast("Could not fetch remote URL");
    }
  });

  document.getElementById("parseM3uBtn")?.addEventListener("click", () => {
    const raw = document.getElementById("bulkM3uTextarea")?.value || "";
    const tier = document.getElementById("bulkImportTier")?.value || "free";
    const parsed = parseM3uPlaylist(raw, tier);
    if (!parsed.length) return toast("No #EXTINF / stream URLs found in text");
    admState.parsedBulk = parsed.map((c) => ({ ...c, selected: true, probeStatus: "untested" }));
    document.getElementById("probeBulkBtn").hidden = false;
    document.getElementById("selectWorkingBulkBtn").hidden = false;
    document.getElementById("commitBulkImportBtn").hidden = false;
    renderBulkParsedList();
    toast(`Parsed ${parsed.length} channels from M3U!`);
  });

  document.getElementById("probeBulkBtn")?.addEventListener("click", async () => {
    if (!admState.parsedBulk.length) return;
    const urls = admState.parsedBulk.slice(0, 40).map((c) => c.url);
    toast(`Probing ${urls.length} M3U8 links...`);
    try {
      const res = await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls })
      });
      const data = await res.json();
      const map = new Map((data.results || []).map((r) => [r.url, r]));
      admState.parsedBulk.forEach((item) => {
        const hit = map.get(item.url);
        if (hit) {
          item.probeStatus = hit.ok ? `OK (${hit.latencyMs}ms)` : `FAIL (${hit.error || hit.status})`;
          item.probeOk = Boolean(hit.ok);
        }
      });
      renderBulkParsedList();
    } catch {
      toast("Probe request failed");
    }
  });

  document.getElementById("selectWorkingBulkBtn")?.addEventListener("click", () => {
    admState.parsedBulk.forEach((c) => {
      if (c.probeStatus !== "untested") c.selected = Boolean(c.probeOk);
    });
    renderBulkParsedList();
  });

  document.getElementById("commitBulkImportBtn")?.addEventListener("click", async () => {
    const tier = document.getElementById("bulkImportTier")?.value || "free";
    const chosen = admState.parsedBulk.filter((c) => c.selected);
    if (!chosen.length) return toast("Select at least 1 channel to import");

    let maxStreamId = admState.channels.reduce((m, c) => Math.max(m, Number(c.streamId) || 1000), 1000);
    chosen.forEach((c) => {
      maxStreamId += 1;
      const meta = resolveCategoryMeta(c.category, c.name, c.country, true);
      admState.channels.push({
        ...c,
        category: meta.name,
        categoryId: meta.id,
        tier,
        streamId: maxStreamId,
        order: admState.channels.length + 1
      });
    });

    // Auto-sort entire catalog into Priority Emoji Groups & re-index #1..#N!
    admState.channels = autoSortAndReindexChannels(admState.channels, { reclassify: false });

    await persistAllChannels();
    populateEmojiGroupSelects();
    renderAdminChannelsTable();
    renderKpis();
    document.getElementById("bulkParsedWrap").hidden = true;
    toast(`🎉 Imported ${chosen.length} channels into BarakatWave TV!`);
  });

  document.getElementById("exportCleanM3uBtn")?.addEventListener("click", () => {
    const m3u = exportChannelsToM3u(admState.channels, {
      baseUrl: window.location.origin,
      useCleanLinks: true,
      title: "BarakatWave Master Clean Playlist"
    });
    downloadFile("barakatwave-master-clean.m3u8", m3u, "audio/x-mpegurl");
  });

  document.getElementById("exportRawM3uBtn")?.addEventListener("click", () => {
    const m3u = exportChannelsToM3u(admState.channels, {
      baseUrl: window.location.origin,
      useCleanLinks: false,
      title: "BarakatWave Raw Sources Backup"
    });
    downloadFile("barakatwave-raw-sources.m3u8", m3u, "audio/x-mpegurl");
  });

  document.getElementById("exportFreeM3uBtn")?.addEventListener("click", () => {
    const free = admState.channels.filter((c) => c.tier !== "pro");
    const m3u = exportChannelsToM3u(free, {
      baseUrl: window.location.origin,
      useCleanLinks: true,
      title: "BarakatWave Free Channels"
    });
    downloadFile("barakatwave-free.m3u8", m3u, "audio/x-mpegurl");
  });

  document.getElementById("exportJsonBtn")?.addEventListener("click", () => {
    downloadFile("barakatwave-channels.json", JSON.stringify(admState.channels, null, 2), "application/json");
  });
}

function renderBulkParsedList() {
  const wrap = document.getElementById("bulkParsedWrap");
  if (!wrap) return;
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="Selectable-channels">
      ${admState.parsedBulk
        .map(
          (c, idx) => `
        <label class="check-card">
          <input type="checkbox" data-bulk-idx="${idx}" ${c.selected ? "checked" : ""} />
          <div style="min-width:0;flex:1;">
            <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.name)}</div>
            <div class="muted-sm" style="font-size:0.72rem;">${esc(c.category)} • ${esc(c.probeStatus)}</div>
          </div>
        </label>`
        )
        .join("")}
    </div>
  `;
  wrap.querySelectorAll("[data-bulk-idx]").forEach((cb) => {
    cb.addEventListener("change", () => {
      admState.parsedBulk[Number(cb.dataset.bulkIdx)].selected = cb.checked;
    });
  });
}

/* ==================== TAB 4: GITHUB TOKEN M3U8 PUSH ==================== */
function bindGitHubPublisher() {
  document.getElementById("previewGhFilesBtn")?.addEventListener("click", () => runGitHubPublish(true));
  document.getElementById("pushGhFilesBtn")?.addEventListener("click", () => runGitHubPublish(false));
}

async function runGitHubPublish(previewOnly) {
  const githubToken = document.getElementById("ghTokenInput")?.value.trim() || "";
  const repo = document.getElementById("ghRepoInput")?.value.trim() || "muaaziqbalvip/BarakatWave-TV";
  const branch = document.getElementById("ghBranchInput")?.value.trim() || "main";
  const folder = document.getElementById("ghFolderInput")?.value.trim() || "data/streams";
  const out = document.getElementById("ghPushResult");
  out.hidden = false;
  out.innerHTML = `<span class="muted-sm">${previewOnly ? "Generating M3U8 files preview..." : "Pushing channel .m3u8 files to GitHub..."}</span>`;

  try {
    const res = await fetch("/api/github/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previewOnly,
        githubToken,
        repo,
        branch,
        folder,
        channels: admState.channels
      })
    });
    const data = await res.json();
    if (!data.ok) {
      out.innerHTML = `<div class="text-danger" style="font-weight:700;">❌ ${esc(data.error || "GitHub operation failed")}</div>`;
      return;
    }

    if (previewOnly) {
      out.innerHTML = `
        <div class="text-success" style="font-weight:700;">✅ Ready to Push ${data.fileCount} .M3U8 Files:</div>
        <ul class="muted-sm" style="max-height:180px;overflow:auto;">
          ${data.files.map((f) => `<li><code>${esc(f.path)}</code></li>`).join("")}
        </ul>
      `;
    } else {
      out.innerHTML = `
        <div class="text-success" style="font-weight:800;">🎉 Pushed ${data.fileCount} M3U8 Files to GitHub!</div>
        <div class="muted-sm" style="margin-top:6px;">
          Repo: <code>${esc(data.repo)}</code> (${esc(data.branch)}) &bull;
          <a href="${escAttr(data.commitUrl)}" target="_blank" rel="noopener">View Commit ${esc(data.commitSha.slice(0, 7))} &rarr;</a>
        </div>
      `;
      toast("🐙 All channel .m3u8 files committed to GitHub!");
    }
  } catch (err) {
    out.innerHTML = `<div class="text-danger" style="font-weight:700;">Error: ${esc(err?.message)}</div>`;
  }
}

/* ==================== TAB 5: BROADCAST VIDEOS (INTRO, OFFLINE, COMING SOON & PRO) ==================== */
function bindDefaultsEditor() {
  document.getElementById("resetWelcomeBtn")?.addEventListener("click", () => {
    document.getElementById("defWelcomeUrl").value = "/media/welcome/index.m3u8";
    toast("Reset to built-in HD Welcome Intro");
  });
  document.getElementById("resetProVidBtn")?.addEventListener("click", () => {
    document.getElementById("defProVideoUrl").value = "/media/pro-unlock/index.m3u8";
    toast("Reset to built-in HD PRO Unlock Video");
  });
  document.getElementById("resetOfflineVidBtn")?.addEventListener("click", () => {
    const el = document.getElementById("defOfflineVideoUrl");
    if (el) el.value = "/media/channel-offline/index.m3u8";
    toast("Reset to built-in HD Channel Offline Standby Video");
  });
  document.getElementById("resetComingSoonVidBtn")?.addEventListener("click", () => {
    const el = document.getElementById("defComingSoonVideoUrl");
    if (el) el.value = "/media/coming-soon/index.m3u8";
    toast("Reset to built-in HD Coming Soon Video");
  });

  document.getElementById("previewWelcomeBtn")?.addEventListener("click", () => {
    const u = document.getElementById("defWelcomeUrl").value.trim() || "/media/welcome/index.m3u8";
    setTxt("defaultsPreviewLabel", "🎬 Previewing Welcome / Intro Video");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", u);
  });
  document.getElementById("previewProVidBtn")?.addEventListener("click", () => {
    const u = document.getElementById("defProVideoUrl").value.trim() || "/media/pro-unlock/index.m3u8";
    setTxt("defaultsPreviewLabel", "👑 Previewing Premium PRO Unlock Video");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", u);
  });
  document.getElementById("previewOfflineVidBtn")?.addEventListener("click", () => {
    const u = document.getElementById("defOfflineVideoUrl")?.value.trim() || "/media/channel-offline/index.m3u8";
    setTxt("defaultsPreviewLabel", "📡 Previewing Channel Offline Standby Video");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", u);
  });
  document.getElementById("previewComingSoonVidBtn")?.addEventListener("click", () => {
    const u = document.getElementById("defComingSoonVideoUrl")?.value.trim() || "/media/coming-soon/index.m3u8";
    setTxt("defaultsPreviewLabel", "🎬 Previewing IMDb Movies/Series Coming Soon Video");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", u);
  });

  document.getElementById("closeDefaultsPreviewBtn")?.addEventListener("click", () => {
    stopMiniPreview("defaultsVideoEl", "defaultsPreviewBox");
  });

  // Live Simulator 1: Watch Intro Video Play First -> Automatically Transition Directly to Live Channel!
  document.getElementById("simIntroToLiveBtn")?.addEventListener("click", async () => {
    await saveDefaultsQuietly();
    const freeCh = admState.channels.find((c) => c.tier !== "pro") || admState.channels[0];
    const sid = freeCh ? freeCh.streamId || 1001 : 1001;
    const stitchedUrl = `/live/demo/demo/${sid}.m3u8?_t=${Date.now()}`;
    setTxt(
      "defaultsPreviewLabel",
      `▶ Televizo + HLS Live Simulation (${freeCh ? freeCh.name : "Channel #1001"}): 1) Pure Intro Plays First ➔ 2) Auto-Switches to Live Channel!`
    );
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", stitchedUrl);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Live Simulator 2: Channel Offline Standby Video
  document.getElementById("simOfflineVideoBtn")?.addEventListener("click", async () => {
    await saveDefaultsQuietly();
    const url = `/api/stream?mode=offline&_t=${Date.now()}`;
    setTxt("defaultsPreviewLabel", "📡 Channel Offline Failover Simulation: Plays automatically when any channel link fails!");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", url);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Live Simulator 3: Free User Opening PRO VIP Channel
  document.getElementById("simProLockedBtn")?.addEventListener("click", async () => {
    await saveDefaultsQuietly();
    const proCh = admState.channels.find((c) => c.tier === "pro");
    const url = proCh
      ? `/live/demo/demo/${proCh.streamId}.m3u8?_t=${Date.now()}`
      : `/api/stream?mode=pro_lock&id=2001&_t=${Date.now()}`;
    setTxt(
      "defaultsPreviewLabel",
      `🔒 Free User Opening PRO Channel (${proCh ? proCh.name : "PRO VIP"}): Continuous Premium Unlock Video Stream!`
    );
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", url);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Live Simulator 4: IMDb Movies & Series "Service is Building — Coming Soon" VOD Video
  document.getElementById("simComingSoonBtn")?.addEventListener("click", async () => {
    await saveDefaultsQuietly();
    const url = `/movie/demo/demo/5001.mp4?_t=${Date.now()}`;
    setTxt("defaultsPreviewLabel", "🎬 Xtream VOD / IMDb Movie Simulation: Service is Building — Coming Soon!");
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", url);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.getElementById("defaultsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveDefaultsQuietly();
    toast("✅ All 4 Broadcast Videos (Intro, Offline, Coming Soon & PRO) Saved for Web + Xtream!");
  });

  checkRtdbPublicReadForIptv();
}

async function saveDefaultsQuietly() {
  const updated = {
    ...admState.settings,
    welcomeVideoEnabled: document.getElementById("defWelcomeEnabled").checked,
    welcomeVideoUrl: document.getElementById("defWelcomeUrl").value.trim() || "/media/welcome/index.m3u8",
    welcomeDurationSec: Number(document.getElementById("defWelcomeDur").value) || 8,
    welcomeSkippable: document.getElementById("defWelcomeSkip").checked,
    proUnlockVideoEnabled: document.getElementById("defProVideoEnabled").checked,
    proUnlockVideoUrl: document.getElementById("defProVideoUrl").value.trim() || "/media/pro-unlock/index.m3u8",
    channelOfflineVideoUrl:
      document.getElementById("defOfflineVideoUrl")?.value.trim() || "/media/channel-offline/index.m3u8",
    comingSoonVideoUrl:
      document.getElementById("defComingSoonVideoUrl")?.value.trim() || "/media/coming-soon/index.m3u8",
    proWhatsapp: document.getElementById("defProPhone").value.trim() || "03062015326",
    siteAnnouncement: document.getElementById("defAnnouncement").value.trim()
  };
  admState.settings = updated;
  await dbWrite("settings/defaults", updated);
}

async function checkRtdbPublicReadForIptv() {
  const badge = document.getElementById("rtdbIptvHealthBadge");
  if (!badge) return;
  try {
    const res = await fetch("https://barakatwave-tv-default-rtdb.firebaseio.com/settings/defaults.json");
    if (res.ok) {
      badge.className = "badge badge-free";
      badge.textContent = "✅ Firebase RTDB Connected for IPTV Apps";
    } else if (res.status === 401) {
      badge.className = "badge badge-gold";
      badge.textContent = "⚠️ Publish RTDB Rules (Tab 8) for External IPTV Apps";
    } else {
      badge.className = "badge badge-cyan";
      badge.textContent = "⚡ Cloud HLS Sync Active";
    }
  } catch {
    badge.className = "badge badge-cyan";
    badge.textContent = "⚡ Cloud HLS Sync Active";
  }
}

function populateDefaultsForm() {
  const s = admState.settings;
  document.getElementById("defWelcomeEnabled").checked = s.welcomeVideoEnabled !== false;
  document.getElementById("defWelcomeUrl").value = s.welcomeVideoUrl || "/media/welcome/index.m3u8";
  document.getElementById("defWelcomeDur").value = s.welcomeDurationSec || 8;
  document.getElementById("defWelcomeSkip").checked = s.welcomeSkippable !== false;
  document.getElementById("defProVideoEnabled").checked = s.proUnlockVideoEnabled !== false;
  document.getElementById("defProVideoUrl").value = s.proUnlockVideoUrl || "/media/pro-unlock/index.m3u8";
  const offEl = document.getElementById("defOfflineVideoUrl");
  if (offEl) offEl.value = s.channelOfflineVideoUrl || "/media/channel-offline/index.m3u8";
  const csEl = document.getElementById("defComingSoonVideoUrl");
  if (csEl) csEl.value = s.comingSoonVideoUrl || "/media/coming-soon/index.m3u8";
  document.getElementById("defProPhone").value = s.proWhatsapp || "03062015326";
  document.getElementById("defAnnouncement").value = s.siteAnnouncement || DEFAULT_SETTINGS.siteAnnouncement;

  document.getElementById("seoGscInput").value = s.gscVerification || "";
  document.getElementById("seoBingInput").value = s.bingVerification || "";
}

/* ==================== TAB 6: XTREAM ACCOUNTS & PRO VIP UPGRADE ==================== */
function bindXtreamManager() {
  document.getElementById("manualXtreamForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("manXtUser").value.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const password = document.getElementById("manXtPass").value.trim();
    const plan = document.getElementById("manXtPlan").value === "pro" ? "pro" : "free";
    const maxConnections = Number(document.getElementById("manXtConn").value) || (plan === "pro" ? 5 : 1);

    if (!username || !password) return;
    const record = {
      username,
      password,
      uid: `manual_${username}`,
      email: "WhatsApp 0306-2015326 Customer",
      displayName: username,
      plan,
      status: "Active",
      maxConnections,
      createdAt: new Date().toISOString()
    };

    await dbWrite(`xtreamAccounts/${username}`, record);
    admState.xtreamAccounts = [
      record,
      ...admState.xtreamAccounts.filter((x) => x.username !== username)
    ];
    document.getElementById("manualXtreamForm").reset();
    renderXtreamTable();
    renderKpis();
    toast(`✅ Created Xtream Server "${username}" (${plan.toUpperCase()})!`);
  });
}

function renderXtreamTable() {
  const tbody = document.getElementById("admXtreamTbody");
  if (!tbody) return;
  if (!admState.xtreamAccounts.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-sm">No custom Xtream accounts yet — create one above or claim from User Panel! (Built-in test login <code>demo / demo</code> is always active.)</td></tr>`;
    return;
  }

  tbody.innerHTML = admState.xtreamAccounts
    .map(
      (x) => `
      <tr>
        <td><code>${esc(x.username)}</code></td>
        <td><code>${esc(x.password)}</code></td>
        <td>${esc(x.email || x.displayName || "Viewer")}</td>
        <td>
          <span class="badge ${x.plan === "pro" ? "badge-gold" : "badge-cyan"}">
            ${x.plan === "pro" ? "👑 PRO VIP" : "FREE"}
          </span>
        </td>
        <td>${x.maxConnections || (x.plan === "pro" ? 5 : 1)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm ${x.plan === "pro" ? "btn-outline" : "btn-gold"}" data-xt-upgrade="${escAttr(x.username)}">
              ${x.plan === "pro" ? "Set Free" : "👑 Upgrade to PRO VIP"}
            </button>
            <button type="button" class="btn btn-sm btn-danger" data-xt-del="${escAttr(x.username)}">Delete</button>
          </div>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-xt-upgrade]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const acct = admState.xtreamAccounts.find((x) => x.username === btn.dataset.xtUpgrade);
      if (!acct) return;
      const newPlan = acct.plan === "pro" ? "free" : "pro";
      acct.plan = newPlan;
      acct.maxConnections = newPlan === "pro" ? 5 : 1;
      await dbWrite(`xtreamAccounts/${acct.username}`, acct);
      if (acct.uid && !acct.uid.startsWith("manual_")) {
        await dbMerge(`users/${acct.uid}`, { plan: newPlan });
      }
      renderXtreamTable();
      renderKpis();
      toast(`🎉 ${acct.username} is now ${newPlan.toUpperCase()}!`);
    });
  });

  tbody.querySelectorAll("[data-xt-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = btn.dataset.xtDel;
      await dbDelete(`xtreamAccounts/${u}`);
      admState.xtreamAccounts = admState.xtreamAccounts.filter((x) => x.username !== u);
      renderXtreamTable();
      renderKpis();
      toast(`Removed Xtream user ${u}`);
    });
  });
}

/* ==================== TAB 7: BLOGS & SEARCH CONSOLE ==================== */
function bindSeoAndBlogs() {
  document.getElementById("saveSeoTokensBtn")?.addEventListener("click", async () => {
    admState.settings.gscVerification = document.getElementById("seoGscInput").value.trim();
    admState.settings.bingVerification = document.getElementById("seoBingInput").value.trim();
    await dbWrite("settings/defaults", admState.settings);
    toast("✅ Search Console Verification Tokens Saved!");
  });

  document.getElementById("pingIndexNowBtn")?.addEventListener("click", async () => {
    const out = document.getElementById("seoPingOutput");
    out.hidden = false;
    out.innerHTML = `<span class="muted-sm">Pinging IndexNow &amp; verifying Sitemap URLs...</span>`;
    try {
      const res = await fetch("/api/seo/indexnow", { method: "POST" });
      const data = await res.json();
      out.innerHTML = `
        <div style="color:var(--success);font-weight:700;">✅ ${esc(data.note)}</div>
        <div class="muted-sm" style="margin-top:4px;">Submitted ${data.submittedCount} URLs (Home + Sitemap + ${admState.blogs.length} Blogs)</div>
      `;
    } catch {
      out.innerHTML = `<span class="muted-sm">IndexNow ping ready.</span>`;
    }
  });

  document.getElementById("blogForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("blgTitle").value.trim();
    const category = document.getElementById("blgCategory").value.trim() || "Streaming Guides";
    const excerpt = document.getElementById("blgExcerpt").value.trim();
    const rawContent = document.getElementById("blgContent").value.trim();
    const slug = slugify(title) || `post-${Date.now()}`;

    const content = rawContent.includes("<p>") || rawContent.includes("<h")
      ? rawContent
      : rawContent
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p)}</p>`)
          .join("\n");

    const post = {
      slug,
      title,
      category,
      excerpt,
      content,
      author: BRAND.founder,
      readTime: "5 min read",
      publishedAt: new Date().toISOString()
    };

    await dbWrite(`blogs/${slug}`, post);
    admState.blogs = [post, ...admState.blogs.filter((b) => b.slug !== slug)];
    document.getElementById("blogForm").reset();
    renderAdminBlogsTable();
    renderKpis();
    toast(`🚀 Published "${title}" — Live in /blog/${slug} & Sitemap.xml!`);
  });
}

function renderAdminBlogsTable() {
  const tbody = document.getElementById("admBlogsTbody");
  if (!tbody) return;
  setTxt("admBlogCount", admState.blogs.length);
  tbody.innerHTML = admState.blogs
    .map(
      (b) => `
      <tr>
        <td><strong>${esc(b.title)}</strong></td>
        <td><span class="badge badge-cyan">${esc(b.category || "Guide")}</span></td>
        <td><a href="/blog/${escAttr(b.slug)}" target="_blank">/blog/${esc(b.slug)}</a></td>
        <td>
          <button type="button" class="btn btn-sm btn-danger" data-del-blog="${escAttr(b.slug)}">Delete</button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-del-blog]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.delBlog;
      await dbDelete(`blogs/${slug}`);
      admState.blogs = admState.blogs.filter((b) => b.slug !== slug);
      renderAdminBlogsTable();
      renderKpis();
      toast("Blog post removed");
    });
  });
}

/* ==================== TAB 8: TICKETS, REVIEWS & RTDB RULES ==================== */
function bindSupportAndRules() {
  document.getElementById("copyRtdbRulesBtn")?.addEventListener("click", async () => {
    const rules = {
      rules: {
        channels: {
          ".read": true,
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')"
        },
        settings: {
          defaults: {
            ".read": true,
            ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')"
          }
        },
        users: {
          "$uid": {
            ".read": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')",
            ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')"
          }
        },
        xtreamAccounts: {
          ".read": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')",
          "$username": { ".read": true, ".write": "auth != null" }
        },
        playlists: {
          "$playlistId": { ".read": true, ".write": "auth != null" }
        },
        blogs: {
          ".read": true,
          ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.token.email === 'muaaziqbal.vip@gmail.com')"
        },
        reviews: { ".read": true, "$reviewId": { ".write": "auth != null" } },
        tickets: { ".read": "auth != null", "$ticketId": { ".write": "auth != null" } },
        admins: { ".read": "auth != null", "$uid": { ".write": "auth != null" } }
      }
    };
    navigator.clipboard?.writeText(JSON.stringify(rules, null, 2));
    toast("📋 Firebase Realtime Database Rules JSON copied!");
  });
}

function renderAdminTicketsAndReviews() {
  const tWrap = document.getElementById("admTicketsList");
  if (tWrap) {
    tWrap.innerHTML = admState.tickets.length
      ? admState.tickets
          .map(
            (t) => `
          <div class="cred-box">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong>${esc(t.subject)} — <span class="muted-sm">${esc(t.userName)} (${esc(t.phone || t.email)})</span></strong>
              <span class="badge ${t.status === "Resolved" ? "badge-free" : "badge-gold"}">${esc(t.status || "Open")}</span>
            </div>
            <p style="margin:6px 0;font-size:0.86rem;">${esc(t.message)} ${t.xtreamUsername ? `<code>[Xtream: ${esc(t.xtreamUsername)}]</code>` : ""}</p>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <input type="text" class="input-field" id="tktReply_${escAttr(t.id)}" value="${escAttr(t.adminReply || "")}" placeholder="Write reply & mark Resolved..." style="flex:1;" />
              <button type="button" class="btn btn-sm btn-primary" data-resolve-tkt="${escAttr(t.id)}">Reply &amp; Resolve</button>
            </div>
          </div>`
          )
          .join("")
      : `<div class="muted-sm">No support tickets submitted yet.</div>`;

    tWrap.querySelectorAll("[data-resolve-tkt]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.resolveTkt;
        const reply = document.getElementById(`tktReply_${id}`)?.value.trim() || "Resolved by BarakatWave Support";
        await dbMerge(`tickets/${id}`, { adminReply: reply, status: "Resolved" });
        const t = admState.tickets.find((x) => x.id === id);
        if (t) {
          t.adminReply = reply;
          t.status = "Resolved";
        }
        renderAdminTicketsAndReviews();
        renderKpis();
        toast("Ticket replied & marked Resolved!");
      });
    });
  }

  const rWrap = document.getElementById("admReviewsList");
  if (rWrap) {
    rWrap.innerHTML = admState.reviews
      .map(
        (r) => `
        <div class="cred-box">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${esc(r.userName)} (${"★".repeat(Number(r.rating) || 5)})</strong>
            <button type="button" class="btn btn-sm btn-danger" data-del-rev="${escAttr(r.id)}">Delete</button>
          </div>
          <p class="muted-sm" style="margin:4px 0;">${esc(r.comment)}</p>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="text" class="input-field" id="revReply_${escAttr(r.id)}" value="${escAttr(r.reply || "")}" placeholder="Official Mizanora/BarakatWave reply..." style="flex:1;" />
            <button type="button" class="btn btn-sm btn-outline" data-reply-rev="${escAttr(r.id)}">Save Reply</button>
          </div>
        </div>`
      )
      .join("");

    rWrap.querySelectorAll("[data-reply-rev]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.replyRev;
        const reply = document.getElementById(`revReply_${id}`)?.value.trim() || "";
        const rev = admState.reviews.find((x) => x.id === id);
        if (rev) {
          rev.reply = reply;
          await dbWrite(`reviews/${id}`, rev);
          toast("Saved official review reply!");
        }
      });
    });

    rWrap.querySelectorAll("[data-del-rev]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.delRev;
        await dbDelete(`reviews/${id}`);
        admState.reviews = admState.reviews.filter((x) => x.id !== id);
        renderAdminTicketsAndReviews();
        toast("Review removed");
      });
    });
  }
}

/* ==================== MINI HLS PREVIEW & HELPERS ==================== */
function openMiniVideoPreview(videoId, wrapId, url) {
  const wrap = document.getElementById(wrapId);
  const video = document.getElementById(videoId);
  if (!wrap || !video) return;
  wrap.hidden = false;

  if (admState.previewHls) {
    admState.previewHls.destroy();
    admState.previewHls = null;
  }

  const isMp4 = /\.(mp4|webm|ogg)(\?|$)/i.test(url);
  if (!isMp4 && window.Hls && window.Hls.isSupported()) {
    let triedRelay = false;
    const attach = (srcUrl) => {
      if (admState.previewHls) {
        admState.previewHls.destroy();
      }
      const hls = new window.Hls({ manifestLoadingTimeOut: 6000 });
      admState.previewHls = hls;
      hls.loadSource(srcUrl);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal && !triedRelay && /^https?:\/\//i.test(url)) {
          triedRelay = true;
          attach(`/api/proxy?u=${encodeURIComponent(url)}`);
        }
      });
    };
    attach(url);
  } else {
    video.src = url;
    video.play().catch(() => {});
  }
}

function stopMiniPreview(videoId, wrapId) {
  if (admState.previewHls) {
    admState.previewHls.destroy();
    admState.previewHls = null;
  }
  const v = document.getElementById(videoId);
  if (v) {
    v.pause();
    v.removeAttribute("src");
  }
  const w = document.getElementById(wrapId);
  if (w) w.hidden = true;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function toast(msg) {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = msg;
  wrap.appendChild(d);
  setTimeout(() => d.remove(), 3400);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/'/g, "&#39;");
}

initAdmin();

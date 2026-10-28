/**
 * BarakatWave Live TV — Enterprise Admin Command Center Controller
 * Under Mizanora Projects | Founded & Engineered by Muaaz Iqbal
 */

import {
  BRAND,
  DEFAULT_SETTINGS,
  DEFAULT_CHANNELS,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  THEMES
} from "./default-data.js";
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
  settings: { ...DEFAULT_SETTINGS },
  xtreamAccounts: [],
  blogs: [...DEFAULT_BLOGS],
  reviews: [...DEFAULT_REVIEWS],
  tickets: [],
  parsedBulk: [],
  previewHls: null
};

function initAdmin() {
  renderAdminThemes();
  bindAdminTabs();
  bindAdminAuth();
  bindOverviewActions();
  bindChannelManager();
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
  const [chRaw, settingsRaw, xtRaw, blogsRaw, revRaw, tktRaw] = await Promise.all([
    dbRead("channels", null),
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
    if (list.length) admState.channels = list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

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
  renderAdminChannelsTable();
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
    toast("✅ Curated Channels, Defaults & 12 SEO Blogs synced to Firebase RTDB!");
  });

  document.getElementById("quickPingSeoBtn")?.addEventListener("click", () => {
    switchAdminTab("seo");
    document.getElementById("pingIndexNowBtn")?.click();
  });
}

/* ==================== TAB 2: CHANNELS & WORKING M3U8 TESTER ==================== */
function bindChannelManager() {
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
    const category = document.getElementById("chCategory").value.trim() || "Live TV";
    const tier = document.getElementById("chTier").value === "pro" ? "pro" : "free";
    const country = document.getElementById("chCountry").value.trim() || "PK";
    const url = document.getElementById("chUrl").value.trim();
    const logo = document.getElementById("chLogo").value.trim() || BRAND.logoPrimary;
    const backups = document.getElementById("chBackups").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const introVideoUrl = document.getElementById("chIntroOverride").value.trim();
    const proUnlockVideoUrl = document.getElementById("chProUnlockOverride")?.value.trim() || "";

    const slug = slugify(name) || `channel-${Date.now()}`;
    const existingIdx = admState.channels.findIndex((c) => c.id === editId);
    const maxStreamId = admState.channels.reduce((m, c) => Math.max(m, Number(c.streamId) || 1000), 1000);

    const record = {
      id: editId || `ch_${slug}_${Math.floor(100 + Math.random() * 900)}`,
      streamId: existingIdx >= 0 ? admState.channels[existingIdx].streamId : maxStreamId + 1,
      slug,
      name,
      category,
      country,
      language: "Urdu / English",
      tier,
      status: "active",
      logo,
      epgId: `${slug}.bw`,
      url,
      backupUrls: backups,
      introVideoUrl,
      proUnlockVideoUrl,
      order: existingIdx >= 0 ? admState.channels[existingIdx].order : admState.channels.length + 1
    };

    if (existingIdx >= 0) {
      admState.channels[existingIdx] = record;
    } else {
      admState.channels.push(record);
    }

    await persistAllChannels();
    resetChannelForm();
    renderAdminChannelsTable();
    renderKpis();
    toast(`✅ Saved channel "${name}" (${tier.toUpperCase()})!`);
  });

  document.getElementById("admChFilter")?.addEventListener("input", renderAdminChannelsTable);
}

function resetChannelForm() {
  document.getElementById("channelForm")?.reset();
  document.getElementById("chEditId").value = "";
  setTxt("chFormHeading", "➕ Add / Edit Live Channel & Test Working M3U8");
  document.getElementById("probeSingleResult").hidden = true;
  stopMiniPreview("adminPreviewVideo", "adminMiniPreviewWrap");
}

async function persistAllChannels() {
  const map = {};
  admState.channels.forEach((c, i) => {
    map[c.id] = { ...c, order: i + 1 };
  });
  await dbWrite("channels", map);
}

function renderAdminChannelsTable() {
  const tbody = document.getElementById("admChannelsTbody");
  if (!tbody) return;
  const q = (document.getElementById("admChFilter")?.value || "").trim().toLowerCase();
  const list = q
    ? admState.channels.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.category || "").toLowerCase().includes(q)
      )
    : admState.channels;

  setTxt("admChCount", list.length);

  tbody.innerHTML = list
    .map(
      (ch) => `
      <tr>
        <td><code>#${ch.streamId || 1001}</code></td>
        <td>
          <div style="display:flex;align-items:center;gap:9px;">
            <img src="${escAttr(ch.logo || BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" style="width:32px;height:32px;border-radius:7px;object-fit:contain;" alt="" />
            <div>
              <strong>${esc(ch.name)}</strong>
              <div class="muted-sm" style="font-size:0.72rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ch.url)}</div>
            </div>
          </div>
        </td>
        <td>${esc(ch.category)}</td>
        <td>
          <button type="button" class="badge ${ch.tier === "pro" ? "badge-gold" : "badge-free"}" style="cursor:pointer;" data-toggle-tier="${escAttr(ch.id)}" title="Click to switch Free / PRO VIP">
            ${ch.tier === "pro" ? "👑 PRO VIP" : "🟢 FREE"}
          </button>
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-outline" data-copy-ch="${escAttr(ch.slug)}" title="Copy Clean BarakatWave M3U8 URL">🔗 M3U8</button>
            <button type="button" class="btn btn-sm btn-outline" data-copy-xt="${escAttr(ch.streamId || 1001)}" title="Copy Xtream Test Stream Link (/live/demo/demo/...)">📺 Xtream</button>
            <button type="button" class="btn btn-sm btn-outline" data-dl-ch="${escAttr(ch.id)}" title="Download Channel .M3U8 File">⬇</button>
            <button type="button" class="btn btn-sm btn-outline" data-edit-ch="${escAttr(ch.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" data-del-ch="${escAttr(ch.id)}">✕</button>
          </div>
        </td>
      </tr>`
    )
    .join("");

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
      document.getElementById("chCategory").value = ch.category || "";
      document.getElementById("chTier").value = ch.tier === "pro" ? "pro" : "free";
      document.getElementById("chCountry").value = ch.country || "PK";
      document.getElementById("chUrl").value = ch.url || "";
      document.getElementById("chLogo").value = ch.logo || "";
      document.getElementById("chBackups").value = (ch.backupUrls || []).join(", ");
      document.getElementById("chIntroOverride").value = ch.introVideoUrl || "";
      const proOv = document.getElementById("chProUnlockOverride");
      if (proOv) proOv.value = ch.proUnlockVideoUrl || "";
      setTxt("chFormHeading", `✏️ Editing Channel: ${ch.name}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  tbody.querySelectorAll("[data-del-ch]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      admState.channels = admState.channels.filter((c) => c.id !== btn.dataset.delCh);
      await persistAllChannels();
      renderAdminChannelsTable();
      renderKpis();
      toast("Channel removed");
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
      admState.channels.push({
        ...c,
        tier,
        streamId: maxStreamId,
        order: admState.channels.length + 1
      });
    });

    await persistAllChannels();
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

/* ==================== TAB 5: DEFAULT WELCOME & PRO UNLOCK VIDEOS ==================== */
function bindDefaultsEditor() {
  document.getElementById("resetWelcomeBtn")?.addEventListener("click", () => {
    document.getElementById("defWelcomeUrl").value = "/media/welcome/index.m3u8";
    toast("Reset to built-in HD Welcome Intro");
  });
  document.getElementById("resetProVidBtn")?.addEventListener("click", () => {
    document.getElementById("defProVideoUrl").value = "/media/pro-unlock/index.m3u8";
    toast("Reset to built-in HD PRO Unlock Video");
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
      `▶ Xtream / HLS Live Simulation (${freeCh ? freeCh.name : "Channel #1001"}): 1) Intro Plays First ➔ 2) Auto-Switches to Live Channel!`
    );
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", stitchedUrl);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Live Simulator 2: Watch what a Free Xtream / Web User sees when clicking a PRO VIP Channel!
  document.getElementById("simProLockedBtn")?.addEventListener("click", async () => {
    await saveDefaultsQuietly();
    const proCh = admState.channels.find((c) => c.tier === "pro");
    const url = proCh
      ? `/live/demo/demo/${proCh.streamId}.m3u8?_t=${Date.now()}`
      : `/api/stream?mode=pro_lock&id=1008&_t=${Date.now()}`;
    setTxt(
      "defaultsPreviewLabel",
      `🔒 Free User Opening PRO Channel (${proCh ? proCh.name : "PRO VIP"}): Continuous Premium Unlock Video Stream!`
    );
    openMiniVideoPreview("defaultsVideoEl", "defaultsPreviewBox", url);
    document.getElementById("defaultsPreviewBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.getElementById("defaultsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveDefaultsQuietly();
    toast("✅ Intro Video & PRO Unlock Video Saved for Web + All Xtream Players!");
  });

  checkRtdbPublicReadForIptv();
}

async function saveDefaultsQuietly() {
  const updated = {
    ...admState.settings,
    welcomeVideoEnabled: document.getElementById("defWelcomeEnabled").checked,
    welcomeVideoUrl: document.getElementById("defWelcomeUrl").value.trim() || "/media/welcome/index.m3u8",
    welcomeDurationSec: Number(document.getElementById("defWelcomeDur").value) || 6,
    welcomeSkippable: document.getElementById("defWelcomeSkip").checked,
    proUnlockVideoEnabled: document.getElementById("defProVideoEnabled").checked,
    proUnlockVideoUrl: document.getElementById("defProVideoUrl").value.trim() || "/media/pro-unlock/index.m3u8",
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
  document.getElementById("defWelcomeDur").value = s.welcomeDurationSec || 6;
  document.getElementById("defWelcomeSkip").checked = s.welcomeSkippable !== false;
  document.getElementById("defProVideoEnabled").checked = s.proUnlockVideoEnabled !== false;
  document.getElementById("defProVideoUrl").value = s.proUnlockVideoUrl || "/media/pro-unlock/index.m3u8";
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
    const hls = new window.Hls();
    admState.previewHls = hls;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
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

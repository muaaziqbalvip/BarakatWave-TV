/**
 * BarakatWave TV — Modern Admin Panel (Rebuild v2)
 * Digital | Smooth | Fast | Real-Time | Beautiful IPTV Server Panel
 * Mizanora Projects by Muaaz Iqbal
 *
 * Talks to Firebase RTDB (channels, playlists, xtreamAccounts, movies, series, settings)
 * + /api/panel endpoints where needed.
 */

import {
  subscribeAuth,
  loginWithGoogle,
  loginWithEmailPassword,
  logoutUser,
  getFirebaseIdToken,
  dbRead,
  dbWatch,
  dbWrite,
  dbDelete,
  getCurrentUserSnapshot
} from "/assets/js/firebase-client.js?v=2";

const STATE = {
  user: null,
  channels: [],
  playlists: [],
  xtreamAccounts: [],
  movies: [],
  series: [],
  users: [],
  settings: {},
  activity: [],
  tab: "dashboard",
  search: "",
  refreshMs: 5000,
  timer: null
};

/* ==================== DOM helpers ==================== */
const $ = (id) => document.getElementById(id);
const show = (el) => el && (el.hidden = false);
const hide = (el) => el && (el.hidden = true);
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (v) => "Rs " + Number(v || 0).toLocaleString("en-PK");

function toast(msg, tone = "ok") {
  const wrap = $("toast-container");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${tone === "error" ? "error" : tone === "warn" ? "warn" : "ok"}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function fmtTime(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

/* ==================== Auth gate ==================== */
async function ensureAdmin() {
  // 1) Firebase user
  const snap = getCurrentUserSnapshot();
  if (snap && !snap.isPreviewSession) {
    STATE.user = snap;
    paintUser();
    return true;
  }
  // 2) Stored PIN session token (bw_admin_session)
  const t = adminToken();
  if (t) {
    STATE.user = { displayName: "Owner (PIN)", email: "owner@barakatwave.tv", uid: "owner_pin" };
    paintUser();
    return true;
  }
  // Not signed in -> show static PIN login block in sidebar
  const pinWrap = $("admPinStatic");
  if (pinWrap) pinWrap.hidden = false;
  const uChip = $("userChip");
  if (uChip) {
    uChip.innerHTML = `<div style="padding:10px;color:var(--text-dim);font-size:0.82rem;"><div style="font-weight:700;color:#fff;margin-bottom:4px;">🔐 Sign in to Admin</div><div style="font-size:0.7rem;color:var(--primary);">Use the PIN block below (works on any domain)</div></div>`;
  }
  const btn = $("btnLogout");
  if (btn) btn.textContent = "🔓 Sign In";
  return false;
}

async function adminLoginWithPin() {
  const pin = $("admPinIn")?.value.trim();
  if (!pin) return toast("Enter the Owner PIN.", "error");
  try {
    const res = await apiPost("admin/pin-login", { pin });
    if (!res.ok) return toast(res.error || "Invalid PIN", "error");
    localStorage.setItem(
      "bw_admin_session",
      JSON.stringify({ token: res.token, exp: Math.floor(Date.now() / 1000) + (res.expiresIn || 43200) - 60 })
    );
    STATE.user = { displayName: "Owner (PIN)", email: "owner@barakatwave.tv", uid: "owner_pin" };
    paintUser();
    toast("Owner access granted");
    await loadAll();
  } catch (err) { toast(err.message, "error"); }
}

function paintUser() {
  const u = STATE.user;
  if (!u) return;
  const pinWrap = $("admPinStatic");
  if (pinWrap) pinWrap.hidden = true;
  $("userName").textContent = u.displayName || u.email || "Admin";
  $("userRole").textContent = u.email ? (u.email.includes("muaaziqbal") ? "Super Admin" : "Admin") : "Admin";
  $("userAvatar").textContent = (u.displayName || u.email || "A").slice(0, 2).toUpperCase();
  const btn = $("btnLogout");
  if (btn) {
    btn.textContent = "🚪 Sign Out";
    btn.onclick = async () => {
      try { await logoutUser(); } catch {}
      localStorage.removeItem("bw_admin_session");
      location.reload();
    };
  }
}

/* ==================== API / RTDB ==================== */
function adminToken() {
  try {
    const s = localStorage.getItem("bw_admin_session");
    if (s) {
      const p = JSON.parse(s);
      if (p.token && (!p.exp || p.exp > Date.now() / 1000)) return p.token;
    }
  } catch {}
  return "";
}

async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const headers = { Accept: "application/json" };
  const t = adminToken();
  if (t) headers["x-admin-token"] = t;
  const res = await fetch(`/api/panel?${qs}`, { headers });
  if (!res.ok) throw new Error(`API ${action} failed (${res.status})`);
  return res.json();
}

async function apiPost(action, payload) {
  const headers = { "Content-Type": "application/json" };
  const t = adminToken();
  if (t) headers["x-admin-token"] = t;
  const res = await fetch("/api/panel", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error(`API ${action} failed (${res.status})`);
  return res.json();
}

/* RTDB wrappers with local mirror fallback (rtdb lib already has mirror) */
async function rtdbRead(path) {
  try { return await dbRead(path, null); } catch { return null; }
}
async function rtdbWrite(path, value) {
  try { await dbWrite(path, value); return true; } catch (e) { toast("RTDB write failed: " + e.message, "error"); return false; }
}
async function rtdbRemove(path) {
  try { await dbDelete(path); return true; } catch (e) { toast("Delete failed: " + e.message, "error"); return false; }
}

/* ==================== Loaders ==================== */
async function loadChannels() {
  const raw = await rtdbRead("channels");
  let arr = [];
  if (raw && typeof raw === "object") {
    arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  }
  STATE.channels = arr.map(c => ({
    id: c.id || c.streamId || `ch_${Math.random().toString(36).slice(2)}`,
    name: c.name || "Channel",
    category: c.category || "📺 Live TV",
    xtreamGroup: c.xtreamGroup || c.category || "📺 Live TV",
    country: c.country || "PK",
    language: c.language || "Urdu",
    tier: c.tier || "free",
    order: typeof c.order === "number" ? c.order : 9999,
    pinned: Boolean(c.pinned),
    status: c.status || "active",
    url: c.url || "",
    backupUrls: Array.isArray(c.backupUrls) ? c.backupUrls : [],
    logo: c.logo || "",
    streamId: c.streamId || 0,
    slug: c.slug || ""
  })).sort((a, b) => (a.order || 9999) - (b.order || 9999));
  renderChannels();
  $("badgeChannels").textContent = STATE.channels.length;
  $("kpiChannels").textContent = STATE.channels.length;
  const free = STATE.channels.filter(c => c.tier !== "pro").length;
  const pro = STATE.channels.filter(c => c.tier === "pro").length;
  $("kpiChannelsSub").textContent = `${free} Free • ${pro} PRO`;
}

async function loadPlaylists() {
  const raw = await rtdbRead("playlists");
  let arr = [];
  if (raw && typeof raw === "object") {
    arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  }
  STATE.playlists = arr.map(p => ({
    id: p.id || p.slug || `pl_${Math.random().toString(36).slice(2)}`,
    name: p.name || "My Playlist",
    channelIds: Array.isArray(p.channelIds) ? p.channelIds : [],
    customStreams: Array.isArray(p.customStreams) ? p.customStreams : [],
    uid: p.uid || "",
    updatedAt: p.updatedAt || ""
  }));
  renderPlaylists();
  $("badgePlaylists").textContent = STATE.playlists.length;
  $("kpiPlaylists").textContent = STATE.playlists.length;
}

async function loadXtream() {
  const raw = await rtdbRead("xtreamAccounts");
  let arr = [];
  if (raw && typeof raw === "object") {
    arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
  }
  STATE.xtreamAccounts = arr.map(a => ({
    username: a.username || a.id,
    password: a.password || "",
    email: a.email || "",
    displayName: a.displayName || a.username,
    plan: a.plan || "free",
    status: a.status || "Active",
    maxConnections: a.maxConnections || 1,
    expDate: a.expDate || 0,
    createdAt: a.createdAt || "",
    uid: a.uid || ""
  }));
  renderXtream();
  $("badgeXtream").textContent = STATE.xtreamAccounts.length;
  $("kpiXtream").textContent = STATE.xtreamAccounts.length;
  const active = STATE.xtreamAccounts.filter(a => a.status !== "expired" && a.status !== "suspended").length;
  const expired = STATE.xtreamAccounts.filter(a => a.status === "expired" || (a.expDate && Date.now()/1000 > a.expDate)).length;
  $("kpiXtreamSub").textContent = `${active} Active • ${expired} Expired`;
}

async function loadMovies() {
  // Try API catalog first, fallback to RTDB
  let arr = [];
  try {
    const data = await apiGet("catalog", { type: "movies" });
    if (data && Array.isArray(data.movies)) arr = data.movies;
  } catch {}
  if (!arr.length) {
    const raw = await rtdbRead("movies");
    if (raw && typeof raw === "object") {
      arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    }
  }
  STATE.movies = arr.map(m => ({
    id: m.id || m.imdbId || `mov_${Math.random().toString(36).slice(2)}`,
    imdbId: m.imdbId || "",
    title: m.title || "Movie",
    year: m.year || "",
    imdbRating: m.imdbRating || "",
    category: m.category || "🎬 IMDb MOVIES",
    tier: m.tier || "free",
    streamUrl: m.streamUrl || "",
    poster: m.poster || ""
  }));
  renderMovies();
}

async function loadSeries() {
  let arr = [];
  try {
    const data = await apiGet("catalog", { type: "series" });
    if (data && Array.isArray(data.series)) arr = data.series;
  } catch {}
  if (!arr.length) {
    const raw = await rtdbRead("series");
    if (raw && typeof raw === "object") {
      arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    }
  }
  STATE.series = arr.map(s => ({
    id: s.id || s.imdbId || `ser_${Math.random().toString(36).slice(2)}`,
    imdbId: s.imdbId || "",
    title: s.title || "Series",
    year: s.year || "",
    imdbRating: s.imdbRating || "",
    category: s.category || "📺 IMDb SERIES",
    seasonsCount: s.seasonsCount || 1,
    tier: s.tier || "free",
    streamUrl: s.streamUrl || "",
    poster: s.poster || ""
  }));
  renderSeries();
}

async function loadUsers() {
  const raw = await rtdbRead("users");
  let arr = [];
  if (raw && typeof raw === "object") {
    arr = Object.entries(raw).map(([uid, v]) => ({ uid, ...v }));
  }
  STATE.users = arr.map(u => ({
    uid: u.uid,
    name: u.displayName || u.name || "User",
    email: u.email || "",
    plan: u.plan || "free",
    createdAt: u.createdAt || "",
    xtreamUsername: u.xtreamUsername || ""
  }));
  renderUsers();
}

async function loadSettings() {
  const s = await rtdbRead("settings/defaults") || {};
  STATE.settings = s;
  ["stWelcome","stOffline","stPro","stComing","stWa","stTicker"].forEach(id => {
    const el = $(id); if (el) el.value = s[id.replace("st","").toLowerCase()] || "";
  });
  $("kpiSystem").textContent = "100%";
}

async function loadActivity() {
  // Build recent activity from available data
  const items = [];
  STATE.channels.slice(0, 5).forEach(c => items.push({ time: c.createdAt || "", event: `Channel "${c.name}" updated`, actor: "Admin", status: "ok" }));
  STATE.xtreamAccounts.slice(0, 5).forEach(a => items.push({ time: a.createdAt || "", event: `Xtream user "${a.username}" created`, actor: "Admin", status: "ok" }));
  STATE.playlists.slice(0, 5).forEach(p => items.push({ time: p.updatedAt || "", event: `Playlist "${p.name}" modified`, actor: "Admin", status: "ok" }));
  items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  STATE.activity = items.slice(0, 10);
  renderActivity();
}

async function loadAnalytics() {
  try {
    const data = await apiGet("analytics");
    const s = data.live?.summary || {};
    $("anOnline").textContent = s.onlineNow ?? 0;
    $("anSessions").textContent = s.totalSessions ?? 0;
    $("anPlays").textContent = s.totalPlays ?? 0;
    $("anAvg").textContent = Math.round((s.avgSessionSec || 0) / 60) + " min";
    renderVisitorSessions(data.live?.sessions || []);
  } catch {
    $("anOnline").textContent = "—";
    $("anSessions").textContent = "—";
    $("anPlays").textContent = "—";
    $("anAvg").textContent = "—";
  }
}

async function loadAll() {
  await Promise.all([loadChannels(), loadPlaylists(), loadXtream(), loadMovies(), loadSeries(), loadUsers(), loadSettings(), loadActivity(), loadAnalytics()]);
}

/* ==================== Renderers ==================== */
function switchTab(tab) {
  STATE.tab = tab;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("section[id^=view]").forEach(s => hide(s));
  const el = $(`view${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (el) show(el);
  $("pageTitle").textContent = {
    dashboard: "📊 Dashboard",
    channels: "📺 Channel Manager",
    playlists: "📋 Playlist Manager",
    xtream: "⚡ Xtream Accounts",
    movies: "🎬 Movies",
    series: "📺 Series",
    analytics: "📈 Live Analytics",
    users: "👤 Users",
    settings: "⚙️ Settings"
  }[tab] || tab;
  $("pageSub").textContent = {
    dashboard: "Real-time IPTV server overview",
    channels: "Manage all live channels — add, edit, order, tier, test streams",
    playlists: "Cloud M3U playlists + Xtream account playlists",
    xtream: "All Xtream Codes server users — expiry, connections, activity",
    movies: "IMDb-powered movie catalog for web & Xtream apps",
    series: "IMDb TV series catalog with episodes",
    analytics: "Real-time visitors, sessions & stream plays",
    users: "Registered Firebase users & Xtream mappings",
    settings: "Broadcast videos, ticker & PRO contact"
  }[tab] || "";
  if (tab === "channels") renderChannels();
  if (tab === "playlists") renderPlaylists();
  if (tab === "xtream") renderXtream();
  if (tab === "movies") renderMovies();
  if (tab === "series") renderSeries();
  if (tab === "users") renderUsers();
  if (tab === "analytics") loadAnalytics();
}

function applySearch(listId) {
  const q = STATE.search.toLowerCase();
  const rows = $(listId).querySelectorAll("tr[data-row]");
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.hidden = !text.includes(q);
  });
}

function renderChannels() {
  const tbody = $("chBody");
  if (!tbody) return;
  let list = STATE.channels;
  const q = $("chSearch") ? $("chSearch").value.toLowerCase() : "";
  const tier = $("chTierFilter") ? $("chTierFilter").value : "ALL";
  const group = $("chGroupFilter") ? $("chGroupFilter").value : "ALL";

  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
  if (tier !== "ALL") list = list.filter(c => c.tier === tier);
  if (group !== "ALL") list = list.filter(c => c.xtreamGroup === group);

  // populate group filter
  const gf = $("chGroupFilter");
  if (gf && gf.options.length <= 1) {
    const groups = [...new Set(STATE.channels.map(c => c.xtreamGroup))].sort();
    groups.forEach(g => { const o = document.createElement("option"); o.value = g; o.textContent = g; gf.appendChild(o); });
  }

  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:30px;">No channels match.</td></tr>`;
    return;
  }
  list.forEach((c, idx) => {
    const tierBadge = c.tier === "pro" ? `<span class="badge badge-pro">👑 PRO</span>` : `<span class="badge badge-free">🟢 FREE</span>`;
    const statusDot = c.status === "active" ? `<span class="status-dot"></span>` : `<span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);"></span>`;
    const orderInput = `<input type="number" value="${esc(c.order)}" data-ch-id="${esc(c.id)}" class="ch-order" style="width:55px;padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.06);color:#fff;font-size:0.78rem;" />`;
    const urlShort = c.url ? (c.url.length > 42 ? c.url.slice(0, 42) + "…" : c.url) : "—";
    tbody.innerHTML += `
      <tr data-row>
        <td style="width:4%;">${idx + 1}</td>
        <td style="width:6%;"><img src="${esc(c.logo || '/assets/logo-fallback.svg')}" onerror="this.src='/assets/logo-fallback.svg';" style="width:28px;height:28px;border-radius:6px;object-fit:cover;background:#000;" /></td>
        <td><div class="t-cell"><div style="font-weight:700;">${esc(c.name)}</div><div style="font-size:0.72rem;color:var(--text-muted);">${c.slug || c.streamId || ""}</div></div></td>
        <td>${esc(c.xtreamGroup)}</td>
        <td>${esc(c.country)}</td>
        <td>${tierBadge}</td>
        <td>${orderInput}</td>
        <td title="${esc(c.url)}" style="font-size:0.76rem;color:var(--text-dim);word-break:break-all;max-width:180px;">${esc(urlShort)}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.editChannel('${esc(c.id)}')" title="Edit">✎</button>
            <button class="btn-sm danger" onclick="app.deleteChannel('${esc(c.id)}','${esc(c.name)}')" title="Delete">✕</button>
            <button class="btn-sm primary" onclick="app.testStream('${esc(c.url)}')" title="Test">🔌</button>
          </div>
        </td>
      </tr>`;
  });
  // wire order inputs
  tbody.querySelectorAll(".ch-order").forEach(inp => {
    inp.addEventListener("change", async () => {
      const id = inp.dataset.chId;
      const val = Math.max(1, Number(inp.value) || 1);
      const ch = STATE.channels.find(c => c.id === id);
      if (ch) { ch.order = val; await rtdbWrite(`channels/${id}`, { ...ch, order: val }); toast("Order updated"); loadChannels(); }
    });
  });
}

function renderPlaylists() {
  const tbody = $("plBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!STATE.playlists.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-sm" style="text-align:center;padding:24px;">No playlists yet. Create one below.</td></tr>`;
    return;
  }
  STATE.playlists.forEach(p => {
    const count = p.channelIds ? p.channelIds.length : 0;
    const m3uLink = `${location.origin}/playlist/${esc(p.id)}.m3u8`;
    tbody.innerHTML += `
      <tr data-row>
        <td><div style="font-weight:700;">${esc(p.name)}</div><div style="font-size:0.72rem;color:var(--text-muted);">${esc(p.id)}</div></td>
        <td>${count} channels</td>
        <td>${esc(p.uid || "—")}</td>
        <td style="word-break:break-all;font-size:0.76rem;color:var(--primary);">${esc(m3uLink)}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.copyText('${esc(m3uLink)}')" title="Copy link">📋</button>
            <button class="btn-sm primary" onclick="app.editPlaylist('${esc(p.id)}')" title="Edit">✎</button>
            <button class="btn-sm danger" onclick="app.deletePlaylist('${esc(p.id)}','${esc(p.name)}')" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
  });
}

function renderXtreamTable(tbodyId, list) {
  const tbody = $(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted-sm" style="text-align:center;padding:24px;">No accounts found.</td></tr>`;
    return;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  list.forEach(a => {
    const expired = a.status === "expired" || (a.expDate && nowSec > a.expDate);
    const badge = expired ? `<span class="badge badge-expired">⏰ EXPIRED</span>` : (a.status === "suspended" ? `<span class="badge badge-pending">⏸ SUSPENDED</span>` : `<span class="badge badge-active">✅ ACTIVE</span>`);
    const exp = a.expDate ? new Date(a.expDate * 1000).toLocaleDateString("en-PK") : "Never";
    tbody.innerHTML += `
      <tr data-row>
        <td><div style="font-weight:700;">${esc(a.username)}</div><div style="font-size:0.72rem;color:var(--text-muted);">${esc(a.uid)}</div></td>
        <td><code style="font-size:0.72rem;">${esc(a.password)}</code></td>
        <td>${esc(a.email || "—")}</td>
        <td>${a.plan === "pro" ? `<span class="badge badge-pro">👑 PRO</span>` : `<span class="badge badge-free">🟢 FREE</span>`}</td>
        <td>${badge}</td>
        <td>${exp}</td>
        <td>${a.maxConnections}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.copyText('${esc(a.username)}')" title="Copy username">👤</button>
            <button class="btn-sm outline" onclick="app.copyText('${esc(a.password)}')" title="Copy password">🔑</button>
            <button class="btn-sm danger" onclick="app.deleteXtream('${esc(a.username)}','${esc(a.username)}')" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
  });
}

function renderXtream() {
  let list = STATE.xtreamAccounts;
  const q = $("xtSearch") ? $("xtSearch").value.toLowerCase() : "";
  if (q) list = list.filter(a => a.username.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.plan.toLowerCase().includes(q));
  renderXtreamTable("xtBody", list);
}

function renderMovies() {
  const tbody = $("mvBody");
  if (!tbody) return;
  let list = STATE.movies;
  const q = $("mvSearch") ? $("mvSearch").value.toLowerCase() : "";
  if (q) list = list.filter(m => m.title.toLowerCase().includes(q) || m.imdbId.toLowerCase().includes(q) || m.year.toLowerCase().includes(q));
  tbody.innerHTML = "";
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:24px;">No movies found.</td></tr>`; return; }
  list.forEach(m => {
    tbody.innerHTML += `
      <tr data-row>
        <td style="width:6%;"><img src="${esc(m.poster || '/assets/logo-fallback.svg')}" onerror="this.src='/assets/logo-fallback.svg';" style="width:34px;height:46px;border-radius:6px;object-fit:cover;background:#000;" /></td>
        <td><div style="font-weight:700;">${esc(m.title)}</div><div style="font-size:0.72rem;color:var(--text-muted);">${esc(m.imdbId)}</div></td>
        <td>${esc(m.imdbRating)}</td>
        <td>${esc(m.year)}</td>
        <td>${esc(m.category)}</td>
        <td>${m.tier === "pro" ? `<span class="badge badge-pro">👑 PRO</span>` : `<span class="badge badge-free">🟢 FREE</span>`}</td>
        <td style="font-size:0.76rem;color:var(--text-dim);">${m.streamUrl ? "✅ Stream set" : "⏳ Coming Soon"}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.editMovie('${esc(m.id)}')" title="Edit">✎</button>
            <button class="btn-sm danger" onclick="app.deleteMovie('${esc(m.id)}','${esc(m.title)}')" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
  });
}

function renderSeries() {
  const tbody = $("srBody");
  if (!tbody) return;
  let list = STATE.series;
  const q = $("srSearch") ? $("srSearch").value.toLowerCase() : "";
  if (q) list = list.filter(s => s.title.toLowerCase().includes(q) || s.imdbId.toLowerCase().includes(q) || s.year.toLowerCase().includes(q));
  tbody.innerHTML = "";
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="8" class="muted-sm" style="text-align:center;padding:24px;">No series found.</td></tr>`; return; }
  list.forEach(s => {
    tbody.innerHTML += `
      <tr data-row>
        <td style="width:6%;"><img src="${esc(s.poster || '/assets/logo-fallback.svg')}" onerror="this.src='/assets/logo-fallback.svg';" style="width:34px;height:46px;border-radius:6px;object-fit:cover;background:#000;" /></td>
        <td><div style="font-weight:700;">${esc(s.title)}</div><div style="font-size:0.72rem;color:var(--text-muted);">${esc(s.imdbId)}</div></td>
        <td>${esc(s.imdbRating)}</td>
        <td>${esc(s.year)}</td>
        <td>${esc(s.category)}</td>
        <td>${s.seasonsCount}</td>
        <td>${s.tier === "pro" ? `<span class="badge badge-pro">👑 PRO</span>` : `<span class="badge badge-free">🟢 FREE</span>`}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.editSeries('${esc(s.id)}')" title="Edit">✎</button>
            <button class="btn-sm danger" onclick="app.deleteSeries('${esc(s.id)}','${esc(s.title)}')" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
  });
}

function renderUsers() {
  const tbody = $("usBody");
  if (!tbody) return;
  let list = STATE.users;
  const q = $("usSearch") ? $("usSearch").value.toLowerCase() : "";
  if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q));
  tbody.innerHTML = "";
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:24px;">No users found.</td></tr>`; return; }
  list.forEach(u => {
    tbody.innerHTML += `
      <tr data-row>
        <td><div style="font-weight:700;">${esc(u.name)}</div></td>
        <td>${esc(u.email)}</td>
        <td style="font-size:0.74rem;color:var(--text-dim);word-break:break-all;">${esc(u.uid)}</td>
        <td>${u.plan === "pro" ? `<span class="badge badge-pro">👑 PRO</span>` : `<span class="badge badge-free">🟢 FREE</span>`}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>
          <div class="t-actions">
            <button class="btn-sm outline" onclick="app.copyText('${esc(u.xtreamUsername || "—")}')" title="Copy Xtream">📺</button>
          </div>
        </td>
      </tr>`;
  });
}

function renderActivity() {
  const tbody = $("activityBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!STATE.activity.length) { tbody.innerHTML = `<tr><td colspan="4" class="muted-sm" style="text-align:center;padding:24px;">No recent activity.</td></tr>`; return; }
  STATE.activity.forEach(a => {
    const tone = a.status === "ok" ? "ok" : "warn";
    tbody.innerHTML += `
      <tr data-row>
        <td style="font-size:0.76rem;color:var(--text-dim);">${fmtTime(a.time)}</td>
        <td>${esc(a.event)}</td>
        <td>${esc(a.actor)}</td>
        <td><span class="badge ${tone === "ok" ? "badge-active" : "badge-pending"}">${tone === "ok" ? "✅ OK" : "⚠️"}</span></td>
      </tr>`;
  });
}

function renderVisitorSessions(sessions) {
  const tbody = $("anBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!sessions.length) { tbody.innerHTML = `<tr><td colspan="6" class="muted-sm" style="text-align:center;padding:24px;">No sessions tracked yet.</td></tr>`; return; }
  sessions.slice(0, 12).forEach(s => {
    tbody.innerHTML += `
      <tr data-row>
        <td style="font-size:0.76rem;color:var(--text-dim);">${fmtTime(s.at || s.createdAt)}</td>
        <td>${esc(s.userName || s.email || "Visitor")}</td>
        <td>${esc(s.country || s.city || "—")}</td>
        <td>${esc(s.device || "Web")}</td>
        <td>${esc(s.currentView || s.watching || "Live TV")}</td>
        <td>${esc(s.stayed || "0s")}</td>
      </tr>`;
  });
}

/* ==================== Channel CRUD ==================== */
window.app = {
  copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard"));
  },

  openChannelModal(ch = null) {
    const modal = $("chModal");
    const title = $("chModalTitle");
    const form = $("chForm");
    form.reset();
    $("chEditId").value = "";
    if (ch) {
      title.textContent = "✎ Edit Channel";
      $("chEditId").value = ch.id;
      $("chName").value = ch.name;
      $("chCategory").value = ch.category;
      $("chTier").value = ch.tier;
      $("chOrder").value = ch.order || "";
      $("chCountry").value = ch.country;
      $("chLanguage").value = ch.language;
      $("chUrl").value = ch.url;
      $("chBackup").value = (ch.backupUrls || []).join(", ");
      $("chLogo").value = ch.logo;
    } else {
      title.textContent = "➕ Add New Channel";
    }
    $("chResult").innerHTML = "";
    show(modal);
  },

  async saveChannel(e) {
    e.preventDefault();
    const btn = $("chSaveBtn");
    const id = $("chEditId").value.trim();
    const payload = {
      id,
      name: $("chName").value.trim(),
      category: $("chCategory").value.trim(),
      xtreamGroup: $("chCategory").value.trim(),
      tier: $("chTier").value,
      order: Number($("chOrder").value) || 9999,
      country: $("chCountry").value.trim() || "PK",
      language: $("chLanguage").value.trim() || "Urdu",
      url: $("chUrl").value.trim(),
      backupUrls: $("chBackup").value.split(",").map(s => s.trim()).filter(Boolean),
      logo: $("chLogo").value.trim(),
      status: "active",
      updatedAt: new Date().toISOString()
    };
    if (!payload.name) return toast("Channel name is required", "error");
    if (!payload.url) return toast("Stream URL is required", "error");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const action = id ? "admin/channel/update" : "admin/channel/create";
      await apiPost(action, payload);
      toast(id ? "Channel updated" : "Channel created");
      hide($("chModal"));
      await loadChannels();
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "💾 Save Channel"; }
  },

  async editChannel(id) {
    const ch = STATE.channels.find(c => c.id === id);
    if (ch) this.openChannelModal(ch);
  },

  async deleteChannel(id, name) {
    if (!confirm(`Delete channel "${name}"?`)) return;
    try {
      await apiPost("admin/channel/delete", { id });
      toast("Channel deleted");
      await loadChannels();
    } catch (err) { toast(err.message, "error"); }
  },

  async testStream(url) {
    if (!url) return toast("No stream URL", "error");
    const probe = await fetch(`/api/probe?url=${encodeURIComponent(url)}`).then(r => r.json()).catch(() => ({ ok: false, error: "probe failed" }));
    const el = $("chTestResult");
    if (el) {
      el.innerHTML = probe.ok ? `<span class="probe-ok">✅ Stream OK (${probe.status || "live"})</span>` : `<span class="probe-bad">❌ ${esc(probe.error || "failed")}</span>`;
    }
    toast(probe.ok ? "Stream is working!" : "Stream test failed", probe.ok ? "ok" : "error");
  },

  /* ==================== Playlist CRUD ==================== */
  async createPlaylist() {
    const name = prompt("Playlist name (e.g. Pakistan Sports Pack):");
    if (!name) return;
    const id = `pl_${Date.now().toString(36)}`;
    const payload = { id, name, channelIds: [], customStreams: [], uid: STATE.user?.uid || "admin", updatedAt: new Date().toISOString() };
    try {
      await apiPost("admin/playlist/create", payload);
      toast("Playlist created");
      await loadPlaylists();
    } catch (err) { toast(err.message, "error"); }
  },

  async editPlaylist(id) {
    const p = STATE.playlists.find(x => x.id === id);
    if (!p) return;
    const chosen = prompt("Enter channel IDs to include (comma separated):", (p.channelIds || []).join(", "));
    if (chosen === null) return;
    const ids = chosen.split(",").map(s => s.trim()).filter(Boolean);
    const payload = { ...p, channelIds: ids, updatedAt: new Date().toISOString() };
    try {
      await apiPost("admin/playlist/create", payload); // create endpoint upserts by id
      toast("Playlist updated");
      await loadPlaylists();
    } catch (err) { toast(err.message, "error"); }
  },

  async deletePlaylist(id, name) {
    if (!confirm(`Delete playlist "${name}"?`)) return;
    try {
      await apiPost("admin/playlist/delete", { id });
      toast("Playlist deleted");
      await loadPlaylists();
    } catch (err) { toast(err.message, "error"); }
  },

  /* ==================== Xtream CRUD ==================== */
  openXtreamModal(a = null) {
    const modal = $("xtModal");
    const form = $("xtForm");
    form.reset();
    if (a) {
      $("xtModalTitle").textContent = "✎ Edit Xtream User";
      $("xtUser").value = a.username;
      $("xtPass").value = a.password;
      $("xtPlan").value = a.plan;
      $("xtConn").value = a.maxConnections;
      $("xtExp").value = a.expDate ? Math.round((a.expDate * 1000 - Date.now()) / 86400000) : "";
      $("xtEmail").value = a.email;
    } else {
      $("xtModalTitle").textContent = "⚡ Create Xtream User";
    }
    $("xtResult").innerHTML = "";
    show(modal);
  },

  async saveXtream(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const username = $("xtUser").value.trim();
    const payload = {
      username,
      password: $("xtPass").value.trim() || `BW${Math.floor(1000 + Math.random() * 9000)}`,
      plan: $("xtPlan").value,
      maxConnections: Number($("xtConn").value) || 1,
      email: $("xtEmail").value.trim(),
      status: "Active",
      createdAt: new Date().toISOString(),
      expDate: $("xtExp").value ? Math.floor((Date.now() + Number($("xtExp").value) * 86400000) / 1000) : 0,
      uid: STATE.user?.uid || "admin"
    };
    if (!username) return toast("Username required", "error");
    btn.disabled = true;
    try {
      await apiPost("admin/xtream/create", payload);
      toast("Xtream account saved");
      hide($("xtModal"));
      await loadXtream();
    } catch (err) { toast(err.message, "error"); }
    finally { btn.disabled = false; }
  },

  async deleteXtream(username, label) {
    if (!confirm(`Delete Xtream user "${label}"?`)) return;
    try {
      await apiPost("admin/xtream/delete", { username });
      toast("Xtream user deleted");
      await loadXtream();
    } catch (err) { toast(err.message, "error"); }
  },

  /* ==================== Movies / Series CRUD (stubs -> RTDB) ==================== */
  async editMovie(id) { toast("Movie editor opens RTDB record"); },
  async deleteMovie(id, name) { if (confirm(`Delete "${name}"?`)) { await rtdbRemove(`movies/${id}`); toast("Deleted"); await loadMovies(); } },
  async editSeries(id) { toast("Series editor opens RTDB record"); },
  async deleteSeries(id, name) { if (confirm(`Delete "${name}"?`)) { await rtdbRemove(`series/${id}`); toast("Deleted"); await loadSeries(); } },

  /* ==================== Settings ==================== */
  async saveSettings() {
    const payload = {
      welcomeVideoUrl: $("stWelcome").value,
      channelOfflineVideoUrl: $("stOffline").value,
      proUnlockVideoUrl: $("stPro").value,
      comingSoonVideoUrl: $("stComing").value,
      proWhatsapp: $("stWa").value,
      siteAnnouncement: $("stTicker").value,
      updatedAt: new Date().toISOString()
    };
    if (await rtdbWrite("settings/defaults", payload)) {
      toast("Broadcast settings saved");
      await loadSettings();
    }
  },

  init() {
    // Tabs
    document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    // Global search
    const gs = $("globalSearch");
    if (gs) gs.addEventListener("input", (e) => { STATE.search = e.target.value; applySearch("chBody"); applySearch("xtBody"); applySearch("mvBody"); applySearch("srBody"); applySearch("usBody"); applySearch("plBody"); });
    // Section search inputs
    ["chSearch","xtSearch","mvSearch","srSearch","usSearch"].forEach(id => {
      const el = $(id); if (el) el.addEventListener("input", (e) => { STATE.search = e.target.value; const t = id.replace("Search","Body"); applySearch(t); });
    });
    // Filters
    $("chTierFilter")?.addEventListener("change", () => renderChannels());
    $("chGroupFilter")?.addEventListener("change", () => renderChannels());
    $("chClearFilters")?.addEventListener("click", () => { $("chSearch").value = ""; $("chTierFilter").value = "ALL"; $("chGroupFilter").value = "ALL"; renderChannels(); });
    // Channel modal
    $("chAddBtn")?.addEventListener("click", () => this.openChannelModal());
    $("qAddChannel")?.addEventListener("click", () => this.openChannelModal());
    $("chModalClose")?.addEventListener("click", () => hide($("chModal")));
    $("chForm")?.addEventListener("submit", (e) => this.saveChannel(e));
    $("chTestBtn")?.addEventListener("click", (e) => { e.preventDefault(); this.testStream($("chUrl").value); });
    // Xtream modal
    $("xtAddBtn")?.addEventListener("click", () => this.openXtreamModal());
    $("qAddXtream")?.addEventListener("click", () => this.openXtreamModal());
    $("xtModalClose")?.addEventListener("click", () => hide($("xtModal")));
    $("xtForm")?.addEventListener("submit", (e) => this.saveXtream(e));
    // Playlist
    $("plCreateBtn")?.addEventListener("click", () => this.createPlaylist());
    // Settings
    $("stSave")?.addEventListener("click", (e) => { e.preventDefault(); this.saveSettings(); });
    // Refresh
    $("btnRefresh")?.addEventListener("click", async () => { $("btnRefresh").disabled = true; await loadAll(); toast("Data refreshed"); $("btnRefresh").disabled = false; });
    // PIN login (delegated, since sidebar HTML is dynamic)
    document.addEventListener("click", (e) => {
      if (e.target.id === "admPinLoginBtn") adminLoginWithPin();
    });
    $("admPinIn")?.addEventListener("keydown", (e) => { if (e.key === "Enter") adminLoginWithPin(); });
    // Theme
    $("btnTheme")?.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("bw_theme", next);
      $("btnTheme").textContent = next === "dark" ? "🌙" : "☀️";
    });
    // Real-time Firebase listeners — instant updates, no polling
    dbWatch("channels", () => loadChannels(), null);
    dbWatch("playlists", () => loadPlaylists(), null);
    dbWatch("xtreamAccounts", () => loadXtream(), null);
    // Analytics is external tracking data — refresh every 10s
    STATE.timer = setInterval(() => loadAnalytics(), 10000);
    window.__BW_BOOTED = true;
  }
};

/* ==================== Boot ==================== */
(async () => {
  try {
    const authed = await ensureAdmin();
    if (!authed) {
      // Still load public-ish data so panel isn't empty, but writes require sign-in
    }
    await loadAll();
    window.app.init();
    // Auto-switch to channels if no preference
    switchTab("dashboard");
    // show a small sign-in hint once
    setTimeout(() => { if (!STATE.user) toast("Sign in with Owner PIN / Google to manage channels & playlists", "warn"); }, 1500);
  } catch (err) {
    console.error("Admin panel boot failed", err);
    toast("Boot failed: " + err.message, "error");
  }
})();
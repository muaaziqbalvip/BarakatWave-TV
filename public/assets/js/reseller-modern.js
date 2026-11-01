/**
 * BarakatWave TV — Modern Reseller Panel (Rebuild v2)
 * Fast | Real-time | Beautiful | Dealer & Client Management
 * Mizanora Projects by Muaaz Iqbal
 *
 * Talks to /api/panel (public + reseller authenticated endpoints).
 */

const STATE = {
  config: null,
  dealer: null,
  dealerStats: null,
  dealerClients: [],
  dealerFinance: null,
  adminToken: "",
  adminUser: null,
  tab: "order",
  search: ""
};

const $ = (id) => document.getElementById(id);
const show = (el) => el && (el.hidden = false);
const hide = (el) => el && (el.hidden = true);
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (v) => "Rs " + Number(v || 0).toLocaleString("en-PK");
const fmtDate = (ts) => {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
};

function toast(msg, tone = "ok") {
  const wrap = $("toastContainer");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${tone === "error" ? "error" : tone === "warn" ? "warn" : "ok"}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ==================== API ==================== */
const API_TIMEOUT_MS = 20000;
async function fetchWithTimeout(url, opts = {}, ms = API_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Server took too long to reply. Check your internet.");
    throw new Error("Network error — check your connection.");
  } finally { clearTimeout(timer); }
}

async function api(action, payload = null, { method = "POST", headers = {} } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (method === "POST") opts.body = JSON.stringify({ action, ...payload });
  const url = method === "POST" ? "/api/panel" : `/api/panel?action=${encodeURIComponent(action)}`;
  const res = await fetchWithTimeout(url, opts);
  let json = {};
  try { json = await res.json(); } catch { json = { ok: false, error: `Server returned ${res.status}` }; }
  if (!res.ok && json.ok !== true) {
    throw Object.assign(new Error(json.error || `Request failed (${res.status})`), { status: res.status });
  }
  return json;
}

/* ==================== Config ==================== */
async function loadConfig() {
  try {
    STATE.config = await api("config", null, { method: "GET" });
    paintConfig();
  } catch (err) { toast("Config load nahi hua: " + err.message, "error"); }
}

function paintConfig() {
  const c = STATE.config;
  if (!c) return;
  $("statFree").textContent = `${c.trialDays} Day`;
  $("statDirect").textContent = money(c.directPerUserMonthly);
  $("statReseller").textContent = money(c.resellerPerUserMonthly);
  $("statPlans").textContent = c.plans?.length || 5;

  const planSel = $("ordPlan"); const clPlan = $("clPlan");
  [planSel, clPlan].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = (c.plans || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${p.days} days — ${p.direct === 0 ? "FREE" : money(p.direct)}</option>`).join("");
  });
  if (planSel) planSel.value = "monthly";

  const tbody = $("priceTable")?.querySelector("tbody");
  if (tbody) {
    tbody.innerHTML = (c.plans || []).map(p =>
      `<tr><td><strong>${esc(p.name)}</strong><br /><span class="muted-sm">${esc(p.urdu || "")}</span></td><td>${p.direct === 0 ? "FREE" : money(p.direct)}</td><td>${p.reseller === 0 ? "FREE" : money(p.reseller)}</td><td>${p.days}</td></tr>`).join("");
  }
  const steps = $("paymentSteps");
  if (steps) steps.innerHTML = (c.payment?.steps || []).map(s => `<li><strong>${esc(s.title)}</strong><br /><span class="muted-sm">${esc(s.detail)}</span></li>`).join("");
  paintOrderSummary();
}

function paintOrderSummary() {
  if (!STATE.config) return;
  const plan = (STATE.config.plans || []).find(p => p.id === $("ordPlan").value) || STATE.config.plans?.[1];
  const qty = Math.max(1, Number($("ordQty").value) || 1);
  const unit = $("ordAudience").value === "reseller" ? plan.reseller : plan.direct;
  $("sumPlan").textContent = `${plan.name} (${plan.days} days)`;
  $("sumUnit").textContent = money(unit);
  $("sumQty").textContent = qty;
  $("sumTotal").textContent = money(unit * qty);
}

/* ==================== Tabs ==================== */
function switchTab(tab) {
  STATE.tab = tab;
  document.querySelectorAll(".panel-tab").forEach(b => b.classList.toggle("active", b.dataset.panelTab === tab));
  document.querySelectorAll(".panel-pane").forEach(p => { p.hidden = p.dataset.panelPane !== tab; });
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
  $("pageTitle")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });

  if (tab === "dashboard" && STATE.dealer) paintDashboard(STATE.dealer, STATE.dealerStats, STATE.dealerClients, STATE.dealerFinance);
  if (tab === "admin") loadAdminData();
  if (tab === "payment") loadPricing();
}

function bindTabs() {
  document.querySelectorAll(".panel-tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.panelTab)));
  document.querySelectorAll("[data-panel-jump]").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.panelJump)));
  const initial = (location.hash || "").replace("#", "");
  if (initial && document.querySelector(`[data-panel-pane="${initial}"]`)) switchTab(initial);
}

/* ==================== Order ==================== */
function bindOrder() {
  ["ordAudience", "ordPlan", "ordQty"].forEach(id => $(id)?.addEventListener("input", paintOrderSummary));
  $("ordCopyBtn")?.addEventListener("click", () => {
    const p = STATE.config?.payment;
    copyText(`JazzCash: ${p?.accountNumber || "03062015326"}\nTitle: ${p?.accountTitle || "Muaaz Iqbal"}\nAmount: ${$("sumTotal").textContent}\nWhatsApp: ${p?.accountNumber || "03062015326"}`, "JazzCash details copied");
  });
  $("copyJazzBtn")?.addEventListener("click", () => copyText(STATE.config?.payment?.accountNumber || "03062015326", "JazzCash number copied"));

  $("orderForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("orderResult");
    const payload = {
      planId: $("ordPlan").value, audience: $("ordAudience").value, quantity: Number($("ordQty").value) || 1,
      name: $("ordName").value.trim(), whatsapp: $("ordWhatsapp").value.trim(), email: $("ordEmail").value.trim(),
      username: $("ordUsername").value.trim(), txnId: $("ordTxn").value.trim(), resellerCode: $("ordResellerCode").value.trim(),
      note: $("ordNote").value.trim(), proofDataUrl: $("ordProof").value || ""
    };
    if (!payload.name || payload.name.length < 3) return showResult(out, "Full name zaroori hai.", "error");
    if (!/^[0-9+\-\s]{9,17}$/.test(payload.whatsapp)) return showResult(out, "Valid WhatsApp number dalein.", "error");
    try {
      const fileInput = $("ordProofFile");
      if (fileInput?.files?.[0]) {
        try { $("ordProof").value = await readProofFile(fileInput.files[0]); } catch (err) { return showResult(out, `❌ ${esc(err.message)}`, "error"); }
      }
      showResult(out, "Order submit ho raha hai…", "warn");
      const res = await api("order", payload);
      const pay = res.payment || {};
      showResult(out, `<strong>✅ Order ${esc(res.order.id)} place ho gaya</strong><br/>Bhejein <strong>${money(pay.amount)}</strong> JazzCash <strong>${esc(pay.number || "0306-2015326")}</strong> (${esc(pay.title || "Muaaz Iqbal")}) reference <code>${esc(res.order.id)}</code>.<br/>WhatsApp screenshot <strong>${esc(STATE.config?.support?.phone || "0306-2015326")}</strong> pe.<br/><span class="muted-sm">Status: pending review.</span>`);
      $("trackId").value = res.order.id;
      toast("Order create ho gaya — screenshot WhatsApp karein.");
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
  });

  $("trackBtn")?.addEventListener("click", async () => {
    const id = $("trackId").value.trim(); const out = $("trackResult");
    if (!id) return showResult(out, "Order ID dalein.", "error");
    try {
      const res = await api("order-status", { orderId: id });
      const o = res.order; const tone = o.status === "approved" ? "ok" : o.status === "rejected" ? "error" : "warn";
      showResult(out, `<strong>Order ${esc(o.id)}</strong><br/>Status: <strong>${esc(o.status.toUpperCase())}</strong><br/>Plan: ${esc(o.planName)} x${o.quantity}<br/>Amount: ${money(o.total)}<br/>Created: ${fmtDate(o.createdAt)}`, tone);
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
  });
}

function readProofFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!/^image\//.test(file.type)) return reject(new Error("JPG ya PNG screenshot chunein."));
    if (file.size > 6 * 1024 * 1024) return reject(new Error("Screenshot 6 MB se chhota hona chahiye."));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 760; const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url); resolve(canvas.toDataURL("image/jpeg", 0.62));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image read nahi ho saki.")); };
    img.src = url;
  });
}

/* ==================== Trial ==================== */
function bindTrial() {
  $("trialForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const out = $("trialResult");
    try {
      showResult(out, "Free trial activate ho raha hai…", "warn");
      const res = await api("trial", { email: $("trEmail").value.trim(), whatsapp: $("trWhatsapp").value.trim(), deviceId: "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36) });
      if (!res.ok) { showResult(out, `⚠️ ${esc(res.error)}`, "warn"); return; }
      const c = res.credentials;
      const xt = `Host: ${c.serverUrl}\nPort: 443\nUsername: ${c.username}\nPassword: ${c.password}`;
      showResult(out, `<strong>🎉 Trial active until ${fmtDate(c.expiresAt)}</strong><br/><div class="kv-list"><div><span>Host</span><strong>${esc(c.serverUrl)}</strong></div><div><span>Username</span><strong>${esc(c.username)}</strong></div><div><span>Password</span><strong>${esc(c.password)}</strong></div></div>M3U:<br/><code style="word-break:break-all;">${esc(c.m3u)}</code><br/><br/>EPG:<br/><code style="word-break:break-all;">${esc(c.epg)}</code><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;"><button class="btn-sm primary" id="trialCopyXtream">📋 Copy Xtream</button><button class="btn-sm primary" id="trialCopyM3u">📋 Copy M3U</button><a class="btn-sm outline" href="https://siravex.vercel.app" target="_blank">▶ Siravex Player</a></div>`);
      $("trialCopyXtream")?.addEventListener("click", () => copyText(xt, "Xtream copied"));
      $("trialCopyM3u")?.addEventListener("click", () => copyText(c.m3u, "M3U copied"));
      toast("Free trial activate!");
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
  });
}

/* ==================== Dealer ==================== */
async function dealerLogin(code, apiKey, licenseKey = "") {
  const res = await api("reseller/login", { resellerCode: code, apiKey, licenseKey });
  localStorage.setItem("bw_dealer_session", JSON.stringify({ code: res.reseller.code, apiKey: res.reseller.apiKey }));
  STATE.dealer = res.reseller; STATE.dealerStats = res.stats; STATE.dealerClients = res.clients || []; STATE.dealerFinance = res.finance || null;
  paintDashboard(res.reseller, res.stats, res.clients || [], res.finance || null);
  switchTab("dashboard");
  toast(`Welcome back, ${res.reseller.name}!`);
  return res;
}

async function refreshDealer() {
  const s = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
  if (!s.code) return;
  try {
    const res = await api("reseller/stats", { resellerCode: s.code, apiKey: s.apiKey }, { headers: { "x-api-key": s.apiKey || "" } });
    localStorage.setItem("bw_dealer_session", JSON.stringify({ code: res.reseller.code, apiKey: res.reseller.apiKey }));
    STATE.dealer = res.reseller; STATE.dealerStats = res.stats; STATE.dealerClients = res.clients || []; STATE.dealerFinance = res.finance || STATE.dealerFinance;
    paintDashboard(res.reseller, res.stats, res.clients || [], res.finance || STATE.dealerFinance);
  } catch {}
}

function paintDashboard(reseller, stats, clients, finance) {
  $("dashEmpty").hidden = true; $("dashBody").hidden = false;
  const s = stats || {};
  $("dashStats").innerHTML = `
    <div class="stat-card"><strong>${s.clients || 0}</strong><span>Total clients</span></div>
    <div class="stat-card"><strong>${s.active || 0}</strong><span>Active</span></div>
    <div class="stat-card gold"><strong>${reseller?.credits || 0}</strong><span>Credits left</span></div>
    <div class="stat-card"><strong>${s.expiringSoon || 0}</strong><span>Expiring ≤3 days</span></div>
    <div class="stat-card"><strong>${money((finance?.revenue || 0))}</strong><span>Collected</span></div>
    <div class="stat-card"><strong>${esc(reseller?.code || "")}</strong><span>Dealer code</span></div>`;
  const base = STATE.config?.baseUrl || location.origin;
  $("serverKv").innerHTML = `<div><span>Dealer</span><strong>${esc(reseller?.name || "")}</strong></div><div><span>Buying rate</span><strong>${money(reseller?.pricePerUser || 100)}/user</strong></div><div><span>API key</span><strong>${esc(reseller?.apiKey || "")}</strong></div><div><span>Xtream host</span><strong>${esc(base)}</strong></div><div><span>Port</span><strong>443</strong></div><div><span>M3U Plus</span><strong>${esc(base)}/get.php?username=USER&amp;password=PASS&amp;type=m3u_plus</strong></div>`;
  paintFinance(finance || STATE.dealerFinance);
  paintDealerPricing(reseller);
  paintClients(clients || []);
}

function paintFinance(f) {
  const kv = $("financeKv"); if (!kv || !f) return;
  kv.innerHTML = `<div><span>Collected (all time)</span><strong>${money(f.revenue || 0)}</strong></div><div><span>Collected (30 days)</span><strong>${money(f.revenue30d || 0)}</strong></div><div><span>Credits cost</span><strong>${money(f.cost || 0)}</strong></div><div><span>Net profit</span><strong style="color:var(--gold)">${money(f.profit || 0)}</strong></div><div><span>Margin/client</span><strong>${money((f.pricing?.monthly || 0) - 100)}</strong></div><div><span>Payments</span><strong>${f.payments || 0}</strong></div>`;
}

function paintDealerPricing(r) {
  if (!r) return;
  const p = r.pricing || {};
  const set = (id, v) => { const el = $(id); if (el && v !== undefined && v !== null) el.value = v; };
  set("prConnection", p.connectionFee); set("prMonthly", p.monthly); set("prQuarterly", p.quarterly); set("prYearly", p.yearly);
  set("prWhatsapp", r.contactWhatsapp || r.whatsapp || ""); set("prBrand", r.brandName || "");
  const fee = $("clFee"); if (fee && !fee.value) fee.value = p.connectionFee ?? 50;
}

function paintClients(clients) {
  const tbody = $("clientsTable")?.querySelector("tbody"); if (!tbody) return;
  if (!clients.length) { tbody.innerHTML = `<tr><td colspan="7" class="muted-sm">Koi client nahi.</td></tr>`; return; }
  const q = STATE.search.toLowerCase();
  const list = q ? clients.filter(c => c.username.toLowerCase().includes(q) || (c.whatsapp || "").toLowerCase().includes(q)) : clients;
  tbody.innerHTML = list.map(c => {
    const tone = c.status === "active" ? "badge-active" : "badge-pending";
    return `<tr><td><strong>${esc(c.username)}</strong><br /><span class="muted-sm">${esc(c.email || c.whatsapp || "")}</span></td><td><code style="font-size:0.72rem;">${esc(c.password || "•••")}</code></td><td>${esc(c.planLabel || c.planId)}</td><td>${fmtDate(c.expDate)}</td><td>${c.daysLeft}</td><td><span class="badge ${tone}">${esc(c.status)}</span></td><td><div class="t-actions"><button class="btn-sm outline" onclick="app.copyText('${esc(c.password || "")}')" title="Copy pass">🔑</button><button class="btn-sm danger" onclick="app.deleteClient('${esc(c.username)}','${esc(c.username)}')" title="Delete">✕</button></div></td></tr>`;
  }).join("");
}

function bindDashboard() {
  $("dealerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const out = $("dealerResult"); const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
    try {
      await dealerLogin($("dlCode").value.trim(), $("dlKey").value.trim(), $("dlLicense").value.trim());
      showResult(out, "✅ Panel khol gaya.", "ok");
    } catch (err) { showResult(out, `❌ ${esc(err.message)}<br/><span class="muted-sm">Help: 0306-2015326</span>`, "error"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = "🔓 Open My Panel"; } }
  });

  $("signupForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const out = $("signupResult"); const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Creating…"; }
    try {
      showResult(out, "Panel ban raha hai…", "warn");
      const res = await api("reseller/register", { name: $("suName").value.trim(), city: $("suCity").value.trim(), email: $("suEmail").value.trim().toLowerCase(), whatsapp: $("suWhatsapp").value.trim(), password: $("suPass").value, brandName: $("suBrand").value.trim() });
      localStorage.setItem("bw_dealer_session", JSON.stringify({ code: res.reseller.code, apiKey: res.reseller.apiKey }));
      showResult(out, `✅ ${esc(res.reseller.name)}, panel ready!<br/>Dealer code: <code>${esc(res.reseller.code)}</code> · Starter credits: <strong>${esc(res.starterCredits)}</strong>`, "ok");
      toast("Reseller panel created!");
      const session = await api("reseller/login", { resellerCode: res.reseller.code, apiKey: res.reseller.apiKey });
      dealerLogin(session.reseller.code, session.reseller.apiKey);
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
    finally { if (btn) { btn.disabled = false; btn.textContent = "🚀 Create My Reseller Panel (Free)"; } }
  });

  $("clientForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const out = $("clientResult");
    try {
      showResult(out, "Client create ho raha hai…", "warn");
      const months = Number($("clMonths").value) || 1;
      const res = await api("reseller/client-create", {
        username: $("clUser").value.trim(), password: $("clPass").value.trim(), whatsapp: $("clWhatsapp").value.trim(),
        devices: Number($("clDevices").value) || 1, planId: months === 3 ? "quarterly" : months === 12 ? "yearly" : months === 6 ? "half-yearly" : "monthly",
        days: months * 30, mac: $("clMac").value.trim(), collectAmount: Number($("clSale").value) || 0,
        connectionFee: Number($("clFee").value) || 0, via: $("clVia").value || "cash"
      }, { headers: { "x-api-key": JSON.parse(localStorage.getItem("bw_dealer_session") || "{}").apiKey || "" } });
      const c = res.client;
      const xt = `Host: ${STATE.config?.baseUrl || location.origin}\nPort: 443\nUsername: ${c.username}\nPassword: ${c.password}`;
      showResult(out, `<strong>✅ Client ${esc(c.username)} create ho gaya</strong> — expiry ${fmtDate(c.expDate)}<br/>M3U: <code style="word-break:break-all;">${esc(res.links.m3u)}</code><br/>EPG: <code style="word-break:break-all;">${esc(res.links.epg)}</code><br/>Credits left: <strong>${res.creditsLeft}</strong><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;"><button class="btn-sm primary" id="clCopyXtream">📋 Xtream</button><button class="btn-sm primary" id="clCopyM3u">📋 M3U</button></div>`);
      $("clCopyXtream")?.addEventListener("click", () => copyText(xt, "Xtream copied"));
      $("clCopyM3u")?.addEventListener("click", () => copyText(res.links.m3u, "M3U copied"));
      $("clientForm").reset();
      await refreshDealer();
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
  });

  $("clSearch")?.addEventListener("input", (e) => { STATE.search = e.target.value.toLowerCase(); paintClients(STATE.dealerClients); });

  $("pricingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const out = $("pricingResult");
    try {
      showResult(out, "Saving…", "warn");
      const session = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
      const res = await api("reseller/pricing-set", { pricing: { connectionFee: Number($("prConnection").value) || 0, monthly: Number($("prMonthly").value) || 0, quarterly: Number($("prQuarterly").value) || 0, yearly: Number($("prYearly").value) || 0 }, contactWhatsapp: $("prWhatsapp").value.trim(), contactPhone: $("prWhatsapp").value.trim(), brandName: $("prBrand").value.trim() }, { headers: { "x-api-key": session.apiKey || "" } });
      STATE.dealer = res.reseller; showResult(out, "✅ Price save ho gayi.", "ok"); toast("Pricing updated");
      await refreshDealer();
    } catch (err) { showResult(out, `❌ ${esc(err.message)}`, "error"); }
  });

  $("clientsTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const user = btn.dataset.user;
    if (btn.dataset.act === "renew") {
      const months = prompt(`${user} ke liye kitne mahine? (1-12)\nCredits: ${STATE.dealer?.credits ?? 0}`, "1");
      if (!months) return;
      try {
        btn.disabled = true;
        const session = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
        const res = await api("reseller/client-renew", { username: user, planId: "monthly" }, { headers: { "x-api-key": session.apiKey || "" } });
        toast(`Renewed ${user} — credits ${res.creditsLeft}`);
        await refreshDealer();
      } catch (err) { toast(err.message); } finally { btn.disabled = false; }
    }
    if (btn.dataset.act === "paid") {
      const months = prompt(`Paisa kitne mahine ka? (1-12)`, "1");
      if (!months) return;
      const amount = prompt(`Kitne rupay mile? (monthly Rs ${STATE.dealer?.pricing?.monthly || 300})`, String(STATE.dealer?.pricing?.monthly || 300) * months);
      if (amount === null) return;
      try {
        btn.disabled = true;
        const session = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
        await api("reseller/payment-record", { username: user, months: Number(months), amount: Number(amount), via: "cash" }, { headers: { "x-api-key": session.apiKey || "" } });
        toast("Payment recorded");
        await refreshDealer();
      } catch (err) { toast(err.message); } finally { btn.disabled = false; }
    }
  });
}

/* ==================== Admin ==================== */
async function loadAdminData() {
  if (!STATE.adminToken) {
    const pin = prompt("Owner PIN dalein (default: 03062015326):", "03062015326");
    if (!pin) return;
    try {
      const res = await api("admin/pin-login", { pin });
      STATE.adminToken = res.token;
      localStorage.setItem("bw_admin_session", JSON.stringify({ token: res.token, exp: Math.floor(Date.now() / 1000) + 43200 - 60 }));
      STATE.adminUser = res.admin;
      toast("Owner access granted");
    } catch (err) { toast(err.message, "error"); return; }
  }
  try {
    const orders = await api("admin/orders", { status: "pending" }, { headers: { "x-admin-token": STATE.adminToken } });
    paintAdminOrders(orders.orders || []);
  } catch (err) { $("ordersTable")?.querySelector("tbody")?.insertAdjacentHTML("beforeend", `<tr><td colspan="6" class="muted-sm">Load error: ${err.message}</td></tr>`); }
  try {
    const resellers = await api("admin/resellers", {}, { headers: { "x-admin-token": STATE.adminToken } });
    paintAdminResellers(resellers.resellers || []);
  } catch (err) { $("resellersTable")?.querySelector("tbody")?.insertAdjacentHTML("beforeend", `<tr><td colspan="7" class="muted-sm">Load error: ${err.message}</td></tr>`); }
}

function paintAdminOrders(orders) {
  const tbody = $("ordersTable")?.querySelector("tbody"); if (!tbody) return;
  if (!orders.length) { tbody.innerHTML = `<tr><td colspan="6" class="muted-sm">Koi pending order nahi.</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => `<tr><td><strong>${esc(o.id)}</strong><br /><span class="muted-sm">${fmtDate(o.createdAt)}</span></td><td>${esc(o.name || "")}</td><td>${esc(o.planName)} x${o.quantity}</td><td>${money(o.total)}</td><td><code>${esc(o.txnId || "—")}</code></td><td><div class="t-actions"><button class="btn-sm primary" onclick="app.reviewOrder('${esc(o.id)}','approve')">✅ Approve</button><button class="btn-sm danger" onclick="app.reviewOrder('${esc(o.id)}','reject')">✖ Reject</button></div></td></tr>`).join("");
}

function paintAdminResellers(list) {
  const tbody = $("resellersTable")?.querySelector("tbody"); if (!tbody) return;
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="7" class="muted-sm">Koi dealer nahi.</td></tr>`; return; }
  tbody.innerHTML = list.map(r => `<tr><td><strong>${esc(r.code)}</strong><br /><span class="muted-sm">${esc(String(r.apiKey || "").slice(0, 18))}…</span></td><td>${esc(r.name)}</td><td>${r.createdAt ? fmtDate(r.createdAt) : "—"}</td><td>${r.credits || 0} <span class="muted-sm">(used ${r.creditsUsed || 0})</span></td><td>${money(r.collected || 0)}</td><td><div class="t-actions"><button class="btn-sm outline" data-topup="${esc(r.code)}" onclick="app.topupReseller('${esc(r.code)}')">+10</button></div></td></tr>`).join("");
}

window.app = {
  copyText(text, msg = "Copied!") {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast(msg));
  },
  reviewOrder(id, decision) {
    (async () => {
      try {
        await api("admin/order-review", { orderId: id, decision }, { headers: { "x-admin-token": STATE.adminToken } });
        toast(`Order ${id} ${decision === "approve" ? "approved" : "rejected"}`);
        loadAdminData();
      } catch (err) { toast(err.message, "error"); }
    })();
  },
  topupReseller(code) {
    (async () => {
      try {
        await api("admin/credits-topup", { code, amount: 10 }, { headers: { "x-admin-token": STATE.adminToken } });
        toast(`+10 credits → ${code}`);
        loadAdminData();
      } catch (err) { toast(err.message, "error"); }
    })();
  },
  deleteClient(username, label) {
    if (!confirm(`Delete client "${label}"?`)) return;
    (async () => {
      try {
        const session = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
        await api("reseller/client-block", { username, blocked: true }, { headers: { "x-api-key": session.apiKey || "" } });
        toast("Client blocked");
        await refreshDealer();
      } catch (err) { toast(err.message, "error"); }
    })();
  }
};

function showResult(el, html, tone = "ok") {
  if (!el) return;
  el.hidden = false; el.className = "result-box" + (tone === "error" ? " is-error" : tone === "warn" ? " is-warn" : "");
  el.innerHTML = html;
}

/* ==================== Pricing ==================== */
function loadPricing() {
  if (!STATE.config) { loadConfig(); return; }
  paintConfig();
}

/* ==================== Init ==================== */
async function init() {
  bindTabs();
  bindOrder();
  bindTrial();
  bindDashboard();
  await loadConfig();

  const session = JSON.parse(localStorage.getItem("bw_dealer_session") || "{}");
  if (session.code && session.apiKey) {
    try { await refreshDealer(); switchTab("dashboard"); } catch { switchTab("login"); }
  } else {
    switchTab("order");
  }
  window.__BW_BOOTED = true;
}

init().catch((err) => {
  console.error("Reseller panel boot failed", err);
  const msg = $("dealerResult") || $("orderResult");
  if (msg) { msg.hidden = false; msg.textContent = `❌ Panel load nahi hua: ${err.message}. Refresh karein.`; }
});

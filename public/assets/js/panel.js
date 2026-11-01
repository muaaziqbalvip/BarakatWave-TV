/**
 * BarakatWave TV — IPTV Reseller Panel Frontend
 * ---------------------------------------------
 * Powers /reseller (client ordering, free trial, dealer dashboard, admin control).
 * Talks to /api/panel through signed/authenticated JSON endpoints.
 *
 * Mizanora Projects — by Muaaz Iqbal — Support 0306-2015326
 */

const ADMIN_SESSION_KEY = "bw_admin_session";
const DEALER_SESSION_KEY = "bw_dealer_session";
const TRIAL_DEVICE_KEY = "bw_trial_device_id";

const state = {
  config: null,
  dealer: null,
  dealerStats: null,
  dealerClients: [],
  adminToken: "",
  adminUser: null
};

/* ------------------------------- helpers ------------------------------- */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v) {
  return `Rs ${Number(v || 0).toLocaleString("en-PK")}`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  let d;
  if (typeof ts === "string" && !/^\d+$/.test(ts)) {
    d = new Date(ts);
  } else {
    const n = Number(ts);
    if (!n) return "—";
    d = new Date(n > 1e12 ? n : n * 1000);
  }
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ${d
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Optional payment-proof screenshot: downscale to a light data URL. */
function readProofFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!/^image\//.test(file.type)) return reject(new Error("Please choose a JPG or PNG screenshot."));
    if (file.size > 6 * 1024 * 1024) return reject(new Error("Screenshot must be smaller than 6 MB."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 760;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.62));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try another screenshot."));
    };
    img.src = url;
  });
}

/**
 * When a real Firebase admin is signed in, mirror panel writes straight into
 * RTDB from the browser (rules authorised) so Xtream players pick up new
 * accounts even if the server has no FIREBASE_DATABASE_SECRET configured.
 */
async function mirrorToRtdb(path, value) {
  try {
    const mod = await import("/assets/js/firebase-client.js?v=11");
    const user = mod.getCurrentUserSnapshot();
    if (!user || user.isPreviewSession) return false;
    await mod.dbWrite(path, value);
    return true;
  } catch {
    return false;
  }
}

function toast(msg) {
  const wrap = $("toastContainer");
  if (!wrap) return;
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = msg;
  wrap.appendChild(d);
  setTimeout(() => d.remove(), 3600);
}

function showResult(el, html, tone = "ok") {
  if (!el) return;
  el.hidden = false;
  el.className = "result-box" + (tone === "error" ? " is-error" : tone === "warn" ? " is-warn" : "");
  el.innerHTML = html;
}

async function copyText(text, label = "Copied!") {
  try {
    await navigator.clipboard.writeText(String(text));
    toast(label);
  } catch {
    toast("Copy failed — long-press to copy manually.");
  }
}

function deviceId() {
  let id = localStorage.getItem(TRIAL_DEVICE_KEY);
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(TRIAL_DEVICE_KEY, id);
  }
  return id;
}

/* --------------------------------- API --------------------------------- */

/** Any /api/panel request that takes longer than this is aborted (never hangs). */
const API_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url, opts = {}, ms = API_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Server took too long to reply. Check your internet and try again.");
    }
    throw new Error("Network error — please check your connection and retry.");
  } finally {
    clearTimeout(timer);
  }
}

async function api(action, payload = null, { method = "POST", headers = {} } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (method === "POST") opts.body = JSON.stringify({ action, ...payload });
  const url = method === "POST" ? "/api/panel" : `/api/panel?action=${encodeURIComponent(action)}`;
  const res = await fetchWithTimeout(url, opts);
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: `Server returned ${res.status}` };
  }
  if (!res.ok && json.ok !== true) {
    throw Object.assign(new Error(json.error || `Request failed (${res.status})`), {
      status: res.status,
      payload: json
    });
  }
  return json;
}

function adminHeaders() {
  return state.adminToken ? { "x-admin-token": state.adminToken } : {};
}

async function adminApi(action, payload = {}) {
  if (!state.adminToken) {
    const fb = await refreshAdminToken();
    if (!fb) throw new Error("Admin sign-in required.");
  }
  try {
    return await api(action, payload, { headers: adminHeaders() });
  } catch (err) {
    if (err.status === 401) {
      const fresh = await refreshAdminToken(true);
      if (fresh) return api(action, payload, { headers: adminHeaders() });
    }
    throw err;
  }
}

async function refreshAdminToken(force = false) {
  // 1) Existing PIN session
  const stored = localStorage.getItem(ADMIN_SESSION_KEY);
  if (stored && !force) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.exp && parsed.exp < Date.now() / 1000) throw new Error("expired");
      state.adminToken = parsed.token;
      return state.adminToken;
    } catch {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }
  // 2) Firebase ID token
  try {
    const mod = await import("/assets/js/firebase-client.js?v=11");
    const idToken = await mod.getFirebaseIdToken(force);
    if (idToken) {
      state.adminToken = idToken;
      state.adminUser = mod.getCurrentUserSnapshot();
      return idToken;
    }
  } catch {
    // firebase unavailable — fall through
  }
  return "";
}

/* ------------------------------ bootstrap ------------------------------ */

async function loadConfig() {
  try {
    const cfg = await api("config", null, { method: "GET" });
    state.config = cfg;
    paintConfig();
  } catch (err) {
    toast("Could not load panel config: " + err.message);
  }
}

function paintConfig() {
  const cfg = state.config;
  if (!cfg) return;

  $("statFree").textContent = `${cfg.trialDays} Day`;
  $("statDirect").textContent = money(cfg.directPerUserMonthly);
  $("statReseller").textContent = money(cfg.resellerPerUserMonthly);
  $("statPlans").textContent = cfg.plans?.length || 5;

  const planSelects = [$("ordPlan"), $("clPlan")];
  for (const sel of planSelects) {
    if (!sel) continue;
    sel.innerHTML = (cfg.plans || [])
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${p.days} days</option>`)
      .join("");
    if (sel.id === "ordPlan") sel.value = "monthly";
  }

  const priceRows = (cfg.plans || [])
    .map(
      (p) =>
        `<tr><td><strong>${esc(p.name)}</strong><br /><span class="muted-sm">${esc(p.urdu || "")}</span></td>
         <td>${p.direct === 0 ? "FREE" : money(p.direct)}</td>
         <td>${p.reseller === 0 ? "FREE" : money(p.reseller)}</td>
         <td>${p.days}</td></tr>`
    )
    .join("");
  const pt = $("priceTable");
  if (pt) pt.querySelector("tbody").innerHTML = priceRows;

  const tierRows = (cfg.resellerTiers || [])
    .map(
      (t) =>
        `<tr><td><strong>${esc(t.name)}</strong><br /><span class="muted-sm">${esc(t.perks.join(" • "))}</span></td>
         <td>${t.minCredits}</td><td>${money(t.unitPrice)}</td></tr>`
    )
    .join("");
  const tt = $("tierTable");
  if (tt) tt.querySelector("tbody").innerHTML = tierRows;

  const steps = $("paymentSteps");
  if (steps) {
    steps.innerHTML = (cfg.payment?.steps || [])
      .map((s) => `<li><strong>${esc(s.title)}</strong><br /><span class="muted-sm">${esc(s.detail)}</span></li>`)
      .join("");
  }

  paintOrderSummary();
}

/* --------------------------------- tabs --------------------------------- */

function switchTab(tab) {
  $$("[data-panel-tab]").forEach((b) => b.classList.toggle("active", b.dataset.panelTab === tab));
  $$("[data-panel-pane]").forEach((p) => {
    p.hidden = p.dataset.panelPane !== tab;
  });
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
  document.querySelector(".panel-tabs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function bindTabs() {
  $$("[data-panel-tab]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.panelTab)));
  $$("[data-panel-jump]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.panelJump)));
  const initial = (location.hash || "").replace("#", "");
  if (initial && document.querySelector(`[data-panel-pane="${initial}"]`)) switchTab(initial);
}

/* --------------------------------- order --------------------------------- */

function paintOrderSummary() {
  if (!state.config) return;
  const audience = $("ordAudience").value;
  const plan = (state.config.plans || []).find((p) => p.id === $("ordPlan").value) || state.config.plans?.[1];
  const qty = Math.max(1, Number($("ordQty").value) || 1);
  const unit = audience === "reseller" ? plan.reseller : plan.direct;
  $("sumPlan").textContent = `${plan.name} (${plan.days} days)`;
  $("sumUnit").textContent = money(unit);
  $("sumQty").textContent = qty;
  $("sumTotal").textContent = money(unit * qty);
}

function bindOrder() {
  ["ordAudience", "ordPlan", "ordQty"].forEach((id) => $(id)?.addEventListener("input", paintOrderSummary));
  $("ordCopyBtn")?.addEventListener("click", () => {
    const p = state.config?.payment;
    copyText(
      `JazzCash: ${p?.accountNumber || "03062015326"}\nTitle: ${p?.accountTitle || "Muaaz Iqbal"}\nAmount: ${$("sumTotal").textContent}\nWhatsApp: ${p?.accountNumber || "03062015326"}`,
      "JazzCash details copied"
    );
  });
  $("copyJazzBtn")?.addEventListener("click", () =>
    copyText(state.config?.payment?.accountNumber || "03062015326", "JazzCash number copied")
  );

  $("orderForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("orderResult");
    const payload = {
      planId: $("ordPlan").value,
      audience: $("ordAudience").value,
      quantity: Number($("ordQty").value) || 1,
      name: $("ordName").value.trim(),
      whatsapp: $("ordWhatsapp").value.trim(),
      email: $("ordEmail").value.trim(),
      username: $("ordUsername").value.trim(),
      txnId: $("ordTxn").value.trim(),
      resellerCode: $("ordResellerCode").value.trim(),
      note: $("ordNote").value.trim(),
      proofDataUrl: $("ordProof").value || ""
    };
    if (!payload.name || payload.name.length < 3) return showResult(out, "Please enter your full name.", "error");
    if (!/^[0-9+\-\s]{9,17}$/.test(payload.whatsapp)) {
      return showResult(out, "Enter a valid WhatsApp number, e.g. 03062015326.", "error");
    }
    try {
      const fileInput = $("ordProofFile");
      if (fileInput?.files?.[0]) {
        try {
          $("ordProof").value = await readProofFile(fileInput.files[0]);
        } catch (err) {
          return showResult(out, `❌ ${esc(err.message)}`, "error");
        }
      }
      showResult(out, "Submitting order…", "warn");
      const res = await api("order", payload);
      const pay = res.payment || {};
      showResult(
        out,
        `<strong>✅ Order ${esc(res.order.id)} placed</strong><br />
         Send <strong>${money(pay.amount)}</strong> to JazzCash <strong>${esc(pay.number || "0306-2015326")}</strong>
         (${esc(pay.title || "Muaaz Iqbal")}) with reference <code>${esc(res.order.id)}</code>.<br />
         Then WhatsApp the screenshot to <strong>${esc(state.config?.support?.phone || "0306-2015326")}</strong>.<br />
         <span class="muted-sm">Status: pending review — usually activated within 30 minutes.</span>`
      );
      $("trackId").value = res.order.id;
      toast("Order created — send the JazzCash screenshot now.");
    } catch (err) {
      showResult(out, `❌ ${esc(err.message)}`, "error");
    }
  });

  $("trackBtn")?.addEventListener("click", async () => {
    const id = $("trackId").value.trim();
    const out = $("trackResult");
    if (!id) return showResult(out, "Enter your order ID first.", "error");
    try {
      const res = await api("order-status", { orderId: id });
      const o = res.order;
      const tone = o.status === "approved" ? "ok" : o.status === "rejected" ? "error" : "warn";
      showResult(
        out,
        `<strong>Order ${esc(o.id)}</strong><br />
         Status: <strong>${esc(o.status.toUpperCase())}</strong><br />
         Plan: ${esc(o.planName)} &bull; Amount: ${money(o.total)}<br />
         Created: ${fmtDate(o.createdAt)}${o.reviewedAt ? ` &bull; Reviewed: ${fmtDate(o.reviewedAt)}` : ""}
         ${o.username ? `<br />Username: <code>${esc(o.username)}</code>` : ""}`,
        tone
      );
    } catch (err) {
      showResult(out, `❌ ${esc(err.message)}`, "error");
    }
  });
}

/* --------------------------------- trial --------------------------------- */

function bindTrial() {
  $("trialForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("trialResult");
    try {
      showResult(out, "Activating your free PRO trial…", "warn");
      const res = await api("trial", {
        email: $("trEmail").value.trim(),
        whatsapp: $("trWhatsapp").value.trim(),
        deviceId: deviceId()
      });
      if (!res.ok) {
        showResult(out, `⚠️ ${esc(res.error)}`, "warn");
        return;
      }
      const c = res.credentials;
      const xtream = `Host: ${c.serverUrl}\nPort: 443\nUsername: ${c.username}\nPassword: ${c.password}`;
      showResult(
        out,
        `<strong>🎉 Trial active until ${fmtDate(c.expiresAt)}</strong><br />
         <div class="kv-list" style="margin:10px 0;">
           <div><span>Host</span><strong>${esc(c.serverUrl)}</strong></div>
           <div><span>Username</span><strong>${esc(c.username)}</strong></div>
           <div><span>Password</span><strong>${esc(c.password)}</strong></div>
         </div>
         M3U Plus:<br /><code style="word-break:break-all;">${esc(c.m3u)}</code><br /><br />
         EPG:<br /><code style="word-break:break-all;">${esc(c.epg)}</code>
         <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
           <button class="mini-btn" id="trialCopyXtream">📋 Copy Xtream</button>
           <button class="mini-btn" id="trialCopyM3u">📋 Copy M3U</button>
           <a class="mini-btn" href="https://siravex.vercel.app" target="_blank" rel="noopener">▶ Open Siravex Player</a>
         </div>`
      );
      $("trialCopyXtream")?.addEventListener("click", () => copyText(xtream, "Xtream credentials copied"));
      $("trialCopyM3u")?.addEventListener("click", () => copyText(c.m3u, "M3U link copied"));
      toast("Free trial activated!");
    } catch (err) {
      showResult(out, `❌ ${esc(err.message)}`, "error");
    }
  });
}

/* ------------------------------ dealer panel ------------------------------ */

function saveDealerSession(data) {
  state.dealer = data.reseller;
  state.dealerStats = data.stats;
  localStorage.setItem(
    DEALER_SESSION_KEY,
    JSON.stringify({ code: data.reseller.code, apiKey: data.reseller.apiKey })
  );
}

async function dealerLogin(code, apiKey, licenseKey = "") {
  const res = await api("reseller/login", { resellerCode: code, apiKey, licenseKey });
  saveDealerSession(res);
  state.dealerClients = res.clients || [];
  paintDashboard(res);
  switchTab("dashboard");
  return res;
}

function paintDashboard(data) {
  $("dashEmpty").hidden = true;
  $("dashBody").hidden = false;
  const s = data.stats;
  $("dashStats").innerHTML = `
    <div class="stat-card"><strong>${s.clients}</strong><span>Total clients</span></div>
    <div class="stat-card"><strong>${s.active}</strong><span>Active</span></div>
    <div class="stat-card gold"><strong>${data.reseller.credits}</strong><span>Credits left</span></div>
    <div class="stat-card"><strong>${s.expiringSoon}</strong><span>Expiring ≤3 days</span></div>
    <div class="stat-card"><strong>${money(s.retailValue)}</strong><span>Retail value / mo</span></div>
    <div class="stat-card"><strong>${esc(data.reseller.code)}</strong><span>Dealer code</span></div>`;

  const base = state.config?.baseUrl || location.origin;
  $("serverKv").innerHTML = `
    <div><span>Dealer</span><strong>${esc(data.reseller.name)} (${esc(data.reseller.tier)})</strong></div>
    <div><span>Buying rate</span><strong>${money(data.reseller.pricePerUser)} / user</strong></div>
    <div><span>API key</span><strong>${esc(data.reseller.apiKey)}</strong></div>
    <div><span>Xtream host</span><strong>${esc(base)}</strong></div>
    <div><span>Port</span><strong>443</strong></div>
    <div><span>M3U Plus</span><strong>${esc(base)}/get.php?username=USER&amp;password=PASS&amp;type=m3u_plus</strong></div>`;
  $("kvHost").textContent = base;

  paintClients(data.clients || []);
}

function paintClients(clients) {
  const tbody = $("clientsTable")?.querySelector("tbody");
  if (!tbody) return;
  if (!clients.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted-sm">No clients yet — create your first client above.</td></tr>`;
    return;
  }
  tbody.innerHTML = clients
    .map((c) => {
      const tone = c.status === "active" ? "badge badge-cyan" : "badge badge-gold";
      return `<tr>
        <td><strong>${esc(c.username)}</strong><br /><span class="muted-sm">${esc(c.email || c.whatsapp || "")}</span></td>
        <td><code>${esc(c.password || "•••")}</code></td>
        <td>${esc(c.planLabel || c.planId)}</td>
        <td>${fmtDate(c.expDate)}</td>
        <td>${c.daysLeft}</td>
        <td><span class="${tone}">${esc(c.status)}</span></td>
        <td>
          <div class="cell-actions">
            <button class="mini-btn" data-act="copy-m3u" data-user="${esc(c.username)}" data-pass="${esc(c.password || "")}">📋 M3U</button>
            <button class="mini-btn" data-act="renew" data-user="${esc(c.username)}">🔄 Renew</button>
            <button class="mini-btn danger" data-act="suspend" data-user="${esc(c.username)}">⏸</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

async function dealerApi(action, payload = {}) {
  if (!state.dealer) throw new Error("Dealer login required.");
  const session = JSON.parse(localStorage.getItem(DEALER_SESSION_KEY) || "{}");
  return api(action, { ...payload, resellerCode: session.code, apiKey: session.apiKey }, {
    headers: { "x-api-key": session.apiKey || "" }
  });
}

function bindDashboard() {
  $("dealerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("dealerResult");
    try {
      showResult(out, "Verifying dealer credentials…", "warn");
      await dealerLogin($("dlCode").value.trim(), $("dlKey").value.trim(), $("dlLicense").value.trim());
      showResult(out, "✅ Welcome back to your dealer panel.", "ok");
    } catch (err) {
      showResult(out, `❌ ${esc(err.message)}<br /><span class="muted-sm">Need help? WhatsApp 0306-2015326.</span>`, "error");
    }
  });

  $("clientForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("clientResult");
    try {
      showResult(out, "Creating client…", "warn");
      const res = await dealerApi("reseller/client-create", {
        username: $("clUser").value.trim(),
        password: $("clPass").value.trim(),
        whatsapp: $("clWhatsapp").value.trim(),
        devices: Number($("clDevices").value) || 1,
        planId: $("clPlan").value,
        mac: $("clMac").value.trim()
      });
      const c = res.client;
      const xtream = `Host: ${state.config?.baseUrl || location.origin}\nPort: 443\nUsername: ${c.username}\nPassword: ${c.password}`;
      showResult(
        out,
        `<strong>✅ Client <code>${esc(c.username)}</code> created</strong> — expiry ${fmtDate(c.expDate)}<br />
         M3U: <code style="word-break:break-all;">${esc(res.links.m3u)}</code><br />
         EPG: <code style="word-break:break-all;">${esc(res.links.epg)}</code><br />
         Credits left: <strong>${res.creditsLeft}</strong>
         <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
           <button class="mini-btn" id="clCopyXtream">📋 Xtream</button>
           <button class="mini-btn" id="clCopyM3u">📋 M3U link</button>
         </div>`
      );
      $("clCopyXtream")?.addEventListener("click", () => copyText(xtream, "Xtream credentials copied"));
      $("clCopyM3u")?.addEventListener("click", () => copyText(res.links.m3u, "M3U link copied"));
      $("clientForm").reset();
      await refreshDealer();
    } catch (err) {
      showResult(out, `❌ ${esc(err.message)}`, "error");
    }
  });

  $("clSearch")?.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    paintClients(state.dealerClients.filter((c) => c.username.includes(term)));
  });

  $("clientsTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const user = btn.dataset.user;
    const act = btn.dataset.act;
    const client = state.dealerClients.find((c) => c.username === user);
    if (act === "copy-m3u") {
      const base = state.config?.baseUrl || location.origin;
      const pass = btn.dataset.pass || client?.password || "";
      copyText(`${base}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=m3u8`, "M3U link copied");
      return;
    }
    if (act === "renew") {
      try {
        btn.disabled = true;
        const res = await dealerApi("reseller/client-renew", { username: user, planId: "monthly" });
        toast(`Renewed ${user} — credits left ${res.creditsLeft}`);
        await refreshDealer();
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
      return;
    }
    if (act === "suspend") {
      try {
        btn.disabled = true;
        const suspend = client?.status !== "suspended";
        await dealerApi("reseller/client-suspend", { username: user, suspended: suspend });
        toast(suspend ? `Suspended ${user}` : `Resumed ${user}`);
        await refreshDealer();
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    }
  });
}

async function refreshDealer() {
  try {
    const session = JSON.parse(localStorage.getItem(DEALER_SESSION_KEY) || "{}");
    if (!session.code) return;
    const res = await api("reseller/stats", { resellerCode: session.code, apiKey: session.apiKey }, {
      headers: { "x-api-key": session.apiKey || "" }
    });
    saveDealerSession(res);
    state.dealerClients = res.clients || [];
    paintDashboard(res);
  } catch {
    // keep last view
  }
}

/* --------------------------------- admin --------------------------------- */

async function adminLoginWithPin() {
  const msg = $("adminAuthMsg");
  const pin = $("adminPin").value.trim();
  if (!pin) return showResult(msg, "Enter the Owner PIN.", "error");
  try {
    showResult(msg, "Verifying owner PIN…", "warn");
    const res = await fetchWithTimeout("/api/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "admin/pin-login", pin })
    }).then((r) => r.json());
    if (!res.ok) return showResult(msg, `❌ ${esc(res.error)}`, "error");
    state.adminToken = res.token;
    state.adminUser = res.admin;
    localStorage.setItem(
      ADMIN_SESSION_KEY,
      JSON.stringify({ token: res.token, exp: Math.floor(Date.now() / 1000) + (res.expiresIn || 43200) - 60 })
    );
    $("adminGate").hidden = true;
    $("adminBody").hidden = false;
    $("adminSignOutBtn").hidden = false;
    showResult(msg, "✅ Owner access granted.", "ok");
    await loadAdmin();
  } catch (err) {
    showResult(msg, `❌ ${esc(err.message)}`, "error");
  }
}

async function adminLoginWithGoogle() {
  const msg = $("adminAuthMsg");
  try {
    showResult(msg, "Opening Google sign-in…", "warn");
    const mod = await import("/assets/js/firebase-client.js?v=11");
    const res = await mod.loginWithGoogle();
    if (!res.ok) return showResult(msg, `❌ ${esc(res.error)}`, "error");
    const token = await mod.getFirebaseIdToken(true);
    if (!token) return showResult(msg, "❌ Firebase did not return a session token.", "error");
    state.adminToken = token;
    localStorage.removeItem(ADMIN_SESSION_KEY);
    $("adminGate").hidden = true;
    $("adminBody").hidden = false;
    $("adminSignOutBtn").hidden = false;
    showResult(msg, "✅ Signed in with Google.", "ok");
    await loadAdmin();
  } catch (err) {
    showResult(
      msg,
      `❌ ${esc(err.message)}<br /><span class="muted-sm">If this says "unauthorized domain", add the domain in Firebase → Authentication → Settings → Authorized domains, or use the Owner PIN above.</span>`,
      "error"
    );
  }
}

async function loadAdmin() {
  if (!state.adminToken) {
    await refreshAdminToken();
    if (state.adminToken) {
      $("adminGate").hidden = true;
      $("adminBody").hidden = false;
    }
  }
  if (!state.adminToken) return;
  try {
    const [analytics, ordersRes, resellersRes, clientsRes, auditRes] = await Promise.all([
      adminApi("admin/analytics"),
      adminApi("admin/orders", { status: "pending" }),
      adminApi("admin/resellers"),
      adminApi("admin/clients"),
      adminApi("admin/audit")
    ]);
    paintAdminAnalytics(analytics);
    state.adminOrders = ordersRes.orders || [];
    paintAdminOrders(state.adminOrders);
    paintAdminResellers(resellersRes.resellers || []);
    paintAdminClients(clientsRes.clients || []);
    paintAudit(auditRes.audit || []);
  } catch (err) {
    showResult($("adminAuthMsg"), `❌ ${esc(err.message)}`, "error");
  }
}

function paintAdminAnalytics(a) {
  const t = a.totals || {};
  $("adminStats").innerHTML = `
    <div class="stat-card gold"><strong>${money(t.revenue || 0)}</strong><span>Approved revenue</span></div>
    <div class="stat-card"><strong>${t.pendingOrders || 0}</strong><span>Pending orders</span></div>
    <div class="stat-card"><strong>${t.activeClients || 0}</strong><span>Active clients</span></div>
    <div class="stat-card"><strong>${t.activeResellers || 0}</strong><span>Active dealers</span></div>
    <div class="stat-card"><strong>${t.trials || 0}</strong><span>Trials claimed</span></div>
    <div class="stat-card"><strong>${t.expiringSoon || 0}</strong><span>Expiring ≤3 days</span></div>`;

  $("adminKv").innerHTML = `
    <div><span>Total orders</span><strong>${t.orders || 0}</strong></div>
    <div><span>Approved orders</span><strong>${t.approvedOrders || 0}</strong></div>
    <div><span>Credit liability</span><strong>${t.creditsLiability || 0} credits</strong></div>
    <div><span>Currency</span><strong>${esc(a.currency || "PKR")}</strong></div>`;

  const max = Math.max(1, ...(a.last7 || []).map((d) => d.revenue || 0));
  $("adminBars").innerHTML = (a.last7 || [])
    .map(
      (d) => `<div class="bar-row">
        <span>${esc(d.day.slice(5))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(((d.revenue || 0) / max) * 100)}%"></div></div>
        <span>${d.orders}o</span>
      </div>`
    )
    .join("");
}

function paintAdminOrders(orders) {
  const tbody = $("ordersTable")?.querySelector("tbody");
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-sm">No pending orders. 🎉</td></tr>`;
    return;
  }
  tbody.innerHTML = orders
    .map(
      (o) => `<tr>
        <td><strong>${esc(o.id)}</strong><br /><span class="muted-sm">${fmtDate(o.createdAt)}</span></td>
        <td>${esc(o.name || "")}<br /><span class="muted-sm">${esc(o.whatsapp || o.email || "")}</span></td>
        <td>${esc(o.planName)} <span class="muted-sm">x${o.quantity}</span></td>
        <td>${money(o.total)}</td>
        <td>
          <code>${esc(o.txnId || "—")}</code>
          ${o.proofDataUrl ? `<br /><a href="#" data-proof="${esc(o.id)}" title="View payment screenshot">🧾 proof</a>` : ""}
        </td>
        <td>
          <div class="cell-actions">
            <button class="mini-btn" data-order-approve="${esc(o.id)}">✅ Approve</button>
            <button class="mini-btn danger" data-order-reject="${esc(o.id)}">✖ Reject</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

function paintAdminResellers(list) {
  const tbody = $("resellersTable")?.querySelector("tbody");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-sm">No dealers yet — create the first one.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (r) => `<tr>
        <td><strong>${esc(r.code)}</strong><br /><span class="muted-sm">${esc(r.apiKey || "")}</span></td>
        <td>${esc(r.name)}<br /><span class="muted-sm">${esc(r.whatsapp || r.email || "")}</span></td>
        <td>${r.credits} <span class="muted-sm">(used ${r.creditsUsed || 0})</span></td>
        <td>${r.activeClients || 0}/${r.clients || 0}</td>
        <td><button class="mini-btn" data-topup="${esc(r.code)}">+10 credits</button></td>
      </tr>`
    )
    .join("");
}

function paintAdminClients(list) {
  const tbody = $("adminClientsTable")?.querySelector("tbody");
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-sm">No clients yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map(
      (c) => `<tr>
        <td><strong>${esc(c.username)}</strong><br /><span class="muted-sm">${esc(c.email || c.whatsapp || "")}</span></td>
        <td>${esc(c.resellerCode || "direct")}</td>
        <td>${esc(c.planLabel || c.planId)}</td>
        <td>${fmtDate(c.expDate)}</td>
        <td><span class="badge ${c.status === "active" ? "badge-cyan" : "badge-gold"}">${esc(c.status)}</span></td>
        <td>
          <div class="cell-actions">
            <button class="mini-btn" data-admin-renew="${esc(c.username)}">🔄</button>
            <button class="mini-btn danger" data-admin-suspend="${esc(c.username)}">⏸</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

function paintAudit(list) {
  const ul = $("auditList");
  if (!ul) return;
  if (!list.length) {
    ul.innerHTML = `<li class="muted-sm">No activity yet.</li>`;
    return;
  }
  ul.innerHTML = list
    .map(
      (a) => `<li><strong>${esc(a.action)}</strong> — ${esc(JSON.stringify(a.detail || {}).slice(0, 90))}
        <br /><span class="muted-sm">${fmtDate(a.at)}</span></li>`
    )
    .join("");
}

function bindAdmin() {
  $("adminPinBtn")?.addEventListener("click", adminLoginWithPin);
  $("adminPin")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminLoginWithPin();
  });
  $("adminGoogleBtn2")?.addEventListener("click", adminLoginWithGoogle);
  $("adminSignOutBtn")?.addEventListener("click", async () => {
    state.adminToken = "";
    localStorage.removeItem(ADMIN_SESSION_KEY);
    try {
      const mod = await import("/assets/js/firebase-client.js?v=11");
      await mod.logoutUser();
    } catch {
      /* ignore */
    }
    $("adminGate").hidden = false;
    $("adminBody").hidden = true;
    $("adminSignOutBtn").hidden = true;
    toast("Signed out of admin.");
  });

  $("ordersTable")?.addEventListener("click", async (e) => {
    const approve = e.target.closest("[data-order-approve]");
    const reject = e.target.closest("[data-order-reject]");
    const btn = approve || reject;
    if (!btn) return;
    const id = approve ? approve.dataset.orderApprove : reject.dataset.orderReject;
    try {
      btn.disabled = true;
      const res = await adminApi("admin/order-review", {
        orderId: id,
        decision: approve ? "approve" : "reject"
      });
      if (res.activated?.client) {
        const c = res.activated.client;
        await mirrorToRtdb(`xtreamAccounts/${c.username}`, {
          username: c.username,
          password: c.password,
          uid: c.resellerCode || "panel",
          displayName: c.username,
          plan: "pro",
          planId: c.planId,
          status: "Active",
          tier: "pro",
          maxConnections: Number(c.devices) || 1,
          resellerCode: c.resellerCode || "",
          mac: c.mac || "",
          expDate: Number(c.expDate) || 0,
          createdAt: c.createdAt
        });
        toast(`Approved ${id} → user ${c.username} / pass ${c.password}`);
      } else if (res.activated?.resellerCode) {
        toast(`Approved ${id} → +${res.activated.added} credits to ${res.activated.resellerCode}`);
      } else {
        toast(`Order ${id} ${approve ? "approved" : "rejected"}`);
      }
      await loadAdmin();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $("ordersTable")?.addEventListener("click", (e) => {
    const link = e.target.closest("[data-proof]");
    if (!link) return;
    e.preventDefault();
    const order = (state.adminOrders || []).find((o) => o.id === link.dataset.proof);
    if (!order?.proofDataUrl) return;
    const win = window.open("", "_blank");
    if (win) win.document.write(`<title>Payment proof ${order.id}</title><img src="${order.proofDataUrl}" style="max-width:100%" alt="Payment screenshot" />`);
  });

  $("resellerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const res = await adminApi("admin/reseller-create", {
        name: $("rsName").value.trim(),
        email: $("rsEmail").value.trim(),
        whatsapp: $("rsWhatsapp").value.trim(),
        credits: Number($("rsCredits").value) || 5
      });
      showResult(
        $("adminAuthMsg"),
        `✅ Dealer created — code <code>${esc(res.reseller.code)}</code>, API key <code>${esc(res.reseller.apiKey)}</code>, license <code>${esc(res.reseller.licenseKey)}</code> (share once).`,
        "ok"
      );
      $("resellerForm").reset();
      await loadAdmin();
    } catch (err) {
      showResult($("adminAuthMsg"), `❌ ${esc(err.message)}`, "error");
    }
  });

  $("resellersTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-topup]");
    if (!btn) return;
    try {
      const res = await adminApi("admin/credits-topup", { code: btn.dataset.topup, amount: 10 });
      toast(`${btn.dataset.topup} now has ${res.reseller.credits} credits`);
      await loadAdmin();
    } catch (err) {
      toast(err.message);
    }
  });

  $("adminClientsTable")?.addEventListener("click", async (e) => {
    const renew = e.target.closest("[data-admin-renew]");
    const suspend = e.target.closest("[data-admin-suspend]");
    const btn = renew || suspend;
    if (!btn) return;
    try {
      if (renew) {
        await adminApi("admin/client-renew", { username: renew.dataset.adminRenew, planId: "monthly" });
        toast("Client renewed for 30 days");
      } else {
        await adminApi("admin/client-suspend", { username: suspend.dataset.adminSuspend, suspended: true });
        toast("Client suspended");
      }
      await loadAdmin();
    } catch (err) {
      toast(err.message);
    }
  });

  $("pinSaveBtn")?.addEventListener("click", async () => {
    try {
      const res = await adminApi("admin/pin-set", {
        currentPin: $("pinCurrent").value.trim(),
        newPin: $("pinNew").value.trim()
      });
      toast(res.note || "PIN updated");
      $("pinCurrent").value = "";
      $("pinNew").value = "";
    } catch (err) {
      toast(err.message);
    }
  });
}

/* --------------------------------- init --------------------------------- */

async function init() {
  bindTabs();
  bindOrder();
  bindTrial();
  bindDashboard();
  bindAdmin();
  await loadConfig();

  // Restore dealer session silently
  const session = JSON.parse(localStorage.getItem(DEALER_SESSION_KEY) || "{}");
  if (session.code && session.apiKey) {
    try {
      await refreshDealer();
    } catch {
      /* ignore */
    }
  }

  // Restore admin session silently
  if (await refreshAdminToken()) {
    try {
      const me = await adminApi("admin/me");
      state.adminUser = me.admin;
      $("adminGate").hidden = true;
      $("adminBody").hidden = false;
      $("adminSignOutBtn").hidden = false;
      await loadAdmin();
    } catch {
      state.adminToken = "";
    }
  }

  const params = new URLSearchParams(location.search);
  const wantedPlan = params.get("plan");
  if (wantedPlan && [...$("ordPlan").options].some((o) => o.value === wantedPlan)) {
    $("ordPlan").value = wantedPlan;
    if (params.get("audience")) $("ordAudience").value = params.get("audience");
    paintOrderSummary();
    switchTab("order");
  }
}

init();

import {
  getRequestBaseUrl,
  handleOptions,
  parseBody,
  parseQuery,
  sendJson
} from "../_lib/origin.js";
import { checkRateLimit, getClientIp } from "../_lib/security.js";
import { authenticateAdmin, getClientToken, setOwnerPin, verifyOwnerPin } from "../_lib/adminauth.js";
import {
  deviceFingerprint,
  generateLicenseKey,
  hashLicenseKey,
  normalizeMac,
  signPlayRequest,
  verifyPlayToken
} from "../_lib/licenses.js";
import {
  claimTrial,
  clearPanelCache,
  createClient,
  createOrder,
  createReseller,
  getAnalytics,
  getClient,
  getOrder,
  getResellerByApiKey,
  getResellerByEmail,
  getResellerByCode,
  listAudit,
  listClients,
  listOrders,
  listResellers,
  listTrials,
  normalizeClient,
  normalizePricing,
  renewClient,
  recordClientPayment,
  resellerFinance,
  rechargeContactFor,
  selfRegisterReseller,
  setResellerPassword,
  setResellerPricing,
  listPayments,
  pushAudit,
  verifyResellerPassword,
  suspendClient,
  topUpCredits,
  updateOrder,
  updateReseller
} from "../_lib/panelstore.js";
import { getChannels, getPlaylistById, getMovies, getSeries, rtdbGet, rtdbSet } from "../_lib/rtdb.js";
import { PLANS, PANEL, PAYMENT, FEATURE_MATRIX, RESELLER_TIERS, SELF_SERVE, KEYWORDS, priceForPlan } from "../../data/panel.js";
import { BRAND } from "../../data/catalog.js";
import { getAnalyticsDashboardSnapshot, listClientErrors } from "../_lib/tracker.js";

/**
 * BarakatWave TV — Unified IPTV Panel API
 * ------------------------------------------------------------------
 * Public:      config, plans, order/create, order/status, trial, resolve
 * Reseller:    login, clients, client/create, client/renew, links, stats
 * Admin:       analytics, orders, order/review, resellers, reseller/create,
 *              credits/topup, clients, client/create|renew|suspend, audit, me
 */

const PUBLIC_ACTIONS = new Set([
  "config",
  "plans",
  "pricing",
  "resolve",
  "order",
  "order-status",
  "status",
  "trial",
  "health",
  "ping",
  "admin/pin-login",
  "reseller/register",
  "reseller/login-password",
  "recharge/contact"
]);

const ADMIN_ACTIONS = new Set([
  "admin/analytics",
  "admin/orders",
  "admin/order-review",
  "admin/resellers",
  "admin/reseller-create",
  "admin/reseller-update",
  "admin/credits-topup",
  "admin/clients",
  "admin/client-create",
  "admin/client-renew",
  "admin/client-suspend",
  "admin/audit",
  "admin/me",
  "admin/secure-link",
  "admin/keys",
  "admin/pin-set",
  "admin/trials",
  "admin/payments",
  "admin/reseller-detail",
  "admin/errors",
  "admin/channels",
  "admin/playlists",
  "admin/xtream-accounts",
  "admin/catalog"
]);

const RESELLER_ACTIONS = new Set([
  "reseller/login",
  "reseller/stats",
  "reseller/clients",
  "reseller/client-create",
  "reseller/client-renew",
  "reseller/client-suspend",
  "reseller/client-block",
  "reseller/secure-link",
  "reseller/me",
  "reseller/pricing-set",
  "reseller/payment-record",
  "reseller/ledger",
  "reseller/finance"
]);

function publicConfig(req) {
  const base = getRequestBaseUrl(req);
  return {
    ok: true,
    brand: BRAND.name,
    founder: BRAND.founder,
    parent: BRAND.parentProject,
    baseUrl: base,
    currency: PANEL.currency,
    panelVersion: PANEL.version,
    trialDays: PANEL.trialDays,
    resellerPerUserMonthly: PANEL.resellerPerUserMonthly,
    directPerUserMonthly: PANEL.directPerUserMonthly,
    minResellerCredits: PANEL.minResellerCredits,
    support: {
      phone: PANEL.supportPhoneDisplay,
      whatsapp: PANEL.supportWhatsapp,
      email: PANEL.ownerEmail
    },
    recommendedPlayer: { name: PANEL.recommendedPlayerName, url: PANEL.recommendedPlayer },
    plans: PLANS,
    resellerTiers: RESELLER_TIERS,
    payment: PAYMENT,
    featureMatrix: FEATURE_MATRIX,
    xtream: {
      serverUrl: base,
      port: 443,
      playerApi: `${base}/player_api.php`,
      m3uPlus: `${base}/get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8`,
      epg: `${base}/xmltv.php?username=USER&password=PASS`
    }
  };
}

async function resolveIdentity(req, action, body) {
  if (ADMIN_ACTIONS.has(action)) {
    const admin = await authenticateAdmin(req);
    return { role: "admin", admin };
  }
  if (RESELLER_ACTIONS.has(action)) {
    return { role: "reseller", admin: null };
  }
  return { role: "public", admin: null };
}

async function authorizeReseller(req, body) {
  const apiKey = String(req?.headers?.["x-api-key"] || body.apiKey || "").trim();
  const code = String(body.resellerCode || body.code || "").trim().toUpperCase();
  const licenseKey = String(body.licenseKey || "").trim();

  let reseller = null;
  if (apiKey) reseller = await getResellerByApiKey(apiKey);
  if (!reseller && code) reseller = await getResellerByCode(code);
  if (reseller && licenseKey && hashLicenseKey(licenseKey) !== reseller.licenseHash) {
    return { ok: false, status: 401, error: "License key does not match this dealer code." };
  }
  if (!reseller) {
    return { ok: false, status: 401, error: "Dealer not found. Check your dealer code + API key." };
  }
  if (reseller.status !== "active") {
    return { ok: false, status: 403, error: "Dealer account suspended. Contact 0306-2015326." };
  }
  return { ok: true, reseller };
}

/** Public-safe reseller view (never leaks password hash / license hash). */
function resellerPublic(reseller) {
  if (!reseller) return null;
  return {
    code: reseller.code,
    name: reseller.name,
    email: reseller.email,
    whatsapp: reseller.whatsapp,
    city: reseller.city || "",
    brandName: reseller.brandName || "",
    tier: reseller.tier,
    credits: Number(reseller.credits || 0),
    creditsUsed: Number(reseller.creditsUsed || 0),
    pricePerUser: Number(reseller.pricePerUser || PANEL.resellerPerUserMonthly),
    pricing: reseller.pricing || null,
    contactWhatsapp: reseller.contactWhatsapp || reseller.whatsapp || "",
    contactPhone: reseller.contactPhone || reseller.whatsapp || "",
    status: reseller.status,
    selfServe: Boolean(reseller.selfServe),
    apiKey: reseller.apiKey,
    licenseKey: reseller.selfServe ? reseller.licenseKey : reseller.licenseKey,
    collectedTotal: Number(reseller.collectedTotal || 0),
    createdAt: reseller.createdAt
  };
}

function resellerStats(clients = []) {
  const active = clients.filter((c) => c.status === "active");
  return {
    clients: clients.length,
    active: active.length,
    expired: clients.filter((c) => c.status === "expired").length,
    suspended: clients.filter((c) => c.status === "suspended").length,
    expiringSoon: active.filter((c) => c.daysLeft <= 3).length
  };
}

function signStreamFor(baseUrl, username, file = "index.m3u8", kind = "live") {
  const signed = signPlayRequest({ username, kind, target: file });
  return {
    url: `${baseUrl}/s/${signed.token}`,
    token: signed.token,
    expiresAt: signed.exp,
    ttlSec: signed.exp - Math.floor(Date.now() / 1000)
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const isPost = req.method === "POST" || req.method === "PUT";
  const body = isPost ? await parseBody(req) : {};
  const action = String((isPost ? body.action : q.action) || q.ep || "config")
    .trim()
    .toLowerCase();

  try {
    /* ------------------------------ PUBLIC ------------------------------ */

    if (action === "config" || action === "plans" || action === "pricing") {
      return sendJson(res, 200, publicConfig(req), "public, max-age=120");
    }

    if (action === "admin/pin-login" && isPost) {
      const result = await verifyOwnerPin(body.pin, getClientIp(req));
      if (!result.ok) {
        return sendJson(res, result.status || 401, { ok: false, error: result.error });
      }
      return sendJson(res, 200, {
        ok: true,
        token: result.token,
        expiresIn: result.expiresIn,
        admin: result.admin,
        note: "Store this token as localStorage bw_admin_session. Valid 12 hours."
      });
    }

    /* --------------------- SELF-SERVE RESELLER SIGNUP --------------------- */

    if (action === "reseller/register") {
      if (!isPost) return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      if (!SELF_SERVE.enabled) {
        return sendJson(res, 403, { ok: false, error: "Self-serve reseller registration is closed. WhatsApp 0306-2015326." });
      }
      const rl = checkRateLimit(req, "panel_reseller_register", 6, 10 * 60_000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: "Too many signup attempts. Try again after 10 minutes." });
      }

      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const whatsapp = String(body.whatsapp || "").trim();
      const password = String(body.password || "");

      if (name.length < 3) return sendJson(res, 400, { ok: false, error: "Enter your full name (3+ characters)." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
      }
      if (!/^[0-9+\-\s]{9,17}$/.test(whatsapp)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid WhatsApp number (e.g. 03001234567)." });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { ok: false, error: "Password must be at least 6 characters." });
      }

      const created = await selfRegisterReseller({
        name,
        email,
        whatsapp,
        password,
        city: body.city,
        brandName: body.brandName,
        selfServe: true
      });

      if (!created.ok) return sendJson(res, created.status || 400, { ok: false, error: created.error });

      const r = created.reseller;
      await pushAudit("reseller.self-registered", { code: r.code, email: r.email });
      clearPanelCache();
      return sendJson(res, 201, {
        ok: true,
        message: `Welcome ${r.name}! Aapka reseller panel ready hai.`,
        reseller: {
          code: r.code,
          name: r.name,
          email: r.email,
          whatsapp: r.whatsapp,
          brandName: r.brandName,
          credits: r.credits,
          pricing: r.pricing,
          apiKey: r.apiKey,
          licenseKey: r.licenseKey,
          selfServe: true
        },
        starterCredits: SELF_SERVE.signupCredits,
        setup: {
          xtreamHost: getRequestBaseUrl(req),
          m3uTemplate: `${getRequestBaseUrl(req)}/get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8`
        },
        next: [
          "Apni selling price set karein (Settings tab) — connection fee + monthly.",
          "Dashboard se client add karein (Xtream ya MAC/Stalker).",
          "Client ko M3U / Xtream / MAC details WhatsApp kar dein.",
          "Mahina poora hone par 'Payment Received' se renew karein."
        ]
      });
    }

    if (action === "reseller/login-password") {
      if (!isPost) return sendJson(res, 405, { ok: false, error: "Method not allowed" });
      const rl = checkRateLimit(req, "panel_reseller_login", 12, 5 * 60_000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: "Too many login attempts. Wait 5 minutes." });
      }
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const reseller = await getResellerByEmail(email);
      if (!reseller || !verifyResellerPassword(reseller, password)) {
        return sendJson(res, 401, { ok: false, error: "Email or password is incorrect." });
      }
      if (reseller.status !== "active") {
        return sendJson(res, 403, { ok: false, error: "Account suspended. Contact 0306-2015326." });
      }
      await updateReseller(reseller.code, { lastLoginAt: new Date().toISOString() });
      const clients = await listClients({ resellerCode: reseller.code });
      return sendJson(res, 200, {
        ok: true,
        reseller: resellerPublic(reseller),
        clients: clients.map((c) => ({ ...c, password: undefined })),
        stats: resellerStats(clients),
        finance: await resellerFinance(reseller.code)
      });
    }

    if (action === "recharge/contact") {
      const result = await rechargeContactFor({
        username: q.username || body.username,
        mac: q.mac || body.mac
      });
      return sendJson(res, 200, result, "public, max-age=60");
    }

    if (action === "resolve") {
      const token = String(q.token || "").trim();
      const check = verifyPlayToken(token);
      if (!check.valid) {
        return sendJson(res, 403, { ok: false, error: "Invalid or expired secure link", reason: check.reason });
      }
      const base = getRequestBaseUrl(req);
      const { u, k, t } = check.payload;
      const safeFile = String(t || "index.m3u8").replace(/[^a-zA-Z0-9._-]/g, "");
      const path =
        k === "movie" ? `/api/media?ep=live&kind=movie&user=${encodeURIComponent(u)}&file=${safeFile}` :
        k === "playlist" ? `/playlist/${encodeURIComponent(u)}` :
        `/api/media?ep=live&kind=live&user=${encodeURIComponent(u)}&file=${safeFile}`;
      res.statusCode = 302;
      res.setHeader("Location", base + path);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-BarakatWave-Signed", "hmac-sha256");
      res.end();
      return;
    }

    if (action === "order" && isPost) {
      const rl = checkRateLimit(req, "panel_order", 12, 60_000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: "Too many order attempts. Try again in a minute." });
      }
      const name = String(body.name || "").trim();
      const whatsapp = String(body.whatsapp || "").trim();
      const planId = String(body.planId || "monthly");
      const audience = body.audience === "reseller" ? "reseller" : "direct";
      const priced = priceForPlan(planId, audience, body.quantity);

      if (!name || name.length < 3) {
        return sendJson(res, 400, { ok: false, error: "Please enter your full name." });
      }
      if (!/^[0-9+\-\s]{9,17}$/.test(whatsapp)) {
        return sendJson(res, 400, { ok: false, error: "Enter a valid WhatsApp number (e.g. 03062015326)." });
      }
      if (audience === "direct" && priced.total > 0 && !String(body.txnId || "").trim()) {
        return sendJson(res, 400, {
          ok: false,
          error: "Add your JazzCash Transaction ID (TID) after sending the payment."
        });
      }

      const order = await createOrder({
        ...body,
        planId: priced.plan.id,
        audience,
        quantity: priced.quantity
      });
      return sendJson(res, 200, {
        ok: true,
        order,
        payment: {
          method: PAYMENT.method,
          number: PAYMENT.accountNumber,
          title: PAYMENT.accountTitle,
          whatsapp: PAYMENT.whatsappProof,
          amount: order.total,
          reference: order.id
        },
        next: [
          `Send PKR ${order.total} to JazzCash ${PAYMENT.accountNumber} (${PAYMENT.accountTitle}).`,
          `Send the screenshot on WhatsApp ${PANEL.supportPhoneDisplay} with reference ${order.id}.`,
          "Your PRO / credits are activated after review (usually under 30 minutes)."
        ]
      });
    }

    if ((action === "order-status" || action === "status") && (isPost || q.id)) {
      const id = String(body.orderId || body.id || q.id || "").trim();
      const order = await getOrder(id);
      if (!order) return sendJson(res, 404, { ok: false, error: "Order not found. Check your order ID." });
      return sendJson(res, 200, {
        ok: true,
        order: {
          id: order.id,
          status: order.status,
          planName: order.planName,
          total: order.total,
          currency: order.currency,
          createdAt: order.createdAt,
          reviewedAt: order.reviewedAt,
          username: order.username || ""
        }
      });
    }

    if (action === "trial" && isPost) {
      const rl = checkRateLimit(req, "panel_trial", 6, 10 * 60_000);
      if (!rl.allowed) {
        return sendJson(res, 429, {
          ok: false,
          error: `Too many trial requests. WhatsApp ${PANEL.supportPhoneDisplay} for manual help.`
        });
      }
      const email = String(body.email || "").trim().toLowerCase();
      const deviceId = String(body.deviceId || "").trim() || String(req.headers["user-agent"] || "").slice(0, 60);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: "A valid email is required for the free trial." });
      }
      const result = await claimTrial({
        email,
        deviceId: deviceId + "|" + getClientIp(req),
        whatsapp: body.whatsapp
      });
      if (!result.ok) {
        return sendJson(res, 200, {
          ok: false,
          reason: result.reason,
          error:
            result.reason === "already_active"
              ? "Your 1-day PRO trial is already active. Check your email / order for credentials."
              : "This trial was already used. Upgrade on WhatsApp 0306-2015326 (PKR 200 / month).",
          trial: result.trial ? { expDate: result.trial.expDate, username: result.trial.username } : null
        });
      }
      const base = getRequestBaseUrl(req);
      return sendJson(res, 200, {
        ok: true,
        trial: result.trial,
        credentials: {
          serverUrl: base,
          port: 443,
          username: result.trial.username,
          password: result.trial.password,
          m3u: `${base}/get.php?username=${result.trial.username}&password=${result.trial.password}&type=m3u_plus&output=m3u8`,
          epg: `${base}/xmltv.php?username=${result.trial.username}&password=${result.trial.password}`,
          expiresAt: result.trial.expDate
        },
        player: PANEL.recommendedPlayer
      });
    }

    /* ------------------------------ RESELLER ------------------------------ */

    if (action.startsWith("reseller/")) {
      const auth = await authorizeReseller(req, body);
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
      const reseller = auth.reseller;
      const base = getRequestBaseUrl(req);

      if (action === "reseller/login" || action === "reseller/stats" || action === "reseller/me") {
        await updateReseller(reseller.code, { lastLoginAt: new Date().toISOString() });
        const clients = await listClients({ resellerCode: reseller.code });
        const stats = resellerStats(clients);
        const pricing = reseller.pricing || {};
        return sendJson(res, 200, {
          ok: true,
          reseller: resellerPublic(reseller),
          stats: {
            ...stats,
            retailValue: stats.active * (Number(pricing.monthly) || PANEL.directPerUserMonthly)
          },
          finance: await resellerFinance(reseller.code),
          selfServe: {
            enabled: SELF_SERVE.enabled,
            signupCredits: SELF_SERVE.signupCredits,
            unitCost: SELF_SERVE.unitCost,
            pricePresets: SELF_SERVE.pricePresets,
            allowMacClients: SELF_SERVE.allowMacClients
          },
          clients: clients.map((c) => ({ ...c, password: undefined })),
          xtream: {
            serverUrl: base,
            m3uPlus: `${base}/get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8`,
            epg: `${base}/xmltv.php?username=USER&password=PASS`
          }
        });
      }

      if (action === "reseller/finance") {
        return sendJson(res, 200, { ok: true, finance: await resellerFinance(reseller.code) });
      }

      if (action === "reseller/ledger") {
        const payments = await listPayments({
          resellerCode: reseller.code,
          username: body.username || q.username || "",
          limit: Number(body.limit) || 100
        });
        return sendJson(res, 200, {
          ok: true,
          count: payments.length,
          payments,
          finance: await resellerFinance(reseller.code)
        });
      }

      if (action === "reseller/pricing-set") {
        const updated = await setResellerPricing(reseller.code, {
          pricing: body.pricing || body,
          contactWhatsapp: body.contactWhatsapp,
          contactPhone: body.contactPhone,
          brandName: body.brandName,
          pricePerUser: body.pricePerUser
        });
        return sendJson(res, 200, {
          ok: true,
          message: "Selling price + contact number update ho gaye.",
          reseller: resellerPublic(updated)
        });
      }

      if (action === "reseller/payment-record") {
        const username = String(body.username || "").trim().toLowerCase();
        const months = Math.max(1, Math.min(24, Number(body.months) || 1));
        const target = await getClient(username);
        if (!target || target.resellerCode !== reseller.code) {
          return sendJson(res, 404, { ok: false, error: "Client not found in your panel." });
        }
        const credits = Number(reseller.credits || 0);
        if (credits < months) {
          return sendJson(res, 402, {
            ok: false,
            error: `Aapke paas ${credits} credit hain lekin ${months} mahine ke liye ${months} chahiye. Credits top-up karein (JazzCash 0306-2015326).`
          });
        }
        const payment = await recordClientPayment({
          username: target.username,
          amount: body.amount,
          months,
          via: body.via || "cash",
          note: body.note || "",
          resellerCode: reseller.code,
          recordedBy: "reseller"
        });
        if (!payment.ok) return sendJson(res, payment.status || 400, { ok: false, error: payment.error });
        await updateReseller(reseller.code, {
          credits: credits - months,
          creditsUsed: Number(reseller.creditsUsed || 0) + months
        });
        clearPanelCache();
        return sendJson(res, 200, {
          ok: true,
          message: `${target.username} ka ${months} mahina renew ho gaya — Rs ${payment.payment.amount} collect.`,
          payment: payment.payment,
          client: payment.client,
          creditsLeft: credits - months,
          finance: await resellerFinance(reseller.code)
        });
      }

      if (action === "reseller/clients") {
        const clients = await listClients({ resellerCode: reseller.code });
        return sendJson(res, 200, { ok: true, count: clients.length, clients });
      }

      if (action === "reseller/client-create") {
        const credits = Number(reseller.credits || 0);
        if (credits < 1) {
          return sendJson(res, 402, {
            ok: false,
            error: "Credits khatam. JazzCash 0306-2015326 par bhejein aur screenshot WhatsApp karein."
          });
        }

        const rawMac = String(body.mac || "").trim();
        let mac = "";
        if (rawMac) {
          if (!SELF_SERVE.allowMacClients) {
            return sendJson(res, 403, { ok: false, error: "MAC/Stalker clients are disabled." });
          }
          mac = normalizeMac(rawMac);
          if (!mac) {
            return sendJson(res, 400, { ok: false, error: "Invalid MAC address (format 00:1A:79:XX:XX:XX)." });
          }
          const all = await listClients();
          if (all.some((c) => String(c.mac || "").toUpperCase() === mac)) {
            return sendJson(res, 409, { ok: false, error: "Ye MAC pehle se kisi client par registered hai." });
          }
        }

        const created = await createClient({
          ...body,
          mac,
          resellerCode: reseller.code,
          source: mac ? "reseller-mac" : "reseller"
        });
        await updateReseller(reseller.code, {
          credits: credits - 1,
          creditsUsed: Number(reseller.creditsUsed || 0) + 1
        });

        // Reseller ne client se kitne rupay liye? Do soorat hain:
        //  1) collectAmount diya gaya → poora sale (fee + plan price) ek payment me.
        //  2) sirf connection fee collect hui → wohi record hoti hai.
        const pricing = reseller.pricing || {};
        const connectionFee = Math.max(0, Number(body.connectionFee ?? pricing.connectionFee ?? 0) || 0);
        const collectAmount = Math.max(0, Number(body.collectAmount) || 0) || 0;
        let feeRecord = null;
        if (collectAmount > 0) {
          const recorded = await recordClientPayment({
            username: created.username,
            amount: collectAmount,
            months: Math.round((Number(body.days) || 30) / 30),
            via: body.via || "cash",
            note: "Client sale (connection + plan)",
            resellerCode: reseller.code,
            recordedBy: "reseller"
          });
          feeRecord = recorded.ok ? recorded.payment : null;
        } else if (connectionFee > 0 && body.collectFee !== false) {
          const recorded = await recordClientPayment({
            username: created.username,
            amount: connectionFee,
            months: 0,
            via: body.via || "cash",
            note: "Connection fee",
            resellerCode: reseller.code,
            recordedBy: "reseller"
          });
          feeRecord = recorded.ok ? recorded.payment : null;
        }

        clearPanelCache();
        return sendJson(res, 200, {
          ok: true,
          client: created,
          creditsLeft: credits - 1,
          connectionFee: feeRecord,
          finance: await resellerFinance(reseller.code),
          mac: mac || undefined,
          stalker: mac
            ? {
                portalUrl: `${base}/c/portal.php`,
                portalUrlShort: `${base}/c/`,
                mac,
                note: "MAG / Stalker box me ye Portal URL aur MAC daalein."
              }
            : undefined,
          sellPrice: {
            monthly: Number(pricing.monthly) || SELF_SERVE.monthlyDefault,
            connectionFee: Number(pricing.connectionFee) || SELF_SERVE.connectionFeeDefault
          },
          links: {
            m3u: `${base}/get.php?username=${created.username}&password=${created.password}&type=m3u_plus&output=m3u8`,
            epg: `${base}/xmltv.php?username=${created.username}&password=${created.password}`,
            xtream: { host: base, port: 443, username: created.username, password: created.password }
          }
        });
      }

      if (action === "reseller/client-block") {
        const target = await getClient(body.username);
        if (!target || target.resellerCode !== reseller.code) {
          return sendJson(res, 404, { ok: false, error: "Client not found in your panel." });
        }
        const updated = await suspendClient(target.username, body.blocked !== false);
        return sendJson(res, 200, {
          ok: true,
          client: updated,
          message: body.blocked === false ? "Client unblocked." : "Client blocked — payment na aane par service band."
        });
      }

      if (action === "reseller/client-renew") {
        const target = await getClient(body.username);
        if (!target || target.resellerCode !== reseller.code) {
          return sendJson(res, 404, { ok: false, error: "Client not found in your panel." });
        }
        if (Number(reseller.credits || 0) < 1) {
          return sendJson(res, 402, { ok: false, error: "No credits left to renew this client." });
        }
        const renewed = await renewClient(target.username, { planId: body.planId || "monthly" });
        await updateReseller(reseller.code, {
          credits: Number(reseller.credits || 0) - 1,
          creditsUsed: Number(reseller.creditsUsed || 0) + 1
        });
        return sendJson(res, 200, { ok: true, client: renewed, creditsLeft: Number(reseller.credits || 0) - 1 });
      }

      if (action === "reseller/client-suspend") {
        const target = await getClient(body.username);
        if (!target || target.resellerCode !== reseller.code) {
          return sendJson(res, 404, { ok: false, error: "Client not found in your panel." });
        }
        const updated = await suspendClient(target.username, body.suspended !== false);
        return sendJson(res, 200, { ok: true, client: updated });
      }

      if (action === "reseller/secure-link") {
        const username = String(body.username || "").trim();
        const target = await getClient(username);
        if (!target || target.resellerCode !== reseller.code) {
          return sendJson(res, 404, { ok: false, error: "Client not found in your panel." });
        }
        return sendJson(res, 200, {
          ok: true,
          ...signStreamFor(base, username, body.file || "index.m3u8", body.kind || "live")
        });
      }
    }

    /* -------------------------------- ADMIN -------------------------------- */

    if (action.startsWith("admin/")) {
      const admin = await authenticateAdmin(req);
      if (!admin.ok) return sendJson(res, admin.status || 401, { ok: false, error: admin.error });
      const base = getRequestBaseUrl(req);

      if (action === "admin/me") {
        return sendJson(res, 200, {
          ok: true,
          admin: { uid: admin.uid, email: admin.email, role: admin.role, via: admin.via }
        });
      }

      if (action === "admin/payments") {
        const payments = await listPayments({ limit: Number(body.limit) || 200 });
        const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        return sendJson(res, 200, { ok: true, count: payments.length, total, payments });
      }

      if (action === "admin/analytics") {
        // Business stats + LIVE visitor/stream analytics + collected frontend
        // errors — sab ek hi response me, taake admin panel me sab kuch dikhe.
        const [business, live, errors] = await Promise.all([
          getAnalytics(),
          getAnalyticsDashboardSnapshot().catch(() => null),
          listClientErrors(20).catch(() => [])
        ]);
        return sendJson(res, 200, {
          ...business,
          live: live
            ? {
                summary: live.summary,
                breakdowns: live.breakdowns,
                sessions: (live.sessions || []).slice(0, 25),
                plays: (live.plays || []).slice(0, 25),
                generatedPkt: live.generatedPkt
              }
            : null,
          errors: {
            count: (live?.errors?.count ?? 0),
            unique: (live?.errors?.unique ?? errors.length),
            latest: errors.slice(0, 10)
          }
        });
      }

      if (action === "admin/errors") {
        const errors = await listClientErrors(Number(body.limit) || 50);
        return sendJson(res, 200, { ok: true, count: errors.length, errors });
      }

      if (action === "admin/reseller-detail") {
        const code = String(body.code || q.code || "").trim().toUpperCase();
        const reseller = await getResellerByCode(code);
        if (!reseller) return sendJson(res, 404, { ok: false, error: "Reseller not found." });
        const [clients, payments, finance] = await Promise.all([
          listClients({ resellerCode: reseller.code }),
          listPayments({ resellerCode: reseller.code, limit: 100 }),
          resellerFinance(reseller.code)
        ]);
        return sendJson(res, 200, {
          ok: true,
          reseller: {
            ...resellerPublic(reseller),
            createdAt: reseller.createdAt,
            lastLoginAt: reseller.lastLoginAt || "",
            selfServe: Boolean(reseller.selfServe)
          },
          stats: resellerStats(clients),
          finance,
          payments,
          clients: clients.map((c) => {
            const exp = Number(c.expDate || 0);
            return {
              ...c,
              password: c.password || "",
              links: {
                m3u: `${base}/get.php?username=${c.username}&password=${c.password || ""}&type=m3u_plus&output=m3u8`,
                epg: `${base}/xmltv.php?username=${c.username}&password=${c.password || ""}`,
                xtream: { host: base, port: 443, username: c.username, password: c.password || "" },
                stalker: c.mac
                  ? { portalUrl: `${base}/c/portal.php`, portalUrlShort: `${base}/c/`, mac: c.mac }
                  : null
              },
              expiresPkt: exp ? new Date(exp * 1000).toISOString().slice(0, 10) : ""
            };
          })
        });
      }

      if (action === "admin/resellers") {
        const [resellers, clients, payments] = await Promise.all([
          listResellers(),
          listClients(),
          listPayments({ limit: 500 })
        ]);
        return sendJson(res, 200, {
          ok: true,
          count: resellers.length,
          resellers: resellers.map((r) => {
            const mine = clients.filter((c) => c.resellerCode === r.code);
            const collected = payments
              .filter((p) => p.resellerCode === r.code)
              .reduce((sum, p) => sum + Number(p.amount || 0), 0);
            return {
              ...r,
              password: undefined,
              passwordHash: undefined,
              passwordSalt: undefined,
              licenseHash: undefined,
              clients: mine.length,
              activeClients: mine.filter((c) => c.status === "active").length,
              expiredClients: mine.filter((c) => c.status === "expired").length,
              macClients: mine.filter((c) => c.mac).length,
              collected,
              pricing: normalizePricing(r.pricing || {}),
              clientNames: mine.slice(0, 6).map((c) => c.username)
            };
          }),
          tiers: RESELLER_TIERS
        });
      }

      if (action === "admin/orders") {
        const orders = await listOrders();
        const status = String(q.status || body.status || "all").toLowerCase();
        const filtered = status === "all" ? orders : orders.filter((o) => o.status === status);
        return sendJson(res, 200, { ok: true, count: filtered.length, orders: filtered });
      }

      if (action === "admin/order-review") {
        const target = await getOrder(body.orderId || body.id);
        if (!target) return sendJson(res, 404, { ok: false, error: "Order not found." });
        const decision = String(body.decision || "approve").toLowerCase();
        if (decision === "reject") {
          const updated = await updateOrder(target.id, {
            status: "rejected",
            reviewedBy: admin.email,
            adminNote: String(body.note || "").slice(0, 300)
          });
          return sendJson(res, 200, { ok: true, order: updated });
        }

        const planDays = Number(target.days) || 30;
        let activated = null;

        if (target.audience === "reseller" || target.kind === "credits") {
          let reseller = target.resellerCode ? await getResellerByCode(target.resellerCode) : null;
          if (!reseller) {
            reseller = await createReseller({
              name: target.name || "Dealer",
              email: target.email,
              whatsapp: target.whatsapp,
              credits: 0
            });
          }
          const creditsToAdd = Math.max(1, Number(target.quantity) || Math.ceil(Number(target.total) / PANEL.resellerPerUserMonthly) || 1);
          const topped = await topUpCredits(reseller.code, creditsToAdd);
          activated = { type: "reseller", resellerCode: topped.code, credits: topped.credits, added: creditsToAdd };
        } else {
          const username = target.username || ("bw" + Date.now().toString(36).slice(-6));
          const existing = await getClient(username);
          if (existing) {
            activated = { type: "client", client: await renewClient(username, { planId: target.planId }) };
          } else {
            activated = {
              type: "client",
              client: await createClient({
                username,
                email: target.email,
                whatsapp: target.whatsapp,
                planId: target.planId || "monthly",
                days: planDays,
                devices: 1,
                source: "order",
                orderId: target.id
              })
            };
          }
        }

        const updated = await updateOrder(target.id, {
          status: "approved",
          reviewedBy: admin.email,
          activated
        });
        return sendJson(res, 200, {
          ok: true,
          order: updated,
          activated,
          links: activated?.client
            ? {
                m3u: `${base}/get.php?username=${activated.client.username}&password=${activated.client.password}&type=m3u_plus&output=m3u8`,
                epg: `${base}/xmltv.php?username=${activated.client.username}&password=${activated.client.password}`
              }
            : null
        });
      }

      if (action === "admin/reseller-create") {
        const created = await createReseller(body);
        return sendJson(res, 200, { ok: true, reseller: created });
      }

      if (action === "admin/reseller-update") {
        const updated = await updateReseller(body.code, body.patch || body);
        if (!updated) return sendJson(res, 404, { ok: false, error: "Reseller not found." });
        return sendJson(res, 200, { ok: true, reseller: updated });
      }

      if (action === "admin/credits-topup") {
        const updated = await topUpCredits(body.code, body.amount);
        if (!updated) return sendJson(res, 404, { ok: false, error: "Reseller not found." });
        return sendJson(res, 200, { ok: true, reseller: updated });
      }

      if (action === "admin/clients") {
        const clients = await listClients({ resellerCode: q.resellerCode || body.resellerCode });
        return sendJson(res, 200, { ok: true, count: clients.length, clients });
      }

      if (action === "admin/client-create") {
        const created = await createClient(body);
        return sendJson(res, 200, {
          ok: true,
          client: created,
          links: {
            m3u: `${base}/get.php?username=${created.username}&password=${created.password}&type=m3u_plus&output=m3u8`,
            epg: `${base}/xmltv.php?username=${created.username}&password=${created.password}`
          }
        });
      }

      if (action === "admin/client-renew") {
        const renewed = await renewClient(body.username, {
          planId: body.planId || "monthly",
          resellerCode: body.resellerCode
        });
        if (!renewed) return sendJson(res, 404, { ok: false, error: "Client not found." });
        return sendJson(res, 200, { ok: true, client: renewed });
      }

      if (action === "admin/client-suspend") {
        const updated = await suspendClient(body.username, body.suspended !== false);
        if (!updated) return sendJson(res, 404, { ok: false, error: "Client not found." });
        return sendJson(res, 200, { ok: true, client: updated });
      }

      if (action === "admin/pin-set") {
        const result = await setOwnerPin(body.newPin, body.currentPin);
        if (!result.ok) return sendJson(res, result.status || 400, { ok: false, error: result.error });
        return sendJson(res, 200, { ok: true, note: result.note, saved: result.saved });
      }

      if (action === "admin/trials") {
        const trials = await listTrials();
        return sendJson(res, 200, { ok: true, count: trials.length, trials });
      }

      if (action === "admin/audit") {
        const [audit, trials] = await Promise.all([listAudit(80), listTrials()]);
        return sendJson(res, 200, { ok: true, audit, trials: trials.slice(0, 40) });
      }

      if (action === "admin/keys") {
        const generated = generateLicenseKey("BW");
        return sendJson(res, 200, {
          ok: true,
          licenseKey: generated,
          licenseHash: hashLicenseKey(generated),
          note: "Store only the hash. Give the key to the customer once — it cannot be recovered."
        });
      }

      /* ---------------------- ADMIN: CHANNELS ---------------------- */
      if (action === "admin/channels") {
        const channels = await getChannels();
        return sendJson(res, 200, { ok: true, count: channels.length, channels });
      }

      /* ---------------------- ADMIN: PLAYLISTS ---------------------- */
      if (action === "admin/playlists") {
        const raw = await rtdbGet("playlists", { ttlMs: 5000 });
        let arr = [];
        if (raw && typeof raw === "object") {
          arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
        }
        return sendJson(res, 200, { ok: true, count: arr.length, playlists: arr });
      }

      /* ---------------------- ADMIN: XTREAM ACCOUNTS ---------------------- */
      if (action === "admin/xtream-accounts") {
        const raw = await rtdbGet("xtreamAccounts", { ttlMs: 5000 });
        let arr = [];
        if (raw && typeof raw === "object") {
          arr = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
        }
        return sendJson(res, 200, { ok: true, count: arr.length, xtreamAccounts: arr });
      }

      /* ---------------------- ADMIN: CATALOG (MOVIES / SERIES) ---------------------- */
      if (action === "admin/catalog") {
        const type = String(q.type || body.type || "movies").toLowerCase();
        if (type === "series") {
          const series = await getSeries();
          return sendJson(res, 200, { ok: true, count: series.length, series });
        }
        const movies = await getMovies();
        return sendJson(res, 200, { ok: true, count: movies.length, movies });
      }

      /* ---------------------- ADMIN: CHANNEL CREATE ---------------------- */
      if (action === "admin/channel/create" && isPost) {
        const ch = body;
        if (!ch.name || !ch.url) {
          return sendJson(res, 400, { ok: false, error: "Channel name and stream URL are required." });
        }
        const key = String(ch.id || `ch_${Date.now().toString(36)}`);
        const record = {
          id: key,
          name: ch.name,
          category: ch.category || "📺 Live TV",
          xtreamGroup: ch.xtreamGroup || ch.category || "📺 Live TV",
          country: ch.country || "PK",
          language: ch.language || "Urdu",
          tier: ch.tier || "free",
          order: Number(ch.order) || 9999,
          pinned: Boolean(ch.pinned),
          status: ch.status || "active",
          url: ch.url,
          backupUrls: Array.isArray(ch.backupUrls) ? ch.backupUrls : [],
          logo: ch.logo || "",
          streamId: ch.streamId || 0,
          slug: ch.slug || key,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await rtdbSet(`channels/${key}`, record);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, channel: record });
      }

      /* ---------------------- ADMIN: CHANNEL UPDATE ---------------------- */
      if (action === "admin/channel/update" && isPost) {
        const key = String(body.id || "");
        if (!key) return sendJson(res, 400, { ok: false, error: "Channel id required." });
        const existing = await rtdbGet(`channels/${key}`, { ttlMs: 1000 });
        if (!existing) return sendJson(res, 404, { ok: false, error: "Channel not found." });
        const record = { ...existing, ...body, id: key, updatedAt: new Date().toISOString() };
        await rtdbSet(`channels/${key}`, record);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, channel: record });
      }

      /* ---------------------- ADMIN: CHANNEL DELETE ---------------------- */
      if (action === "admin/channel/delete" && isPost) {
        const key = String(body.id || "");
        if (!key) return sendJson(res, 400, { ok: false, error: "Channel id required." });
        await rtdbSet(`channels/${key}`, null);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, deleted: key });
      }

      /* ---------------------- ADMIN: PLAYLIST CREATE ---------------------- */
      if (action === "admin/playlist/create" && isPost) {
        const pl = body;
        if (!pl.name) return sendJson(res, 400, { ok: false, error: "Playlist name required." });
        const key = String(pl.id || `pl_${Date.now().toString(36)}`);
        const record = {
          id: key,
          name: pl.name,
          channelIds: Array.isArray(pl.channelIds) ? pl.channelIds : [],
          customStreams: Array.isArray(pl.customStreams) ? pl.customStreams : [],
          uid: pl.uid || "admin",
          updatedAt: new Date().toISOString()
        };
        await rtdbSet(`playlists/${key}`, record);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, playlist: record });
      }

      /* ---------------------- ADMIN: PLAYLIST DELETE ---------------------- */
      if (action === "admin/playlist/delete" && isPost) {
        const key = String(body.id || "");
        if (!key) return sendJson(res, 400, { ok: false, error: "Playlist id required." });
        await rtdbSet(`playlists/${key}`, null);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, deleted: key });
      }

      /* ---------------------- ADMIN: XTREAM ACCOUNT CREATE ---------------------- */
      if (action === "admin/xtream/create" && isPost) {
        const xt = body;
        if (!xt.username) return sendJson(res, 400, { ok: false, error: "Username required." });
        const key = String(xt.username).replace(/[.#$[]]/g, "").replace(/[\/]/g, "");
        const record = {
          username: key,
          password: xt.password || `BW${Math.floor(1000 + Math.random() * 9000)}`,
          plan: xt.plan || "free",
          maxConnections: Number(xt.maxConnections) || 1,
          email: xt.email || "",
          status: xt.status || "Active",
          expDate: xt.expDate ? Math.floor(new Date(xt.expDate).getTime() / 1000) : 0,
          createdAt: new Date().toISOString(),
          uid: xt.uid || "admin"
        };
        await rtdbSet(`xtreamAccounts/${key}`, record);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, xtream: record });
      }

      /* ---------------------- ADMIN: XTREAM ACCOUNT DELETE ---------------------- */
      if (action === "admin/xtream/delete" && isPost) {
        const key = String(body.username || body.id || "").replace(/[.#$[]]/g, "").replace(/[\/]/g, "");
        if (!key) return sendJson(res, 400, { ok: false, error: "Username required." });
        await rtdbSet(`xtreamAccounts/${key}`, null);
        clearPanelCache();
        return sendJson(res, 200, { ok: true, deleted: key });
      }

      if (action === "admin/secure-link") {
        if (body.mac && !normalizeMac(body.mac)) {
          return sendJson(res, 400, { ok: false, error: "Invalid MAC address format." });
        }
        const target = String(body.username || "").trim();
        return sendJson(res, 200, {
          ok: true,
          ...signStreamFor(base, target, body.file || "index.m3u8", body.kind || "live"),
          fingerprint: deviceFingerprint(req)
        });
      }
    }

    /* ------------------------------ MISC / DEBUG ------------------------------ */

    if (action === "health" || action === "ping") {
      return sendJson(res, 200, {
        ok: true,
        service: "barakatwave-panel",
        version: PANEL.version,
        keywords: KEYWORDS.core.length,
        at: new Date().toISOString()
      });
    }

    return sendJson(res, 400, {
      ok: false,
      error: `Unknown action '${action}'.`,
      help: "Read /api/panel?action=config for the full panel contract.",
      authUsed: Boolean(getClientToken(req))
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "Panel request failed",
      detail: String(err?.message || err).slice(0, 200)
    });
  }
}

export { normalizeClient };

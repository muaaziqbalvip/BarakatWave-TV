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
  getResellerByCode,
  listAudit,
  listClients,
  listOrders,
  listResellers,
  listTrials,
  normalizeClient,
  renewClient,
  suspendClient,
  topUpCredits,
  updateOrder,
  updateReseller
} from "../_lib/panelstore.js";
import { PLANS, PANEL, PAYMENT, FEATURE_MATRIX, RESELLER_TIERS, KEYWORDS, priceForPlan } from "../../data/panel.js";
import { BRAND } from "../../data/catalog.js";

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
  "admin/pin-login"
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
  "admin/trials"
]);

const RESELLER_ACTIONS = new Set([
  "reseller/login",
  "reseller/stats",
  "reseller/clients",
  "reseller/client-create",
  "reseller/client-renew",
  "reseller/client-suspend",
  "reseller/secure-link"
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

      if (action === "reseller/login" || action === "reseller/stats") {
        const clients = await listClients({ resellerCode: reseller.code });
        const active = clients.filter((c) => c.status === "active");
        return sendJson(res, 200, {
          ok: true,
          reseller: {
            code: reseller.code,
            name: reseller.name,
            email: reseller.email,
            tier: reseller.tier,
            credits: reseller.credits,
            creditsUsed: reseller.creditsUsed || 0,
            pricePerUser: reseller.pricePerUser,
            status: reseller.status,
            apiKey: reseller.apiKey,
            createdAt: reseller.createdAt
          },
          stats: {
            clients: clients.length,
            active: active.length,
            expired: clients.filter((c) => c.status === "expired").length,
            suspended: clients.filter((c) => c.status === "suspended").length,
            expiringSoon: active.filter((c) => c.daysLeft <= 3).length,
            retailValue: active.length * PANEL.directPerUserMonthly
          },
          clients: clients.map((c) => ({ ...c, password: undefined })),
          xtream: {
            serverUrl: base,
            m3uPlus: `${base}/get.php?username=USER&password=PASS&type=m3u_plus&output=m3u8`,
            epg: `${base}/xmltv.php?username=USER&password=PASS`
          }
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
            error: "No credits left. Send JazzCash to 0306-2015326 and WhatsApp the screenshot."
          });
        }
        const created = await createClient({
          ...body,
          resellerCode: reseller.code,
          source: "reseller"
        });
        await updateReseller(reseller.code, {
          credits: credits - 1,
          creditsUsed: Number(reseller.creditsUsed || 0) + 1
        });
        clearPanelCache();
        return sendJson(res, 200, {
          ok: true,
          client: created,
          creditsLeft: credits - 1,
          links: {
            m3u: `${base}/get.php?username=${created.username}&password=${created.password}&type=m3u_plus&output=m3u8`,
            epg: `${base}/xmltv.php?username=${created.username}&password=${created.password}`
          }
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

      if (action === "admin/analytics") {
        return sendJson(res, 200, await getAnalytics());
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

      if (action === "admin/resellers") {
        const resellers = await listResellers();
        const clients = await listClients();
        return sendJson(res, 200, {
          ok: true,
          count: resellers.length,
          resellers: resellers.map((r) => ({
            ...r,
            clients: clients.filter((c) => c.resellerCode === r.code).length,
            activeClients: clients.filter((c) => c.resellerCode === r.code && c.status === "active").length
          })),
          tiers: RESELLER_TIERS
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

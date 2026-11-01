import crypto from "node:crypto";
import { rtdbGet, rtdbSet } from "./rtdb.js";
import { PANEL, PLANS, getPlan } from "../../data/panel.js";
import {
  generateLicenseKey,
  generateResellerApiKey,
  generateXtreamPassword,
  hashLicenseKey,
  sha256
} from "./licenses.js";

/**
 * BarakatWave TV — Panel Store (orders, resellers, clients, trials, audit)
 * -----------------------------------------------------------------------
 * Uses Firebase RTDB as the system of record with the shared local mirror in
 * api/_lib/rtdb.js as a zero-config fallback (so the panel is fully usable
 * even before RTDB rules are published).
 */

const ROOT = "panel";
const READ_TTL = 900;

const CACHE = new Map();

function nowIso() {
  return new Date().toISOString();
}

export function orderId() {
  return "BW" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
}

function asList(node) {
  if (!node || typeof node !== "object") return [];
  return Array.isArray(node) ? node.filter(Boolean) : Object.values(node).filter(Boolean);
}

function sortByCreated(list) {
  return [...list].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

async function readNode(path, ttl = READ_TTL) {
  const cacheKey = `${ROOT}/${path}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.ts < ttl) return hit.val;
  const val = await rtdbGet(`${ROOT}/${path}`, { ttlMs: ttl });
  CACHE.set(cacheKey, { ts: Date.now(), val });
  return val;
}

async function writeNode(path, value) {
  // Invalidate this node AND every ancestor list (e.g. writing trials/<user>
  // must invalidate the cached `trials` collection used by abuse guards).
  const full = `${ROOT}/${path}`;
  for (const key of [...CACHE.keys()]) {
    if (key === full || full.startsWith(key + "/") || key.startsWith(full + "/")) CACHE.delete(key);
  }
  const ok = await rtdbSet(`${ROOT}/${path}`, value);
  return ok;
}

export function clearPanelCache() {
  CACHE.clear();
}

/* ================================ ORDERS ================================ */

export async function listOrders() {
  return sortByCreated(asList(await readNode("orders", 500)));
}

export async function getOrder(id) {
  if (!id) return null;
  const all = await listOrders();
  return all.find((o) => o.id === id || o.txnId === id) || null;
}

export async function createOrder(input = {}) {
  const plan = getPlan(input.planId) || PLANS[1];
  const audience = input.audience === "reseller" ? "reseller" : "direct";
  const quantity = Math.max(1, Math.min(500, Number(input.quantity) || 1));
  const unit = audience === "reseller" ? plan.reseller : plan.direct;
  const id = orderId();

  const order = {
    id,
    kind: input.kind === "credits" ? "credits" : plan.id === "trial-1d" ? "trial" : "subscription",
    audience,
    planId: plan.id,
    planName: plan.name,
    months: plan.months,
    days: plan.days,
    quantity,
    unitPrice: unit,
    total: unit * quantity,
    currency: PANEL.currency,
    name: String(input.name || "").trim().slice(0, 80),
    email: String(input.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(input.whatsapp || "").trim().slice(0, 30),
    username: String(input.username || "").trim().toLowerCase().slice(0, 40),
    resellerCode: String(input.resellerCode || "").trim().toUpperCase().slice(0, 24),
    txnId: String(input.txnId || "").trim().slice(0, 60),
    proofDataUrl: typeof input.proofDataUrl === "string" ? input.proofDataUrl.slice(0, 260_000) : "",
    note: String(input.note || "").trim().slice(0, 500),
    status: "pending",
    paymentMethod: PANEL.currency === "PKR" ? "JazzCash" : "JazzCash",
    paymentNumber: PANEL.supportPhoneDisplay,
    createdAt: nowIso(),
    reviewedAt: "",
    reviewedBy: ""
  };

  await writeNode(`orders/${id}`, order);
  await pushAudit("order.created", { id, total: order.total, planId: plan.id, audience });
  return order;
}

export async function updateOrder(id, patch = {}) {
  const order = await getOrder(id);
  if (!order) return null;
  const updated = { ...order, ...patch, reviewedAt: nowIso() };
  await writeNode(`orders/${order.id}`, updated);
  return updated;
}

/* =============================== RESELLERS =============================== */

export async function listResellers() {
  return sortByCreated(asList(await readNode("resellers", 800)));
}

export async function getResellerByCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  const all = await listResellers();
  return all.find((r) => r.code === clean) || null;
}

export async function getResellerByApiKey(apiKey) {
  const clean = String(apiKey || "").trim();
  if (!clean) return null;
  const all = await listResellers();
  return all.find((r) => r.apiKey === clean) || null;
}

export async function createReseller(input = {}) {
  const code = "RS-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const credits = Math.max(0, Number(input.credits) || 0);
  const reseller = {
    code,
    name: String(input.name || "New Dealer").trim().slice(0, 80),
    email: String(input.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(input.whatsapp || "").trim().slice(0, 30),
    city: String(input.city || "").trim().slice(0, 60),
    tier: String(input.tier || "starter"),
    credits,
    creditsUsed: 0,
    pricePerUser: Number(input.pricePerUser) || PANEL.resellerPerUserMonthly,
    status: input.status === "suspended" ? "suspended" : "active",
    apiKey: generateResellerApiKey(),
    licenseKey: generateLicenseKey("RS"),
    licenseHash: "",
    customDomain: String(input.customDomain || "").trim().slice(0, 80),
    createdAt: nowIso(),
    lastLoginAt: ""
  };
  reseller.licenseHash = hashLicenseKey(reseller.licenseKey);
  await writeNode(`resellers/${code}`, reseller);
  await pushAudit("reseller.created", { code, name: reseller.name, credits });
  return reseller;
}

export async function updateReseller(code, patch = {}) {
  const reseller = await getResellerByCode(code);
  if (!reseller) return null;
  const updated = { ...reseller, ...patch, code: reseller.code };
  await writeNode(`resellers/${reseller.code}`, updated);
  return updated;
}

export async function topUpCredits(code, amount = 0) {
  const reseller = await getResellerByCode(code);
  if (!reseller) return null;
  const add = Math.max(0, Number(amount) || 0);
  return updateReseller(code, { credits: Number(reseller.credits || 0) + add });
}

/* ================================ CLIENTS ================================ */

export async function listClients(filter = {}) {
  const all = sortByCreated(asList(await readNode("clients", 700))).map(normalizeClient);
  if (filter.resellerCode) {
    return all.filter((c) => c.resellerCode === String(filter.resellerCode).toUpperCase());
  }
  if (filter.email) {
    return all.filter((c) => c.email === String(filter.email).toLowerCase());
  }
  return all;
}

export function normalizeClient(client) {
  const exp = Number(client?.expDate || 0);
  const expired = exp > 0 && Date.now() / 1000 > exp;
  return {
    ...client,
    status: client?.status === "suspended" ? "suspended" : expired ? "expired" : client?.status || "active",
    daysLeft: exp ? Math.max(0, Math.ceil((exp - Date.now() / 1000) / 86400)) : 0,
    planLabel: (getPlan(client?.planId) || {}).name || "Custom"
  };
}

export async function getClient(username) {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return null;
  const all = await listClients();
  return all.find((c) => c.username === clean) || null;
}

export async function createClient(input = {}) {
  const plan = getPlan(input.planId) || PLANS[1];
  const username = (
    String(input.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    "bw" + crypto.randomBytes(3).toString("hex")
  ).slice(0, 24);
  const password = String(input.password || "").trim() || generateXtreamPassword(10);
  const days = Number(input.days) || plan.days || 30;
  const startTs = Number(input.startTs) || Math.floor(Date.now() / 1000);
  const client = {
    username,
    password,
    email: String(input.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(input.whatsapp || "").trim().slice(0, 30),
    resellerCode: String(input.resellerCode || "").trim().toUpperCase(),
    ownerUid: String(input.ownerUid || ""),
    planId: plan.id,
    plan: plan.id === "trial-1d" ? "pro" : String(input.plan || "pro"),
    tier: "pro",
    status: "active",
    devices: Math.max(1, Number(input.devices) || plan.devices || 1),
    mac: String(input.mac || "").trim(),
    startDate: startTs,
    expDate: startTs + days * 86400,
    createdAt: nowIso(),
    source: String(input.source || "panel").slice(0, 40),
    orderId: String(input.orderId || ""),
    note: String(input.note || "").slice(0, 300)
  };
  await writeNode(`clients/${username}`, client);
  // Mirror into the Xtream accounts node so IPTV players pick it up instantly.
  await rtdbSet(`xtreamAccounts/${username}`, {
    username,
    password,
    uid: client.ownerUid || client.resellerCode || "panel",
    displayName: input.displayName || username,
    plan: client.plan,
    planId: client.planId,
    status: "Active",
    tier: "pro",
    maxConnections: client.devices,
    resellerCode: client.resellerCode,
    mac: client.mac,
    expDate: client.expDate,
    createdAt: client.createdAt
  });
  await pushAudit("client.created", { username, planId: plan.id, resellerCode: client.resellerCode });
  return client;
}

export async function updateClient(username, patch = {}) {
  const client = await getClient(username);
  if (!client) return null;
  const updated = { ...client, ...patch, username: client.username };
  delete updated.daysLeft;
  delete updated.planLabel;
  await writeNode(`clients/${client.username}`, updated);
  await rtdbSet(`xtreamAccounts/${client.username}`, {
    username: client.username,
    password: updated.password || client.password,
    uid: updated.ownerUid || updated.resellerCode || "panel",
    displayName: updated.username,
    plan: updated.plan || "pro",
    planId: updated.planId || "monthly",
    status: String(updated.status || "active").toLowerCase() === "suspended" ? "Suspended" : "Active",
    tier: "pro",
    maxConnections: Number(updated.devices) || 1,
    resellerCode: updated.resellerCode || "",
    mac: updated.mac || "",
    expDate: Number(updated.expDate) || 0,
    createdAt: updated.createdAt
  });
  return normalizeClient(updated);
}

export async function renewClient(username, { planId = "monthly", resellerCode = "", consumeCredit = false } = {}) {
  const plan = getPlan(planId) || PLANS[1];
  const client = await getClient(username);
  if (!client) return null;
  const base = Math.max(Number(client.expDate || 0), Math.floor(Date.now() / 1000));
  const updated = await updateClient(username, {
    expDate: base + (Number(plan.days) || 30) * 86400,
    planId: plan.id,
    plan: "pro",
    status: "active"
  });
  if (consumeCredit) {
    const reseller = await getResellerByCode(resellerCode || client.resellerCode);
    if (reseller) {
      await updateReseller(reseller.code, {
        credits: Math.max(0, Number(reseller.credits || 0) - 1),
        creditsUsed: Number(reseller.creditsUsed || 0) + 1
      });
    }
  }
  await pushAudit("client.renewed", { username, planId: plan.id });
  return updated;
}

export async function suspendClient(username, suspended = true) {
  return updateClient(username, { status: suspended ? "suspended" : "active" });
}

/* ================================ TRIALS ================================ */

export async function claimTrial({ email = "", deviceId = "", whatsapp = "" } = {}) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanDevice = String(deviceId || "").trim().slice(0, 64);
  clearPanelCache();
  const trials = asList(await readNode("trials", 400));
  const fingerprint = sha256(`${cleanEmail}|${cleanDevice}`).slice(0, 32);
  const existing = trials.find((t) => t.fingerprint === fingerprint && Number(t.expDate) > Date.now() / 1000);
  if (existing) {
    return { ok: false, reason: "already_active", trial: existing };
  }
  const used = trials.find((t) => (cleanEmail && t.email === cleanEmail) || (cleanDevice && t.deviceId === cleanDevice));
  if (used) {
    return { ok: false, reason: "trial_used", trial: used };
  }

  const days = PANEL.trialDays;
  const start = Math.floor(Date.now() / 1000);
  const username =
    "tr" +
    crypto
      .createHash("sha1")
      .update(`${cleanEmail}|${cleanDevice}|${Date.now()}`)
      .digest("hex")
      .slice(0, 8);
  const trial = {
    username,
    password: generateXtreamPassword(8),
    email: cleanEmail,
    whatsapp: String(whatsapp || "").slice(0, 30),
    deviceId: cleanDevice,
    fingerprint,
    planId: "trial-1d",
    days,
    startDate: start,
    expDate: start + days * 86400,
    status: "active",
    createdAt: nowIso(),
    source: "self-serve-trial"
  };
  await writeNode(`trials/${username}`, trial);
  await createClient({
    username,
    password: trial.password,
    email: cleanEmail,
    whatsapp,
    planId: "trial-1d",
    days,
    devices: 1,
    source: "trial",
    note: "1-day free PRO trial"
  });
  await pushAudit("trial.claimed", { username, email: cleanEmail });
  return { ok: true, trial };
}

export async function listTrials() {
  return sortByCreated(asList(await readNode("trials", 800)));
}

/* ================================ ANALYTICS ================================ */

export async function getAnalytics() {
  const [orders, resellers, clients, trials] = await Promise.all([
    listOrders(),
    listResellers(),
    listClients(),
    listTrials()
  ]);

  const paid = orders.filter((o) => o.status === "approved");
  const pending = orders.filter((o) => o.status === "pending");
  const revenue = paid.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const revenueByPlan = {};
  for (const o of paid) {
    revenueByPlan[o.planId] = (revenueByPlan[o.planId] || 0) + Number(o.total || 0);
  }
  const activeClients = clients.filter((c) => c.status === "active");
  const expiringSoon = clients.filter((c) => c.status === "active" && c.daysLeft <= 3);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    last7.push({
      day,
      orders: orders.filter((o) => String(o.createdAt || "").slice(0, 10) === day).length,
      revenue: paid
        .filter((o) => String(o.createdAt || "").slice(0, 10) === day)
        .reduce((s, o) => s + Number(o.total || 0), 0)
    });
  }

  return {
    ok: true,
    generatedAt: nowIso(),
    currency: PANEL.currency,
    totals: {
      orders: orders.length,
      pendingOrders: pending.length,
      approvedOrders: paid.length,
      revenue,
      resellers: resellers.length,
      activeResellers: resellers.filter((r) => r.status === "active").length,
      clients: clients.length,
      activeClients: activeClients.length,
      expiringSoon: expiringSoon.length,
      trials: trials.length,
      creditsLiability: resellers.reduce((s, r) => s + Number(r.credits || 0), 0)
    },
    revenueByPlan,
    last7,
    pendingOrders: pending.slice(0, 25),
    expiringSoon: expiringSoon.slice(0, 25),
    topResellers: resellers
      .map((r) => ({ code: r.code, name: r.name, credits: r.credits, used: r.creditsUsed || 0 }))
      .sort((a, b) => Number(b.used) - Number(a.used))
      .slice(0, 10)
  };
}

/* ================================= AUDIT ================================= */

export async function pushAudit(action, detail = {}) {
  const id = "a" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const entry = { id, action, detail, at: nowIso() };
  try {
    await writeNode(`audit/${id}`, entry);
  } catch {
    // audit must never break the request path
  }
  return entry;
}

export async function listAudit(limit = 60) {
  const list = sortByCreated(asList(await readNode("audit", 400)));
  return list.slice(0, limit);
}

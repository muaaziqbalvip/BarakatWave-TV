#!/usr/bin/env node
/**
 * BarakatWave TV — Real browser boot smoke test (jsdom)
 * -------------------------------------------------------------------------
 * Loads the real HTML page and actually imports the real ES-module entry point
 * with a real DOM attached as globals. Catches what a static link check cannot:
 * missing DOM ids, broken event wiring, exceptions thrown during init, and
 * console errors/warnings raised while the app boots.
 *
 * Each page runs in its own child process so the DOM globals are never mixed.
 * Usage: node scripts/smoke-dom.mjs [--verbose]
 * Requires: npm i --no-save jsdom   (exits 0 with a notice when absent)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGES = {
  site: { html: "public/index.html", entry: "public/assets/js/app.js" },
  admin: { html: "public/admin.html", entry: "public/assets/js/admin.js", deep: true },
  panel: { html: "public/reseller.html", entry: "public/assets/js/panel.js", deep: true },
  beacon: { html: "public/index.html", entry: "public/assets/js/error-beacon.js", script: true, deep: true }
};

const pageArg = process.argv.find((a) => a.startsWith("--page="));

async function runOne(name) {
  const page = PAGES[name];
  const { JSDOM, VirtualConsole } = await import("jsdom");
  const html = fs.readFileSync(path.join(ROOT, page.html), "utf8");
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(`dom: ${e.message}`));
  virtualConsole.on("error", (...a) => errors.push(`console.error: ${a.join(" ")}`));

  const dom = new JSDOM(html, {
    url: `https://barakatwave.vercel.app/${page.html.split("/").pop()}`,
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  const posts = [];

  // Attach the DOM the way a browser would.
  const names = [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "KeyboardEvent",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
    "URL",
    "URLSearchParams",
    "Blob",
    "FormData"
  ];
  const saved = {};
  for (const n of names) {
    saved[n] = globalThis[n];
    try {
      Object.defineProperty(globalThis, n, {
        value: window[n],
        configurable: true,
        writable: true
      });
    } catch {
      /* read-only globals (navigator) keep Node's own value */
    }
  }
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  if ("sendBeacon" in window.navigator) delete window.navigator.sendBeacon;
  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    let body = {};
    if (/\/api\//.test(u)) {
      let action = "";
      try {
        action = JSON.parse(opts.body || "{}").action || "";
      } catch {
        action = "";
      }
      if (!action) action = new URL(u, "https://x.test").searchParams.get("action") || "";
      if (/\/api\/analytics/.test(u)) body = analyticsSnapshot();
      else body = mockPanel(action);
      posts.push({ url: u, body: opts.body || "" });
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => body,
      text: async () => JSON.stringify(body),
      clone() {
        return this;
      }
    };
  };
  globalThis.fetch = window.fetch;

  if (page.deep && (name === "panel" || name === "admin")) {
    // Deep run: pretend an owner PIN session exists so the admin UI really renders.
    window.localStorage.setItem(
      "bw_admin_session",
      JSON.stringify({ token: "smoke-token", exp: Math.floor(Date.now() / 1000) + 3600, label: "Smoke" })
    );
  }

  // Firebase opens a real WebSocket; offline sandbox must not crash the boot.
  class StubSocket {
    constructor() {
      this.readyState = 0;
      setTimeout(() => this.onerror && this.onerror({ type: "error" }), 5);
      setTimeout(() => this.onclose && this.onclose({ type: "close", code: 1006 }), 10);
    }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    set onopen(v) {}
    set onmessage(v) {}
  }
  window.WebSocket = StubSocket;
  globalThis.WebSocket = StubSocket;

  let booted = false;
  try {
    if (page.script) {
      // Classic script (beacon) — run it in the page context exactly like a <script>.
      window.eval(fs.readFileSync(path.join(ROOT, page.entry), "utf8"));
    } else {
      await import(`${pathToFileURL(path.join(ROOT, page.entry)).href}?smoke=${name}`);
    }
    booted = true;
  } catch (err) {
    errors.push(`import threw: ${err?.message || err}`);
  }
  await new Promise((r) => setTimeout(r, 400));

  const bootFlag = page.script ? true : window.__BW_BOOTED === true;
  let deep = { ok: true, note: "" };
  if (name === "panel") deep = await runDeep(window, errors);
  if (name === "admin") deep = await runAdminDeep(window);
  if (name === "beacon") deep = await runBeacon(window, posts);
  const ignore =
    /Not implemented:|Could not parse CSS|firebase|Firebase|NetworkError|Failed to fetch|WebSocket|CORS|denied by/;
  const real = errors.filter((e) => !ignore.test(e));

  for (const n of names) {
    try {
      Object.defineProperty(globalThis, n, { value: saved[n], configurable: true, writable: true });
    } catch {
      /* ignore */
    }
  }
  window.close();

  const ok = booted && bootFlag && real.length === 0 && deep.ok;
  console.log(
    `${ok ? "✅" : "❌"} ${name} — booted=${booted} flag=${bootFlag} errors=${real.length}${
      deep.note ? ` — ${deep.note}` : ""
    }`
  );
  for (const e of real.slice(0, 8)) console.log(`    - ${e}`);
  return { ok, real, booted, bootFlag };
}

const SETTINGS = {
  owner: { whatsapp: "03062015326" },
  pricing: { connectionFee: 50, monthly: 300, quarterly: 800, yearly: 2800 },
  jazzcash: { number: "03062015326", name: "Muaaz Iqbal" }
};

function analyticsSnapshot() {
  return {
    ok: true,
    generatedPkt: "01 Nov 2026, 10:05 PM",
    summary: {
      onlineNow: 3,
      totalSessions: 51,
      uniqueIps: 31,
      totalPlays: 120,
      webPlays: 70,
      iptvPlays: 50,
      avgSessionSec: 600,
      totalWatchSec: 40000
    },
    breakdowns: {
      countries: [{ label: "Pakistan", count: 40 }],
      cities: [{ label: "Lahore", count: 20 }],
      devices: [{ label: "Android", count: 30 }],
      browsers: [{ label: "Chrome", count: 25 }],
      topWatched: [{ label: "Geo News", count: 14 }]
    },
    sessions: [],
    plays: [],
    errors: { count: 7, unique: 3, latest: [] },
    errorList: [
      {
        message: "Smoke boom from player",
        app: "site",
        route: "/",
        source: "/assets/js/app.js",
        browser: "Chrome",
        deviceType: "mobile",
        count: 4,
        lastSeenPkt: "01 Nov 2026, 09:50 PM",
        stack: "Error: Smoke boom\n  at playChannel (app.js:120)"
      }
    ]
  };
}

function mockPanel(action) {
  const reseller = {
    code: "RS-SMOKE",
    name: "Smoke Dealer",
    brandName: "Smoke IPTV",
    whatsapp: "03001234567",
    email: "smoke@test.com",
    status: "active",
    apiKey: "bwr_smoketoken0001",
    credits: 12,
    creditsUsed: 3,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    selfServe: true,
    pricing: { connectionFee: 50, monthly: 300, quarterly: 800, yearly: 2800 },
    clients: 1,
    activeClients: 1,
    expiredClients: 0,
    macClients: 1,
    collected: 2500
  };
  const client = {
    username: "smoke01",
    password: "SMOKE123",
    mac: "00:1A:79:AA:BB:CC",
    status: "active",
    expDate: new Date().toISOString(),
    expiresPkt: "01 Jan 2027",
    expiresAt: Date.now() + 86400000 * 30,
    links: {
      m3u: "https://barakatwave.vercel.app/api/m3u/smoke01/SMOKE123.m3u8",
      epg: "https://barakatwave.vercel.app/api/epg.xml",
      xtream: { host: "barakatwave.vercel.app", port: 443, username: "smoke01", password: "SMOKE123" },
      stalker: { portalUrl: "https://barakatwave.vercel.app/c/", mac: "00:1A:79:AA:BB:CC" }
    }
  };
  const map = {
    "admin/me": { ok: true, admin: { label: "Owner (PIN)" } },
    "admin/analytics": {
      ok: true,
      resellers: 1,
      clients: 1,
      revenue: 2500,
      live: {
        summary: { onlineNow: 2, totalSessions: 40, totalPlays: 90, uniqueIps: 25, avgSessionSec: 480, iptvPlays: 60, webPlays: 30 },
        breakdowns: {
          countries: [{ label: "Pakistan", count: 30 }],
          devices: [{ label: "Android", count: 20 }],
          topWatched: [{ label: "Geo News", count: 12 }],
          protocols: [{ label: "HLS", count: 40 }]
        },
        sessions: [{ isOnline: true, countryLabel: "Pakistan", deviceType: "Android", currentView: "live" }],
        generatedPkt: "01 Nov 2026, 10:00 PM"
      },
      errors: { count: 3, unique: 2, latest: [{ message: "Boom", count: 2, app: "site", route: "/", source: "app.js", lastSeenPkt: "1 Nov" }] }
    },
    "admin/orders": { ok: true, orders: [] },
    "admin/resellers": { ok: true, resellers: [reseller] },
    "admin/clients": { ok: true, clients: [client] },
    "admin/audit": { ok: true, audit: [{ at: new Date().toISOString(), action: "admin/login", label: "Owner" }] },
    "admin/payments": { ok: true, total: 2500, count: 2, payments: [{ resellerCode: "RS-SMOKE", amount: 1500, username: "smoke01" }] },
    "admin/reseller-detail": {
      ok: true,
      reseller,
      stats: { clients: 1, active: 1, expired: 0, suspended: 0, expiringSoon: 0 },
      finance: { revenue: 2500, profit: 900 },
      payments: [{ amount: 1500, months: 1, username: "smoke01", via: "jazzcash", createdAt: new Date().toISOString() }],
      clients: [client]
    },
    "admin/config": { ok: true, settings: SETTINGS },
    "public/config": { ok: true, settings: SETTINGS }
  };
  return map[action] || { ok: true };
}

async function runDeep(window, errors) {
  const doc = window.document;
  const fail = (m) => ({ ok: false, note: m });
  try {
    await new Promise((r) => setTimeout(r, 250));

    const live = doc.getElementById("liveStatsMini");
    if (!live || !/online|Online/i.test(live.textContent)) return fail("live analytics card not painted");

    const errBox = doc.getElementById("errorList");
    if (!errBox || !/Boom/.test(errBox.textContent)) return fail("error list not painted");

    const row = doc.querySelector("#resellersTable tbody tr");
    if (!row || !/RS-SMOKE/.test(row.textContent)) return fail("reseller row not painted");
    if (!/NEW/.test(row.textContent)) return fail("NEW badge missing for fresh reseller");
    if (!/Detail/.test(row.textContent)) return fail("Detail button missing");

    const btn = row.querySelector("button[data-reseller-view]");
    if (!btn) return fail("data-reseller-view missing");
    btn.click();
    await new Promise((r) => setTimeout(r, 300));

    const card = doc.getElementById("resellerDetailCard");
    if (!card || card.hidden) return fail("reseller detail card did not open");
    const info = doc.getElementById("rdInfo").textContent;
    for (const needle of ["Smoke", "API key", "300"]) {
      if (!info.includes(needle)) return fail(`detail info missing "${needle}"`);
    }
    const tbody = doc.querySelector("#rdClientsTable tbody");
    if (!tbody || !/00:1A:79/.test(tbody.textContent)) return fail("MAC / portal not shown in clients table");
    if (!/\/c\//.test(tbody.textContent)) return fail("stalker portal URL missing in clients table");
    const btns = tbody ? [...tbody.querySelectorAll("button[data-rd-copy]")] : [];
    if (btns.length < 3) return fail(`expected M3U/Xtream/MAC copy buttons, got ${btns.length}`);
    const kinds = btns.map((b) => b.dataset.rdCopy).join(",");
    if (!/m3u/.test(kinds) || !/xtream/.test(kinds) || !/mac/.test(kinds)) return fail(`copy buttons wrong: ${kinds}`);
    if (!/JazzCash|jazzcash/i.test(doc.getElementById("rdPayments").textContent)) return fail("payments not painted");

    doc.getElementById("rdCloseBtn").click();
    if (!card.hidden) return fail("close button did not hide the card");

    return { ok: true, note: "admin live+errors+reseller detail rendered" };
  } catch (err) {
    return fail(`deep check threw: ${err?.message || err}`);
  }
}

async function runBeacon(window, posts) {
  const fail = (m) => ({ ok: false, note: m });
  if (typeof window.bwReportError !== "function") return fail("window.bwReportError not exposed");
  window.dispatchEvent(
    new window.ErrorEvent("error", {
      message: "Smoke test boom",
      filename: "/assets/js/app.js",
      lineno: 42,
      colno: 7,
      error: new Error("Smoke test boom")
    })
  );
  await new Promise((r) => setTimeout(r, 200));
  const hit = posts.find((p) => /\/api\/analytics$/.test(p.url) && /"type":"error"/.test(p.body));
  if (!hit) return fail(`no error report POSTed (posts=${posts.length})`);
  let parsed = {};
  try {
    parsed = JSON.parse(hit.body);
  } catch {
    return fail("error report body is not JSON");
  }
  if (parsed.type !== "error") return fail(`wrong event type: ${parsed.type}`);
  for (const key of ["message", "route", "app", "source"]) {
    if (!(key in parsed)) return fail(`error report missing "${key}"`);
  }
  return { ok: true, note: "client error beacon reports to /api/analytics" };
}

async function runAdminDeep(window) {
  const doc = window.document;
  const fail = (m) => ({ ok: false, note: m });
  try {
    await new Promise((r) => setTimeout(r, 300));
    const tab = doc.querySelector('[data-adm-tab="analytics"], [data-tab="analytics"], a[href="#analytics"]');
    if (tab) tab.click();
    await new Promise((r) => setTimeout(r, 400));

    const online = doc.getElementById("anOnlineNow");
    if (!online || online.textContent.trim() === "0") return fail("analytics tiles not painted");

    const body = doc.getElementById("anErrorsBody");
    if (!body || !/Smoke boom from player/.test(body.textContent)) return fail("studio error table not painted");
    const total = doc.getElementById("anErrorTotal");
    if (!total || total.textContent.trim() !== "7") return fail("error total not painted");

    return { ok: true, note: "studio analytics + error table rendered" };
  } catch (err) {
    return fail(`admin deep check threw: ${err?.message || err}`);
  }
}

if (pageArg) {
  const { ok } = await runOne(pageArg.split("=")[1]);
  process.exit(ok ? 0 : 1);
}

// Parent: verify jsdom is available once, then isolate each page.
try {
  await import("jsdom");
} catch {
  console.log("⚠️  jsdom not installed — run: npm i --no-save jsdom");
  process.exit(0);
}

let failed = 0;
for (const name of Object.keys(PAGES)) {
  const res = spawnSync(process.execPath, [import.meta.filename, `--page=${name}`], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000
  });
  process.stdout.write(res.stdout || "");
  if (res.stderr && res.status !== 0) process.stderr.write(res.stderr.split("\n").slice(0, 12).join("\n") + "\n");
  if (res.status !== 0) failed++;
}
if (failed) {
  console.error(`\n❌ ${failed} page(s) failed the DOM smoke test.`);
  process.exit(1);
}
console.log("✅ All pages boot cleanly in a real DOM.");

import { getCanonicalBaseUrl, handleOptions, sendText } from "../_lib/origin.js";
import { getSettings } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";
import {
  FEATURE_MATRIX,
  KEYWORDS,
  PANEL,
  PAYMENT,
  PLANS,
  RESELLER_TIERS
} from "../../data/panel.js";
import { legalShell } from "./legal.js";

/**
 * BarakatWave TV — Server-rendered Pricing, Payment & Reseller page.
 * Route: /pricing  (also /plans, /packages, /jazzcash)
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FAQS = [
  {
    q: "How much does BarakatWave TV cost in Pakistan?",
    a: "Direct clients pay PKR 200 per user per month. Authorized resellers pay PKR 100 per user per month (5+ credits), with volume slabs down to PKR 85 for 100+ credits. A 1-day PRO trial is always free."
  },
  {
    q: "How do I pay with JazzCash?",
    a: "Send the package amount to JazzCash 0306-2015326 (Account Title: Muaaz Iqbal), then send the payment screenshot on WhatsApp 0306-2015326 with your username. Our team reviews it and activates PRO, usually within 30 minutes."
  },
  {
    q: "Is there a free trial?",
    a: "Yes — claim a 1-day free PRO trial from the pricing page. You get the same PRO channel list, M3U link and Xtream credentials so you can test your device before paying."
  },
  {
    q: "Which IPTV player is recommended?",
    a: "Siravex (siravex.vercel.app) is our recommended web player. On Android TV, Firestick and phones use IPTV Smarters Pro or TiviMate. On PC use VLC. MAG boxes can use the MAC portal."
  },
  {
    q: "Can I become a reseller and sell IPTV in Pakistan or India?",
    a: "Yes. Buy a minimum of 5 credits at PKR 100 each, create clients from the reseller panel, and charge your own price. The retail floor is PKR 200 per user per month."
  },
  {
    q: "Do the links expire or can they be leaked?",
    a: "Every playback link is signed with HMAC-SHA256 and expires automatically in minutes. Leaked URLs stop working, and per-account connection limits block fan-out abuse."
  }
];

function planCard(plan, audience) {
  const price = audience === "reseller" ? plan.reseller : plan.direct;
  const strike = audience === "direct" && plan.reseller > 0 ? plan.reseller : 0;
  return `
    <div class="plan-card glass-card${plan.badge === "POPULAR" ? " plan-popular" : ""}">
      <div class="plan-head">
        <span class="badge badge-gold">${esc(plan.badge)}</span>
        <h3>${esc(plan.name)}</h3>
        <p class="muted-sm" style="margin:2px 0 10px;">${esc(plan.urdu)} &bull; ${plan.days} days</p>
      </div>
      <div class="plan-price">
        <span class="plan-amount">${price === 0 ? "FREE" : "Rs " + price}</span>
        ${strike ? `<span class="plan-strike">Rs ${strike}</span>` : ""}
        <span class="plan-unit">${price === 0 ? "no payment" : "per user / " + (plan.months === 1 ? "month" : plan.months + " months")}</span>
      </div>
      <ul class="plan-features">
        ${plan.features.map((f) => `<li>✅ ${esc(f)}</li>`).join("")}
      </ul>
      <a class="btn btn-primary" style="width:100%;" href="/reseller#order?plan=${encodeURIComponent(plan.id)}&audience=${audience}">
        ${plan.id === "trial-1d" ? "🎁 Claim Free Trial" : "Buy " + esc(plan.name)}
      </a>
      <p class="muted-sm" style="margin:8px 0 0;">Devices: ${plan.devices} &bull; ${esc(plan.tagline)}</p>
    </div>`;
}

function renderPage(siteUrl, settings, audience) {
  const canonicalUrl = `${siteUrl}/pricing`;
  const pretty = (v) => (v === true ? "✅" : v === false ? "—" : esc(v));

  const body = `
    <p class="muted-sm" style="margin:0;letter-spacing:.14em;font-weight:900;">PRICING &bull; PACKAGES &bull; JAZZCASH</p>
    <h1 style="margin-top:6px;">BarakatWave TV IPTV Packages — PKR 200 Direct, PKR 100 Reseller</h1>
    <p style="max-width:70ch;">
      One transparent price list for Pakistan and India. Direct clients pay <strong>PKR 200 per user per month</strong>,
      authorized resellers pay <strong>PKR 100 per user per month</strong>, and every new customer can test the full
      PRO channel line-up free for <strong>1 day</strong>.
    </p>

    <div class="audience-toggle">
      <a class="audience-btn${audience === "direct" ? " active" : ""}" href="/pricing?audience=direct">👤 Direct Client — Rs 200 / month</a>
      <a class="audience-btn${audience === "reseller" ? " active" : ""}" href="/pricing?audience=reseller">🏪 Reseller — Rs 100 / month</a>
    </div>

    <div class="plan-grid">
      ${PLANS.map((p) => planCard(p, audience)).join("")}
    </div>

    <h2>Reseller Dealer Slabs</h2>
    <p class="muted-sm">Credits never expire. Each credit = 1 user for 30 days. Buy more, pay less.</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Dealer tier</th><th>Min credits</th><th>Rate / user / month</th><th>Perks</th></tr></thead>
        <tbody>
          ${RESELLER_TIERS.map(
            (t) => `<tr>
              <td><strong>${esc(t.name)}</strong></td>
              <td>${t.minCredits}</td>
              <td>Rs ${t.unitPrice} <span class="muted-sm">(${esc(t.discountNote)})</span></td>
              <td>${t.perks.map(esc).join(" &bull; ")}</td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>

    <h2>JazzCash Payment Guide</h2>
    <div class="payment-box glass-card">
      <div class="payment-head">
        <div>
          <p class="muted-sm" style="margin:0;">Send payment to</p>
          <p style="margin:2px 0;font-size:1.45rem;font-weight:900;letter-spacing:.04em;">${esc(PAYMENT.accountNumber)}</p>
          <p class="muted-sm" style="margin:0;">${esc(PAYMENT.method)} &bull; ${esc(PAYMENT.accountTitle)} &bull; ${esc(PAYMENT.accountNumberIntl)}</p>
        </div>
        <a class="btn btn-primary" href="${esc(PAYMENT.whatsappProof)}" target="_blank" rel="noopener">📲 Send Screenshot</a>
      </div>
      <ol class="payment-steps">
        ${PAYMENT.steps.map((s) => `<li><strong>${esc(s.title)}</strong><br /><span class="muted-sm">${esc(s.detail)}</span></li>`).join("")}
      </ol>
      <ul class="muted-sm" style="margin:0;padding-left:18px;">
        ${PAYMENT.notes.map((n) => `<li>${esc(n)}</li>`).join("")}
      </ul>
    </div>

    <h2>Free vs PRO vs Reseller — Full Feature Matrix</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Feature</th><th>Free</th><th>PRO</th><th>Reseller</th></tr></thead>
        <tbody>
          ${FEATURE_MATRIX.map(
            (f) => `<tr><td>${esc(f.feature)}</td><td>${pretty(f.free)}</td><td>${pretty(f.pro)}</td><td>${pretty(f.reseller)}</td></tr>`
          ).join("")}
        </tbody>
      </table>
    </div>

    <h2>What is inside every PRO plan?</h2>
    <ul>
      <li>Live HD &amp; 4K channels for Pakistan, India, Islamic, Sports, News, Kids and World categories.</li>
      <li>IMDb Movies &amp; Series VOD library with posters, ratings and episodes.</li>
      <li>Xtream Codes login (host + username + password) for Siravex, IPTV Smarters, TiviMate, XCIPTV, OTT Navigator and VLC.</li>
      <li>M3U Plus playlist link and XMLTV EPG link that you can refresh anytime.</li>
      <li>Signed anti-leech stream URLs, connection limits and standby broadcast when an upstream feed dies.</li>
      <li>WhatsApp priority support on 0306-2015326 and free MAC/device resets on longer plans.</li>
    </ul>

    <h2>Popular searches people use to find us</h2>
    <div class="keyword-cloud">
      ${[...KEYWORDS.core, ...KEYWORDS.longTail].map((k) => `<span class="keyword-chip">${esc(k)}</span>`).join("")}
    </div>

    <h2>Frequently asked questions</h2>
    <div class="faq-list">
      ${FAQS.map(
        (f) => `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`
      ).join("")}
    </div>

    <div class="cta-band glass-card">
      <div>
        <strong>Ready to start?</strong>
        <p class="muted-sm" style="margin:4px 0 0;">Claim the free 1-day PRO trial, or open the reseller panel to sell at PKR 200 and buy at PKR 100.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="/reseller">🏪 Open Reseller Panel</a>
        <a class="btn btn-gold" href="${esc(PANEL.supportWhatsapp)}" target="_blank" rel="noopener">📲 WhatsApp ${esc(PANEL.supportPhoneDisplay)}</a>
      </div>
    </div>
  `;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "BarakatWave TV PRO IPTV Subscription",
      description:
        "BarakatWave TV PRO IPTV subscription by Muaaz Iqbal (Mizanora Projects) with HD/4K live channels, IMDb VOD, Xtream Codes login and EPG. PKR 200 per month direct, PKR 100 per month for resellers.",
      brand: { "@type": "Brand", name: BRAND.name },
      url: canonicalUrl,
      image: BRAND.logoPrimary,
      offers: PLANS.filter((p) => p.direct > 0).map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.direct,
        priceCurrency: "PKR",
        availability: "https://schema.org/InStock",
        url: `${canonicalUrl}#${p.id}`
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a }
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Pricing", item: canonicalUrl }
      ]
    }
  ];

  return legalShell({
    title: `IPTV Pricing Pakistan & India — Rs 200/Month, Reseller Rs 100 | ${BRAND.name}`,
    description:
      "BarakatWave TV IPTV pricing: PKR 200 per user per month for direct clients, PKR 100 per user per month for resellers, free 1-day PRO trial, JazzCash 0306-2015326 payment guide and full feature matrix.",
    canonicalUrl,
    settings,
    bodyHtml: body,
    jsonLd,
    activeSlug: ""
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const url = new URL(req.url || "/", "http://localhost");
  const audience = url.searchParams.get("audience") === "reseller" ? "reseller" : "direct";
  const siteUrl = getCanonicalBaseUrl();
  const settings = await getSettings();
  return sendText(res, 200, renderPage(siteUrl, settings, audience), "text/html; charset=utf-8", "public, max-age=300");
}

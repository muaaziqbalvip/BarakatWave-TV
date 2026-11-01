import { getCanonicalBaseUrl, handleOptions, parseQuery, sendText } from "../_lib/origin.js";
import { getSettings } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";
import { LEGAL_DOCS, PANEL, PAYMENT } from "../../data/panel.js";

/**
 * BarakatWave TV — Server-rendered Legal, Policy & Founder pages.
 * Routes: /terms, /privacy, /license, /refund-policy, /reseller-agreement,
 *         /dmca, /about-founder, /legal (index)
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FOUNDER_PHOTOS = [
  "/assets/img/founder/muaaz-iqbal-official.jpg",
  "/assets/img/founder/muaaz-iqbal-portrait.jpg",
  "/assets/img/founder/muaaz-iqbal-kasur-minar.jpg"
];

export function legalShell({ title, description, canonicalUrl, settings, bodyHtml, jsonLd, activeSlug, ogImage = "" }) {
  const gsc = settings.gscVerification || process.env.GOOGLE_SITE_VERIFICATION || "";
  const bing = settings.bingVerification || process.env.BING_SITE_VERIFICATION || "";
  const nav = LEGAL_DOCS.map(
    (d) =>
      `<a class="legal-nav-link${d.slug === activeSlug ? " active" : ""}" href="/legal/${d.slug}">${esc(d.title)}</a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en" data-theme="daylight">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script>(function(){try{var s=localStorage.getItem("bw_theme");if(s)document.documentElement.setAttribute("data-theme",s);}catch(e){}})();</script>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="${esc(BRAND.founder)} — ${esc(BRAND.parentProject)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <meta name="keywords" content="${esc(activeSlug === "founder" ? "Muaaz Iqbal, Muaaz Iqbal Kasur, Mizanora Projects, BarakatWave TV founder, IPTV developer Pakistan, IPTV panel engineer" : `BarakatWave TV ${activeSlug === "legal" ? "policies" : activeSlug}, IPTV terms Pakistan, IPTV privacy policy, IPTV license, IPTV refund policy, reseller agreement, MAC IPTV, Xtream Codes`)}" />
  ${gsc ? `<meta name="google-site-verification" content="${esc(gsc)}" />` : ""}
  ${bing ? `<meta name="msvalidate.01" content="${esc(bing)}" />` : ""}
  <link rel="canonical" href="${esc(canonicalUrl)}" />
  <link rel="icon" type="image/png" href="${esc(BRAND.logoPrimary)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(BRAND.name)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta property="og:image" content="${esc(ogImage || BRAND.logoPrimary)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <link rel="stylesheet" href="/assets/css/panel.css" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand-link">
        <img src="${esc(BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='/assets/logo-fallback.svg';" alt="BarakatWave" class="brand-logo" />
        <div>
          <span class="brand-title">BarakatWave TV</span>
          <span class="brand-sub">${esc(BRAND.parentProject)} &bull; ${esc(BRAND.founder)}</span>
        </div>
      </a>
      <div class="header-actions">
        <a href="/pricing" class="btn btn-sm btn-primary">💳 Pricing</a>
        <a href="/reseller" class="btn btn-sm btn-outline">🏪 Reseller Panel</a>
        <a href="/" class="btn btn-sm btn-outline">📺 Live TV</a>
      </div>
    </div>
  </header>

  <main class="container" style="max-width:1080px;padding:26px 16px 60px;">
    <div class="legal-layout">
      <aside class="glass-card legal-sidebar">
        <p class="muted-sm" style="margin:0 0 8px;font-weight:800;letter-spacing:.08em;">LEGAL &amp; TRUST</p>
        ${nav}
        <a class="legal-nav-link" href="/pricing">Pricing &amp; Payment</a>
        <a class="legal-nav-link" href="/blog">Guides &amp; Blogs</a>
      </aside>
      <article class="glass-card legal-body">
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid var(--border);margin:26px 0 16px;" />
        <p class="muted-sm" style="margin:0;">
          Questions? WhatsApp <a href="${esc(PANEL.supportWhatsapp)}">${esc(PANEL.supportPhoneDisplay)}</a>
          or email <a href="mailto:${esc(PANEL.ownerEmail)}">${esc(PANEL.ownerEmail)}</a>.
          JazzCash payments: <strong>${esc(PAYMENT.accountNumber)}</strong> (${esc(PAYMENT.accountTitle)}).
        </p>
      </article>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p class="muted-sm">
        &copy; ${new Date().getFullYear()} ${esc(BRAND.name)} — ${esc(BRAND.parentProject)} by ${esc(BRAND.founder)}.
        All rights reserved. <a href="/terms">Terms</a> &bull; <a href="/privacy">Privacy</a> &bull;
        <a href="/license">License</a> &bull; <a href="/refund-policy">Refunds</a> &bull;
        <a href="/reseller-agreement">Reseller Agreement</a> &bull; <a href="/dmca">DMCA</a>
      </p>
    </div>
  </footer>
</body>
</html>`;
}

function renderDoc(doc, siteUrl, settings) {
  const canonicalUrl = `${siteUrl}/legal/${doc.slug}`;
  const body = `
    <h1 style="margin-top:0;">${esc(doc.title)}</h1>
    <p class="muted-sm">Last updated: ${esc(doc.updated)} &bull; ${esc(BRAND.name)} &bull; ${esc(BRAND.parentProject)}</p>
    ${doc.sections
      .map(
        (s) => `
      <h2>${esc(s.h)}</h2>
      ${(s.p || []).map((p) => `<p>${esc(p)}</p>`).join("")}
    `
      )
      .join("")}
    ${
      doc.slug === "founder"
        ? `<div class="founder-photo-grid">
            ${FOUNDER_PHOTOS.map(
              (src, i) =>
                `<img src="${esc(src)}" alt="Muaaz Iqbal, founder of BarakatWave TV and Mizanora Projects (photo ${i + 1})" loading="lazy" class="founder-photo" />`
            ).join("")}
          </div>`
        : ""
    }
  `;
  const founderPerson = {
    "@type": "Person",
    "@id": `${siteUrl}/legal/founder#person`,
    name: BRAND.founder,
    alternateName: ["Muaaz Iqbal Kasur", "Muhammad Muaaz Iqbal"],
    jobTitle: BRAND.founderRole,
    url: `${siteUrl}/legal/founder`,
    email: `mailto:${BRAND.ownerEmail}`,
    telephone: BRAND.proPhoneIntl,
    sameAs: [BRAND.founderGithub, BRAND.parentUrl, BRAND.repoUrl],
    address: { "@type": "PostalAddress", addressLocality: "Kasur", addressRegion: "Punjab", addressCountry: "PK" },
    knowsAbout: [
      "IPTV panel engineering",
      "HLS and MPEG-DASH streaming",
      "Xtream Codes API",
      "MAC / MAG Stalker portals",
      "Firebase Realtime Database",
      "Vercel serverless architecture",
      "AI automation"
    ],
    image: FOUNDER_PHOTOS.map((src) => ({
      "@type": "ImageObject",
      contentUrl: siteUrl + src,
      url: siteUrl + src,
      caption: "Muaaz Iqbal — founder of BarakatWave TV and Mizanora Projects"
    })),
    worksFor: { "@type": "Organization", name: BRAND.parentProject, url: BRAND.parentUrl }
  };

  const jsonLd =
    doc.slug === "founder"
      ? {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: doc.title,
          description: doc.description,
          url: canonicalUrl,
          mainEntity: founderPerson,
          about: founderPerson,
          publisher: { "@type": "Organization", name: BRAND.name, url: siteUrl },
          dateModified: doc.updated
        }
      : {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: doc.title,
          description: doc.description,
          url: canonicalUrl,
          publisher: { "@type": "Organization", name: BRAND.name, url: siteUrl },
          author: founderPerson,
          dateModified: doc.updated
        };
  return legalShell({
    title: `${doc.title} | ${BRAND.name} — ${BRAND.parentProject}`,
    description: doc.description,
    canonicalUrl,
    settings,
    bodyHtml: body,
    jsonLd,
    activeSlug: doc.slug,
    ogImage: doc.slug === "founder" ? `${siteUrl}${FOUNDER_PHOTOS[0]}` : ""
  });
}

function renderIndex(siteUrl, settings) {
  const canonicalUrl = `${siteUrl}/legal`;
  const body = `
    <h1 style="margin-top:0;">Legal &amp; Trust Center</h1>
    <p class="muted-sm">Every BarakatWave TV policy in one place — transparent pricing, privacy, licensing and refunds.</p>
    <div class="legal-card-grid">
      ${LEGAL_DOCS.map(
        (d) => `
        <a class="legal-card glass-card" href="/legal/${d.slug}">
          <strong>${esc(d.title)}</strong>
          <span class="muted-sm">${esc(d.description)}</span>
        </a>`
      ).join("")}
      <a class="legal-card glass-card" href="/pricing">
        <strong>Pricing &amp; JazzCash Payment Guide</strong>
        <span class="muted-sm">PKR 200/month direct, PKR 100/month reseller, free 1-day PRO trial.</span>
      </a>
    </div>
  `;
  return legalShell({
    title: `Legal, Privacy & Policies | ${BRAND.name}`,
    description: "BarakatWave TV terms of service, privacy policy, software license, refund policy, reseller agreement and copyright policy.",
    canonicalUrl,
    settings,
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "BarakatWave TV Legal Center",
      url: canonicalUrl
    },
    activeSlug: ""
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const slug = String(q.slug || "").trim().toLowerCase().replace(/^\/+/, "");
  const siteUrl = getCanonicalBaseUrl();
  const settings = await getSettings();

  if (!slug || slug === "legal" || slug === "index") {
    return sendText(res, 200, renderIndex(siteUrl, settings), "text/html; charset=utf-8", "public, max-age=600");
  }

  const doc =
    LEGAL_DOCS.find((d) => d.slug === slug) ||
    LEGAL_DOCS.find((d) => slug.startsWith(d.slug));

  if (!doc) {
    return sendText(
      res,
      404,
      renderIndex(siteUrl, settings).replace(
        "<h1 style=\"margin-top:0;\">Legal &amp; Trust Center</h1>",
        "<h1 style=\"margin-top:0;\">Policy Not Found</h1><p>We could not find that document. Explore the legal center below.</p>"
      ),
      "text/html; charset=utf-8",
      "no-store"
    );
  }

  return sendText(res, 200, renderDoc(doc, siteUrl, settings), "text/html; charset=utf-8", "public, max-age=600");
}

import {
  getCanonicalBaseUrl,
  handleOptions,
  parseQuery,
  sendJson,
  sendText
} from "../_lib/origin.js";
import { getBlogs, getSettings } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const q = parseQuery(req);
  const blogs = await getBlogs();

  if (q.format === "json") {
    return sendJson(res, 200, { ok: true, count: blogs.length, blogs });
  }

  const settings = await getSettings();
  const siteUrl = getCanonicalBaseUrl();
  const slug = String(q.slug || "").trim();

  if (slug) {
    const post = blogs.find((b) => b.slug === slug);
    if (!post) {
      return sendText(res, 404, renderBlogIndexHtml(blogs, siteUrl, settings, "Article not found — explore all guides below:"), "text/html; charset=utf-8");
    }
    return sendText(res, 200, renderBlogPostHtml(post, blogs, siteUrl, settings), "text/html; charset=utf-8", "public, max-age=300");
  }

  return sendText(res, 200, renderBlogIndexHtml(blogs, siteUrl, settings), "text/html; charset=utf-8", "public, max-age=300");
}

function renderSharedHead({ title, description, canonicalUrl, settings, jsonLd }) {
  const gsc = settings.gscVerification || process.env.GOOGLE_SITE_VERIFICATION || "";
  const bing = settings.bingVerification || process.env.BING_SITE_VERIFICATION || "";
  return `<!DOCTYPE html>
<html lang="en" data-theme="barakat">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}" />
  <meta name="author" content="${escHtml(BRAND.founder)} — ${escHtml(BRAND.parentProject)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  ${gsc ? `<meta name="google-site-verification" content="${escHtml(gsc)}" />` : ""}
  ${bing ? `<meta name="msvalidate.01" content="${escHtml(bing)}" />` : ""}
  <link rel="canonical" href="${escHtml(canonicalUrl)}" />
  <link rel="alternate" type="application/rss+xml" title="${escHtml(BRAND.name)} RSS" href="${escHtml(canonicalUrl.split("/blog")[0])}/rss.xml" />
  <link rel="icon" type="image/png" href="${escHtml(BRAND.logoPrimary)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${escHtml(BRAND.name)} — ${escHtml(BRAND.parentProject)}" />
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:url" content="${escHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escHtml(BRAND.logoPrimary)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image" content="${escHtml(BRAND.logoPrimary)}" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>`;
}

function renderBlogIndexHtml(blogs, siteUrl, settings, alertBanner = "") {
  const title = `Official Guides, Xtream Setup & Streaming Tutorials | ${BRAND.name} by ${BRAND.founder}`;
  const description = `Explore official tutorials for ${BRAND.name} (${BRAND.parentProject} by ${BRAND.founder}): Free Xtream Codes setup, IPTV Smarters Pro, TiviMate, VLC M3U8 links, Smart TV streaming, and PRO VIP upgrade (${BRAND.proPhoneDisplay}).`;
  const canonicalUrl = `${siteUrl}/blog`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${BRAND.name} Knowledge Hub`,
    url: canonicalUrl,
    description,
    publisher: {
      "@type": "Organization",
      name: `${BRAND.name} (${BRAND.parentProject})`,
      logo: { "@type": "ImageObject", url: BRAND.logoPrimary },
      founder: { "@type": "Person", name: BRAND.founder, jobTitle: BRAND.founderRole }
    },
    blogPost: blogs.map((b) => ({
      "@type": "BlogPosting",
      headline: b.title,
      url: `${siteUrl}/blog/${b.slug}`,
      datePublished: b.publishedAt,
      author: { "@type": "Person", name: b.author || BRAND.founder }
    }))
  };

  const cards = blogs
    .map(
      (b) => `
      <article class="blog-card glass-card">
        <div class="blog-card-meta">
          <span class="badge badge-cyan">${escHtml(b.category || "Guide")}</span>
          <span class="muted-sm">${escHtml(b.readTime || "5 min read")}</span>
        </div>
        <h2><a href="/blog/${escHtml(b.slug)}">${escHtml(b.title)}</a></h2>
        <p>${escHtml(b.excerpt || "")}</p>
        <div class="blog-card-footer">
          <span class="muted-sm">By <strong>${escHtml(b.author || BRAND.founder)}</strong></span>
          <a href="/blog/${escHtml(b.slug)}" class="btn btn-sm btn-outline">Read Guide &rarr;</a>
        </div>
      </article>`
    )
    .join("\n");

  return `${renderSharedHead({ title, description, canonicalUrl, settings, jsonLd })}
<body class="ssr-blog-body">
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand-link">
        <img src="${escHtml(BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='${escHtml(BRAND.logoCamo)}';" alt="${escHtml(BRAND.name)}" class="brand-logo" />
        <div>
          <span class="brand-title">${escHtml(BRAND.shortName)}</span>
          <span class="brand-sub">A Mizanora Project by ${escHtml(BRAND.founder)}</span>
        </div>
      </a>
      <nav class="ssr-nav">
        <a href="/" class="btn btn-sm btn-outline">Live TV Player</a>
        <a href="/#xtream" class="btn btn-sm btn-outline">Free Xtream Server</a>
        <a href="https://wa.me/${escHtml(settings.proWhatsappIntl || "923062015326")}" target="_blank" rel="noopener" class="btn btn-sm btn-gold">PRO VIP: ${escHtml(BRAND.proPhoneDisplay)}</a>
      </nav>
    </div>
  </header>

  <main class="container ssr-blog-main">
    ${alertBanner ? `<div class="alert-box">${escHtml(alertBanner)}</div>` : ""}
    <section class="ssr-hero glass-card">
      <span class="badge badge-gold">MIZANORA KNOWLEDGE &amp; SEO HUB</span>
      <h1>BarakatWave Live TV — Official Tutorials, IPTV Guides &amp; Engineering Blog</h1>
      <p>Step-by-step guides for claiming your Free Xtream Codes Server, setting up IPTV Smarters Pro, TiviMate, VLC &amp; Smart TVs, and exploring streaming innovations engineered by <strong>${escHtml(BRAND.founder)}</strong> under <strong>${escHtml(BRAND.parentProject)}</strong>.</p>
    </section>

    <div class="blog-grid">${cards}</div>
  </main>

  <footer class="site-footer">
    <div class="container footer-bottom">
      <p>&copy; 2026 <strong>${escHtml(BRAND.name)}</strong> — Under <strong>${escHtml(BRAND.parentProject)}</strong>. Founded, Designed &amp; Engineered by <strong>${escHtml(BRAND.founder)}</strong>. PRO Support: <a href="tel:+923062015326">${escHtml(BRAND.proPhoneDisplay)}</a></p>
      <p><a href="/">Home</a> &bull; <a href="/sitemap.xml">Sitemap</a> &bull; <a href="/rss.xml">RSS Feed</a> &bull; <a href="/llms.txt">AI LLMs.txt</a></p>
    </div>
  </footer>
</body>
</html>`;
}

function renderBlogPostHtml(post, allBlogs, siteUrl, settings) {
  const title = `${post.title} | ${BRAND.name} (${BRAND.parentProject})`;
  const description = post.excerpt || `${post.title} — Official guide by ${BRAND.founder} on ${BRAND.name}.`;
  const canonicalUrl = `${siteUrl}/blog/${post.slug}`;

  const graph = [
    {
      "@type": "BlogPosting",
      headline: post.title,
      description,
      url: canonicalUrl,
      datePublished: post.publishedAt || "2026-10-28T06:00:00Z",
      dateModified: post.publishedAt || "2026-10-28T06:00:00Z",
      image: BRAND.logoPrimary,
      author: {
        "@type": "Person",
        name: post.author || BRAND.founder,
        jobTitle: BRAND.founderRole,
        url: BRAND.founderGithub
      },
      publisher: {
        "@type": "Organization",
        name: `${BRAND.name} — ${BRAND.parentProject}`,
        logo: { "@type": "ImageObject", url: BRAND.logoPrimary }
      }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Blog & Guides", item: `${siteUrl}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl }
      ]
    }
  ];

  if (Array.isArray(post.faqs) && post.faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: post.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a }
      }))
    });
  }

  const related = allBlogs
    .filter((b) => b.slug !== post.slug)
    .slice(0, 4)
    .map(
      (b) => `<li><a href="/blog/${escHtml(b.slug)}">${escHtml(b.title)}</a> <span class="muted-sm">(${escHtml(b.category || "Guide")})</span></li>`
    )
    .join("");

  const faqHtml =
    Array.isArray(post.faqs) && post.faqs.length
      ? `<section class="article-faqs glass-card">
          <h3>Frequently Asked Questions</h3>
          ${post.faqs
            .map(
              (f) => `<div class="faq-item"><h4>${escHtml(f.q)}</h4><p>${escHtml(f.a)}</p></div>`
            )
            .join("")}
        </section>`
      : "";

  return `${renderSharedHead({
    title,
    description,
    canonicalUrl,
    settings,
    jsonLd: { "@context": "https://schema.org", "@graph": graph }
  })}
<body class="ssr-blog-body">
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand-link">
        <img src="${escHtml(BRAND.logoPrimary)}" onerror="this.onerror=null;this.src='${escHtml(BRAND.logoCamo)}';" alt="${escHtml(BRAND.name)}" class="brand-logo" />
        <div>
          <span class="brand-title">${escHtml(BRAND.shortName)}</span>
          <span class="brand-sub">A Mizanora Project by ${escHtml(BRAND.founder)}</span>
        </div>
      </a>
      <nav class="ssr-nav">
        <a href="/blog" class="btn btn-sm btn-outline">&larr; All Guides</a>
        <a href="/" class="btn btn-sm btn-primary">Open Live TV App</a>
      </nav>
    </div>
  </header>

  <main class="container ssr-article-wrap">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>/</span> <a href="/blog">Blog &amp; Guides</a> <span>/</span> <span>${escHtml(post.category || "Article")}</span>
    </nav>

    <article class="ssr-article glass-card">
      <div class="blog-card-meta">
        <span class="badge badge-cyan">${escHtml(post.category || "Guide")}</span>
        <span class="muted-sm">${escHtml(post.readTime || "5 min read")}</span>
        <span class="muted-sm">Published ${escHtml(String(post.publishedAt || "2026-10-28").slice(0, 10))}</span>
      </div>
      <h1>${escHtml(post.title)}</h1>
      <p class="article-lead">${escHtml(post.excerpt || "")}</p>
      <div class="author-strip">
        <div>
          <strong>Written by ${escHtml(post.author || BRAND.founder)}</strong>
          <div class="muted-sm">${escHtml(BRAND.founderRole)} &bull; ${escHtml(BRAND.parentProject)}</div>
        </div>
      </div>

      <div class="article-body">${post.content || ""}</div>

      <div class="pro-cta-banner">
        <div>
          <h3>Unlock BarakatWave TV PRO VIP Today</h3>
          <p>Get all Premium Live Sports, Pakistani &amp; Indian HD/4K channels unlocked on Web + Xtream Apps! Contact official support on WhatsApp: <strong>${escHtml(BRAND.proPhoneDisplay)}</strong></p>
        </div>
        <div class="pro-cta-actions">
          <a href="https://wa.me/923062015326?text=${encodeURIComponent(`Assalam o Alaikum! I read "${post.title}" on BarakatWave TV and want PRO VIP details.`)}" target="_blank" rel="noopener" class="btn btn-gold">WhatsApp 0306-2015326</a>
          <a href="/#xtream" class="btn btn-outline">Get Free Xtream Server</a>
        </div>
      </div>
    </article>

    ${faqHtml}

    <section class="related-guides glass-card">
      <h3>More BarakatWave TV &amp; Mizanora Guides</h3>
      <ul>${related}</ul>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-bottom">
      <p>&copy; 2026 <strong>${escHtml(BRAND.name)}</strong> — Under <strong>${escHtml(BRAND.parentProject)}</strong>. Founded &amp; Engineered by <strong>${escHtml(BRAND.founder)}</strong>.</p>
      <p><a href="/">Live TV</a> &bull; <a href="/blog">All Guides</a> &bull; <a href="/sitemap.xml">Sitemap.xml</a> &bull; <a href="/rss.xml">RSS</a> &bull; <a href="/llms.txt">LLMs.txt</a></p>
    </div>
  </footer>
</body>
</html>`;
}

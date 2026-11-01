/**
 * BarakatWave TV — IPTV Reseller Panel Data Layer
 * ---------------------------------------------------------------
 * Single source of truth for subscription plans, reseller pricing,
 * JazzCash payment instructions, legal documents and SEO keyword clusters.
 *
 * Pricing policy (owner approved):
 *   • Reseller / sub-dealer price : PKR 100 per user / month
 *   • Direct client price         : PKR 200 per user / month
 *   • PRO Trial                   : 1 Day, absolutely free
 *   • Free channels               : always free, no login required
 *
 * A Mizanora Project by Muaaz Iqbal — Support: 0306-2015326
 */

export const PANEL = {
  version: "3.0.0",
  currency: "PKR",
  resellerPerUserMonthly: 100,
  directPerUserMonthly: 200,
  trialDays: 1,
  minResellerCredits: 5,
  supportPhone: "03062015326",
  supportPhoneDisplay: "0306-2015326",
  supportWhatsapp: "https://wa.me/923062015326",
  ownerEmail: "muaaziqbal.vip@gmail.com",
  brand: "BarakatWave TV",
  parent: "Mizanora Projects",
  founder: "Muaaz Iqbal",
  recommendedPlayer: "https://siravex.vercel.app",
  recommendedPlayerName: "Siravex IPTV Player"
};

/**
 * Subscription plans. `direct` = walk-in customer, `reseller` = dealer credit price.
 * Every plan unlocks the exact same PRO feature set (only duration differs).
 */
export const PLANS = [
  {
    id: "trial-1d",
    name: "PRO Trial",
    urdu: "1 دن مفت پرو ٹرائل",
    days: 1,
    months: 0,
    direct: 0,
    reseller: 0,
    badge: "FREE",
    tagline: "Full PRO access for 24 hours — test everything before you pay.",
    devices: 1,
    features: [
      "All PRO HD & 4K channels unlocked",
      "IMDb Movies & Series library",
      "1 device connection",
      "Works in Siravex, Smarters, TiviMate, VLC",
      "No card, no security deposit"
    ]
  },
  {
    id: "monthly",
    name: "1 Month",
    urdu: "1 ماہ",
    days: 30,
    months: 1,
    direct: 200,
    reseller: 100,
    badge: "POPULAR",
    tagline: "The standard PRO month used by 90% of our clients.",
    devices: 1,
    features: [
      "Everything in PRO Trial",
      "30 days uninterrupted PRO access",
      "1 device (extra device +50%)",
      "EPG + channel logos + catch-up",
      "WhatsApp support 0306-2015326"
    ]
  },
  {
    id: "quarterly",
    name: "3 Months",
    urdu: "3 ماہ",
    days: 90,
    months: 3,
    direct: 550,
    reseller: 275,
    badge: "SAVE 8%",
    tagline: "Best value for families watching cricket season.",
    devices: 2,
    features: [
      "All PRO channels + VOD",
      "90 days PRO access",
      "2 devices included",
      "Priority WhatsApp support",
      "Free channel re-add on request"
    ]
  },
  {
    id: "half-yearly",
    name: "6 Months",
    urdu: "6 ماہ",
    days: 180,
    months: 6,
    direct: 1050,
    reseller: 525,
    badge: "SAVE 13%",
    tagline: "Half-year package for shops, cafés and hostels.",
    devices: 2,
    features: [
      "All PRO channels + VOD",
      "180 days PRO access",
      "2 devices included",
      "Free MAC change once",
      "Priority support + uptime alerts"
    ]
  },
  {
    id: "yearly",
    name: "12 Months",
    urdu: "1 سال",
    days: 365,
    months: 12,
    direct: 2000,
    reseller: 1000,
    badge: "BEST VALUE",
    tagline: "Full year PRO — two months absolutely free.",
    devices: 3,
    features: [
      "All PRO channels + VOD",
      "365 days PRO access",
      "3 devices included",
      "Dedicated account manager",
      "Free plan transfer & MAC reset"
    ]
  }
];

/** Reseller dealer slabs (credit packs). Credits never expire. */
export const RESELLER_TIERS = [
  {
    id: "starter",
    name: "Starter Dealer",
    minCredits: 5,
    unitPrice: 100,
    discountNote: "Base dealer rate",
    perks: ["PKR 100 / user / month", "Panel access", "Trial credits", "WhatsApp support"]
  },
  {
    id: "silver",
    name: "Silver Dealer",
    minCredits: 25,
    unitPrice: 95,
    discountNote: "5% off",
    perks: ["PKR 95 / user / month", "Branded M3U links", "Bulk create 25+ users", "Trial credits"]
  },
  {
    id: "gold",
    name: "Gold Dealer",
    minCredits: 50,
    unitPrice: 90,
    discountNote: "10% off",
    perks: ["PKR 90 / user / month", "White-label DNS alias", "Priority queue", "API access key"]
  },
  {
    id: "master",
    name: "Master Distributor",
    minCredits: 100,
    unitPrice: 85,
    discountNote: "15% off",
    perks: ["PKR 85 / user / month", "Sub-reseller creation", "Custom pricing lock", "Dedicated manager"]
  }
];

/** JazzCash / Easypaisa manual payment guide. */
export const PAYMENT = {
  method: "JazzCash",
  accountNumber: "03062015326",
  accountNumberIntl: "+92 306 2015326",
  accountTitle: "Muaaz Iqbal",
  backupAccountNumber: "03062015326",
  whatsappProof: "https://wa.me/923062015326",
  reviewWindowMinutes: 30,
  steps: [
    {
      title: "Open JazzCash app / dial *786#",
      detail: "Send the exact package amount to JazzCash number 0306-2015326 (Account Title: Muaaz Iqbal)."
    },
    {
      title: "Screenshot the confirmation SMS",
      detail: "Every successful JazzCash transfer shows a TID / Transaction ID. Take a clear screenshot."
    },
    {
      title: "Send screenshot on WhatsApp 0306-2015326",
      detail: "Send the screenshot plus your BarakatWave username or registered email to 0306-2015326."
    },
    {
      title: "We review & activate PRO",
      detail: "Our team verifies the payment in minutes and activates PRO / reseller credits on your account."
    },
    {
      title: "Get confirmation",
      detail: "You receive a WhatsApp confirmation plus an in-app PRO badge. Trial users can upgrade anytime without re-registering."
    }
  ],
  notes: [
    "Never send money to any number other than 0306-2015326.",
    "Mention your username in the JazzCash 'Reference' field whenever possible.",
    "Payments are reviewed manually — average activation time is under 30 minutes.",
    "Keep your screenshot until your PRO badge shows in the dashboard."
  ]
};

/** Feature matrix shown on the pricing page + reseller panel. */
export const FEATURE_MATRIX = [
  { feature: "Free channels (no account)", free: true, pro: true, reseller: true },
  { feature: "PRO HD & 4K channel unlock", free: false, pro: true, reseller: true },
  { feature: "IMDb Movies & Series (VOD)", free: false, pro: true, reseller: true },
  { feature: "Xtream Codes login", free: "1 personal server", pro: "username + password", reseller: "unlimited users" },
  { feature: "M3U / M3U8 playlist export", free: true, pro: true, reseller: true },
  { feature: "EPG (XMLTV guide)", free: true, pro: true, reseller: true },
  { feature: "MAC-based IPTV / MAG portal", free: false, pro: true, reseller: true },
  { feature: "Signed anti-leech stream links", free: true, pro: true, reseller: true },
  { feature: "PRO Trial (1 day)", free: true, pro: false, reseller: true },
  { feature: "Reseller credit panel", free: false, pro: false, reseller: true },
  { feature: "Bulk user creation + renewal", free: false, pro: false, reseller: true },
  { feature: "Revenue / usage analytics", free: false, pro: true, reseller: true },
  { feature: "WhatsApp priority support", free: "standard", pro: "priority", reseller: "dedicated" }
];

/** Legal & policy documents (SSR at /legal/<slug>). */
export const LEGAL_DOCS = [
  {
    slug: "terms",
    title: "Terms of Service",
    description: "BarakatWave TV terms of service, acceptable use, account rules and subscriber responsibilities.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Acceptance of Terms",
        p: [
          "By creating an account, claiming a free Xtream server, activating a PRO trial, purchasing a subscription or using any BarakatWave TV (\"BarakatWave\", \"we\", \"us\") service, you agree to these Terms of Service in full.",
          "BarakatWave TV is a product of Mizanora Projects, founded and engineered by Muaaz Iqbal, operating from Kasur, Punjab, Pakistan."
        ]
      },
          {
        h: "2. Service Description",
        p: [
          "BarakatWave TV provides a browser-based live TV studio, an Xtream Codes compatible API, M3U/M3U8 playlist generation, EPG, IMDb-powered video-on-demand metadata, and a reseller management panel.",
          "We do not host, encode or own third-party broadcast content. We provide software tooling that aggregates publicly available stream endpoints and customer-supplied playlists. Customers are responsible for the legality of the streams they add."
        ]
      },
      {
        h: "3. Accounts & Credentials",
        p: [
          "You must provide accurate information and keep your username, password, license key and API key confidential. One account is for one household unless a multi-device plan is purchased.",
          "Sharing, reselling or publishing credentials without a reseller license is prohibited and may result in immediate suspension without refund."
        ]
      },
      {
        h: "4. Billing, Trials & Refunds",
        p: [
          "Prices are quoted in Pakistani Rupees (PKR). Direct client price is PKR 200 per user per month; reseller price is PKR 100 per user per month unless a volume slab applies.",
          "The 1-day PRO trial is free and limited to one per person/device. Paid subscriptions are prepaid and non-refundable once PRO is activated, except where the service is unavailable for more than 48 consecutive hours and cannot be resolved by support.",
          "Refund requests must be submitted on WhatsApp 0306-2015326 within 24 hours of activation. Approved refunds are returned to the originating JazzCash wallet within 7 working days."
        ]
      },
      {
        h: "5. Fair Use & Prohibited Conduct",
        p: [
          "You may not: (a) bypass, scrape, brute force or reverse-engineer our licensing, HMAC link signing, rate limits or anti-leech protections; (b) share signed stream URLs publicly; (c) use automated account-creation bots; (d) redistribute PRO content without a reseller license; (e) use the service for unlawful content distribution.",
          "We enforce connection limits per account. Sustained abuse triggers automatic protection, temporary lock, and possible permanent termination."
        ]
      },
      {
        h: "6. Availability & SLA",
        p: [
          "We target 99% monthly uptime for the panel and API. Individual third-party channels may go offline without notice; our engine automatically serves the BarakatWave standby broadcast so players never show a black screen.",
          "Scheduled maintenance is announced in-app and on WhatsApp."
        ]
      },
      {
        h: "7. Limitation of Liability",
        p: [
          "To the maximum extent permitted by Pakistani law, BarakatWave TV and Mizanora Projects are not liable for indirect, incidental or consequential damages, or for losses caused by third-party stream failures, ISP filtering or device incompatibility.",
          "Our total aggregate liability for any claim is limited to the amount you paid in the previous 30 days."
        ]
      },
      {
        h: "8. Governing Law",
        p: [
          "These terms are governed by the laws of the Islamic Republic of Pakistan. Disputes are subject to the exclusive jurisdiction of the courts of Kasur, Punjab."
        ]
      }
    ]
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    description: "How BarakatWave TV collects, stores, protects and deletes your data — GDPR-style rights, Firebase storage and payment privacy.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Data We Collect",
        p: [
          "Account data: display name, email address, profile photo (if Google sign-in), authentication provider, plan and PRO expiry.",
          "Service data: Xtream username/password you generate, playlist definitions, favorites, device/connection counts, stream request logs (IP, user-agent, timestamp, channel, bytes).",
          "Payment data: JazzCash transaction ID, amount, and the screenshot you voluntarily send on WhatsApp. We never collect or store card numbers, PINs or OTPs."
        ]
      },
      {
        h: "2. How We Use Data",
        p: [
          "To authenticate you, deliver streams, enforce connection limits and anti-leech protection, prevent fraud, process manual payments, provide support, and produce aggregate analytics for capacity planning.",
          "We never sell personal data. We do not use your stream history for advertising."
        ]
      },
      {
        h: "3. Storage & Security",
        p: [
          "Accounts and preferences are stored in Google Firebase Authentication and Firebase Realtime Database. Serverless API logs are processed on Vercel's edge network.",
          "Security controls include TLS 1.3 in transit, hashed license keys, HMAC-SHA256 signed stream tokens with short expiry, per-IP rate limiting, SSRF guards, and least-privilege admin rules."
        ]
      },
      {
        h: "4. Cookies & Local Storage",
        p: [
          "We use essential cookies/localStorage for theme choice, session persistence and offline caching. No third-party advertising cookies are used."
        ]
      },
      {
        h: "5. Your Rights",
        p: [
          "You may request access, correction, export or deletion of your data at any time by emailing muaaziqbal.vip@gmail.com or messaging 0306-2015326. Deletion requests are actioned within 30 days, subject to accounting retention duties."
        ]
      },
      {
        h: "6. Children",
        p: [
          "BarakatWave TV is not directed at children under 13. Accounts must be created by an adult guardian."
        ]
      },
      {
        h: "7. Contact",
        p: [
          "Data controller: Muaaz Iqbal, Mizanora Projects, Kasur, Punjab, Pakistan. Email: muaaziqbal.vip@gmail.com — WhatsApp: 0306-2015326."
        ]
      }
    ]
  },
  {
    slug: "license",
    title: "Software License & API Usage",
    description: "BarakatWave TV software license, reseller API key rules, signed link policy and permitted integrations.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Grant of License",
        p: [
          "BarakatWave TV grants you a non-exclusive, non-transferable, revocable license to use the platform, panel, Xtream API and playlist generator for the duration of your active plan.",
          "Direct clients receive a single-account license. Resellers receive a distributor license limited to the number of credits purchased."
        ]
      },
      {
        h: "2. API Keys & Signed Links",
        p: [
          "Reseller API keys (prefix bwr_) are bearer credentials tied to your panel account. Rotate them from the Reseller Panel whenever a device is lost.",
          "Playback links are signed with HMAC-SHA256 and expire automatically. You may distribute signed links to your own customers only, and only through the panel-issued M3U/EPG endpoints. Public posting, hotlinking or re-hosting of signed links is a license violation.",
          "Do not attempt to derive, brute force or replay signing secrets. Requests with invalid, expired or tampered signatures are rejected and logged."
        ]
      },
      {
        h: "3. Branding & White-Label",
        p: [
          "Silver and higher dealers may use a branded DNS alias for M3U/EPG URLs. Gold and Master dealers may request a white-label portal header. Removing Mizanora/BarakatWave attribution from the software layer itself is not permitted."
        ]
      },
      {
        h: "4. Open Components",
        p: [
          "The platform bundles hls.js, Shaka Player and mpegts.js under their respective open-source licenses. Those licenses govern those components independently of this agreement."
        ]
      },
      {
        h: "5. Termination",
        p: [
          "Licenses terminate automatically on non-renewal, chargeback, abuse of the API, or breach of the Terms of Service. On termination, credentials, signed-link capability and panel access are disabled immediately."
        ]
      }
    ]
  },
  {
    slug: "reseller-agreement",
    title: "Reseller & Dealer Agreement",
    description: "BarakatWave IPTV reseller program: PKR 100/user rates, credits, client management duties, pricing floors and support obligations.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Appointment",
        p: [
          "On approval, you become an independent authorized BarakatWave reseller. You are not an employee, agent or partner of Mizanora Projects and you have no authority to bind us."
        ]
      },
      {
        h: "2. Credit Purchases & Rates",
        p: [
          "Dealer rate is PKR 100 per user per month (5+ credits). Volume slabs: 25+ credits = PKR 95, 50+ credits = PKR 90, 100+ credits = PKR 85.",
          "Credits are prepaid, non-refundable, non-transferable and never expire. Each credit activates or renews one user for 30 days."
        ]
      },
      {
        h: "3. Minimum Retail Price",
        p: [
          "To protect the network, resellers must not advertise below the PKR 200 direct retail price. Under-cutting is a breach of this agreement and may result in credit forfeit and account closure.",
          "You may charge more than PKR 200 and keep 100% of the difference. BarakatWave does not take a commission on your retail sales."
        ]
      },
      {
        h: "4. Client Care Duties",
        p: [
          "You are the first point of support for your clients. You must provide working setup instructions (Siravex, IPTV Smarters, TiviMate, VLC, MAG), keep contact details current, and forward genuine platform outages to 0306-2015326.",
          "Unreasonable chargebacks, fake payment screenshots or child/piracy content reports lead to instant suspension."
        ]
      },
      {
        h: "5. Data & Privacy",
        p: [
          "You may see only your own clients' usernames, expiry and connection counts. Bulk scraping, exporting or selling client lists outside the panel is prohibited."
        ]
      },
      {
        h: "6. Term & Termination",
        p: [
          "The agreement runs month to month. Either party may terminate with 7 days' written notice on WhatsApp. Active client subscriptions continue until their paid expiry; unused credits are forfeited on termination for breach."
        ]
      }
    ]
  },
  {
    slug: "refund",
    title: "Refund & Cancellation Policy",
    description: "BarakatWave TV refund eligibility, 24-hour review window, JazzCash return timeline and reseller credit policy.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Free Trial First",
        p: [
          "Always test the 1-day PRO trial before paying. It unlocks the same channel set and player compatibility as a paid plan, so you can verify your internet, device and player before spending money."
        ]
      },
      {
        h: "2. Eligibility",
        p: [
          "Refunds are considered when: the plan was never activated; activation failed on our side; or the service was unusable for more than 48 consecutive hours and support could not fix it.",
          "Refunds are not available for: change of mind after activation, device incompatibility that the trial would have revealed, third-party channel removals, or breach of the Terms of Service."
        ]
      },
      {
        h: "3. How to Request",
        p: [
          "Message 0306-2015326 on WhatsApp within 24 hours of activation with your username, JazzCash TID and reason. Approved refunds are returned to the originating wallet within 7 working days."
        ]
      },
      {
        h: "4. Reseller Credits",
        p: [
          "Reseller credits are non-refundable but never expire, and can be reassigned to another client at any time from the Reseller Panel."
        ]
      }
    ]
  },
  {
    slug: "dmca",
    title: "Copyright & DMCA Policy",
    description: "How to file a copyright takedown for a channel or playlist listed on BarakatWave TV, and our counter-notice process.",
    updated: "2026-11-01",
    sections: [
      {
        h: "1. Our Position",
        p: [
          "BarakatWave TV does not host broadcaster streams. Channels are references to public endpoints or customer-supplied playlists. We respect intellectual property and act on valid notices quickly."
        ]
      },
      {
        h: "2. Filing a Notice",
        p: [
          "Email muaaziqbal.vip@gmail.com with: your name and organisation, the copyrighted work, the exact BarakatWave URL/channel name, proof of ownership, and a good-faith statement. Incomplete notices cannot be processed."
        ]
      },
      {
        h: "3. Action & Counter-Notice",
        p: [
          "Valid notices result in removal of the channel reference within 72 hours and a note to the uploading account. Affected uploaders may file a counter-notice with evidence of authorization; we restore content only where authorization is convincing."
        ]
      }
    ]
  },
  {
    slug: "founder",
    title: "About Muaaz Iqbal — Founder of BarakatWave TV",
    description: "Muaaz Iqbal, founder of Mizanora Projects and architect of BarakatWave TV: biography, engineering philosophy, IPTV research and contact.",
    updated: "2026-11-01",
    sections: [
      {
        h: "Who is Muaaz Iqbal?",
        p: [
          "Muaaz Iqbal is a self-taught full-stack developer, video editor and graphic designer from Kasur, Punjab, Pakistan. He is the founder of Mizanora Projects, the innovation umbrella behind Mizanora Store, Mizanora AI, and BarakatWave TV.",
          "He specialises in streaming architecture (HLS/DASH manifest engineering), Firebase-backed real-time systems, conversion-focused UI design, and AI-assisted automation."
        ]
      },
      {
        h: "Engineering Philosophy",
        p: [
          "\"Barakat\" means blessing, and \"Wave\" represents continuous delivery. Every BarakatWave feature is judged on three questions: does it load fast on a 3G connection in Kasur, does it survive a broken upstream stream, and does it protect the subscriber's money and privacy?",
          "That is why BarakatWave ships an automatic standby broadcast, signed anti-leech links, one-click Xtream provisioning and a reseller panel that a shopkeeper can operate without training."
        ]
      },
      {
        h: "IPTV Research & Writing",
        p: [
          "Muaaz publishes ongoing research on IPTV delivery, Xtream Codes compatibility, MAG/MAC portals, subcontinent streaming demand and search visibility. Read the full library on the BarakatWave blog and the Mizanora ecosystem pages."
        ]
      },
      {
        h: "Contact",
        p: [
          "WhatsApp / Call: 0306-2015326 — Email: muaaziqbal.vip@gmail.com — GitHub: github.com/muaaziqbalvip — Ecosystem: mizanora.vercel.app"
        ]
      }
    ]
  }
];

/** Keyword clusters used for SEO pages, llms.txt and blog generation. */
export const KEYWORDS = {
  core: [
    "BarakatWave TV",
    "IPTV Pakistan",
    "IPTV India",
    "best IPTV panel Pakistan",
    "IPTV reseller panel",
    "Muaaz Iqbal IPTV",
    "Mizanora Projects",
    "free IPTV trial Pakistan",
    "Xtream Codes server free",
    "M3U8 playlist Pakistan",
    "4K IPTV Pakistan",
    "cricket live IPTV"
  ],
  longTail: [
    "buy IPTV subscription in Pakistan with JazzCash",
    "IPTV reseller panel Pakistan price per user",
    "free 1 day IPTV trial Pakistan 2026",
    "cheapest IPTV Pakistan 200 rupees monthly",
    "IPTV for Samsung Smart TV Pakistan setup",
    "MAC address IPTV portal MAG setup guide",
    "TiviMate IPTV Smarters Xtream codes setup Pakistan",
    "Indian Pakistani live TV channels IPTV 4K",
    "how to become IPTV reseller in Pakistan",
    "BarakatWave TV reseller panel login",
    "secure IPTV backend link protection",
    "Siravex IPTV player recommended"
  ]
};

/** Distance helper: plan lookup + price resolution. */
export function getPlan(planIdOrMonths) {
  if (planIdOrMonths === null || planIdOrMonths === undefined) return null;
  const key = String(planIdOrMonths).toLowerCase();
  return (
    PLANS.find((p) => p.id === key) ||
    PLANS.find((p) => String(p.months) === key) ||
    null
  );
}

export function priceForPlan(planId, audience = "direct", quantity = 1) {
  const plan = getPlan(planId) || PLANS[1];
  const unit = audience === "reseller" ? plan.reseller : plan.direct;
  return {
    planId: plan.id,
    plan,
    unit,
    quantity: Math.max(1, Number(quantity) || 1),
    total: unit * Math.max(1, Number(quantity) || 1),
    currency: PANEL.currency
  };
}

export function planDaysToExpiry(days, fromTs = Date.now()) {
  const base = Number(fromTs) || Date.now();
  return Math.floor((base + Number(days || 1) * 86400_000) / 1000);
}

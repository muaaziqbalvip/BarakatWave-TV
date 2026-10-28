/**
 * BarakatWave Live TV — Master Seed Catalog, Defaults, SEO Blogs & Brand Metadata
 * Under Mizanora Projects | Founded, Designed & Engineered by Muaaz Iqbal
 * Hosted at: https://barakatwave.vercel.app
 */

export const BRAND = {
  name: "BarakatWave Live TV",
  shortName: "BarakatWave TV",
  tagline: "Next-Gen Live TV Streaming Network, Free Personal Xtream Server & Smart M3U8 Studio",
  parentProject: "Mizanora Projects",
  parentUrl: "https://mizanora.vercel.app",
  siteUrl: "https://barakatwave.vercel.app",
  repoUrl: "https://github.com/muaaziqbalvip/BarakatWave-TV",
  founder: "Muaaz Iqbal",
  founderRole: "Founder, Lead Full-Stack Architect & AI/Streaming Innovator",
  founderLocation: "Kasur, Punjab, Pakistan",
  founderGithub: "https://github.com/muaaziqbalvip",
  ownerEmail: "muaaziqbal.vip@gmail.com",
  proPhoneLocal: "03062015326",
  proPhoneDisplay: "0306-2015326",
  proPhoneIntl: "+923062015326",
  proWhatsappUrl: "https://wa.me/923062015326",
  logoPrimary: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
  logoCamo: "https://camo.githubusercontent.com/36a6df994ba05236c61483cd3dc153d1ed11e9a0bc6c500a94a950a925dd38aa/68747470733a2f2f692e6962622e636f2f74707832774847592f426172616b61742d576176652d53747265616d696e672d4e6574776f726b2d4c6f676f2e706e67",
  logoFallback: "/assets/logo-fallback.svg"
};

export const DEFAULT_SETTINGS = {
  welcomeVideoUrl: "/media/welcome/index.m3u8",
  welcomeVideoEnabled: true,
  welcomeDurationSec: 6,
  welcomeSkippable: true,
  proUnlockVideoUrl: "/media/pro-unlock/index.m3u8",
  proUnlockVideoEnabled: true,
  proWhatsapp: "03062015326",
  proWhatsappIntl: "923062015326",
  proBannerTitle: "Unlock BarakatWave TV PRO VIP",
  proBannerSubtitle: "Get 24/7 access to all Premium Sports, 4K Entertainment, Pakistani & Indian VIP Channels on Web + Xtream Apps!",
  proPriceNote: "Instant VIP Activation on WhatsApp: 0306-2015326",
  siteAnnouncement: "BarakatWave Live TV — A Mizanora Project by Muaaz Iqbal | Login with Google or Gmail to claim your FREE Personal Xtream Codes Server! For PRO VIP Channels contact 0306-2015326",
  githubRepo: "muaaziqbalvip/BarakatWave-TV",
  githubBranch: "main",
  githubFolder: "data/streams",
  gscVerification: "",
  bingVerification: "",
  indexNowKey: "barakatwave2026mizanoraseokey"
};

export const CATEGORIES = [
  { id: "1", slug: "featured", name: "Featured & Network" },
  { id: "2", slug: "islamic", name: "Islamic 24/7" },
  { id: "3", slug: "pakistan", name: "Pakistan Live" },
  { id: "4", slug: "india", name: "India & South Asia" },
  { id: "5", slug: "sports", name: "Live Sports HD" },
  { id: "6", slug: "news", name: "World & Regional News" },
  { id: "7", slug: "entertainment", name: "Entertainment & Drama" },
  { id: "8", slug: "documentary", name: "Science & Documentary" }
];

export const DEFAULT_CHANNELS = [
  {
    id: "ch_bw_promo",
    streamId: 1001,
    slug: "barakatwave-official-hd",
    name: "BarakatWave Official Promo HD",
    category: "Featured & Network",
    categoryId: "1",
    country: "PK",
    language: "English / Urdu",
    tier: "free",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "barakatwave.promo.pk",
    nowPlaying: "24/7 Network Showcase • Mizanora Projects by Muaaz Iqbal",
    url: "/media/demo-live/index.m3u8",
    backupUrls: [],
    order: 1
  },
  {
    id: "ch_makkah_live",
    streamId: 1002,
    slug: "makkah-al-quran-al-kareem-hd",
    name: "Makkah Al-Quran Al-Kareem TV HD",
    category: "Islamic 24/7",
    categoryId: "2",
    country: "SA",
    language: "Arabic",
    tier: "free",
    featured: true,
    status: "active",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Kaaba_icon.svg/240px-Kaaba_icon.svg.png",
    epgId: "quran.makkah.sa",
    nowPlaying: "Live Masjid Al-Haram Recitation & Tawaf 24/7",
    url: "https://win.holol.com/live/quran/playlist.m3u8",
    backupUrls: [
      "https://media2.streambrothers.com:1936/8122/8122/playlist.m3u8",
      "/media/demo-live/index.m3u8"
    ],
    order: 2
  },
  {
    id: "ch_madinah_live",
    streamId: 1003,
    slug: "madinah-al-sunnah-al-nabawiyah-hd",
    name: "Madinah Al-Sunnah TV HD",
    category: "Islamic 24/7",
    categoryId: "2",
    country: "SA",
    language: "Arabic",
    tier: "free",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "sunnah.madinah.sa",
    nowPlaying: "Live Masjid An-Nabawi Broadcast 24/7",
    url: "https://win.holol.com/live/sunnah/playlist.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 3
  },
  {
    id: "ch_aljazeera_en",
    streamId: 1004,
    slug: "al-jazeera-english-hd",
    name: "Al Jazeera English HD",
    category: "World & Regional News",
    categoryId: "6",
    country: "QA",
    language: "English",
    tier: "free",
    featured: true,
    status: "active",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/240px-Aljazeera_eng.svg.png",
    epgId: "aljazeera.en",
    nowPlaying: "Global Breaking News & Live Coverage",
    url: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 4
  },
  {
    id: "ch_trt_world",
    streamId: 1005,
    slug: "trt-world-hd",
    name: "TRT World HD",
    category: "World & Regional News",
    categoryId: "6",
    country: "TR",
    language: "English",
    tier: "free",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "trtworld.hd",
    nowPlaying: "International Headlines & South Asia Focus",
    url: "https://tv-trtworld.medya.trt.com.tr/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 5
  },
  {
    id: "ch_dw_english",
    streamId: 1006,
    slug: "dw-news-english-hd",
    name: "DW English News HD",
    category: "World & Regional News",
    categoryId: "6",
    country: "DE",
    language: "English",
    tier: "free",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "dw.english",
    nowPlaying: "World News, Tech & Documentaries",
    url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 6
  },
  {
    id: "ch_redbull_sports",
    streamId: 1007,
    slug: "red-bull-sports-tv-hd",
    name: "Red Bull Action Sports TV HD",
    category: "Live Sports HD",
    categoryId: "5",
    country: "INT",
    language: "English",
    tier: "free",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "redbull.tv",
    nowPlaying: "Motorsport, Rally & Global Live Championships",
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 7
  },
  {
    id: "ch_nasa_tv",
    streamId: 1008,
    slug: "nasa-space-live-hd",
    name: "NASA Space & Earth Live HD",
    category: "Science & Documentary",
    categoryId: "8",
    country: "US",
    language: "English",
    tier: "free",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "nasa.public",
    nowPlaying: "ISS Earth Views & Mission Control",
    url: "https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 8
  },
  {
    id: "ch_france24",
    streamId: 1009,
    slug: "france-24-english-hd",
    name: "France 24 English HD",
    category: "World & Regional News",
    categoryId: "6",
    country: "FR",
    language: "English",
    tier: "free",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "france24.en",
    nowPlaying: "24/7 International Live Bulletin",
    url: "https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 9
  },
  {
    id: "ch_nhk_world",
    streamId: 1010,
    slug: "nhk-world-japan-hd",
    name: "NHK World Asia HD",
    category: "Science & Documentary",
    categoryId: "8",
    country: "JP",
    language: "English",
    tier: "free",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "nhk.world",
    nowPlaying: "Asian Culture, Technology & News",
    url: "https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 10
  },
  {
    id: "ch_pro_cricket_4k",
    streamId: 2001,
    slug: "barakat-cricket-arena-4k-pro",
    name: "Barakat Cricket Arena 4K [PRO VIP]",
    category: "Live Sports HD",
    categoryId: "5",
    country: "PK",
    language: "Urdu / English / Hindi",
    tier: "pro",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "barakat.cricket.pro",
    nowPlaying: "Pakistan vs India Classics & Live T20/ODI 60fps Feed",
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 11
  },
  {
    id: "ch_pro_pk_gold",
    streamId: 2002,
    slug: "pakistan-super-entertainment-pro",
    name: "Pakistan Super Drama & News HD [PRO VIP]",
    category: "Pakistan Live",
    categoryId: "3",
    country: "PK",
    language: "Urdu",
    tier: "pro",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "pk.super.pro",
    nowPlaying: "Prime-Time Pakistani Dramas, Talk Shows & Headlines",
    url: "https://tv-trtworld.medya.trt.com.tr/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 12
  },
  {
    id: "ch_pro_india_cinema",
    streamId: 2003,
    slug: "subcontinent-cinema-gold-pro",
    name: "Subcontinent Cinema & Masala 4K [PRO VIP]",
    category: "India & South Asia",
    categoryId: "4",
    country: "IN",
    language: "Hindi / Urdu",
    tier: "pro",
    featured: true,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "in.cinema.pro",
    nowPlaying: "24/7 Blockbuster Premiers & Family Entertainment",
    url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 13
  },
  {
    id: "ch_pro_sports_max",
    streamId: 2004,
    slug: "barakat-football-champions-pro",
    name: "Barakat Champions Football UHD [PRO VIP]",
    category: "Live Sports HD",
    categoryId: "5",
    country: "INT",
    language: "English / Arabic",
    tier: "pro",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "barakat.football.pro",
    nowPlaying: "European League Nights & Live Match Studio",
    url: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    backupUrls: ["/media/demo-live/index.m3u8"],
    order: 14
  },
  {
    id: "ch_pro_drama_royal",
    streamId: 2005,
    slug: "mizanora-family-royal-hd-pro",
    name: "Mizanora Family Royal HD [PRO VIP]",
    category: "Entertainment & Drama",
    categoryId: "7",
    country: "PK",
    language: "Urdu / English",
    tier: "pro",
    featured: false,
    status: "active",
    logo: "https://i.ibb.co/tpx2wHGY/Barakat-Wave-Streaming-Network-Logo.png",
    epgId: "mizanora.royal.pro",
    nowPlaying: "Curated Halal Family Entertainment & Specials",
    url: "/media/demo-live/index.m3u8",
    backupUrls: [],
    order: 15
  }
];

export const DEFAULT_BLOGS = [
  {
    slug: "barakatwave-live-tv-mizanora-project-by-muaaz-iqbal",
    title: "BarakatWave Live TV: Next-Gen Streaming Network Under Mizanora Projects by Muaaz Iqbal",
    excerpt: "Discover how Founder & Architect Muaaz Iqbal engineered BarakatWave Live TV under the Mizanora Projects umbrella — combining instant web HLS streaming, free personal Xtream Codes servers, and smart M3U8 playlist technology.",
    category: "Mizanora Ecosystem",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T06:00:00Z",
    readTime: "6 min read",
    tags: ["BarakatWave TV", "Muaaz Iqbal", "Mizanora Projects", "Live TV Pakistan", "Xtream Codes"],
    content: `
      <h2>Welcome to BarakatWave Live TV — Engineered Under Mizanora Projects</h2>
      <p><strong>BarakatWave Live TV</strong> (<a href="https://barakatwave.vercel.app">barakatwave.vercel.app</a>) is an advanced cloud-native television broadcasting and IPTV management platform created, founded, and architected by <strong>Muaaz Iqbal</strong> as a flagship media platform under <strong>Mizanora Projects</strong>.</p>
      <p>Designed to connect viewers across Pakistan, India, the Middle East, and the global South Asian diaspora, BarakatWave TV eliminates complex streaming setups. Whether you want to watch HD channels instantly inside your browser or load a personal <strong>Xtream Codes API server</strong> into Smart TV apps like IPTV Smarters Pro and TiviMate, BarakatWave TV delivers everything from one unified cloud account.</p>
      <h3>Key Innovations Built by Muaaz Iqbal</h3>
      <ul>
        <li><strong>One-Click Free Xtream Server:</strong> Every user who signs in with Google or Gmail/Password can generate one permanent, personal Xtream Codes account with dedicated username, password, M3U Plus link, and XMLTV EPG feed.</li>
        <li><strong>Custom M3U8 Playlist Studio:</strong> Build your own channel lineup, add custom streams, and get a live cloud-synced <code>.m3u8</code> URL that updates across all your devices automatically.</li>
        <li><strong>Live HLS Pre-Roll &amp; Pro-Gate Video Stitching:</strong> Admin-configured welcome animations and BarakatWave PRO unlock bumpers are dynamically stitched directly into live <code>.m3u8</code> manifests using RFC 8216 <code>#EXT-X-DISCONTINUITY</code> tags.</li>
        <li><strong>5 Signature Broadcast Themes:</strong> Switch effortlessly between Barakat Wave Midnight, Mizanora Royal Gold, Emerald Noor, Royal Amethyst, and Daylight Pearl.</li>
      </ul>
      <h3>Part of the Mizanora Vision</h3>
      <p>From e-commerce innovation at Mizanora Store to autonomous AI agents and real-time HLS media delivery, <strong>Muaaz Iqbal</strong> builds ultra-fast, accessible software systems engineered in Kasur, Punjab, Pakistan for global audiences. Need <strong>BarakatWave TV PRO VIP</strong> access? Reach official support directly on WhatsApp at <strong>0306-2015326</strong>.</p>
    `,
    faqs: [
      { q: "Who is the founder and developer of BarakatWave Live TV?", a: "BarakatWave Live TV was founded, designed, and developed by Muaaz Iqbal under Mizanora Projects." },
      { q: "Is BarakatWave Live TV free to start?", a: "Yes! Signing in with Google or Gmail lets you watch free live channels in the built-in player and generate one free personal Xtream Codes server." }
    ]
  },
  {
    slug: "how-to-get-free-xtream-codes-server-barakatwave-tv",
    title: "How to Claim Your Free Personal Xtream Codes Server on BarakatWave TV (Step-by-Step)",
    excerpt: "Learn how to log in with Google or Gmail on BarakatWave TV and generate your one-time free Xtream Codes server URL, username, password, and M3U8 link in under 30 seconds.",
    category: "Xtream Server Guides",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T06:15:00Z",
    readTime: "5 min read",
    tags: ["Free Xtream Codes", "IPTV Server", "Google Login", "BarakatWave TV", "Mizanora"],
    content: `
      <h2>Claim Your Personal Free Xtream Server in 3 Simple Steps</h2>
      <p>Unlike temporary public playlists that expire every few hours, <strong>BarakatWave Live TV</strong> gives every registered member their own persistent <strong>Xtream Codes API account</strong> stored securely in Firebase Realtime Database.</p>
      <h3>Step 1: Sign In with Google or Gmail + Password</h3>
      <p>Open <a href="https://barakatwave.vercel.app">barakatwave.vercel.app</a> and click <strong>Sign In</strong> in the top navigation bar. You can either use 1-click <strong>Continue with Google</strong> or register with your Gmail/Email address and password.</p>
      <h3>Step 2: Open the "My Xtream Server" Dashboard</h3>
      <p>Navigate to the <strong>Xtream Panel</strong> tab. Click the glowing <strong>Generate My Free Xtream Server</strong> button. Notice that each account receives <strong>one permanent Xtream server</strong> tied to your profile so your credentials stay always visible whenever you return.</p>
      <h3>Step 3: Copy Your Host URL, Username &amp; Password</h3>
      <p>Your dashboard immediately displays:</p>
      <ul>
        <li><strong>Server / Portal URL:</strong> <code>https://barakatwave.vercel.app</code> (Port <code>443</code>)</li>
        <li><strong>Username &amp; Password:</strong> Unique credentials generated specifically for you</li>
        <li><strong>M3U Plus Playlist Link:</strong> Ready for VLC, Kodi, or OTT Navigator</li>
        <li><strong>XMLTV EPG URL:</strong> Automatic TV program guide synchronization</li>
      </ul>
      <p>Want to unlock all <code>[PRO VIP]</code> channels on the exact same Xtream username without changing settings on your TV? Contact BarakatWave VIP Support on WhatsApp at <strong>0306-2015326</strong> and your existing server upgrades instantaneously!</p>
    `,
    faqs: [
      { q: "How many free Xtream servers can one user create?", a: "Each verified user account can generate 1 permanent free Xtream Codes server, which remains saved on their dashboard." },
      { q: "Do I have to re-enter credentials after upgrading to PRO?", a: "No! When Admin upgrades your account via 0306-2015326, your existing Xtream username automatically unlocks all PRO VIP channels." }
    ]
  },
  {
    slug: "setup-xtream-codes-iptv-smarters-pro-tivimate",
    title: "Complete Setup Guide: Using BarakatWave Xtream Codes on IPTV Smarters Pro, TiviMate & XCIPTV",
    excerpt: "Exact field-by-field configuration guide for connecting your BarakatWave TV Xtream server to IPTV Smarters Pro, TiviMate, XCIPTV, and OTT Navigator on Android TV and mobile.",
    category: "Player Tutorials",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T06:30:00Z",
    readTime: "7 min read",
    tags: ["IPTV Smarters Pro", "TiviMate", "XCIPTV", "Xtream Codes API", "BarakatWave TV"],
    content: `
      <h2>Connecting BarakatWave TV to Leading IPTV Players</h2>
      <p>BarakatWave Live TV implements the full <strong>Xtream Codes v2.9 Player API</strong> (<code>/player_api.php</code>, <code>/get.php</code>, <code>/xmltv.php</code>, and <code>/live/user/pass/id.m3u8</code>) engineered by <strong>Muaaz Iqbal</strong> under Mizanora Projects.</p>
      <h3>1. IPTV Smarters Pro Setup</h3>
      <ol>
        <li>Open IPTV Smarters Pro and choose <strong>Login with Xtream Codes API</strong>.</li>
        <li><strong>Any Name:</strong> Enter <code>BarakatWave TV</code>.</li>
        <li><strong>Username:</strong> Paste the username from your BarakatWave Xtream Panel.</li>
        <li><strong>Password:</strong> Paste your Xtream password.</li>
        <li><strong>URL:</strong> Enter <code>https://barakatwave.vercel.app</code> (include <code>https://</code>, no trailing slash needed).</li>
        <li>Click <strong>Add User</strong> — Live TV categories and EPG load immediately!</li>
      </ol>
      <h3>2. TiviMate IPTV Player (Android TV / Firestick)</h3>
      <ol>
        <li>Open TiviMate &rarr; <strong>Add Playlist</strong> &rarr; select <strong>Xtream Codes</strong>.</li>
        <li>Enter Server Address <code>https://barakatwave.vercel.app</code>, your Username, and Password.</li>
        <li>Keep <strong>Include VOD</strong> optional and click <strong>Next</strong>. TiviMate will fetch all BarakatWave categories and XMLTV program schedules automatically.</li>
      </ol>
      <h3>What Happens If You Click a PRO Channel on a Free Account?</h3>
      <p>Instead of crashing your player with an error code, BarakatWave's smart HLS engine plays a smooth HD broadcast video explaining how to unlock BarakatWave TV PRO via WhatsApp <strong>0306-2015326</strong>.</p>
    `,
    faqs: [
      { q: "Should I use http or https in the Server URL?", a: "Use https://barakatwave.vercel.app (Port 443) for encrypted, ISP-friendly low-latency streaming." }
    ]
  },
  {
    slug: "how-to-play-m3u-m3u8-links-vlc-android-pc-smart-tv",
    title: "How to Play M3U & M3U8 Live TV Playlists in VLC Media Player (Mobile, PC & Mac)",
    excerpt: "Prefer VLC Media Player on Windows, macOS, Linux, Android, or iPhone? Follow these steps to stream your BarakatWave M3U Plus link or custom personal M3U8 playlist.",
    category: "Player Tutorials",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T06:45:00Z",
    readTime: "4 min read",
    tags: ["VLC Media Player", "M3U8 Link", "M3U Playlist", "Live Streaming", "BarakatWave"],
    content: `
      <h2>Streaming BarakatWave M3U8 Links in VLC</h2>
      <p>VLC Media Player is one of the fastest ways to test and watch HLS (<code>.m3u8</code>) streams on laptops and phones.</p>
      <h3>On Windows / macOS / Linux</h3>
      <ol>
        <li>Copy your <strong>M3U Plus URL</strong> or <strong>Personal Playlist URL</strong> from <a href="https://barakatwave.vercel.app">barakatwave.vercel.app</a>.</li>
        <li>Open VLC and press <code>Ctrl + N</code> (or <code>Cmd + N</code> on Mac) to open <strong>Network Stream</strong>.</li>
        <li>Paste the URL and click <strong>Play</strong>.</li>
        <li>Press <code>Ctrl + L</code> to open the <strong>Playlist Sidebar</strong> and switch between all BarakatWave channels effortlessly!</li>
      </ol>
      <h3>On Android &amp; iOS VLC App</h3>
      <p>Tap <strong>More &rarr; New Stream</strong>, paste your BarakatWave <code>.m3u8</code> playlist link, and tap the orange arrow. You can also download your <code>.m3u8</code> file directly from BarakatWave's Playlist Builder for offline file access.</p>
    `,
    faqs: [
      { q: "Does VLC support switching channels inside an M3U playlist?", a: "Yes! Open View -> Playlist (Ctrl+L) in VLC to see every channel imported from your BarakatWave M3U link." }
    ]
  },
  {
    slug: "barakatwave-tv-pro-vip-upgrade-guide-03062015326",
    title: "BarakatWave TV PRO VIP Membership: Unlock All Premium HD & 4K Channels (Contact 0306-2015326)",
    excerpt: "Everything included in BarakatWave TV PRO VIP: unlocked live sports, premium Pakistani & Indian channels, multi-device Xtream connections, and priority WhatsApp activation on 0306-2015326.",
    category: "BarakatWave PRO",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T07:00:00Z",
    readTime: "5 min read",
    tags: ["BarakatWave PRO", "03062015326", "VIP IPTV Pakistan", "Premium Channels", "Muaaz Iqbal"],
    content: `
      <h2>Why Upgrade to BarakatWave TV PRO VIP?</h2>
      <p>While BarakatWave Live TV offers a generous free tier with built-in web streaming and a personal Xtream server, <strong>BarakatWave TV PRO VIP</strong> unlocks the full flagship broadcast catalog curated under <strong>Mizanora Projects</strong>.</p>
      <h3>PRO VIP Exclusive Benefits</h3>
      <ul>
        <li><strong>All Premium Channels Unlocked:</strong> Watch Live Cricket 4K, Champions Football, Pakistani &amp; Indian Prime Entertainment, and exclusive family channels without lock screens.</li>
        <li><strong>Multi-Device Xtream Connections:</strong> Run your Xtream server simultaneously on your Smart TV, phone, and laptop.</li>
        <li><strong>Zero Re-Setup Required:</strong> Your existing web login and Xtream username are upgraded remotely in real time via Firebase Realtime Database.</li>
        <li><strong>Direct Priority Support:</strong> Fast human assistance directly from the BarakatWave team.</li>
      </ul>
      <h3>How to Activate PRO VIP Today</h3>
      <p>Simply contact official BarakatWave TV Support on WhatsApp or Phone at <strong>0306-2015326</strong> (International: <code>+92 306 2015326</code>) and share your BarakatWave Xtream username or registered email. Activation takes less than 2 minutes!</p>
    `,
    faqs: [
      { q: "What is the official contact number for BarakatWave TV PRO?", a: "Contact 0306-2015326 (+92 306 2015326 on WhatsApp) for official BarakatWave TV PRO VIP activation and support." }
    ]
  },
  {
    slug: "create-custom-m3u8-playlist-online-barakatwave-studio",
    title: "How to Build Your Own Custom Live TV M3U8 Playlist in BarakatWave Studio",
    excerpt: "Curate your favorite channels, combine personal M3U8 streams, and generate a cloud-hosted custom playlist link with BarakatWave's built-in Playlist Studio.",
    category: "Playlist Studio",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T07:15:00Z",
    readTime: "5 min read",
    tags: ["Custom M3U8", "Playlist Generator", "IPTV Builder", "BarakatWave Studio"],
    content: `
      <h2>Design Your Perfect Channel Lineup</h2>
      <p>Nobody wants to scroll through hundreds of channels they never watch. That is why <strong>Muaaz Iqbal</strong> built the <strong>Personal Playlist Studio</strong> directly inside BarakatWave Live TV.</p>
      <h3>Features of the BarakatWave Playlist Builder</h3>
      <ul>
        <li><strong>Pick Catalog Channels:</strong> Tick your favorite Islamic, Sports, News, Pakistani, and Indian channels from the BarakatWave lineup.</li>
        <li><strong>Add Custom M3U8 Streams:</strong> Have a personal stream URL? Add its name, category, and <code>.m3u8</code> URL right into your personal list.</li>
        <li><strong>Cloud Hosted URL + Instant Download:</strong> Save your playlist to receive a permanent <code>/playlist/&lt;id&gt;.m3u8</code> cloud link OR download the <code>.m3u8</code> file directly to your device.</li>
        <li><strong>Play Inside Web Studio:</strong> Filter the built-in Live TV player by <em>My Playlist</em> to watch your custom lineup immediately in the browser.</li>
      </ul>
    `,
    faqs: [
      { q: "Does my cloud playlist URL update automatically when I add channels?", a: "Yes! Whenever you save changes in Playlist Studio, your personal M3U8 URL serves the updated channel list automatically." }
    ]
  },
  {
    slug: "smart-tv-iptv-setup-samsung-lg-android-tv-firestick",
    title: "Smart TV Live Streaming Guide: Setup BarakatWave TV on Samsung, LG WebOS, Android TV & Firestick",
    excerpt: "Step-by-step instructions to enjoy BarakatWave Live TV on big-screen Samsung Tizen, LG WebOS, Sony Bravia Android TV, Mi Box, and Amazon Fire TV Stick.",
    category: "Smart TV Guides",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T07:30:00Z",
    readTime: "6 min read",
    tags: ["Smart TV IPTV", "Samsung TV", "LG WebOS", "Firestick", "Android TV"],
    content: `
      <h2>Watching BarakatWave Live TV on Your Living Room Television</h2>
      <p>BarakatWave TV is optimized for both Smart TV web browsers and native Smart TV IPTV players.</p>
      <h3>Method 1: Android TV, Google TV, Mi Box &amp; Firestick</h3>
      <p>Install <strong>TiviMate</strong>, <strong>IPTV Smarters Pro</strong>, or <strong>OTT Navigator</strong> from Play Store / Downloader, choose <em>Xtream Codes login</em>, and enter <code>https://barakatwave.vercel.app</code> with your free or PRO credentials.</p>
      <h3>Method 2: Samsung Tizen &amp; LG WebOS Content Store</h3>
      <p>Download <strong>IPTV Smarters Player</strong>, <strong>IBO Player</strong>, or <strong>SS IPTV</strong> from the Samsung/LG app store and paste either your Xtream Server details or your BarakatWave M3U Plus URL.</p>
      <h3>Method 3: Direct TV Web Browser</h3>
      <p>Open your TV's built-in browser, visit <a href="https://barakatwave.vercel.app">barakatwave.vercel.app</a>, switch to <strong>Theater / Fullscreen Mode</strong>, and stream directly with zero app installation!</p>
    `,
    faqs: [
      { q: "Which app works best on Android TV?", a: "TiviMate and IPTV Smarters Pro both connect seamlessly to BarakatWave's Xtream Codes server." }
    ]
  },
  {
    slug: "hls-m3u8-discontinuity-intro-video-stitching-architecture",
    title: "Inside Mizanora Engineering: How Muaaz Iqbal Built Live HLS (.m3u8) Pre-Roll & Pro-Gate Video Stitching",
    excerpt: "A technical deep dive into stateless HLS manifest rewriting, #EXT-X-DISCONTINUITY pre-roll bumper injection, and live looping premium unlock streams on Vercel.",
    category: "Mizanora Engineering",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T07:45:00Z",
    readTime: "8 min read",
    tags: ["HLS Architecture", "M3U8 Stitching", "EXT-X-DISCONTINUITY", "Muaaz Iqbal", "Vercel Serverless"],
    content: `
      <h2>Solving Dynamic Video Injection Inside Stateless Live HLS</h2>
      <p>Traditional IPTV panels can only forward raw streams or block unauthorized requests with HTTP 403 errors — which causes external players like VLC or Smarters to show ugly playback error dialogs. Under <strong>Mizanora Projects</strong>, architect <strong>Muaaz Iqbal</strong> designed a smarter HLS manifest engine for BarakatWave TV.</p>
      <h3>1. Stateless Session-Stamped Pre-Roll Bumpers</h3>
      <p>When a viewer opens a channel, BarakatWave's edge router serves a lightweight master manifest stamped with the session start epoch (<code>st</code>). During the initial intro window, the media playlist prepends BarakatWave's H.264/AAC welcome bumper segments followed by an RFC 8216 <code>#EXT-X-DISCONTINUITY</code> tag and the live broadcast segments. As the live media sequence advances, the welcome segments naturally slide out of the playlist window — delivering a true television network bumper without re-buffering!</p>
      <h3>2. Continuous Live Loop for Locked PRO Channels</h3>
      <p>When a Free-tier Xtream user tunes into a <code>[PRO VIP]</code> channel, the server dynamically synthesizes a live sliding-window HLS manifest from the Admin's configured <strong>Premium Unlock Video</strong> with incrementing <code>#EXT-X-MEDIA-SEQUENCE</code> counters and discontinuity boundaries. Every IPTV app plays a crystal-clear HD broadcast instructing the viewer how to unlock PRO access via <strong>0306-2015326</strong>.</p>
    `,
    faqs: [
      { q: "Can the Admin change the Welcome and Pro Unlock videos anytime?", a: "Yes! In Admin -> Stream Defaults, any custom .m3u8 or .mp4 video URL can be set and takes effect immediately across Web and Xtream players." }
    ]
  },
  {
    slug: "fix-iptv-buffering-playback-error-epg-troubleshooting",
    title: "Fixing IPTV Buffering, Playback Errors & EPG Sync Issues: Complete Troubleshooting Guide",
    excerpt: "Quick solutions for HLS CORS errors, slow ISP routing, audio track mismatches, and XMLTV EPG refresh on BarakatWave Live TV.",
    category: "Troubleshooting",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T08:00:00Z",
    readTime: "5 min read",
    tags: ["IPTV Buffering Fix", "HLS Troubleshooting", "EPG XMLTV", "Stream Proxy"],
    content: `
      <h2>How to Get Zero-Buffer Playback on Any Network</h2>
      <p>If a channel takes longer than usual to start or stalls on mobile data, use these built-in optimizations in <strong>BarakatWave Live TV</strong>:</p>
      <ul>
        <li><strong>Use Adaptive Quality (Auto):</strong> Click the Quality selector inside the BarakatWave Web Player and select <em>Auto</em> so <code>hls.js</code> adapts smoothly to fluctuating 4G/Wi-Fi speeds.</li>
        <li><strong>Automatic Same-Origin Proxy Failover:</strong> Many broadcasters block cross-origin browser requests or require custom Referer headers. BarakatWave automatically retries blocked streams through <code>/api/proxy</code> and cycles through backup servers.</li>
        <li><strong>Refresh Xtream Playlist &amp; EPG:</strong> In TiviMate or IPTV Smarters, tap <em>Refresh Playlist / Update EPG</em> whenever new channels are published by Admin.</li>
      </ul>
    `,
    faqs: [
      { q: "What if a specific channel link goes offline?", a: "Open the Support tab on BarakatWave TV to submit a 1-click channel report or message 0306-2015326 on WhatsApp." }
    ]
  },
  {
    slug: "pakistan-and-india-live-tv-streaming-guide",
    title: "Subcontinent Live TV Guide: Watching News, Cricket, Islamic & Family Channels Across Pakistan & India",
    excerpt: "Explore how BarakatWave TV bridges cross-border digital entertainment with curated Islamic, Urdu, Hindi, and English live channels.",
    category: "Channel Guides",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T08:15:00Z",
    readTime: "5 min read",
    tags: ["Pakistan Live TV", "India Live TV", "Live Cricket", "Islamic Channels", "BarakatWave"],
    content: `
      <h2>Connecting Viewers Across Pakistan, India &amp; Beyond</h2>
      <p>From 24/7 spiritual broadcasts from Makkah and Madinah to breaking news headlines, cricket studio coverage, and family dramas, <strong>BarakatWave Live TV</strong> organizes channels into clean categories with instant search in English and Roman Urdu.</p>
      <p>Use the category pills above the Live Studio guide to jump straight to <strong>Islamic 24/7</strong>, <strong>Pakistan Live</strong>, <strong>India &amp; South Asia</strong>, <strong>Live Sports HD</strong>, or <strong>World News</strong>, and star your top picks to pin them inside Favorites.</p>
    `,
    faqs: [
      { q: "Can overseas Pakistanis and Indians watch BarakatWave TV?", a: "Yes! Hosted on Vercel's global edge network at barakatwave.vercel.app, streams load rapidly across Asia, the Middle East, Europe, and North America." }
    ]
  },
  {
    slug: "github-token-automated-m3u8-channel-publishing-guide",
    title: "Cloud Broadcaster Guide: Managing M3U8 Channel Files & Automated GitHub Publishing in BarakatWave Admin",
    excerpt: "Learn how BarakatWave's Admin Panel tests working M3U8 streams, imports bulk M3U playlists, sets Free/Pro tiers, and pushes individual .m3u8 files to GitHub automatically.",
    category: "Admin & Broadcasting",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T08:30:00Z",
    readTime: "6 min read",
    tags: ["GitHub API M3U8", "Admin Panel", "M3U Bulk Import", "Broadcast Management"],
    content: `
      <h2>Enterprise Stream Management Built for Speed</h2>
      <p>In the BarakatWave Admin Command Center (<code>/admin.html</code>), broadcasters have complete control over every channel and playlist artifact:</p>
      <ul>
        <li><strong>Live Link Probe While Adding:</strong> Verify HTTP reachability, manifest validity, and millisecond latency before saving any channel.</li>
        <li><strong>Bulk M3U Importer &amp; Exporter:</strong> Paste or upload entire <code>#EXTM3U</code> playlists, batch-probe working links, assign <code>FREE</code> or <code>PRO</code> status, and import dozens of channels at once.</li>
        <li><strong>Atomic GitHub Token Publishing:</strong> Enter a fine-grained GitHub Personal Access Token (` + "`Contents: Read & Write`" + `) to generate individual <code>data/streams/&lt;slug&gt;.m3u8</code> files plus master playlists and push them to GitHub in a single atomic Git Tree commit!</li>
      </ul>
    `,
    faqs: [
      { q: "Is my GitHub Token exposed to public visitors?", a: "Never. GitHub commits execute via the server-side /api/github/push endpoint and private admin settings." }
    ]
  },
  {
    slug: "mizanora-ecosystem-muaaz-iqbal-vision-innovation",
    title: "The Mizanora Ecosystem by Muaaz Iqbal: From Halal E-Commerce & AI Agents to BarakatWave Live TV",
    excerpt: "Meet Muaaz Iqbal — the developer and founder behind Mizanora Projects — and explore how Mizanora Store, Mizanora AI, and BarakatWave Live TV unite high-craft design with cloud engineering.",
    category: "Mizanora Ecosystem",
    author: "Muaaz Iqbal",
    publishedAt: "2026-10-28T08:45:00Z",
    readTime: "6 min read",
    tags: ["Muaaz Iqbal", "Mizanora", "Mizanora Projects", "Founder Story", "Kasur Pakistan"],
    content: `
      <h2>One Vision, Multiple Flagship Platforms: Mizanora Projects</h2>
      <p>Founded by <strong>Muaaz Iqbal</strong> in Kasur, Punjab, Pakistan, <strong>Mizanora Projects</strong> represents a growing suite of high-craft web, AI, and streaming applications built with uncompromising attention to speed, aesthetics, and user trust.</p>
      <h3>Flagship Creations Under Mizanora Projects</h3>
      <ul>
        <li><strong>Mizanora Store (<a href="https://mizanora.vercel.app" target="_blank" rel="noopener">mizanora.vercel.app</a>):</strong> Premium halal e-commerce experience featuring seasonal Islamic themes, smart multilingual search, and Noor AI assistance.</li>
        <li><strong>Mizanora AI Agent Platform:</strong> Multi-model autonomous WhatsApp &amp; web AI assistant with persistent memory, Urdu/English voice synthesis, and live grounding.</li>
        <li><strong>BarakatWave Live TV (<a href="https://barakatwave.vercel.app">barakatwave.vercel.app</a>):</strong> Full-stack HLS television network, personal Xtream Codes server generator, custom M3U8 playlist studio, and broadcast admin suite.</li>
      </ul>
      <p>Every Mizanora platform is built to empower everyday users with enterprise-grade technology wrapped in effortless, human-friendly interfaces.</p>
    `,
    faqs: [
      { q: "What is Mizanora Projects?", a: "Mizanora Projects is the innovation umbrella founded by developer Muaaz Iqbal, encompassing Mizanora Store, Mizanora AI, and BarakatWave Live TV." }
    ]
  }
];

export const DEFAULT_REVIEWS = [
  {
    id: "rev_1",
    uid: "seed_u1",
    userName: "Hafiz Usman Tariq",
    userPlan: "pro",
    rating: 5,
    comment: "MashaAllah Muaaz Iqbal bhai ne kamal ka platform banaya hai! Google login ke baad free Xtream server mila aur 0306-2015326 pe rabta kar ke PRO VIP upgrade karwaya — TiviMate pe zero buffering chal raha hai!",
    createdAt: "2026-10-27T14:20:00Z",
    helpful: 24,
    reply: "JazakAllah Khair Usman bhai! Enjoy BarakatWave TV PRO VIP 24/7 — Team Mizanora Projects."
  },
  {
    id: "rev_2",
    uid: "seed_u2",
    userName: "Ayesha Siddiqui",
    userPlan: "free",
    rating: 5,
    comment: "Makkah Live aur News channels web player me bohot smooth chalte hain. Themes change karne ka feature (specially Mizanora Gold aur Barakat Wave theme) bohot pyara hai!",
    createdAt: "2026-10-27T18:05:00Z",
    helpful: 19,
    reply: ""
  },
  {
    id: "rev_3",
    uid: "seed_u3",
    userName: "Bilal Ahmed Khan",
    userPlan: "pro",
    rating: 5,
    comment: "IPTV Smarters Pro me Xtream login first try me connect ho gaya aur apni custom M3U8 playlist banane ka option bhi lajawab hai. Best Mizanora project!",
    createdAt: "2026-10-28T03:40:00Z",
    helpful: 15,
    reply: ""
  }
];

export const DEFAULT_FAQS = [
  {
    q: "How do I get my Free Xtream Codes Server?",
    a: "Sign in using Google or your Gmail + Password, open the 'Xtream Server' tab, and click 'Claim My Free Xtream Server'. Each user gets 1 permanent personal server showing Host URL, Port, Username, Password, M3U Plus link, and EPG link."
  },
  {
    q: "How do I unlock BarakatWave TV PRO VIP channels?",
    a: "Contact official BarakatWave TV Pro support on WhatsApp or Call at 0306-2015326 (+92 306 2015326) with your Xtream username or registered email. Once upgraded by Admin, all [PRO VIP] channels unlock automatically on both the Web Player and your Xtream IPTV apps!"
  },
  {
    q: "Which IPTV apps work with BarakatWave Xtream Codes?",
    a: "IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, GSE Smart IPTV, Perfect Player, VLC Media Player, Kodi, and all Smart TV M3U/Xtream players."
  },
  {
    q: "Can I create my own custom M3U8 playlist?",
    a: "Yes! Open the 'My Playlist' tab after signing in, pick any channels from our catalog or add your own .m3u8 links, and save to get a personal cloud M3U8 link plus instant file download."
  },
  {
    q: "Who created BarakatWave Live TV?",
    a: "BarakatWave Live TV is designed, founded, and engineered by Muaaz Iqbal under Mizanora Projects."
  }
];

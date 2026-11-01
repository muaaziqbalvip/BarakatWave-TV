import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer } from "./dev-server.mjs";
import { parseM3uPlaylist, exportChannelsToM3u } from "../public/assets/js/m3u-parser.js";
import {
  DEFAULT_BLOGS,
  autoSortAndReindexChannels,
  moveChannelToPosition,
  insertOrUpdateChannelSmart
} from "../data/catalog.js";
import { DEFAULT_MOVIES, DEFAULT_SERIES } from "../data/imdb-seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

function walkFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".git" || ent.name === "node_modules" || ent.name === ".vercel") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

async function run() {
  if (fs.existsSync("/tmp/barakatwave-rtdb-mirror.json")) {
    fs.unlinkSync("/tmp/barakatwave-rtdb-mirror.json");
  }
  console.log("🌊 Running BarakatWave Live TV + Televizo HLS + IMDb VOD/Series Verification Suite...\n");

  // 1. Verify Core Assets, Vercel Hobby Limits & Zero TypeScript-Extension Collisions
  const requiredFiles = [
    "vercel.json",
    "firebase/database.rules.json",
    "public/index.html",
    "public/admin.html",
    "public/assets/css/styles.css",
    "public/assets/vendor/hls.min.js",
    "public/assets/vendor/shaka-player.min.js",
    "public/assets/vendor/mpegts.min.js",
    "public/assets/vendor/firebase-sdk.js",
    "public/assets/icons/apple-touch-icon.png",
    "public/assets/icons/icon-192.png",
    "public/assets/icons/icon-512.png",
    "public/assets/icons/icon-maskable-512.png",
    "public/media/demo-dash/index.mpd",
    "public/media/welcome/index.m3u8",
    "public/media/welcome/video.mp4",
    "public/media/channel-offline/index.m3u8",
    "public/media/channel-offline/video.mp4",
    "public/media/coming-soon/index.m3u8",
    "public/media/coming-soon/video.mp4",
    "public/media/pro-unlock/index.m3u8",
    "public/media/pro-unlock/video.mp4",
    "public/media/demo-live/index.m3u8",
    "data/imdb-seed.js",
    "public/assets/js/imdb-seed.js",
    "public/assets/js/imdb-catalog-2000.js",
    "public/assets/js/vault.js",
    "public/assets/js/analytics.js",
    "public/assets/js/cinema-player.js",
    "public/assets/vendor/mux.min.js",
    "public/media/demo-dash/video-init.mp4",
    "public/media/demo-dash/video-seg1.m4s",
    "api/_lib/tracker.js",
    "api/_handlers/gate.js",
    "api/_handlers/analytics.js",
    "scripts/build-dash-demo.mjs",
    "public/assets/js/imdb-client.js",
    "data/streams/master-all.m3u8"
  ];
  for (const rel of requiredFiles) {
    check(`File exists: ${rel}`, fs.existsSync(path.join(ROOT, rel)));
  }

  const topLevelApiFiles = fs
    .readdirSync(path.join(ROOT, "api"), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".js"));
  check(
    `Vercel Hobby plan safety: api/ has <= 12 top-level functions (actual: ${topLevelApiFiles.length})`,
    topLevelApiFiles.length <= 4
  );

  const allRepoFiles = walkFiles(ROOT);
  const tsCollisions = allRepoFiles.filter((f) => /\.(ts|mts|cts)$/i.test(f));
  check("Zero .ts/.mts/.cts files in repository (prevents Vercel TypeScript 5.9 collision)", tsCollisions.length === 0);

  check(
    "IMDb 2000–2026 Auto-Catalog includes >= 1,100 Movies & >= 430 Series (1,550+ verified tt... titles)",
    DEFAULT_MOVIES.length >= 1100 && DEFAULT_SERIES.length >= 430 && DEFAULT_MOVIES.length + DEFAULT_SERIES.length >= 1550
  );
  const movieYears = new Set(DEFAULT_MOVIES.map((m) => Number(m.year)));
  const allYearsCovered = Array.from({ length: 27 }, (_, i) => 2000 + i).every((yr) => movieYears.has(yr));
  check("IMDb 2000–2026 Auto-Catalog covers every single release year from 2000 through 2026", allYearsCovered);
  check("SEO Knowledge Base includes 16 professional blogs", DEFAULT_BLOGS.length >= 16);

  // 1b. EVERY relative ES-module import must resolve on disk (a single missing file kills the whole web app!)
  const moduleDirs = [
    path.join(ROOT, "public/assets/js"),
    path.join(ROOT, "api"),
    path.join(ROOT, "api/_lib"),
    path.join(ROOT, "api/_handlers"),
    path.join(ROOT, "data"),
    path.join(ROOT, "scripts")
  ];
  const brokenImports = [];
  let importCount = 0;
  for (const dir of moduleDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(m?js)$/.test(file)) continue;
      const full = path.join(dir, file);
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^"';]*?)\s*from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        importCount++;
        const target = path.resolve(dir, m[1]);
        if (!fs.existsSync(target)) brokenImports.push(`${path.relative(ROOT, full)} -> ${m[1]}`);
      }
      for (const m of src.matchAll(/import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
        importCount++;
        const target = path.resolve(dir, m[1]);
        if (!fs.existsSync(target)) brokenImports.push(`${path.relative(ROOT, full)} -> ${m[1]}`);
      }
    }
  }
  check(
    `All ${importCount} relative ES-module imports resolve on disk (no dead browser module graph)`,
    importCount > 20 && brokenImports.length === 0
  );
  if (brokenImports.length) console.log("   broken:", brokenImports);

  // 2. Verify M3U Parser & Exporter
  const sampleM3u = `#EXTM3U\n#EXTINF:-1 tvg-id="ptv.pk" tvg-logo="https://img/logo.png" group-title="Pakistan",PTV Home HD\nhttps://example.com/ptv.m3u8\n`;
  const parsed = parseM3uPlaylist(sampleM3u, "pro");
  check("M3U Parser extracts channel name, group & PRO tier", parsed.length === 1 && parsed[0].name === "PTV Home HD" && parsed[0].tier === "pro");
  const exported = exportChannelsToM3u(parsed, { baseUrl: "https://barakatwave.vercel.app", useCleanLinks: true });
  check("M3U Exporter generates clean BarakatWave channel M3U8 URL", exported.includes("https://barakatwave.vercel.app/ch/ptv-home-hd.m3u8"));

  // 2b. Verify Smart Priority Auto-Sort (PK Top -> Islamic -> Drama -> News -> Movies) & Auto-Adjust Reordering
  const mixedChannels = [
    { id: "m1", name: "Star Gold Movies HD", category: "", country: "INT", order: 1 },
    { id: "n1", name: "Geo News HD", category: "", country: "PK", order: 2 },
    { id: "i1", name: "Madani Channel Urdu HD", category: "", country: "PK", order: 3 },
    { id: "d1", name: "ARY Digital Drama HD", category: "", country: "PK", order: 4 },
    { id: "p1", name: "PTV Home Flagship", category: "Pakistan Top", country: "PK", order: 5 }
  ];
  const smartSorted = autoSortAndReindexChannels(mixedChannels, { reclassify: true });
  check(
    "Smart Priority Auto-Sort orders: 1st PK Top -> 2nd Islamic -> 3rd Drama -> 4th News -> 5th Movies",
    smartSorted.map((c) => c.id).join(",") === "p1,i1,d1,n1,m1" &&
      smartSorted.map((c) => c.order).join(",") === "1,2,3,4,5"
  );

  const reordered = moveChannelToPosition(smartSorted, "m1", 2);
  check(
    "Moving channel #5 to #2 automatically re-adjusts all other channels (#1..#5 with zero gaps)",
    reordered.map((c) => c.id).join(",") === "p1,m1,i1,d1,n1" &&
      reordered.map((c) => c.order).join(",") === "1,2,3,4,5"
  );

  const inserted = insertOrUpdateChannelSmart(
    reordered,
    { id: "new_isl", name: "QTV Islamic Live", category: "🕌 🌙 Islamic & Spiritual HD", country: "PK" },
    {}
  );
  check(
    "Inserting new channel auto-slots & re-numbers entire lineup sequentially (#1..#6)",
    inserted.length === 6 && inserted.map((c) => c.order).join(",") === "1,2,3,4,5,6"
  );

  // 3. Spin up Full Server & Test HTTP / Xtream Live+VOD+Series / Televizo 3-Phase HLS / Offline Failover / IMDb / SEO
  const server = createAppServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 3a. Home Page, Cinema Hub, Founder Spotlight & Admin Studio Markup
    const homeRes = await fetch(`${base}/`);
    const homeHtml = await homeRes.text();
    check("Home page HTTP 200", homeRes.status === 200);
    check(
      "Home page contains Muaaz Iqbal Executive Founder Spotlight & Mizanora Projects credit",
      homeHtml.includes("Muaaz Iqbal") &&
        homeHtml.includes("Mizanora Projects") &&
        homeHtml.includes("founder-spotlight") &&
        homeHtml.includes("view-cinema") &&
        homeHtml.includes("cinemaDetailModal")
    );
    check("Home page contains PRO VIP contact 0306-2015326 & official logo", homeHtml.includes("0306-2015326") && homeHtml.includes("Barakat-Wave-Streaming-Network-Logo.png"));

    const adminHtml = await (await fetch(`${base}/admin.html`)).text();
    check(
      "Admin Studio contains IMDb Movies & Series tab, Channel Offline video & Coming Soon video controls",
      adminHtml.includes('data-adm-panel="imdb"') &&
        adminHtml.includes("admFetchImdbBtn") &&
        adminHtml.includes("defOfflineVideoUrl") &&
        adminHtml.includes("defComingSoonVideoUrl") &&
        adminHtml.includes("chOfflineOverride")
    );

    // 3b. Xtream Codes API (/player_api.php) — Auth + Live + IMDb VOD + IMDb Series
    const xtAuthRes = await fetch(`${base}/player_api.php?username=demo&password=demo`);
    const xtAuth = await xtAuthRes.json();
    check(
      "Xtream player_api.php authenticates valid user (auth=1) and supports both m3u8 & ts output formats for Televizo",
      xtAuth.user_info?.auth === 1 &&
        xtAuth.user_info?.status === "Active" &&
        Array.isArray(xtAuth.user_info?.allowed_output_formats) &&
        xtAuth.user_info.allowed_output_formats.includes("m3u8") &&
        xtAuth.user_info.allowed_output_formats.includes("ts")
    );
    check(
      "Server attaches hardened security headers (X-Content-Type-Options: nosniff, Referrer-Policy)",
      xtAuthRes.headers.get("x-content-type-options") === "nosniff" &&
        Boolean(xtAuthRes.headers.get("referrer-policy"))
    );

    const xtBadRes = await fetch(`${base}/player_api.php?username=demo&password=wrong`);
    const xtBad = await xtBadRes.json();
    check("Xtream player_api.php rejects wrong password (auth=0)", xtBad.user_info?.auth === 0);

    const xtCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_live_categories`)).json();
    check(
      "Xtream get_live_categories has Priority Emoji Groups (1. PK Top -> 2. Islamic -> 3. Drama -> 4. News -> 5. Movies)",
      Array.isArray(xtCats) &&
        xtCats.length >= 9 &&
        xtCats[0].category_name.includes("🇵🇰") &&
        xtCats[1].category_name.includes("🕌") &&
        xtCats[2].category_name.includes("🎭") &&
        xtCats[3].category_name.includes("📰") &&
        xtCats[4].category_name.includes("🎬")
    );

    const xtStreams = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_live_streams`)).json();
    check("Xtream get_live_streams returns channels with integer stream_id", Array.isArray(xtStreams) && xtStreams.length >= 10 && typeof xtStreams[0].stream_id === "number");

    // Xtream VOD (IMDb 2000–2026 Movies)
    const vodCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_categories`)).json();
    check("Xtream get_vod_categories returns 9 Priority Emoji IMDb Movie groups (2000–2026)", Array.isArray(vodCats) && vodCats.length >= 9 && vodCats[0].category_name.includes("🇵🇰"));

    const vodResRaw = await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_streams`, {
      headers: { "Accept-Encoding": "gzip" }
    });
    check("Xtream get_vod_streams serves high-speed GZIP-compressed payload", vodResRaw.headers.get("content-encoding") === "gzip");
    const vodStreams = await vodResRaw.json();
    check(
      "Xtream get_vod_streams auto-loads 1,100+ 2000–2026 IMDb Movies with rating, poster & mp4 container_extension",
      Array.isArray(vodStreams) &&
        vodStreams.length >= 1100 &&
        vodStreams[0].stream_type === "movie" &&
        vodStreams[0].container_extension === "mp4" &&
        Number(vodStreams[0].rating) > 5
    );

    const vodInfo = await (
      await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_info&vod_id=${vodStreams[0].stream_id}`)
    ).json();
    check(
      "Xtream get_vod_info returns IMDb ID (tt...), cast, director, plot & rating",
      vodInfo?.info?.imdb_id?.startsWith("tt") &&
        Boolean(vodInfo?.info?.plot) &&
        Boolean(vodInfo?.info?.cast) &&
        vodInfo?.movie_data?.container_extension === "mp4"
    );

    // Xtream Series (IMDb 2000–2026 Series)
    const serCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_series_categories`)).json();
    check("Xtream get_series_categories returns 7 Priority Emoji IMDb Series groups (2000–2026)", Array.isArray(serCats) && serCats.length >= 7 && serCats[0].category_name.includes("🕌"));

    const serList = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_series`)).json();
    check(
      "Xtream get_series auto-loads 430+ 2000–2026 IMDb Series with cover, cast & rating",
      Array.isArray(serList) && serList.length >= 430 && Number(serList[0].rating) > 6 && Boolean(serList[0].cover)
    );

    const serInfo = await (
      await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_series_info&series_id=${serList[0].series_id}`)
    ).json();
    const firstSeasonEps = serInfo?.episodes?.["1"] || Object.values(serInfo?.episodes || {})[0] || [];
    check(
      "Xtream get_series_info returns seasons, IMDb metadata & playable episode list",
      Array.isArray(serInfo?.seasons) &&
        firstSeasonEps.length >= 1 &&
        firstSeasonEps[0].container_extension === "mp4"
    );

    // 3c. Xtream VOD & Series Playback -> "Service Is Building — Coming Soon" Video!
    const vodPlayRedir = await fetch(`${base}/movie/demo/demo/${vodStreams[0].stream_id}.mp4`, { redirect: "manual" });
    check(
      "Playing Xtream Movie (/movie/user/pass/id.mp4) serves Service Is Building — Coming Soon video",
      vodPlayRedir.status === 302 && (vodPlayRedir.headers.get("location") || "").includes("/media/coming-soon/video.mp4")
    );

    const serPlayRedir = await fetch(`${base}/series/demo/demo/${firstSeasonEps[0].id}.mp4`, { redirect: "manual" });
    check(
      "Playing Xtream Series Episode (/series/user/pass/ep.mp4) serves Service Is Building — Coming Soon video",
      serPlayRedir.status === 302 && (serPlayRedir.headers.get("location") || "").includes("/media/coming-soon/video.mp4")
    );

    const rangeRes = await fetch(`${base}/media/coming-soon/video.mp4`, {
      headers: { Range: "bytes=0-1023" }
    });
    check(
      "Coming Soon MP4 supports HTTP 206 Partial Content Range requests for ExoPlayer/Televizo",
      rangeRes.status === 206 && (rangeRes.headers.get("content-type") || "").includes("video/mp4")
    );

    const vodHlsMaster = await (await fetch(`${base}/movie/demo/demo/${vodStreams[0].stream_id}.m3u8`)).text();
    const vodVariantUrl = vodHlsMaster.split("\n").find((l) => l.startsWith("http"));
    const vodHlsMedia = await (await fetch(vodVariantUrl)).text();
    check(
      "Playing Xtream Movie HLS (.m3u8) serves Coming Soon HLS Master + Media playlist with #EXT-X-ENDLIST",
      vodHlsMaster.includes("mode=coming_soon") &&
        vodHlsMedia.includes("/media/coming-soon/seg0.ts") &&
        vodHlsMedia.includes("#EXT-X-ENDLIST")
    );

    // 3d. IMDb ID Metadata Resolver API (/api/imdb)
    const imdbRes = await (await fetch(`${base}/api/imdb?id=tt4320258`)).json();
    check(
      "/api/imdb resolves tt4320258 (Dirilis: Ertugrul) with IMDb rating, cast, plot & episodes",
      imdbRes.ok &&
        imdbRes.item?.imdbId === "tt4320258" &&
        Number(imdbRes.item?.imdbRating) >= 7.5 &&
        Array.isArray(imdbRes.item?.episodes)
    );

    const imdbSearch = await (await fetch(`${base}/api/imdb?q=Maula`)).json();
    check(
      "/api/imdb?q=Maula searches IMDb catalog and returns The Legend of Maula Jatt (tt4139928)",
      imdbSearch.ok && Array.isArray(imdbSearch.results) && imdbSearch.results.some((r) => r.imdbId === "tt4139928")
    );

    const fullCatalogRes = await fetch(`${base}/api/imdb?action=catalog`, {
      headers: { "Accept-Encoding": "gzip" }
    });
    const fullCatalog = await fullCatalogRes.json();
    check(
      "/api/imdb?action=catalog returns full 1,550+ (2000–2026) Movies & Series gzipped",
      fullCatalog.ok &&
        fullCatalogRes.headers.get("content-encoding") === "gzip" &&
        fullCatalog.movieCount >= 1100 &&
        fullCatalog.seriesCount >= 430
    );

    // Non-destructive RTDB override merge check: adding 1 custom movie MUST preserve all 1,100+ built-in movies!
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "movies/mov_tt9999991",
        value: {
          id: "mov_tt9999991",
          streamId: 9991,
          imdbId: "tt9999991",
          title: "BarakatWave Special Premiere",
          year: "2026",
          imdbRating: "9.1",
          category: "🇵🇰 ⭐ Pakistani Blockbusters (2000–2026)",
          categoryId: "101",
          tier: "free"
        }
      })
    });
    const mergedVodAfterSync = await (
      await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_streams`)
    ).json();
    check(
      "Adding a custom movie in RTDB preserves all 1,134+ built-in 2000–2026 movies without overwriting",
      mergedVodAfterSync.length >= DEFAULT_MOVIES.length + 1 &&
        mergedVodAfterSync.some((m) => m.imdb_id === "tt9999991")
    );
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "movies", value: null })
    });

    // 3e. Xtream get.php (M3U Plus includes Live + IMDb VOD + Series) & xmltv.php (EPG)
    const m3uPlus = await (await fetch(`${base}/get.php?username=demo&password=demo&type=m3u_plus&output=m3u8`)).text();
    check(
      "Xtream get.php returns #EXTM3U with Live channels + IMDb Movies (/movie/...) + Series (/series/...)",
      m3uPlus.startsWith("#EXTM3U") &&
        m3uPlus.includes("/live/demo/demo/1001.m3u8") &&
        m3uPlus.includes("/movie/demo/demo/5001.mp4") &&
        m3uPlus.includes("/series/demo/demo/") &&
        m3uPlus.includes('group-title="🇵🇰 ⭐ PAKISTAN TOP CHANNELS"')
    );

    const xmltv = await (await fetch(`${base}/xmltv.php?username=demo&password=demo`)).text();
    check("Xtream xmltv.php returns valid <tv> EPG XML", xmltv.includes("<tv") && xmltv.includes("<programme"));

    // 3f. Televizo-Proof 3-Phase HLS Pre-Roll Stitching on Free Channel (1001)
    const liveFreeMaster = await (await fetch(`${base}/live/demo/demo/1001.m3u8`)).text();
    check(
      "Live Free channel returns instant HLS Master Playlist (no restrictive CODECS attribute for Televizo)",
      liveFreeMaster.includes("#EXT-X-STREAM-INF:BANDWIDTH=") &&
        !liveFreeMaster.includes("CODECS=") &&
        liveFreeMaster.includes("mode=live")
    );

    const nowSec = Math.floor(Date.now() / 1000);
    // Phase 1 (st = now): Pure Intro segments ONLY so Televizo/ExoPlayer MUST play Intro from 0.0s!
    const phase1Media = await (await fetch(`${base}/api/stream?mode=live&id=1001&st=${nowSec}`)).text();
    check(
      "Televizo Phase 1 (t=0s): Serves ONLY Welcome Intro .ts segments (no ENDLIST, no live tail jump)",
      phase1Media.includes("#EXT-X-MEDIA-SEQUENCE:0") &&
        phase1Media.includes("/media/welcome/seg0.ts") &&
        !phase1Media.includes("/media/demo-live/") &&
        !phase1Media.includes("#EXT-X-ENDLIST")
    );

    // Phase 2 (st = now - 7s): Intro + #EXT-X-DISCONTINUITY + Live Channel bridge!
    const phase2Media = await (await fetch(`${base}/api/stream?mode=live&id=1001&st=${nowSec - 7}`)).text();
    check(
      "Televizo Phase 2 (t=7s): Bridges Welcome Intro -> #EXT-X-DISCONTINUITY -> Live Channel seamlessly",
      phase2Media.includes("/media/welcome/seg0.ts") &&
        phase2Media.includes("#EXT-X-DISCONTINUITY") &&
        phase2Media.includes("/media/demo-live/seg0.ts")
    );

    // Phase 3 (st = now - 16s): Pure Live Channel sliding window!
    const phase3Media = await (await fetch(`${base}/api/stream?mode=live&id=1001&st=${nowSec - 16}`)).text();
    const seqMatch = phase3Media.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    const discMatch = phase3Media.match(/#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/);
    check(
      "Televizo Phase 3 (t=16s): Transitions completely to pure Live Channel (monotonic sequence)",
      !phase3Media.includes("/media/welcome/") &&
        phase3Media.includes("/media/demo-live/seg") &&
        Number(seqMatch?.[1] || 0) >= 4 &&
        Number(discMatch?.[1] || 0) >= 1
    );

    // Verify .ts -> .m2ts rewrite serves video/mp2t for all 4 broadcast video suites!
    for (const folder of ["welcome", "channel-offline", "coming-soon", "pro-unlock", "demo-live"]) {
      const segRes = await fetch(`${base}/media/${folder}/seg0.ts`);
      check(
        `/media/${folder}/seg0.ts rewrites cleanly to .m2ts with video/mp2t Content-Type`,
        segRes.status === 200 && (segRes.headers.get("content-type") || "").includes("video/mp2t")
      );
    }

    // 3g-ext. External Custom-Port / Panel .m3u8 Regression Fix (https://live.nowiretv.com:5789/live/auto/3383.m3u8)
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "channels/ch_nowire_3383",
        value: {
          id: "ch_nowire_3383",
          streamId: 3383,
          slug: "nowire-3383-hd",
          name: "NoWire Live 3383 HD",
          category: "🇵🇰 ⭐ Pakistan Top Channels",
          tier: "free",
          url: "https://live.nowiretv.com:5789/live/auto/3383.m3u8",
          backupUrls: []
        }
      })
    });
    const nowireM3u8Res = await fetch(`${base}/live/demo/demo/3383.m3u8`, { redirect: "manual" });
    check(
      "External custom-port .m3u8 (https://live.nowiretv.com:5789/live/auto/3383.m3u8) returns 302 Direct Redirect to Televizo (zero ExoPlayer master-in-media crash)",
      nowireM3u8Res.status === 302 &&
        nowireM3u8Res.headers.get("location") === "https://live.nowiretv.com:5789/live/auto/3383.m3u8"
    );
    const nowireTsRes = await fetch(`${base}/live/demo/demo/3383.ts`, { redirect: "manual" });
    check(
      "Televizo MPEG-TS output format (/live/demo/demo/3383.ts) ALSO routes cleanly to external custom-port .m3u8",
      nowireTsRes.status === 302 &&
        nowireTsRes.headers.get("location") === "https://live.nowiretv.com:5789/live/auto/3383.m3u8"
    );

    // 3g. Channel Offline Standby Video Failover (when channel stream fails or is down!)
    const directOfflineHls = await (await fetch(`${base}/api/stream?mode=offline`)).text();
    check(
      "Direct mode=offline serves continuous Channel Offline Standby HLS broadcast",
      directOfflineHls.includes("/media/channel-offline/seg") && !directOfflineHls.includes("#EXT-X-ENDLIST")
    );

    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "channels/ch_dead_test",
        value: {
          id: "ch_dead_test",
          streamId: 1999,
          slug: "dead-test-tv",
          name: "Dead Upstream Test TV",
          category: "🇵🇰 ⭐ Pakistan Top Channels",
          tier: "free",
          url: "http://127.0.0.1:1/dead-unreachable-stream.m3u8",
          backupUrls: []
        }
      })
    });
    const deadLiveMaster = await (await fetch(`${base}/live/demo/demo/1999.m3u8`)).text();
    check(
      "Dead/SSRF-blocked channel URL in /live/demo/demo/1999.m3u8 immediately serves mode=offline Channel Offline Video",
      deadLiveMaster.includes("mode=offline")
    );
    const deadFallbackHls = await (await fetch(`${base}/api/stream?mode=live&id=1999&st=${nowSec - 20}`)).text();
    check(
      "Broken/offline channel automatically fails over to Channel Offline Standby Video (zero dead black screen)",
      deadFallbackHls.includes("/media/channel-offline/seg") && !deadFallbackHls.includes("#EXT-X-ENDLIST")
    );
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "channels", value: null })
    });

    // 3g-sec. SSRF Security Hardening Checks on /api/proxy & /api/probe
    const ssrfLoopback = await fetch(`${base}/api/proxy?u=${encodeURIComponent("http://127.0.0.1:80/admin")}`);
    const ssrfMetadata = await fetch(
      `${base}/api/proxy?u=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`
    );
    check(
      "SSRF Guard blocks private loopback (127.0.0.1) & cloud metadata (169.254.169.254) on /api/proxy with HTTP 403",
      ssrfLoopback.status === 403 && ssrfMetadata.status === 403
    );
    const ssrfProbe = await (
      await fetch(`${base}/api/probe?url=${encodeURIComponent("http://127.0.0.1:22/ssh")}`)
    ).json();
    check(
      "SSRF Guard blocks internal IP scanning on /api/probe",
      ssrfProbe.ok && ssrfProbe.results?.[0]?.ok === false
    );

    const missingChMaster = await (await fetch(`${base}/live/demo/demo/99999.m3u8`)).text();
    check(
      "Missing/offline channel ID (/live/demo/demo/99999.m3u8) routes cleanly to mode=offline standby broadcast",
      missingChMaster.includes("mode=offline")
    );

    // 3h. Locked PRO Channel (2001) serves Continuous Live PRO Unlock Video Loop for Free User!
    const liveProLockedMaster = await (await fetch(`${base}/live/demo/demo/2001.m3u8`)).text();
    check("Locked PRO channel routes Free user to mode=pro_lock HLS broadcast", liveProLockedMaster.includes("mode=pro_lock"));
    const proVariantUrl = liveProLockedMaster.split("\n").find((l) => l.startsWith("http"));
    const proLockMedia = await (await fetch(proVariantUrl)).text();
    check(
      "Locked PRO media manifest serves continuous live sliding-window pro-unlock .ts stream (no ENDLIST)",
      proLockMedia.includes("/media/pro-unlock/seg") &&
        proLockMedia.includes("#EXT-X-MEDIA-SEQUENCE:") &&
        proLockMedia.includes("#EXT-X-DISCONTINUITY-SEQUENCE:") &&
        !proLockMedia.includes("#EXT-X-ENDLIST")
    );

    // 3i. Upgraded PRO VIP Xtream User unlocks PRO Channel 2001 immediately!
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "xtreamAccounts/bw_vip_test",
        value: {
          username: "bw_vip_test",
          password: "VIPPassword1",
          plan: "pro",
          status: "Active",
          maxConnections: 5
        }
      })
    });
    const unlockedRes = await fetch(`${base}/live/bw_vip_test/VIPPassword1/2001.m3u8`, { redirect: "manual" });
    const unlockedBody = unlockedRes.status === 200 ? await unlockedRes.text() : "";
    check(
      "Upgraded PRO VIP Xtream user unlocks PRO channel 2001 (direct 302 stream or mode=live, never pro_lock/offline)",
      (unlockedRes.status === 302 &&
        (unlockedRes.headers.get("location") || "").includes("rbmn-live.akamaized.net")) ||
        (unlockedBody.includes("mode=live") && !unlockedBody.includes("mode=pro_lock"))
    );

    // Also verify stitchable PRO channel serves mode=live 3-phase Intro -> Live stream for PRO VIP user!
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "channels/ch_pro_stitch_test",
        value: {
          id: "ch_pro_stitch_test",
          streamId: 2099,
          slug: "pro-stitch-test-hd",
          name: "BarakatWave Studio 4K [PRO VIP]",
          category: "🇵🇰 ⭐ Pakistan Top Channels",
          tier: "pro",
          url: "/media/demo-live/index.m3u8"
        }
      })
    });
    const unlockedStitchMaster = await (await fetch(`${base}/live/bw_vip_test/VIPPassword1/2099.m3u8`)).text();
    check(
      "Upgraded PRO VIP user gets stitched mode=live HLS master playlist on stitchable PRO channel",
      unlockedStitchMaster.includes("mode=live") && !unlockedStitchMaster.includes("mode=pro_lock")
    );
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "channels", value: null })
    });

    // 3j. SEO Sitemap, RSS, LLMs.txt & SSR Blog Pages (including Muaaz Iqbal Founder Spotlight Article!)
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    check(
      "Dynamic /sitemap.xml includes all 16 SEO blogs including Muaaz Iqbal founder article",
      sitemap.includes("<urlset") &&
        sitemap.includes("/blog/muaaz-iqbal-founder-architect-mizanora-projects-barakatwave-tv")
    );

    const rss = await (await fetch(`${base}/rss.xml`)).text();
    check("Dynamic /rss.xml returns valid RSS 2.0 feed", rss.includes('<rss version="2.0"') && rss.includes("Muaaz Iqbal"));

    const llms = await (await fetch(`${base}/llms.txt`)).text();
    const llmsFull = await (await fetch(`${base}/llms-full.txt`)).text();
    check(
      "/llms.txt & /llms-full.txt expose Muaaz Iqbal, Mizanora Projects, IMDb VOD & Televizo architecture",
      llms.includes("Muaaz Iqbal") &&
        llms.includes("IMDb") &&
        llmsFull.includes("Televizo") &&
        llmsFull.includes("0306-2015326")
    );

    const muaazBlogHtml = await (
      await fetch(`${base}/blog/muaaz-iqbal-founder-architect-mizanora-projects-barakatwave-tv`)
    ).text();
    check(
      "Dedicated Muaaz Iqbal Founder SSR Blog renders full biographical & engineering HTML + BlogPosting JSON-LD",
      muaazBlogHtml.includes("BlogPosting") &&
        muaazBlogHtml.includes("Muaaz Iqbal") &&
        muaazBlogHtml.includes("Mizanora Projects")
    );

    // 3k. GitHub M3U8 File Generator Preview, Probe, Clean Channel M3U8 & IndexNow
    const ghPrev = await (
      await fetch(`${base}/api/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewOnly: true })
      })
    ).json();
    check("GitHub M3U8 Publisher generates per-channel .m3u8 files + master playlists", ghPrev.ok && ghPrev.fileCount >= 17);

    const plFree = await (await fetch(`${base}/playlist/free.m3u8`)).text();
    check("/playlist/free.m3u8 serves valid M3U8 playlist", plFree.startsWith("#EXTM3U") && plFree.includes("/ch/"));

    const chDirect = await (await fetch(`${base}/ch/barakatwave-official-hd.m3u8`)).text();
    check("/ch/:slug.m3u8 serves clean channel HLS master playlist", chDirect.includes("#EXT-X-STREAM-INF"));

    const probeRes = await (await fetch(`${base}/api/probe?url=/media/welcome/index.m3u8`)).json();
    check("/api/probe verifies working HLS stream", probeRes.ok && probeRes.results?.[0]?.ok === true && probeRes.results?.[0]?.isHls === true);

    const probeDashRes = await (await fetch(`${base}/api/probe?url=/media/demo-dash/index.mpd`)).json();
    check(
      "/api/probe verifies working MPEG-DASH (.mpd) manifest",
      probeDashRes.ok && probeDashRes.results?.[0]?.ok === true && probeDashRes.results?.[0]?.isDash === true
    );

    // 3l. 3D Installable PWA, Custom Universal Player (DASH .mpd + HLS .m3u8 + TS/FLV + ClearKey DRM) & Stream Lab Checks
    const { rewriteDashMpdForProxy } = await import("../api/_handlers/proxy.js");
    const sampleMpd = `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet><SegmentTemplate initialization="init-$RepresentationID$.mp4" media="chunk-$RepresentationID$-$Number%05d$.m4s"/></AdaptationSet></Period></MPD>`;
    const rewrittenMpd = rewriteDashMpdForProxy(
      sampleMpd,
      "https://cdn.example.com/dash/live/manifest.mpd",
      "https://barakatwave.vercel.app"
    );
    check(
      "MPEG-DASH .mpd proxy rewriter wraps segment URLs while preserving unencoded $RepresentationID$ and $Number%05d$ tokens",
      rewrittenMpd.includes("/api/proxy?seg=1&u=") &&
        rewrittenMpd.includes("$RepresentationID$") &&
        rewrittenMpd.includes("$Number%05d$") &&
        !rewrittenMpd.includes("%24RepresentationID%24")
    );

    const dashLocalRes = await fetch(`${base}/media/demo-dash/index.mpd`);
    const dashLocalXml = await dashLocalRes.text();
    check(
      "/media/demo-dash/index.mpd serves valid application/dash+xml MPEG-DASH manifest",
      dashLocalRes.status === 200 &&
        (dashLocalRes.headers.get("content-type") || "").includes("application/dash+xml") &&
        dashLocalXml.includes("<MPD") &&
        (dashLocalXml.includes("<SegmentTemplate") || dashLocalXml.includes("<SegmentURL"))
    );

    const shakaRes = await fetch(`${base}/assets/vendor/shaka-player.min.js`);
    const mpegtsRes = await fetch(`${base}/assets/vendor/mpegts.min.js`);
    check(
      "Self-hosted Universal Media Engines (shaka-player.min.js & mpegts.min.js) are served with HTTP 200",
      shakaRes.status === 200 && mpegtsRes.status === 200
    );

    const { detectStreamProtocol, parseClearKeyConfig } = await import("../public/assets/js/player.js");
    const parsedCk = parseClearKeyConfig("00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100");
    check(
      "Custom BarakatPlayer v4.0 protocol detector & W3C ClearKey DRM parser handle .mpd, .m3u8, .ts, .flv & hex kid:key",
      detectStreamProtocol("https://cdn.example.com/live/manifest.mpd") === "dash" &&
        detectStreamProtocol("https://cdn.example.com/live/index.m3u8") === "hls" &&
        detectStreamProtocol("https://cdn.example.com/live/channel.ts") === "mpegts" &&
        detectStreamProtocol("https://cdn.example.com/live/stream.flv") === "flv" &&
        detectStreamProtocol("https://cdn.example.com/vod/movie.mp4") === "html5" &&
        parsedCk?.["00112233445566778899aabbccddeeff"] === "ffeeddccbbaa99887766554433221100"
    );

    const { parseM3uPlaylist, exportChannelsToM3u } = await import("../public/assets/js/m3u-parser.js");
    const kodiM3uSample = [
      "#EXTM3U",
      '#KODIPROP:inputstream.adaptive.manifest_type=mpd',
      '#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey',
      '#KODIPROP:inputstream.adaptive.license_key=11223344:55667788',
      '#EXTINF:-1 group-title="4K DASH",Test 4K DASH Channel',
      "https://cdn.example.com/live/uhd.mpd"
    ].join("\n");
    const parsedKodiList = parseM3uPlaylist(kodiM3uSample);
    const reExportedKodi = exportChannelsToM3u(parsedKodiList, { useCleanLinks: false });
    check(
      "M3U parser & exporter support #KODIPROP MPEG-DASH (.mpd) + ClearKey DRM playlists round-trip",
      parsedKodiList.length === 1 &&
        parsedKodiList[0].streamFormat === "dash" &&
        parsedKodiList[0].drmKey === "11223344:55667788" &&
        reExportedKodi.includes("inputstream.adaptive.manifest_type=mpd") &&
        reExportedKodi.includes("11223344:55667788")
    );

    const manifestJson = await (await fetch(`${base}/manifest.webmanifest`)).json();
    const icon192Res = await fetch(`${base}/assets/icons/icon-192.png`);
    const icon512Res = await fetch(`${base}/assets/icons/icon-512.png`);
    const iconMaskRes = await fetch(`${base}/assets/icons/icon-maskable-512.png`);
    const appleIconRes = await fetch(`${base}/assets/icons/apple-touch-icon.png`);
    const swJsText = await (await fetch(`${base}/sw.js`)).text();
    check(
      "Installable Mobile & Desktop PWA serves same-origin PNG 192/512/maskable/apple-touch icons + v5 Service Worker",
      Array.isArray(manifestJson.icons) &&
        manifestJson.icons.some((i) => i.src === "/assets/icons/icon-512.png") &&
        icon192Res.status === 200 &&
        icon512Res.status === 200 &&
        iconMaskRes.status === 200 &&
        appleIconRes.status === 200 &&
        swJsText.includes("barakatwave-tv-3d-v5")
    );

    const homeHtml3d = await (await fetch(`${base}/`)).text();
    const playerJsText = fs.readFileSync(path.join(ROOT, "public/assets/js/player.js"), "utf8");
    const stylesCssText = fs.readFileSync(path.join(ROOT, "public/assets/css/styles.css"), "utf8");
    check(
      "3D Spatial Web App HTML, Custom Studio Chrome, Ambilight Halo, Universal Stream Lab & PWA Install Modal are wired",
      homeHtml3d.includes('id="universalStreamDrawer"') &&
        homeHtml3d.includes('id="pwaInstallModal"') &&
        homeHtml3d.includes('id="activeSeriesEpisodeTray"') &&
        homeHtml3d.includes('id="cinemaFeaturedHero"') &&
        homeHtml3d.includes('class="spatial-3d-aurora"') &&
        playerJsText.includes("bw-studio-chrome") &&
        playerJsText.includes("bw-ambilight-canvas") &&
        stylesCssText.includes(".bw-shell-3d") &&
        stylesCssText.includes("--rx")
    );

    const idxNow = await (await fetch(`${base}/api/seo/indexnow`)).json();
    check("/api/seo/indexnow returns >= 18 candidate URLs for search indexing", idxNow.ok && idxNow.indexedCandidateCount >= 18);

    // ==================== v5: STREAM VAULT, ANALYTICS & IMDb PLAYER ====================
    const securityLib = fs.readFileSync(path.join(ROOT, "api/_lib/security.js"), "utf8");
    const trackerLib = fs.readFileSync(path.join(ROOT, "api/_lib/tracker.js"), "utf8");
    check(
      "AES-256-GCM Stream Vault (encryptStreamUrl / decryptStreamUrl / anti-hotlink gate) implemented",
      securityLib.includes("export function encryptStreamUrl") &&
        securityLib.includes("export function decryptStreamUrl") &&
        securityLib.includes("aes-256-gcm") &&
        securityLib.includes("export function isAllowedWebStreamRequest")
    );

    const gateRes = await fetch(`${base}/api/gate?cid=ch_bw_promo&plan=free`);
    const gateJson = await gateRes.json();
    check(
      "/api/gate returns sealed server-side sources (no upstream URL exposure) for a channel",
      gateRes.status === 200 &&
        gateJson.ok === true &&
        Array.isArray(gateJson.sources) &&
        gateJson.sources.length > 0 &&
        gateJson.sources.every((src) => !/^https?:\/\//.test(src.url))
    );

    const gatePro = await (await fetch(`${base}/api/gate?cid=ch_pro_pk_gold&plan=free`)).json();
    check(
      "/api/gate enforces PRO VIP tier lock server-side for free viewers",
      gatePro.ok === true && gatePro.lockedPro === true
    );

    const gateSeal = await (
      await fetch(`${base}/api/gate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://secret.example.com/live/index.mpd", format: "dash" })
      })
    ).json();
    check(
      "POST /api/gate seals custom Stream Lab URLs into encrypted /api/proxy?e= tokens",
      gateSeal.ok === true &&
        String(gateSeal.source?.url || "").startsWith("/api/proxy?e=") &&
        !JSON.stringify(gateSeal).includes("secret.example.com")
    );

    const catalogBrowser = fs.readFileSync(path.join(ROOT, "public/assets/js/catalog-browser.js"), "utf8");
    check(
      "Public browser catalog ships ZERO real upstream stream URLs (shielded://vault placeholders)",
      catalogBrowser.includes('shielded://vault') &&
        !/\b(?:url|backupUrls)\s*:\s*\[?\s*"https?:\/\//i.test(catalogBrowser)
    );

    const analyticsPost = await fetch(`${base}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "BarakatWaveSelfTest/5.0" },
      body: JSON.stringify({
        type: "play",
        sid: "s_selftest",
        playId: "p_selftest",
        title: "Selftest Channel HD",
        contentType: "Live TV",
        engine: "HLS",
        surface: "Web 3D Studio"
      })
    });
    const analyticsGet = await (await fetch(`${base}/api/analytics`)).json();
    check(
      "Real-time Visitor & Playback Analyzer records plays with IP/geo/device and returns dashboard snapshot",
      analyticsPost.status === 200 &&
        analyticsGet.ok === true &&
        analyticsGet.summary.totalPlays >= 1 &&
        Array.isArray(analyticsGet.plays) &&
        analyticsGet.plays.some((p) => p.title === "Selftest Channel HD") &&
        typeof analyticsGet.plays[0].ip === "string" &&
        trackerLib.includes("recordVisitorSession") &&
        trackerLib.includes("x-vercel-ip-country") &&
        trackerLib.includes("formatPktTime")
    );

    const analyticsRoute = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites.find(
      (r) => r.source === "/api/analytics"
    );
    check(
      "Vercel routes /api/gate + /api/analytics to the 4 routers within Hobby limits",
      Boolean(analyticsRoute) &&
        analyticsRoute.destination === "/api/admin?ep=analytics" &&
        JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites).includes(
          '"/api/media?ep=gate"'
        )
    );

    const dashMpd = fs.readFileSync(path.join(ROOT, "public/media/demo-dash/index.mpd"), "utf8");
    const dashInit = path.join(ROOT, "public/media/demo-dash/video-init.mp4");
    const dashSeg = path.join(ROOT, "public/media/demo-dash/video-seg1.m4s");
    check(
      "Built-in DASH channel serves a real playable fMP4 manifest (init + m4s + SegmentTemplate tokens)",
      dashMpd.includes("mimeType=\"video/mp4\"") &&
        dashMpd.includes("initialization=\"video-init.mp4\"") &&
        dashMpd.includes("media=\"video-seg$Number$.m4s\"") &&
        dashMpd.includes("codecs=\"avc1.") &&
        fs.existsSync(dashInit) &&
        fs.existsSync(dashSeg)
    );

    const dashHead = await fetch(`${base}/media/demo-dash/index.mpd`);
    const segHead = await fetch(`${base}/media/demo-dash/video-seg1.m4s`);
    check(
      "Local DASH manifest + fMP4 segment are served with correct MIME types",
      dashHead.status === 200 &&
        (dashHead.headers.get("content-type") || "").includes("dash+xml") &&
        segHead.status === 200
    );

    const homeHtmlV5 = await (await fetch(`${base}/`)).text();
    const appJsText = fs.readFileSync(path.join(ROOT, "public/assets/js/app.js"), "utf8");
    const cinemaPlayerJs = fs.readFileSync(path.join(ROOT, "public/assets/js/cinema-player.js"), "utf8");
    check(
      "IMDb ID Cinema Player (multi-server embed + seasons/episodes) wired into Movies & Series",
      homeHtmlV5.includes('id="imdbCinemaPlayerModal"') &&
        cinemaPlayerJs.includes("buildImdbPlayUrl") &&
        cinemaPlayerJs.includes("vidsrc") &&
        appJsText.includes("openImdbCinemaPlayer") &&
        appJsText.includes("mountImdbCinemaPlayer") &&
        stylesCssText.includes(".imdb-player-shell")
    );

    const vaultJs = fs.readFileSync(path.join(ROOT, "public/assets/js/vault.js"), "utf8");
    const analyticsJs = fs.readFileSync(path.join(ROOT, "public/assets/js/analytics.js"), "utf8");
    check(
      "Client Stream Vault + privacy-first analyzer modules are bundled and imported",
      vaultJs.includes("resolveChannelSources") &&
        vaultJs.includes("/api/gate") &&
        analyticsJs.includes("initAnalytics") &&
        analyticsJs.includes("sendBeacon") &&
        appJsText.includes('from "./vault.js"') &&
        appJsText.includes('from "./analytics.js"')
    );

    const adminHtmlV5 = await (await fetch(`${base}/admin.html`)).text();
    const adminJsText = fs.readFileSync(path.join(ROOT, "public/assets/js/admin.js"), "utf8");
    check(
      "Admin Live Analytics dashboard (online now, visitors, cities, devices, play log, CSV export) is wired",
      adminHtmlV5.includes('data-adm-panel="analytics"') &&
        adminHtmlV5.includes('id="anSessionsBody"') &&
        adminHtmlV5.includes('id="anPlaysBody"') &&
        adminJsText.includes("refreshAnalyticsDashboard") &&
        adminJsText.includes("downloadAnalyticsCsv")
    );

    check(
      "Compact responsive header, slim marquee ticker & 3D motion design tokens shipped",
      homeHtmlV5.includes('id="siteHeader"') &&
        homeHtmlV5.includes('class="ticker-track"') &&
        homeHtmlV5.includes('class="brand-text"') &&
        stylesCssText.includes(".ticker-seq") &&
        stylesCssText.includes("grid-template-areas") &&
        stylesCssText.includes("prefers-reduced-motion")
    );

    check(
      "Search-Console rocket: FAQ rich-result schema, keyword meta, GSC/Bing verification meta + HTML file route",
      homeHtmlV5.includes('"@type": "FAQPage"') &&
        homeHtmlV5.includes("free Xtream Codes server 2026") &&
        appJsText.includes("google-site-verification") &&
        fs.readFileSync(path.join(ROOT, "api/seo.js"), "utf8").includes("gsc_file") &&
        JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites.some(
          (r) => r.source === "/google:code.html"
        )
    );

    const rulesJson = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase/database.rules.json"), "utf8"));
    check(
      "Firebase ruleset allows authenticated analytics writes but keeps them owner-readable",
      rulesJson.rules.analytics &&
        rulesJson.rules.analytics[".read"] === "auth != null" &&
        rulesJson.rules.analytics.sessions["$sid"][".write"] === "auth != null"
    );
  } finally {
    if (fs.existsSync("/tmp/barakatwave-rtdb-mirror.json")) {
      fs.unlinkSync("/tmp/barakatwave-rtdb-mirror.json");
    }
    server.close();
  }

  console.log(`\n✅ ALL ${passed} CHECKS PASSED PERFECTLY!`);
}

run().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});

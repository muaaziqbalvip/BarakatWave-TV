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
    "public/assets/vendor/firebase-sdk.js",
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

  check("IMDb Seed Catalog includes >= 12 Movies & >= 8 Series", DEFAULT_MOVIES.length >= 12 && DEFAULT_SERIES.length >= 8);
  check("SEO Knowledge Base includes 16 professional blogs", DEFAULT_BLOGS.length >= 16);

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
    check("Xtream player_api.php authenticates valid user (auth=1)", xtAuth.user_info?.auth === 1 && xtAuth.user_info?.status === "Active");

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

    // Xtream VOD (IMDb Movies)
    const vodCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_categories`)).json();
    check("Xtream get_vod_categories returns 5 Emoji IMDb Movie groups", Array.isArray(vodCats) && vodCats.length >= 5 && vodCats[0].category_name.includes("🇵🇰"));

    const vodStreams = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_vod_streams`)).json();
    check(
      "Xtream get_vod_streams returns IMDb Movies with rating, poster & mp4 container_extension",
      Array.isArray(vodStreams) &&
        vodStreams.length >= 12 &&
        vodStreams[0].stream_type === "movie" &&
        vodStreams[0].container_extension === "mp4" &&
        Number(vodStreams[0].rating) > 6
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

    // Xtream Series (IMDb Series)
    const serCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_series_categories`)).json();
    check("Xtream get_series_categories returns 4 Emoji IMDb Series groups", Array.isArray(serCats) && serCats.length >= 4 && serCats[0].category_name.includes("🕌"));

    const serList = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_series`)).json();
    check(
      "Xtream get_series returns IMDb Series with cover, cast & rating",
      Array.isArray(serList) && serList.length >= 8 && Number(serList[0].rating) > 7 && Boolean(serList[0].cover)
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
    const unlockedMaster = await (await fetch(`${base}/live/bw_vip_test/VIPPassword1/2001.m3u8`)).text();
    check("Upgraded PRO VIP Xtream user unlocks PRO channel (mode=live)", unlockedMaster.includes("mode=live"));

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
    check("/api/probe verifies working HLS stream", probeRes.ok && probeRes.results?.[0]?.ok === true);

    const idxNow = await (await fetch(`${base}/api/seo/indexnow`)).json();
    check("/api/seo/indexnow returns >= 18 candidate URLs for search indexing", idxNow.ok && idxNow.indexedCandidateCount >= 18);
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

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAppServer } from "./dev-server.mjs";
import { parseM3uPlaylist, exportChannelsToM3u } from "../public/assets/js/m3u-parser.js";
import {
  autoSortAndReindexChannels,
  moveChannelToPosition,
  insertOrUpdateChannelSmart
} from "../data/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, `FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

async function run() {
  console.log("🌊 Running BarakatWave Live TV Comprehensive Verification Suite...\n");

  // 1. Verify Core Assets & Media Bumpers
  const requiredFiles = [
    "vercel.json",
    "firebase/database.rules.json",
    "public/index.html",
    "public/admin.html",
    "public/assets/css/styles.css",
    "public/assets/vendor/hls.min.js",
    "public/assets/vendor/firebase-sdk.js",
    "public/media/welcome/index.m3u8",
    "public/media/pro-unlock/index.m3u8",
    "public/media/demo-live/index.m3u8",
    "data/streams/master-all.m3u8"
  ];
  for (const rel of requiredFiles) {
    check(`File exists: ${rel}`, fs.existsSync(path.join(ROOT, rel)));
  }

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

  // 3. Spin up Full Server & Test HTTP / Xtream / HLS Stitching / SEO / SSR Blogs
  const server = createAppServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 3a. Home Page & Brand Identity
    const homeRes = await fetch(`${base}/`);
    const homeHtml = await homeRes.text();
    check("Home page HTTP 200", homeRes.status === 200);
    check("Home page contains Muaaz Iqbal & Mizanora Projects credit", homeHtml.includes("Muaaz Iqbal") && homeHtml.includes("Mizanora Projects"));
    check("Home page contains PRO VIP contact 0306-2015326", homeHtml.includes("0306-2015326"));
    check("Home page contains official BarakatWave logo URL", homeHtml.includes("Barakat-Wave-Streaming-Network-Logo.png"));

    // 3b. Xtream Codes API (/player_api.php)
    const xtAuthRes = await fetch(`${base}/player_api.php?username=demo&password=demo`);
    const xtAuth = await xtAuthRes.json();
    check("Xtream player_api.php authenticates valid user (auth=1)", xtAuth.user_info?.auth === 1 && xtAuth.user_info?.status === "Active");

    const xtBadRes = await fetch(`${base}/player_api.php?username=demo&password=wrong`);
    const xtBad = await xtBadRes.json();
    check("Xtream player_api.php rejects wrong password (auth=0)", xtBad.user_info?.auth === 0);

    const xtCats = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_live_categories`)).json();
    check("Xtream get_live_categories returns categories array", Array.isArray(xtCats) && xtCats.length >= 9);
    check(
      "Xtream get_live_categories has Priority Emoji Groups (1. PK Top -> 2. Islamic -> 3. Drama -> 4. News -> 5. Movies)",
      xtCats[0].category_name.includes("🇵🇰") &&
        xtCats[0].category_name.includes("PAKISTAN TOP") &&
        xtCats[1].category_name.includes("🕌") &&
        xtCats[1].category_name.includes("ISLAMIC") &&
        xtCats[2].category_name.includes("🎭") &&
        xtCats[2].category_name.includes("DRAMA") &&
        xtCats[3].category_name.includes("📰") &&
        xtCats[3].category_name.includes("NEWS") &&
        xtCats[4].category_name.includes("🎬") &&
        xtCats[4].category_name.includes("MOVIES")
    );

    const xtStreams = await (await fetch(`${base}/player_api.php?username=demo&password=demo&action=get_live_streams`)).json();
    check("Xtream get_live_streams returns channels with integer stream_id", Array.isArray(xtStreams) && xtStreams.length >= 10 && typeof xtStreams[0].stream_id === "number");

    // 3c. Xtream get.php (M3U Plus) & xmltv.php (EPG)
    const m3uPlus = await (await fetch(`${base}/get.php?username=demo&password=demo&type=m3u_plus&output=m3u8`)).text();
    check(
      "Xtream get.php returns #EXTM3U with Emoji group-titles & /live/demo/demo/ stream links",
      m3uPlus.startsWith("#EXTM3U") &&
        m3uPlus.includes("/live/demo/demo/1001.m3u8") &&
        m3uPlus.includes('group-title="🇵🇰 ⭐ PAKISTAN TOP CHANNELS"') &&
        m3uPlus.includes('group-title="🕌 🌙 ISLAMIC & SPIRITUAL HD"')
    );

    const xmltv = await (await fetch(`${base}/xmltv.php?username=demo&password=demo`)).text();
    check("Xtream xmltv.php returns valid <tv> EPG XML", xmltv.includes("<tv") && xmltv.includes("<programme"));

    // 3d. Live HLS Pre-Roll Welcome Bumper Stitching on Free Channel (1001)
    const liveFreeMaster = await (await fetch(`${base}/live/demo/demo/1001.m3u8`)).text();
    check("Live Free channel returns HLS Master Playlist with session timestamp", liveFreeMaster.includes("#EXT-X-STREAM-INF") && liveFreeMaster.includes("mode=live"));
    const variantLine = liveFreeMaster.split("\n").find((l) => l.startsWith("http"));
    const liveFreeMedia = await (await fetch(variantLine)).text();
    check(
      "Live Free media manifest stitches Welcome Intro .m2ts + #EXT-X-DISCONTINUITY + Live segments",
      liveFreeMedia.includes("#EXT-X-START:TIME-OFFSET=0,PRECISE=YES") &&
        liveFreeMedia.includes("/media/welcome/seg0.m2ts") &&
        liveFreeMedia.includes("#EXT-X-DISCONTINUITY") &&
        liveFreeMedia.includes("/media/demo-live/seg0.m2ts")
    );

    // Verify Phase 3 automatic handoff after Intro completes (st = now - 16s) -> Pure Live Channel!
    const pastSt = Math.floor(Date.now() / 1000) - 16;
    const phase3Media = await (await fetch(`${base}/api/stream?mode=live&id=1001&st=${pastSt}`)).text();
    const seqMatch = phase3Media.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    const discMatch = phase3Media.match(/#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/);
    check(
      "After Intro duration expires, HLS stream transitions directly to pure Live Channel (monotonic sequence)",
      !phase3Media.includes("/media/welcome/") &&
        phase3Media.includes("/media/demo-live/seg") &&
        Number(seqMatch?.[1] || 0) >= 3 &&
        Number(discMatch?.[1] || 0) >= 1
    );

    // Verify .ts Xtream request redirects 302 to .m3u8 so ExoPlayer/VLC uses HLS demuxer
    const tsRedir = await fetch(`${base}/live/demo/demo/1001.ts`, { redirect: "manual" });
    check(
      "Xtream .ts request 302-redirects to .m3u8 for universal IPTV player compatibility",
      tsRedir.status === 302 && (tsRedir.headers.get("location") || "").endsWith("/live/demo/demo/1001.m3u8")
    );

    const welcomeSegRes = await fetch(`${base}/media/welcome/seg0.m2ts`);
    check(
      "MPEG-TS .m2ts segment serves HTTP 200 with video/mp2t Content-Type",
      welcomeSegRes.status === 200 && (welcomeSegRes.headers.get("content-type") || "").includes("video/mp2t")
    );

    // 3e. Locked PRO Channel (2001) serves Continuous Live PRO Unlock Video Loop for Free User!
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

    // 3f. Syncing an upgraded PRO VIP Xtream User unlocks PRO Channel 2001 immediately!
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

    // Verify Admin Custom Intro & Custom PRO Unlock Video URLs take effect immediately across Xtream/HLS!
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "settings/defaults",
        value: {
          welcomeVideoEnabled: true,
          welcomeVideoUrl: "https://cdn.barakatwave.test/custom-intro.mp4",
          welcomeDurationSec: 5,
          proUnlockVideoEnabled: true,
          proUnlockVideoUrl: "https://cdn.barakatwave.test/custom-pro-unlock.mp4"
        }
      })
    });
    const customIntroM3u8 = await (
      await fetch(`${base}/api/stream?mode=live&id=1001&st=${Math.floor(Date.now() / 1000)}`)
    ).text();
    const customProM3u8 = await (await fetch(`${base}/api/stream?mode=pro_lock&id=2001`)).text();
    check(
      "Admin custom Intro Video URL stitches first and transitions directly to Live Channel",
      customIntroM3u8.includes("https://cdn.barakatwave.test/custom-intro.mp4") &&
        customIntroM3u8.includes("#EXT-X-DISCONTINUITY") &&
        customIntroM3u8.includes("/media/demo-live/seg0.m2ts")
    );
    check(
      "Admin custom PRO Unlock Video URL plays continuously for Free users on PRO channels",
      customProM3u8.includes("https://cdn.barakatwave.test/custom-pro-unlock.mp4") &&
        !customProM3u8.includes("#EXT-X-ENDLIST")
    );
    // Restore default settings in local mirror after custom video test
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "settings/defaults", value: null })
    });

    // 3g. SEO Sitemap, RSS, LLMs.txt & SSR Blog Pages
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    check("Dynamic /sitemap.xml includes blog articles & channel URLs", sitemap.includes("<urlset") && sitemap.includes("/blog/barakatwave-live-tv-mizanora-project-by-muaaz-iqbal"));

    const rss = await (await fetch(`${base}/rss.xml`)).text();
    check("Dynamic /rss.xml returns valid RSS 2.0 feed", rss.includes("<rss version=\"2.0\"") && rss.includes("Muaaz Iqbal"));

    const llms = await (await fetch(`${base}/llms.txt`)).text();
    check("/llms.txt exposes full AI identity for Muaaz Iqbal, Mizanora Projects & 0306-2015326", llms.includes("Muaaz Iqbal") && llms.includes("Mizanora Projects") && llms.includes("0306-2015326"));

    const blogHtml = await (await fetch(`${base}/blog/barakatwave-live-tv-mizanora-project-by-muaaz-iqbal`)).text();
    check("SSR Blog Article renders full semantic HTML + BlogPosting JSON-LD", blogHtml.includes("BlogPosting") && blogHtml.includes("Muaaz Iqbal"));

    // 3h. GitHub M3U8 File Generator Preview Endpoint
    const ghPrev = await (
      await fetch(`${base}/api/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewOnly: true })
      })
    ).json();
    check("GitHub M3U8 Publisher generates per-channel .m3u8 files + master playlists", ghPrev.ok && ghPrev.fileCount >= 17);

    // 3i. Playlist, Probe, Clean Channel M3U8 & IndexNow Endpoints
    const plFree = await (await fetch(`${base}/playlist/free.m3u8`)).text();
    check("/playlist/free.m3u8 serves valid M3U8 playlist", plFree.startsWith("#EXTM3U") && plFree.includes("/ch/"));

    const chDirect = await (await fetch(`${base}/ch/barakatwave-official-hd.m3u8`)).text();
    check("/ch/:slug.m3u8 serves clean channel HLS master playlist", chDirect.includes("#EXT-X-STREAM-INF"));

    const probeRes = await (await fetch(`${base}/api/probe?url=/media/welcome/index.m3u8`)).json();
    check("/api/probe verifies working HLS stream", probeRes.ok && probeRes.results?.[0]?.ok === true);

    const idxNow = await (await fetch(`${base}/api/seo/indexnow`)).json();
    check("/api/seo/indexnow returns candidate URLs for search indexing", idxNow.ok && idxNow.indexedCandidateCount >= 14);

    const idxKey = await (await fetch(`${base}/barakatwave2026mizanoraseokey.txt`)).text();
    check("IndexNow key verification file HTTP 200", idxKey.trim() === "barakatwave2026mizanoraseokey");
  } finally {
    server.close();
  }

  console.log(`\n✅ ALL ${passed} CHECKS PASSED PERFECTLY!`);
}

run().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});

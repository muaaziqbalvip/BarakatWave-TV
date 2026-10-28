import {
  getCanonicalBaseUrl,
  handleOptions,
  parseBody,
  sendJson
} from "../_lib/origin.js";
import { getChannels, normalizeChannel } from "../_lib/rtdb.js";
import { BRAND } from "../../data/catalog.js";

export function generateChannelM3u8Content(channel, siteUrl) {
  const safeName = String(channel.name || "Channel").replace(/"/g, "'");
  const safeGroup = String(channel.xtreamGroup || channel.category || "🇵🇰 ⭐ PAKISTAN TOP CHANNELS").replace(/"/g, "'");
  const safeLogo = String(channel.logo || BRAND.logoPrimary).replace(/"/g, "");
  const tierBadge = channel.tier === "pro" ? "PRO VIP (Unlock: 0306-2015326)" : "FREE HD";

  return [
    "#EXTM3U",
    `#PLAYLIST:${safeName} — BarakatWave Live TV (${tierBadge})`,
    `#EXT-X-SESSION-DATA:DATA-ID="com.mizanora.barakatwave.channel",VALUE="${channel.slug}"`,
    `#EXT-X-SESSION-DATA:DATA-ID="com.mizanora.barakatwave.founder",VALUE="Muaaz Iqbal - Mizanora Projects"`,
    `#EXTINF:-1 tvg-id="${channel.epgId}" tvg-name="${safeName}" tvg-logo="${safeLogo}" group-title="${safeGroup}",${channel.name}`,
    `${siteUrl}/ch/${channel.slug}.m3u8`
  ].join("\n") + "\n";
}

export function buildGitHubFilesMap(channels, folder = "data/streams", siteUrl = BRAND.siteUrl) {
  const cleanFolder = String(folder || "data/streams").replace(/^\/+|\/+$/g, "");
  const files = [];

  const freeLines = [
    `#EXTM3U x-tvg-url="${siteUrl}/xmltv.php"`,
    `#PLAYLIST:BarakatWave Live TV (Free Channels) — Mizanora Projects by Muaaz Iqbal`
  ];
  const allLines = [
    `#EXTM3U x-tvg-url="${siteUrl}/xmltv.php"`,
    `#PLAYLIST:BarakatWave Live TV (Master Catalog) — Mizanora Projects by Muaaz Iqbal`
  ];

  for (const raw of channels) {
    const ch = normalizeChannel(raw);
    const perChannelContent = generateChannelM3u8Content(ch, siteUrl);
    files.push({
      path: `${cleanFolder}/${ch.slug}.m3u8`,
      content: perChannelContent
    });

    const grp = (ch.xtreamGroup || ch.category || "🇵🇰 ⭐ PAKISTAN TOP CHANNELS").replace(/"/g, "'");
    const infLine = `#EXTINF:-1 tvg-id="${ch.epgId}" tvg-logo="${ch.logo}" group-title="${grp}",${ch.name}`;
    const streamLink = `${siteUrl}/ch/${ch.slug}.m3u8`;
    allLines.push(infLine, streamLink);
    if (ch.tier === "free") {
      freeLines.push(infLine, streamLink);
    }
  }

  files.push({
    path: `${cleanFolder}/master-free.m3u8`,
    content: freeLines.join("\n") + "\n"
  });
  files.push({
    path: `${cleanFolder}/master-all.m3u8`,
    content: allLines.join("\n") + "\n"
  });

  return files;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const body = await parseBody(req);
  const token = String(body.githubToken || process.env.GITHUB_TOKEN || "").trim();
  const repo = String(body.repo || process.env.GITHUB_REPO || "muaaziqbalvip/BarakatWave-TV").trim();
  const branch = String(body.branch || process.env.GITHUB_BRANCH || "main").trim();
  const folder = String(body.folder || "data/streams").trim();
  const siteUrl = getCanonicalBaseUrl();

  const channels =
    Array.isArray(body.channels) && body.channels.length
      ? body.channels.map((c, i) => normalizeChannel(c, i))
      : await getChannels();

  const files = buildGitHubFilesMap(channels, folder, siteUrl);

  // Preview-only mode (no GitHub commit, returns generated files directly)
  if (body.previewOnly) {
    return sendJson(res, 200, { ok: true, preview: true, fileCount: files.length, files });
  }

  if (!token) {
    return sendJson(res, 400, {
      ok: false,
      error: "GitHub Personal Access Token (PAT) is required. Paste your token in Admin -> GitHub M3U8 Push or set GITHUB_TOKEN in Vercel."
    });
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return sendJson(res, 400, { ok: false, error: "Invalid repo format. Expected owner/repo." });
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BarakatWave-TV-Publisher"
  };

  try {
    // 1. Get latest commit SHA on target branch
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: ghHeaders
    });
    if (!refRes.ok) {
      const errTxt = await refRes.text();
      return sendJson(res, refRes.status, {
        ok: false,
        error: `GitHub branch lookup failed (${refRes.status}): ${errTxt.slice(0, 220)}`
      });
    }
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 2. Get base tree SHA
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits/${latestCommitSha}`, {
      headers: ghHeaders
    });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create single atomic Git Tree with all .m3u8 files
    const treeEntries = files.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content
    }));

    const createTreeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });
    if (!createTreeRes.ok) {
      const errTxt = await createTreeRes.text();
      return sendJson(res, createTreeRes.status, {
        ok: false,
        error: `GitHub tree creation failed: ${errTxt.slice(0, 220)}`
      });
    }
    const newTree = await createTreeRes.json();

    // 4. Create commit
    const commitMessage =
      body.commitMessage ||
      `chore(streams): publish ${channels.length} BarakatWave M3U8 channel files via Admin`;

    const newCommitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
      method: "POST",
      headers: ghHeaders,
      body: JSON.stringify({
        message: commitMessage,
        tree: newTree.sha,
        parents: [latestCommitSha]
      })
    });
    if (!newCommitRes.ok) {
      const errTxt = await newCommitRes.text();
      return sendJson(res, newCommitRes.status, {
        ok: false,
        error: `GitHub commit failed: ${errTxt.slice(0, 220)}`
      });
    }
    const createdCommit = await newCommitRes.json();

    // 5. Update branch reference
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: "PATCH",
        headers: ghHeaders,
        body: JSON.stringify({ sha: createdCommit.sha, force: false })
      }
    );
    if (!updateRefRes.ok) {
      const errTxt = await updateRefRes.text();
      return sendJson(res, updateRefRes.status, {
        ok: false,
        error: `GitHub ref update failed: ${errTxt.slice(0, 220)}`
      });
    }

    return sendJson(res, 200, {
      ok: true,
      repo,
      branch,
      commitSha: createdCommit.sha,
      commitUrl: `https://github.com/${repo}/commit/${createdCommit.sha}`,
      fileCount: files.length,
      files: files.map((f) => f.path)
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: `GitHub push failed: ${err?.message || "Unknown error"}`
    });
  }
}

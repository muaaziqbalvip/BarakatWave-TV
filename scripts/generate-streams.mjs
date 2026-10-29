import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CHANNELS, BRAND } from "../data/catalog.js";
import { buildGitHubFilesMap } from "../api/_handlers/github-push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/**
 * Security Redaction for Public Browser Bundle (`public/assets/js/catalog-browser.js`):
 * Replaces raw remote upstream stream URLs (`https://...`) in `DEFAULT_CHANNELS` with
 * `"shielded://vault"` so inspecting JS source, DOM, or memory in DevTools NEVER leaks
 * backend channel source links! Server resolves real streams via AES-256-GCM `/api/gate`.
 */
const rawCatalogSrc = fs.readFileSync(path.join(ROOT, "data/catalog.js"), "utf8");
const marker = "export const DEFAULT_CHANNELS =";
const splitIdx = rawCatalogSrc.indexOf(marker);
let browserCatalogSrc = rawCatalogSrc;

if (splitIdx >= 0) {
  const head = rawCatalogSrc.slice(0, splitIdx);
  const tail = rawCatalogSrc.slice(splitIdx);
  const blogsMarker = "export const DEFAULT_BLOGS =";
  const blogsIdx = tail.indexOf(blogsMarker);
  if (blogsIdx >= 0) {
    const channelsBlock = tail
      .slice(0, blogsIdx)
      .replace(/(\burl:\s*)"https?:\/\/[^"]+"/g, '$1"shielded://vault"')
      .replace(/(\bbackupUrls:\s*)\[[^\]]*\]/g, "$1[]");
    const rest = tail.slice(blogsIdx);
    browserCatalogSrc = head + channelsBlock + rest;
  }
}

fs.writeFileSync(path.join(ROOT, "public/assets/js/catalog-browser.js"), browserCatalogSrc, "utf8");
fs.copyFileSync(
  path.join(ROOT, "data/imdb-seed.js"),
  path.join(ROOT, "public/assets/js/imdb-seed.js")
);
// CRITICAL: the browser seed imports this catalog module — it must exist in public/ too,
// otherwise the whole ES-module graph fails to load and the entire web app stays dead.
fs.copyFileSync(
  path.join(ROOT, "data/imdb-catalog-2000.js"),
  path.join(ROOT, "public/assets/js/imdb-catalog-2000.js")
);

const files = buildGitHubFilesMap(DEFAULT_CHANNELS, "data/streams", BRAND.siteUrl);
for (const f of files) {
  const fullPath = path.join(ROOT, f.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, f.content, "utf8");
}

console.log(
  `Generated ${files.length} M3U8 files in data/streams/ and synced shielded browser catalog + IMDb seed.`
);

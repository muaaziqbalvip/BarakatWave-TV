import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CHANNELS, BRAND } from "../data/catalog.js";
import { buildGitHubFilesMap } from "../api/_handlers/github-push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Keep browser catalog & IMDb seed copies in sync with data/
fs.copyFileSync(
  path.join(ROOT, "data/catalog.js"),
  path.join(ROOT, "public/assets/js/catalog-browser.js")
);
fs.copyFileSync(
  path.join(ROOT, "data/imdb-seed.js"),
  path.join(ROOT, "public/assets/js/imdb-seed.js")
);

const files = buildGitHubFilesMap(DEFAULT_CHANNELS, "data/streams", BRAND.siteUrl);
for (const f of files) {
  const fullPath = path.join(ROOT, f.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, f.content, "utf8");
}

console.log(`Generated ${files.length} M3U8 files in data/streams/ and synced browser catalog + IMDb seed.`);

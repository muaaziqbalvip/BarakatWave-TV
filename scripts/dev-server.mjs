import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const API_DIR = path.join(ROOT, "api");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".m3u8": "application/vnd.apple.mpegurl; charset=utf-8",
  ".m3u": "audio/x-mpegurl; charset=utf-8",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".mp4": "video/mp4"
};

function compilePattern(source) {
  const paramNames = [];
  const regexStr =
    "^" +
    source
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
      }) +
    "$";
  return { regex: new RegExp(regexStr), paramNames };
}

const compiledRewrites = (vercelConfig.rewrites || []).map((r) => ({
  ...r,
  ...compilePattern(r.source)
}));

function matchRewrite(pathname, existingSearchParams) {
  for (const rule of compiledRewrites) {
    const m = pathname.match(rule.regex);
    if (m) {
      let dest = rule.destination;
      rule.paramNames.forEach((name, idx) => {
        dest = dest.replace(`:${name}`, encodeURIComponent(decodeURIComponent(m[idx + 1])));
      });
      const destUrl = new URL(dest, "http://localhost");
      for (const [k, v] of existingSearchParams.entries()) {
        if (!destUrl.searchParams.has(k)) destUrl.searchParams.set(k, v);
      }
      return destUrl;
    }
  }
  return null;
}

const handlerCache = new Map();
async function loadApiHandler(apiPathname) {
  const rel = apiPathname.replace(/^\/api\/?/, "");
  const candidates = [
    path.join(API_DIR, `${rel}.js`),
    path.join(API_DIR, rel, "index.js")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      if (!handlerCache.has(file)) {
        const mod = await import(pathToFileURL(file).href);
        handlerCache.set(file, mod.default);
      }
      return handlerCache.get(file);
    }
  }
  return null;
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    try {
      const incomingUrl = new URL(req.url || "/", "http://localhost");
      let pathname = incomingUrl.pathname;
      if (pathname.length > 1 && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      const rewritten = matchRewrite(pathname, incomingUrl.searchParams);
      const effectivePath = rewritten ? rewritten.pathname : pathname;
      const effectiveSearch = rewritten ? rewritten.search : incomingUrl.search;

      if (effectivePath.startsWith("/api/")) {
        const fn = await loadApiHandler(effectivePath);
        if (fn) {
          req.url = effectivePath + effectiveSearch;
          const qObj = {};
          const sp = new URLSearchParams(effectiveSearch);
          for (const [k, v] of sp.entries()) qObj[k] = v;
          req.query = qObj;
          await fn(req, res);
          return;
        }
      }

      // Serve static files from public/
      let relFile = effectivePath === "/" ? "index.html" : effectivePath.replace(/^\/+/, "");
      let diskPath = path.resolve(PUBLIC_DIR, relFile);
      if (!diskPath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(diskPath) && !path.extname(diskPath)) {
        if (fs.existsSync(`${diskPath}.html`)) {
          diskPath = `${diskPath}.html`;
        }
      }

      if (!fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }

      const ext = path.extname(diskPath).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      const stat = fs.statSync(diskPath);

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        if (start >= stat.size || end >= stat.size) {
          res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": end - start + 1,
          "Content-Type": mime
        });
        fs.createReadStream(diskPath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": stat.size
      });
      fs.createReadStream(diskPath).pipe(res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`🌊 BarakatWave Live TV server listening on http://${host}:${port}`);
  });
}

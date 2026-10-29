/**
 * BarakatWave Live TV — Offline MPEG-DASH (.mpd) Demo Builder
 * Under Mizanora Projects by Muaaz Iqbal
 *
 * Transmuxes our built-in MPEG-TS showcase segments (`public/media/demo-live/*.m2ts`)
 * into standards-compliant ISO-BMFF fragmented MP4 (fMP4) DASH assets using the
 * vendored `mux.js` transmuxer — producing `init.mp4` + `segN.m4s` files and a
 * fully playable `<MPD>` manifest for the Universal DASH Studio channel.
 *
 * Run: node scripts/build-dash-demo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "public/media/demo-live");
const OUT_DIR = path.join(ROOT, "public/media/demo-dash");

globalThis.window = globalThis;
globalThis.self = globalThis;
if (!globalThis.navigator) globalThis.navigator = { userAgent: "barakatwave-dash-builder" };

vm.runInThisContext(fs.readFileSync(path.join(ROOT, "public/assets/vendor/mux.min.js"), "utf8"), {
  filename: "mux.min.js"
});

const muxjs = globalThis.muxjs;
if (!muxjs?.mp4?.Transmuxer) {
  console.error("mux.js not available — cannot build DASH demo");
  process.exit(1);
}

function readBoxes(buf, start = 0, end = buf.length) {
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    const size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    if (size < 8) break;
    boxes.push({ type, start: pos, size, end: Math.min(pos + size, end) });
    pos += size;
  }
  return boxes;
}

function findBox(buf, rootType, pathTypes) {
  let scope = { buf, start: 0, end: buf.length };
  for (const wanted of [rootType, ...pathTypes]) {
    const boxes = readBoxes(scope.buf, scope.start, scope.end);
    const hit = boxes.find((b) => b.type === wanted);
    if (!hit) return null;
    scope = { buf: scope.buf, start: hit.start + 8, end: hit.end };
  }
  return scope;
}

function readTkhdDimensions(buf) {
  const trak = readBoxes(buf).find((b) => b.type === "trak");
  if (!trak) return { width: 0, height: 0 };
  const tkhdBody = trak.start + 8;
  const version = buf.readUInt8(tkhdBody);
  const matrixOffset = tkhdBody + (version === 1 ? 88 : 76);
  const width = buf.readUInt32BE(matrixOffset + 36) / 65536;
  const height = buf.readUInt32BE(matrixOffset + 40) / 65536;
  return { width: Math.round(width), height: Math.round(height) };
}

function readCodec(buf) {
  const stsdScope = findBox(buf, "moov", ["trak", "mdia", "minf", "stbl", "stsd"]);
  if (!stsdScope) return { codec: "", kind: "" };
  const entryStart = stsdScope.start + 8;
  const entryType = buf.toString("latin1", entryStart + 4, entryStart + 8);
  if (entryType === "avc1" || entryType === "avc3") {
    // VisualSampleEntry header is 78 bytes, then the avcC child box begins:
    // [avcC size 4][‘avcC’ 4][version 1][profile 1][compat 1][level 1]
    const avcCHeader = entryStart + 8 + 78 + 8;
    const hex = buf.toString("hex", avcCHeader + 1, avcCHeader + 4);
    return { codec: `${entryType}.${hex.toUpperCase()}`, kind: "video" };
  }
  if (entryType === "mp4a") {
    return { codec: "mp4a.40.2", kind: "audio" };
  }
  if (entryType === "hvc1" || entryType === "hev1") {
    return { codec: `${entryType}.1.6.L120.90`, kind: "video" };
  }
  return { codec: entryType, kind: "video" };
}

function transmuxTracks() {
  const transmuxer = new muxjs.mp4.Transmuxer({
    remux: false,
    keepOriginalTimestamps: true
  });

  const tracks = {
    video: { init: null, chunks: [], decodeTime: 0 },
    audio: { init: null, chunks: [], decodeTime: 0 }
  };

  transmuxer.on("data", (segment) => {
    const trackKind = segment.type === "audio" ? "audio" : "video";
    const store = tracks[trackKind];
    if (segment.initSegment && !store.init) {
      store.init = Buffer.from(segment.initSegment);
    }
    if (segment.data) {
      store.chunks.push(Buffer.from(segment.data));
      if (segment.baseMediaDecodeTime !== undefined) {
        store.decodeTime = Math.max(store.decodeTime, segment.baseMediaDecodeTime);
      }
    }
  });

  const tsFiles = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".m2ts"))
    .sort();

  for (const file of tsFiles) {
    transmuxer.push(new Uint8Array(fs.readFileSync(path.join(SRC_DIR, file))));
  }
  transmuxer.flush();
  return tracks;
}

const tracks = transmuxTracks();
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith(".m4s") || f.endsWith(".mp4")) fs.unlinkSync(path.join(OUT_DIR, f));
}

const totalSeconds = 8;
const representations = [];

for (const kind of ["video", "audio"]) {
  const store = tracks[kind];
  if (!store.init || !store.chunks.length) continue;

  const initName = `${kind}-init.mp4`;
  fs.writeFileSync(path.join(OUT_DIR, initName), store.init);

  const media = Buffer.concat(store.chunks);
  const mediaName = `${kind}-seg1.m4s`;
  fs.writeFileSync(path.join(OUT_DIR, mediaName), media);

  const { codec } = readCodec(store.init);
  const dims = kind === "video" ? readTkhdDimensions(store.init) : { width: 0, height: 0 };

  representations.push({
    kind,
    codec: codec || (kind === "audio" ? "mp4a.40.2" : "avc1.4d401f"),
    width: dims.width || 1280,
    height: dims.height || 720,
    bandwidth: kind === "video" ? Math.round((media.length * 8) / totalSeconds) : 128000,
    initName,
    mediaName,
    bytes: media.length
  });
}

const totalDurationSec = totalSeconds;
const mpd = `<?xml version="1.0" encoding="utf-8"?>
<!-- BarakatWave Live TV — Universal MPEG-DASH Studio Broadcast (Mizanora Projects • Muaaz Iqbal) -->
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="urn:mpeg:dash:schema:mpd:2011 DASH-MPD.xsd"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="static"
     mediaPresentationDuration="PT${totalDurationSec}S"
     minBufferTime="PT2S">
  <Period id="p0" start="PT0S" duration="PT${totalDurationSec}S">
${representations
  .map(
    (r) =>
      `    <AdaptationSet id="${r.kind}" contentType="${r.kind}" mimeType="${r.kind}/mp4" segmentAlignment="true" startWithSAP="1"${
        r.kind === "video" ? ' subsegmentAlignment="true"' : ""
      }>
      <Representation id="${r.kind}-hd" codecs="${r.codec}" bandwidth="${r.bandwidth}"${
        r.kind === "video" ? ` width="${r.width}" height="${r.height}" frameRate="30"` : ""
      }>
        <SegmentTemplate timescale="90000" duration="${90000 * totalDurationSec}" startNumber="1" initialization="${r.initName}" media="${r.mediaName.replace("1", "$Number$")}"/>
      </Representation>
    </AdaptationSet>`
  )
  .join("\n")}
  </Period>
</MPD>
`;

fs.writeFileSync(path.join(OUT_DIR, "index.mpd"), mpd, "utf8");

console.log(`✅ Built playable fMP4 DASH demo in public/media/demo-dash/`);
for (const r of representations) {
  console.log(`   • ${r.kind}: ${r.codec} ${r.width ? `${r.width}x${r.height} ` : ""}${r.bytes} bytes`);
}
console.log(`   • index.mpd written (${totalDurationSec}s VOD)`);

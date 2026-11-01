#!/usr/bin/env node
/**
 * BarakatWave TV — static ES-module graph checker
 * -------------------------------------------------------------------------
 * Catches the exact class of bug that white-screened the app and the admin
 * panel: a module that imports a binding the target file does not export
 * (e.g. `import { loadFullCatalog } from "./imdb-seed.js"` against an older
 * cached copy of that file).
 *
 * Also flags:
 *   - relative imports that point to files that do not exist
 *   - duplicate top-level function declarations in one file
 *
 * Usage: node scripts/check-module-exports.mjs [--verbose]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["public/assets/js", "api", "api/_lib", "api/_handlers", "data", "scripts"];

function listModules(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /\.m?js$/.test(f))
    .map((f) => path.join(abs, f));
}

/** Every exported name of a module, including `export const { a, b } = obj` re-exports. */
export function exportedNames(src) {
  const names = new Set();

  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s*\*?\s*([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  // export const { a, b: c } = something;
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.split(":").pop().trim().split(/\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias);
    }
  }
  // export { a, b as c } [from "./x.js"];
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias);
    }
  }
  // export * from "./x.js" -> unknown set, treated as open below
  if (/export\s*\*\s*from/.test(src)) names.add("*");
  if (/export\s+default/.test(src)) names.add("default");
  return names;
}

/** Remove line + block comments so commented-out code never produces false hits. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

function stripQuery(spec) {
  return spec.split(/[?#]/)[0];
}

export function checkModuleGraph({ verbose = false } = {}) {
  const files = SCAN_DIRS.flatMap(listModules);
  const problems = [];
  let importCount = 0;

  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const rel = path.relative(ROOT, file);

    // duplicate top-level function declarations (merge artefacts)
    const fns = [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const dupes = [...new Set(fns.filter((n, i) => fns.indexOf(n) !== i))];
    if (dupes.length) problems.push(`${rel}: duplicate function declarations -> ${dupes.join(", ")}`);

    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+([^;]*?)\s+from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const clause = m[1];
      const spec = m[2];
      const target = path.resolve(path.dirname(file), stripQuery(spec));
      importCount++;

      if (!fs.existsSync(target)) {
        problems.push(`${rel} -> ${spec} (file missing)`);
        continue;
      }

      const named = clause.match(/\{([^}]*)\}/);
      if (!named) continue;

      const wanted = named[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.split(/\s+as\s+/)[0].trim())
        .filter(Boolean);

      const available = exportedNames(fs.readFileSync(target, "utf8"));
      if (available.has("*")) continue;

      for (const name of wanted) {
        if (!available.has(name)) {
          problems.push(`${rel} -> ${path.basename(target)}: missing export "${name}"`);
        }
      }
    }

    for (const m of src.matchAll(/import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
      const target = path.resolve(path.dirname(file), stripQuery(m[1]));
      importCount++;
      if (!fs.existsSync(target)) problems.push(`${rel} -> ${m[1]} (dynamic import missing)`);
    }
  }

  if (verbose) console.log(`checked ${importCount} relative imports across ${files.length} modules`);
  return { problems, importCount, files: files.length };
}

if (import.meta.filename === process.argv[1]) {
  const { problems, importCount, files } = checkModuleGraph({ verbose: true });
  if (problems.length) {
    console.error("\n❌ Module graph problems:");
    for (const p of problems) console.error("  -", p);
    process.exit(1);
  }
  console.log(`✅ Module graph clean (${files} modules, ${importCount} relative imports).`);
}

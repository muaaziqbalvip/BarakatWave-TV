// Link the actual browser entrypoint graphs without executing DOM/Firebase code.
// Node's ES module linker checks named imports against real exports, including
// transitive dependencies; just checking that files exist misses such errors.
import { SourceTextModule, createContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve('public');
const context = createContext({});
const modules = new Map();
async function load(url) {
  if (!url.startsWith(pathToFileURL(root + path.sep).href)) throw new Error(`Unexpected browser import: ${url}`);
  if (!modules.has(url)) {
    const file = fileURLToPath(url);
    const code = await readFile(file, 'utf8');
    modules.set(url, new SourceTextModule(code, { context, identifier: url }));
  }
  return modules.get(url);
}
for (const name of ['admin', 'app']) {
  const entry = await load(pathToFileURL(path.join(root, `assets/js/${name}.js`)).href);
  await entry.link(async (specifier, importer) => load(new URL(specifier, importer.identifier).href));
  console.log(`Linked ${name} browser module graph`);
}

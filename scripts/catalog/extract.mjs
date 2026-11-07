#!/usr/bin/env node
// Local, read-only extraction. Requires Node 24; no API keys or network requests.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const at = args.indexOf('--output');
if (args.includes('--help')) {
  console.log('node --experimental-strip-types scripts/catalog/extract.mjs [--output data/generated/raw/extracted.json]');
  process.exit(0);
}
if (at >= 0 && !args[at + 1]) throw new Error('--output needs a path');
const output = resolve(root, at >= 0 ? args[at + 1] : 'data/generated/raw/extracted.json');
const modules = ['regionsV1', 'worldV1', 'placeAttrs', 'placeFit', 'worldHotels', 'nhaTrang', 'worldWeather', 'worldPrices'];
const extracted = { schemaVersion: 1, modules: {}, files: {} };
await mkdir(resolve(dirname(output), 'snapshots'), { recursive: true });
for (const name of modules) {
  const path = `src/data/${name}.ts`;
  const bytes = await readFile(resolve(root, path));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const imported = await import(pathToFileURL(resolve(root, path)).href);
  extracted.modules[name] = Object.fromEntries(Object.entries(imported).map(([key, value]) => [key, value instanceof Set ? [...value] : value]));
  extracted.files[path] = { sha256, bytes: bytes.length };
  // Keep byte-identical snapshots outside TypeScript compilation globs.
  await writeFile(resolve(dirname(output), 'snapshots', `${name}-${sha256}.ts.txt`), bytes);
}
await writeFile(output, `${JSON.stringify(extracted)}\n`);
console.log(JSON.stringify({ output, sourceFiles: modules.length, worldPlaces: extracted.modules.worldV1.WORLD_PLACES.length, pilotPlaces: extracted.modules.regionsV1.PLACES_V1.length }));

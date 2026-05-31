#!/usr/bin/env node
// Vendor cubing.js + its `random-uint-below` dep into web/static/vendor/
// so the browser can load cubing as raw ESM files. We do this instead of
// letting Vite bundle cubing because Vite mangles cubing's web worker
// (its base64-data-URL entry imports sibling chunks by their original
// names, which Vite renames during hashing). The raw ESM tree from npm
// keeps the relative-import chain intact.
//
// Run before `vite build` (see package.json prebuild script).

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");

// cubing lives in the sibling `core` package's node_modules (web doesn't
// depend on cubing directly — it goes through @cubing/core). Hardcoded
// rather than resolved because Node's resolution doesn't see sibling
// workspaces and we'd otherwise need a separate resolution dance.
const cubingLibDir = resolve(
  webRoot,
  "../core/node_modules/cubing/dist/lib/cubing",
);
const randomUintDir = resolve(
  webRoot,
  "../core/node_modules/random-uint-below/dist/esm",
);

const vendorRoot = join(webRoot, "static/vendor");
const cubingDest = join(vendorRoot, "cubing");
const randomUintDest = join(vendorRoot, "random-uint-below");

console.log(`[vendor] cubing src: ${cubingLibDir}`);
console.log(`[vendor] random-uint-below src: ${randomUintDir}`);
console.log(`[vendor] dest: ${vendorRoot}`);

// Clean & copy.
await rm(vendorRoot, { recursive: true, force: true });
await mkdir(vendorRoot, { recursive: true });
await cp(cubingLibDir, cubingDest, { recursive: true });
await mkdir(randomUintDest, { recursive: true });
// Copy every file in the random-uint-below ESM dir (it's small).
for (const name of await readdir(randomUintDir)) {
  await cp(join(randomUintDir, name), join(randomUintDest, name));
}

// Patch the bare `from "random-uint-below"` imports inside cubing's
// chunks to a relative path. Without this, the browser (and the worker)
// can't resolve the bare specifier — the page's importmap doesn't
// propagate into workers, and we'd need an importmap entry per worker.
// A relative path works uniformly.
const chunksDir = join(cubingDest, "chunks");
const target = `"../../random-uint-below/index.js"`;
let patched = 0;
for (const name of await readdir(chunksDir)) {
  if (!name.endsWith(".js")) continue;
  const path = join(chunksDir, name);
  const src = await readFile(path, "utf8");
  if (!src.includes(`"random-uint-below"`)) continue;
  const out = src.replaceAll(`"random-uint-below"`, target);
  await writeFile(path, out);
  patched++;
}
console.log(`[vendor] patched ${patched} chunk(s) for random-uint-below`);

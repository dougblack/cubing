// Render last-layer SVG diagrams for every case in a stage file.
//
// Strategy: for each case, take the primary algorithm (algorithms[0].moves),
// invert it to get the "setup" scramble, apply that to a solved cube, and
// render the resulting state. This produces the cube state that the algorithm
// is meant to solve.
//
// Color modes:
//   pll, oll, 2loll  -> last-layer view
//   f2l              -> skipped for now (needs a different view)

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { applyAlg, invertAlg, normalizeYellowOnTop, solved } from "./cube.js";
import { type ColorMode, type ViewMode, renderLastLayerSVG } from "./svg.js";
import { renderF2LSVG } from "./svg-f2l.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const METHODS_DIR = join(REPO_ROOT, "data", "methods");
const DIAGRAMS_DIR = join(REPO_ROOT, "diagrams");

interface Algorithm {
  moves: string;
  popularity_rank?: number;
}
interface Case {
  id: string;
  name: string;
  algorithms: Algorithm[];
  view?: ViewMode;
}

/** Returns true if the alg uses only face-only moves (no wide moves, slices,
 *  or whole-cube rotations). These algs produce clean case states under
 *  inversion because they don't shift centers. */
function isCleanAlg(moves: string): boolean {
  // Tokenize: split on whitespace and parentheses. Strip primes / 2 modifiers.
  // A "clean" token starts with one of U D L R F B (uppercase).
  const tokens = moves.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    // Wide moves: lowercase letter alone, or "Xw" form
    if (/^[urflbd]/.test(t)) return false;
    if (/^[URFLBD]w/.test(t)) return false;
    // Slice moves
    if (/^[MES]/.test(t)) return false;
    // Whole-cube rotations
    if (/^[xyz]/.test(t)) return false;
  }
  return true;
}

/** Pick the algorithm to use for diagram generation. Prefer the first
 *  alg that's "clean" (no wide moves or rotations); fall back to the first
 *  alg overall. */
function pickDiagramAlg(algs: Algorithm[]): Algorithm | undefined {
  return algs.find((a) => isCleanAlg(a.moves)) ?? algs[0];
}

/** True if the alg uses only U, R, F face turns. F2L diagrams need a strict
 *  front-right-slot alg: any L / B / D / slice / wide / rotation move would
 *  disturb the cross or another slot, so inverting it from solved would no
 *  longer produce a clean "only the FR pair is displaced" case state. Every
 *  standard F2L case has at least one such alg. */
function isURFClean(moves: string): boolean {
  const tokens = moves.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  return tokens.every((t) => /^[URF][2']?$/.test(t));
}

/** Pick the F2L diagram alg: the first URF-only algorithm for the case. */
function pickF2LDiagramAlg(algs: Algorithm[]): Algorithm | undefined {
  return algs.find((a) => isURFClean(a.moves));
}

// Sticker indices a genuine front-right-slot F2L case is allowed to disturb:
// the whole last layer (U face + the top row of every side face) plus the
// front-right slot (the F/R stickers of the FR edge and DFR corner, and that
// corner's D sticker). If inverting an alg from solved changes anything
// outside this set, it isn't a clean FR-slot alg (it moved the cross or
// another slot) — skip it.
const FR_CASE_ALLOWED = new Set<number>([
  0, 1, 2, 3, 4, 5, 6, 7, 8, // U face
  9, 10, 11, // L top row
  18, 19, 20, // F top row
  27, 28, 29, // R top row
  36, 37, 38, // B top row
  23, 26, // F5 (FR edge), F8 (DFR corner)
  30, 33, // R3 (FR edge), R6 (DFR corner)
  47, // D2 (DFR corner's cross sticker)
]);

function isCleanFRCase(state: ReturnType<typeof solved>): boolean {
  const ref = solved();
  for (let i = 0; i < 54; i++) {
    if (!FR_CASE_ALLOWED.has(i) && state[i] !== ref[i]) return false;
  }
  return true;
}

async function renderF2LStageFile(
  stage: Stage,
  outDir: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  let count = 0;
  let skipped = 0;
  for (const caseDef of stage.cases) {
    const chosen = pickF2LDiagramAlg(caseDef.algorithms);
    if (!chosen) {
      console.error(`  f2l/${caseDef.id}: no URF-only alg, skipping`);
      skipped++;
      continue;
    }
    let state: ReturnType<typeof solved>;
    try {
      state = applyAlg(solved(), invertAlg(chosen.moves));
    } catch (err) {
      console.error(`  f2l/${caseDef.id}: ${(err as Error).message}`);
      skipped++;
      continue;
    }
    if (!isCleanFRCase(state)) {
      // The first URF-only alg wasn't a clean FR-slot alg; try the rest.
      const alt = caseDef.algorithms.find(
        (a) => isURFClean(a.moves) && isCleanFRCase(applyAlg(solved(), invertAlg(a.moves))),
      );
      if (!alt) {
        console.error(`  f2l/${caseDef.id}: no clean FR-slot alg (tried "${chosen.moves}"), skipping`);
        skipped++;
        continue;
      }
      state = applyAlg(solved(), invertAlg(alt.moves));
    }
    await writeFile(join(outDir, `${caseDef.id}.svg`), renderF2LSVG(state));
    count++;
  }
  console.log(`  ${stage.method}/f2l: rendered ${count}${skipped ? `, skipped ${skipped}` : ""}`);
}
interface Stage {
  method: string;
  stage: string;
  cases: Case[];
}

const STAGE_MODES: Record<string, ColorMode | "f2l" | undefined> = {
  pll: "pll",
  oll: "oll",
  "2loll": "oll", // 2LOLL is just a subset of OLL, render the same way
  f2l: "f2l", // oblique 3-face view (see svg-f2l.ts)
};

async function renderStageFile(stageFile: string): Promise<void> {
  const raw = await readFile(stageFile, "utf8");
  const stage = JSON.parse(raw) as Stage;
  const mode = STAGE_MODES[stage.stage];
  if (mode === undefined) {
    console.log(`  ${stage.stage}: no diagram mode mapped, skipping`);
    return;
  }
  const outDir = join(DIAGRAMS_DIR, stage.method, stage.stage);
  if (mode === "f2l") {
    await renderF2LStageFile(stage, outDir);
    return;
  }
  await mkdir(outDir, { recursive: true });

  let count = 0;
  let skipped = 0;
  for (const caseDef of stage.cases) {
    const chosen = pickDiagramAlg(caseDef.algorithms);
    if (!chosen) {
      skipped++;
      continue;
    }
    let setup: string;
    let state: ReturnType<typeof solved>;
    try {
      setup = invertAlg(chosen.moves);
      state = normalizeYellowOnTop(applyAlg(solved(), setup));
    } catch (err) {
      console.error(`  ${stage.stage}/${caseDef.id}: ${(err as Error).message}`);
      skipped++;
      continue;
    }
    const svg = renderLastLayerSVG(state, mode, caseDef.view ?? "full");
    const outPath = join(outDir, `${caseDef.id}.svg`);
    await writeFile(outPath, svg);
    count++;
  }
  console.log(`  ${stage.method}/${stage.stage}: rendered ${count}${skipped ? `, skipped ${skipped}` : ""}`);
}

async function main(): Promise<void> {
  const methods = await readdir(METHODS_DIR, { withFileTypes: true });
  for (const method of methods) {
    if (!method.isDirectory()) continue;
    const methodDir = join(METHODS_DIR, method.name);
    const stages = await readdir(methodDir);
    for (const stageFile of stages) {
      if (!stageFile.endsWith(".json")) continue;
      await renderStageFile(join(methodDir, stageFile));
    }
  }
}

await main();

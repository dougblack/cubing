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
interface Stage {
  method: string;
  stage: string;
  cases: Case[];
}

const STAGE_MODES: Record<string, ColorMode | null> = {
  pll: "pll",
  oll: "oll",
  "2loll": "oll", // 2LOLL is just a subset of OLL, render the same way
  f2l: null, // skip — needs a different (3D-ish or two-layer) view
};

async function renderStageFile(stageFile: string): Promise<void> {
  const raw = await readFile(stageFile, "utf8");
  const stage = JSON.parse(raw) as Stage;
  const mode = STAGE_MODES[stage.stage];
  if (mode === undefined) {
    console.log(`  ${stage.stage}: no diagram mode mapped, skipping`);
    return;
  }
  if (mode === null) {
    console.log(`  ${stage.stage}: deferred (no view implemented yet)`);
    return;
  }
  const outDir = join(DIAGRAMS_DIR, stage.method, stage.stage);
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

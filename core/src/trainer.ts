// OLL / PLL trainer scramble generator.
//
// Phase 1 (this file): for a target case, pick a random algorithm from the
// dataset, invert it, and prepend a random y-rotation + random AUF. That
// gives `algs × 4 × 4` distinct scrambles per case — limited variety for
// single-alg OLLs, but ships immediately and exercises the trainer UX.
//
// Phase 2 (deferred): state-based scrambling via a 3x3 solver. Same public
// API, swap implementation.
//
// Scrambles are emitted in the canonical (W-top / G-front) frame; the
// trainer page is responsible for translating to the cuber's orientation
// for display (same pattern the timer page uses).

import ollData from "../../data/methods/cfop/oll.json" with { type: "json" };
import pllData from "../../data/methods/cfop/pll.json" with { type: "json" };

import { applyAlg, invertAlg, solved } from "./cube.js";
import {
  findCrossFaceForColor,
  normalizeToCrossOnD,
} from "./phases.js";
import { recognizeOLL, recognizePLL } from "./recognition.js";
import { normalizeScramble } from "./scramble-tracker.js";

export type TrainerStage = "oll" | "pll";

interface TrainerCase {
  id: string;
  name: string;
}

interface RawCase {
  id: string;
  name: string;
  algorithms: { moves: string }[];
}

const STAGE_DATA: Record<TrainerStage, RawCase[]> = {
  oll: ollData.cases as RawCase[],
  pll: pllData.cases as RawCase[],
};

/** True iff the SCRAMBLE we'd actually emit for this alg — `invert(alg)`
 *  run through the face-turn-only parser — applied to a solved cube,
 *  produces a state the recognizer identifies as the target case.
 *
 *  Validating the post-normalized scramble catches two failure modes:
 *  (1) dataset entries labeled under the wrong case (the alg solves a
 *  different case than its file says); (2) algs that only work because
 *  of embedded rotations or wide moves — once `normalizeScramble`
 *  strips those, the leftover face turns no longer produce the case.
 *  Either way the cuber would get the wrong setup, so we reject. */
function validatesAsCase(
  alg: string,
  stage: TrainerStage,
  caseId: string,
): boolean {
  try {
    const scramble = normalizeScramble(invertAlg(alg));
    const state = applyAlg(solved(), scramble);
    const crossFace = findCrossFaceForColor(state, "W");
    if (!crossFace) return false;
    const normalized = normalizeToCrossOnD(state, crossFace);
    const recognized =
      stage === "oll" ? recognizeOLL(normalized) : recognizePLL(normalized);
    return recognized?.id === caseId;
  } catch {
    return false;
  }
}

/** Per-case usable alg pool, computed once at module load. We prefer
 *  clean (face-turn-only) algs because they leave the cube in a standard
 *  orientation; algs with rotations/wide moves end with the cube tilted,
 *  which makes the cuber's solved state look "wrong" colors-on-faces.
 *  An additional validation pass rejects mislabeled algs. */
const VALID_ALGS: Record<TrainerStage, Map<string, string[]>> = {
  oll: buildValidAlgPool("oll"),
  pll: buildValidAlgPool("pll"),
};

function buildValidAlgPool(stage: TrainerStage): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of STAGE_DATA[stage]) {
    // Pre-filter to face-turn-only algs; everything else loses meaning
    // after `normalizeScramble` strips wide/slice/rotation tokens.
    const candidates = c.algorithms
      .filter((a) => isCleanAlg(a.moves))
      .map((a) => a.moves);
    const valid = candidates.filter((m) => validatesAsCase(m, stage, c.id));
    out.set(c.id, valid);
  }
  return out;
}

/** True iff the trainer can ship at least one valid scramble for this
 *  case. Some OLL cases in the dataset only have rotation- or slice-
 *  bearing algs; those won't survive the face-turn-only normalization
 *  and the case is currently un-trainable in Phase 1. */
export function isCaseTrainable(stage: TrainerStage, caseId: string): boolean {
  return (VALID_ALGS[stage].get(caseId) ?? []).length > 0;
}

/** All cases in the dataset for a stage, in dataset order. Some may not
 *  be trainable in Phase 1 — caller can check via `isCaseTrainable`. */
export function trainerCases(stage: TrainerStage): TrainerCase[] {
  return STAGE_DATA[stage].map((c) => ({ id: c.id, name: c.name }));
}

/** All cases for which the trainer can currently generate a valid
 *  scramble. `pickRandomCase` draws from this list. */
export function trainableCases(stage: TrainerStage): TrainerCase[] {
  return trainerCases(stage).filter((c) => isCaseTrainable(stage, c.id));
}

const AUF_OPTIONS = ["", "U", "U'", "U2"] as const;
// y-rotation prefixes were considered for additional variety but break
// the scramble tracker (which only knows face turns) and the BT
// orientation pipeline (which assumes the cube doesn't get physically
// reoriented mid-scramble). Variety comes from alg choice × AUF only.

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** True for algs containing only uppercase face turns — no wide moves,
 *  slices, or whole-cube rotations. Those would leave the cube in a
 *  non-standard orientation after the alg runs (centers permuted),
 *  which is bad for trainer scrambles: the cuber's executed alg would
 *  end at "solved but rotated", confusing them. */
function isCleanAlg(moves: string): boolean {
  const tokens = moves.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (/^[urflbd]/.test(t)) return false;
    if (/^[URFLBD]w/.test(t)) return false;
    if (/^[MES]/.test(t)) return false;
    if (/^[xyz]/.test(t)) return false;
  }
  return true;
}

/** Pick a random TRAINABLE case from the stage with uniform 1/N
 *  probability — no weighting by WCA probability. Per design: trainer
 *  drills all cases equally, ignoring real-world frequency. */
export function pickRandomCase(stage: TrainerStage): TrainerCase {
  const pool = trainableCases(stage);
  if (pool.length === 0) {
    throw new Error(`no trainable cases for stage ${stage}`);
  }
  return pickRandom(pool);
}

/** Generate a Phase 1 trainer scramble for a specific case. Result is
 *  normalized through the WCA-notation parser so `invertAlg`'s `R2'`
 *  artifact lands as `R2` — both for cleaner display and so the
 *  scramble tracker accepts every token. */
export function generateTrainerScramble(
  stage: TrainerStage,
  caseId: string,
): string {
  const pool = VALID_ALGS[stage].get(caseId);
  if (!pool || pool.length === 0) {
    throw new Error(`unknown ${stage} case: ${caseId}`);
  }
  const alg = pickRandom(pool);
  const aufPre = pickRandom(AUF_OPTIONS);
  return normalizeScramble([aufPre, invertAlg(alg)].filter(Boolean).join(" "));
}

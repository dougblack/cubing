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
import f2lData from "../../data/methods/cfop/f2l.json" with { type: "json" };

import { applyAlg, invertAlg, type State, solved } from "./cube.js";
import {
  findCrossFaceForColor,
  normalizeToCrossOnD,
} from "./phases.js";
import { recognizeOLL, recognizePLL } from "./recognition.js";
import { normalizeScramble, simplifyMoves } from "./scramble-tracker.js";

export type TrainerStage = "oll" | "pll" | "f2l";

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
  f2l: f2lData.cases as RawCase[],
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

// Sticker indices a genuine front-right-slot F2L case is allowed to disturb
// (relative to a cross-on-D / yellow-top solved cube): the whole last layer
// (U face + the top row of every side face) plus the front-right slot (the
// F/R stickers of the FR edge and DFR corner, and that corner's D sticker).
// If inverting an alg from solved changes anything outside this set, it moved
// the cross or another slot — not a clean FR-slot alg. Mirrors the diagram
// renderer's check; the sim's face/slot indexing is shared (U=0…D=5, DFR's
// cross sticker at D2).
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

/** True iff `state` differs from solved only within the front-right slot +
 *  last layer — i.e. it's a clean FR-slot F2L case with the cross and the
 *  other three slots intact. */
function isCleanFRCase(state: State): boolean {
  const ref = solved();
  for (let i = 0; i < 54; i++) {
    if (state[i] !== ref[i] && !FR_CASE_ALLOWED.has(i)) return false;
  }
  return true;
}

/** True iff the SCRAMBLE we'd emit for this F2L alg — `invert(alg)` run
 *  through the face-turn-only parser, applied to a solved cube — produces a
 *  clean front-right-slot case. F2L has no state recognizer, so instead of
 *  matching a recognized case id (as OLL/PLL do) we validate structurally:
 *  the setup must leave the cross and the other three slots solved and
 *  displace only the FR pair. Combined with the URF-only-as-written filter
 *  in `getPool` (algdb's F2L algs are all front-right-slot), this rejects
 *  any alg that isn't a genuine FR-slot solution. */
function validatesAsF2LCase(alg: string): boolean {
  try {
    const state = applyAlg(solved(), normalizeScramble(invertAlg(alg)));
    // A real case displaces the pair — a scramble that leaves the cube
    // FR-clean AND already solved would be a no-op alg, so also require
    // that *something* in the FR region actually moved.
    if (!isCleanFRCase(state)) return false;
    const ref = solved();
    return state.some((c, i) => c !== ref[i]);
  } catch {
    return false;
  }
}

/** True iff every token is a U/R/F face turn (front-right-slot moves only).
 *  Stricter than `isCleanBody`: L/B/D/slice/wide/rotation moves would disturb
 *  the cross or another slot, so an F2L alg using them isn't a clean FR-slot
 *  setup. Applied to the alg AS WRITTEN (rotations are not stripped) so a
 *  y-prefixed alg for a different slot can't masquerade as an FR-slot alg. */
function isURFOnly(tokens: readonly string[]): boolean {
  return tokens.every((t) => /^[URF][2']?$/.test(t));
}

/** Per-stage cache of the validated alg pool + the trainable-case list.
 *  Built lazily on first access — the validation pass runs ~80 algs
 *  through the recognizer (applyAlg + recognize), which we don't want
 *  to pay at module load for pages that never open the trainer.
 *  Because @cubing/core's index re-exports this module, every consumer
 *  imports it; making the work lazy keeps the timer / cfop pages free. */
interface StagePool {
  algsByCase: Map<string, string[]>;
  trainable: TrainerCase[];
}
const POOL_CACHE: Partial<Record<TrainerStage, StagePool>> = {};

function getPool(stage: TrainerStage): StagePool {
  const cached = POOL_CACHE[stage];
  if (cached) return cached;
  const algsByCase = new Map<string, string[]>();
  const trainable: TrainerCase[] = [];
  for (const c of STAGE_DATA[stage]) {
    // For each alg: tokenize once, peel any leading/trailing rotations
    // (oll-51's `y2 F U R …` becomes `F U R …`), keep it only if the
    // remaining body is face-turn-only, then re-validate that the body
    // — what the trainer will actually emit — still produces the case.
    const candidates: string[] = [];
    for (const a of c.algorithms) {
      if (stage === "f2l") {
        // F2L: keep only URF-only-as-written algs (front-right slot). No
        // outer-rotation stripping — a leading y would re-target the slot.
        const tokens = tokenizeAlg(a.moves);
        if (!isURFOnly(tokens)) continue;
        candidates.push(tokens.join(" "));
      } else {
        const body = stripOuterRotationTokens(tokenizeAlg(a.moves));
        if (!isCleanBody(body)) continue;
        candidates.push(body.join(" "));
      }
    }
    const valid = candidates.filter((m) =>
      stage === "f2l" ? validatesAsF2LCase(m) : validatesAsCase(m, stage, c.id),
    );
    algsByCase.set(c.id, valid);
    if (valid.length > 0) trainable.push({ id: c.id, name: c.name });
  }
  const pool: StagePool = { algsByCase, trainable };
  POOL_CACHE[stage] = pool;
  return pool;
}

/** True iff the trainer can ship at least one valid scramble for this
 *  case. Some OLL cases in the dataset only have rotation- or slice-
 *  bearing algs; those won't survive the face-turn-only normalization
 *  and the case is currently un-trainable in Phase 1. */
export function isCaseTrainable(stage: TrainerStage, caseId: string): boolean {
  return (getPool(stage).algsByCase.get(caseId) ?? []).length > 0;
}

/** All cases in the dataset for a stage, in dataset order. Some may not
 *  be trainable in Phase 1 — caller can check via `isCaseTrainable`. */
export function trainerCases(stage: TrainerStage): TrainerCase[] {
  return STAGE_DATA[stage].map((c) => ({ id: c.id, name: c.name }));
}

/** All cases for which the trainer can currently generate a valid
 *  scramble. `pickRandomCase` draws from this list. O(1) after the
 *  first call (the trainable list is cached alongside the alg pool). */
export function trainableCases(stage: TrainerStage): TrainerCase[] {
  return getPool(stage).trainable;
}

const AUF_OPTIONS = ["", "U", "U'", "U2"] as const;
// y-rotation prefixes were considered for additional variety but break
// the scramble tracker (which only knows face turns) and the BT
// orientation pipeline (which assumes the cube doesn't get physically
// reoriented mid-scramble). Variety comes from alg choice × AUF only.

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Split an alg string into tokens. Parentheses (used in some sources
 *  to group sub-sequences) are treated as whitespace. */
function tokenizeAlg(moves: string): string[] {
  return moves.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
}

/** Peel x/y/z rotations (and their quantity-suffixed forms) off the
 *  ends of a token list. A leading rotation is purely a setup
 *  re-orientation the cuber does before the working moves begin; a
 *  trailing rotation is purely the cuber re-orienting after. Both are
 *  no-ops as far as the case pattern is concerned — the resulting cube
 *  state is the same OLL/PLL case in a y-rotated orientation, which
 *  the recognizer handles via its AUF × y-rotation enumeration. Mid-alg
 *  rotations are NOT stripped: they would silently re-label every move
 *  that follows. */
function stripOuterRotationTokens(tokens: readonly string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && /^[xyz]/.test(tokens[start]!)) start++;
  while (end > start && /^[xyz]/.test(tokens[end - 1]!)) end--;
  return tokens.slice(start, end);
}

/** True iff every token is an uppercase face turn — no wide moves,
 *  slices, or rotations. Operates on the already-stripped body so
 *  rotations at the very ends don't disqualify an otherwise-clean alg. */
function isCleanBody(tokens: readonly string[]): boolean {
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
 *  artifact lands as `R2`, and same-face runs across the AUF/alg
 *  boundary are merged — so a `U` AUF prepended to an alg starting
 *  with `U` becomes `U2 …` instead of the giveaway `U U …`. */
export function generateTrainerScramble(
  stage: TrainerStage,
  caseId: string,
): string {
  const pool = getPool(stage).algsByCase.get(caseId);
  if (!pool || pool.length === 0) {
    throw new Error(`unknown ${stage} case: ${caseId}`);
  }
  const alg = pickRandom(pool);
  const aufPre = pickRandom(AUF_OPTIONS);
  const combined = normalizeScramble(
    [aufPre, invertAlg(alg)].filter(Boolean).join(" "),
  );
  return simplifyMoves(combined.split(/\s+/).filter(Boolean)).join(" ");
}

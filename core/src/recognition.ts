// OLL / PLL case recognition.
//
// Given a post-F2L cube state, identify which of the 57 OLL cases is
// presented. Given a post-OLL state, identify which of the 21 PLL cases.
//
// Algorithm: at module init, for each case in the dataset, apply the
// inverse of its primary algorithm to a solved cube. That produces the
// case's canonical state. Normalize so yellow is on top, then capture
// the pattern (which top-layer stickers are which colors / U-color)
// across all 4 AUF rotations. Store in a Map<pattern → caseId>.
//
// At recognition time: encode the user's state into the same pattern
// string and look up. O(1) per recognition after the one-time table
// build (~250µs).
//
// Limitations:
//   - Assumes cross-on-D (standard CFOP, white-cross). For a yellow-cross
//     cuber or color-neutral cubers, the post-F2L state would have the
//     OLL pattern on a different face — we'd need to rotate first.
//     `analyzeSolveCases` honors the cross face from the supplied
//     PhaseAnalysis and rotates accordingly.
//   - Some OLL cases share primary-alg algs with non-clean (wide-move)
//     notation. We use the same alg-picking logic as the SVG renderer
//     (`pickCleanAlg`) which prefers face-only algs and falls back to
//     `normalizeYellowOnTop` for the rest.

import ollData from "../../data/methods/cfop/oll.json" with { type: "json" };
import pllData from "../../data/methods/cfop/pll.json" with { type: "json" };

import {
  applyAlg,
  FACE_INDEX,
  invertAlg,
  normalizeYellowOnTop,
  type State,
  solved,
} from "./cube.js";
import type { MoveEvent } from "./entities.js";
import type { PhaseAnalysis } from "./phases.js";

export interface RecognizedCase {
  id: string;
  name: string;
}

// ---- Sticker layout helpers ----

const U = FACE_INDEX.U;
const L = FACE_INDEX.L;
const F = FACE_INDEX.F;
const R = FACE_INDEX.R;
const B = FACE_INDEX.B;

/** 8 U-face stickers (the 9th is the center, always U-color) + 12
 *  side-top stickers (top row of each side face). Together these
 *  describe the entire U-layer state. */
const U_LAYER_INDICES: readonly number[] = [
  // U face slots 0..8 excluding center 4
  U * 9 + 0, U * 9 + 1, U * 9 + 2,
  U * 9 + 3,            U * 9 + 5,
  U * 9 + 6, U * 9 + 7, U * 9 + 8,
  // L top row (back-left → front-left, depending on layout)
  L * 9 + 0, L * 9 + 1, L * 9 + 2,
  // F top row
  F * 9 + 0, F * 9 + 1, F * 9 + 2,
  // R top row
  R * 9 + 0, R * 9 + 1, R * 9 + 2,
  // B top row
  B * 9 + 0, B * 9 + 1, B * 9 + 2,
];

const SIDE_TOP_INDICES: readonly number[] = [
  L * 9 + 0, L * 9 + 1, L * 9 + 2,
  F * 9 + 0, F * 9 + 1, F * 9 + 2,
  R * 9 + 0, R * 9 + 1, R * 9 + 2,
  B * 9 + 0, B * 9 + 1, B * 9 + 2,
];

/** OLL pattern: which U-layer stickers are U-color. Returns a 20-char
 *  string of `Y`/`N`. */
function encodeOLLPattern(state: State): string {
  const uColor = state[U * 9 + 4];
  let out = "";
  for (const i of U_LAYER_INDICES) {
    out += state[i] === uColor ? "Y" : "N";
  }
  return out;
}

/** PLL pattern: the 12 side-top sticker colors as a string. Compared
 *  with the cube's own color scheme (Western) so this works as long as
 *  the simulator state was reached from a solved cube. */
function encodePLLPattern(state: State): string {
  let out = "";
  for (const i of SIDE_TOP_INDICES) {
    out += state[i];
  }
  return out;
}

// ---- Alg picking (mirrors the SVG renderer's logic) ----

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

interface CaseRecord {
  id: string;
  name: string;
  algorithms: ReadonlyArray<{ moves: string }>;
}

function pickAlg(c: CaseRecord): string | null {
  for (const a of c.algorithms) {
    if (isCleanAlg(a.moves)) return a.moves;
  }
  return c.algorithms[0]?.moves ?? null;
}

/** Apply inverse(primary alg) to a solved cube and normalize so the
 *  U-face shows yellow. Returns null on parse failures (very rare). */
function caseStateFor(c: CaseRecord): State | null {
  const moves = pickAlg(c);
  if (!moves) return null;
  try {
    const setup = invertAlg(moves);
    return normalizeYellowOnTop(applyAlg(solved(), setup));
  } catch {
    return null;
  }
}

// ---- Lookup table construction ----

const AUFS = ["", "U", "U2", "U'"] as const;

let ollMap: Map<string, RecognizedCase> | null = null;
let pllMap: Map<string, RecognizedCase> | null = null;

function buildOLLMap(): Map<string, RecognizedCase> {
  if (ollMap) return ollMap;
  const map = new Map<string, RecognizedCase>();
  for (const c of ollData.cases as CaseRecord[]) {
    const base = caseStateFor(c);
    if (!base) continue;
    for (const auf of AUFS) {
      const rotated = auf === "" ? base : applyAlg(base, auf);
      const pattern = encodeOLLPattern(rotated);
      // First-write wins on collisions — shouldn't happen for distinct
      // OLL cases, but stay defensive.
      if (!map.has(pattern)) {
        map.set(pattern, { id: c.id, name: c.name });
      }
    }
  }
  ollMap = map;
  return map;
}

function buildPLLMap(): Map<string, RecognizedCase> {
  if (pllMap) return pllMap;
  const map = new Map<string, RecognizedCase>();
  for (const c of pllData.cases as CaseRecord[]) {
    const base = caseStateFor(c);
    if (!base) continue;
    for (const auf of AUFS) {
      const rotated = auf === "" ? base : applyAlg(base, auf);
      const pattern = encodePLLPattern(rotated);
      if (!map.has(pattern)) {
        map.set(pattern, { id: c.id, name: c.name });
      }
    }
  }
  pllMap = map;
  return map;
}

// ---- Public API ----

/** Recognize the OLL case from a post-F2L cube state (cross on D, U-face
 *  showing the OLL pattern). Returns null if the state doesn't match any
 *  known case — happens for "OLL skip" (state is already solved on top). */
export function recognizeOLL(state: State): RecognizedCase | null {
  return buildOLLMap().get(encodeOLLPattern(state)) ?? null;
}

/** Recognize the PLL case from a post-OLL cube state. Returns null on
 *  PLL skip (all top + side stickers already aligned). */
export function recognizePLL(state: State): RecognizedCase | null {
  return buildPLLMap().get(encodePLLPattern(state)) ?? null;
}

export interface CaseAnalysis {
  oll: RecognizedCase | null;
  pll: RecognizedCase | null;
}

/** Top-level: take a scramble + move stream + the phase analysis (from
 *  `batchPhases`) and return the recognized OLL + PLL cases. Re-simulates
 *  the solve up to the phase boundaries — cheap, just walks the moves
 *  once each. */
export function analyzeSolveCases(
  scramble: string,
  moveStream: readonly MoveEvent[],
  analysis: PhaseAnalysis,
): CaseAnalysis {
  // We only recognize OLL/PLL when cross is on D — that's the only
  // orientation the predicates and case patterns are aligned to. For
  // other cross faces, we'd need to rotate state before recognition.
  // Yellow-cross / color-neutral support is a future extension.
  if (analysis.crossFace !== "D") {
    return { oll: null, pll: null };
  }

  const f2l = analysis.phases.find((p) => p.stage === "f2l");
  const oll = analysis.phases.find((p) => p.stage === "oll");
  if (!f2l && !oll) return { oll: null, pll: null };

  let state: State;
  try {
    state = scramble.trim().length === 0 ? solved() : applyAlg(solved(), scramble);
  } catch {
    return { oll: null, pll: null };
  }

  let ollCase: RecognizedCase | null = null;
  let pllCase: RecognizedCase | null = null;

  // Walk to end of F2L → recognize OLL from this state.
  if (f2l) {
    for (let i = 0; i < f2l.endIndex; i++) {
      try {
        state = applyAlg(state, moveStream[i]!.move);
      } catch {
        // skip malformed
      }
    }
    ollCase = recognizeOLL(state);
  }

  // Continue to end of OLL → recognize PLL from this state.
  if (oll && f2l) {
    for (let i = f2l.endIndex; i < oll.endIndex; i++) {
      try {
        state = applyAlg(state, moveStream[i]!.move);
      } catch {
        // skip malformed
      }
    }
    pllCase = recognizePLL(state);
  }

  return { oll: ollCase, pll: pllCase };
}

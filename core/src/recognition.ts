// OLL / PLL case recognition.
//
// Given a post-F2L cube state, identify which of the 57 OLL cases is
// presented. Given a post-OLL state, identify which of the 21 PLL cases.
//
// Algorithm: at module init, for each case in the dataset, apply the
// inverse of its primary algorithm to a solved cube. That produces the
// case's canonical state. Normalize so yellow is on top, then capture
// a color-independent pattern across all 4 AUF rotations. Store in a
// Map<pattern → caseId>.
//
// Color independence: OLL is encoded as "which U-layer stickers match
// the U-center" (Y/N). PLL is encoded as "which side-center color does
// each side-top sticker match" (F/R/B/L). Both encodings only depend on
// the cube's RELATIVE state, not on which physical colors live on which
// faces — so recognition works regardless of the cuber's cross color.
//
// Orientation: before encoding, callers should rotate the state so the
// cross face is on D (i.e. so the cuber's last layer is on U). Use
// `normalizeToCrossOnD` from phases.ts. The recognition functions below
// expect their input to already be in that frame.
//
// At recognition time: encode the user's state into the same pattern
// string and look up. O(1) per recognition after the one-time table
// build (~250µs).

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
import { normalizeToCrossOnD, type PhaseAnalysis } from "./phases.js";

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

/** PLL pattern: for each of the 12 side-top stickers, emit which side
 *  face's center it matches (`F`/`R`/`B`/`L`). Color-independent — only
 *  the *relationship* between LL stickers and their side centers matters,
 *  so this works for any orientation the state was rotated into. */
function encodePLLPattern(state: State): string {
  const fc = state[F * 9 + 4];
  const rc = state[R * 9 + 4];
  const bc = state[B * 9 + 4];
  const lc = state[L * 9 + 4];
  let out = "";
  for (const i of SIDE_TOP_INDICES) {
    const c = state[i];
    if (c === fc) out += "F";
    else if (c === rc) out += "R";
    else if (c === bc) out += "B";
    else if (c === lc) out += "L";
    else out += "?"; // U-color showing on a side-top sticker (invalid PLL input)
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

/** Whole-cube y rotations. Together with AUFs these cover every cross-on-D
 *  orientation a normalized state can land in. AUF cycles only U-layer
 *  stickers; y cycles stickers AND side centers — for our face-letter PLL
 *  encoding these produce *different* strings, so both must be enumerated. */
const Y_ROTATIONS = ["", "y", "y2", "y'"] as const;

function buildPLLMap(): Map<string, RecognizedCase> {
  if (pllMap) return pllMap;
  const map = new Map<string, RecognizedCase>();
  for (const c of pllData.cases as CaseRecord[]) {
    const base = caseStateFor(c);
    if (!base) continue;
    for (const y of Y_ROTATIONS) {
      const yRotated = y === "" ? base : applyAlg(base, y);
      for (const auf of AUFS) {
        const rotated = auf === "" ? yRotated : applyAlg(yRotated, auf);
        const pattern = encodePLLPattern(rotated);
        if (!map.has(pattern)) {
          map.set(pattern, { id: c.id, name: c.name });
        }
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
 *  the solve up to the phase boundaries, then rotates the state so the
 *  cuber's last layer lands on U before pattern matching — that's what
 *  makes recognition work for any cross face (white, yellow, color-
 *  neutral) and for any orientation the cuber holds the cube in. */
export function analyzeSolveCases(
  scramble: string,
  moveStream: readonly MoveEvent[],
  analysis: PhaseAnalysis,
): CaseAnalysis {
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

  // Walk to end of F2L → recognize OLL from this state, rotated so the
  // last layer is on U.
  if (f2l) {
    for (let i = 0; i < f2l.endIndex; i++) {
      try {
        state = applyAlg(state, moveStream[i]!.move);
      } catch {
        // skip malformed
      }
    }
    ollCase = recognizeOLL(normalizeToCrossOnD(state, analysis.crossFace));
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
    pllCase = recognizePLL(normalizeToCrossOnD(state, analysis.crossFace));
  }

  return { oll: ollCase, pll: pllCase };
}

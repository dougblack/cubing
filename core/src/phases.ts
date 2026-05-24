// CFOP phase detection.
//
// `batchPhases(scramble, moveStream)` is the entry point. It walks the
// moves once to detect which face the cuber treated as the cross
// (any of U/D/L/R/F/B by checking all 6 candidates per move and picking
// the first to fire), then re-runs detection with that face baked into
// rotation-normalized predicates. Returns a `PhaseAnalysis` with the
// per-phase boundaries, durations, and the detected cross face.
//
// Phases, in CFOP order:
//   cross  — the 4 cross-color edges placed and oriented
//   f2l    — bottom two layers fully solved
//   oll    — F2L solved + all 9 OLL-face stickers show OLL-color
//   pll    — fully solved
//
// A skip is reported as a zero-length phase (start === end). A stage
// that was already solved when the cube started moving (e.g. the
// scramble didn't break it) is reported the same way.

import { applyAlg, type State, solved, type StickerColor } from "./cube.js";
import type { MoveEvent } from "./entities.js";
import { type CubeFace, CUBE_FACES } from "./orientation.js";
import type { StageSlug } from "./types.js";

// ---- Face index constants ----

const U = 0;
const L = 1;
const F = 2;
const R = 3;
const B = 4;
const D = 5;

function s(state: State, face: number, slot: number): StickerColor {
  return state[face * 9 + slot]!;
}

// ---- Predicates (all checked against cross-on-D) ----
//
// These are the "canonical" predicates. To check whether a phase is
// complete relative to a DIFFERENT cross face, the caller rotates the
// state so the candidate cross face lands at D, then runs these.

/** Cross on D: 4 D-face edges show D-color, plus each side face's
 *  bottom-center sticker matches its own center. */
function isCrossSolved_D(state: State): boolean {
  const dColor = s(state, D, 4);
  if (s(state, D, 1) !== dColor) return false;
  if (s(state, D, 3) !== dColor) return false;
  if (s(state, D, 5) !== dColor) return false;
  if (s(state, D, 7) !== dColor) return false;
  if (s(state, F, 7) !== s(state, F, 4)) return false;
  if (s(state, R, 7) !== s(state, R, 4)) return false;
  if (s(state, B, 7) !== s(state, B, 4)) return false;
  if (s(state, L, 7) !== s(state, L, 4)) return false;
  return true;
}

/** F2L on D: cross solved + 4 D-corners + 4 middle-layer edges. */
function isF2LSolved_D(state: State): boolean {
  if (!isCrossSolved_D(state)) return false;
  const dColor = s(state, D, 4);
  if (s(state, D, 0) !== dColor) return false;
  if (s(state, D, 2) !== dColor) return false;
  if (s(state, D, 6) !== dColor) return false;
  if (s(state, D, 8) !== dColor) return false;
  for (const face of [F, R, B, L]) {
    const c = s(state, face, 4);
    if (s(state, face, 6) !== c) return false;
    if (s(state, face, 8) !== c) return false;
    if (s(state, face, 3) !== c) return false;
    if (s(state, face, 5) !== c) return false;
  }
  return true;
}

/** OLL relative to cross-on-D: F2L solved + all 9 U-face stickers
 *  show U-color (the layer may still need to be permuted). */
function isOLLSolved_D(state: State): boolean {
  if (!isF2LSolved_D(state)) return false;
  const uColor = s(state, U, 4);
  for (let i = 0; i < 9; i++) {
    if (s(state, U, i) !== uColor) return false;
  }
  return true;
}

/** Fully solved — equivalent to PLL complete. */
function isSolved(state: State): boolean {
  for (let face = 0; face < 6; face++) {
    const c = s(state, face, 4);
    for (let i = 0; i < 9; i++) {
      if (s(state, face, i) !== c) return false;
    }
  }
  return true;
}

// ---- Rotation-normalized predicates ----
//
// To check a phase relative to cross-on-X, apply the rotation that
// brings X to the D position, then run the D predicate. Saves us per-face
// lookup tables; relies on the simulator's rotation moves being correct
// (which they are — they're already used by the diagram renderer).

// x maps D→F, F→U, U→B, B→D — so to bring B's contents down to D you do `x`,
// and to bring F's contents down to D you do `x'`. (Easy to flip; doesn't
// matter for `isCrossSolved_D` on uniform-cross states until you actually
// look at OLL/PLL stickers post-normalization, then suddenly it does.)
const NORMALIZE_ROTATION: Record<CubeFace, string> = {
  D: "",
  U: "x2",
  F: "x'",
  B: "x",
  L: "z'",
  R: "z",
};

/** Rotate `state` so `crossFace` lands on D (and therefore the opposite
 *  face — the cuber's last layer — lands on U). Useful for any predicate
 *  or pattern check that wants to look at the LL from above without
 *  hard-coding a particular orientation. */
export function normalizeToCrossOnD(state: State, crossFace: CubeFace): State {
  const rot = NORMALIZE_ROTATION[crossFace];
  return rot === "" ? state : applyAlg(state, rot);
}

/** Find which face holds a cross of the given color (its 4 edge stickers
 *  all show `crossColor`), or `null` if none. Deliberately ignores the
 *  face's CENTER color — for renders coming out of the BT-frame-mismatch
 *  pipeline, the cube's centers may not align with the cuber's color
 *  expectations, but the cross-color stickers themselves do end up at a
 *  recoverable face. Useful for orienting a render so the cuber's cross
 *  color sits on the bottom regardless of how the sim's frame tracked
 *  the solve. */
export function findCrossFaceForColor(
  state: State,
  crossColor: StickerColor,
): CubeFace | null {
  // Map our public face letters to the internal index used elsewhere
  // in this file. CUBE_FACES from orientation.ts is in ULFRBD order
  // already-matching FACE_INDEX, but we re-derive the offset to stay
  // independent of that array's order.
  const FACE_OFFSET: Record<CubeFace, number> = {
    U: U * 9,
    L: L * 9,
    F: F * 9,
    R: R * 9,
    B: B * 9,
    D: D * 9,
  };
  for (const face of CUBE_FACES) {
    const base = FACE_OFFSET[face];
    if (
      state[base + 1] === crossColor &&
      state[base + 3] === crossColor &&
      state[base + 5] === crossColor &&
      state[base + 7] === crossColor
    ) {
      return face;
    }
  }
  return null;
}

function normalize(state: State, crossFace: CubeFace): State {
  return normalizeToCrossOnD(state, crossFace);
}

function isCrossSolvedOn(state: State, crossFace: CubeFace): boolean {
  return isCrossSolved_D(normalize(state, crossFace));
}
function isF2LSolvedOn(state: State, crossFace: CubeFace): boolean {
  return isF2LSolved_D(normalize(state, crossFace));
}
function isOLLSolvedOn(state: State, crossFace: CubeFace): boolean {
  return isOLLSolved_D(normalize(state, crossFace));
}

// ---- Public API ----

export interface Phase {
  stage: StageSlug;
  /** Inclusive index into the input move stream where this phase's
   *  first move was applied. */
  startIndex: number;
  /** Exclusive end index — one past the move that completed this phase. */
  endIndex: number;
  /** Time the phase took, derived from the move events' tMs values. */
  durationMs: number;
}

export interface PhaseAnalysis {
  phases: Phase[];
  /** True iff the cube ended in the solved state. */
  completed: boolean;
  /** The cross face that was detected and used for predicate checks.
   *  Defaults to `"D"` when no cross ever completes (incomplete solve). */
  crossFace: CubeFace;
}

/** Detect CFOP phase boundaries in a solve, color-neutral. */
export function batchPhases(
  scramble: string,
  moveStream: readonly MoveEvent[],
): PhaseAnalysis {
  const startState = initialState(scramble);
  if (startState === null) {
    return { phases: [], completed: false, crossFace: "D" };
  }
  const crossFace = detectCrossFace(startState, moveStream);
  return runDetection(scramble, moveStream, crossFace);
}

// ---- Internals ----

function initialState(scramble: string): State | null {
  let state = solved();
  if (scramble.trim().length === 0) return state;
  try {
    state = applyAlg(state, scramble);
    return state;
  } catch {
    return null;
  }
}

/** Returns the face whose cross predicate is the FIRST to fire while
 *  walking the moves. Falls back to D if none fires (e.g. incomplete
 *  solve that never finished cross). */
function detectCrossFace(
  startState: State,
  moveStream: readonly MoveEvent[],
): CubeFace {
  for (const face of CUBE_FACES) {
    if (isCrossSolvedOn(startState, face)) return face;
  }
  let state = startState;
  for (const ev of moveStream) {
    try {
      state = applyAlg(state, ev.move);
    } catch {
      continue;
    }
    for (const face of CUBE_FACES) {
      if (isCrossSolvedOn(state, face)) return face;
    }
  }
  return "D";
}

function runDetection(
  scramble: string,
  moveStream: readonly MoveEvent[],
  crossFace: CubeFace,
): PhaseAnalysis {
  if (moveStream.length === 0) {
    return { phases: [], completed: false, crossFace };
  }
  const startState = initialState(scramble);
  if (startState === null) {
    return { phases: [], completed: false, crossFace };
  }
  let state = startState;

  // null = never completed; -1 = already done at start; N≥0 = completed at move N.
  let crossEnd: number | null = null;
  let f2lEnd: number | null = null;
  let ollEnd: number | null = null;
  let pllEnd: number | null = null;

  if (isCrossSolvedOn(state, crossFace)) crossEnd = -1;
  if (isF2LSolvedOn(state, crossFace)) f2lEnd = -1;
  if (isOLLSolvedOn(state, crossFace)) ollEnd = -1;
  if (isSolved(state)) pllEnd = -1;

  for (let i = 0; i < moveStream.length; i++) {
    try {
      state = applyAlg(state, moveStream[i]!.move);
    } catch {
      continue;
    }
    if (crossEnd === null && isCrossSolvedOn(state, crossFace)) crossEnd = i;
    if (f2lEnd === null && isF2LSolvedOn(state, crossFace)) f2lEnd = i;
    if (ollEnd === null && isOLLSolvedOn(state, crossFace)) ollEnd = i;
    if (pllEnd === null && isSolved(state)) {
      pllEnd = i;
      break;
    }
  }

  const phases: Phase[] = [];
  const tAt = (i: number): number => {
    if (i < 0 || moveStream.length === 0) return 0;
    return moveStream[Math.min(i, moveStream.length - 1)]!.tMs;
  };
  function push(stage: StageSlug, prevEnd: number | null, thisEnd: number | null) {
    if (thisEnd === null) return;
    const startIndex = prevEnd === null ? 0 : Math.max(0, prevEnd + 1);
    const endIndex = Math.max(0, thisEnd + 1);
    const startMs = startIndex === 0 ? 0 : tAt(startIndex - 1);
    const endMs = tAt(thisEnd);
    phases.push({
      stage,
      startIndex,
      endIndex,
      durationMs: Math.max(0, endMs - startMs),
    });
  }
  push("cross", null, crossEnd);
  push("f2l", crossEnd, f2lEnd);
  push("oll", f2lEnd, ollEnd);
  push("pll", ollEnd, pllEnd);

  return { phases, completed: pllEnd !== null, crossFace };
}

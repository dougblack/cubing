// Live scramble tracker. Given a scramble string and incoming cube moves
// (already remapped into the user's frame), this state machine reports
// which step is current and whether each cube event advances, stays on the
// current step, or is "wrong" — which the caller can use to regenerate the
// remaining portion of the scramble.
//
// All logic is pure — no reactive state. The owning component holds the
// `TrackerState` and replaces it with the return value of `tickTracker` on
// every cube move.

import type { CubeFace } from "./orientation.js";

/** A single move from a scramble string after parsing. */
export interface ScrambleMove {
  face: CubeFace;
  /** +1 = single CW (`R`), -1 = single CCW (`R'`), 2 = double turn (`R2`). */
  quantity: 1 | -1 | 2;
}

export interface TrackerState {
  /** The full scramble parsed into steps. */
  readonly steps: readonly ScrambleMove[];
  /** Index of the step currently being executed. Equal to `steps.length`
   *  when the scramble is complete. */
  readonly currentIndex: number;
  /** Progress within an R2-type step. 0 = waiting for the first turn (any
   *  direction is fine); 1 = waiting for the second turn matching the first
   *  direction. Always 0 for non-double steps. */
  readonly subProgress: 0 | 1;
  /** Direction of the first turn on a double step. Only meaningful when
   *  subProgress === 1. */
  readonly subDirection: 1 | -1 | null;
}

export type TickResult = "stay" | "advance" | "wrong";

const FACE_SET = new Set<CubeFace>(["U", "D", "L", "R", "F", "B"]);

function isCubeFace(s: string): s is CubeFace {
  return FACE_SET.has(s as CubeFace);
}

/** Parse a scramble string into structured moves. Whitespace is the
 *  separator; tokens that don't match `<face>[2|']` are skipped silently.
 *  WCA scrambles only contain face-only turns, no wide moves / slices /
 *  rotations — anything else is a bug in the source. */
export function parseScramble(scramble: string): ScrambleMove[] {
  const out: ScrambleMove[] = [];
  for (const tok of scramble.trim().split(/\s+/)) {
    const move = parseMove(tok);
    if (move) out.push(move);
  }
  return out;
}

function parseMove(token: string): ScrambleMove | null {
  if (token.length === 0) return null;
  const face = token.charAt(0);
  if (!isCubeFace(face)) return null;
  const suffix = token.slice(1);
  if (suffix === "") return { face, quantity: 1 };
  if (suffix === "'") return { face, quantity: -1 };
  if (suffix === "2") return { face, quantity: 2 };
  return null;
}

/** Fresh tracker for a scramble string. Caller passes this around as the
 *  authoritative state. */
export function newTrackerState(scramble: string): TrackerState {
  return {
    steps: parseScramble(scramble),
    currentIndex: 0,
    subProgress: 0,
    subDirection: null,
  };
}

export function isComplete(state: TrackerState): boolean {
  return state.currentIndex >= state.steps.length;
}

export function remainingMoves(state: TrackerState): number {
  return Math.max(0, state.steps.length - state.currentIndex);
}

/** Apply a cube event to the tracker.
 *
 *  `cubeMove` is a single 90° turn in the user's frame — `"R"`, `"R'"`,
 *  `"U"`, etc. (Cubes don't report half turns directly; an `R2` scramble
 *  step is satisfied by two same-direction events.)
 *
 *  Returns the new state plus a result:
 *  - `"advance"` — the cube turn satisfied the current step; the next step
 *    is now active (or the scramble is complete).
 *  - `"stay"` — the cube turn was the first half of a double-turn step; the
 *    state moved within the step but hasn't advanced past it.
 *  - `"wrong"` — the cube turn doesn't match what's expected. The caller
 *    should regenerate the remaining portion of the scramble.
 *
 *  Inputs after the scramble is complete always return `"wrong"` (the
 *  caller is expected to stop feeding events at that point — typically by
 *  transitioning the timer into inspection). */
export function tickTracker(
  state: TrackerState,
  cubeMove: string,
): { state: TrackerState; result: TickResult } {
  if (isComplete(state)) return { state, result: "wrong" };

  const event = parseMove(cubeMove);
  if (!event || event.quantity === 2) {
    // Cubes report 90° turns only; 2 here would mean garbage input.
    return { state, result: "wrong" };
  }

  const step = state.steps[state.currentIndex]!;
  if (event.face !== step.face) return { state, result: "wrong" };

  if (step.quantity === 1) {
    return event.quantity === 1
      ? { state: advance(state), result: "advance" }
      : { state, result: "wrong" };
  }
  if (step.quantity === -1) {
    return event.quantity === -1
      ? { state: advance(state), result: "advance" }
      : { state, result: "wrong" };
  }
  // Double turn.
  if (state.subProgress === 0) {
    return {
      state: { ...state, subProgress: 1, subDirection: event.quantity },
      result: "stay",
    };
  }
  // subProgress === 1 — need a second turn in the same direction.
  return event.quantity === state.subDirection
    ? { state: advance(state), result: "advance" }
    : { state, result: "wrong" };
}

function advance(state: TrackerState): TrackerState {
  return {
    ...state,
    currentIndex: state.currentIndex + 1,
    subProgress: 0,
    subDirection: null,
  };
}

/** Pairwise-collapse two adjacent identical quarter turns into a single
 *  half turn. `F F → F2`, `R' R' → R2`. Doesn't chain (so `R R R` becomes
 *  `R2 R`, not `R'`) and doesn't cancel opposites (`R R'` stays as two
 *  moves). The function is intended for display — BT cube events arrive
 *  one quarter turn at a time, and collapsing makes a 60-move solve read
 *  the way a cuber would write it. */
export function collapseDoubleTurns(moves: readonly string[]): string[] {
  const out: string[] = [];
  for (const move of moves) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev === move && !move.endsWith("2")) {
      out[out.length - 1] = move.charAt(0) + "2";
    } else {
      out.push(move);
    }
  }
  return out;
}

/** Returns a parallel boolean array marking moves that participate in a
 *  consecutive same-face run that uses more turns than strictly needed.
 *  Examples: `["U2", "U"]` → `[true, true]` (one move would do); `["R",
 *  "U", "R'"]` → `[false, false, false]`; `["R", "R'"]` → `[true, true]`
 *  (cancels). Strictly a notation check — doesn't reason about commuting
 *  faces (e.g. `R L R'`), only literal adjacency on the same base. */
export function markExtraneousMoves(moves: readonly string[]): boolean[] {
  const out = new Array<boolean>(moves.length).fill(false);
  let i = 0;
  while (i < moves.length) {
    const base = moveBase(moves[i]!);
    let j = i + 1;
    while (j < moves.length && moveBase(moves[j]!) === base) j++;
    // A run of >1 same-base moves can always be reduced to at most one
    // move (the equivalent of the summed quarter-turns mod 4) — so every
    // member of the run is extraneous.
    if (j - i > 1) {
      for (let k = i; k < j; k++) out[k] = true;
    }
    i = j;
  }
  return out;
}

/** Strip the trailing `'` or `2` to get the move's base face token. */
function moveBase(move: string): string {
  const last = move.charAt(move.length - 1);
  if (last === "'" || last === "2") return move.slice(0, -1);
  return move;
}

/** Quarter-turn count of a single move: 1 for `F`, -1 for `F'`, 2 for `F2`.
 *  Unrecognized suffix → 1. */
function moveTurns(move: string): number {
  const last = move.charAt(move.length - 1);
  if (last === "'") return -1;
  if (last === "2") return 2;
  return 1;
}

/** Reduce consecutive same-face turns to their net effect. Use this for
 *  the canonical scramble string — `F F' F → F`, `R R R R → ` (nothing),
 *  `U U U → U'`, `F2 F → F'`. Different-face runs are kept as-is.
 *
 *  This is a stronger version of `collapseDoubleTurns`. Use it when the
 *  display should show only the effective state-transforming moves and
 *  hide hesitations. For solve move-by-move display, prefer
 *  `collapseDoubleTurns` + `markExtraneousMoves`, which preserves what
 *  the cuber actually did and flags the waste. */
export function simplifyMoves(moves: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < moves.length) {
    const base = moveBase(moves[i]!);
    let net = 0;
    let j = i;
    while (j < moves.length && moveBase(moves[j]!) === base) {
      net += moveTurns(moves[j]!);
      j++;
    }
    const n = ((net % 4) + 4) % 4;
    if (n === 1) out.push(base);
    else if (n === 2) out.push(base + "2");
    else if (n === 3) out.push(base + "'");
    // n === 0 → cancels, emit nothing
    i = j;
  }
  return out;
}

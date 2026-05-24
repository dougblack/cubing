// Minimal 3x3 sticker simulator. 54 stickers = 6 faces × 9 stickers.
// Face indices: U=0, L=1, F=2, R=3, B=4, D=5. Within a face, indices are
// row-major from the top-left when looking AT that face:
//
//        U          L         F         R         B         D
//      0 1 2     0 1 2     0 1 2     0 1 2     0 1 2     0 1 2
//      3 4 5     3 4 5     3 4 5     3 4 5     3 4 5     3 4 5
//      6 7 8     6 7 8     6 7 8     6 7 8     6 7 8     6 7 8
//
// Standard speedcube color scheme: U=yellow, D=white, F=green, B=blue, L=orange, R=red.

import { Alg, Move } from "cubing/alg";

export type FaceLetter = "U" | "L" | "F" | "R" | "B" | "D";
export const FACES: readonly FaceLetter[] = ["U", "L", "F", "R", "B", "D"] as const;
export const FACE_INDEX: Record<FaceLetter, number> = { U: 0, L: 1, F: 2, R: 3, B: 4, D: 5 };

export type StickerColor = "Y" | "W" | "G" | "B" | "O" | "R";
const FACE_COLOR: Record<FaceLetter, StickerColor> = {
  U: "Y",
  D: "W",
  F: "G",
  B: "B",
  L: "O",
  R: "R",
};

export type State = StickerColor[]; // length 54

export function solved(): State {
  const s: StickerColor[] = [];
  for (const face of FACES) {
    for (let i = 0; i < 9; i++) s.push(FACE_COLOR[face]);
  }
  return s;
}

/** Parse a 54-character Kociemba facelets string (URFDLB face order, each
 *  face row-major from top-left when viewed from outside) into our internal
 *  State. The chars `U/R/F/D/L/B` are mapped to their standard sticker
 *  colors (U→Y, D→W, F→G, B→B, L→O, R→R). Throws on bad input. */
export function parseKociembaFacelets(facelets: string): State {
  if (facelets.length !== 54) {
    throw new Error(
      `parseKociembaFacelets: expected 54 chars, got ${facelets.length}`,
    );
  }
  const FACE_TO_COLOR: Record<string, StickerColor> = {
    U: "Y",
    D: "W",
    F: "G",
    B: "B",
    L: "O",
    R: "R",
  };
  // Kociemba slices: U=0..8, R=9..17, F=18..26, D=27..35, L=36..44, B=45..53.
  // Our internal face order: U=0, L=1, F=2, R=3, B=4, D=5.
  const offsets: Record<FaceLetter, number> = {
    U: 0,
    R: 9,
    F: 18,
    D: 27,
    L: 36,
    B: 45,
  };
  const state: StickerColor[] = new Array(54);
  for (const face of FACES) {
    const off = offsets[face];
    const base = FACE_INDEX[face] * 9;
    for (let i = 0; i < 9; i++) {
      const ch = facelets[off + i]!;
      const color = FACE_TO_COLOR[ch];
      if (!color) {
        throw new Error(
          `parseKociembaFacelets: unknown character "${ch}" at index ${off + i}`,
        );
      }
      state[base + i] = color;
    }
  }
  return state;
}

/** Sticker index helper: faceIndex * 9 + slotIndex. */
const idx = (face: number, slot: number): number => face * 9 + slot;

/** Apply a CW rotation along the cycle. After the move, position[i] holds what was at position[i - turns mod n]. */
function cycle(state: State, positions: number[], turns: number): void {
  const n = positions.length;
  const t = ((turns % n) + n) % n;
  if (t === 0) return;
  const snapshot = positions.map((p) => state[p]!);
  for (let i = 0; i < n; i++) {
    const src = (i + n - t) % n;
    state[positions[i]!] = snapshot[src]!;
  }
}

// Define each face's 4 corner stickers and 4 edge stickers on the face itself (CW from top-left corner).
// (used for the on-face rotation when that face turns)
const FACE_CORNERS: Record<FaceLetter, number[]> = {
  U: [idx(0, 0), idx(0, 2), idx(0, 8), idx(0, 6)],
  D: [idx(5, 6), idx(5, 0), idx(5, 2), idx(5, 8)],
  F: [idx(2, 0), idx(2, 2), idx(2, 8), idx(2, 6)],
  B: [idx(4, 0), idx(4, 2), idx(4, 8), idx(4, 6)],
  L: [idx(1, 0), idx(1, 2), idx(1, 8), idx(1, 6)],
  R: [idx(3, 0), idx(3, 2), idx(3, 8), idx(3, 6)],
};
const FACE_EDGES: Record<FaceLetter, number[]> = {
  U: [idx(0, 1), idx(0, 5), idx(0, 7), idx(0, 3)],
  D: [idx(5, 7), idx(5, 3), idx(5, 1), idx(5, 5)],
  F: [idx(2, 1), idx(2, 5), idx(2, 7), idx(2, 3)],
  B: [idx(4, 1), idx(4, 5), idx(4, 7), idx(4, 3)],
  L: [idx(1, 1), idx(1, 5), idx(1, 7), idx(1, 3)],
  R: [idx(3, 1), idx(3, 5), idx(3, 7), idx(3, 3)],
};

// Surrounding-faces cycles for each face turn. CW when looking at that face.
// Each entry: 12 stickers (3 per adjacent face), grouped consecutively per face.
// Within each group, stickers go in the on-face order that the next face's group will receive.
const ADJACENT_CYCLES: Record<FaceLetter, number[]> = {
  // U turn (CW when looking at U from above):
  //   F top row -> L top row -> B top row -> R top row -> F
  //   F: 0,1,2  L: 0,1,2  B: 0,1,2  R: 0,1,2
  U: [
    idx(2, 0), idx(2, 1), idx(2, 2),
    idx(1, 0), idx(1, 1), idx(1, 2),
    idx(4, 0), idx(4, 1), idx(4, 2),
    idx(3, 0), idx(3, 1), idx(3, 2),
  ],
  // D turn (CW when looking at D from below):
  //   F bottom -> R bottom -> B bottom -> L bottom -> F
  D: [
    idx(2, 6), idx(2, 7), idx(2, 8),
    idx(3, 6), idx(3, 7), idx(3, 8),
    idx(4, 6), idx(4, 7), idx(4, 8),
    idx(1, 6), idx(1, 7), idx(1, 8),
  ],
  // R turn = CW around +x axis. Sticker direction cycle: F → U → B → D → F.
  // (A sticker that was on the F direction of an R-slice piece is now on U.)
  // Listing positions in U→B→D→F order so that with our backward cycle
  // function, new U = old F, new B = old U, etc.
  R: [
    idx(0, 2), idx(0, 5), idx(0, 8), // U right col, top-to-bottom
    idx(4, 6), idx(4, 3), idx(4, 0), // B left col (= B viewed-from-behind's right col), bottom-to-top
    idx(5, 2), idx(5, 5), idx(5, 8), // D right col, top-to-bottom
    idx(2, 2), idx(2, 5), idx(2, 8), // F right col, top-to-bottom
  ],
  // L turn = CCW around +x axis. Sticker direction cycle: B → U → F → D → B.
  // (Old U-sticker of L-slice piece → F direction at new position.)
  L: [
    idx(0, 0), idx(0, 3), idx(0, 6), // U left col, top-to-bottom
    idx(2, 0), idx(2, 3), idx(2, 6), // F left col, top-to-bottom
    idx(5, 0), idx(5, 3), idx(5, 6), // D left col, top-to-bottom
    idx(4, 8), idx(4, 5), idx(4, 2), // B right col (= viewed-from-behind), bottom-to-top
  ],
  // F turn (CW when looking at F from the front):
  //   U bottom row -> R left col -> D top row (reversed) -> L right col (reversed) -> U
  //   U bottom row L->R: U[6,7,8]
  //   R left col T->B: R[0,3,6]
  //   D top row R->L: D[2,1,0]
  //   L right col B->T: L[8,5,2]
  F: [
    idx(0, 6), idx(0, 7), idx(0, 8),
    idx(3, 0), idx(3, 3), idx(3, 6),
    idx(5, 2), idx(5, 1), idx(5, 0),
    idx(1, 8), idx(1, 5), idx(1, 2),
  ],
  // B turn (CW when looking at B from behind):
  //   U top row (reversed) -> L left col -> D bottom row -> R right col (reversed) -> U
  //   U top row R->L: U[2,1,0]
  //   L left col T->B: L[0,3,6]
  //   D bottom row L->R: D[6,7,8]
  //   R right col B->T: R[8,5,2]
  B: [
    idx(0, 2), idx(0, 1), idx(0, 0),
    idx(1, 0), idx(1, 3), idx(1, 6),
    idx(5, 6), idx(5, 7), idx(5, 8),
    idx(3, 8), idx(3, 5), idx(3, 2),
  ],
};

function turnFace(state: State, face: FaceLetter, amount: 1 | 2 | 3): void {
  cycle(state, FACE_CORNERS[face], amount);
  cycle(state, FACE_EDGES[face], amount);
  // Surrounding faces: 12-cycle that moves in steps of 3 per face turn.
  const cyc = ADJACENT_CYCLES[face];
  cycle(state, cyc, amount * 3);
}

// Slice moves. M (between L and R, follows L direction). E (between U and D, follows D direction). S (between F and B, follows F direction).
const SLICE_CYCLES: Record<"M" | "E" | "S", number[]> = {
  // M slice follows L direction (CCW around +x). Same direction-cycle as L.
  M: [
    idx(0, 1), idx(0, 4), idx(0, 7), // U middle col, top-to-bottom
    idx(2, 1), idx(2, 4), idx(2, 7), // F middle col, top-to-bottom
    idx(5, 1), idx(5, 4), idx(5, 7), // D middle col, top-to-bottom
    idx(4, 7), idx(4, 4), idx(4, 1), // B middle col (viewed-from-behind), bottom-to-top
  ],
  // E follows D direction. Affects middle horizontal row on F/R/B/L (not U or D).
  // D direction = CW from below. Cycle: F-mid-row -> R-mid-row -> B-mid-row -> L-mid-row -> F
  // F mid row L->R: F[3,4,5]
  // R mid row L->R: R[3,4,5]
  // B mid row L->R: B[3,4,5]
  // L mid row L->R: L[3,4,5]
  E: [
    idx(2, 3), idx(2, 4), idx(2, 5),
    idx(3, 3), idx(3, 4), idx(3, 5),
    idx(4, 3), idx(4, 4), idx(4, 5),
    idx(1, 3), idx(1, 4), idx(1, 5),
  ],
  // S follows F direction. Affects middle slice between F and B on U/R/D/L (not F or B).
  // F direction = CW from front. Cycle: U-mid-row -> R-mid-col -> D-mid-row(rev) -> L-mid-col(rev) -> U
  // U mid row L->R: U[3,4,5]
  // R mid col T->B: R[1,4,7]
  // D mid row R->L: D[5,4,3]
  // L mid col B->T: L[7,4,1]
  S: [
    idx(0, 3), idx(0, 4), idx(0, 5),
    idx(3, 1), idx(3, 4), idx(3, 7),
    idx(5, 5), idx(5, 4), idx(5, 3),
    idx(1, 7), idx(1, 4), idx(1, 1),
  ],
};

function turnSlice(state: State, slice: "M" | "E" | "S", amount: 1 | 2 | 3): void {
  cycle(state, SLICE_CYCLES[slice], amount * 3);
}

// Whole-cube rotations: implemented as face turn + same-direction slice + opposite face turn (reversed).
// x = R + M' + L'    (rotate whole cube in R direction)
// y = U + E' + D'
// z = F + S + B'
function rotate(state: State, axis: "x" | "y" | "z", amount: 1 | 2 | 3): void {
  switch (axis) {
    case "x":
      turnFace(state, "R", amount);
      turnSlice(state, "M", (4 - amount) as 1 | 2 | 3);
      turnFace(state, "L", (4 - amount) as 1 | 2 | 3);
      return;
    case "y":
      turnFace(state, "U", amount);
      turnSlice(state, "E", (4 - amount) as 1 | 2 | 3);
      turnFace(state, "D", (4 - amount) as 1 | 2 | 3);
      return;
    case "z":
      turnFace(state, "F", amount);
      turnSlice(state, "S", amount);
      turnFace(state, "B", (4 - amount) as 1 | 2 | 3);
      return;
  }
}

// Wide moves: r = R + M', l = L + M, u = U + E', d = D + E, f = F + S, b = B + S'
function wideTurn(state: State, face: FaceLetter, amount: 1 | 2 | 3): void {
  turnFace(state, face, amount);
  switch (face) {
    case "R":
      turnSlice(state, "M", (4 - amount) as 1 | 2 | 3);
      return;
    case "L":
      turnSlice(state, "M", amount);
      return;
    case "U":
      turnSlice(state, "E", (4 - amount) as 1 | 2 | 3);
      return;
    case "D":
      turnSlice(state, "E", amount);
      return;
    case "F":
      turnSlice(state, "S", amount);
      return;
    case "B":
      turnSlice(state, "S", (4 - amount) as 1 | 2 | 3);
      return;
  }
}

function isFace(s: string): s is FaceLetter {
  return s === "U" || s === "L" || s === "F" || s === "R" || s === "B" || s === "D";
}

function applyOneMove(state: State, move: Move): void {
  const family = move.family; // e.g. "R", "Rw", "r", "M", "x"
  const amount = ((((move.amount % 4) + 4) % 4) as 0 | 1 | 2 | 3);
  if (amount === 0) return;

  // Quantum amount = move.innerLayer / outerLayer not relevant for 3x3 single-layer moves;
  // we just care about family + amount.
  // Face turns
  if (family.length === 1 && isFace(family)) {
    turnFace(state, family, amount);
    return;
  }
  // Wide moves: "Rw", "Lw", "Uw", "Dw", "Fw", "Bw"
  if (family.length === 2 && family.endsWith("w")) {
    const f = family[0]!;
    if (isFace(f)) {
      wideTurn(state, f, amount);
      return;
    }
  }
  // Lowercase wide moves: "r", "l", "u", "d", "f", "b"
  if (family.length === 1) {
    const upper = family.toUpperCase();
    if ((upper === "R" || upper === "L" || upper === "U" || upper === "D" || upper === "F" || upper === "B") && family !== upper) {
      wideTurn(state, upper, amount);
      return;
    }
  }
  // Slice moves
  if (family === "M" || family === "E" || family === "S") {
    turnSlice(state, family, amount);
    return;
  }
  // Rotations
  if (family === "x" || family === "y" || family === "z") {
    rotate(state, family, amount);
    return;
  }
  throw new Error(`unsupported move family: '${family}' (full move: '${move.toString()}')`);
}

/** Apply an algorithm (WCA notation) to a state. Returns a new state. */
export function applyAlg(state: State, algString: string): State {
  const next = state.slice();
  const alg = new Alg(algString);
  for (const leaf of alg.experimentalExpand()) {
    if (leaf instanceof Move) {
      applyOneMove(next, leaf);
    }
    // Non-move leaves (pauses, comments) — ignore.
  }
  return next;
}

/** Invert an algorithm string. Used to get the "setup" scramble that produces a case from solved. */
export function invertAlg(algString: string): string {
  return new Alg(algString).invert().toString();
}

/** Apply whole-cube rotations until the yellow center sits on the U face.
 *
 *  Many algorithm databases publish algs that end with the cube in a
 *  different orientation (e.g. an `x` or `y` rotation buried in a wide move
 *  is not "cleaned up"). For a static diagram we want yellow always on top so
 *  the case shape reads correctly regardless of how the alg was written.
 */
export function normalizeYellowOnTop(state: State): State {
  const next = state.slice();
  // U=0, L=1, F=2, R=3, B=4, D=5. center sticker = face*9 + 4.
  const yellowFace = [0, 1, 2, 3, 4, 5].findIndex((f) => next[f * 9 + 4] === "Y");
  switch (yellowFace) {
    case 0: // already U
      return next;
    case 5: // D: flip with x2
      rotate(next, "x", 2);
      return next;
    case 2: // F: under x (U→B→D→F→U cycle), one x brings F to U.
      rotate(next, "x", 1);
      return next;
    case 4: // B: x' brings B to U.
      rotate(next, "x", 3);
      return next;
    case 1: // L: z brings L to U
      rotate(next, "z", 1);
      return next;
    case 3: // R: z' brings R to U
      rotate(next, "z", 3);
      return next;
    default:
      throw new Error("no yellow center found");
  }
}

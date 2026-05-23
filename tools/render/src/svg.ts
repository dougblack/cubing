// Render a "last layer" view of a 3x3 cube state as SVG.
//
// Layout (top-down view; the U face is the central 3x3 grid, surrounded by the
// top row of each side face):
//
//                Back (B[2], B[1], B[0])         <- reversed because we're looking down
//                +---+---+---+
//        L row   |   |   |   |   R row
//        L[2]    +---+---+---+   R[0]
//        L[1]    |   | U |   |   R[3]
//        L[0]    +---+---+---+   R[6]
//                |   |   |   |
//                +---+---+---+
//                Front (F[0], F[1], F[2])
//
// Color modes:
//   - "oll": draw the U-color (yellow) wherever a sticker matches the U-color;
//            draw gray everywhere else. Used for OLL and 2LOLL.
//   - "pll": draw every sticker in its actual color (U face is all yellow since
//            orientation is solved; side stickers show side colors so the
//            permutation is visible).

import type { State, StickerColor } from "./cube.js";

export type ColorMode = "oll" | "pll";

// U-layer slot identifiers and the (face, slot) reads that identify their pieces.
// Each corner has 2 side stickers; each edge has 1 side sticker.
type CornerSlot = "UBL" | "UBR" | "UFL" | "UFR";
type EdgeSlot = "UB" | "UR" | "UF" | "UL";
type Slot = CornerSlot | EdgeSlot;

interface CornerReader {
  uSlot: number; // index into U face (0..8)
  reads: [readonly [keyof typeof FACE_INDEX, number], readonly [keyof typeof FACE_INDEX, number]];
}
interface EdgeReader {
  uSlot: number;
  reads: [readonly [keyof typeof FACE_INDEX, number]];
}

const CORNER_READERS: Record<CornerSlot, CornerReader> = {
  UBL: { uSlot: 0, reads: [["B", 2], ["L", 0]] },
  UBR: { uSlot: 2, reads: [["B", 0], ["R", 2]] },
  UFL: { uSlot: 6, reads: [["F", 0], ["L", 2]] },
  UFR: { uSlot: 8, reads: [["F", 2], ["R", 0]] },
};
const EDGE_READERS: Record<EdgeSlot, EdgeReader> = {
  UB: { uSlot: 1, reads: [["B", 1]] },
  UL: { uSlot: 3, reads: [["L", 1]] },
  UR: { uSlot: 5, reads: [["R", 1]] },
  UF: { uSlot: 7, reads: [["F", 1]] },
};

// Map a corner's 2 side colors (as a sorted key) to its home slot.
const CORNER_HOME: Record<string, CornerSlot> = {
  "B,O": "UBL",
  "B,R": "UBR",
  "G,O": "UFL",
  "G,R": "UFR",
};
const EDGE_HOME: Record<StickerColor, EdgeSlot> = {
  B: "UB",
  O: "UL",
  R: "UR",
  G: "UF",
  Y: "UB", // unreachable in valid PLL state — placeholder
  W: "UB", // unreachable
};

const FACE_INDEX = { U: 0, L: 1, F: 2, R: 3, B: 4, D: 5 } as const;

// Official Rubik's brand Pantone-derived colors.
const COLOR_HEX: Record<StickerColor, string> = {
  W: "#FFFFFF",
  Y: "#FFD500",
  G: "#009E60",
  B: "#0051BA",
  O: "#FF5800",
  R: "#C41E3A",
};

const GRAY = "#5A5A5A";
const STROKE = "#111111";
const BG = "#FFFFFF";

const U_COLOR: StickerColor = "Y";

interface CellSpec {
  /** Top-left x, y of the cell in SVG units. */
  x: number;
  y: number;
  /** Cell width, height. */
  w: number;
  h: number;
  /** The sticker color from the state. */
  color: StickerColor;
}

/** Sticker accessor: state[face*9 + slot]. */
function s(state: State, face: keyof typeof FACE_INDEX, slot: number): StickerColor {
  return state[FACE_INDEX[face] * 9 + slot]!;
}

/** Compute the 25 cells of the last-layer diagram. Returns cells in render order.
 *  Outer ring stickers (12) are smaller bands; inner U stickers (9) are full cells.
 *  Corner cells of the 5×5 grid are skipped (empty). */
function buildCells(state: State, unit: number): CellSpec[] {
  const u = unit;
  const sideThickness = u * 0.22; // outer band thickness
  const gap = u * 0.04; // visual gap between outer band and U face
  const startU = sideThickness + gap; // x/y where the central U 3×3 starts

  const cells: CellSpec[] = [];

  // U face 3×3 (full unit cells)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cells.push({
        x: startU + c * u,
        y: startU + r * u,
        w: u,
        h: u,
        color: s(state, "U", r * 3 + c),
      });
    }
  }

  // Top band = top row of B, but mirrored: we look at U from above, so B's top
  // row appears at the top of the diagram in *visual* left-to-right order
  // matching B's bottom row when looking AT B from behind.
  // The standard convention: top of diagram = B[2], B[1], B[0] (left to right).
  // i.e. the sticker on B that touches U's top edge.
  for (let c = 0; c < 3; c++) {
    cells.push({
      x: startU + c * u,
      y: 0,
      w: u,
      h: sideThickness,
      color: s(state, "B", 2 - c),
    });
  }
  // Bottom band = top row of F: F[0], F[1], F[2] (left to right).
  for (let c = 0; c < 3; c++) {
    cells.push({
      x: startU + c * u,
      y: startU + 3 * u + gap,
      w: u,
      h: sideThickness,
      color: s(state, "F", c),
    });
  }
  // Left band = top row of L stickers, ordered back-to-front (matching the
  // diagram's B-at-top, F-at-bottom layout). L viewed from outside: L[0] is
  // top-left = UBL's L-sticker (back), L[2] = UFL's L-sticker (front).
  for (let r = 0; r < 3; r++) {
    cells.push({
      x: 0,
      y: startU + r * u,
      w: sideThickness,
      h: u,
      color: s(state, "L", r),
    });
  }
  // Right band = top row of R stickers, ordered back-to-front. R viewed from
  // outside: R[0] = UFR's R-sticker (front), R[2] = UBR's R-sticker (back).
  // So top of diagram (back) = R[2], bottom (front) = R[0].
  for (let r = 0; r < 3; r++) {
    cells.push({
      x: startU + 3 * u + gap,
      y: startU + r * u,
      w: sideThickness,
      h: u,
      color: s(state, "R", 2 - r),
    });
  }

  return cells;
}

function colorForMode(color: StickerColor, mode: ColorMode): string {
  if (mode === "oll") {
    return color === U_COLOR ? COLOR_HEX[U_COLOR] : GRAY;
  }
  return COLOR_HEX[color];
}

/** For PLL mode: compute per-piece arrows from current slot to home slot.
 *  Skips pieces already in their home. Returns an array of (fromUSlot, toUSlot)
 *  pairs in U-face index space (0..8). */
function computePllArrows(state: State): Array<[number, number]> {
  const arrows: Array<[number, number]> = [];
  for (const [slot, reader] of Object.entries(CORNER_READERS) as [CornerSlot, CornerReader][]) {
    const [a, b] = reader.reads.map(([f, i]) => state[FACE_INDEX[f] * 9 + i]!);
    const key = [a!, b!].sort().join(",");
    const home = CORNER_HOME[key];
    if (home && home !== slot) {
      arrows.push([reader.uSlot, CORNER_READERS[home].uSlot]);
    }
  }
  for (const [slot, reader] of Object.entries(EDGE_READERS) as [EdgeSlot, EdgeReader][]) {
    const sideColor = state[FACE_INDEX[reader.reads[0][0]] * 9 + reader.reads[0][1]]!;
    const home = EDGE_HOME[sideColor];
    if (home && home !== slot) {
      arrows.push([reader.uSlot, EDGE_READERS[home].uSlot]);
    }
  }
  return arrows;
}

/** Cell-center coordinate of a U-face slot (0..8) in the SVG layout. */
function uSlotCenter(slot: number, unit: number, startU: number): { x: number; y: number } {
  const row = Math.floor(slot / 3);
  const col = slot % 3;
  return { x: startU + col * unit + unit / 2, y: startU + row * unit + unit / 2 };
}

export function renderLastLayerSVG(state: State, mode: ColorMode): string {
  const unit = 40; // SVG units per U-face cell
  const cells = buildCells(state, unit);

  const sideThickness = unit * 0.22;
  const gap = unit * 0.04;
  const startU = sideThickness + gap;
  const total = 2 * (sideThickness + gap) + 3 * unit;

  const pad = 6;
  const viewBox = `${-pad} ${-pad} ${total + 2 * pad} ${total + 2 * pad}`;

  const rects = cells
    .map((c) => {
      const fill = colorForMode(c.color, mode);
      const rx = unit * 0.08;
      return `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.w.toFixed(2)}" height="${c.h.toFixed(2)}" rx="${rx.toFixed(2)}" fill="${fill}" stroke="${STROKE}" stroke-width="1.5"/>`;
    })
    .join("\n  ");

  // Arrows are PLL-only. Drawn as straight black lines with a small arrowhead
  // marker. Each line is shrunk slightly at both ends so it doesn't run all
  // the way to the cell center / arrowhead overshoot.
  let arrowsBlock = "";
  let defsBlock = "";
  if (mode === "pll") {
    const arrows = computePllArrows(state);
    if (arrows.length > 0) {
      defsBlock = `
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#111111"/>
    </marker>
  </defs>`;
      const inset = unit * 0.28; // pull endpoints toward the line center
      const lines: string[] = [];
      for (const [from, to] of arrows) {
        const a = uSlotCenter(from, unit, startU);
        const b = uSlotCenter(to, unit, startU);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const x1 = (a.x + ux * inset).toFixed(2);
        const y1 = (a.y + uy * inset).toFixed(2);
        const x2 = (b.x - ux * inset).toFixed(2);
        const y2 = (b.y - uy * inset).toFixed(2);
        lines.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111111" stroke-width="1.6" marker-end="url(#ah)"/>`,
        );
      }
      arrowsBlock = "\n  " + lines.join("\n  ");
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${total + 2 * pad}" height="${total + 2 * pad}">${defsBlock}
  <rect x="${-pad}" y="${-pad}" width="${total + 2 * pad}" height="${total + 2 * pad}" fill="${BG}"/>
  ${rects}${arrowsBlock}
</svg>
`;
}

// Render an F2L case as an oblique 3-face cube diagram, in the style of
// Conrad Rider's VisualCube (the images CubeSkills uses for its F2L sheet).
//
// The view shows three faces of a cube held cross-on-bottom (white D, yellow
// U, green F, red R):
//
//        U (top)          <- last layer, mostly gray
//       /      \
//      F        R         <- front-left and front-right faces
//
// Coloring convention ("F2L mask"): the first two layers — the cross and all
// four corner/edge pairs — are drawn in their real colors, while every
// last-layer piece is grayed out. Because the cube is held cross-on-bottom,
// the last-layer pieces are exactly the cubies that carry a U-color (yellow)
// sticker, so the rule is simply: a sticker is gray iff its cubie contains a
// yellow sticker. Face centers always keep their real color (this leaves the
// single yellow U-center dot, matching VisualCube). The target pair — the
// corner + edge being inserted — carries no yellow and so always shows in
// color, wherever it currently sits (up in the last layer, or already in the
// front-right slot).

import type { State, StickerColor } from "./cube.js";

const COLOR_HEX: Record<StickerColor, string> = {
  W: "#FFFFFF",
  Y: "#FFD500",
  G: "#009E60",
  B: "#0051BA",
  O: "#FF5800",
  R: "#C41E3A",
};
const GRAY = "#6A6A6A";
const GROUT = "#161616"; // black grid backing showing through sticker gaps
const STROKE = "#161616";

const U_COLOR: StickerColor = "Y";

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Sticker index: face*9 + slot. Face order U=0,L=1,F=2,R=3,B=4,D=5. */
const U = 0,
  L = 9,
  F = 18,
  R = 27,
  B = 36,
  D = 45;

// For each visible sticker we need the full set of stickers on its cubie, so
// we can tell whether that cubie is a last-layer piece (carries yellow). The
// map covers only the three visible faces (U, F, R); hidden sibling stickers
// are still listed because a piece can be oriented with its yellow facing a
// hidden face.
const CUBIE_OF: Record<number, number[]> = {
  // U face
  [U + 0]: [U + 0, L + 0, B + 2], // UBL
  [U + 1]: [U + 1, B + 1], // UB
  [U + 2]: [U + 2, R + 2, B + 0], // UBR
  [U + 3]: [U + 3, L + 1], // UL
  [U + 4]: [U + 4], // U center
  [U + 5]: [U + 5, R + 1], // UR
  [U + 6]: [U + 6, F + 0, L + 2], // UFL
  [U + 7]: [U + 7, F + 1], // UF
  [U + 8]: [U + 8, F + 2, R + 0], // UFR
  // F face
  [F + 0]: [U + 6, F + 0, L + 2], // UFL
  [F + 1]: [U + 7, F + 1], // UF
  [F + 2]: [U + 8, F + 2, R + 0], // UFR
  [F + 3]: [F + 3, L + 5], // FL
  [F + 4]: [F + 4], // F center
  [F + 5]: [F + 5, R + 3], // FR
  [F + 6]: [D + 0, F + 6, L + 8], // DFL
  [F + 7]: [F + 7, D + 1], // DF
  [F + 8]: [D + 2, F + 8, R + 6], // DFR
  // R face
  [R + 0]: [U + 8, F + 2, R + 0], // UFR
  [R + 1]: [U + 5, R + 1], // UR
  [R + 2]: [U + 2, R + 2, B + 0], // UBR
  [R + 3]: [F + 5, R + 3], // FR
  [R + 4]: [R + 4], // R center
  [R + 5]: [R + 5, B + 3], // BR
  [R + 6]: [D + 2, F + 8, R + 6], // DFR
  [R + 7]: [R + 7, D + 5], // DR
  [R + 8]: [D + 8, R + 8, B + 6], // DBR
};

type Pt = readonly [number, number, number];

/** Isometric projection of a cube-space point (x,y,z), cube spanning [0,3]³
 *  with x=right, y=up, z=toward the viewer. Returns SVG (screen) coords. */
function project(p: Pt, cell: number): [number, number] {
  const [x, y, z] = p;
  return [(x - z) * COS30 * cell, (x + z) * SIN30 * cell - y * cell];
}

/** The four cube-space corners of sticker (face, r, c). */
function stickerQuad(face: "U" | "F" | "R", r: number, c: number): [Pt, Pt, Pt, Pt] {
  if (face === "U") {
    // y = 3 plane. x = col, z = row (row 0 = back, row 2 = front).
    return [
      [c, 3, r],
      [c + 1, 3, r],
      [c + 1, 3, r + 1],
      [c, 3, r + 1],
    ];
  }
  if (face === "F") {
    // z = 3 plane. x = col, y = 2-r .. 3-r (row 0 = top).
    const y0 = 2 - r;
    return [
      [c, y0 + 1, 3],
      [c + 1, y0 + 1, 3],
      [c + 1, y0, 3],
      [c, y0, 3],
    ];
  }
  // R face: x = 3 plane. col 0 = front (z 2..3), y = 2-r .. 3-r.
  const y0 = 2 - r;
  const z0 = 2 - c;
  return [
    [3, y0 + 1, z0 + 1],
    [3, y0 + 1, z0],
    [3, y0, z0],
    [3, y0, z0 + 1],
  ];
}

/** Sim sticker index for (face, r, c). */
function stickerIndex(face: "U" | "F" | "R", r: number, c: number): number {
  const base = face === "U" ? U : face === "F" ? F : R;
  return base + r * 3 + c;
}

function fillFor(state: State, index: number): string {
  const cubie = CUBIE_OF[index]!;
  // Centers (single-sticker cubie) always keep their real color.
  if (cubie.length === 1) return COLOR_HEX[state[index]!];
  const isLastLayer = cubie.some((i) => state[i] === U_COLOR);
  return isLastLayer ? GRAY : COLOR_HEX[state[index]!];
}

/** Inset a projected quad toward its centroid to leave a visible grout gap. */
function inset(pts: Array<[number, number]>, k: number): Array<[number, number]> {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

function polyStr(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

export function renderF2LSVG(state: State): string {
  const cell = 40;
  const pad = 8;

  const faces: Array<"U" | "F" | "R"> = ["U", "F", "R"];
  const backings: string[] = [];
  const stickers: string[] = [];

  for (const face of faces) {
    // Black backing = the face's outer 3×3 quad, drawn first so the grout gaps
    // between inset stickers read as thin dark lines.
    const outer = [
      project(stickerQuad(face, 0, 0)[0], cell),
      project(stickerQuad(face, 0, 2)[1], cell),
      project(stickerQuad(face, 2, 2)[2], cell),
      project(stickerQuad(face, 2, 0)[3], cell),
    ];
    backings.push(
      `<polygon points="${polyStr(outer)}" fill="${GROUT}" stroke="${STROKE}" stroke-width="2" stroke-linejoin="round"/>`,
    );
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const quad = stickerQuad(face, r, c).map((p) => project(p, cell));
        const fill = fillFor(state, stickerIndex(face, r, c));
        stickers.push(
          `<polygon points="${polyStr(inset(quad, 0.9))}" fill="${fill}" stroke="${STROKE}" stroke-width="1" stroke-linejoin="round"/>`,
        );
      }
    }
  }

  // Bounds: x spans ±3·cos30·cell, y spans [-3·cell, 3·sin30·cell].
  // Vertical extent: the top-back corner projects to y = -3·cell (max y, zero
  // depth); the bottom-front corner to y = 6·sin30·cell (zero y, max x+z). The
  // full height spans between them.
  const halfW = 3 * COS30 * cell;
  const minX = -halfW;
  const minY = -3 * cell;
  const w = 2 * halfW;
  const h = 3 * cell + 6 * SIN30 * cell;
  const viewBox = `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${(w + 2 * pad).toFixed(2)} ${(h + 2 * pad).toFixed(2)}`;
  const width = (w + 2 * pad).toFixed(2);
  const height = (h + 2 * pad).toFixed(2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
  ${backings.join("\n  ")}
  ${stickers.join("\n  ")}
</svg>
`;
}

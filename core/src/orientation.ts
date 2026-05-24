// Cube orientation and move remapping.
//
// A GAN smart cube reports moves in its OWN coordinate frame (the factory
// "white-on-top, green-in-front" Western color scheme). The cube has fixed
// centers; it doesn't know which way you hold it. So if you solve with
// yellow on top and orange in front, every move letter the cube reports is
// in the wrong frame — `R` from the cube might be your `L`, etc.
//
// This module computes the rotation that maps cube-frame moves into the
// user's frame, given the user's preferred (top color, front color) pair.
//
// Limitations:
//   * Assumes Western color scheme on the cube's internal centers (W on U,
//     Y on D, G on F, B on B, R on R, O on L). Almost all GAN cubes ship
//     this way.
//   * Static — doesn't track cube rotations (`y`, `y2`, `x`, etc.) during a
//     solve. Use gyro-based dynamic tracking when alg-matching needs every
//     move to be correct.

export type CubeColor = "W" | "Y" | "R" | "O" | "G" | "B";
export type CubeFace = "U" | "D" | "L" | "R" | "F" | "B";

export const CUBE_COLORS: readonly CubeColor[] = [
  "W",
  "Y",
  "R",
  "O",
  "G",
  "B",
] as const;
export const CUBE_FACES: readonly CubeFace[] = [
  "U",
  "D",
  "L",
  "R",
  "F",
  "B",
] as const;

/** Pairs of colors on opposite faces of a standard Western cube. */
export const COLOR_OPPOSITE: Record<CubeColor, CubeColor> = {
  W: "Y",
  Y: "W",
  R: "O",
  O: "R",
  G: "B",
  B: "G",
};

/** Front colors that are valid (not opposite) for a given top color. */
export function validFrontColors(top: CubeColor): readonly CubeColor[] {
  const opp = COLOR_OPPOSITE[top];
  return CUBE_COLORS.filter((c) => c !== top && c !== opp);
}

// ---- 3D vector math (just enough for 24 cube rotations) ----

type Vec3 = readonly [number, number, number];

/** Cube's internal frame: which color sits on which face direction.
 *  +Y = U, -Y = D, +Z = F, -Z = B, +X = R, -X = L. */
const CUBE_COLOR_VEC: Record<CubeColor, Vec3> = {
  W: [0, 1, 0],
  Y: [0, -1, 0],
  G: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  O: [-1, 0, 0],
};

/** Inverse lookup: a unit-length axis-aligned direction → its face letter. */
const FACE_BY_VEC: ReadonlyArray<readonly [Vec3, CubeFace]> = [
  [[0, 1, 0], "U"],
  [[0, -1, 0], "D"],
  [[0, 0, 1], "F"],
  [[0, 0, -1], "B"],
  [[1, 0, 0], "R"],
  [[-1, 0, 0], "L"],
];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function findFace(v: Vec3): CubeFace {
  for (const [w, face] of FACE_BY_VEC) {
    if (w[0] === v[0] && w[1] === v[1] && w[2] === v[2]) return face;
  }
  throw new Error(
    `No cube face for direction (${v[0]}, ${v[1]}, ${v[2]})`,
  );
}

/** Builds a per-face remap table that translates cube-frame face letters into
 *  the user's frame, given which colors the user has on top and in front.
 *
 *  Throws if `top` and `front` are opposite colors (not a valid orientation). */
export function buildFaceRemap(
  top: CubeColor,
  front: CubeColor,
): Record<CubeFace, CubeFace> {
  if (COLOR_OPPOSITE[top] === front) {
    throw new Error(
      `Invalid orientation: top (${top}) and front (${front}) cannot be opposite colors`,
    );
  }
  if (top === front) {
    throw new Error(`Invalid orientation: top and front must differ`);
  }

  // The user's preferred top is +Y in user frame; preferred front is +Z;
  // preferred right is +X (by right-hand rule). In the CUBE'S frame, those
  // user-frame axes live along these vectors:
  const uTopInCube = CUBE_COLOR_VEC[top]; // where the top color is in cube frame
  const uFrontInCube = CUBE_COLOR_VEC[front];
  const uRightInCube = cross(uTopInCube, uFrontInCube); // up × forward = right

  // The rotation R sends any cube-frame direction v into user-frame
  // coordinates. Constructing R as the matrix whose rows are
  // (uRightInCube, uTopInCube, uFrontInCube) gives:
  //   R · uRightInCube = (1, 0, 0)  = user's +X
  //   R · uTopInCube   = (0, 1, 0)  = user's +Y
  //   R · uFrontInCube = (0, 0, 1)  = user's +Z
  // (each row dot-products to 1 against itself, 0 against the others — they
  // are orthonormal because cube faces are mutually perpendicular).
  const remap: Record<CubeFace, CubeFace> = {} as Record<CubeFace, CubeFace>;
  for (const [cubeDir, cubeFace] of FACE_BY_VEC) {
    const userDir: Vec3 = [
      uRightInCube[0] * cubeDir[0] +
        uRightInCube[1] * cubeDir[1] +
        uRightInCube[2] * cubeDir[2],
      uTopInCube[0] * cubeDir[0] +
        uTopInCube[1] * cubeDir[1] +
        uTopInCube[2] * cubeDir[2],
      uFrontInCube[0] * cubeDir[0] +
        uFrontInCube[1] * cubeDir[1] +
        uFrontInCube[2] * cubeDir[2],
    ];
    remap[cubeFace] = findFace(userDir);
  }
  return remap;
}

/** Translate a single cube-frame move string (e.g. `"R'"`, `"U2"`) into the
 *  user's frame. Pass `null` for `remap` to skip translation (faster than
 *  computing an identity remap). */
export function remapMove(
  move: string,
  remap: Record<CubeFace, CubeFace> | null,
): string {
  if (!remap || move.length === 0) return move;
  const face = move.charAt(0) as CubeFace;
  const swapped = remap[face];
  return swapped ? swapped + move.slice(1) : move;
}

/** Translate every move in a whitespace-separated alg string from cube
 *  frame to user frame. Empty or null `remap` is a no-op. */
export function remapAlg(
  alg: string,
  remap: Record<CubeFace, CubeFace> | null,
): string {
  if (!remap || !alg) return alg;
  return alg
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => remapMove(m, remap))
    .join(" ");
}

/** Convenience: `buildFaceRemap` returns the identity table for the
 *  factory orientation. Use this to avoid recomputing/re-applying when no
 *  swap is needed. */
export function isIdentityRemap(remap: Record<CubeFace, CubeFace>): boolean {
  return CUBE_FACES.every((f) => remap[f] === f);
}

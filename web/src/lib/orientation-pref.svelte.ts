// User's preferred cube orientation (which color goes on top, which on
// front). Drives the CubeView's display rotation and the move-stream
// relabeling. Default: yellow on top, green on front — the dominant
// CFOP-cuber convention.
//
// We intentionally DO NOT translate scrambles: WCA scrambles are
// conventionally executed in the W-top/G-front frame, and most cubers
// scramble in that frame and then rotate the cube to their solving
// orientation. Re-translating the scramble would break that workflow.

import { browser } from "$app/environment";
import {
  applyAlg,
  buildFaceRemap,
  COLOR_OPPOSITE,
  type CubeColor,
  type CubeFace,
  FACE_INDEX,
  findCrossFaceForColor,
  normalizeToCrossOnD,
  remapMove,
  solved,
  type State,
  type StickerColor,
} from "@cubing/core";

const KEY = "cubing_orientation";
const DEFAULT_TOP: CubeColor = "Y";
const DEFAULT_FRONT: CubeColor = "G";

interface Stored {
  top: CubeColor;
  front: CubeColor;
}

function loadStored(): Stored {
  if (!browser) return { top: DEFAULT_TOP, front: DEFAULT_FRONT };
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return { top: DEFAULT_TOP, front: DEFAULT_FRONT };
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (
      parsed.top &&
      parsed.front &&
      parsed.top !== parsed.front &&
      COLOR_OPPOSITE[parsed.top] !== parsed.front
    ) {
      return { top: parsed.top, front: parsed.front };
    }
  } catch {
    // fall through to defaults
  }
  return { top: DEFAULT_TOP, front: DEFAULT_FRONT };
}

// The 24 valid cube orientations expressed as rotation algorithms
// applied to a solved cube. Used to derive the rotation that brings a
// chosen (top, front) pair into the simulator's U/F positions.
const ALL_ROTATIONS = [
  "",
  "y",
  "y2",
  "y'",
  "x",
  "x y",
  "x y2",
  "x y'",
  "x'",
  "x' y",
  "x' y2",
  "x' y'",
  "x2",
  "x2 y",
  "x2 y2",
  "x2 y'",
  "z",
  "z y",
  "z y2",
  "z y'",
  "z'",
  "z' y",
  "z' y2",
  "z' y'",
] as const;

/** Find a rotation algorithm that, applied to a solved cube, brings
 *  `top` to U and `front` to F. Brute-forced over the 24 rotations once
 *  per (top, front) change — cheap. */
function findRotationAlg(top: CubeColor, front: CubeColor): string {
  if (top === front || COLOR_OPPOSITE[top] === front) {
    throw new Error(`invalid orientation (${top}, ${front})`);
  }
  for (const alg of ALL_ROTATIONS) {
    const s = applyAlg(solved(), alg);
    if (
      s[FACE_INDEX.U * 9 + 4] === top &&
      s[FACE_INDEX.F * 9 + 4] === front
    ) {
      return alg;
    }
  }
  throw new Error(`no rotation found for (${top}, ${front})`);
}

/** After a `normalizeToCrossOnD`, the F-face holds some side color
 *  decided by the original state. Spin the cube around the vertical
 *  (y) axis until the wanted color sits on F. Returns the input state
 *  unchanged if no y-rotation matches (shouldn't happen for valid
 *  states; safe fallback). */
function rotateYToFront(state: State, frontColor: StickerColor): State {
  if (state[FACE_INDEX.F * 9 + 4] === frontColor) return state;
  for (const yAlg of ["y", "y2", "y'"]) {
    const s = applyAlg(state, yAlg);
    if (s[FACE_INDEX.F * 9 + 4] === frontColor) return s;
  }
  return state;
}

class OrientationStore {
  top = $state<CubeColor>(DEFAULT_TOP);
  front = $state<CubeColor>(DEFAULT_FRONT);

  constructor() {
    if (!browser) return;
    const stored = loadStored();
    this.top = stored.top;
    this.front = stored.front;
  }

  isDefault(): boolean {
    return this.top === DEFAULT_TOP && this.front === DEFAULT_FRONT;
  }

  /** Save a new orientation. Silently ignores invalid pairs (same color
   *  or opposite colors). */
  set(top: CubeColor, front: CubeColor): void {
    if (top === front || COLOR_OPPOSITE[top] === front) return;
    this.top = top;
    this.front = front;
    if (browser) {
      window.localStorage.setItem(KEY, JSON.stringify({ top, front }));
    }
  }

  /** Orient a state for display. Always tries to put the user's cross
   *  color on the bottom (where the cuber physically holds it). Falls
   *  back to a plain top/front rotation when no cross is detected in
   *  the state (e.g., post-scramble before any solve moves).
   *
   *  Note: the simulator's coordinate frame doesn't necessarily match
   *  the cuber's physical frame (because the BT cube reports in its
   *  own factory frame, which can differ from how the cuber holds it).
   *  We rely on the cross-color signal to recover the cuber's view. */
  orient(state: State): State {
    const crossColor = COLOR_OPPOSITE[this.top] as StickerColor;
    const crossFace = findCrossFaceForColor(state, crossColor);
    if (crossFace) {
      // Cross color is on the bottom after this; then y-rotate to put
      // the user's preferred front color in front.
      let s = normalizeToCrossOnD(state, crossFace);
      s = rotateYToFront(s, this.front as StickerColor);
      return s;
    }
    // No cross yet — best-effort top/front rotation.
    const alg = findRotationAlg(this.top, this.front);
    return alg === "" ? state : applyAlg(state, alg);
  }

  /** Cube → user-frame face remap. Use with `remapMove` to translate
   *  BT-reported moves into the user's frame for display. */
  faceRemap(): Record<CubeFace, CubeFace> {
    return buildFaceRemap(this.top, this.front);
  }

  /** Translate a single move from cube frame to user frame for display. */
  displayMove(move: string): string {
    return remapMove(move, this.faceRemap());
  }
}

export const orientationPref = new OrientationStore();

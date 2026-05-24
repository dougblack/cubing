// Stage segmentation: given a solve's move stream, split it into the four
// CFOP stages (cross, F2L, OLL, PLL).
//
// This is the hard one. A real implementation needs to:
//   1. Track cube state through the move stream (use cubing/kpuzzle).
//   2. Detect when cross becomes solved → end of cross / start of F2L.
//   3. Detect when each F2L pair lands in its slot → F2L sub-stages.
//   4. Detect when the U-face is oriented → end of OLL / start of PLL.
//   5. Detect when fully solved → end of PLL.
//
// Real human solves complicate every one of these (inefficient F2L pairs,
// regrips, slice mid-alg, partial AUF rotations between stages). This stub
// returns an empty segmentation; the trainer and timer can ship without it.
//
// See PLAN: "Hard problems to scope carefully".

import type { MoveEvent } from "./entities.js";
import type { StageSlug } from "./types.js";

export interface Segment {
  stage: StageSlug;
  /** Inclusive index into the original moves array. */
  startIndex: number;
  /** Exclusive index into the original moves array. */
  endIndex: number;
  durationMs: number;
}

export interface SegmentationResult {
  segments: Segment[];
  /** Set when segmentation can't complete (e.g., move stream doesn't end in
   *  a solved state, or stage boundaries can't be inferred). */
  warning?: string;
}

/** Segment a CFOP solve's move stream. Currently a stub.
 *
 *  TODO: implement using cubing/kpuzzle to track state, detecting:
 *    - cross solved → end of cross
 *    - all F2L pairs landed → end of F2L
 *    - U-face oriented (all U stickers match) → end of OLL
 *    - solved cube → end of PLL */
export function segmentSolve(
  moves: readonly MoveEvent[],
): SegmentationResult {
  if (moves.length === 0) {
    return { segments: [], warning: "empty move stream" };
  }
  return { segments: [], warning: "segmentation not yet implemented" };
}

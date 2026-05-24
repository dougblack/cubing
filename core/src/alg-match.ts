// Algorithm identification: given a sequence of moves and a roster of known
// algorithms per case, return the case+alg-index that matches.
//
// First-pass implementation does string-normalized exact match: parse both
// sides with cubing/alg and compare canonical serializations. This catches
// trivial whitespace and notation differences but does NOT handle AUF
// rotations, regrips, or partial-equivalent move sequences. Those are
// follow-up problems — see PLAN: "Hard problems to scope carefully".

import { Alg } from "cubing/alg";

import type { CaseId } from "./entities.js";
import type { MoveString } from "./types.js";

export interface AlgRoster {
  caseId: CaseId;
  algorithms: MoveString[];
}

export interface AlgMatch {
  caseId: CaseId;
  algIndex: number;
}

/** Normalize a move string via cubing/alg's canonical serialization. Falls
 *  back to a trimmed raw string if parsing fails, so a malformed entry
 *  doesn't crash the matcher. */
function normalize(moves: string): string {
  try {
    return new Alg(moves).toString();
  } catch {
    return moves.trim();
  }
}

/** Find an exact match for `moves` within the roster. Returns null if none.
 *  When multiple cases share an alg (rare but possible), returns the first. */
export function matchAlgExact(
  moves: string,
  roster: readonly AlgRoster[],
): AlgMatch | null {
  const target = normalize(moves);
  if (target.length === 0) return null;
  for (const entry of roster) {
    for (let i = 0; i < entry.algorithms.length; i++) {
      const candidate = entry.algorithms[i];
      if (candidate === undefined) continue;
      if (normalize(candidate) === target) {
        return { caseId: entry.caseId, algIndex: i };
      }
    }
  }
  return null;
}

// Trainer scramble generation. Given an algorithm that solves a case, the
// scramble that *produces* that case is the algorithm's inverse, optionally
// preceded by a random AUF (Adjustment of the Upper Face) so the case
// presents in any of its four rotational orientations.

import { Alg } from "cubing/alg";

export type AufMode = "none" | "random";

export interface CaseScrambleOptions {
  /** "random" prepends a random U / U2 / U' / nothing. Default "random". */
  auf?: AufMode;
  /** Override the random source (used by tests). Returns a value in [0, 1). */
  random?: () => number;
}

const AUF_OPTIONS = ["", "U", "U2", "U'"] as const;

/** Produces a scramble that, when applied to a solved cube, yields the
 *  case-state that `algorithm` is designed to solve. cubing/alg's parser is
 *  fairly permissive — malformed-but-tokenizable input may yield surprising
 *  output rather than throwing. */
export function caseScramble(
  algorithm: string,
  opts: CaseScrambleOptions = {},
): string {
  const auf = opts.auf ?? "random";
  const random = opts.random ?? Math.random;

  const inverse = new Alg(algorithm).invert().toString();
  if (auf === "none") return inverse;

  const choice = AUF_OPTIONS[Math.floor(random() * AUF_OPTIONS.length)] ?? "";
  return choice ? `${choice} ${inverse}` : inverse;
}

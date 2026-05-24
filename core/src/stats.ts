// Solve statistics — best single, ao5, ao12. Pure functions over Solve
// entities; no UI concerns (formatting lives in the consumer).

import type { Solve } from "./entities.js";

/** Penalty-adjusted duration. Returns "DNF" if the solve was marked DNF. */
export type EffectiveTime = number | "DNF";

/** Result of an average: a number (ms), "DNF" (too many DNFs in the window),
 *  or null (not enough solves to compute). */
export type AverageResult = number | "DNF" | null;

export function effectiveMs(s: Solve): EffectiveTime {
  if (s.penalty === "DNF") return "DNF";
  return s.durationMs + (s.penalty === "+2" ? 2000 : 0);
}

/** WCA-style trimmed mean over the most recent `n` solves: drop the single
 *  best and single worst, average the middle (n-2) values. A DNF is the
 *  "worst" and can be dropped — a second DNF poisons the average to DNF.
 *
 *  `solvesNewestFirst` is expected to be sorted newest → oldest (matching
 *  `timerStore.currentSessionSolves()`). Returns `null` if fewer than n
 *  solves are available. */
export function averageOfN(
  solvesNewestFirst: readonly Solve[],
  n: number,
): AverageResult {
  if (n < 3) throw new Error(`averageOfN requires n >= 3, got ${n}`);
  if (solvesNewestFirst.length < n) return null;

  const window = solvesNewestFirst.slice(0, n).map(effectiveMs);
  const dnfCount = window.filter((t) => t === "DNF").length;
  // Two or more DNFs means we can't drop them all as "worst".
  if (dnfCount >= 2) return "DNF";

  // Replace the single DNF (if any) with +Infinity so sorting treats it as
  // the worst, then drop the smallest and largest.
  const numeric = window.map((t) => (t === "DNF" ? Number.POSITIVE_INFINITY : t));
  const sorted = [...numeric].sort((a, b) => a - b);
  const middle = sorted.slice(1, -1);
  const sum = middle.reduce((a, b) => a + b, 0);
  return sum / middle.length;
}

/** Fastest single solve. Returns null if there are no solves; "DNF" if every
 *  solve was a DNF. */
export function bestSingleMs(solves: readonly Solve[]): AverageResult {
  if (solves.length === 0) return null;
  let best: number | null = null;
  for (const s of solves) {
    const t = effectiveMs(s);
    if (t === "DNF") continue;
    if (best === null || t < best) best = t;
  }
  return best === null ? "DNF" : best;
}

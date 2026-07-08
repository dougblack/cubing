// Load and shape the per-stage JSON dataset. Vite resolves the JSON imports
// at build time, so the whole dataset is bundled (no runtime fetch).

import pllRaw from "../../../data/methods/cfop/pll.json";
import ollRaw from "../../../data/methods/cfop/oll.json";
import twoLollRaw from "../../../data/methods/cfop/2loll.json";
import f2lRaw from "../../../data/methods/cfop/f2l.json";

import type { Case, StageFile, StageSlug } from "./types";

const RAW: Record<StageSlug, StageFile | undefined> = {
  pll: pllRaw as unknown as StageFile,
  oll: ollRaw as unknown as StageFile,
  "2loll": twoLollRaw as unknown as StageFile,
  f2l: f2lRaw as unknown as StageFile,
};

export function getStageFile(slug: StageSlug): StageFile | undefined {
  return RAW[slug];
}

/** Cases sorted by their `number` field (1..N where defined), then by id. */
export function getStageCases(slug: StageSlug): Case[] {
  const file = RAW[slug];
  if (!file) return [];
  return [...file.cases].sort(
    (a, b) =>
      (a.number ?? 9999) - (b.number ?? 9999) || a.id.localeCompare(b.id),
  );
}

export function getCase(slug: StageSlug, caseId: string): Case | undefined {
  return getStageFile(slug)?.cases.find((c) => c.id === caseId);
}

// Friendly display labels for the internal group identifiers used in the JSON.
const GROUP_DISPLAY: Record<string, string> = {
  "edges-only": "Edges Only",
  "adjacent-corner-swap": "Adjacent Corner Swap",
  "adjacent-corner-swap-with-edges": "Adjacent Corner Swap",
  "diagonal-corner-swap": "Diagonal Corner Swap",
  "g-perm": "G Perm",
  ocll: "OCLL",
  oell: "OELL",
  dot: "Dot",
  square: "Square",
  "small-lightning-bolt": "Small Lightning Bolt",
  "big-lightning-bolt": "Big Lightning Bolt",
  fish: "Fish Shape",
  "knight-move": "Knight Move",
  "i-shape": "I Shape",
  "p-shape": "P Shape",
  "w-shape": "W Shape",
  "c-shape": "C Shape",
  "t-shape": "T Shape",
  "l-shape": "L Shape",
  awkward: "Awkward",
  "all-edges-oriented": "All Edges Oriented",
  cross: "Cross",
  other: "Other",
};

export function displayGroup(c: Case): string | undefined {
  if (c.jperm_group) return c.jperm_group;
  if (c.group) {
    return (
      GROUP_DISPLAY[c.group] ??
      c.group.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
    );
  }
  return undefined;
}

// Standard probability denominators. PLL weights sum to 71 against /72 (the
// remaining /72 is the skip case, not stored); OLL similarly sums to 215/216.
const PROBABILITY_DENOM: Partial<Record<StageSlug, number>> = {
  pll: 72,
  oll: 216,
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function probabilityText(
  c: Case,
  slug: StageSlug,
): string | undefined {
  if (c.probability_weight === undefined) return undefined;
  const denom = PROBABILITY_DENOM[slug];
  if (denom === undefined) return `weight ${c.probability_weight}`;
  const g = gcd(c.probability_weight, denom);
  return `${c.probability_weight / g}/${denom / g}`;
}

export interface DiagramRotation {
  /** Clockwise CSS rotation in degrees applied to the diagram (0, 90, -90,
   *  or 180). */
  degrees: number;
  /** The algorithm with a leading whole-cube y rotation removed. */
  moves: string;
  /** True when a leading y was found and stripped. */
  rotated: boolean;
}

/** When an algorithm starts with a whole-cube y rotation (y / y' / y2), the
 *  last-layer diagram can be physically rotated to match the orientation the
 *  alg assumes, letting the leading y be dropped from the written moves — so
 *  the case isn't shown one way only for the first move to spin it. Diagrams
 *  are viewed from above (U up), so y turns the image clockwise, y'
 *  counter-clockwise, and y2 a half turn. Returns degrees 0 with the moves
 *  untouched when there's no leading y. Only a single leading y is handled,
 *  which covers the whole dataset. */
export function diagramRotation(moves: string): DiagramRotation {
  const m = moves.match(/^\s*(y2|y'|y)\s+(\S.*)$/s);
  if (!m) return { degrees: 0, moves, rotated: false };
  const degrees = m[1] === "y" ? 90 : m[1] === "y'" ? -90 : 180;
  return { degrees, moves: m[2], rotated: true };
}

/** Probability-weighted coverage for a stage, split by learning state.
 *  Both fields are shares of all solves (0–1), weighted by how often
 *  each last-layer case occurs:
 *   - `learned` — cases marked learned.
 *   - `learning` — cases marked learning.
 *  They never overlap, and `learned + learning ≤ 1`; the remainder is
 *  cases not yet flagged plus the skip case (the missing 1/denom of
 *  weight that needs no alg). So `learned` reads a clean 0 when nothing
 *  is learned and tops out just shy of 1.0 at mastery (the leftover
 *  sliver is the skip). Returns null for stages without a probability
 *  denominator (e.g. 2-Look OLL). `stateOf` returns 1 = learning,
 *  2 = learned, anything else (incl. undefined) = unflagged. */
export interface StageCoverage {
  learned: number;
  learning: number;
}

export function probabilityCoverage(
  slug: StageSlug,
  stateOf: (caseId: string) => number | undefined,
): StageCoverage | null {
  const denom = PROBABILITY_DENOM[slug];
  const file = RAW[slug];
  if (denom === undefined || !file) return null;
  let learnedWeight = 0;
  let learningWeight = 0;
  for (const c of file.cases) {
    if (c.probability_weight === undefined) continue;
    const s = stateOf(c.id);
    if (s === 2) learnedWeight += c.probability_weight;
    else if (s === 1) learningWeight += c.probability_weight;
  }
  return {
    learned: learnedWeight / denom,
    learning: learningWeight / denom,
  };
}

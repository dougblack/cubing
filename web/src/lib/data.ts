// Load and shape the per-stage JSON dataset. Vite resolves the JSON imports
// at build time, so the whole dataset is bundled (no runtime fetch).

import pllRaw from "../../../data/methods/cfop/pll.json";
import ollRaw from "../../../data/methods/cfop/oll.json";
import twoLollRaw from "../../../data/methods/cfop/2loll.json";

import type { Case, StageFile, StageSlug } from "./types";

const RAW: Record<StageSlug, StageFile | undefined> = {
  pll: pllRaw as unknown as StageFile,
  oll: ollRaw as unknown as StageFile,
  "2loll": twoLollRaw as unknown as StageFile,
  // f2l intentionally omitted from the UI — no last-layer diagram view applies.
  f2l: undefined,
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

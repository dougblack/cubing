import type { StageMeta, StageSlug } from "./types";

export const STAGES: ReadonlyArray<StageMeta> = [
  {
    slug: "pll",
    shortName: "PLL",
    fullName: "Permutation of the Last Layer",
    description:
      "The final CFOP step. With the top face oriented, permute the remaining last-layer pieces to solve the cube. 21 standard cases.",
  },
  {
    slug: "oll",
    shortName: "OLL",
    fullName: "Orientation of the Last Layer",
    description:
      "The third CFOP step (full version). Orient every last-layer piece so the top face is one color in a single algorithm. 57 cases.",
  },
  {
    slug: "2loll",
    shortName: "2-Look OLL",
    fullName: "Two-Look OLL",
    description:
      "Beginner-friendly OLL: orient the edges first (3 cases), then the corners (7 cases). 10 algorithms total versus 57 for full OLL.",
  },
];

export function stageBySlug(slug: string): StageMeta | undefined {
  return STAGES.find((s) => s.slug === slug);
}

export const STAGE_SLUGS: ReadonlyArray<StageSlug> = STAGES.map((s) => s.slug);

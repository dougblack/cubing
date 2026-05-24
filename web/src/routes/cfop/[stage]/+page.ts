import { error } from "@sveltejs/kit";

import { getStageCases, probabilityText } from "$lib/data";
import { STAGE_SLUGS, stageBySlug } from "$lib/stages";
import type { StageSlug } from "$lib/types";

export const prerender = true;

// Pre-enumerate which [stage] slugs to build. SvelteKit would also discover
// these via crawling, but being explicit keeps the prerender list deterministic.
export function entries() {
  return STAGE_SLUGS.filter((slug) => slug !== "f2l").map((stage) => ({ stage }));
}

interface Card {
  id: string;
  name: string;
  primaryAlg: string;
  algMoves: string[];
  probabilityText: string | undefined;
  group: string | undefined;
}

// 2LOLL is taught as a two-step process — render the case grid in two
// labelled sections so the structure is visible at a glance. Other stages
// (PLL/OLL) stay flat.
interface Section {
  id: string;
  title: string;
  groups: string[];
}
const SECTIONS_BY_STAGE: Partial<Record<StageSlug, Section[]>> = {
  "2loll": [
    { id: "oell", title: "Step 1 — Orient edges", groups: ["oell"] },
    { id: "ocll", title: "Step 2 — Orient corners", groups: ["ocll"] },
  ],
};

export function load({ params }) {
  const meta = stageBySlug(params.stage);
  if (!meta || meta.slug === "f2l") error(404, `Unknown stage: ${params.stage}`);
  const slug = meta.slug as StageSlug;
  const cases = getStageCases(slug);
  const cards: Card[] = cases.map((c) => ({
    id: c.id,
    name: c.name,
    primaryAlg: c.algorithms[0]?.moves ?? "",
    algMoves: c.algorithms.map((a) => a.moves),
    probabilityText: probabilityText(c, slug),
    group: c.group,
  }));

  const sectionDefs = SECTIONS_BY_STAGE[slug];
  const sections = sectionDefs
    ? sectionDefs.map((s) => ({
        title: s.title,
        cards: cards.filter((c) => c.group !== undefined && s.groups.includes(c.group)),
      }))
    : null;

  return { stage: meta, cards, sections };
}

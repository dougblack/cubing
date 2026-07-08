import { error } from "@sveltejs/kit";

import { getStageCases, probabilityText } from "$lib/data";
import { STAGE_SLUGS, stageBySlug } from "$lib/stages";
import type { StageSlug } from "$lib/types";

export const prerender = true;

// Pre-enumerate which [stage] slugs to build. SvelteKit would also discover
// these via crawling, but being explicit keeps the prerender list deterministic.
export function entries() {
  return STAGE_SLUGS.map((stage) => ({ stage }));
}

interface Card {
  id: string;
  name: string;
  primaryAlg: string;
  algMoves: string[];
  probabilityText: string | undefined;
  group: string | undefined;
}

// Some stages read best broken into labelled sections. 2LOLL is a two-step
// process; F2L cases group by how the pair is presented. Other stages
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
  f2l: [
    { id: "basic", title: "Basic cases — pair in the top", groups: ["basic-pair-in-top"] },
    { id: "edge-in-slot", title: "Edge in slot, corner in top", groups: ["edge-in-slot"] },
    { id: "corner-in-slot", title: "Corner in slot, edge in top", groups: ["corner-in-slot"] },
    { id: "both-in-slot", title: "Corner and edge both in slot", groups: ["both-in-slot"] },
    { id: "separated", title: "Separated pair", groups: ["separated-pair"] },
    { id: "pair-in-top", title: "Pair already made in the top", groups: ["pair-made-in-top"] },
    { id: "other", title: "Other cases", groups: ["other"] },
  ],
};

export function load({ params }) {
  const meta = stageBySlug(params.stage);
  if (!meta) error(404, `Unknown stage: ${params.stage}`);
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

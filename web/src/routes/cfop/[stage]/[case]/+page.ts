import { error } from "@sveltejs/kit";

import { displayGroup, getCase, getStageCases, probabilityText } from "$lib/data";
import { STAGE_SLUGS, stageBySlug } from "$lib/stages";
import type { StageSlug } from "$lib/types";

export const prerender = true;

export function entries() {
  const out: Array<{ stage: string; case: string }> = [];
  for (const slug of STAGE_SLUGS) {
    if (slug === "f2l") continue;
    for (const c of getStageCases(slug)) out.push({ stage: slug, case: c.id });
  }
  return out;
}

export function load({ params }) {
  const meta = stageBySlug(params.stage);
  if (!meta || meta.slug === "f2l") error(404, `Unknown stage: ${params.stage}`);
  const slug = meta.slug as StageSlug;
  const caseObj = getCase(slug, params.case);
  if (!caseObj) error(404, `Unknown case: ${params.case}`);
  return {
    stage: meta,
    case: {
      ...caseObj,
      groupLabel: displayGroup(caseObj),
      probabilityText: probabilityText(caseObj, slug),
    },
  };
}

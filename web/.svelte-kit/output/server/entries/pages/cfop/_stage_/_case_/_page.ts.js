import { a as probabilityText, c as stageBySlug, n as getCase, r as getStageCases, s as STAGE_SLUGS, t as displayGroup } from "../../../../../chunks/data.js";
import { error } from "@sveltejs/kit";
//#region src/routes/cfop/[stage]/[case]/+page.ts
var prerender = true;
function entries() {
	const out = [];
	for (const slug of STAGE_SLUGS) {
		if (slug === "f2l") continue;
		for (const c of getStageCases(slug)) out.push({
			stage: slug,
			case: c.id
		});
	}
	return out;
}
function load({ params }) {
	const meta = stageBySlug(params.stage);
	if (!meta || meta.slug === "f2l") error(404, `Unknown stage: ${params.stage}`);
	const slug = meta.slug;
	const caseObj = getCase(slug, params.case);
	if (!caseObj) error(404, `Unknown case: ${params.case}`);
	return {
		stage: meta,
		case: {
			...caseObj,
			groupLabel: displayGroup(caseObj),
			probabilityText: probabilityText(caseObj, slug)
		}
	};
}
//#endregion
export { entries, load, prerender };

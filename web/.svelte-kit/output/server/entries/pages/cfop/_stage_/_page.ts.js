import { a as probabilityText, c as stageBySlug, r as getStageCases, s as STAGE_SLUGS } from "../../../../chunks/data.js";
import { error } from "@sveltejs/kit";
//#region src/routes/cfop/[stage]/+page.ts
var prerender = true;
function entries() {
	return STAGE_SLUGS.filter((slug) => slug !== "f2l").map((stage) => ({ stage }));
}
var SECTIONS_BY_STAGE = { "2loll": [{
	id: "oell",
	title: "Step 1 — Orient edges",
	groups: ["oell"]
}, {
	id: "ocll",
	title: "Step 2 — Orient corners",
	groups: ["ocll"]
}] };
function load({ params }) {
	const meta = stageBySlug(params.stage);
	if (!meta || meta.slug === "f2l") error(404, `Unknown stage: ${params.stage}`);
	const slug = meta.slug;
	const cards = getStageCases(slug).map((c) => ({
		id: c.id,
		name: c.name,
		primaryAlg: c.algorithms[0]?.moves ?? "",
		algMoves: c.algorithms.map((a) => a.moves),
		probabilityText: probabilityText(c, slug),
		group: c.group
	}));
	const sectionDefs = SECTIONS_BY_STAGE[slug];
	return {
		stage: meta,
		cards,
		sections: sectionDefs ? sectionDefs.map((s) => ({
			title: s.title,
			cards: cards.filter((c) => c.group !== void 0 && s.groups.includes(c.group))
		})) : null
	};
}
//#endregion
export { entries, load, prerender };

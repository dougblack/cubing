import { R as attr, a as ensure_array_like, c as stringify, o as head, z as escape_html } from "../../chunks/dev.js";
import { o as STAGES, r as getStageCases } from "../../chunks/data.js";
import { t as cubingState } from "../../chunks/store.svelte.js";
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const stageCards = STAGES.map((s) => {
			const cases = getStageCases(s.slug);
			return {
				...s,
				caseCount: cases.length,
				algCount: cases.reduce((n, c) => n + c.algorithms.length, 0),
				caseIds: cases.map((c) => c.id)
			};
		});
		head("1uha8ag", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>cubing</title>`);
			});
		});
		$$renderer.push(`<section class="hero svelte-1uha8ag"><h1 class="svelte-1uha8ag">Cubing algorithm reference</h1> <p class="svelte-1uha8ag">A flat, browsable index of CFOP algorithms with pre-rendered cube state
    diagrams. Click any case to see all known variants, sorted by community
    popularity. Track your progress with the per-case learning flag.</p></section> <section class="method-grid svelte-1uha8ag"><!--[-->`);
		const each_array = ensure_array_like(stageCards);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let stage = each_array[$$index];
			$$renderer.push(`<a class="method-card svelte-1uha8ag"${attr("href", `/cfop/${stringify(stage.slug)}`)}><h2 class="svelte-1uha8ag">${escape_html(stage.shortName)}</h2> <p class="method-subtitle svelte-1uha8ag">${escape_html(stage.fullName)}</p> <p class="method-meta svelte-1uha8ag">${escape_html(stage.caseCount)} cases · ${escape_html(stage.algCount)} algorithms</p> <p class="method-learned svelte-1uha8ag">${escape_html(cubingState.learnedCount(stage.caseIds))} / ${escape_html(stage.caseCount)} learned</p> <p class="method-desc svelte-1uha8ag">${escape_html(stage.description)}</p></a>`);
		}
		$$renderer.push(`<!--]--></section>`);
	});
}
//#endregion
export { _page as default };

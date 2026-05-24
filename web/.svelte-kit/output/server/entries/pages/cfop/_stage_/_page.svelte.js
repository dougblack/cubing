import { R as attr, a as ensure_array_like, c as stringify, i as derived, n as attr_class, o as head, z as escape_html } from "../../../../chunks/dev.js";
import { t as cubingState } from "../../../../chunks/store.svelte.js";
//#region src/routes/cfop/[stage]/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		const stage = derived(() => data.stage);
		const cards = derived(() => data.cards);
		const sections = derived(() => data.sections);
		const caseIds = derived(() => cards().map((c) => c.id));
		const learnedCount = derived(() => cubingState.learnedCount(caseIds()));
		function displayAlg(card) {
			const prefIdx = cubingState.pref[card.id];
			if (prefIdx !== void 0 && prefIdx >= 0 && prefIdx < card.algMoves.length) return {
				moves: card.algMoves[prefIdx],
				preferred: true
			};
			return {
				moves: card.primaryAlg,
				preferred: false
			};
		}
		function caseState(id) {
			return cubingState.state[id] ?? 0;
		}
		function caseGrid($$renderer, items) {
			$$renderer.push(`<section class="case-grid svelte-ewxbbu"><!--[-->`);
			const each_array = ensure_array_like(items);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let card = each_array[$$index];
				const state = caseState(card.id);
				const display = displayAlg(card);
				$$renderer.push(`<div${attr_class("case-card svelte-ewxbbu", void 0, {
					"state-learning": state === 1,
					"state-learned": state === 2
				})} role="button" tabindex="0"${attr("aria-label", `Cycle learning state for ${stringify(card.name)}`)}><div class="case-card-body svelte-ewxbbu"><img class="case-diagram svelte-ewxbbu"${attr("src", `/diagrams/cfop/${stringify(stage().slug)}/${stringify(card.id)}.svg`)}${attr("alt", `${stringify(card.name)} diagram`)} loading="lazy"/> <div class="case-meta svelte-ewxbbu"><a class="case-name svelte-ewxbbu"${attr("href", `/cfop/${stringify(stage().slug)}/${stringify(card.id)}`)}>${escape_html(card.name)}</a> `);
				if (card.probabilityText) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<span class="case-probability svelte-ewxbbu" title="Probability of occurrence">${escape_html(card.probabilityText)}</span>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--></div> <code${attr_class("case-primary-alg svelte-ewxbbu", void 0, { "is-preferred": display.preferred })}>${escape_html(display.moves)}</code></div></div>`);
			}
			$$renderer.push(`<!--]--></section>`);
		}
		head("ewxbbu", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>${escape_html(stage().fullName)} — cubing</title>`);
			});
		});
		$$renderer.push(`<section class="stage-header svelte-ewxbbu"><h1 class="svelte-ewxbbu">${escape_html(stage().fullName)}</h1> <p class="svelte-ewxbbu">${escape_html(stage().description)}</p> <p class="stage-meta svelte-ewxbbu">${escape_html(cards().length)} cases · click a card to see all algorithms ·
    ${escape_html(learnedCount())} / ${escape_html(cards().length)} learned</p></section> `);
		if (sections()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<!--[-->`);
			const each_array_1 = ensure_array_like(sections());
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let section = each_array_1[$$index_1];
				$$renderer.push(`<h2 class="section-title svelte-ewxbbu">${escape_html(section.title)}</h2> `);
				caseGrid($$renderer, section.cards);
				$$renderer.push(`<!---->`);
			}
			$$renderer.push(`<!--]-->`);
		} else {
			$$renderer.push("<!--[-1-->");
			caseGrid($$renderer, cards());
		}
		$$renderer.push(`<!--]-->`);
	});
}
//#endregion
export { _page as default };

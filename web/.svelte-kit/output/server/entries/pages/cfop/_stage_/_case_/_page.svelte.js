import { R as attr, a as ensure_array_like, c as stringify, i as derived, n as attr_class, o as head, z as escape_html } from "../../../../../chunks/dev.js";
import { t as cubingState } from "../../../../../chunks/store.svelte.js";
//#region src/lib/StateFlag.svelte
function StateFlag($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		/** When inside a wrapping link, prevent the click from navigating. */
		/** Larger rendering for the case-detail control. */
		let { caseId, stopClickBubble = false, large = false } = $$props;
		const state = derived(() => cubingState.state[caseId] ?? 0);
		$$renderer.push(`<button${attr_class("state-flag svelte-1ikdz86", void 0, {
			"state-learning": state() === 1,
			"state-learned": state() === 2,
			"state-flag-large": large
		})} aria-label="Cycle learning state"></button>`);
	});
}
//#endregion
//#region src/routes/cfop/[stage]/[case]/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		const stage = derived(() => data.stage);
		const c = derived(() => data.case);
		const stateName = derived(() => {
			const s = cubingState.state[c().id] ?? 0;
			return s === 2 ? "learned" : s === 1 ? "learning" : "not learned yet";
		});
		head("e6w451", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>${escape_html(c().name)} — ${escape_html(stage().fullName)} — cubing</title>`);
			});
		});
		$$renderer.push(`<section class="case-detail"><nav class="breadcrumbs svelte-e6w451"><a href="/" class="svelte-e6w451">cubing</a> <span>/</span> <a${attr("href", `/cfop/${stringify(stage().slug)}`)} class="svelte-e6w451">${escape_html(stage().shortName)}</a> <span>/</span> <span>${escape_html(c().name)}</span></nav> <div class="case-detail-head svelte-e6w451"><img class="case-detail-diagram svelte-e6w451"${attr("src", `/diagrams/cfop/${stringify(stage().slug)}/${stringify(c().id)}.svg`)}${attr("alt", `${stringify(c().name)} diagram`)}/> <div class="case-detail-info svelte-e6w451"><h1 class="svelte-e6w451">${escape_html(c().name)}</h1> `);
		if (c().aliases && c().aliases.length > 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="case-aliases svelte-e6w451">also known as: ${escape_html(c().aliases.join(", "))}</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <dl class="case-stats svelte-e6w451">`);
		if (c().groupLabel) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<dt class="svelte-e6w451">Group</dt><dd class="svelte-e6w451">${escape_html(c().groupLabel)}</dd>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (c().probabilityText) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<dt class="svelte-e6w451">Probability</dt><dd class="svelte-e6w451">${escape_html(c().probabilityText)}</dd>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <dt class="svelte-e6w451">Algorithms</dt><dd class="svelte-e6w451">${escape_html(c().algorithms.length)}</dd> `);
		if (c().tags && c().tags.length > 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<dt class="svelte-e6w451">Tags</dt><dd class="svelte-e6w451">${escape_html(c().tags.join(", "))}</dd>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></dl> <div class="case-state-control svelte-e6w451">`);
		StateFlag($$renderer, {
			caseId: c().id,
			large: true
		});
		$$renderer.push(`<!----> <span class="state-label svelte-e6w451">${escape_html(stateName())}</span></div></div></div> <h2 class="alg-list-header svelte-e6w451">Algorithms</h2> <ol class="alg-list svelte-e6w451"><!--[-->`);
		const each_array = ensure_array_like(c().algorithms);
		for (let i = 0, $$length = each_array.length; i < $$length; i++) {
			let alg = each_array[i];
			const preferred = cubingState.pref[c().id] === i;
			$$renderer.push(`<li${attr_class("alg-item svelte-e6w451", void 0, { "preferred": preferred })} role="button" tabindex="0"${attr("aria-pressed", preferred)}><div class="alg-row svelte-e6w451"><span class="alg-rank svelte-e6w451">#${escape_html(i + 1)}</span> <code class="alg-moves svelte-e6w451">${escape_html(alg.moves)}</code> <div class="alg-flags svelte-e6w451">`);
			if (alg.popularity === "primary") {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="flag flag-primary svelte-e6w451" title="algdb top pick">primary</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> `);
			if (alg.jperm_recommended) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="flag flag-jperm svelte-e6w451" title="J Perm's recommended alg">jperm</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> `);
			if (alg.scdb_standard) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="flag flag-scdb svelte-e6w451" title="SpeedCubeDB's standard alg">scdb-std</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> `);
			if (alg.length_htm) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="flag flag-stm svelte-e6w451">${escape_html(alg.length_htm)} htm</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></div></div> `);
			if (alg.notes) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<p class="alg-notes svelte-e6w451">${escape_html(alg.notes)}</p>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></li>`);
		}
		$$renderer.push(`<!--]--></ol></section>`);
	});
}
//#endregion
export { _page as default };

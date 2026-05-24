import { R as attr, a as ensure_array_like, c as stringify, z as escape_html } from "../../chunks/dev.js";
import { i as getStageFile, o as STAGES } from "../../chunks/data.js";
var Theme = class {
	mode = "light";
	constructor() {}
	toggle() {
		this.mode = this.mode === "dark" ? "light" : "dark";
		this.apply();
	}
	apply() {}
};
var theme = new Theme();
//#endregion
//#region src/lib/ThemeToggle.svelte
function ThemeToggle($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		$$renderer.push(`<button class="theme-toggle svelte-lu0t34" aria-label="Toggle dark mode"${attr("title", theme.mode === "dark" ? "Switch to light mode" : "Switch to dark mode")}>`);
		if (theme.mode === "dark") {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`);
		}
		$$renderer.push(`<!--]--></button>`);
	});
}
//#endregion
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { children } = $$props;
		const totals = (() => {
			let cases = 0;
			let algs = 0;
			for (const s of STAGES) {
				const file = getStageFile(s.slug);
				if (!file) continue;
				cases += file.cases.length;
				for (const c of file.cases) algs += c.algorithms.length;
			}
			return {
				cases,
				algs
			};
		})();
		$$renderer.push(`<header class="site-header svelte-12qhfyh"><a href="/" class="brand svelte-12qhfyh">cubing</a> <nav class="svelte-12qhfyh"><!--[-->`);
		const each_array = ensure_array_like(STAGES);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let s = each_array[$$index];
			$$renderer.push(`<a${attr("href", `/cfop/${stringify(s.slug)}`)} class="svelte-12qhfyh">${escape_html(s.shortName)}</a>`);
		}
		$$renderer.push(`<!--]--> <a href="/timer" class="svelte-12qhfyh">Timer</a> `);
		ThemeToggle($$renderer, {});
		$$renderer.push(`<!----></nav></header> <main class="svelte-12qhfyh">`);
		children($$renderer);
		$$renderer.push(`<!----></main> <footer class="site-footer svelte-12qhfyh"><span>${escape_html(totals.cases)} cases, ${escape_html(totals.algs)} algorithms · data from algdb.net,
    jperm.net, speedcubedb.com</span></footer>`);
	});
}
//#endregion
export { _layout as default };

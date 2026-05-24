export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["diagrams/cfop/2loll/ocll-anti-sune.svg","diagrams/cfop/2loll/ocll-h.svg","diagrams/cfop/2loll/ocll-l.svg","diagrams/cfop/2loll/ocll-pi.svg","diagrams/cfop/2loll/ocll-sune.svg","diagrams/cfop/2loll/ocll-u.svg","diagrams/cfop/2loll/oell-dot.svg","diagrams/cfop/2loll/oell-l.svg","diagrams/cfop/2loll/oell-line.svg","diagrams/cfop/oll/oll-1.svg","diagrams/cfop/oll/oll-10.svg","diagrams/cfop/oll/oll-11.svg","diagrams/cfop/oll/oll-12.svg","diagrams/cfop/oll/oll-13.svg","diagrams/cfop/oll/oll-14.svg","diagrams/cfop/oll/oll-15.svg","diagrams/cfop/oll/oll-16.svg","diagrams/cfop/oll/oll-17.svg","diagrams/cfop/oll/oll-18.svg","diagrams/cfop/oll/oll-19.svg","diagrams/cfop/oll/oll-2.svg","diagrams/cfop/oll/oll-20.svg","diagrams/cfop/oll/oll-21.svg","diagrams/cfop/oll/oll-22.svg","diagrams/cfop/oll/oll-23.svg","diagrams/cfop/oll/oll-24.svg","diagrams/cfop/oll/oll-25.svg","diagrams/cfop/oll/oll-26.svg","diagrams/cfop/oll/oll-27.svg","diagrams/cfop/oll/oll-28.svg","diagrams/cfop/oll/oll-29.svg","diagrams/cfop/oll/oll-3.svg","diagrams/cfop/oll/oll-30.svg","diagrams/cfop/oll/oll-31.svg","diagrams/cfop/oll/oll-32.svg","diagrams/cfop/oll/oll-33.svg","diagrams/cfop/oll/oll-34.svg","diagrams/cfop/oll/oll-35.svg","diagrams/cfop/oll/oll-36.svg","diagrams/cfop/oll/oll-37.svg","diagrams/cfop/oll/oll-38.svg","diagrams/cfop/oll/oll-39.svg","diagrams/cfop/oll/oll-4.svg","diagrams/cfop/oll/oll-40.svg","diagrams/cfop/oll/oll-41.svg","diagrams/cfop/oll/oll-42.svg","diagrams/cfop/oll/oll-43.svg","diagrams/cfop/oll/oll-44.svg","diagrams/cfop/oll/oll-45.svg","diagrams/cfop/oll/oll-46.svg","diagrams/cfop/oll/oll-47.svg","diagrams/cfop/oll/oll-48.svg","diagrams/cfop/oll/oll-49.svg","diagrams/cfop/oll/oll-5.svg","diagrams/cfop/oll/oll-50.svg","diagrams/cfop/oll/oll-51.svg","diagrams/cfop/oll/oll-52.svg","diagrams/cfop/oll/oll-53.svg","diagrams/cfop/oll/oll-54.svg","diagrams/cfop/oll/oll-55.svg","diagrams/cfop/oll/oll-56.svg","diagrams/cfop/oll/oll-57.svg","diagrams/cfop/oll/oll-6.svg","diagrams/cfop/oll/oll-7.svg","diagrams/cfop/oll/oll-8.svg","diagrams/cfop/oll/oll-9.svg","diagrams/cfop/pll/aa-perm.svg","diagrams/cfop/pll/ab-perm.svg","diagrams/cfop/pll/e-perm.svg","diagrams/cfop/pll/f-perm.svg","diagrams/cfop/pll/ga-perm.svg","diagrams/cfop/pll/gb-perm.svg","diagrams/cfop/pll/gc-perm.svg","diagrams/cfop/pll/gd-perm.svg","diagrams/cfop/pll/h-perm.svg","diagrams/cfop/pll/ja-perm.svg","diagrams/cfop/pll/jb-perm.svg","diagrams/cfop/pll/na-perm.svg","diagrams/cfop/pll/nb-perm.svg","diagrams/cfop/pll/ra-perm.svg","diagrams/cfop/pll/rb-perm.svg","diagrams/cfop/pll/t-perm.svg","diagrams/cfop/pll/ua-perm.svg","diagrams/cfop/pll/ub-perm.svg","diagrams/cfop/pll/v-perm.svg","diagrams/cfop/pll/y-perm.svg","diagrams/cfop/pll/z-perm.svg"]),
	mimeTypes: {".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.DZZ68H7i.js",app:"_app/immutable/entry/app.CZtdt_wL.js",imports:["_app/immutable/entry/start.DZZ68H7i.js","_app/immutable/chunks/JeRmQWXm.js","_app/immutable/chunks/DpZwRfv7.js","_app/immutable/chunks/BuFlayix.js","_app/immutable/entry/app.CZtdt_wL.js","_app/immutable/chunks/DpZwRfv7.js","_app/immutable/chunks/kNaey6uv.js","_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/cfop/[stage]",
				pattern: /^\/cfop\/([^/]+?)\/?$/,
				params: [{"name":"stage","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/cfop/[stage]/[case]",
				pattern: /^\/cfop\/([^/]+?)\/([^/]+?)\/?$/,
				params: [{"name":"stage","optional":false,"rest":false,"chained":false},{"name":"case","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/timer",
				pattern: /^\/timer\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

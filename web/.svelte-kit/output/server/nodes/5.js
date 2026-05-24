

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/timer/_page.svelte.js')).default;
export const universal = {
  "prerender": true,
  "ssr": false
};
export const universal_id = "src/routes/timer/+page.ts";
export const imports = ["_app/immutable/nodes/5.BpWRPXxt.js","_app/immutable/chunks/DpZwRfv7.js","_app/immutable/chunks/BdpGOGGd.js","_app/immutable/chunks/kNaey6uv.js","_app/immutable/chunks/2lX7CMDX.js","_app/immutable/chunks/BMefSCSj.js","_app/immutable/chunks/pdMlnyl7.js","_app/immutable/chunks/Bf2EMgl3.js","_app/immutable/chunks/Cc1gj6Y1.js","_app/immutable/chunks/xihTtKlq.js"];
export const stylesheets = ["_app/immutable/assets/5.TV4Ex5_f.css"];
export const fonts = [];

// The cube view reads its state from query params at runtime — no SSR
// content (params aren't known at build time), but we still prerender
// the shell so the page loads instantly from the static adapter.
export const prerender = true;
export const ssr = false;

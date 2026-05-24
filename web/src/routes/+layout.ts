// All routes are prerendered at build time. SvelteKit crawls from `/`, so
// links to /cfop/<stage> and /cfop/<stage>/<case> are enumerated automatically.
export const prerender = true;
export const ssr = true;

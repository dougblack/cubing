// All routes are prerendered at build time. SvelteKit crawls from `/`, so
// links to /cfop/<stage> and /cfop/<stage>/<case> are enumerated automatically.
export const prerender = true;
export const ssr = true;

// Emit pages as `<route>/index.html` instead of `<route>.html` so static
// hosts (nginx at dougblack.io/cubing) resolve bare directory URLs without
// needing per-page rewrite rules. Without this, `/cfop/oll` 404s because
// the file lives at `cfop/oll.html` alongside the `cfop/oll/` directory.
export const trailingSlash = "always";

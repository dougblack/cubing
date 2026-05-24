// Timer page is client-only — it needs localStorage and live keyboard input.
// Prerender the shell HTML but skip SSR (the timer component reads window).
export const prerender = true;
export const ssr = false;

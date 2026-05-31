import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// We do NOT let Vite bundle the `cubing` package. Cubing's Kociemba search
// worker is bootstrapped from a base64 data: URL whose body imports sibling
// chunks by their original filenames; once Vite hashes those siblings the
// chain breaks and the worker silently dies, so `randomScrambleForEvent`
// never resolves.
//
// Fix: serve cubing as raw ESM. A prebuild step (npm run vendor) copies
// node_modules/cubing/dist/lib/cubing/* into static/vendor/cubing/, and an
// importmap in app.html points the bare `cubing/...` specifiers there.
// Rollup needs to leave those specifiers untouched in the client build.
const CUBING_EXTERNAL = /^cubing(\/|$)/;

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: {
    // Keep cubing out of dev pre-bundling — same worker reason as above,
    // serving the raw files lets the relative-import chain stay intact.
    exclude: ["cubing"],
  },
  build: {
    rollupOptions: {
      external: CUBING_EXTERNAL,
    },
  },
  ssr: {
    // During SSR/prerender, Node resolves `cubing/...` from node_modules
    // normally — the worker is never instantiated server-side, so this
    // just needs to not crash at import time.
    external: ["cubing"],
  },
  server: {
    fs: {
      // Allow importing source from sibling packages (data/, core/).
      allow: [".."],
    },
  },
});

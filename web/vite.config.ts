import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  optimizeDeps: {
    // cubing.js bundles web workers (the Kociemba search worker for scramble
    // generation, etc.) that Vite's dep pre-bundler can't handle — it tries
    // to optimize the worker entry point into a single file and fails with
    // "search-worker-entry.js not found in optimize deps directory".
    // Excluding the package means Vite serves the original ESM files
    // directly and the workers resolve correctly.
    exclude: ["cubing"],
  },
  server: {
    fs: {
      // Allow importing source from sibling packages (data/, core/).
      allow: [".."],
    },
  },
});

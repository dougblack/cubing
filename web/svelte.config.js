import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "404.html",
    }),
    alias: {
      // Sibling TS package — imported as @cubing/core. Aliased here so both
      // Vite and the generated tsconfig pick it up.
      "@cubing/core": "../core/src/index.ts",
      "@cubing/core/*": "../core/src/*",
    },
  },
};

export default config;

<script lang="ts">
  import "../app.css";
  import { STAGES } from "$lib/stages";
  import { getStageFile } from "$lib/data";
  import ThemeToggle from "$lib/ThemeToggle.svelte";

  let { children } = $props();

  // Footer totals across all stages.
  const totals = (() => {
    let cases = 0;
    let algs = 0;
    for (const s of STAGES) {
      const file = getStageFile(s.slug);
      if (!file) continue;
      cases += file.cases.length;
      for (const c of file.cases) algs += c.algorithms.length;
    }
    return { cases, algs };
  })();
</script>

<header class="site-header">
  <a href="/" class="brand">cubing</a>
  <nav>
    <a href="/cfop">algs</a>
    {#each STAGES as s (s.slug)}
      <a href="/cfop/{s.slug}">{s.shortName}</a>
    {/each}
    <ThemeToggle />
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer class="site-footer">
  <span>
    {totals.cases} cases, {totals.algs} algorithms · data from algdb.net,
    jperm.net, speedcubedb.com
  </span>
</footer>

<style>
  .site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }
  .brand {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 20px;
    letter-spacing: -0.005em;
    color: var(--color-text);
  }
  nav a {
    margin-left: 20px;
    color: var(--color-text-muted);
    font-size: 14px;
  }
  nav a:hover {
    color: var(--color-text);
  }

  main {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .site-footer {
    padding: 24px 32px;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 12px;
    text-align: center;
    margin-top: 64px;
  }

  @media (max-width: 600px) {
    main {
      padding: 20px;
    }
    .site-header {
      padding: 12px 20px;
    }
    nav a {
      margin-left: 12px;
    }
  }
</style>

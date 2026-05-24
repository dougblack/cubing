<script lang="ts">
  import { STAGES } from "$lib/stages";
  import { getStageCases } from "$lib/data";
  import { cubingState } from "$lib/store.svelte";

  const stageCards = STAGES.map((s) => {
    const cases = getStageCases(s.slug);
    return {
      ...s,
      caseCount: cases.length,
      algCount: cases.reduce((n, c) => n + c.algorithms.length, 0),
      caseIds: cases.map((c) => c.id),
    };
  });
</script>

<svelte:head>
  <title>cubing</title>
</svelte:head>

<section class="hero">
  <h1>Cubing algorithm reference</h1>
  <p>
    A flat, browsable index of CFOP algorithms with pre-rendered cube state
    diagrams. Click any case to see all known variants, sorted by community
    popularity. Track your progress with the per-case learning flag.
  </p>
</section>

<section class="method-grid">
  {#each stageCards as stage (stage.slug)}
    <a class="method-card" href="/cfop/{stage.slug}">
      <h2>{stage.shortName}</h2>
      <p class="method-subtitle">{stage.fullName}</p>
      <p class="method-meta">
        {stage.caseCount} cases · {stage.algCount} algorithms
      </p>
      <p class="method-learned">
        {cubingState.learnedCount(stage.caseIds)} / {stage.caseCount} learned
      </p>
      <p class="method-desc">{stage.description}</p>
    </a>
  {/each}
</section>

<style>
  .hero {
    max-width: 640px;
    margin-bottom: 40px;
  }
  .hero h1 {
    font-size: 32px;
    font-weight: 600;
    margin: 0 0 12px;
  }
  .hero p {
    color: var(--color-text-muted);
    margin: 0;
  }

  .method-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }
  .method-card {
    display: block;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 24px;
    color: var(--color-text);
    transition: border-color 0.15s ease;
  }
  .method-card:hover {
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }
  .method-card h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .method-subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0 0 12px;
  }
  .method-meta {
    font-size: 12px;
    color: var(--color-text-muted);
    margin: 0 0 4px;
  }
  .method-learned {
    font-size: 12px;
    color: var(--color-text-muted);
    margin: 0 0 12px;
    font-variant-numeric: tabular-nums;
  }
  .method-desc {
    font-size: 13px;
    color: var(--color-text);
    margin: 0;
  }
</style>

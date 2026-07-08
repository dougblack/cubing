<script lang="ts">
  import { base } from "$app/paths";
  import { STAGES } from "$lib/stages";
  import { getStageCases, probabilityCoverage } from "$lib/data";
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
  <title>CFOP algs — cubing</title>
</svelte:head>

<section class="hero">
  <p class="eyebrow hero-eyebrow">CFOP · Algorithm reference</p>
  <h1>Cubing algorithm reference</h1>
  <p>
    A flat, browsable index of CFOP algorithms with pre-rendered cube state
    diagrams. Click any case to see all known variants, sorted by community
    popularity. Track your progress with the per-case learning flag.
  </p>
</section>

<section class="method-grid">
  {#each stageCards as stage (stage.slug)}
    {@const learned = cubingState.learnedCount(stage.caseIds)}
    {@const coverage = probabilityCoverage(
      stage.slug,
      (id) => cubingState.state[id],
    )}
    <a
      class="method-card"
      href="{base}/cfop/{stage.slug}"
      style="--accent: var(--stage-{stage.slug}); --accent-tint: var(--stage-{stage.slug}-tint); --accent-text: var(--stage-{stage.slug}-text)"
    >
      <div class="method-head">
        <span class="method-dot"></span>
        <h2>{stage.shortName}</h2>
      </div>
      <p class="method-subtitle">{stage.fullName}</p>
      <p class="method-meta">
        {stage.caseCount} cases · {stage.algCount} algorithms
      </p>
      <div class="method-progress">
        <div
          class="method-progress-bar"
          style="width: {stage.caseCount
            ? (learned / stage.caseCount) * 100
            : 0}%"
        ></div>
      </div>
      <p class="method-learned">
        {learned} / {stage.caseCount} learned{#if coverage !== null}
          <span class="method-coverage">
            · {Math.round(coverage.learned * 100)}% learned ({Math.round(
              coverage.learning * 100,
            )}% learning)
            <span class="coverage-bar" aria-hidden="true">
              <span
                class="coverage-seg learned"
                style="width: {coverage.learned * 100}%"
              ></span>
              <span
                class="coverage-seg learning"
                style="width: {coverage.learning * 100}%"
              ></span>
            </span>
          </span>{/if}
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
  .hero-eyebrow {
    color: var(--stage-pll-text);
    margin: 0 0 10px;
  }
  .hero h1 {
    font-size: 40px;
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
    position: relative;
    display: block;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 24px;
    color: var(--color-text);
    overflow: hidden;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }
  /* Stage-colored top edge — the card's identity at a glance. */
  .method-card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    background: var(--accent);
  }
  .method-card:hover {
    border-color: var(--accent);
    color: var(--color-text);
    box-shadow: 0 6px 20px -10px var(--accent);
    transform: translateY(-2px);
  }
  .method-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
  }
  .method-dot {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    background: var(--accent);
  }
  .method-card h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
  .method-subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0 0 12px;
  }
  .method-meta {
    font-size: 12px;
    color: var(--color-text-muted);
    margin: 0 0 10px;
  }
  .method-progress {
    height: 5px;
    border-radius: 3px;
    background: var(--color-surface-2);
    overflow: hidden;
    margin: 0 0 6px;
  }
  .method-progress-bar {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.3s ease;
  }
  .method-learned {
    font-size: 12px;
    color: var(--accent-text);
    margin: 0 0 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .method-coverage {
    margin-left: 4px;
    color: var(--color-text-muted);
    font-weight: 400;
    white-space: nowrap;
  }
  .coverage-bar {
    display: inline-flex;
    width: 64px;
    height: 6px;
    border-radius: 3px;
    background: var(--color-surface-2);
    overflow: hidden;
    vertical-align: middle;
    margin-left: 2px;
  }
  /* Two stacked segments: learned (green) first, then learning (yellow). */
  .coverage-seg {
    height: 100%;
    transition: width 0.3s ease;
  }
  .coverage-seg.learned {
    background: var(--color-learned);
  }
  .coverage-seg.learning {
    background: var(--color-learning);
  }
  .method-desc {
    font-size: 13px;
    color: var(--color-text);
    margin: 0;
  }
</style>

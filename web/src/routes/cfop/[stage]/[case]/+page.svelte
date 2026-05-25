<script lang="ts">
  import { base } from "$app/paths";
  import StateFlag from "$lib/StateFlag.svelte";
  import { cubingState } from "$lib/store.svelte";

  let { data } = $props();

  const stage = $derived(data.stage);
  const c = $derived(data.case);

  const stateName = $derived.by(() => {
    const s = cubingState.state[c.id] ?? 0;
    return s === 2 ? "learned" : s === 1 ? "learning" : "not learned yet";
  });
</script>

<svelte:head>
  <title>{c.name} — {stage.fullName} — cubing</title>
</svelte:head>

<section class="case-detail">
  <nav class="breadcrumbs">
    <a href="{base}/">cubing</a>
    <span>/</span>
    <a href="{base}/cfop/{stage.slug}">{stage.shortName}</a>
    <span>/</span>
    <span>{c.name}</span>
  </nav>

  <div class="case-detail-head">
    <img
      class="case-detail-diagram"
      src="{base}/diagrams/cfop/{stage.slug}/{c.id}.svg"
      alt="{c.name} diagram"
    />
    <div class="case-detail-info">
      <h1>{c.name}</h1>
      {#if c.aliases && c.aliases.length > 0}
        <p class="case-aliases">also known as: {c.aliases.join(", ")}</p>
      {/if}
      <dl class="case-stats">
        {#if c.groupLabel}<dt>Group</dt><dd>{c.groupLabel}</dd>{/if}
        {#if c.probabilityText}<dt>Probability</dt><dd>{c.probabilityText}</dd>{/if}
        <dt>Algorithms</dt><dd>{c.algorithms.length}</dd>
        {#if c.tags && c.tags.length > 0}<dt>Tags</dt><dd>{c.tags.join(", ")}</dd>{/if}
      </dl>
      <div class="case-state-control">
        <StateFlag caseId={c.id} large />
        <span class="state-label">{stateName}</span>
      </div>
    </div>
  </div>

  <h2 class="alg-list-header">Algorithms</h2>
  <ol class="alg-list">
    {#each c.algorithms as alg, i (i)}
      {@const preferred = cubingState.pref[c.id] === i}
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <li
        class="alg-item"
        class:preferred
        role="button"
        tabindex="0"
        aria-pressed={preferred}
        onclick={() => cubingState.togglePref(c.id, i)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            cubingState.togglePref(c.id, i);
          }
        }}
      >
        <div class="alg-row">
          <span class="alg-rank">#{i + 1}</span>
          <code class="alg-moves">{alg.moves}</code>
          <div class="alg-flags">
            {#if alg.popularity === "primary"}
              <span class="flag flag-primary" title="algdb top pick">primary</span>
            {/if}
            {#if alg.jperm_recommended}
              <span class="flag flag-jperm" title="J Perm's recommended alg">jperm</span>
            {/if}
            {#if alg.scdb_standard}
              <span class="flag flag-scdb" title="SpeedCubeDB's standard alg">scdb-std</span>
            {/if}
            {#if alg.length_htm}
              <span class="flag flag-stm">{alg.length_htm} htm</span>
            {/if}
          </div>
        </div>
        {#if alg.notes}<p class="alg-notes">{alg.notes}</p>{/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .breadcrumbs {
    display: flex;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: 13px;
    margin-bottom: 24px;
  }
  .breadcrumbs a {
    color: var(--color-text-muted);
  }
  .breadcrumbs a:hover {
    color: var(--color-text);
  }

  .case-detail-head {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 32px;
    margin-bottom: 40px;
  }
  .case-detail-diagram {
    width: 100%;
    max-width: 200px;
    height: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 12px;
    background: var(--color-surface);
  }
  .case-detail-info h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 6px;
  }
  .case-aliases {
    color: var(--color-text-muted);
    font-size: 13px;
    margin: 0 0 16px;
  }
  .case-stats {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 4px 16px;
    font-size: 13px;
    margin: 0 0 20px;
  }
  .case-stats dt {
    color: var(--color-text-muted);
  }
  .case-stats dd {
    margin: 0;
  }
  .case-state-control {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
  }
  .state-label {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .alg-list-header {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px;
  }
  .alg-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .alg-item {
    border-top: 1px solid var(--color-border);
    padding: 12px 12px;
    margin: 0 -12px;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  .alg-item:last-child {
    border-bottom: 1px solid var(--color-border);
  }
  .alg-item:hover:not(.preferred) {
    background: var(--color-surface-2);
  }
  .alg-item.preferred {
    background: var(--color-preferred-tint);
  }
  .alg-item:focus-visible {
    outline: 2px solid var(--color-link);
    outline-offset: -2px;
  }
  .alg-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .alg-rank {
    display: inline-block;
    min-width: 32px;
    color: var(--color-text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .alg-moves {
    flex: 1 1 auto;
    word-break: break-word;
    min-width: 240px;
  }
  .alg-flags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .flag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    background: var(--color-flag-bg);
    color: var(--color-flag-text);
    font-size: 11px;
    font-weight: 500;
    text-transform: lowercase;
  }
  .flag-primary {
    background: var(--color-flag-primary-bg);
    color: var(--color-flag-primary-text);
  }
  .flag-jperm {
    background: var(--color-flag-jperm-bg);
    color: var(--color-flag-jperm-text);
  }
  .flag-scdb {
    background: var(--color-flag-scdb-bg);
    color: var(--color-flag-scdb-text);
  }
  .flag-stm {
    background: var(--color-flag-stm-bg);
    color: var(--color-flag-stm-text);
  }
  .alg-notes {
    margin: 6px 0 0 44px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  @media (max-width: 600px) {
    .case-detail-head {
      grid-template-columns: 1fr;
    }
    .case-detail-diagram {
      max-width: 240px;
    }
  }
</style>

<script lang="ts">
  import { cubingState } from "$lib/store.svelte";

  let { data } = $props();

  const stage = $derived(data.stage);
  const cards = $derived(data.cards);
  const sections = $derived(data.sections);
  const caseIds = $derived(cards.map((c) => c.id));
  const learnedCount = $derived(cubingState.learnedCount(caseIds));

  function displayAlg(card: (typeof cards)[number]) {
    const prefIdx = cubingState.pref[card.id];
    if (prefIdx !== undefined && prefIdx >= 0 && prefIdx < card.algMoves.length) {
      return { moves: card.algMoves[prefIdx]!, preferred: true };
    }
    return { moves: card.primaryAlg, preferred: false };
  }

  function caseState(id: string): 0 | 1 | 2 {
    return (cubingState.state[id] ?? 0) as 0 | 1 | 2;
  }

  function onCardClick(id: string) {
    cubingState.cycleState(id);
  }

  function onCardKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      cubingState.cycleState(id);
    }
  }

  function stopBubble(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

<svelte:head>
  <title>{stage.fullName} — cubing</title>
</svelte:head>

<section class="stage-header">
  <h1>{stage.fullName}</h1>
  <p>{stage.description}</p>
  <p class="stage-meta">
    {cards.length} cases · click a card to see all algorithms ·
    {learnedCount} / {cards.length} learned
  </p>
</section>

{#snippet caseGrid(items: typeof cards)}
  <section class="case-grid">
    {#each items as card (card.id)}
      {@const state = caseState(card.id)}
      {@const display = displayAlg(card)}
      <div
        class="case-card"
        class:state-learning={state === 1}
        class:state-learned={state === 2}
        role="button"
        tabindex="0"
        aria-label="Cycle learning state for {card.name}"
        onclick={() => onCardClick(card.id)}
        onkeydown={(e) => onCardKey(e, card.id)}
      >
        <div class="case-card-body">
          <img
            class="case-diagram"
            src="/diagrams/cfop/{stage.slug}/{card.id}.svg"
            alt="{card.name} diagram"
            loading="lazy"
          />
          <div class="case-meta">
            <a
              class="case-name"
              href="/cfop/{stage.slug}/{card.id}"
              onclick={stopBubble}
            >
              {card.name}
            </a>
            {#if card.probabilityText}
              <span class="case-probability" title="Probability of occurrence">
                {card.probabilityText}
              </span>
            {/if}
          </div>
          <code class="case-primary-alg" class:is-preferred={display.preferred}>
            {display.moves}
          </code>
        </div>
      </div>
    {/each}
  </section>
{/snippet}

{#if sections}
  {#each sections as section (section.title)}
    <h2 class="section-title">{section.title}</h2>
    {@render caseGrid(section.cards)}
  {/each}
{:else}
  {@render caseGrid(cards)}
{/if}

<style>
  .stage-header {
    margin-bottom: 32px;
  }
  .stage-header h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .stage-header p {
    color: var(--color-text-muted);
    margin: 0 0 4px;
    max-width: 720px;
  }
  .stage-meta {
    font-size: 12px;
  }

  .section-title {
    font-size: 20px;
    font-weight: 500;
    margin: 40px 0 16px;
    color: var(--color-text);
  }
  .section-title:first-of-type {
    margin-top: 8px;
  }
  .case-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 16px;
  }
  .case-card {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }
  .case-card:hover {
    border-color: var(--color-text-muted);
  }
  .case-card:focus-visible {
    outline: 2px solid var(--color-link);
    outline-offset: -2px;
  }
  /* Learning state — amber wash + matching thin border, content full-opacity. */
  .case-card.state-learning {
    background: var(--color-learning-bg);
    border-color: var(--color-learning);
  }
  /* Learned state — sage wash + matching thin border; the body content also
   * dims so the card recedes visually (you're done with it). The border
   * stays at full saturation so the state is still readable at a glance. */
  .case-card.state-learned {
    background: var(--color-learned-bg);
    border-color: var(--color-learned);
  }
  .case-card-body {
    display: block;
    padding: 14px;
    color: var(--color-text);
  }
  .case-diagram {
    display: block;
    width: 100%;
    height: auto;
    margin-bottom: 10px;
    background: transparent;
  }
  .case-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
    gap: 8px;
  }
  .case-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--color-text);
    text-decoration: none;
  }
  .case-name:hover {
    color: var(--color-text);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .case-probability {
    font-size: 11px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .case-primary-alg {
    display: block;
    font-size: 11px;
    color: var(--color-text-muted);
    word-break: break-word;
  }
  .case-primary-alg.is-preferred {
    color: var(--color-text);
  }
  .case-primary-alg.is-preferred::before {
    content: "★ ";
    color: var(--color-learning);
    margin-right: 2px;
  }

  /* De-emphasize learned cards: dim the body, desaturate the diagram. */
  .case-card.state-learned .case-card-body {
    opacity: 0.55;
  }
  .case-card.state-learned .case-diagram {
    filter: grayscale(0.85);
  }
  .case-card.state-learned:hover .case-card-body {
    opacity: 0.85;
  }
  .case-card.state-learned:hover .case-diagram {
    filter: grayscale(0.4);
  }
</style>

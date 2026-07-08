<script lang="ts">
  import { base } from "$app/paths";
  import { diagramRotation, probabilityCoverage } from "$lib/data";
  import { cubingState } from "$lib/store.svelte";

  let { data } = $props();

  const stage = $derived(data.stage);
  const cards = $derived(data.cards);
  const sections = $derived(data.sections);
  const caseIds = $derived(cards.map((c) => c.id));
  const learnedCount = $derived(cubingState.learnedCount(caseIds));
  /** Probability-weighted coverage split into learned (+skip) and
   *  learning shares. null for stages with no probability data. */
  const coverage = $derived(
    probabilityCoverage(stage.slug, (id) => cubingState.state[id]),
  );

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

<section
  class="stage-header"
  style="--accent: var(--stage-{stage.slug}); --accent-tint: var(--stage-{stage.slug}-tint); --accent-text: var(--stage-{stage.slug}-text)"
>
  <div class="stage-eyebrow">
    <span class="stage-dot"></span>
    <span>{stage.shortName}</span>
  </div>
  <h1>{stage.fullName}</h1>
  <p>{stage.description}</p>
  <p class="stage-meta">
    {cards.length} cases · {learnedCount} / {cards.length} learned{#if coverage !== null}
      <span
        class="stage-coverage"
        title="Share of solves you can handle, weighted by how often each case occurs: green = learned (or a skip), yellow = currently learning"
      >
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
</section>

{#snippet caseGrid(items: typeof cards)}
  <section
    class="case-grid"
    style="--accent: var(--stage-{stage.slug}); --accent-tint: var(--stage-{stage.slug}-tint); --accent-text: var(--stage-{stage.slug}-text)"
  >
    {#each items as card (card.id)}
      {@const state = caseState(card.id)}
      {@const display = displayAlg(card)}
      {@const rotation =
        stage.slug === "f2l"
          ? { degrees: 0, moves: display.moves, rotated: false }
          : diagramRotation(display.moves)}
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
            src="{base}/diagrams/cfop/{stage.slug}/{card.id}.svg"
            alt="{card.name} diagram"
            loading="lazy"
            style="transform: rotate({rotation.degrees}deg)"
          />
          <div class="case-meta">
            <a
              class="case-name"
              href="{base}/cfop/{stage.slug}/{card.id}"
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
            {rotation.moves}
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
    position: relative;
    margin-bottom: 32px;
    padding-left: 16px;
  }
  /* Stage-colored rule down the left of the header. */
  .stage-header::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }
  .stage-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-text);
    margin-bottom: 8px;
  }
  .stage-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--accent);
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
  .stage-coverage {
    color: var(--color-text);
    font-weight: 600;
    cursor: help;
    white-space: nowrap;
  }
  .coverage-bar {
    display: inline-flex;
    width: 72px;
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
    border-color: var(--accent);
    box-shadow: 0 4px 16px -10px var(--accent);
  }
  .case-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* Learning state — cube-yellow wash + matching border. */
  .case-card.state-learning {
    background: var(--color-learning-bg);
    border-color: var(--color-learning);
  }
  /* Learned state — cube-green wash + matching border. Content stays at
   * full opacity (no dimming/desaturation) so the card reads cleanly. */
  .case-card.state-learned {
    background: var(--color-learned-bg);
    border-color: var(--color-learned);
  }
  /* A flagged card keeps its state color on hover (don't flip to the
   * stage accent), so its learning/learned identity stays stable. */
  .case-card.state-learning:hover {
    border-color: var(--color-learning);
    box-shadow: 0 4px 16px -10px var(--color-learning);
  }
  .case-card.state-learned:hover {
    border-color: var(--color-learned);
    box-shadow: 0 4px 16px -10px var(--color-learned);
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
    transition: transform 0.25s ease;
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
    color: var(--accent-text);
    text-decoration: underline;
    text-decoration-color: var(--accent);
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
    color: var(--cube-yellow-text);
    margin-right: 2px;
  }
</style>

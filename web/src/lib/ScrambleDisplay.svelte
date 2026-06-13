<script lang="ts">
  // Tokenized scramble display shared by the timer and trainer pages.
  //
  // The component always renders via the scramble parser — that's what
  // gives us canonical notation (no `R2'` artifacts) and a stable per-
  // token DOM structure. When a `TrackerState` is also provided, each
  // token is annotated with done / current / half classes so the cuber
  // sees live progress.
  //
  // Styles are component-scoped on purpose: callers that want a
  // different font size or color should wrap this component in a styled
  // container, not reach into its internals.

  import {
    newTrackerState,
    type ScrambleMove,
    type TrackerState,
  } from "@cubing/core";

  interface Props {
    scramble: string;
    tracker?: TrackerState | null;
  }

  let { scramble, tracker = null }: Props = $props();

  /** Parsed steps for the static (no-tracker) render. Falls back to a
   *  fresh tracker over the same scramble so display matches what the
   *  tracker would produce — single source of truth for tokenization. */
  const parsedSteps = $derived.by<readonly ScrambleMove[]>(() => {
    if (!scramble) return [];
    return newTrackerState(scramble).steps;
  });

  function moveLabel(step: ScrambleMove): string {
    return (
      step.face +
      (step.quantity === -1 ? "'" : step.quantity === 2 ? "2" : "")
    );
  }
</script>

{#if scramble}
  <p class="scramble-display" aria-live="polite">
    {#if tracker}
      {#each tracker.steps as step, i (i)}
        {@const isDone = i < tracker.currentIndex}
        {@const isCurrent = i === tracker.currentIndex}
        {@const isHalf = isCurrent && tracker.subProgress === 1}
        <span
          class="scramble-token"
          class:done={isDone}
          class:current={isCurrent}
          class:half={isHalf}>{moveLabel(step)}</span
        >{" "}
      {/each}
    {:else}
      {#each parsedSteps as step, i (i)}
        <span class="scramble-token">{moveLabel(step)}</span>{" "}
      {/each}
    {/if}
  </p>
{/if}

<style>
  .scramble-display {
    font-family: var(--font-mono);
    font-size: 18px;
    text-align: center;
    margin: 0;
    word-break: break-word;
    color: var(--color-text);
    line-height: 1.6;
  }
  .scramble-token {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    transition:
      background 0.12s ease,
      color 0.12s ease,
      opacity 0.12s ease;
  }
  .scramble-token.done {
    opacity: 0.35;
  }
  .scramble-token.current {
    background: var(--color-learning-bg);
    color: var(--color-text);
    font-weight: 600;
  }
  .scramble-token.half {
    /* R2 with one of two turns done — underline as a "halfway" cue */
    text-decoration: underline;
    text-decoration-color: var(--color-learning);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }
</style>

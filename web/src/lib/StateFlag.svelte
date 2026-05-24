<script lang="ts">
  import { cubingState } from "./store.svelte";

  interface Props {
    caseId: string;
    /** When inside a wrapping link, prevent the click from navigating. */
    stopClickBubble?: boolean;
    /** Larger rendering for the case-detail control. */
    large?: boolean;
  }

  let { caseId, stopClickBubble = false, large = false }: Props = $props();

  const state = $derived(cubingState.state[caseId] ?? 0);

  function handleClick(e: MouseEvent) {
    if (stopClickBubble) {
      e.preventDefault();
      e.stopPropagation();
    }
    cubingState.cycleState(caseId);
  }
</script>

<button
  class="state-flag"
  class:state-learning={state === 1}
  class:state-learned={state === 2}
  class:state-flag-large={large}
  aria-label="Cycle learning state"
  onclick={handleClick}
></button>

<style>
  .state-flag {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--color-unlearned);
    background: transparent;
    cursor: pointer;
    padding: 0;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease;
  }
  .state-flag:hover {
    border-color: var(--color-text-muted);
  }
  .state-flag.state-learning {
    background: var(--color-learning);
    border-color: var(--color-learning);
  }
  .state-flag.state-learned {
    background: var(--color-learned);
    border-color: var(--color-learned);
  }
  .state-flag-large {
    width: 18px;
    height: 18px;
  }
</style>

<script lang="ts">
  import { averageOfN, bestSingleMs, type Solve } from "@cubing/core";
  import { formatAverage } from "./format";

  let { solves }: { solves: Solve[] } = $props();

  // `solves` is newest-first (from timerStore.currentSessionSolves()).
  const best = $derived(formatAverage(bestSingleMs(solves)));
  const ao5 = $derived(formatAverage(averageOfN(solves, 5)));
  const ao12 = $derived(formatAverage(averageOfN(solves, 12)));
</script>

<dl class="session-stats">
  <div class="stat">
    <dt>best</dt>
    <dd class="is-best">{best}</dd>
  </div>
  <div class="stat">
    <dt>ao5</dt>
    <dd>{ao5}</dd>
  </div>
  <div class="stat">
    <dt>ao12</dt>
    <dd>{ao12}</dd>
  </div>
  <div class="stat">
    <dt>solves</dt>
    <dd>{solves.length}</dd>
  </div>
</dl>

<style>
  .session-stats {
    display: flex;
    gap: 24px;
    margin: 0;
    padding: 0;
    flex-wrap: wrap;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 64px;
  }
  dt {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-muted);
    margin: 0;
  }
  dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }
  /* Best single is the session's high-water mark — give it the cube-green
   * "personal best" tint so the eye finds it first. */
  dd.is-best {
    color: var(--cube-green-text);
  }
</style>

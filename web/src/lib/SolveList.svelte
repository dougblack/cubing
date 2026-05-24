<script lang="ts">
  import {
    collapseDoubleTurns,
    effectiveMs,
    type Penalty,
    type Solve,
  } from "@cubing/core";
  import { formatMs } from "./format";
  import { timerStore } from "./timer-store.svelte";

  let { solves }: { solves: Solve[] } = $props();

  let expandedId = $state<string | null>(null);

  function displayTime(s: Solve): { text: string; isDnf: boolean } {
    const e = effectiveMs(s);
    if (e === "DNF") return { text: "DNF", isDnf: true };
    const base = formatMs(e);
    return {
      text: s.penalty === "+2" ? `${base}+` : base,
      isDnf: false,
    };
  }

  function setPenalty(e: MouseEvent, s: Solve, p: Penalty) {
    e.stopPropagation();
    timerStore.setPenalty(s.id, s.penalty === p ? "none" : p);
  }

  function confirmDelete(e: MouseEvent, s: Solve) {
    e.stopPropagation();
    const t = displayTime(s).text;
    const ok = window.confirm(`Delete this ${t} solve? This can't be undone.`);
    if (!ok) return;
    if (expandedId === s.id) expandedId = null;
    timerStore.deleteSolve(s.id);
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function onRowKey(e: KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand(id);
    }
  }

  /** BT cube events arrive one quarter turn at a time. For display we
   *  fold same-direction pairs into half turns so the readout matches
   *  cubing notation (`F F → F2`). The stored data stays raw. */
  function displayMoves(text: string): string {
    if (!text) return text;
    return collapseDoubleTurns(text.trim().split(/\s+/)).join(" ");
  }
  function displayMoveStream(stream: { move: string }[]): string {
    return collapseDoubleTurns(stream.map((m) => m.move)).join(" ");
  }
</script>

<section class="solves">
  {#if solves.length === 0}
    <p class="empty">No solves yet. Hit space to start.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="col-idx">#</th>
          <th class="col-time">time</th>
          <th class="col-scramble">scramble</th>
          <th class="col-actions">actions</th>
        </tr>
      </thead>
      <tbody>
        {#each solves as solve, i (solve.id)}
          {@const t = displayTime(solve)}
          {@const isExpanded = expandedId === solve.id}
          <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
          <tr
            class="solve-row"
            class:expanded={isExpanded}
            role="button"
            tabindex="0"
            aria-expanded={isExpanded}
            aria-label="Toggle details for solve {solves.length - i}"
            onclick={() => toggleExpand(solve.id)}
            onkeydown={(e) => onRowKey(e, solve.id)}
          >
            <td class="col-idx">{solves.length - i}</td>
            <td class="col-time" class:dnf={t.isDnf}>{t.text}</td>
            <td class="col-scramble"><code>{displayMoves(solve.scramble)}</code></td>
            <td class="col-actions">
              <button
                class="pen"
                class:active={solve.penalty === "+2"}
                title="Toggle +2 penalty"
                onclick={(e) => setPenalty(e, solve, "+2")}>+2</button
              >
              <button
                class="pen"
                class:active={solve.penalty === "DNF"}
                title="Toggle DNF"
                onclick={(e) => setPenalty(e, solve, "DNF")}>DNF</button
              >
              <button
                class="pen delete"
                title="Delete solve"
                onclick={(e) => confirmDelete(e, solve)}>×</button
              >
            </td>
          </tr>
          {#if isExpanded}
            <tr class="solve-detail">
              <td colspan="4">
                <div class="detail-grid">
                  <div class="detail-label">scramble</div>
                  <div class="detail-value">
                    <code>{displayMoves(solve.scramble)}</code>
                  </div>
                  {#if solve.moveStream && solve.moveStream.length > 0}
                    <div class="detail-label">
                      solve <span class="muted">({solve.moveStream.length} moves)</span>
                    </div>
                    <div class="detail-value">
                      <code>{displayMoveStream(solve.moveStream)}</code>
                    </div>
                  {:else}
                    <div class="detail-label">solve</div>
                    <div class="detail-value muted">
                      no move stream recorded (keyboard-only solve)
                    </div>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .solves {
    margin-top: 32px;
  }
  .empty {
    color: var(--color-text-muted);
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
  }
  th {
    font-weight: 500;
    color: var(--color-text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .solve-row {
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .solve-row:hover {
    background: var(--color-surface-2);
  }
  .solve-row.expanded {
    background: var(--color-surface-2);
  }
  .solve-row:focus-visible {
    outline: 2px solid var(--color-link);
    outline-offset: -2px;
  }
  .col-idx {
    width: 36px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .col-time {
    width: 100px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .col-time.dnf {
    color: var(--color-danger);
  }
  .col-scramble code {
    color: var(--color-text-muted);
    word-break: break-word;
  }
  .col-actions {
    width: 140px;
    text-align: right;
    white-space: nowrap;
  }
  .pen {
    display: inline-block;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 2px 8px;
    margin-left: 4px;
    border-radius: 3px;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .pen:hover {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .pen.active {
    background: var(--color-learning);
    border-color: var(--color-learning);
    color: #2e2c28;
  }
  .pen.delete:hover {
    color: var(--color-danger);
  }

  .solve-detail td {
    background: var(--color-bg);
    padding: 12px 16px;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 8px 16px;
    font-size: 12px;
  }
  .detail-label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 11px;
  }
  .detail-label .muted {
    text-transform: none;
    letter-spacing: normal;
  }
  .detail-value code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text);
    word-break: break-word;
    line-height: 1.5;
  }
  .detail-value.muted {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>

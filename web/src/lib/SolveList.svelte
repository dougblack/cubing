<script lang="ts">
  import {
    analyzeSolveCases,
    batchPhases,
    type CaseAnalysis,
    collapseDoubleTurns,
    effectiveMs,
    type MoveEvent,
    type Penalty,
    type Phase,
    type PhaseAnalysis,
    type Solve,
    type StageSlug,
  } from "@cubing/core";
  import { formatMs } from "./format";
  import { timerStore } from "./timer-store.svelte";

  let { solves }: { solves: Solve[] } = $props();

  let expandedId = $state<string | null>(null);

  /** Per-solve analysis cache. Solves are immutable except for penalty
   *  (which doesn't affect phases or recognized cases), so keying by id
   *  is safe and avoids re-running the analysis on every render. */
  interface SolveAnalysis {
    phases: PhaseAnalysis;
    cases: CaseAnalysis;
  }
  const analysisCache = new Map<string, SolveAnalysis>();
  function getAnalysis(s: Solve): SolveAnalysis | null {
    if (!s.moveStream || s.moveStream.length === 0) return null;
    let cached = analysisCache.get(s.id);
    if (!cached) {
      const phases = batchPhases(s.scramble, s.moveStream);
      const cases = analyzeSolveCases(s.scramble, s.moveStream, phases);
      cached = { phases, cases };
      analysisCache.set(s.id, cached);
    }
    return cached;
  }
  function getPhases(s: Solve): PhaseAnalysis | null {
    return getAnalysis(s)?.phases ?? null;
  }
  function getCase(s: Solve, stage: "oll" | "pll") {
    return getAnalysis(s)?.cases[stage] ?? null;
  }

  const STAGES: StageSlug[] = ["cross", "f2l", "oll", "pll"];
  const STAGE_LABELS: Record<StageSlug, string> = {
    cross: "cross",
    f2l: "F2L",
    oll: "OLL",
    pll: "PLL",
  };

  function findPhase(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
  ): Phase | undefined {
    return analysis?.phases.find((p) => p.stage === stage);
  }
  function phaseDurationText(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
  ): string {
    const p = findPhase(analysis, stage);
    if (!p) return "—";
    if (p.durationMs === 0) return "skip";
    return formatMs(p.durationMs);
  }
  function phaseMoves(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
    stream: MoveEvent[] | undefined,
  ): string[] {
    const p = findPhase(analysis, stage);
    if (!p || !stream) return [];
    return collapseDoubleTurns(
      stream.slice(p.startIndex, p.endIndex).map((m) => m.move),
    );
  }
  function phaseMoveCount(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
  ): number {
    const p = findPhase(analysis, stage);
    return p ? p.endIndex - p.startIndex : 0;
  }

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
    analysisCache.delete(s.id);
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
          {#each STAGES as stage (stage)}
            <th class="col-phase">{STAGE_LABELS[stage]}</th>
          {/each}
          <th class="col-actions">actions</th>
        </tr>
      </thead>
      <tbody>
        {#each solves as solve, i (solve.id)}
          {@const t = displayTime(solve)}
          {@const isExpanded = expandedId === solve.id}
          {@const analysis = getPhases(solve)}
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
            {#each STAGES as stage (stage)}
              {@const c =
                stage === "oll" || stage === "pll"
                  ? getCase(solve, stage)
                  : null}
              <td class="col-phase">
                <div>{phaseDurationText(analysis, stage)}</div>
                {#if c}
                  <div class="col-case" title={c.id}>{c.name}</div>
                {/if}
              </td>
            {/each}
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
              <td colspan="7">
                <div class="detail-grid">
                  <div class="detail-label">scramble</div>
                  <div class="detail-value">
                    <code>{displayMoves(solve.scramble)}</code>
                  </div>
                  {#if !solve.moveStream || solve.moveStream.length === 0}
                    <div class="detail-label">solve</div>
                    <div class="detail-value muted">
                      no move stream recorded (keyboard-only solve)
                    </div>
                  {:else if !analysis}
                    <div class="detail-label">solve</div>
                    <div class="detail-value">
                      <code>{collapseDoubleTurns(solve.moveStream.map((m) => m.move)).join(" ")}</code>
                    </div>
                  {:else}
                    {#each STAGES as stage (stage)}
                      {@const p = findPhase(analysis, stage)}
                      {@const c =
                        stage === "oll" || stage === "pll"
                          ? getCase(solve, stage)
                          : null}
                      {#if p}
                        <div class="detail-label">
                          {STAGE_LABELS[stage]}
                          {#if c}
                            <span class="case-name">{c.name}</span>
                          {/if}
                          <span class="muted">
                            {phaseMoveCount(analysis, stage)} moves ·
                            {phaseDurationText(analysis, stage)}
                          </span>
                        </div>
                        <div class="detail-value">
                          {#if phaseMoveCount(analysis, stage) === 0}
                            <span class="muted">skip</span>
                          {:else}
                            <code
                              >{phaseMoves(analysis, stage, solve.moveStream).join(" ")}</code
                            >
                          {/if}
                        </div>
                      {/if}
                    {/each}
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
    width: 90px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .col-time.dnf {
    color: var(--color-danger);
  }
  .col-phase {
    width: 80px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
    line-height: 1.3;
  }
  .col-case {
    font-family: var(--font-sans);
    font-size: 10px;
    color: var(--color-text);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 72px;
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
    grid-template-columns: 130px 1fr;
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
    color: var(--color-text-muted);
    margin-left: 6px;
  }
  .detail-label .case-name {
    text-transform: none;
    letter-spacing: normal;
    color: var(--color-text);
    font-weight: 500;
    margin-left: 6px;
  }
  .detail-value code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text);
    word-break: break-word;
    line-height: 1.5;
  }
  .detail-value.muted,
  .detail-value > .muted {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>

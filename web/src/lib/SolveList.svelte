<script lang="ts">
  import {
    analyzeSolveCases,
    batchPhases,
    type CaseAnalysis,
    collapseDoubleTurns,
    effectiveMs,
    markExtraneousMoves,
    type MoveEvent,
    type Penalty,
    type Phase,
    type PhaseAnalysis,
    remapAlg,
    simplifyMoves,
    type Solve,
    type StageSlug,
  } from "@cubing/core";
  import { base } from "$app/paths";
  import { formatMs } from "./format";
  import { orientationPref } from "./orientation-pref.svelte";
  import { timerStore } from "./timer-store.svelte";

  let { solves }: { solves: Solve[] } = $props();

  let expandedId = $state<string | null>(null);

  /** Per-(solve + orientation) analysis cache. Solves are immutable
   *  except for penalty (which doesn't affect phases or cases), but the
   *  ANALYSIS depends on the user's orientation preference — moves are
   *  stored raw (cube-frame) and must be translated to the cuber's frame
   *  before the F2L / OLL predicates can fire correctly. Cache key
   *  includes the (top, front) pair so swapping orientations re-runs the
   *  analysis automatically. */
  interface SolveAnalysis {
    phases: PhaseAnalysis;
    cases: CaseAnalysis;
  }
  const analysisCache = new Map<string, SolveAnalysis>();
  function getAnalysis(s: Solve): SolveAnalysis | null {
    if (!s.moveStream || s.moveStream.length === 0) return null;
    const key = `${s.id}:${orientationPref.top}:${orientationPref.front}`;
    let cached = analysisCache.get(key);
    if (!cached) {
      const remap = orientationPref.faceRemap();
      const sc = remapAlg(s.scramble, remap);
      const stream = s.moveStream.map((m) => ({
        ...m,
        move: orientationPref.displayMove(m.move),
      }));
      const phases = batchPhases(sc, stream);
      const cases = analyzeSolveCases(sc, stream, phases);
      cached = { phases, cases };
      analysisCache.set(key, cached);
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
    // Translate to the cuber's preferred frame BEFORE collapsing — pairs
    // that were identical in cube frame might map to different letters
    // in user frame (e.g. cube's "L L" → user's "R R" → still collapses,
    // but the input letter has to be the user-frame one for display).
    return collapseDoubleTurns(
      stream
        .slice(p.startIndex, p.endIndex)
        .map((m) => orientationPref.displayMove(m.move)),
    );
  }
  /** HTM (Half-Turn Metric) count: each face turn — quarter or half —
   *  counts as one move. BT cubes report only quarter turns, so a
   *  physical D2 lands in the stream as two `D` events; collapsing
   *  adjacent same-direction pairs into half turns recovers the HTM
   *  count the cuber expects to see. */
  function htmCount(moves: readonly string[]): number {
    return collapseDoubleTurns(moves).length;
  }
  function phaseMoveCount(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
    stream: MoveEvent[] | undefined,
  ): number {
    const p = findPhase(analysis, stage);
    if (!p || !stream) return 0;
    return htmCount(stream.slice(p.startIndex, p.endIndex).map((m) => m.move));
  }

  /** Build a `/cube?...` URL whose state is "what the cuber was looking
   *  at when they entered this phase". We pass the scramble + the moves
   *  applied up to (but not including) this phase's first move. */
  function phaseCubeUrl(s: Solve, p: Phase): string {
    const prefixMoves = s.moveStream
      ? s.moveStream
          .slice(0, p.startIndex)
          .map((m) => m.move)
          .join(" ")
      : "";
    const params = new URLSearchParams();
    if (s.scramble) params.set("scramble", s.scramble);
    if (prefixMoves) params.set("alg", prefixMoves);
    return `${base}/cube?${params.toString()}`;
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

  /** Scramble display: translate to the user's frame, then fully simplify
   *  (cancel hesitations and redundant turns within a face). The cuber
   *  cares about the effective setup state, not how they got there. */
  function displayScramble(text: string): string {
    if (!text) return text;
    const translated = remapAlg(text, orientationPref.faceRemap());
    return simplifyMoves(translated.trim().split(/\s+/)).join(" ");
  }

  /** Group adjacent moves of the same extraneous-ness into runs so the
   *  underline draws as one continuous line over a wasted sequence (e.g.
   *  `U2 U` underlined as a single span) instead of broken per token. */
  interface MoveSegment {
    text: string;
    extraneous: boolean;
  }
  function segmentExtraneousRuns(moves: string[]): MoveSegment[] {
    const flags = markExtraneousMoves(moves);
    const out: MoveSegment[] = [];
    let i = 0;
    while (i < moves.length) {
      const ex = flags[i]!;
      let j = i + 1;
      while (j < moves.length && flags[j] === ex) j++;
      out.push({ text: moves.slice(i, j).join(" "), extraneous: ex });
      i = j;
    }
    return out;
  }

  /** Fastest/slowest valid (non-DNF) effective time and per-phase duration
   *  across the visible solves. Skips (0-ms phases) and DNFs are excluded —
   *  the solve never finished or the phase didn't happen, so the numbers
   *  aren't comparable. Worst-highlighting also requires 2+ samples and a
   *  spread (best !== worst), so the lone solve doesn't get a red cell. */
  interface Extremes {
    best: number | null;
    worst: number | null;
    samples: number;
  }
  const extremes = $derived.by(() => {
    const single: Extremes = { best: null, worst: null, samples: 0 };
    const phase: Record<StageSlug, Extremes> = {
      cross: { best: null, worst: null, samples: 0 },
      f2l: { best: null, worst: null, samples: 0 },
      oll: { best: null, worst: null, samples: 0 },
      pll: { best: null, worst: null, samples: 0 },
    };
    const update = (e: Extremes, v: number) => {
      e.samples += 1;
      if (e.best === null || v < e.best) e.best = v;
      if (e.worst === null || v > e.worst) e.worst = v;
    };
    for (const s of solves) {
      if (s.penalty === "DNF") continue;
      const e = effectiveMs(s);
      if (typeof e === "number") update(single, e);
      const analysis = getPhases(s);
      if (!analysis) continue;
      for (const stage of STAGES) {
        const p = findPhase(analysis, stage);
        if (!p || p.durationMs <= 0) continue;
        update(phase[stage], p.durationMs);
      }
    }
    return { single, phase };
  });

  function isBest(e: Extremes, v: number): boolean {
    return e.best !== null && v === e.best;
  }
  function isWorst(e: Extremes, v: number): boolean {
    return (
      e.samples >= 2 &&
      e.worst !== null &&
      v === e.worst &&
      e.worst !== e.best
    );
  }

  function isBestSingle(s: Solve): boolean {
    if (s.penalty === "DNF") return false;
    const v = effectiveMs(s);
    return typeof v === "number" && isBest(extremes.single, v);
  }
  function isWorstSingle(s: Solve): boolean {
    if (s.penalty === "DNF") return false;
    const v = effectiveMs(s);
    return typeof v === "number" && isWorst(extremes.single, v);
  }
  function isBestPhase(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
    penalty: Penalty,
  ): boolean {
    if (penalty === "DNF") return false;
    const p = findPhase(analysis, stage);
    if (!p || p.durationMs <= 0) return false;
    return isBest(extremes.phase[stage], p.durationMs);
  }
  function isWorstPhase(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
    penalty: Penalty,
  ): boolean {
    if (penalty === "DNF") return false;
    const p = findPhase(analysis, stage);
    if (!p || p.durationMs <= 0) return false;
    return isWorst(extremes.phase[stage], p.durationMs);
  }
</script>

{#snippet moveCode(moves: string[])}
  {@const segments = segmentExtraneousRuns(moves)}
  <code>
    {#each segments as seg, i (i)}
      <span class:extraneous={seg.extraneous}>{seg.text}</span>{i < segments.length - 1 ? " " : ""}
    {/each}
  </code>
{/snippet}

<section class="solves">
  {#if solves.length === 0}
    <p class="empty">No solves yet. Hit space to start.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="col-idx">#</th>
          <th class="col-time">time</th>
          <th class="col-moves" title="Total number of moves (BT-tracked solves only)">moves</th>
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
            <td
              class="col-time"
              class:dnf={t.isDnf}
              class:best={isBestSingle(solve)}
              class:worst={isWorstSingle(solve)}>{t.text}</td
            >
            <td class="col-moves">
              {solve.moveStream && solve.moveStream.length > 0
                ? htmCount(solve.moveStream.map((m) => m.move))
                : "—"}
            </td>
            {#each STAGES as stage (stage)}
              {@const c =
                stage === "oll" || stage === "pll"
                  ? getCase(solve, stage)
                  : null}
              <td
                class="col-phase"
                class:best={isBestPhase(analysis, stage, solve.penalty)}
                class:worst={isWorstPhase(analysis, stage, solve.penalty)}
              >
                <div>{phaseDurationText(analysis, stage)}</div>
                {#if c}
                  <a
                    class="col-case"
                    href="{base}/cfop/{stage}/{c.id}"
                    target="_blank"
                    rel="noopener"
                    title="View {c.name} ({c.id}) — opens in new tab"
                    onclick={(e) => e.stopPropagation()}>{c.name}</a
                  >
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
              <td colspan="8">
                <div class="detail-grid">
                  <div class="detail-label">scramble</div>
                  <div class="detail-value">
                    <code>{displayScramble(solve.scramble)}</code>
                  </div>
                  {#if !solve.moveStream || solve.moveStream.length === 0}
                    <div class="detail-label">solve</div>
                    <div class="detail-value muted">
                      no move stream recorded (keyboard-only solve)
                    </div>
                  {:else if !analysis}
                    <div class="detail-label">solve</div>
                    <div class="detail-value">
                      {@render moveCode(collapseDoubleTurns(solve.moveStream.map((m) => orientationPref.displayMove(m.move))))}
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
                          <a
                            class="phase-link"
                            href={phaseCubeUrl(solve, p)}
                            target="_blank"
                            rel="noopener"
                            title="View cube at start of {STAGE_LABELS[stage]} — opens in new tab"
                            onclick={(e) => e.stopPropagation()}
                            >{STAGE_LABELS[stage]}</a
                          >
                          <span class="muted">
                            {phaseMoveCount(analysis, stage, solve.moveStream)} moves ·
                            {phaseDurationText(analysis, stage)}
                          </span>
                          {#if c}
                            <a
                              class="case-name"
                              href="{base}/cfop/{stage}/{c.id}"
                              target="_blank"
                              rel="noopener"
                              title="View {c.name} ({c.id}) — opens in new tab"
                              onclick={(e) => e.stopPropagation()}>{c.name}</a
                            >
                          {/if}
                        </div>
                        <div class="detail-value">
                          {#if phaseMoveCount(analysis, stage, solve.moveStream) === 0}
                            <span class="muted">skip</span>
                          {:else}
                            {@render moveCode(phaseMoves(analysis, stage, solve.moveStream))}
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
  .col-moves {
    width: 56px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
  }
  .col-time.best {
    background: var(--color-best-bg);
    color: var(--color-best-text);
  }
  .col-time.worst {
    background: var(--color-worst-bg);
    color: var(--color-worst-text);
  }
  .col-phase {
    width: 80px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
    line-height: 1.3;
  }
  .col-phase.best {
    background: var(--color-best-bg);
    color: var(--color-best-text);
  }
  .col-phase.best .col-case {
    color: var(--color-best-text);
  }
  .col-phase.worst {
    background: var(--color-worst-bg);
    color: var(--color-worst-text);
  }
  .col-phase.worst .col-case {
    color: var(--color-worst-text);
  }
  .col-case {
    display: block;
    font-family: var(--font-sans);
    font-size: 10px;
    color: var(--color-text);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 72px;
  }
  a.col-case:hover {
    color: var(--color-link);
    text-decoration: underline;
    text-underline-offset: 2px;
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
    /* Left column auto-sizes to the widest label so every "PHASE  case ·
     * moves · time" stays on a single line; right column takes the rest
     * and wraps the move list as needed. */
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    font-size: 12px;
  }
  .detail-label {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 11px;
    white-space: nowrap;
  }
  a.phase-link {
    color: inherit;
  }
  a.phase-link:hover {
    color: var(--color-link);
    text-decoration: underline;
    text-underline-offset: 2px;
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
  a.case-name:hover {
    color: var(--color-link);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .detail-value code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text);
    word-break: break-word;
    line-height: 1.5;
  }
  .detail-value code .extraneous {
    text-decoration: underline;
    text-decoration-color: var(--color-warn);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .detail-value.muted,
  .detail-value .muted {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>

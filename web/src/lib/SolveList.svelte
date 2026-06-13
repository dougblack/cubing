<script lang="ts">
  import {
    analyzeSolveCases,
    batchPhases,
    type CaseAnalysis,
    collapseDoubleTurns,
    effectiveMs,
    markExtraneousMoves,
    mean,
    median,
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
  /** Per-solve "show pause markers" toggle. Lives in the expanded detail
   *  view so collapsed rows don't carry extra chrome. Ephemeral. */
  let pausesShown = $state<Set<string>>(new Set());
  function togglePauses(e: MouseEvent, id: string) {
    e.stopPropagation();
    const next = new Set(pausesShown);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    pausesShown = next;
  }

  /** Session-relative pause threshold. We use median × 4 (with a 300ms
   *  floor for very fast sessions) instead of stddev: pauses ARE the
   *  outliers we want to flag, and they pull the stddev up with them,
   *  blunting the very signal we're trying to detect. Median is robust
   *  to that. The floor keeps blazing sessions (median ~50ms) from
   *  flagging every normal-tempo gap. Recomputes whenever the visible
   *  solve set changes. */
  const pauseThresholdMs = $derived.by(() => {
    const gaps: number[] = [];
    for (const s of solves) {
      const ms = s.moveStream;
      if (!ms) continue;
      for (let i = 1; i < ms.length; i++) {
        gaps.push(ms[i]!.tMs - ms[i - 1]!.tMs);
      }
    }
    if (gaps.length < 20) return 500;
    const m = median(gaps) ?? 0;
    return Math.max(300, m * 4);
  });

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
  /** User-frame events for a phase. Used by the renderer, which collapses
   *  to half turns AND needs the original quarter-turn tMs values to draw
   *  pause markers. Returning events instead of pre-collapsed strings
   *  keeps both pieces of information available. */
  function phaseEvents(
    analysis: PhaseAnalysis | null,
    stage: StageSlug,
    stream: MoveEvent[] | undefined,
  ): MoveEvent[] {
    const p = findPhase(analysis, stage);
    if (!p || !stream) return [];
    return stream.slice(p.startIndex, p.endIndex).map((m) => ({
      ...m,
      move: orientationPref.displayMove(m.move),
    }));
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
    // Cache keys are `${id}:${top}:${front}`, so a bare `.delete(s.id)`
    // leaks every orientation-bearing entry. Drop every key with the
    // solve's id prefix.
    const prefix = `${s.id}:`;
    for (const k of analysisCache.keys()) {
      if (k.startsWith(prefix)) analysisCache.delete(k);
    }
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

  /** Collapse identical adjacent quarter-turns to half turns while
   *  recording, for each output token, the index in the input event
   *  array of its FIRST contributing quarter turn. The renderer uses
   *  that index to read tMs and decide whether a pause marker belongs
   *  immediately before this token. */
  function collapseWithFirstIndex(events: readonly MoveEvent[]): {
    tokens: string[];
    firstIndex: number[];
  } {
    const tokens: string[] = [];
    const firstIndex: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const move = events[i]!.move;
      const last = tokens.length - 1;
      if (last >= 0 && tokens[last] === move && !move.endsWith("2")) {
        tokens[last] = move.charAt(0) + "2";
      } else {
        tokens.push(move);
        firstIndex.push(i);
      }
    }
    return { tokens, firstIndex };
  }

  /** Render atom: a contiguous run of same-extraneousness moves, or a
   *  pause marker (with the gap duration so the tooltip can show it).
   *  A long pause splits an extraneous run so the marker sits visibly
   *  inside it — the underline restarts on the other side. */
  type RenderAtom =
    | { kind: "segment"; text: string; extraneous: boolean }
    | { kind: "pause"; gapMs: number };
  function buildAtoms(
    events: readonly MoveEvent[],
    showPauses: boolean,
    thresholdMs: number,
  ): RenderAtom[] {
    const { tokens, firstIndex } = collapseWithFirstIndex(events);
    const flags = markExtraneousMoves(tokens);
    const atoms: RenderAtom[] = [];
    let cur: { tokens: string[]; ex: boolean } | null = null;
    const flush = () => {
      if (cur) {
        atoms.push({
          kind: "segment",
          text: cur.tokens.join(" "),
          extraneous: cur.ex,
        });
        cur = null;
      }
    };
    for (let k = 0; k < tokens.length; k++) {
      const ex = flags[k]!;
      const idx = firstIndex[k]!;
      const gapMs =
        idx > 0 ? events[idx]!.tMs - events[idx - 1]!.tMs : 0;
      const isPaused = showPauses && gapMs > thresholdMs;
      if (cur && cur.ex === ex && !isPaused) {
        cur.tokens.push(tokens[k]!);
      } else {
        flush();
        if (isPaused) atoms.push({ kind: "pause", gapMs });
        cur = { tokens: [tokens[k]!], ex };
      }
    }
    flush();
    return atoms;
  }

  /** Single-pass aggregation over the visible solves: collect each
   *  column's numeric samples once, then derive best/worst/mean/median
   *  from those arrays. Skips DNFs (single + phases) and skip-phases
   *  (0-ms duration) — the solve never finished or the phase didn't
   *  happen, so the numbers aren't comparable. Doing this in one pass
   *  avoids the older split between `extremes` and `stats` derivations
   *  that walked solves twice with the exact same filter rules. */
  const samples = $derived.by(() => {
    const single: number[] = [];
    const phase: Record<StageSlug, number[]> = {
      cross: [],
      f2l: [],
      oll: [],
      pll: [],
    };
    for (const s of solves) {
      if (s.penalty === "DNF") continue;
      const e = effectiveMs(s);
      if (typeof e === "number") single.push(e);
      const analysis = getPhases(s);
      if (!analysis) continue;
      for (const stage of STAGES) {
        const p = findPhase(analysis, stage);
        if (!p || p.durationMs <= 0) continue;
        phase[stage].push(p.durationMs);
      }
    }
    return { single, phase };
  });

  /** Best (min) is used to highlight every render. Worst (max) is only
   *  highlighted when there are 2+ samples AND a real spread — a single
   *  solve shouldn't be both best and worst. */
  interface Extremes {
    best: number | null;
    worst: number | null;
    samples: number;
  }
  function extremesOf(xs: readonly number[]): Extremes {
    if (xs.length === 0) return { best: null, worst: null, samples: 0 };
    let best = xs[0]!;
    let worst = xs[0]!;
    for (let i = 1; i < xs.length; i++) {
      const v = xs[i]!;
      if (v < best) best = v;
      if (v > worst) worst = v;
    }
    return { best, worst, samples: xs.length };
  }
  const extremes = $derived({
    single: extremesOf(samples.single),
    phase: {
      cross: extremesOf(samples.phase.cross),
      f2l: extremesOf(samples.phase.f2l),
      oll: extremesOf(samples.phase.oll),
      pll: extremesOf(samples.phase.pll),
    },
  });
  const stats = $derived({
    mean: {
      single: mean(samples.single),
      cross: mean(samples.phase.cross),
      f2l: mean(samples.phase.f2l),
      oll: mean(samples.phase.oll),
      pll: mean(samples.phase.pll),
    },
    median: {
      single: median(samples.single),
      cross: median(samples.phase.cross),
      f2l: median(samples.phase.f2l),
      oll: median(samples.phase.oll),
      pll: median(samples.phase.pll),
    },
  });
  function statText(v: number | null): string {
    return v === null ? "—" : formatMs(v);
  }

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

{#snippet moveCode(events: MoveEvent[], solveId: string)}
  {@const atoms = buildAtoms(
    events,
    pausesShown.has(solveId),
    pauseThresholdMs,
  )}
  <code>
    {#each atoms as atom, i (i)}{#if i > 0}{" "}{/if}{#if atom.kind === "pause"}<span
          class="pause">⊢{formatMs(atom.gapMs)}s⊣</span
        >{:else}<span class:extraneous={atom.extraneous}>{atom.text}</span>{/if}{/each}
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
                {#if solve.moveStream && solve.moveStream.length > 0}
                  <div class="detail-toolbar">
                    <button
                      class="pen pause-toggle"
                      class:active={pausesShown.has(solve.id)}
                      title="Highlight gaps longer than {formatMs(
                        pauseThresholdMs,
                      )}s (session-relative)"
                      onclick={(e) => togglePauses(e, solve.id)}
                      >⊢⊣ pauses</button
                    >
                  </div>
                {/if}
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
                      {@render moveCode(
                        solve.moveStream.map((m) => ({
                          ...m,
                          move: orientationPref.displayMove(m.move),
                        })),
                        solve.id,
                      )}
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
                            {@render moveCode(
                              phaseEvents(analysis, stage, solve.moveStream),
                              solve.id,
                            )}
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
      {#if solves.length >= 2}
        <tfoot>
          <tr class="stats-row">
            <td class="col-idx stats-label">mean</td>
            <td class="col-time">{statText(stats.mean.single)}</td>
            <td class="col-moves">—</td>
            {#each STAGES as stage (stage)}
              <td class="col-phase">{statText(stats.mean[stage])}</td>
            {/each}
            <td class="col-actions"></td>
          </tr>
          <tr class="stats-row">
            <td class="col-idx stats-label">median</td>
            <td class="col-time">{statText(stats.median.single)}</td>
            <td class="col-moves">—</td>
            {#each STAGES as stage (stage)}
              <td class="col-phase">{statText(stats.median[stage])}</td>
            {/each}
            <td class="col-actions"></td>
          </tr>
        </tfoot>
      {/if}
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
  .detail-value code .pause {
    color: var(--color-text-muted);
    opacity: 0.7;
    margin: 0 1px;
  }
  .detail-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .pause-toggle {
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .stats-row td {
    border-top: 1px solid var(--color-border);
    border-bottom: none;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
  .stats-label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
    font-family: var(--font-sans);
  }
  .detail-value.muted,
  .detail-value .muted {
    color: var(--color-text-muted);
    font-style: italic;
  }
</style>

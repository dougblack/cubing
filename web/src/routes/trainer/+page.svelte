<script lang="ts">
  import {
    generateTrainerScramble,
    isComplete,
    isCaseTrainable,
    newTrackerState,
    pickRandomCase,
    tickTracker,
    type TrackerState,
    type TrainerStage,
    trainerCases,
  } from "@cubing/core";
  import { untrack } from "svelte";
  import { base } from "$app/paths";
  import { bluetoothStore, forgetCachedCubeMacs } from "$lib/bluetooth.svelte";
  import { formatMs } from "$lib/format";
  import OrientationPicker from "$lib/OrientationPicker.svelte";
  import ScrambleDisplay from "$lib/ScrambleDisplay.svelte";
  import { trainerStore } from "$lib/trainer-store.svelte";

  /** Trainer phase machine.
   *  - presenting: scramble shown; the scramble tracker advances on each
   *    BT move and auto-transitions to `recognizing` when it completes.
   *    Without BT the cuber gets a manual "begin" button.
   *  - recognizing: clock running, waiting for the first execution move
   *    AFTER the scramble is done.
   *  - executing: clock from first move to BT solved-state transition.
   *  - done: attempt recorded; "next" generates a fresh case.
   */
  type Phase = "presenting" | "recognizing" | "executing" | "done";

  let stage = $state<TrainerStage>("pll");
  let phase = $state<Phase>("presenting");
  let current = $state<{
    caseId: string;
    caseName: string;
    scramble: string;
  } | null>(null);
  let trackerState = $state<TrackerState | null>(null);

  let recognitionStartedAt = 0;
  let executionStartedAt = 0;
  let recognitionMs = $state<number | null>(null);
  let executionMs = $state<number | null>(null);
  /** Whether the current attempt was completed cleanly (cube reached
   *  solved state) or DNF'd (escape / abort). Only meaningful in the
   *  `done` phase. */
  let lastWasDnf = $state(false);

  /** Live counter for the current running phase (recognize OR execute).
   *  30ms tick — smooth enough that the cuber sees movement without
   *  burning the main thread. */
  let liveMs = $state(0);
  let liveTimer: ReturnType<typeof setInterval> | null = null;
  function startLive(originMs: number) {
    stopLive();
    liveMs = 0;
    liveTimer = setInterval(() => {
      liveMs = performance.now() - originMs;
    }, 30);
  }
  function stopLive() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  function loadCase() {
    stopLive();
    const c = pickRandomCase(stage);
    const scramble = generateTrainerScramble(stage, c.id);
    current = { caseId: c.id, caseName: c.name, scramble };
    phase = "presenting";
    trackerState =
      bluetoothStore.status === "connected" ? newTrackerState(scramble) : null;
    recognitionMs = null;
    executionMs = null;
    liveMs = 0;
    lastWasDnf = false;
  }

  /** "Cube is solved" — used when the BT cube's solved-state detection
   *  misses a transition. Resyncs the BT cube's solved reference to
   *  the current physical state. CRITICAL: we must NOT call this
   *  during `presenting`/`recognizing` — the cube is mid-scramble or
   *  in case state, not actually solved, and pointing BT's reference
   *  at the wrong state corrupts `onSolved` detection for the whole
   *  session. So the button is gated to phases where the cube can
   *  reasonably be assumed solved. */
  const canMarkSolved = $derived(phase === "executing" || phase === "done");
  function markSolved() {
    if (!canMarkSolved) return;
    if (phase === "executing" && current && recognitionMs !== null) {
      executionMs = performance.now() - executionStartedAt;
      stopLive();
      phase = "done";
      lastWasDnf = false;
      trainerStore.addAttempt({
        caseId: current.caseId,
        stage,
        scramble: current.scramble,
        recognitionMs,
        executionMs,
        correct: true,
      });
    }
    if (bluetoothStore.status === "connected") {
      bluetoothStore.resetCubeState();
    }
  }

  /** Abort the current attempt. From `executing`, record a DNF with the
   *  partial times so the attempt shows up in history. From earlier
   *  phases, no useful timing yet — just regenerate. */
  function markDnf() {
    if (phase === "executing" && current && recognitionMs !== null) {
      executionMs = performance.now() - executionStartedAt;
      stopLive();
      phase = "done";
      lastWasDnf = true;
      trainerStore.addAttempt({
        caseId: current.caseId,
        stage,
        scramble: current.scramble,
        recognitionMs,
        executionMs,
        correct: false,
      });
      return;
    }
    if (phase === "presenting" || phase === "recognizing") {
      loadCase();
    }
  }

  /** Transition presenting → recognizing. Called by the tracker when
   *  the cuber finishes applying the scramble, or by the manual
   *  "begin" button when the cuber isn't using BT. */
  function startRecognition() {
    if (phase !== "presenting") return;
    phase = "recognizing";
    recognitionStartedAt = performance.now();
    startLive(recognitionStartedAt);
  }

  function skipCase() {
    // No attempt recorded — generates a fresh case immediately.
    stopLive();
    loadCase();
  }

  /** Record an in-flight executing attempt as DNF before abandoning it.
   *  Shared between stage-toggle and any future "abandon-and-skip" path
   *  — both should preserve the timing data rather than silently dropping
   *  the attempt from stats. */
  function recordPendingDnf() {
    if (phase !== "executing" || !current || recognitionMs === null) return;
    executionMs = performance.now() - executionStartedAt;
    stopLive();
    trainerStore.addAttempt({
      caseId: current.caseId,
      stage,
      scramble: current.scramble,
      recognitionMs,
      executionMs,
      correct: false,
    });
  }

  function setStage(next: TrainerStage) {
    if (next === stage) return;
    recordPendingDnf();
    stage = next;
    loadCase();
  }

  // Initial case load. `untrack` keeps loadCase's `bluetoothStore.status`
  // read from registering as a dep of this effect — otherwise every BT
  // (dis)connect would regenerate a fresh case mid-attempt.
  $effect(() => {
    untrack(() => loadCase());
  });

  // Stop the live timer on unmount. The timer would otherwise keep
  // ticking and writing to detached $state after SPA navigation.
  $effect(() => () => stopLive());

  // Init / drop the tracker as BT (dis)connects mid-presenting. The
  // tracker is only useful while we have moves arriving; without BT,
  // the cuber falls back to a manual "begin" button.
  $effect(() => {
    if (
      bluetoothStore.status === "connected" &&
      current &&
      phase === "presenting" &&
      !trackerState
    ) {
      trackerState = newTrackerState(current.scramble);
    } else if (bluetoothStore.status !== "connected" && trackerState) {
      trackerState = null;
    }
  });

  // BT wiring: tracker advance during presenting, recognition→execution
  // on first post-scramble move, execution→done on solved-state.
  $effect(() => {
    if (bluetoothStore.status !== "connected") return;
    const unsubMove = bluetoothStore.onMove((move) => {
      if (phase === "presenting" && trackerState) {
        const r = tickTracker(trackerState, move);
        trackerState = r.state;
        if (isComplete(trackerState)) startRecognition();
        return;
      }
      if (phase === "recognizing") {
        executionStartedAt = performance.now();
        recognitionMs = executionStartedAt - recognitionStartedAt;
        phase = "executing";
        startLive(executionStartedAt);
      }
    });
    const unsubSolved = bluetoothStore.onSolved((lastMoveAt) => {
      if (phase !== "executing") return;
      const endAt = lastMoveAt ?? performance.now();
      executionMs = endAt - executionStartedAt;
      stopLive();
      phase = "done";
      if (current && recognitionMs !== null) {
        trainerStore.addAttempt({
          caseId: current.caseId,
          stage,
          scramble: current.scramble,
          recognitionMs,
          executionMs,
          correct: true,
        });
      }
    });
    return () => {
      unsubMove();
      unsubSolved();
    };
  });

  // Show only cases the trainer can currently produce scrambles for.
  // Untrainable cases (e.g. M-slice-only OLLs) would otherwise show
  // permanent dashes that never change, since `pickRandomCase` never
  // selects them.
  const cases = $derived(
    trainerCases(stage).filter((c) => isCaseTrainable(stage, c.id)),
  );
  const totalAttempts = $derived(
    trainerStore.attempts.filter((a) => a.stage === stage).length,
  );

  // Esc: DNF the current attempt (or skip if no timing has started yet).
  // Mirrors the Timer component's keybinding so muscle memory carries.
  // Guard against OS key-repeat: holding Esc would otherwise burn through
  // fresh scrambles at ~30Hz on each keydown.
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        markDnf();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<svelte:head>
  <title>Trainer — cubing</title>
</svelte:head>

<section class="trainer-page">
  <div class="head">
    <h1>{stage.toUpperCase()} trainer</h1>
    <OrientationPicker />
  </div>

  <div class="bt-bar">
    {#if !bluetoothStore.isAvailable()}
      <span class="bt-note">
        Web Bluetooth isn't supported here — try Chrome, Edge, or Brave. The
        trainer needs a connected cube to detect moves and solved state.
      </span>
    {:else if bluetoothStore.status === "connected"}
      <span class="bt-status">
        <span class="bt-dot bt-dot-on"></span>
        {bluetoothStore.deviceName ?? "cube"}
      </span>
      <button
        class="bt-btn"
        title={canMarkSolved
          ? "Sync the cube's BT state to physically-solved. Ends the execution timer if it's running."
          : "Only available during execute or after a solve — clicking mid-scramble would corrupt the cube's solved reference."}
        disabled={!canMarkSolved}
        onclick={markSolved}>cube is solved</button
      >
      <button class="bt-btn" onclick={() => bluetoothStore.disconnect()}
        >disconnect</button
      >
    {:else if bluetoothStore.status === "connecting"}
      <span class="bt-status">
        <span class="bt-dot bt-dot-pending"></span>connecting…
      </span>
    {:else}
      <button class="bt-btn" onclick={() => bluetoothStore.connect()}
        >connect cube</button
      >
      <button class="bt-btn-link" onclick={forgetCachedCubeMacs}
        >forget MAC</button
      >
      {#if bluetoothStore.errorMessage}
        <span class="bt-error">{bluetoothStore.errorMessage}</span>
      {/if}
    {/if}
  </div>

  <div class="stage-toggle" role="tablist" aria-label="Trainer stage">
    {#each ["oll", "pll"] as const as s (s)}
      <button
        role="tab"
        aria-selected={stage === s}
        class="stage-btn"
        class:active={stage === s}
        onclick={() => setStage(s)}>{s.toUpperCase()}</button
      >
    {/each}
  </div>

  {#if current}
    <div class="scramble-block">
      <ScrambleDisplay scramble={current.scramble} tracker={trackerState} />
      <p class="scramble-hint">
        {#if bluetoothStore.status === "connected"}
          apply this scramble to the cube — recognition starts automatically
        {:else}
          apply this scramble, then press begin
        {/if}
      </p>
    </div>

    <div class="timing">
      {#if phase === "presenting"}
        {#if bluetoothStore.status === "connected"}
          <button class="big-btn secondary" onclick={skipCase}>skip</button>
        {:else}
          <button class="big-btn primary" onclick={startRecognition}
            >begin</button
          >
          <button class="big-btn secondary" onclick={skipCase}>skip</button>
        {/if}
      {:else if phase === "recognizing"}
        <div class="phase-label">recognize</div>
        <div class="live-time">{formatMs(liveMs)}</div>
        <div class="phase-hint">turn the cube to start execution</div>
      {:else if phase === "executing"}
        <div class="phase-label">execute</div>
        <div class="live-time">{formatMs(liveMs)}</div>
        <div class="phase-hint">
          {formatMs(recognitionMs ?? 0)} recognize · esc to DNF
        </div>
      {:else if phase === "done"}
        {#if lastWasDnf}
          <div class="dnf-badge">DNF</div>
        {/if}
        <div class="result-grid">
          <div class="result-cell">
            <div class="result-label">case</div>
            <div class="result-value">
              <a
                href="{base}/cfop/{stage}/{current.caseId}"
                target="_blank"
                rel="noopener">{current.caseName}</a
              >
            </div>
          </div>
          <div class="result-cell">
            <div class="result-label">recognize</div>
            <div class="result-value">{formatMs(recognitionMs ?? 0)}</div>
          </div>
          <div class="result-cell">
            <div class="result-label">execute</div>
            <div class="result-value">{formatMs(executionMs ?? 0)}</div>
          </div>
          <div class="result-cell">
            <div class="result-label">total</div>
            <div class="result-value">
              {formatMs((recognitionMs ?? 0) + (executionMs ?? 0))}
            </div>
          </div>
        </div>
        <button class="big-btn primary" onclick={loadCase}>next case</button>
      {/if}
    </div>
  {/if}

  <section class="case-stats">
    <div class="case-stats-head">
      <h2>case stats</h2>
      <span class="case-stats-meta">
        {totalAttempts}
        {stage.toUpperCase()} attempts recorded
      </span>
    </div>
    <table>
      <thead>
        <tr>
          <th>case</th>
          <th class="num">attempts</th>
          <th class="num">median recognize</th>
          <th class="num">median execute</th>
        </tr>
      </thead>
      <tbody>
        {#each cases as c (c.id)}
          {@const s = trainerStore.statsFor(stage, c.id)}
          <tr class:current={current?.caseId === c.id}>
            <td>
              <a
                href="{base}/cfop/{stage}/{c.id}"
                target="_blank"
                rel="noopener">{c.name}</a
              >
            </td>
            <td class="num">{s.attempts || "—"}</td>
            <td class="num">
              {s.medianRecognitionMs === null
                ? "—"
                : formatMs(s.medianRecognitionMs)}
            </td>
            <td class="num">
              {s.medianExecutionMs === null
                ? "—"
                : formatMs(s.medianExecutionMs)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</section>

<style>
  .trainer-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .head h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }

  .bt-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    font-size: 13px;
  }
  .bt-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
  }
  .bt-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-unlearned);
  }
  .bt-dot-on {
    background: var(--color-learned);
  }
  .bt-dot-pending {
    background: var(--color-learning);
  }
  .bt-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .bt-btn:hover {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .bt-btn-link {
    font: inherit;
    font-size: 11px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .bt-note {
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .bt-error {
    color: var(--color-danger);
    font-size: 12px;
  }

  .stage-toggle {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    align-self: flex-start;
  }
  .stage-btn {
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
    background: var(--color-surface);
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .stage-btn + .stage-btn {
    border-left: 1px solid var(--color-border);
  }
  .stage-btn:hover {
    color: var(--color-text);
  }
  .stage-btn.active {
    background: var(--color-surface-2);
    color: var(--color-text);
  }

  .scramble-block {
    text-align: center;
    padding: 20px 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }
  .scramble-hint {
    margin: 8px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .timing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }
  .big-btn {
    font: inherit;
    font-size: 16px;
    padding: 10px 24px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    cursor: pointer;
    min-width: 180px;
  }
  .big-btn.primary {
    background: var(--color-text);
    color: var(--color-surface);
    border-color: var(--color-text);
  }
  .big-btn.primary:disabled {
    background: var(--color-text-muted);
    border-color: var(--color-text-muted);
    cursor: not-allowed;
  }
  .big-btn.secondary {
    background: var(--color-surface);
    color: var(--color-text-muted);
  }
  .big-btn.secondary:hover {
    color: var(--color-text);
  }
  .phase-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .live-time {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 56px;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1;
  }
  .phase-hint {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .dnf-badge {
    color: var(--color-danger);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .result-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(80px, 1fr));
    gap: 16px;
    width: 100%;
    max-width: 520px;
  }
  .result-cell {
    text-align: center;
  }
  .result-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }
  .result-value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 600;
  }
  .result-value a {
    color: inherit;
    font-family: var(--font-sans);
    font-weight: 500;
  }
  .result-value a:hover {
    color: var(--color-link);
    text-decoration: underline;
  }

  .case-stats {
    margin-top: 12px;
  }
  .case-stats-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .case-stats-head h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .case-stats-meta {
    color: var(--color-text-muted);
    font-size: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-border);
  }
  th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    font-weight: 500;
  }
  th.num,
  td.num {
    text-align: right;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  tbody tr.current {
    background: var(--color-surface-2);
  }
  td a {
    color: var(--color-text);
  }
  td a:hover {
    color: var(--color-link);
    text-decoration: underline;
  }
</style>

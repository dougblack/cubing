<script lang="ts">
  import {
    collapseDoubleTurns,
    isComplete,
    type MoveEvent,
    newTrackerState,
    next3x3Scramble,
    remainingMoves,
    type ScrambleMove,
    tickTracker,
    type TrackerState,
  } from "@cubing/core";
  import { bluetoothStore, forgetCachedCubeMacs } from "$lib/bluetooth.svelte";
  import OrientationPicker from "$lib/OrientationPicker.svelte";
  import SessionStats from "$lib/SessionStats.svelte";
  import SessionSwitcher from "$lib/SessionSwitcher.svelte";
  import SolveList from "$lib/SolveList.svelte";
  import Timer from "$lib/Timer.svelte";
  import { timerStore } from "$lib/timer-store.svelte";

  type TimerApi = {
    stop: (endTimeOverride?: number) => void;
    isSolving: () => boolean;
    isInspecting: () => boolean;
    startInspection: () => void;
    startSolvingNow: () => void;
  };

  let currentScramble = $state<string | null>(null);
  let nextScramble = $state<string | null>(null);
  let timerRef = $state<TimerApi | undefined>();
  let debugLogEl = $state<HTMLPreElement | undefined>();
  /** Debug log defaults to collapsed — it's a developer/troubleshooting
   *  aid, not part of the normal cubing flow. State persists across reloads
   *  so anyone actively debugging doesn't have to re-open it each time. */
  let debugOpen = $state(false);
  $effect(() => {
    debugOpen = window.localStorage.getItem("cubing_debug_open") === "1";
  });
  function toggleDebug() {
    debugOpen = !debugOpen;
    window.localStorage.setItem("cubing_debug_open", debugOpen ? "1" : "0");
  }

  /** Live scramble tracker — non-null only when BT is connected and we have
   *  a scramble loaded. Each cube move during the scrambling phase
   *  advances it (or triggers a regen on a wrong move). */
  let trackerState = $state<TrackerState | null>(null);

  /** Set after a wrong move while we wait to see whether the user undoes it
   *  (inverse of `wrongMove`) or commits to the regenerated scramble. Holds
   *  the snapshot needed to revert. */
  let pendingUndo = $state<{
    previousScramble: string;
    previousTracker: TrackerState;
    wrongMove: string;
  } | null>(null);

  /** True while the async scramble fetch following a wrong move is in flight.
   *  Distinguishes "tracker is the OLD one, can't tick yet" from "tracker is
   *  the NEW one and ready to tick." */
  let regenPending = $state(false);

  /** Set when a user undoes the wrong move during the async regen window —
   *  signals the regen's continuation to discard its result. */
  let regenCancelled = false;

  /** Per-solve buffers. */
  let recordedMoves: MoveEvent[] = []; // cube moves during the solving phase
  let appliedMoves: string[] = []; // every cube move applied while scrambling
  let solveStartedAt = 0;

  $effect(() => {
    let cancelled = false;
    next3x3Scramble().then((s) => {
      if (!cancelled) currentScramble = s;
    });
    next3x3Scramble().then((s) => {
      if (!cancelled) nextScramble = s;
    });
    return () => {
      cancelled = true;
    };
  });

  // Initialize / tear down the tracker on BT (dis)connect. Doesn't fire on
  // every currentScramble change — those are handled explicitly so the
  // revert path can install a snapshot tracker without being clobbered.
  $effect(() => {
    if (
      bluetoothStore.status === "connected" &&
      currentScramble &&
      !trackerState
    ) {
      trackerState = newTrackerState(currentScramble);
    } else if (bluetoothStore.status !== "connected" && trackerState) {
      trackerState = null;
    }
  });

  function freshTrackerForCurrent() {
    if (bluetoothStore.status === "connected" && currentScramble) {
      trackerState = newTrackerState(currentScramble);
    }
  }

  function advanceScramble() {
    currentScramble = nextScramble;
    nextScramble = null;
    appliedMoves = [];
    pendingUndo = null;
    freshTrackerForCurrent();
    next3x3Scramble().then((s) => {
      nextScramble = s;
    });
  }

  /** Inverse of a single 90°/180° move. `R` ↔ `R'`, `R2` is its own inverse. */
  function inverseMove(move: string): string {
    if (move.endsWith("'")) return move.slice(0, -1);
    if (move.endsWith("2")) return move;
    return move + "'";
  }

  /** Triggered when the cube does something the tracker didn't expect.
   *  Snapshots the original state into pendingUndo, then fetches a fresh
   *  scramble of the remaining length and swaps it in. The new state is
   *  discarded if the user undoes (does inverse of the wrong move) before
   *  any other cube move. */
  async function handleWrongMove(wrongMove: string) {
    if (!trackerState || !currentScramble) return;
    const length = remainingMoves(trackerState);
    if (length <= 0) {
      timerRef?.startInspection();
      return;
    }
    pendingUndo = {
      previousScramble: currentScramble,
      previousTracker: trackerState,
      wrongMove,
    };
    regenPending = true;
    try {
      const fresh = await next3x3Scramble();
      if (regenCancelled) {
        regenCancelled = false;
        return;
      }
      const tokens = fresh.trim().split(/\s+/).slice(0, length);
      currentScramble = tokens.join(" ");
      trackerState = newTrackerState(currentScramble);
    } finally {
      regenPending = false;
    }
  }

  function handleSolveStart() {
    recordedMoves = [];
    solveStartedAt = performance.now();
  }

  function handleSolve(result: {
    durationMs: number;
    penalty: "none" | "+2" | "DNF";
  }) {
    if (!currentScramble) return;
    // Use the actually-applied moves when we have them (BT scramble
    // tracking), else fall back to the scramble shown on screen (keyboard
    // mode with no BT).
    const scramble =
      appliedMoves.length > 0 ? appliedMoves.join(" ") : currentScramble;
    timerStore.addSolve({
      scramble,
      durationMs: result.durationMs,
      penalty: result.penalty,
      moveStream: recordedMoves.length > 0 ? [...recordedMoves] : undefined,
    });
    recordedMoves = [];
    advanceScramble();
  }

  // BT wiring: subscribe to cube moves + solved events while connected.
  $effect(() => {
    if (bluetoothStore.status !== "connected") return;

    const unsubMove = bluetoothStore.onMove((move) => {
      const api = timerRef;
      if (!api) return;

      // Solving phase: feed into the solve's move stream.
      if (api.isSolving()) {
        recordedMoves.push({
          move,
          tMs: performance.now() - solveStartedAt,
        });
        return;
      }

      // Every cube move outside the solve is part of the scramble that
      // physically reaches the cube — record it so the solve's stored
      // scramble reproduces the actual start state.
      appliedMoves.push(move);

      // Inspection: first cube move kicks off the solve (skipping the
      // keyboard hold-to-arm dance).
      if (api.isInspecting()) {
        api.startSolvingNow();
        return;
      }

      // Idle / stopped: advance the live scramble tracker.
      // First, if a wrong move is pending undo, this is the move that
      // decides between undo and commit.
      if (pendingUndo) {
        if (move === inverseMove(pendingUndo.wrongMove)) {
          // Revert: restore the previous scramble and tracker, discard
          // the in-flight regen.
          currentScramble = pendingUndo.previousScramble;
          trackerState = pendingUndo.previousTracker;
          pendingUndo = null;
          regenCancelled = true;
          return;
        }
        // Commit: clear the undo opportunity. If regen is still pending
        // we can't tick (tracker is the old one); fall through once it
        // lands. If regen is done, the new tracker is active — tick.
        pendingUndo = null;
        if (regenPending) return;
        // Fall through to tick this move against the new tracker.
      }

      if (!trackerState) return;
      const r = tickTracker(trackerState, move);
      trackerState = r.state;
      if (r.result === "wrong") {
        handleWrongMove(move);
      } else if (isComplete(trackerState)) {
        api.startInspection();
      }
    });

    const unsubSolved = bluetoothStore.onSolved((lastMoveAt) => {
      // Backtrack the timer endpoint to the last MOVE event — FACELETS
      // arrives a few hundred ms after the move that solved the cube,
      // so using "now" would overcount.
      timerRef?.stop(lastMoveAt ?? undefined);
    });

    return () => {
      unsubMove();
      unsubSolved();
    };
  });

  const sessionSolves = $derived(timerStore.currentSessionSolves());

  // Auto-scroll the BT debug log to the bottom on new entries.
  $effect(() => {
    void bluetoothStore.debugLog.length;
    if (debugLogEl) debugLogEl.scrollTop = debugLogEl.scrollHeight;
  });

  function moveLabel(step: ScrambleMove): string {
    return (
      step.face +
      (step.quantity === -1 ? "'" : step.quantity === 2 ? "2" : "")
    );
  }
</script>

<svelte:head>
  <title>Timer — cubing</title>
</svelte:head>

<section class="timer-page">
  <div class="orient-row">
    <OrientationPicker />
  </div>
  <p class="scramble" aria-live="polite">
    {#if currentScramble && trackerState}
      {#each trackerState.steps as step, i (i)}
        {@const isDone = i < trackerState.currentIndex}
        {@const isCurrent = i === trackerState.currentIndex}
        {@const isHalf = isCurrent && trackerState.subProgress === 1}
        <span
          class="scramble-token"
          class:done={isDone}
          class:current={isCurrent}
          class:half={isHalf}>{moveLabel(step)}</span
        >{" "}
      {/each}
    {:else}
      {currentScramble ?? "Loading scramble…"}
    {/if}
  </p>
  {#if pendingUndo}
    <p class="scramble-undo-hint" aria-live="polite">
      wrong move — do <code>{inverseMove(pendingUndo.wrongMove)}</code> to undo, or any other move to commit to a new scramble
    </p>
  {/if}

  <Timer
    bind:this={timerRef}
    scramble={currentScramble}
    onSolveStart={handleSolveStart}
    onSolve={handleSolve}
  />

  <div class="bt-bar">
    {#if !bluetoothStore.isAvailable()}
      <span class="bt-note">
        Web Bluetooth isn't supported here — try Chrome, Edge, or Brave.
      </span>
    {:else if bluetoothStore.status === "connected"}
      <span class="bt-status">
        <span class="bt-dot bt-dot-on"></span>
        {bluetoothStore.deviceName ?? "cube"}
        {#if bluetoothStore.batteryPct !== null}
          · <span class="bt-batt">{bluetoothStore.batteryPct}%</span>
        {/if}
      </span>
      <button
        class="bt-btn"
        title="Tell the cube its current physical state is solved. Use when the cube's tracked state has drifted from reality."
        onclick={() => bluetoothStore.resetCubeState()}>cube is solved</button
      >
      <button class="bt-btn" onclick={() => bluetoothStore.disconnect()}
        >disconnect</button
      >
    {:else if bluetoothStore.status === "connecting"}
      <span class="bt-status">
        <span class="bt-dot bt-dot-pending"></span>
        connecting…
      </span>
    {:else}
      <button class="bt-btn" onclick={() => bluetoothStore.connect()}
        >connect cube</button
      >
      <button
        class="bt-btn-link"
        title="Clear cached cube MAC addresses (use if a wrong MAC was entered)"
        onclick={forgetCachedCubeMacs}>forget MAC</button
      >
      {#if bluetoothStore.errorMessage}
        <span class="bt-error">{bluetoothStore.errorMessage}</span>
      {/if}
    {/if}
    {#if bluetoothStore.status === "connected" && bluetoothStore.recentMoves.length > 0}
      <code class="bt-ticker"
        >{collapseDoubleTurns(bluetoothStore.recentMoves).join(" ")}</code
      >
    {/if}
  </div>

  <div class="session-bar">
    <SessionSwitcher />
    <SessionStats solves={sessionSolves} />
  </div>

  <SolveList solves={sessionSolves} />

  <section class="bt-debug" class:closed={!debugOpen}>
    <div class="bt-debug-head">
      <button
        type="button"
        class="bt-debug-toggle"
        aria-expanded={debugOpen}
        onclick={toggleDebug}
      >
        <span class="caret" class:open={debugOpen}>▸</span>
        BT debug log
      </button>
      <span class="bt-debug-meta">
        {bluetoothStore.debugLog.length} entries · GYRO suppressed
      </span>
      <span class="bt-debug-spacer"></span>
      {#if debugOpen}
        <button class="bt-btn-link" onclick={() => bluetoothStore.clearLog()}
          >clear</button
        >
      {/if}
    </div>
    {#if debugOpen}
      <pre class="bt-debug-log" bind:this={debugLogEl}>{bluetoothStore.debugLog.join("\n") || "(no events yet)"}</pre>
    {/if}
  </section>
</section>

<style>
  .timer-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .orient-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: -8px;
  }
  .scramble {
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
  .scramble-undo-hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
  }
  .scramble-undo-hint code {
    font-style: normal;
    color: var(--color-text);
    background: var(--color-learning-bg);
    padding: 1px 5px;
    border-radius: 3px;
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
  .bt-batt {
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
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
    transition:
      background 0.12s ease,
      color 0.12s ease;
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
  .bt-btn-link:hover {
    color: var(--color-text);
  }
  .bt-note {
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .bt-error {
    color: var(--color-danger);
    font-size: 12px;
  }
  .bt-ticker {
    flex: 1 1 0;
    min-width: 0;
    text-align: right;
    color: var(--color-text-muted);
    font-size: 12px;
    word-break: break-word;
  }

  .session-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 12px 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }

  .bt-debug {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    padding: 12px;
  }
  .bt-debug-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
  }
  .bt-debug.closed {
    padding: 8px 12px;
  }
  .bt-debug-toggle {
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--color-text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bt-debug-toggle:hover {
    color: var(--color-link);
  }
  .caret {
    display: inline-block;
    font-size: 10px;
    color: var(--color-text-muted);
    transition: transform 0.12s ease;
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .bt-debug-meta {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .bt-debug-spacer {
    flex: 1 1 0;
  }
  .bt-debug-log {
    margin: 0;
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-text);
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>

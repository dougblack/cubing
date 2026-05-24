<script lang="ts">
  import type { Penalty } from "@cubing/core";
  import { formatMs } from "./format";

  // Phase-1 keyboard timer with WCA-style 15s inspection.
  //
  // Phase machine:
  //   idle       — scramble shown, waiting for first space press
  //   inspecting — 15s countdown running; space-down → holding
  //   holding    — space held during inspection; release < 0.55s cancels,
  //                hold ≥ 0.55s → ready
  //   ready      — green; release → solving starts
  //   solving    — live timer ticking
  //   stopped    — last time shown; brief grace period then space starts next
  //
  // Inspection penalty (WCA): >15s inspection adds +2; >17s is DNF.
  // The 17s threshold also force-stops to a DNF solve if the user never starts.

  type Phase =
    | "idle"
    | "inspecting"
    | "holding"
    | "ready"
    | "solving"
    | "stopped";

  interface Props {
    /** Current scramble shown above the timer; informational, not used by the
     *  phase machine. */
    scramble: string | null;
    /** Called the moment the solve actually starts ticking. Lets the page
     *  reset and start recording per-solve state (e.g. BT move stream). */
    onSolveStart?: () => void;
    /** Called when a solve concludes (either normally or via inspection DNF). */
    onSolve: (result: { durationMs: number; penalty: Penalty }) => void;
  }

  let { scramble, onSolveStart, onSolve }: Props = $props();

  /** Imperative stop, exposed via `bind:this`. External signals — a BT cube
   *  reaching solved state, for example — can call this to end the active
   *  solve as if the spacebar had been pressed. No-op outside the solving
   *  phase, so it's safe to fire opportunistically. */
  export function stop(): void {
    if (phase === "solving") stopSolve();
  }
  export function isSolving(): boolean {
    return phase === "solving";
  }
  export function isInspecting(): boolean {
    return phase === "inspecting" || phase === "holding" || phase === "ready";
  }
  /** External trigger for inspection start. Used when a BT cube finishes
   *  the scramble and the timer should auto-arm. No-op unless we're in a
   *  state where the spacebar would also start inspection (idle or stopped
   *  past the grace window). */
  export function startInspection(): void {
    if (phase === "idle") {
      beginInspection();
    } else if (phase === "stopped") {
      if (performance.now() - stoppedAt < POST_STOP_GRACE_MS) return;
      beginInspection();
    }
  }
  /** External trigger to skip the hold-to-arm dance and start solving now.
   *  Used when the first BT move during inspection should kick off the
   *  solve. No-op outside the inspection family of phases. */
  export function startSolvingNow(): void {
    if (
      phase === "inspecting" ||
      phase === "holding" ||
      phase === "ready"
    ) {
      startSolving();
    }
  }

  const HOLD_MS = 550; // hold required to arm the timer
  const INSPECTION_MS = 15_000;
  const INSPECTION_DNF_MS = 17_000;
  const POST_STOP_GRACE_MS = 500; // ignore accidental space-tap right after stop

  let phase = $state<Phase>("idle");
  let displayMs = $state(0); // solving time or inspection countdown
  let inspectionElapsedMs = $state(0);
  let lastResult = $state<{ durationMs: number; penalty: Penalty } | null>(
    null,
  );

  let inspectionStartedAt = 0;
  let solvingStartedAt = 0;
  let holdStartedAt = 0;
  let stoppedAt = 0;
  let rafId: number | null = null;
  let dnfTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let holdReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function cancelTimers() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (dnfTimeoutId !== null) {
      clearTimeout(dnfTimeoutId);
      dnfTimeoutId = null;
    }
    if (holdReadyTimeoutId !== null) {
      clearTimeout(holdReadyTimeoutId);
      holdReadyTimeoutId = null;
    }
  }

  function tickInspection() {
    inspectionElapsedMs = performance.now() - inspectionStartedAt;
    rafId = requestAnimationFrame(tickInspection);
  }

  function tickSolving() {
    displayMs = performance.now() - solvingStartedAt;
    rafId = requestAnimationFrame(tickSolving);
  }

  function beginInspection() {
    cancelTimers();
    lastResult = null;
    inspectionStartedAt = performance.now();
    inspectionElapsedMs = 0;
    phase = "inspecting";
    tickInspection();
    dnfTimeoutId = setTimeout(() => {
      // Auto-DNF if the user never starts solving by the 17s mark.
      if (
        phase === "inspecting" ||
        phase === "holding" ||
        phase === "ready"
      ) {
        finishWith({ durationMs: 0, penalty: "DNF" });
      }
    }, INSPECTION_DNF_MS);
  }

  function startHolding() {
    holdStartedAt = performance.now();
    phase = "holding";
    holdReadyTimeoutId = setTimeout(() => {
      if (phase === "holding") phase = "ready";
    }, HOLD_MS);
  }

  function cancelHold() {
    if (holdReadyTimeoutId !== null) {
      clearTimeout(holdReadyTimeoutId);
      holdReadyTimeoutId = null;
    }
    phase = "inspecting";
  }

  function startSolving() {
    if (holdReadyTimeoutId !== null) {
      clearTimeout(holdReadyTimeoutId);
      holdReadyTimeoutId = null;
    }
    if (dnfTimeoutId !== null) {
      clearTimeout(dnfTimeoutId);
      dnfTimeoutId = null;
    }
    solvingStartedAt = performance.now();
    displayMs = 0;
    phase = "solving";
    onSolveStart?.();
    tickSolving();
  }

  function stopSolve() {
    const durationMs = performance.now() - solvingStartedAt;
    const inspMs = solvingStartedAt - inspectionStartedAt;
    let penalty: Penalty = "none";
    if (inspMs > INSPECTION_DNF_MS) penalty = "DNF";
    else if (inspMs > INSPECTION_MS) penalty = "+2";
    finishWith({ durationMs, penalty });
  }

  function finishWith(result: { durationMs: number; penalty: Penalty }) {
    cancelTimers();
    lastResult = result;
    displayMs = result.durationMs;
    phase = "stopped";
    stoppedAt = performance.now();
    onSolve(result);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Escape") {
      e.preventDefault();
      if (phase === "solving") {
        // Stop the timer and record a DNF solve.
        const durationMs = performance.now() - solvingStartedAt;
        finishWith({ durationMs, penalty: "DNF" });
      } else if (
        phase === "inspecting" ||
        phase === "holding" ||
        phase === "ready"
      ) {
        // Abort the attempt before solving started — no solve recorded.
        cancelTimers();
        lastResult = null;
        inspectionElapsedMs = 0;
        displayMs = 0;
        phase = "idle";
      }
      return;
    }

    if (e.code !== "Space") return;
    // Always prevent the default scroll behavior, even on auto-repeat — the
    // browser fires keydown for each repeat tick and would scroll on every
    // one. The state machine still only acts on the rising edge (!repeat).
    e.preventDefault();
    // Blur the most-recently-clicked button so the spacebar doesn't
    // re-activate it. Without this, a click on "connect cube" leaves the
    // button focused and subsequent space presses fire its click handler.
    const active = document.activeElement;
    if (active && active !== document.body && "blur" in active) {
      (active as HTMLElement).blur();
    }
    if (e.repeat) return;

    switch (phase) {
      case "idle":
        startInspection();
        break;
      case "inspecting":
        startHolding();
        break;
      case "solving":
        stopSolve();
        break;
      case "stopped":
        if (performance.now() - stoppedAt < POST_STOP_GRACE_MS) return;
        startInspection();
        break;
      case "holding":
      case "ready":
        // Space already held; this should only fire on a fresh press.
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code !== "Space") return;
    e.preventDefault();

    if (phase === "holding") {
      const held = performance.now() - holdStartedAt;
      if (held >= HOLD_MS) startSolving();
      else cancelHold();
    } else if (phase === "ready") {
      startSolving();
    }
  }

  $effect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelTimers();
    };
  });

  // ---- display helpers ----

  function inspectionDisplay(elapsedMs: number): string {
    if (elapsedMs >= INSPECTION_DNF_MS) return "DNF";
    if (elapsedMs >= INSPECTION_MS) return "+2";
    const remaining = Math.ceil((INSPECTION_MS - elapsedMs) / 1000);
    return remaining.toString();
  }

  const bigText = $derived.by(() => {
    switch (phase) {
      case "idle":
        return scramble ? "ready" : "—";
      case "inspecting":
        return inspectionDisplay(inspectionElapsedMs);
      case "holding":
        return inspectionDisplay(inspectionElapsedMs);
      case "ready":
        return "GO";
      case "solving":
        return formatMs(displayMs);
      case "stopped": {
        if (!lastResult) return formatMs(displayMs);
        if (lastResult.penalty === "DNF") return "DNF";
        const base = formatMs(lastResult.durationMs);
        return lastResult.penalty === "+2" ? `${base} (+2)` : base;
      }
    }
  });

  const inspectionWarning = $derived.by(() => {
    if (phase !== "inspecting" && phase !== "holding") return "ok";
    if (inspectionElapsedMs >= INSPECTION_MS) return "dnf";
    if (inspectionElapsedMs >= 12_000) return "danger";
    if (inspectionElapsedMs >= 8_000) return "warn";
    return "ok";
  });

  const hint = $derived.by(() => {
    switch (phase) {
      case "idle":
        return scramble ? "press space to start inspection" : "loading scramble…";
      case "inspecting":
        return "press space when ready to solve";
      case "holding":
        return "keep holding…";
      case "ready":
        return "release space to start";
      case "solving":
        return "press space to stop";
      case "stopped":
        return "press space for next solve";
    }
  });
</script>

<div
  class="timer-shell"
  data-phase={phase}
  data-warning={inspectionWarning}
>
  <div class="timer-display">{bigText}</div>
  <div class="timer-hint">{hint}</div>
</div>

<style>
  .timer-shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 56px 24px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .timer-display {
    font-family: var(--font-mono);
    font-size: 88px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .timer-hint {
    font-size: 13px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Inspection countdown color warnings. */
  .timer-shell[data-warning="warn"] .timer-display {
    color: var(--color-warn);
  }
  .timer-shell[data-warning="danger"] .timer-display,
  .timer-shell[data-warning="dnf"] .timer-display {
    color: var(--color-danger);
  }

  /* Hold-to-arm feedback. */
  .timer-shell[data-phase="holding"] {
    background: var(--color-hold-bg);
  }
  .timer-shell[data-phase="ready"] {
    background: var(--color-ready-bg);
  }
  .timer-shell[data-phase="ready"] .timer-display {
    color: var(--color-learned);
  }

  /* Solving + stopped emphasis. */
  .timer-shell[data-phase="solving"] .timer-display {
    color: var(--color-learned);
  }
</style>

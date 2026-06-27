<script lang="ts">
  import type { Penalty } from "@cubing/core";
  import { beep, cancelSpeech, speak } from "./audio";
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
   *  solve as if the spacebar had been pressed.
   *
   *  When the trigger has a more accurate "end time" than `performance.now()`
   *  (e.g. the timestamp of the last BT MOVE event, which arrives a few
   *  hundred ms before the FACELETS that actually says "solved"), pass it
   *  via `endTimeOverride` so the recorded duration doesn't include BT
   *  protocol + decoder + handler latency. No-op outside the solving phase. */
  export function stop(endTimeOverride?: number): void {
    if (phase === "solving") stopSolve(endTimeOverride);
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

  /** Seconds-remaining values the user has asked us to speak aloud during
   *  inspection. Reset on each inspection start. */
  const SPEAK_AT_REMAINING = new Set([10, 5, 4, 3, 2, 1]);
  let spokenRemaining = new Set<number>();

  function tickInspection() {
    // A stale rAF can fire one frame after we've already transitioned
    // out of inspection (into solving or stopped). Bail before queuing
    // another tick or speaking a stale countdown.
    if (
      phase !== "inspecting" &&
      phase !== "holding" &&
      phase !== "ready"
    ) {
      return;
    }
    inspectionElapsedMs = performance.now() - inspectionStartedAt;
    const remaining = Math.ceil(
      (INSPECTION_MS - inspectionElapsedMs) / 1000,
    );
    if (SPEAK_AT_REMAINING.has(remaining) && !spokenRemaining.has(remaining)) {
      spokenRemaining.add(remaining);
      speak(String(remaining));
    }
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
    spokenRemaining = new Set();
    phase = "inspecting";
    beep(); // inspection-start cue
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
    cancelSpeech(); // kill any queued countdown — solve has started
    beep(); // solve-start cue
    onSolveStart?.();
    tickSolving();
  }

  function stopSolve(endTimeOverride?: number) {
    const endTime = endTimeOverride ?? performance.now();
    // Guard against negative durations if the override is older than the
    // solve start (shouldn't happen in practice, but be defensive).
    const durationMs = Math.max(0, endTime - solvingStartedAt);
    const inspMs = solvingStartedAt - inspectionStartedAt;
    let penalty: Penalty = "none";
    if (inspMs > INSPECTION_DNF_MS) penalty = "DNF";
    else if (inspMs > INSPECTION_MS) penalty = "+2";
    finishWith({ durationMs, penalty });
  }

  function finishWith(result: { durationMs: number; penalty: Penalty }) {
    cancelTimers();
    cancelSpeech(); // auto-DNF during inspection could fire mid-countdown
    lastResult = result;
    displayMs = result.durationMs;
    phase = "stopped";
    stoppedAt = performance.now();
    beep(); // solve-end cue
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

  // The giant readout. Always a time-like value (centisecond format) except
  // during inspection, where it's the integer countdown — so the instrument
  // rests at 0.00, counts the inspection down, then runs the solve live.
  const bigText = $derived.by(() => {
    switch (phase) {
      case "idle":
        return scramble ? formatMs(0) : "—";
      case "inspecting":
        return inspectionDisplay(inspectionElapsedMs);
      case "holding":
        return inspectionDisplay(inspectionElapsedMs);
      case "ready":
        return formatMs(0);
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

  // The instrument's mode tag — a short, authentic cuber's word for the
  // current phase, shown small above the readout and tinted by phase.
  const phaseTag = $derived.by(() => {
    switch (phase) {
      case "idle":
        return scramble ? "ready" : "—";
      case "inspecting":
        return "inspect";
      case "holding":
        return "hold";
      case "ready":
        return "set";
      case "solving":
        return "solve";
      case "stopped":
        return lastResult?.penalty === "DNF" ? "dnf" : "done";
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
  <div class="timer-tag eyebrow">{phaseTag}</div>
  <div class="timer-display">{bigText}</div>
  <div class="timer-hint">{hint}</div>
  <div class="timer-rail" aria-hidden="true">
    <span class="timer-rail-fill"></span>
  </div>
</div>

<style>
  /* The timer as a piece of bench equipment: a calm readout panel with a
   * mode tag up top, the giant centisecond readout, a hint, and a live
   * status rail along the bottom that colors itself to the current phase.
   * `--rail` drives the rail; it shifts per phase/warning below. */
  .timer-shell {
    --rail: var(--accent-timer);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 60px 24px 56px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
    overflow: hidden;
    transition:
      background 0.16s ease,
      border-color 0.16s ease;
  }
  .timer-tag {
    color: var(--rail);
    transition: color 0.16s ease;
  }
  .timer-display {
    font-family: var(--font-mono);
    font-size: clamp(72px, 13vw, 132px);
    line-height: 0.92;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    transition: color 0.12s ease;
  }
  .timer-hint {
    font-size: 12px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  /* Status rail — a hairline track pinned to the bottom edge of the panel.
   * Its fill grows to full width and takes the phase color, so the panel
   * reads as a live instrument even at a glance. */
  .timer-rail {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: var(--color-surface-2);
  }
  .timer-rail-fill {
    display: block;
    height: 100%;
    width: 35%;
    background: var(--rail);
    transition:
      width 0.16s ease,
      background 0.16s ease;
  }

  /* Inspection countdown color warnings — drive both the readout and rail. */
  .timer-shell[data-warning="warn"] {
    --rail: var(--color-warn);
  }
  .timer-shell[data-warning="warn"] .timer-display {
    color: var(--color-warn);
  }
  .timer-shell[data-warning="danger"],
  .timer-shell[data-warning="dnf"] {
    --rail: var(--color-danger);
  }
  .timer-shell[data-warning="danger"] .timer-display,
  .timer-shell[data-warning="dnf"] .timer-display {
    color: var(--color-danger);
  }

  /* Inspection running — rail stretches across as time burns down. */
  .timer-shell[data-phase="inspecting"] .timer-rail-fill,
  .timer-shell[data-phase="holding"] .timer-rail-fill {
    width: 100%;
  }

  /* Hold-to-arm feedback. */
  .timer-shell[data-phase="holding"] {
    background: var(--color-hold-bg);
  }

  /* Armed + solving — the cube-green "go" state, full rail. */
  .timer-shell[data-phase="ready"],
  .timer-shell[data-phase="solving"] {
    --rail: var(--cube-green);
  }
  .timer-shell[data-phase="ready"] {
    background: var(--color-ready-bg);
    border-color: var(--cube-green);
  }
  .timer-shell[data-phase="ready"] .timer-display,
  .timer-shell[data-phase="solving"] .timer-display {
    color: var(--cube-green);
  }
  .timer-shell[data-phase="ready"] .timer-rail-fill,
  .timer-shell[data-phase="solving"] .timer-rail-fill {
    width: 100%;
  }
</style>

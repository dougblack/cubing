<script lang="ts">
  import {
    generateTrainerScramble,
    invertMove,
    isComplete,
    isCaseTrainable,
    newTrackerState,
    type SessionId,
    tickTracker,
    type TrackerState,
    type TrainerStage,
    trainerCases,
  } from "@cubing/core";
  import { untrack } from "svelte";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import { bluetoothStore, forgetCachedCubeMacs } from "$lib/bluetooth.svelte";
  import { formatMs, formatDateTime } from "$lib/format";
  import { orientationPref } from "$lib/orientation-pref.svelte";
  import OrientationPicker from "$lib/OrientationPicker.svelte";
  import ScrambleDisplay from "$lib/ScrambleDisplay.svelte";
  import { cubingState } from "$lib/store.svelte";
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

  interface CaseRec {
    caseId: string;
    caseName: string;
    scramble: string;
  }

  /** Which subset of marked cases to draw from. `both` includes any case
   *  the cuber has flagged in the alg browser; `learning` and `learned`
   *  narrow to a single bucket. Unlearned cases (not yet marked) are
   *  never in the pool — the trainer assumes the cuber has at least
   *  started learning a case before drilling it. */
  type CaseFilter = "learning" | "learned" | "both";
  const FILTER_KEY = "cubing_trainer_filter";
  const CASE_FILTERS: ReadonlyArray<{ id: CaseFilter; label: string }> = [
    { id: "learning", label: "learning" },
    { id: "learned", label: "learned" },
    { id: "both", label: "both" },
  ];

  let stage = $state<TrainerStage>("pll");
  let caseFilter = $state<CaseFilter>("both");
  let phase = $state<Phase>("presenting");
  let current = $state<CaseRec | null>(null);
  /** Pre-generated next case. Set when the current attempt completes
   *  (success or DNF), so the next scramble is already visible in the
   *  done view and the cuber can start applying it immediately —
   *  starting the new scramble is then equivalent to clicking "next
   *  case". Cleared on stage toggle (stale across stages) and on the
   *  transition into the next case. */
  let pendingNext = $state<CaseRec | null>(null);
  let trackerState = $state<TrackerState | null>(null);
  /** Wrong moves made during scrambling, in the order the cuber made
   *  them. While this stack is non-empty the scramble tracker is
   *  frozen — the cuber must undo by playing the inverses (in reverse
   *  order) before the tracker resumes. Once the stack reaches
   *  `MAX_WRONG_MOVES` we give up: further BT moves are ignored and
   *  the cuber has to hit "next case" to start over. */
  let wrongMoves = $state<string[]>([]);
  const MAX_WRONG_MOVES = 5;
  const scrambleAbandoned = $derived(wrongMoves.length >= MAX_WRONG_MOVES);

  let recognitionStartedAt = 0;
  let executionStartedAt = 0;
  let recognitionMs = $state<number | null>(null);
  let executionMs = $state<number | null>(null);
  /** Whether the current attempt was completed cleanly (cube reached
   *  solved state) or DNF'd (escape / abort). Only meaningful in the
   *  `done` phase. */
  let lastWasDnf = $state(false);

  /** Recovery move list shown to the cuber when they've made one or
   *  more wrong moves during scrambling. To undo "R F" the cuber must
   *  play "F' R'" (last wrong move undone first), so we reverse the
   *  stack and invert each entry. */
  const recoveryHint = $derived(
    wrongMoves.length === 0
      ? ""
      : wrongMoves.slice().reverse().map(invertMove).join(" "),
  );

  /** Cases the trainer can actually serve: trainable in the dataset AND
   *  matching the current learning-state filter. The filter narrows by
   *  cubingState (per-case 0=unlearned / 1=learning / 2=learned, set
   *  from the alg-browser pages). Reactive — flips when the user
   *  toggles a case's state in another tab or the filter changes. */
  const eligibleCases = $derived(
    trainerCases(stage).filter((c) => {
      if (!isCaseTrainable(stage, c.id)) return false;
      const s = cubingState.state[c.id]; // 1 = learning, 2 = learned, undefined = unlearned
      if (s === undefined) return false;
      if (caseFilter === "learning") return s === 1;
      if (caseFilter === "learned") return s === 2;
      return true;
    }),
  );

  /** Bag-scheduler tuning: each case appears `BAG_COPIES` times per
   *  cycle, with at least `MIN_SPACING` other cases between any two
   *  copies of the same case. The spacing constraint gets clamped down
   *  for very small pools so a 2-case filter still works. */
  const BAG_COPIES = 3;
  const MIN_SPACING = 2;

  /** Shuffled multi-copy bag of case IDs to drill next. Built so it
   *  feels random without back-to-back clumps: each case has multiple
   *  slots (so the cycle isn't a predictable march through every case
   *  exactly once), and the constraint-aware construction below
   *  forbids a case from re-appearing within MIN_SPACING picks. */
  let caseBag = $state<string[]>([]);

  function refillBag(avoidFirst: string | null): void {
    const totalItems = eligibleCases.length * BAG_COPIES;
    if (totalItems === 0) {
      caseBag = [];
      return;
    }
    // Effective spacing can't exceed pool-size - 1 (with only K
    // distinct cases, K consecutive picks must include a repeat).
    const spacing = Math.max(0, Math.min(MIN_SPACING, eligibleCases.length - 1));
    const remaining = new Map<string, number>();
    for (const c of eligibleCases) remaining.set(c.id, BAG_COPIES);
    // Seed the "recently picked" sliding window with the just-shown
    // case so the new bag doesn't accidentally repeat it back-to-back
    // across the refill boundary.
    const recent: string[] = avoidFirst && spacing > 0 ? [avoidFirst] : [];
    const bag: string[] = [];
    for (let step = 0; step < totalItems; step++) {
      const recentSet = new Set(recent);
      // Pick from cases with the highest remaining count, excluding
      // anything in the spacing window. Highest-count-first keeps the
      // distribution flat throughout the bag — without this, a few
      // cases get exhausted early and the tail of the bag is forced
      // to choose between recent-set cases (spacing violations) or
      // skipping copies (uneven distribution).
      let maxCount = 0;
      for (const [id, count] of remaining) {
        if (count > 0 && !recentSet.has(id) && count > maxCount) {
          maxCount = count;
        }
      }
      const candidates: string[] = [];
      if (maxCount > 0) {
        for (const [id, count] of remaining) {
          if (count === maxCount && !recentSet.has(id)) candidates.push(id);
        }
      } else {
        // Constraint unsatisfiable for this pick — relax. Shouldn't
        // happen with the highest-count-first strategy unless the
        // pool is tiny relative to the spacing constraint.
        for (const [id, count] of remaining) {
          if (count > 0) candidates.push(id);
        }
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
      bag.push(pick);
      remaining.set(pick, remaining.get(pick)! - 1);
      recent.push(pick);
      if (recent.length > spacing) recent.shift();
    }
    caseBag = bag;
  }

  function generateNextCase(): CaseRec | null {
    if (eligibleCases.length === 0) return null;
    // Pop the next id, skipping anything that's become ineligible
    // since the bag was filled (filter changes mid-bag).
    while (caseBag.length > 0) {
      const id = caseBag[0]!;
      caseBag = caseBag.slice(1);
      const found = eligibleCases.find((c) => c.id === id);
      if (found) {
        return {
          caseId: found.id,
          caseName: found.name,
          scramble: generateTrainerScramble(stage, found.id),
        };
      }
    }
    refillBag(current?.caseId ?? null);
    return generateNextCase();
  }

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
    // Consume the pre-generated next case if we have one (the
    // cuber just hit "next case" or started applying its scramble);
    // otherwise generate a fresh one from the eligible pool. May be
    // null if no cases match the current filter — the page renders
    // an empty-state message instead.
    current = pendingNext ?? generateNextCase();
    pendingNext = null;
    phase = "presenting";
    trackerState =
      current && bluetoothStore.status === "connected"
        ? newTrackerState(current.scramble)
        : null;
    recognitionMs = null;
    executionMs = null;
    liveMs = 0;
    lastWasDnf = false;
    wrongMoves = [];
  }

  /** Shared "executing → done" close-out. Records the attempt, stops
   *  the live timer, flips the phase to done with the right DNF flag,
   *  and (by default) pre-generates the next case so its scramble shows
   *  up in the done view. Callers that abandon the attempt without
   *  going through `done` (stage toggle DNF) pass `queueNext: false`.
   *  Returns true iff there was a usable in-flight attempt to record. */
  function finalizeExecuting(opts: {
    dnf: boolean;
    endAt?: number | null;
    queueNext?: boolean;
  }): boolean {
    if (phase !== "executing" || !current || recognitionMs === null) {
      return false;
    }
    const ms = (opts.endAt ?? performance.now()) - executionStartedAt;
    executionMs = ms;
    stopLive();
    phase = "done";
    lastWasDnf = opts.dnf;
    trainerStore.addAttempt({
      caseId: current.caseId,
      stage,
      scramble: current.scramble,
      recognitionMs,
      executionMs: ms,
      correct: !opts.dnf,
    });
    if (opts.queueNext !== false) pendingNext = generateNextCase();
    return true;
  }

  // Note: trainer scrambles are emitted in the simulator's Y-top G-front
  // frame, NOT in WCA W-top frame like the timer's scrambles. They're
  // meant to be interpreted by the cuber relative to their TOP face —
  // "U" turn always means "turn the top face" regardless of color — so
  // they don't need a per-orientation translation pass. (`scrambleForView`
  // assumes a W-top source, so applying it here would land the case on
  // the wrong layer for a Y-top user.) The "scramble in this orientation"
  // toggle only affects timer-page scrambles.

  /** "Cube is solved" — the cuber asserting that the cube's current
   *  physical state is solved, and resyncing BT's solved reference to
   *  it (after a reassembly, a missed solved-transition, or BT drift).
   *  Always available while connected, like the timer's button. What it
   *  does depends on where we are:
   *   - executing: there's live timing, so record it as a clean solve.
   *   - presenting/recognizing: no valid attempt timing exists, so don't
   *     record one — just re-present the case with a fresh scramble so
   *     the cuber starts cleanly from the now-solved cube.
   *   - done: the next scramble is already queued; just resync.
   *  The resetCubeState at the end points BT's reference at the current
   *  state, so this DOES corrupt detection if the cube isn't actually
   *  solved — but the cuber is explicitly asserting that it is. */
  function markSolved() {
    if (phase === "executing") {
      finalizeExecuting({ dnf: false });
    } else if (phase === "presenting" || phase === "recognizing") {
      newScramble();
    }
    if (bluetoothStore.status === "connected") {
      bluetoothStore.resetCubeState();
    }
  }

  /** Abort the current attempt. From `executing`, record a DNF with the
   *  partial times so the attempt shows up in history. From earlier
   *  phases, no useful timing yet — just regenerate. */
  function markDnf() {
    if (finalizeExecuting({ dnf: true })) return;
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

  /** Re-roll the scramble for the SAME case (different setup, same
   *  alg/target). Stays in the presenting phase; resets the tracker and
   *  any wrong-move state. */
  function newScramble() {
    if (!current) return;
    stopLive();
    const scramble = generateTrainerScramble(stage, current.caseId);
    current = { ...current, scramble };
    phase = "presenting";
    trackerState =
      bluetoothStore.status === "connected"
        ? newTrackerState(scramble)
        : null;
    recognitionMs = null;
    executionMs = null;
    liveMs = 0;
    lastWasDnf = false;
    wrongMoves = [];
  }

  /** Record an in-flight executing attempt as DNF before abandoning it.
   *  Shared between stage-toggle and any future "abandon-and-skip" path
   *  — both should preserve the timing data rather than silently dropping
   *  the attempt from stats. The caller is about to reload so we don't
   *  queue a next case. */
  function recordPendingDnf() {
    finalizeExecuting({ dnf: true, queueNext: false });
  }

  function setStage(next: TrainerStage) {
    if (next === stage) return;
    recordPendingDnf();
    // Any pre-generated next case or shuffled bag was for the OLD
    // stage — discard so loadCase below draws fresh from the new
    // stage's pool.
    pendingNext = null;
    caseBag = [];
    stage = next;
    loadCase();
  }

  // Session controls — same shape as the timer's session-switcher.
  function onSessionSelect(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value as SessionId;
    // Cleanest semantics: switching sessions abandons the in-flight
    // attempt as DNF (so it stays attached to the OLD session) and
    // loads a fresh case for the NEW session.
    recordPendingDnf();
    pendingNext = null;
    caseBag = [];
    trainerStore.setCurrentSession(id);
    loadCase();
  }
  function onNewSession() {
    recordPendingDnf();
    pendingNext = null;
    caseBag = [];
    trainerStore.createSession();
    loadCase();
  }
  function onDeleteSession() {
    if (trainerStore.sessions.length <= 1) return;
    const current = trainerStore.sessions.find(
      (s) => s.id === trainerStore.currentSessionId,
    );
    if (!current) return;
    const ok = window.confirm(
      `Delete session ${current.name} and its attempts? This can't be undone.`,
    );
    if (!ok) return;
    pendingNext = null;
    caseBag = [];
    trainerStore.deleteSession(current.id);
    loadCase();
  }
  const currentSession = $derived(
    trainerStore.sessions.find(
      (s) => s.id === trainerStore.currentSessionId,
    ) ?? null,
  );

  function setCaseFilter(next: CaseFilter) {
    if (next === caseFilter) return;
    caseFilter = next;
    if (browser) window.localStorage.setItem(FILTER_KEY, next);
    // The pre-generated next case and the shuffled bag may not match
    // the new filter; drop both. Reload whenever the current case no
    // longer fits the new pool — including when there's no current case
    // at all (the old filter was empty), so switching INTO a populated
    // filter clears the empty-state instead of staying stuck on it.
    pendingNext = null;
    caseBag = [];
    if (!current || !eligibleCases.some((c) => c.id === current?.caseId)) {
      if (current) recordPendingDnf();
      loadCase();
    }
  }

  // Initial case load. `untrack` keeps loadCase's `bluetoothStore.status`
  // read from registering as a dep of this effect — otherwise every BT
  // (dis)connect would regenerate a fresh case mid-attempt.
  $effect(() => {
    if (browser) {
      const stored = window.localStorage.getItem(FILTER_KEY);
      if (stored === "learning" || stored === "learned" || stored === "both") {
        caseFilter = stored;
      }
    }
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

  /** Kociemba facelets slice offsets, keyed by the COLOR at that face's
   *  center. The cube's center colors never move, so the cuber's TOP
   *  face is always at the offset of whatever color they have on top.
   *  W on U, Y on D, G on F, R on R, O on L, B on B. */
  const FACE_OFFSET_BY_TOP_COLOR: Record<string, number> = {
    W: 0,
    R: 9,
    G: 18,
    Y: 27,
    O: 36,
    B: 45,
  };

  function isTopFaceMonochromatic(facelets: string): boolean {
    const offset = FACE_OFFSET_BY_TOP_COLOR[orientationPref.top];
    if (offset === undefined || facelets.length < offset + 9) return false;
    const first = facelets[offset];
    for (let i = offset + 1; i < offset + 9; i++) {
      if (facelets[i] !== first) return false;
    }
    return true;
  }

  /** Scramble-phase tick: tracker advance, wrong-move freeze, recovery
   *  via inverse-stack. Extracted from the BT onMove handler so the
   *  done→presenting auto-advance can dispatch to it explicitly after
   *  loading the next case, instead of relying on a fall-through that
   *  reads loadCase's side effects on `phase` and `trackerState`. */
  function tickPresenting(tickMove: string) {
    if (!trackerState || scrambleAbandoned) return;
    // Wrong-move recovery: the tracker is frozen until the cuber has
    // played the inverse of every wrong move (LIFO). A move that
    // matches the inverse of the most recent wrong move pops it; any
    // other move stacks deeper, capped at MAX_WRONG_MOVES.
    if (wrongMoves.length > 0) {
      const top = wrongMoves[wrongMoves.length - 1]!;
      if (tickMove === invertMove(top)) {
        wrongMoves = wrongMoves.slice(0, -1);
      } else {
        wrongMoves = [...wrongMoves, tickMove];
      }
      return;
    }
    const r = tickTracker(trackerState, tickMove);
    if (r.result === "wrong") {
      // Freeze: don't advance the tracker, record the wrong move so
      // the recovery hint shows the path back.
      wrongMoves = [tickMove];
      return;
    }
    trackerState = r.state;
    if (isComplete(trackerState)) startRecognition();
  }

  // BT wiring: done→presenting auto-advance, scramble tracker (with
  // wrong-move freeze + recovery) during presenting, recognition→
  // execution on the first post-scramble move, execution→done on the
  // top-oriented (OLL) or fully-solved (PLL) transition.
  $effect(() => {
    if (bluetoothStore.status !== "connected") return;
    const unsubMove = bluetoothStore.onMove((move) => {
      // The trainer scramble is interpreted in the cuber's frame
      // ("U" means "turn the top face"), so BT's cube-frame move
      // needs the cube→user remap before any tracker comparison.
      // This translation is unconditional — independent of the
      // timer's `scrambleInUserFrame` toggle.
      const tickMove = orientationPref.displayMove(move);

      // In `done`, the cube is solved and pendingNext is shown. The
      // first BT move IS the cuber starting the next scramble — pull
      // the pre-generated case in (same path as the "next case"
      // button) and then dispatch the move into the new tracker.
      if (phase === "done" && pendingNext) {
        loadCase();
        tickPresenting(tickMove);
        return;
      }

      if (phase === "presenting") {
        tickPresenting(tickMove);
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
      // Fully-solved transition closes a PLL attempt cleanly. For OLL
      // the facelets handler below catches the moment the top face
      // becomes monochromatic, which can be many moves earlier; this
      // is a fallback in case the OLL handler somehow missed it (or
      // the cuber kept going into a full solve).
      if (phase !== "executing") return;
      finalizeExecuting({ dnf: false, endAt: lastMoveAt });
    });
    const unsubFacelets = bluetoothStore.onFacelets((facelets, lastMoveAt) => {
      // OLL completes the moment the cuber's top face is one color —
      // permutation doesn't matter for orientation practice. PLL keeps
      // using the fully-solved signal above.
      if (phase !== "executing" || stage !== "oll") return;
      if (!isTopFaceMonochromatic(facelets)) return;
      finalizeExecuting({ dnf: false, endAt: lastMoveAt });
    });
    return () => {
      unsubMove();
      unsubSolved();
      unsubFacelets();
    };
  });

  // Stats table mirrors the drillable pool: only cases the trainer
  // will actually serve under the current filter. The totals + extremes
  // read off the same grouped CaseStats map that backs each row, so
  // the header sum always matches the table contents (and we avoid a
  // second full walk over `trainerStore.attempts`).
  interface StatsAgg {
    attempts: number;
    dnfs: number;
    /** Best / worst over each timing column for highlighting. Worst is
     *  only highlighted when there are 2+ samples AND best !== worst
     *  (a single case shouldn't be both best and worst). */
    recBest: number | null;
    recWorst: number | null;
    execBest: number | null;
    execWorst: number | null;
    totalBest: number | null;
    totalWorst: number | null;
    /** Count of cases with a non-null sample in each column — used to
     *  gate the worst-cell red-highlight. */
    recCount: number;
    execCount: number;
    totalCount: number;
  }
  const stageStats = $derived.by<StatsAgg>(() => {
    const agg: StatsAgg = {
      attempts: 0,
      dnfs: 0,
      recBest: null,
      recWorst: null,
      execBest: null,
      execWorst: null,
      totalBest: null,
      totalWorst: null,
      recCount: 0,
      execCount: 0,
      totalCount: 0,
    };
    const track = (
      v: number,
      bestKey: "recBest" | "execBest" | "totalBest",
      worstKey: "recWorst" | "execWorst" | "totalWorst",
      countKey: "recCount" | "execCount" | "totalCount",
    ) => {
      agg[countKey]++;
      if (agg[bestKey] === null || v < agg[bestKey]!) agg[bestKey] = v;
      if (agg[worstKey] === null || v > agg[worstKey]!) agg[worstKey] = v;
    };
    for (const c of eligibleCases) {
      const s = trainerStore.statsFor(stage, c.id);
      agg.attempts += s.attempts;
      agg.dnfs += s.dnfs;
      if (s.medianRecognitionMs !== null) {
        track(s.medianRecognitionMs, "recBest", "recWorst", "recCount");
      }
      if (s.medianExecutionMs !== null) {
        track(s.medianExecutionMs, "execBest", "execWorst", "execCount");
      }
      if (s.medianRecognitionMs !== null && s.medianExecutionMs !== null) {
        track(
          s.medianRecognitionMs + s.medianExecutionMs,
          "totalBest",
          "totalWorst",
          "totalCount",
        );
      }
    }
    return agg;
  });
  /** Backwards-compat alias for the markup that just reads totals. */
  const stageTotals = $derived(stageStats);

  function isBest(v: number | null, best: number | null): boolean {
    return v !== null && best !== null && v === best;
  }
  function isWorst(
    v: number | null,
    best: number | null,
    worst: number | null,
    count: number,
  ): boolean {
    return (
      v !== null &&
      worst !== null &&
      v === worst &&
      count >= 2 &&
      best !== worst
    );
  }

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
        class="bt-btn bt-btn-blue"
        title="Tell the cube its current physical state is solved. Records the solve if one's in progress, otherwise resyncs and re-presents a fresh scramble."
        onclick={markSolved}>cube is solved</button
      >
      <button
        class="bt-btn bt-btn-red"
        onclick={() => bluetoothStore.disconnect()}>disconnect</button
      >
    {:else if bluetoothStore.status === "connecting"}
      <span class="bt-status">
        <span class="bt-dot bt-dot-pending"></span>connecting…
      </span>
    {:else}
      <button
        class="bt-btn bt-btn-green"
        onclick={() => bluetoothStore.connect()}>connect cube</button
      >
      <button class="bt-btn-link" onclick={forgetCachedCubeMacs}
        >forget MAC</button
      >
      {#if bluetoothStore.errorMessage}
        <span class="bt-error">{bluetoothStore.errorMessage}</span>
      {/if}
    {/if}
  </div>

  <div class="session-bar">
    <select
      class="session-select"
      onchange={onSessionSelect}
      value={trainerStore.currentSessionId ?? ""}
      aria-label="Trainer session"
    >
      {#each trainerStore.sessions as s (s.id)}
        <option value={s.id}>session {s.name}</option>
      {/each}
    </select>
    {#if currentSession}
      <span class="session-started"
        >started {formatDateTime(currentSession.createdAt)}</span
      >
    {/if}
    <span class="spacer"></span>
    <button class="icon-btn" title="New session" onclick={onNewSession}
      >+ new</button
    >
    <button
      class="icon-btn danger"
      title={trainerStore.sessions.length > 1
        ? "Delete this session"
        : "Can't delete the last session"}
      disabled={trainerStore.sessions.length <= 1}
      onclick={onDeleteSession}>delete</button
    >
  </div>

  <div class="toggles">
    <div class="stage-toggle" role="tablist" aria-label="Trainer stage">
      {#each ["oll", "pll"] as const as s (s)}
        <button
          role="tab"
          aria-selected={stage === s}
          class="stage-btn"
          class:active={stage === s}
          style="--accent: var(--stage-{s}); --accent-tint: var(--stage-{s}-tint); --accent-text: var(--stage-{s}-text)"
          onclick={() => setStage(s)}>{s.toUpperCase()}</button
        >
      {/each}
    </div>
    <div
      class="stage-toggle"
      role="tablist"
      aria-label="Filter cases by learning state"
      style="--accent: var(--accent-trainer); --accent-tint: var(--accent-trainer-tint); --accent-text: var(--accent-trainer-text)"
    >
      {#each CASE_FILTERS as f (f.id)}
        <button
          role="tab"
          aria-selected={caseFilter === f.id}
          class="stage-btn"
          class:active={caseFilter === f.id}
          onclick={() => setCaseFilter(f.id)}>{f.label}</button
        >
      {/each}
    </div>
  </div>

  {#if !current}
    <div class="empty-state">
      <p>
        No cases match the <strong>{caseFilter}</strong>
        filter for {stage.toUpperCase()}.
      </p>
      <p>
        Mark cases as <em>learning</em> or <em>learned</em> from the
        <a href="{base}/cfop/{stage}">{stage.toUpperCase()} alg browser</a>
        to start drilling them here.
      </p>
    </div>
  {:else}
    <div class="scramble-block">
      {#if phase === "done" && pendingNext}
        <ScrambleDisplay scramble={pendingNext.scramble} tracker={null} />
        <p class="scramble-hint">
          next scramble — start applying to advance
        </p>
      {:else}
        <div class:abandoned={scrambleAbandoned}>
          <ScrambleDisplay scramble={current.scramble} tracker={trackerState} />
        </div>
        {#if phase === "presenting"}
          <!-- Lightweight scramble controls: small text-arrow actions
               that read as "give me another of these" rather than a big
               call-to-action. "begin" only matters without BT (BT
               auto-starts recognition on the first move). -->
          <div class="scramble-actions">
            {#if bluetoothStore.status !== "connected"}
              <button
                class="scramble-action begin"
                onclick={startRecognition}>▸ begin</button
              >
            {/if}
            <button
              class="scramble-action"
              title="Different scramble for this same case"
              onclick={newScramble}>↻ new scramble</button
            >
            <button
              class="scramble-action next"
              class:emphasized={scrambleAbandoned}
              title="Skip to a different case"
              onclick={skipCase}>next case →</button
            >
          </div>
        {/if}
        {#if scrambleAbandoned}
          <p class="scramble-hint warn" aria-live="polite">
            too many wrong moves — hit <strong>next case</strong> to start over
          </p>
        {:else if wrongMoves.length > 0}
          <p class="scramble-hint warn" aria-live="polite">
            wrong move — do <code>{recoveryHint}</code> to get back on track
          </p>
        {:else if bluetoothStore.status === "connected"}
          <p class="scramble-hint">
            apply this scramble to the cube — recognition starts automatically
          </p>
        {:else}
          <p class="scramble-hint">apply this scramble, then hit begin</p>
        {/if}
      {/if}
    </div>

    {#if phase !== "presenting"}
      <div class="timing">
        {#if phase === "recognizing"}
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
  {/if}

  <section
    class="case-stats"
    style="--accent: var(--stage-{stage}); --accent-tint: var(--stage-{stage}-tint); --accent-text: var(--stage-{stage}-text)"
  >
    <div class="case-stats-head">
      <h2>case stats</h2>
      <span class="case-stats-meta">
        {stageTotals.attempts}
        {stage.toUpperCase()} attempts · {stageTotals.dnfs} DNF
      </span>
    </div>
    <table>
      <thead>
        <tr>
          <th>case</th>
          <th class="num">attempts</th>
          <th class="num">DNF</th>
          <th class="num">median recognize</th>
          <th class="num">median execute</th>
          <th class="num">median total</th>
        </tr>
      </thead>
      <tbody>
        {#each eligibleCases as c (c.id)}
          {@const s = trainerStore.statsFor(stage, c.id)}
          {@const total =
            s.medianRecognitionMs !== null && s.medianExecutionMs !== null
              ? s.medianRecognitionMs + s.medianExecutionMs
              : null}
          <!-- Deliberately NOT marking the current case's row: that would
               reveal which case the active scramble is, spoiling the
               recognition the trainer is meant to drill. -->
          <tr>
            <td>
              <a
                class="case-link"
                href="{base}/cfop/{stage}/{c.id}"
                target="_blank"
                rel="noopener"
              >
                <img
                  class="case-mini"
                  src="{base}/diagrams/cfop/{stage}/{c.id}.svg"
                  alt=""
                  loading="lazy"
                  width="28"
                  height="28"
                />
                <span>{c.name}</span>
              </a>
            </td>
            <td class="num">{s.attempts || "—"}</td>
            <td class="num" class:has-dnf={s.dnfs > 0}>
              {s.dnfs || "—"}
            </td>
            <td
              class="num"
              class:best={isBest(s.medianRecognitionMs, stageStats.recBest)}
              class:worst={isWorst(
                s.medianRecognitionMs,
                stageStats.recBest,
                stageStats.recWorst,
                stageStats.recCount,
              )}
            >
              {s.medianRecognitionMs === null
                ? "—"
                : formatMs(s.medianRecognitionMs)}
            </td>
            <td
              class="num"
              class:best={isBest(s.medianExecutionMs, stageStats.execBest)}
              class:worst={isWorst(
                s.medianExecutionMs,
                stageStats.execBest,
                stageStats.execWorst,
                stageStats.execCount,
              )}
            >
              {s.medianExecutionMs === null
                ? "—"
                : formatMs(s.medianExecutionMs)}
            </td>
            <td
              class="num"
              class:best={isBest(total, stageStats.totalBest)}
              class:worst={isWorst(
                total,
                stageStats.totalBest,
                stageStats.totalWorst,
                stageStats.totalCount,
              )}
            >
              {total === null ? "—" : formatMs(total)}
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
    background: var(--cube-green);
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
    transition:
      background 0.12s ease,
      color 0.12s ease,
      border-color 0.12s ease;
  }
  .bt-btn:hover {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .bt-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  /* Function-colored bt buttons (match the timer page). */
  .bt-btn-green {
    color: var(--cube-green-text);
    border-color: color-mix(in srgb, var(--cube-green) 45%, var(--color-border));
  }
  .bt-btn-green:hover {
    color: var(--cube-green-text);
    background: var(--cube-green-tint);
    border-color: var(--cube-green);
  }
  .bt-btn-blue:not(:disabled) {
    color: var(--cube-blue-text);
    border-color: color-mix(in srgb, var(--cube-blue) 45%, var(--color-border));
  }
  .bt-btn-blue:hover:not(:disabled) {
    color: var(--cube-blue-text);
    background: var(--cube-blue-tint);
    border-color: var(--cube-blue);
  }
  .bt-btn-red:hover:not(:disabled) {
    color: var(--cube-red-text);
    background: var(--cube-red-tint);
    border-color: var(--cube-red);
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

  .session-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    font-size: 13px;
  }
  .session-select {
    font: inherit;
    font-size: 13px;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .session-started {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .spacer {
    flex: 1 1 0;
  }
  .icon-btn {
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
  .icon-btn:hover:not(:disabled) {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .icon-btn.danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
  .toggles {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .stage-toggle {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
    align-self: flex-start;
  }
  .empty-state {
    text-align: center;
    padding: 32px 16px;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-card);
    color: var(--color-text-muted);
    font-size: 14px;
    line-height: 1.6;
  }
  .empty-state p {
    margin: 0 0 6px;
  }
  .empty-state a {
    color: var(--color-link);
  }
  .empty-state strong,
  .empty-state em {
    color: var(--color-text);
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
    background: var(--accent-tint, var(--color-surface-2));
    color: var(--accent-text, var(--color-text));
    font-weight: 600;
    box-shadow: inset 0 -2.5px 0 var(--accent, var(--color-text));
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
  .scramble-hint.warn {
    color: var(--color-warn);
  }
  .scramble-hint.warn code {
    font-family: var(--font-mono);
    color: var(--color-text);
    background: var(--color-learning-bg);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .scramble-hint strong {
    color: var(--color-text);
    font-weight: 600;
  }
  .abandoned {
    opacity: 0.4;
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
  /* The trainer's "go" action — begin / next case — wears cube green. */
  .big-btn.primary {
    background: var(--cube-green);
    color: #fff;
    border-color: var(--cube-green);
    transition:
      filter 0.12s ease,
      box-shadow 0.12s ease;
  }
  .big-btn.primary:hover:not(:disabled) {
    filter: brightness(1.06);
    box-shadow: 0 4px 16px -8px var(--cube-green);
  }
  .big-btn.primary:disabled {
    background: var(--color-text-muted);
    border-color: var(--color-text-muted);
    cursor: not-allowed;
  }
  /* Inline scramble controls — small text-arrow actions under the
   * scramble. They read as "give me another of these", not a CTA. */
  .scramble-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    margin-top: 12px;
  }
  .scramble-action {
    font: inherit;
    font-size: 13px;
    padding: 2px 4px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.12s ease;
  }
  .scramble-action:hover {
    color: var(--color-text);
  }
  /* "begin" is the one real action without BT — give it the go color. */
  .scramble-action.begin {
    color: var(--cube-green-text);
    font-weight: 600;
  }
  .scramble-action.begin:hover {
    color: var(--cube-green);
  }
  /* When the scramble is abandoned, "next case" is the way forward. */
  .scramble-action.emphasized {
    color: var(--cube-green-text);
    font-weight: 600;
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
  /* The whole table belongs to one stage — accent its header rule. */
  thead th {
    border-bottom: 2px solid var(--accent);
  }
  th.num,
  td.num {
    text-align: right;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  td.num.has-dnf {
    color: var(--color-danger);
  }
  td.num.best {
    background: var(--color-best-bg);
    color: var(--color-best-text);
  }
  td.num.worst {
    background: var(--color-worst-bg);
    color: var(--color-worst-text);
  }
  td a {
    color: var(--color-text);
  }
  td a:hover {
    color: var(--accent-text);
    text-decoration: underline;
    text-decoration-color: var(--accent);
  }
  /* Case link carries a miniature of the alg-page diagram so the case
   * is recognizable at a glance, not just by name. */
  .case-link {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }
  .case-mini {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 1px;
  }
</style>

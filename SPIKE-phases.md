# Spike: CFOP phase detection from a BT move stream

## Verdict

**Feasible. Shippable for the timer's per-solve breakdown.** The core
algorithm is small, correct on every test case I tried, and runs in
microseconds per solve. Both a fast streaming variant and a
color-neutral batch variant ship together. The harder follow-up work is
alg identification *within* the detected phases — that's a separate
spike.

## What was built

- `core/src/cube.ts` — 54-sticker 3x3 simulator (ported from
  `tools/render/src/cube.ts`; full alg parser via `cubing/alg`)
- `core/src/phases.ts` — two entry points:
  - `streamPhases(scramble, moveStream)` — greedy, walks the moves
    once with cross-on-D assumed. Cheap. Fits a live "which phase are
    you in right now?" UI.
  - `batchPhases(scramble, moveStream)` — color-neutral. Walks the
    moves once to detect which face the cuber treated as the cross
    (any of U/D/L/R/F/B), then runs detection with predicates rotated
    to that face. Right answer for white-cross, yellow-cross, or
    any-color cubers.
  - Both return `PhaseAnalysis { phases: Phase[]; completed: boolean;
    crossFace: CubeFace }`.
- `core/src/phases.test.ts` — 11 cases covering empty/trivial inputs,
  OLL-only Sune, PLL-only U scramble, incomplete solves, batch
  stream-parity, batch U-cross detection, batch fallback.

71 total tests passing; phase detection runs in ~1ms per solve.

## How the predicates work

All four are pure functions over the 54-sticker state — no piece IDs,
no piece tracking, just sticker color comparisons. The canonical
implementations check against **cross-on-D**:

- **`isCrossSolved_D`** — D-face has cross-color on all 4 edge
  positions (D[1], D[3], D[5], D[7]), AND each side face's
  bottom-center sticker matches its own center.
- **`isF2LSolved_D`** — cross solved AND D-face corners + side
  faces' bottom rows + side faces' middle rows all match their centers.
- **`isOLLSolved_D`** — F2L solved AND all 9 U-face stickers show
  U-color (U-layer may still need to be permuted).
- **`isSolved`** — every face's 9 stickers match its center.

Predicates are layered (`isOLLSolved` calls `isF2LSolved` calls
`isCrossSolved`) so natural ordering is enforced — `ollEnd` can never
fire before `f2lEnd`.

To check a phase relative to a **different cross face**, we rotate the
state first. Each cross face maps to a normalizing rotation that brings
it to the D position:

```
D → ""      (identity)
U → "x2"    (180° around L-R axis)
F → "x"     (F → D)
B → "x'"    (B → D)
L → "z'"    (L → D)
R → "z"     (R → D)
```

`batchPhases` walks all 6 candidates after each move using these
rotations, picks the first one whose cross fires, then re-runs the
detection using that face throughout.

## Behaviors that work correctly

- **Normal CFOP** — stages fire in order at the right move indices.
- **Already-solved stages** — if a scramble doesn't break a stage (e.g.
  `U` only breaks PLL), the pre-check fires and that stage's segment is
  emitted with length 0. Verified by the "PLL-only scramble" test.
- **Sune-like OLL-only scrambles** — cross/F2L pre-done, OLL fires when
  the alg completes, PLL skip detected as zero-length segment.
- **Mid-alg state flicker** — some OLL algs (e.g. `r U R' U' r' F R F'`)
  temporarily break F2L during execution. The algorithm records the
  *first* time each predicate fires, so flicker is harmless.
- **Incomplete solves** — if the user abandons mid-solve, stages that
  never complete are simply absent from the segments array, and
  `completed: false` is returned.
- **Last-layer one-look algs (ZBLL / OLLCP)** — these collapse OLL+PLL
  into a single alg. The algorithm fires both predicates on the alg's
  final move; `ollEnd === pllEnd`, PLL segment has length 0.

## Known limitations

1. **Can't distinguish PLL-skip from ZBLL** — both produce
   `ollEnd === pllEnd`. To tell them apart we'd need to look at
   *which alg* the cuber used during the OLL stage, which requires
   alg matching (different spike).
2. **Stream vs batch tradeoff** — `streamPhases` assumes cross-on-D
   (factory orientation, white-cross cuber). Wrong for yellow-cross
   or color-neutral cubers. Use `batchPhases` for the canonical
   per-solve breakdown; reserve `streamPhases` for any future live
   "current phase" indicator on the timer page where the extra cost
   of 6× predicate evaluation matters.
3. **Wrong-move scrambles** — if the user's scramble in `Solve.scramble`
   doesn't match what was actually applied to the cube (shouldn't happen
   given our `appliedMoves` tracking, but possible if data gets
   corrupted), segmentation will report stages that don't match
   reality. The algorithm has no way to detect this; the inputs need to
   be trustworthy.
4. **No alg identification within stages** — we can say "cross took 8
   moves" but not "the cuber inserted F2L pair 1 with `R U R'`". That
   requires matching sub-sequences against the alg dataset, which is the
   next spike per the plan.
5. **Mid-stage time decomposition** — F2L is actually 4 sub-stages (one
   per pair); we lump them together. A future enhancement could detect
   pair-by-pair insertion (each pair = "first corner+edge that lands in
   its slot during F2L"). Possible but not trivial.

## Cost to ship

The algorithm itself is done. To surface this to the user:

1. **Wire into the timer page** — call `batchPhases(solve.scramble,
   solve.moveStream)` lazily when a solve row is expanded. Already
   have the expansion infrastructure (the "click solve to see
   moveStream" work). Add per-phase rows showing stage name + move
   count + duration + detected cross face. ~30 min.
2. **Compute & display phase stats** — average cross time, average
   F2L, etc. across a session. Aggregation over the phases array.
   ~1-2 hrs.
3. **Aggregate by stage** — "your slowest stage is OLL". Same data,
   different presentation. ~30 min.

Total: ~3 hours from spike → shippable in-timer feature.

## What I'd queue after this

- **Alg identification within OLL/PLL stages** — the harder spike. For
  OLL/PLL, take the moves between `f2lEnd` and `ollEnd` (or between
  `ollEnd` and `pllEnd`), normalize via `cubing/alg`, and match against
  the alg dataset. Most cubers' OLL/PLL execution is recognizable; F2L
  isn't (every cuber's insertions are different). Useful for "you used
  Sune 12 times this session, your average Sune is 1.8s" stats.
- **F2L pair detection** — break the F2L segment into 4 sub-segments.
  More involved (need to track per-slot completion).
- **Recognition time** — time between the previous stage ending and the
  first move of the current stage. Already derivable from segment
  `startIndex`/`endIndex` and the move timestamps.

## How to demo it now

Open the timer with a BT cube connected, do a solve, then in the
browser console:

```js
import("/path/to/core/src/phases.js").then(({ batchPhases }) => {
  const solve = JSON.parse(localStorage.getItem("cubing_solves"))[0];
  const r = batchPhases(solve.scramble, solve.moveStream);
  console.log("cross face:", r.crossFace);
  console.table(r.phases);
});
```

(Until we wire the UI, this is the easiest way to see phase detection
output on real solves.)

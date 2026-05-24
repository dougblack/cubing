import { describe, expect, it } from "vitest";

import { applyAlg, solved } from "./cube.js";
import type { MoveEvent } from "./entities.js";
import { batchPhases, findCrossFaceForColor } from "./phases.js";

/** Build a synthetic move stream with sequential timestamps (1s per move). */
function moves(...notation: string[]): MoveEvent[] {
  return notation.map((move, i) => ({ move, tMs: (i + 1) * 1000 }));
}

describe("batchPhases", () => {
  it("returns no phases for an empty move stream", () => {
    const r = batchPhases("R U R' U'", []);
    expect(r.phases).toEqual([]);
    expect(r.completed).toBe(false);
  });

  it("reports all phases already-complete when the cube starts solved", () => {
    // Cube starts solved; we apply one wrong move. All four pre-check
    // hits fire at -1, so each phase is a zero-length segment at index 0.
    const r = batchPhases("", moves("R"));
    expect(r.phases.map((p) => [p.stage, p.endIndex])).toEqual([
      ["cross", 0],
      ["f2l", 0],
      ["oll", 0],
      ["pll", 0],
    ]);
    expect(r.completed).toBe(true);
  });

  it("one-move scramble + one-move solve ends in solved state", () => {
    // `R` scramble + `R'` solve trivially restores. batchPhases will
    // pick whichever face's cross was already intact post-scramble (L
    // here — R-turn doesn't touch L) as the cross face. Other phases
    // complete on the single solve move.
    const r = batchPhases("R", moves("R'"));
    expect(r.completed).toBe(true);
    expect(r.phases.length).toBe(4);
  });

  it("PLL-only scramble: cross/F2L/OLL pre-done, PLL eats the whole solve", () => {
    const r = batchPhases("U", moves("U'"));
    expect(r.completed).toBe(true);
    const stages = r.phases.map((p) => [p.stage, p.startIndex, p.endIndex]);
    expect(stages).toEqual([
      ["cross", 0, 0],
      ["f2l", 0, 0],
      ["oll", 0, 0],
      ["pll", 0, 1],
    ]);
  });

  it("OLL+PLL scramble (Sune): cross/F2L pre-done, OLL eats the solve, PLL skip", () => {
    const sune = "R U R' U R U2 R'";
    const inv = "R U2' R' U' R U' R'";
    const r = batchPhases(sune, moves(...inv.split(/\s+/)));
    expect(r.completed).toBe(true);
    const stages = r.phases.map((p) => [p.stage, p.startIndex, p.endIndex]);
    expect(stages).toEqual([
      ["cross", 0, 0],
      ["f2l", 0, 0],
      ["oll", 0, 7],
      ["pll", 7, 7],
    ]);
  });

  it("incomplete solve reports completed = false", () => {
    const r = batchPhases("R U R' U' R U R' U'", moves("F"));
    expect(r.completed).toBe(false);
  });

  it("detects U as cross when only U-cross is intact at start", () => {
    // Scramble "D" leaves U-layer untouched (U-cross intact) but rotates
    // D-layer corners + side-bottom stickers (D-cross broken). Pre-check
    // should pick U.
    const r = batchPhases("D", moves("D'"));
    expect(r.crossFace).toBe("U");
    expect(r.completed).toBe(true);
  });

  it("falls back to D when no cross ever completes", () => {
    const r = batchPhases("R U R' U' R U R' U'", moves("F"));
    expect(r.crossFace).toBe("D");
    expect(r.completed).toBe(false);
  });
});

describe("findCrossFaceForColor", () => {
  it("finds the W cross at D on a solved cube", () => {
    expect(findCrossFaceForColor(solved(), "W")).toBe("D");
  });

  it("finds the W cross at U after the cube is flipped (x2)", () => {
    // Simulates the frame-mismatch case: cuber holds Y on top, so the
    // cross color (W) lives on the cuber's bottom, but in the sim's
    // tracking it ends up on the U position. The detector must find it
    // there even though the U-center is Y, not W.
    const state = applyAlg(solved(), "x2");
    expect(findCrossFaceForColor(state, "W")).toBe("U");
  });

  it("returns null when no face has 4 cross-color edges", () => {
    // A single R turn breaks the cross on every face.
    const state = applyAlg(solved(), "R");
    expect(findCrossFaceForColor(state, "W")).toBeNull();
  });

  it("doesn't require the face's center color to match", () => {
    // Manually set up an "8 W stickers + Y center on U" state — this is
    // what a Y-top cuber's end-of-F2L state looks like in the sim after
    // applying cube-frame moves. The detector should still pick U.
    const state = solved();
    // Replace U-face (slots 0..8) with all W except slot 4 (center).
    for (let i = 0; i < 9; i++) {
      if (i !== 4) state[i] = "W";
    }
    expect(findCrossFaceForColor(state, "W")).toBe("U");
  });
});

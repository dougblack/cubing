import { describe, expect, it } from "vitest";

import type { MoveEvent } from "./entities.js";
import { batchPhases, streamPhases } from "./phases.js";

/** Build a synthetic move stream with sequential timestamps (1s per move). */
function moves(...notation: string[]): MoveEvent[] {
  return notation.map((move, i) => ({ move, tMs: (i + 1) * 1000 }));
}

describe("streamPhases", () => {
  it("returns no phases for an empty move stream", () => {
    const r = streamPhases("R U R' U'", []);
    expect(r.phases).toEqual([]);
    expect(r.completed).toBe(false);
    expect(r.crossFace).toBe("D");
  });

  it("reports all phases already-complete when the cube starts solved", () => {
    // Cube starts solved; we apply one wrong move. All four pre-check
    // hits fire at -1, so each phase is a zero-length segment at index 0.
    const r = streamPhases("", moves("R"));
    expect(r.phases.map((p) => [p.stage, p.endIndex])).toEqual([
      ["cross", 0],
      ["f2l", 0],
      ["oll", 0],
      ["pll", 0],
    ]);
    expect(r.completed).toBe(true);
  });

  it("one-move scramble + one-move solve: all phases complete at the same move", () => {
    const r = streamPhases("R", moves("R'"));
    expect(r.completed).toBe(true);
    const map = Object.fromEntries(r.phases.map((p) => [p.stage, p]));
    expect(map["cross"]?.endIndex).toBe(1);
    expect(map["f2l"]?.endIndex).toBe(1);
    expect(map["oll"]?.endIndex).toBe(1);
    expect(map["pll"]?.endIndex).toBe(1);
  });

  it("PLL-only scramble: cross/F2L/OLL pre-done, PLL eats the whole solve", () => {
    const r = streamPhases("U", moves("U'"));
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
    const r = streamPhases(sune, moves(...inv.split(/\s+/)));
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
    const r = streamPhases("R U R' U' R U R' U'", moves("F"));
    expect(r.completed).toBe(false);
  });
});

describe("batchPhases", () => {
  it("matches streamPhases output on standard white-cross scenarios", () => {
    const sune = "R U R' U R U2 R'";
    const inv = "R U2' R' U' R U' R'";
    const m = moves(...inv.split(/\s+/));
    const sr = streamPhases(sune, m);
    const br = batchPhases(sune, m);
    expect(br.crossFace).toBe(sr.crossFace); // both "D"
    expect(br.phases).toEqual(sr.phases);
    expect(br.completed).toBe(sr.completed);
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

  it("crossFace is returned on the analysis", () => {
    const r = batchPhases("", []);
    // Empty moves with solved start — every cross is technically
    // already solved, so we pick whatever iterates first; the field
    // is always set.
    expect(typeof r.crossFace).toBe("string");
  });
});

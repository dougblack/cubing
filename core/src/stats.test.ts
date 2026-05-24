import { describe, expect, it } from "vitest";

import type { Penalty, SessionId, Solve, SolveId } from "./entities.js";
import { averageOfN, bestSingleMs, effectiveMs } from "./stats.js";

function mkSolve(durationMs: number, penalty: Penalty = "none"): Solve {
  return {
    id: crypto.randomUUID() as SolveId,
    sessionId: "session" as SessionId,
    startedAt: 0,
    durationMs,
    scramble: "",
    penalty,
  };
}

describe("effectiveMs", () => {
  it("returns raw ms for normal solves", () => {
    expect(effectiveMs(mkSolve(12_340))).toBe(12_340);
  });

  it("adds 2000ms for +2 penalty", () => {
    expect(effectiveMs(mkSolve(12_340, "+2"))).toBe(14_340);
  });

  it("returns 'DNF' for DNF penalty", () => {
    expect(effectiveMs(mkSolve(12_340, "DNF"))).toBe("DNF");
  });
});

describe("averageOfN", () => {
  it("returns null when there are fewer than n solves", () => {
    expect(averageOfN([mkSolve(10_000)], 5)).toBeNull();
    expect(averageOfN([], 5)).toBeNull();
  });

  it("trims best and worst over 5 normal solves", () => {
    // newest-first: 12, 14, 13, 15, 11 → drop 15 (worst), 11 (best),
    // average 12+14+13 = 13.00s.
    const solves = [12_000, 14_000, 13_000, 15_000, 11_000].map((ms) =>
      mkSolve(ms),
    );
    expect(averageOfN(solves, 5)).toBe(13_000);
  });

  it("uses only the most recent n solves", () => {
    // Solves beyond the window are ignored. 6th solve (a fast 5s) shouldn't
    // pull the average down.
    const solves = [12_000, 14_000, 13_000, 15_000, 11_000, 5_000].map((ms) =>
      mkSolve(ms),
    );
    expect(averageOfN(solves, 5)).toBe(13_000);
  });

  it("treats a single DNF as the worst-of-N and drops it", () => {
    // newest-first: DNF, 14, 13, 15, 11 → DNF dropped as worst, 11 as best,
    // average 14+13+15 = 14.00s.
    const solves: Solve[] = [
      mkSolve(0, "DNF"),
      mkSolve(14_000),
      mkSolve(13_000),
      mkSolve(15_000),
      mkSolve(11_000),
    ];
    expect(averageOfN(solves, 5)).toBe(14_000);
  });

  it("returns 'DNF' when 2+ solves in window are DNF", () => {
    const solves: Solve[] = [
      mkSolve(0, "DNF"),
      mkSolve(0, "DNF"),
      mkSolve(13_000),
      mkSolve(15_000),
      mkSolve(11_000),
    ];
    expect(averageOfN(solves, 5)).toBe("DNF");
  });

  it("includes +2 penalties in the trimmed mean", () => {
    // newest-first: 12, 14, 13, 15+2=17, 11 → drop 17 (worst), 11 (best),
    // average 12+14+13 = 13.00s.
    const solves: Solve[] = [
      mkSolve(12_000),
      mkSolve(14_000),
      mkSolve(13_000),
      mkSolve(15_000, "+2"),
      mkSolve(11_000),
    ];
    expect(averageOfN(solves, 5)).toBe(13_000);
  });

  it("supports ao12", () => {
    // 12 solves all at 10s → average is 10s (trimmed mean of 10 identical).
    const solves = Array.from({ length: 12 }, () => mkSolve(10_000));
    expect(averageOfN(solves, 12)).toBe(10_000);
  });

  it("throws for n < 3", () => {
    expect(() => averageOfN([mkSolve(1)], 2)).toThrow();
  });
});

describe("bestSingleMs", () => {
  it("returns null for an empty list", () => {
    expect(bestSingleMs([])).toBeNull();
  });

  it("returns the minimum effective time", () => {
    const solves = [12_000, 14_000, 11_000, 13_000].map((ms) => mkSolve(ms));
    expect(bestSingleMs(solves)).toBe(11_000);
  });

  it("ignores DNF solves", () => {
    const solves: Solve[] = [
      mkSolve(0, "DNF"),
      mkSolve(11_000),
      mkSolve(14_000),
    ];
    expect(bestSingleMs(solves)).toBe(11_000);
  });

  it("returns 'DNF' when every solve is a DNF", () => {
    const solves: Solve[] = [mkSolve(0, "DNF"), mkSolve(0, "DNF")];
    expect(bestSingleMs(solves)).toBe("DNF");
  });

  it("includes +2 in the comparison", () => {
    // 10s+2=12s vs 11s → best is 11s.
    const solves: Solve[] = [mkSolve(10_000, "+2"), mkSolve(11_000)];
    expect(bestSingleMs(solves)).toBe(11_000);
  });
});

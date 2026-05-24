import { describe, expect, it } from "vitest";

import {
  collapseDoubleTurns,
  isComplete,
  newTrackerState,
  parseScramble,
  remainingMoves,
  tickTracker,
} from "./scramble-tracker.js";

describe("parseScramble", () => {
  it("parses a typical scramble", () => {
    expect(parseScramble("R U R' U' R2 D L F2")).toEqual([
      { face: "R", quantity: 1 },
      { face: "U", quantity: 1 },
      { face: "R", quantity: -1 },
      { face: "U", quantity: -1 },
      { face: "R", quantity: 2 },
      { face: "D", quantity: 1 },
      { face: "L", quantity: 1 },
      { face: "F", quantity: 2 },
    ]);
  });

  it("collapses extra whitespace", () => {
    expect(parseScramble("R   U\tR'")).toEqual([
      { face: "R", quantity: 1 },
      { face: "U", quantity: 1 },
      { face: "R", quantity: -1 },
    ]);
  });

  it("ignores unrecognised tokens (no wide / slice / rotation in WCA scrambles)", () => {
    expect(parseScramble("R r M y")).toEqual([{ face: "R", quantity: 1 }]);
  });

  it("returns empty for empty input", () => {
    expect(parseScramble("")).toEqual([]);
    expect(parseScramble("   ")).toEqual([]);
  });
});

describe("tickTracker — single moves", () => {
  it("advances on matching CW turn", () => {
    const s = newTrackerState("R U");
    const { state, result } = tickTracker(s, "R");
    expect(result).toBe("advance");
    expect(state.currentIndex).toBe(1);
  });

  it("advances on matching CCW turn", () => {
    const s = newTrackerState("R' U");
    expect(tickTracker(s, "R'").result).toBe("advance");
  });

  it("rejects wrong direction (R when expecting R')", () => {
    const s = newTrackerState("R' U");
    expect(tickTracker(s, "R").result).toBe("wrong");
  });

  it("rejects wrong face", () => {
    const s = newTrackerState("R U");
    expect(tickTracker(s, "U").result).toBe("wrong");
  });

  it("becomes complete after the last step", () => {
    let s = newTrackerState("R U");
    s = tickTracker(s, "R").state;
    expect(isComplete(s)).toBe(false);
    s = tickTracker(s, "U").state;
    expect(isComplete(s)).toBe(true);
    expect(remainingMoves(s)).toBe(0);
  });
});

describe("tickTracker — double moves (R2)", () => {
  it("stays on R2 after first CW turn, then advances on second CW", () => {
    let s = newTrackerState("R2 U");
    let r = tickTracker(s, "R");
    expect(r.result).toBe("stay");
    expect(r.state.subProgress).toBe(1);
    expect(r.state.subDirection).toBe(1);
    expect(r.state.currentIndex).toBe(0);

    s = r.state;
    r = tickTracker(s, "R");
    expect(r.result).toBe("advance");
    expect(r.state.currentIndex).toBe(1);
    expect(r.state.subProgress).toBe(0);
    expect(r.state.subDirection).toBeNull();
  });

  it("stays on R2 after first CCW turn, then advances on second CCW", () => {
    let s = newTrackerState("R2 U");
    s = tickTracker(s, "R'").state;
    expect(s.subDirection).toBe(-1);
    const r = tickTracker(s, "R'");
    expect(r.result).toBe("advance");
  });

  it("rejects R followed by R' (would net to identity, not R2)", () => {
    let s = newTrackerState("R2 U");
    s = tickTracker(s, "R").state;
    expect(tickTracker(s, "R'").result).toBe("wrong");
  });

  it("rejects a wrong face during R2", () => {
    const s = newTrackerState("R2 U");
    expect(tickTracker(s, "U").result).toBe("wrong");
  });
});

describe("tickTracker — multi-step scrambles", () => {
  it("walks the full sequence", () => {
    let s = newTrackerState("R U R' U'");
    const moves = ["R", "U", "R'", "U'"];
    for (let i = 0; i < moves.length; i++) {
      const r = tickTracker(s, moves[i]!);
      expect(r.result).toBe("advance");
      expect(r.state.currentIndex).toBe(i + 1);
      s = r.state;
    }
    expect(isComplete(s)).toBe(true);
  });

  it("any input after completion is reported as wrong", () => {
    let s = newTrackerState("R");
    s = tickTracker(s, "R").state;
    expect(isComplete(s)).toBe(true);
    expect(tickTracker(s, "U").result).toBe("wrong");
  });

  it("wrong move halfway through leaves state unchanged so the caller can regenerate from here", () => {
    let s = newTrackerState("R U R' U'");
    s = tickTracker(s, "R").state; // index 1
    const r = tickTracker(s, "F"); // wrong, expecting U
    expect(r.result).toBe("wrong");
    expect(r.state).toBe(s); // unchanged
    expect(remainingMoves(s)).toBe(3);
  });
});

describe("collapseDoubleTurns", () => {
  it("collapses two same-direction quarter turns into a half", () => {
    expect(collapseDoubleTurns(["F", "F"])).toEqual(["F2"]);
    expect(collapseDoubleTurns(["R'", "R'"])).toEqual(["R2"]);
    expect(collapseDoubleTurns(["U", "U"])).toEqual(["U2"]);
  });

  it("leaves opposite-direction pairs alone (they cancel, but we preserve the events)", () => {
    expect(collapseDoubleTurns(["R", "R'"])).toEqual(["R", "R'"]);
  });

  it("leaves mixed faces alone", () => {
    expect(collapseDoubleTurns(["R", "U", "R", "U"])).toEqual([
      "R",
      "U",
      "R",
      "U",
    ]);
  });

  it("does not chain — three in a row collapses the first pair only", () => {
    expect(collapseDoubleTurns(["R", "R", "R"])).toEqual(["R2", "R"]);
  });

  it("does not merge into existing half turns", () => {
    expect(collapseDoubleTurns(["R2", "R"])).toEqual(["R2", "R"]);
    expect(collapseDoubleTurns(["R", "R2"])).toEqual(["R", "R2"]);
  });

  it("collapses across a realistic sequence", () => {
    expect(
      collapseDoubleTurns(["R", "U", "R'", "U'", "F", "F", "L'", "L'"]),
    ).toEqual(["R", "U", "R'", "U'", "F2", "L2"]);
  });

  it("returns an empty array for empty input", () => {
    expect(collapseDoubleTurns([])).toEqual([]);
  });
});

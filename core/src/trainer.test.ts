import { describe, expect, it } from "vitest";

import { caseScramble } from "./trainer.js";

describe("caseScramble", () => {
  it("returns the inverse alg when AUF is disabled", () => {
    // T-perm classic: R U R' U' R' F R2 U' R' U' R U R' F'
    // cubing/alg's canonical form adds an apostrophe to inverted half-turns
    // (R2' is mathematically equal to R2 but printed with the prime).
    const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    expect(caseScramble(tPerm, { auf: "none" })).toBe(
      "F R U' R' U R U R2' F' R U R U' R'",
    );
  });

  it("inverts a simple sune", () => {
    expect(caseScramble("R U R' U R U2 R'", { auf: "none" })).toBe(
      "R U2' R' U' R U' R'",
    );
  });

  it("prepends the AUF chosen by the seeded random source", () => {
    // AUF_OPTIONS = ["", "U", "U2", "U'"]; random=0.5 → index 2 → "U2".
    const sune = "R U R' U R U2 R'";
    expect(caseScramble(sune, { auf: "random", random: () => 0.5 })).toBe(
      "U2 R U2' R' U' R U' R'",
    );
  });

  it("yields the same scramble when random selects the empty AUF", () => {
    const sune = "R U R' U R U2 R'";
    // random=0 → index 0 → "" (no AUF prefix)
    expect(caseScramble(sune, { auf: "random", random: () => 0 })).toBe(
      "R U2' R' U' R U' R'",
    );
  });

});

import { describe, expect, it } from "vitest";

import { type AlgRoster, matchAlgExact } from "./alg-match.js";

const ROSTER: AlgRoster[] = [
  {
    caseId: "t-perm",
    algorithms: [
      "R U R' U' R' F R2 U' R' U' R U R' F'",
      "x R2 D2 R U R' D2 R U' R x'",
    ],
  },
  {
    caseId: "sune",
    algorithms: ["R U R' U R U2 R'"],
  },
];

describe("matchAlgExact", () => {
  it("matches an alg present in the roster", () => {
    expect(matchAlgExact("R U R' U R U2 R'", ROSTER)).toEqual({
      caseId: "sune",
      algIndex: 0,
    });
  });

  it("matches against later entries in a case's alg list", () => {
    expect(
      matchAlgExact("x R2 D2 R U R' D2 R U' R x'", ROSTER),
    ).toEqual({ caseId: "t-perm", algIndex: 1 });
  });

  it("normalizes whitespace and notation before comparing", () => {
    // Extra whitespace; cubing/alg's canonical serialization should collapse it.
    expect(matchAlgExact("R  U   R' U R U2  R'", ROSTER)).toEqual({
      caseId: "sune",
      algIndex: 0,
    });
  });

  it("returns null when no alg matches", () => {
    expect(matchAlgExact("F R U R' U' F'", ROSTER)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchAlgExact("", ROSTER)).toBeNull();
  });
});

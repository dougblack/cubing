import { describe, expect, it } from "vitest";

import { applyAlg, invertAlg, normalizeYellowOnTop, solved } from "./cube.js";
import { recognizeOLL, recognizePLL } from "./recognition.js";

/** Build the state a known case presents: start from solved, apply
 *  inverse(alg), normalize so yellow is on top. Identical to what the
 *  recognition module does internally — round-tripping verifies that
 *  the pattern table is keyed correctly. */
function caseState(alg: string) {
  return normalizeYellowOnTop(applyAlg(solved(), invertAlg(alg)));
}

describe("recognizeOLL", () => {
  it("identifies the Sune (OLL 27)", () => {
    // The Sune algorithm is `R U R' U R U2 R'`. Inverse applied to a
    // solved cube produces the Sune OLL pattern.
    const state = caseState("R U R' U R U2 R'");
    const r = recognizeOLL(state);
    expect(r).not.toBeNull();
    expect(r?.id).toBe("oll-27");
  });

  it("identifies the Anti-Sune (OLL 26)", () => {
    const state = caseState("R U2 R' U' R U' R'");
    const r = recognizeOLL(state);
    expect(r).not.toBeNull();
    expect(r?.id).toBe("oll-26");
  });

  it("identifies the H OLL (OLL 21)", () => {
    const state = caseState("R U R' U R U' R' U R U2 R'");
    const r = recognizeOLL(state);
    expect(r).not.toBeNull();
    expect(r?.id).toBe("oll-21");
  });

  it("recognizes a case under any AUF rotation", () => {
    // Apply Sune-setup + a U turn. The case is still Sune; only the
    // AUF orientation differs.
    let state = caseState("R U R' U R U2 R'");
    state = applyAlg(state, "U");
    expect(recognizeOLL(state)?.id).toBe("oll-27");
    state = applyAlg(state, "U");
    expect(recognizeOLL(state)?.id).toBe("oll-27");
    state = applyAlg(state, "U");
    expect(recognizeOLL(state)?.id).toBe("oll-27");
  });

  it("returns null for a fully solved cube (OLL skip)", () => {
    expect(recognizeOLL(solved())).toBeNull();
  });
});

describe("recognizePLL", () => {
  it("identifies the T-perm", () => {
    const state = caseState("R U R' U' R' F R2 U' R' U' R U R' F'");
    const r = recognizePLL(state);
    expect(r).not.toBeNull();
    expect(r?.id).toBe("t-perm");
  });

  it("identifies the H-perm", () => {
    const state = caseState("M2 U M2 U2 M2 U M2");
    const r = recognizePLL(state);
    expect(r).not.toBeNull();
    expect(r?.id).toBe("h-perm");
  });

  it("recognizes a PLL under AUF rotation", () => {
    let state = caseState("R U R' U' R' F R2 U' R' U' R U R' F'");
    state = applyAlg(state, "U");
    expect(recognizePLL(state)?.id).toBe("t-perm");
    state = applyAlg(state, "U2");
    expect(recognizePLL(state)?.id).toBe("t-perm");
  });

  it("returns null for a solved cube (PLL skip)", () => {
    expect(recognizePLL(solved())).toBeNull();
  });
});

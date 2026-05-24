import { describe, expect, it } from "vitest";

import { applyAlg, invertAlg, normalizeYellowOnTop, solved } from "./cube.js";
import { normalizeToCrossOnD } from "./phases.js";
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

describe("recognition — orientation independence", () => {
  // The cuber's "last layer" can land on any of 6 faces in the simulator
  // depending on how they hold the cube and how their BT cube reports
  // moves. Recognition must work after the caller normalizes the state
  // to cross-on-D via `normalizeToCrossOnD`.

  const SUNE = "R U R' U R U2 R'";
  const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

  // To set up a "cross-on-X" state we apply the rotation that brings the
  // cube's original D-contents up to face X. That's the INVERSE of
  // NORMALIZE_ROTATION's "X → D" mapping. The pairs below cover all 6.
  const SETUPS: Array<["D" | "U" | "F" | "B" | "L" | "R", string]> = [
    ["D", ""],
    ["U", "x2"],
    ["F", "x"], // x sends D-contents to F position
    ["B", "x'"], // x' sends D-contents to B position
    ["L", "z"], // z sends D-contents to L position
    ["R", "z'"], // z' sends D-contents to R position
  ];

  it("recognizes Sune (OLL 27) across every cross-face orientation", () => {
    for (const [face, rot] of SETUPS) {
      let state = caseState(SUNE);
      if (rot) state = applyAlg(state, rot);
      const normalized = normalizeToCrossOnD(state, face);
      expect(recognizeOLL(normalized)?.id, `cross face ${face}`).toBe("oll-27");
    }
  });

  it("recognizes T-perm across every cross-face orientation", () => {
    // The PLL encoding is color-independent (face-letter relative to
    // current side centers), so all 6 cross-face setups should resolve.
    for (const [face, rot] of SETUPS) {
      let state = caseState(T_PERM);
      if (rot) state = applyAlg(state, rot);
      const normalized = normalizeToCrossOnD(state, face);
      expect(recognizePLL(normalized)?.id, `cross face ${face}`).toBe(
        "t-perm",
      );
    }
  });

  it("recognizes T-perm under every whole-cube y rotation", () => {
    // y rotations (cube held with a different color in front) shift both
    // side stickers and side centers — they produce a different encoded
    // string than AUFs. This test would have failed before the map was
    // extended to include y-rotation variants.
    for (const y of ["", "y", "y2", "y'"]) {
      let state = caseState(T_PERM);
      if (y) state = applyAlg(state, y);
      expect(recognizePLL(state)?.id, `y rotation "${y}"`).toBe("t-perm");
    }
  });

  it("recognizes several distinct PLLs under arbitrary y rotation", () => {
    // Pick a handful of PLLs with different shapes/symmetries and
    // verify each is recognized under every y rotation.
    const cases: Array<[string, string]> = [
      ["t-perm", "R U R' U' R' F R2 U' R' U' R U R' F'"],
      ["y-perm", "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
      ["h-perm", "M2 U M2 U2 M2 U M2"],
      ["ua-perm", "M2 U M' U2 M U M2"],
    ];
    for (const [id, alg] of cases) {
      for (const y of ["", "y", "y2", "y'"]) {
        let state = caseState(alg);
        if (y) state = applyAlg(state, y);
        expect(recognizePLL(state)?.id, `${id} under y="${y}"`).toBe(id);
      }
    }
  });
});

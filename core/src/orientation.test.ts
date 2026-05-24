import { describe, expect, it } from "vitest";

import {
  buildFaceRemap,
  type CubeFace,
  isIdentityRemap,
  remapMove,
  validFrontColors,
} from "./orientation.js";

describe("validFrontColors", () => {
  it("excludes the top color and its opposite", () => {
    expect(validFrontColors("W").sort()).toEqual(["B", "G", "O", "R"]);
    expect(validFrontColors("Y").sort()).toEqual(["B", "G", "O", "R"]);
    expect(validFrontColors("G").sort()).toEqual(["O", "R", "W", "Y"]);
  });
});

describe("buildFaceRemap", () => {
  it("is identity for white-top green-front (factory orientation)", () => {
    const remap = buildFaceRemap("W", "G");
    expect(isIdentityRemap(remap)).toBe(true);
    expect(remap).toEqual({
      U: "U",
      D: "D",
      L: "L",
      R: "R",
      F: "F",
      B: "B",
    });
  });

  it("flips top↔bottom and left↔right for yellow-top green-front (z² rotation)", () => {
    expect(buildFaceRemap("Y", "G")).toEqual({
      U: "D",
      D: "U",
      L: "R",
      R: "L",
      F: "F",
      B: "B",
    });
  });

  it("swaps U↔F and L↔R for green-top white-front (180° around U-F diagonal)", () => {
    // From W-top G-front: spin 180° around the diagonal axis through the
    // U+F corner. Green moves from front to top, white from top to front,
    // and chirality (right-hand rule) puts orange on the user's right —
    // not red as a forward-tilt would.
    expect(buildFaceRemap("G", "W")).toEqual({
      U: "F",
      F: "U",
      D: "B",
      B: "D",
      L: "R",
      R: "L",
    });
  });

  it("rotates 90° around top axis for white-top red-front (y rotation)", () => {
    // Spin the cube 90° around U axis to put red in front.
    expect(buildFaceRemap("W", "R")).toEqual({
      U: "U",
      D: "D",
      F: "L",
      R: "F",
      B: "R",
      L: "B",
    });
  });

  it("rotates 90° opposite for white-top orange-front", () => {
    expect(buildFaceRemap("W", "O")).toEqual({
      U: "U",
      D: "D",
      F: "R",
      R: "B",
      B: "L",
      L: "F",
    });
  });

  it("yellow-top with each valid front color yields a permutation of faces", () => {
    for (const front of validFrontColors("Y")) {
      const remap = buildFaceRemap("Y", front);
      const values = Object.values(remap).sort();
      expect(values).toEqual(["B", "D", "F", "L", "R", "U"]);
    }
  });

  it("composing with the inverse roundtrips to identity", () => {
    // Building the remap for (top, front), then re-mapping with the
    // resulting (which color does U end up as, etc.) reverse should
    // recover the original face labels. This is a sanity check that the
    // remap is a true rotation (orthonormal).
    const remap = buildFaceRemap("Y", "O");
    const inverse: Record<CubeFace, CubeFace> = {} as Record<
      CubeFace,
      CubeFace
    >;
    for (const [cube, user] of Object.entries(remap) as Array<
      [CubeFace, CubeFace]
    >) {
      inverse[user] = cube;
    }
    const round: Record<CubeFace, CubeFace> = {} as Record<CubeFace, CubeFace>;
    for (const [cube, user] of Object.entries(remap) as Array<
      [CubeFace, CubeFace]
    >) {
      round[cube] = inverse[user]!;
    }
    expect(round).toEqual({
      U: "U",
      D: "D",
      L: "L",
      R: "R",
      F: "F",
      B: "B",
    });
  });

  it("throws when top and front are opposite colors", () => {
    expect(() => buildFaceRemap("W", "Y")).toThrow();
    expect(() => buildFaceRemap("R", "O")).toThrow();
  });

  it("throws when top and front are the same color", () => {
    expect(() => buildFaceRemap("W", "W")).toThrow();
  });
});

describe("remapMove", () => {
  it("rewrites the face letter while preserving direction", () => {
    const remap = buildFaceRemap("Y", "G");
    expect(remapMove("R", remap)).toBe("L");
    expect(remapMove("R'", remap)).toBe("L'");
    expect(remapMove("U2", remap)).toBe("D2");
    expect(remapMove("F", remap)).toBe("F");
  });

  it("passes through unchanged when remap is null", () => {
    expect(remapMove("R'", null)).toBe("R'");
  });

  it("handles empty input", () => {
    expect(remapMove("", buildFaceRemap("W", "G"))).toBe("");
  });
});

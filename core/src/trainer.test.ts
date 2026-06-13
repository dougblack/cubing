import { describe, expect, it } from "vitest";

import { applyAlg, solved } from "./cube.js";
import { findCrossFaceForColor, normalizeToCrossOnD } from "./phases.js";
import { recognizeOLL, recognizePLL } from "./recognition.js";
import {
  generateTrainerScramble,
  isCaseTrainable,
  pickRandomCase,
  trainableCases,
  trainerCases,
  type TrainerStage,
} from "./trainer.js";

/** Verify that each generated scramble, applied to a solved cube,
 *  produces a state that the recognizer identifies as the target case.
 *  Run many iterations per case to cover the y / AUF / alg-choice
 *  combinatorics that the generator samples from. */
function expectScrambleProducesCase(
  stage: TrainerStage,
  caseId: string,
  iterations: number,
) {
  for (let i = 0; i < iterations; i++) {
    const scramble = generateTrainerScramble(stage, caseId);
    const state = applyAlg(solved(), scramble);
    // Some dataset algs include wide moves or whole-cube rotations, so
    // the cross color may not still be on D after the scramble. Find
    // the actual cross face and normalize to it, mirroring the real
    // recognition pipeline.
    const crossFace = findCrossFaceForColor(state, "W");
    expect(
      crossFace,
      `${stage} case ${caseId} scramble "${scramble}" lost the cross`,
    ).not.toBeNull();
    const normalized = normalizeToCrossOnD(state, crossFace!);
    const recognized =
      stage === "oll"
        ? recognizeOLL(normalized)
        : recognizePLL(normalized);
    expect(
      recognized?.id,
      `${stage} case ${caseId} produced scramble "${scramble}" → recognized as ${recognized?.id ?? "null"}`,
    ).toBe(caseId);
  }
}

describe("generateTrainerScramble", () => {
  it("produces every trainable OLL case it claims to", () => {
    for (const c of trainableCases("oll")) {
      expectScrambleProducesCase("oll", c.id, 6);
    }
  });

  it("produces every trainable PLL case it claims to", () => {
    for (const c of trainableCases("pll")) {
      expectScrambleProducesCase("pll", c.id, 6);
    }
  });

  it("covers the majority of OLL and all of PLL", () => {
    // PLL must be 100% trainable in Phase 1 — drop in coverage would
    // indicate a regression in the alg pool / validation pipeline.
    const pllTotal = trainerCases("pll").length;
    const pllValid = trainableCases("pll").length;
    expect(pllValid).toBe(pllTotal);
    // Some OLL cases use only M-slice algs (e.g. "r' R2 U R' U r U2 r'
    // U M'"); those can't be normalized to face-turn-only scrambles in
    // Phase 1. Anything under 80% trainable suggests something broke.
    const ollTotal = trainerCases("oll").length;
    const ollValid = trainableCases("oll").length;
    expect(ollValid / ollTotal).toBeGreaterThan(0.8);
  });

  it("varies across calls for the same case", () => {
    // Generate 30 scrambles for a multi-alg case and assert we see at
    // least a handful of distinct strings — guards against the random
    // sources collapsing to a single output.
    const out = new Set<string>();
    for (let i = 0; i < 30; i++) {
      out.add(generateTrainerScramble("pll", "t-perm"));
    }
    expect(out.size).toBeGreaterThan(3);
  });

  it("throws on unknown case ids", () => {
    expect(() => generateTrainerScramble("oll", "oll-does-not-exist")).toThrow();
  });

  it("reports trainability per case", () => {
    expect(isCaseTrainable("pll", "t-perm")).toBe(true);
    expect(isCaseTrainable("oll", "oll-does-not-exist")).toBe(false);
  });
});

describe("pickRandomCase", () => {
  it("returns a real case from the requested stage", () => {
    const seenOll = new Set<string>();
    const seenPll = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seenOll.add(pickRandomCase("oll").id);
      seenPll.add(pickRandomCase("pll").id);
    }
    // With 100 samples and 21 PLLs / 57 OLLs, we expect broad coverage;
    // the goal is just to confirm we're not always returning the same id.
    expect(seenPll.size).toBeGreaterThan(5);
    expect(seenOll.size).toBeGreaterThan(10);
  });
});

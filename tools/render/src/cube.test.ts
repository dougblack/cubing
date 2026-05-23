// Self-test: apply known algorithms and verify expected sticker values.
//
// References cross-checked against the canonical Reid order and the JPerm
// algorithm reference (jperm.net/algs/oll, jperm.net/algs/pll).

import { applyAlg, invertAlg, solved } from "./cube.js";

interface Expectation {
  /** Label for the test. */ name: string;
  /** Algorithm to apply (from solved). */ alg: string;
  /** Expected U face after applying, row-major. Use "?" to skip a slot. */
  expectU: string;
}

// "?" wildcard means "don't care for this test" — useful when only some U slots
// matter to disambiguate the case.
const TESTS: Expectation[] = [
  // R alone: U right column all become G (F's right column rotates to U's right column).
  { name: "R", alg: "R", expectU: "YYGYYGYYG" },
  // L alone: U left column all become B (B's right column rotates to U's left column).
  { name: "L", alg: "L", expectU: "BYYBYYBYY" },
  // F alone: U bottom row all become O (L's right column rotates to U's bottom row).
  { name: "F", alg: "F", expectU: "YYYYYYOOO" },
  // B alone: U top row all become R.
  { name: "B", alg: "B", expectU: "RRRYYYYYY" },
  // U alone: rotates the entire U face; sticker values unchanged.
  { name: "U", alg: "U", expectU: "YYYYYYYYY" },
  // Sune solves Sune. Setup = inverse(Sune) = R U2 R' U' R U' R'.
  // Sune state has 1 corner oriented (1 yellow corner sticker), all 4 edges
  // oriented (4 yellow edges), center yellow. Total 6 yellow on U face.
  // The unoriented FL corner shows yellow on its L-face sticker; UFR shows
  // yellow on F; UBR shows yellow on R. The oriented corner (DFL in this
  // setup convention) — actually let me just check the *count* of yellow.
  { name: "Sune setup (inv of R U R' U R U2 R')", alg: "R U2 R' U' R U' R'", expectU: "??????Y??" }, // 6 Y total
];

function countYellow(stateUFace: string): number {
  return [...stateUFace].filter((c) => c === "Y").length;
}

function getU(state: ReturnType<typeof solved>): string {
  return state.slice(0, 9).join("");
}

function check(actual: string, expected: string): { ok: boolean; reason: string } {
  if (actual.length !== expected.length) {
    return { ok: false, reason: `length ${actual.length} != ${expected.length}` };
  }
  for (let i = 0; i < actual.length; i++) {
    if (expected[i] !== "?" && actual[i] !== expected[i]) {
      return { ok: false, reason: `slot ${i}: got '${actual[i]}', want '${expected[i]}'` };
    }
  }
  return { ok: true, reason: "" };
}

let failed = 0;
for (const t of TESTS) {
  const state = applyAlg(solved(), t.alg);
  const u = getU(state);
  const r = check(u, t.expectU);
  const yellowCount = countYellow(u);
  if (r.ok) {
    console.log(`PASS ${t.name}: U=${u} (Y count=${yellowCount})`);
  } else {
    console.log(`FAIL ${t.name}: U=${u} (Y count=${yellowCount}) — ${r.reason}`);
    failed++;
  }
}

// Special test for Sune: expect exactly 6 yellow on U.
{
  const state = applyAlg(solved(), "R U2 R' U' R U' R'");
  const u = getU(state);
  const yc = countYellow(u);
  if (yc === 6) {
    console.log(`PASS Sune state has 6 Y on U: U=${u}`);
  } else {
    console.log(`FAIL Sune state Y count: got ${yc}, want 6 — U=${u}`);
    failed++;
  }
}

// Invert round-trip: applying alg then inverse(alg) returns to solved.
{
  const algs = ["R U R' U' F R U R' U' F' R U R' U' F R U R' U' F'", "R U R' U R U2 R'", "M2 U M2 U2 M2 U M2"];
  for (const alg of algs) {
    const after = applyAlg(applyAlg(solved(), alg), invertAlg(alg));
    const isSolved = after.every((c, i) => c === solved()[i]);
    if (isSolved) {
      console.log(`PASS round-trip ${alg}`);
    } else {
      console.log(`FAIL round-trip ${alg}`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");

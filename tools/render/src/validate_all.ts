import { applyAlg, invertAlg, normalizeYellowOnTop, solved } from "./cube.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "/Users/doug/code/cubing/data/methods/cfop";
const stages = ["pll", "oll", "2loll"] as const;

function isClean(moves: string): boolean {
  const tokens = moves.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (/^[urflbd]/.test(t)) return false;
    if (/^[URFLBD]w/.test(t)) return false;
    if (/^[MES]/.test(t)) return false;
    if (/^[xyz]/.test(t)) return false;
  }
  return true;
}

for (const stage of stages) {
  const raw = await readFile(join(ROOT, `${stage}.json`), "utf8");
  const data = JSON.parse(raw) as { cases: { id: string; algorithms: { moves: string }[] }[] };
  let bad = 0;
  let usedNonClean = 0;
  const issues: string[] = [];
  for (const c of data.cases) {
    const algs = c.algorithms;
    const chosen = algs.find((a) => isClean(a.moves)) ?? algs[0]!;
    if (!isClean(chosen.moves)) {
      usedNonClean++;
      issues.push(`  ${c.id}: NO clean alg available; using "${chosen.moves}"`);
    }
    const state = normalizeYellowOnTop(applyAlg(solved(), invertAlg(chosen.moves)));
    const yCount = state.slice(0, 9).filter((x) => x === "Y").length;
    if (stage === "pll" && yCount !== 9) {
      bad++;
      issues.push(`  ${c.id}: U has ${yCount}/9 yellow, alg "${chosen.moves}"`);
    }
    if ((stage === "oll" || stage === "2loll") && yCount === 0) {
      bad++;
      issues.push(`  ${c.id}: U has 0/9 yellow (suspicious), alg "${chosen.moves}"`);
    }
  }
  for (const i of issues) console.log(i);
  console.log(`${stage}: ${data.cases.length} cases, ${bad} invalid${usedNonClean ? `, ${usedNonClean} fell back to non-clean alg` : ""}`);
}

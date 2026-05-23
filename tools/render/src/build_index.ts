// Generate a static HTML index so the user can eyeball every diagram in a browser.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = "/Users/doug/code/cubing";
const STAGES = [
  { method: "cfop", stage: "pll", title: "PLL — Permutation of the Last Layer" },
  { method: "cfop", stage: "oll", title: "OLL — Orientation of the Last Layer" },
  { method: "cfop", stage: "2loll", title: "2-Look OLL" },
];

interface Case {
  id: string;
  name: string;
  aliases?: string[];
  number?: number;
  group?: string;
  algorithms: { moves: string; popularity?: string; popularity_rank?: number }[];
}

const sections: string[] = [];
for (const { method, stage, title } of STAGES) {
  const raw = await readFile(join(REPO_ROOT, "data", "methods", method, `${stage}.json`), "utf8");
  const data = JSON.parse(raw) as { cases: Case[] };
  const cards = data.cases
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    .map((c) => {
      const primary = c.algorithms[0]?.moves ?? "(no alg)";
      const aliases = c.aliases?.length ? `<div class="aliases">${c.aliases.join(" · ")}</div>` : "";
      return `<div class="card">
  <img src="../../../diagrams/${method}/${stage}/${c.id}.svg" alt="${c.name}"/>
  <div class="title">${c.name}${c.number ? ` (#${c.number})` : ""}</div>
  ${aliases}
  <code>${primary}</code>
  <div class="meta">${c.algorithms.length} alg${c.algorithms.length === 1 ? "" : "s"}${c.group ? ` · ${c.group}` : ""}</div>
</div>`;
    })
    .join("\n");
  sections.push(`<section><h2>${title} (${data.cases.length} cases)</h2><div class="grid">${cards}</div></section>`);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>cubing — CFOP algorithm index</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 24px; background: #fafafa; }
  h1 { margin-bottom: 4px; }
  h2 { margin-top: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .card { background: white; padding: 12px; border: 1px solid #e0e0e0; border-radius: 6px; }
  .card img { display: block; width: 100%; height: auto; }
  .title { font-weight: 600; margin-top: 8px; }
  .aliases { font-size: 11px; color: #888; margin-top: 2px; }
  code { display: block; font-size: 11px; color: #333; word-break: break-all; margin-top: 6px; padding: 4px 6px; background: #f0f0f0; border-radius: 3px; }
  .meta { font-size: 11px; color: #888; margin-top: 6px; }
</style>
</head>
<body>
<h1>CFOP algorithm repository</h1>
<p>${88} pre-rendered diagrams across PLL, OLL, and 2-Look OLL.</p>
${sections.join("\n")}
</body>
</html>
`;

const outDir = join(REPO_ROOT, "tools", "render", "preview");
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "index.html"), html);
console.log(`wrote ${join(outDir, "index.html")}`);

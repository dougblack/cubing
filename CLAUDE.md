# cubing — project context for Claude

A data-first repository of speedcubing algorithms with cube-state SVG diagrams. Built so any UI (this repo's static site, a future mobile app, etc.) can consume the same JSON. Currently CFOP only; the structure is method-agnostic.

## Repo layout

```
data/
  schema/algorithm.schema.json    JSON Schema for stage files (referenced via $schema)
  methods/cfop/                   Canonical dataset
    pll.json    21 cases
    oll.json    57 cases
    2loll.json  10 cases (hand-curated; no upstream merge)
    f2l.json    41 cases
  sources/                        Raw + parsed external snapshots (3.2 MB)
    algdb/algdb.json              Vivaldo-Roque scrape of dead algdb.net
    jperm/{oll,pll}.js            Raw JS; parsed/{oll,pll}.json
    speedcubedb/{oll,pll,f2l}.html  Raw HTML; parsed/<stage>.json
diagrams/cfop/<stage>/<case-id>.svg   Pre-rendered, committed (88 files)
site/                             Built static site — gitignored
tools/
  scrape/
    fetch_sources.py              Pull raw upstream files
    parse_jperm.py                JS → parsed/*.json
    parse_speedcubedb.py          HTML → parsed/*.json
    import_algdb.py               Rebuild data/methods/cfop/{pll,oll,f2l}.json from algdb
  normalize/
    validate.py                   Schema check + duplicate-id check
    merge_sources.py              Enrich data/methods/cfop with jperm + scdb metadata
  render/ (Node + cubing.js)      Custom 3x3 sim + SVG renderer
    src/cube.ts                   Simulator
    src/svg.ts                    Last-layer SVG with PLL cycle arrows
    src/render.ts                 Batch renderer
    src/cube.test.ts              Self-tests; run with `npx tsx src/cube.test.ts`
  build_site/                     Jinja2 → static HTML
```

## Data flow (full rebuild)

```sh
uv run python tools/scrape/fetch_sources.py        # → data/sources/*/<raw>
uv run python tools/scrape/parse_jperm.py          # → data/sources/jperm/parsed/
uv run python tools/scrape/parse_speedcubedb.py    # → data/sources/speedcubedb/parsed/
uv run python tools/scrape/import_algdb.py         # → data/methods/cfop/{pll,oll,f2l}.json (overwrites)
uv run python tools/normalize/merge_sources.py     # in-place enrichment
uv run python tools/normalize/validate.py          # sanity check
cd tools/render && npx tsx src/render.ts           # → diagrams/cfop/<stage>/*.svg
uv run python tools/build_site/build.py            # → site/
```

The importer overwrites the algdb-derived stage files (PLL/OLL/F2L). 2LOLL is hand-edited and never touched. The merger then layers JPerm and SCDB fields back in. If you re-run `import_algdb.py`, you must re-run the merger to restore enrichment.

## Schema invariants

Every stage file conforms to `data/schema/algorithm.schema.json`:

- `cases[]` ordered by `number` (1..N where defined).
- Each case's `algorithms[]` is sorted **most popular first**. Position 0 is marked `popularity: "primary"`.
- Algorithm strings use WCA Singmaster notation. Both ASCII apostrophes and grouping parens `(...)` are allowed but visual-only.
- Enrichment fields added by the merger:
  - Case-level: `jperm_group`, `probability_weight`
  - Algorithm-level: `community_votes`, `jperm_recommended`, `scdb_standard`
- 2LOLL skips the merge (no upstream counterpart).

## Diagram renderer gotchas

- Renders **only** PLL, OLL, 2LOLL. F2L is skipped — last-layer view doesn't apply.
- Color modes: `oll` (yellow for oriented stickers, gray otherwise) and `pll` (real side-sticker colors + cycle arrows).
- Uses official Rubik's brand-derived colors: green `#009E60`, blue `#0051BA`, red `#C41E3A`, orange `#FF5800`, yellow `#FFD500`.
- `pickDiagramAlg` prefers face-only algs (no wide moves, slices, or rotations) because those shift centers and break the "yellow on top" derivation. 8 OLL cases lack a clean alg and fall back — `normalizeYellowOnTop` still produces a correct diagram.
- The simulator is **not** cubing.js's KPuzzle — it's a hand-rolled 54-sticker sim in `tools/render/src/cube.ts`. We use cubing.js only for alg parsing (`new Alg(...).experimentalExpand()`). Modify with care; the self-tests in `cube.test.ts` catch R/L/M direction bugs.

## Static site

Cookie-based learning tracker: states `unlearned` / `learning` / `learned`, persisted to a single `cubing_state` cookie as URL-encoded JSON `{caseId: 1|2}`. Click the small dot in the corner of a case card to cycle; clicking the rest of the card navigates to the detail page. The cookie does not work reliably on `file://` — serve via `python3 -m http.server`.

Path resolution in templates uses absolute-style URLs (`/cfop/pll/t-perm.html`) that get converted to relative paths per page via `to_relative(absolute, depth)`. Depth is hard-coded per page type in `build.py`.

## Conventions / preferences

- The dataset's algorithm order is **algdb's community upvote ranking**. Never re-sort during enrichment — it's the canonical popularity signal.
- Mismatches between JPerm's top alg and our algdb-derived top alg are usually genuine preference differences (M-slice vs 2-gen U-perms, etc.), not parser bugs. Don't "fix" them.
- Diagrams must always normalize to yellow on the U face for visual consistency.
- Future methods slot in under `data/methods/<method>/` using the same schema — no CFOP-specific logic in the schema itself.

## Pre-merge dataset preservation

When making changes that overwrite `data/methods/cfop/*.json` (e.g. re-running the importer), the previous snapshot is always recoverable from git. The pre-enrichment state lives at commit `98e855a` (initial); post-enrichment at `a85dbbc`. Always confirm the working tree is clean before re-running the importer, or use `git stash`.

## What's NOT here

- F2L diagrams (deferred — needs a different view, not last-layer)
- Authentication, search, or any backend
- Algorithm correctness verification (we trust the sources; the simulator could in theory validate that each alg solves its case, but doesn't yet)
- Methods other than CFOP
- Mobile / native app

# cubing

Repository of speedcubing algorithms with cube state diagrams. Built primarily as a data source that other applications can consume.

## Layout

```
data/
  schema/algorithm.schema.json    JSON Schema for stage files
  methods/
    cfop/
      f2l.json                    First Two Layers (41 cases)
      oll.json                    Orientation of the Last Layer (57 cases)
      2loll.json                  Two-Look OLL subset (3 EO + 7 OCLL = 10 algs)
      pll.json                    Permutation of the Last Layer (21 cases)
diagrams/
  cfop/
    {stage}/{case-id}.svg         Pre-generated SVGs
tools/
  scrape/                         Python: source-specific importers
  normalize/                      Python: schema validation, dedup, merge
  render/                         Node: cubing.js SVG renderer
```

## Data model

One JSON file per `(method, stage)`. Each file contains an array of `cases`; each case has one or more `algorithms` ordered by popularity. Algorithm strings use WCA Singmaster notation.

The schema is at `data/schema/algorithm.schema.json` and is referenced from each data file via `$schema`. Editors with JSON Schema support (VS Code, JetBrains, neovim with `coc-json` / `nvim-lspconfig` + `vscode-json-language-server`) will give completion and validation.

## Methods covered

- **CFOP** — the focus for the initial pass.

Future methods (Roux, ZZ, Petrus, ...) slot in under `data/methods/<method>/` using the same schema.

## Tooling

Python tooling (scrapers, validators) uses `uv`. Node tooling (SVG rendering via `cubing.js`) lives under `tools/render/`.

```sh
# Python
uv sync

# Node (diagram renderer)
cd tools/render && npm install
```

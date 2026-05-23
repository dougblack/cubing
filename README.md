# cubing

Speedcubing stuff.

## Data model

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

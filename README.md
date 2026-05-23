# cubing

Speedcubing stuff.

## Methods covered

- **CFOP** — the focus for the initial pass.

Future methods (Roux, ZZ, Petrus, ...) slot in under `data/methods/<method>/` using the same schema.

## Tooling

Python tooling (scrapers, validators, site build) uses `uv`. Node tooling (SVG rendering via `cubing.js`) lives under `tools/render/`.

```sh
# Python
uv sync

# Node (diagram renderer)
cd tools/render && npm install
```

## Browsable site

A flat HTML reference for the dataset with per-case detail pages and a cookie-based learning tracker (unlearned → learning → learned).

```sh
uv run python tools/build_site/build.py
python3 -m http.server 8080 -d site
open http://localhost:8080
```

`site/` is generated and not committed.

"""Parse JPerm's `oll.js` and `pll.js` into JSON dumps.

JPerm publishes alg sheets as single-line JS files declaring an
`algsetAlgs = [{...}]` array. We only need a handful of fields:

    name   — case identifier (int for OLL, string for PLL)
    alg    — array of algorithm strings; first entry = JPerm's recommended
    group  — case grouping (e.g. "Fish Shape", "Adjacent Corner Swap")
    prob   — weight unit proportional to real-solve probability

The `arrows` field is also present but we already generate our own PLL arrows.

Usage:
    uv run python tools/scrape/parse_jperm.py
Outputs:
    data/sources/jperm/parsed/{oll,pll}.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
JPERM_DIR = REPO_ROOT / "data" / "sources" / "jperm"
OUT_DIR = JPERM_DIR / "parsed"

# Match the algsetAlgs body and split into top-level {...} blocks. JS strings
# may contain commas and braces so a naive split fails; we walk the source
# tracking brace depth + string state.
_ALGSET_RE = re.compile(r"algsetAlgs\s*=\s*\[")


def split_cases(body: str) -> list[str]:
    """Given the inside of `algsetAlgs = [...]`, return each top-level {...} block."""
    cases: list[str] = []
    depth = 0
    in_string: str | None = None
    start: int | None = None
    i = 0
    while i < len(body):
        ch = body[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
        elif ch in ("'", '"'):
            in_string = ch
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                cases.append(body[start : i + 1])
                start = None
        elif ch == "]" and depth == 0:
            break
        i += 1
    return cases


def extract_string_array(src: str, key: str) -> list[str]:
    """Extract a `key:[...]` array of double-quoted strings from the case block."""
    m = re.search(rf"\b{key}\s*:\s*\[", src)
    if not m:
        return []
    depth = 0
    in_string: str | None = None
    start = m.end()
    end = start
    i = start - 1
    while i < len(src):
        i += 1
        if i >= len(src):
            break
        ch = src[i]
        if in_string:
            if ch == "\\":
                i += 1
                continue
            if ch == in_string:
                in_string = None
        elif ch in ("'", '"'):
            in_string = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            if depth == 0:
                end = i
                break
            depth -= 1
    inner = src[start:end]

    out: list[str] = []
    pos = 0
    while pos < len(inner):
        ch = inner[pos]
        if ch in ('"', "'"):
            quote = ch
            j = pos + 1
            buf: list[str] = []
            while j < len(inner):
                c = inner[j]
                if c == "\\" and j + 1 < len(inner):
                    buf.append(inner[j + 1])
                    j += 2
                    continue
                if c == quote:
                    break
                buf.append(c)
                j += 1
            out.append("".join(buf))
            pos = j + 1
        else:
            pos += 1
    return out


def extract_scalar(src: str, key: str) -> str | None:
    """Extract `key:value` where value is a number or quoted string."""
    m = re.search(rf'\b{key}\s*:\s*("([^"]*)"|\'([^\']*)\'|([-\d.]+))', src)
    if not m:
        return None
    return m.group(2) or m.group(3) or m.group(4)


def parse_file(path: Path) -> list[dict[str, Any]]:
    src = path.read_text()
    m = _ALGSET_RE.search(src)
    if not m:
        raise ValueError(f"could not find algsetAlgs in {path}")
    body = src[m.end() :]
    blocks = split_cases(body)
    out: list[dict[str, Any]] = []
    for blk in blocks:
        raw_name = extract_scalar(blk, "name")
        algs = extract_string_array(blk, "alg")
        group = extract_scalar(blk, "group")
        raw_prob = extract_scalar(blk, "prob")
        if raw_name is None or not algs:
            continue
        # OLL has numeric names, PLL has string names; preserve original type.
        name: int | str
        try:
            name = int(raw_name)
        except (ValueError, TypeError):
            name = raw_name
        prob: int | float | None
        if raw_prob is None:
            prob = None
        else:
            try:
                prob = int(raw_prob)
            except ValueError:
                prob = float(raw_prob)
        out.append({"name": name, "algs": algs, "group": group, "prob": prob})
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stage in ("oll", "pll"):
        src_path = JPERM_DIR / f"{stage}.js"
        cases = parse_file(src_path)
        out_path = OUT_DIR / f"{stage}.json"
        out_path.write_text(json.dumps(cases, indent=2) + "\n")
        print(f"{stage}: parsed {len(cases)} cases → {out_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()

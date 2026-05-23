"""Parse SpeedCubeDB OLL/PLL/F2L HTML into JSON dumps.

Each `data/sources/speedcubedb/<stage>.html` is a server-rendered page with
one block per case (`div.singlealgorithm[data-alg=NAME]`). Inside each block:

- A "Standard Alg" — SCDB's canonical pick — lives in `div.scdb-panel`.
- Alternatives live in `li` elements that contain a `.formatted-alg` (moves)
  and a `.alg-details` whose text holds "Community Votes: N" plus movecount
  and "face moves" generator info.

Usage:
    uv run python tools/scrape/parse_speedcubedb.py
Outputs:
    data/sources/speedcubedb/parsed/{oll,pll,f2l}.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from bs4.element import Tag

REPO_ROOT = Path(__file__).resolve().parents[2]
SCDB_DIR = REPO_ROOT / "data" / "sources" / "speedcubedb"
OUT_DIR = SCDB_DIR / "parsed"

_VOTES_RE = re.compile(r"Community Votes:\s*([\d,]+)")
_MOVECOUNT_RE = re.compile(r"Movecount:\s*(\d+)\s*ETM\s*(\d+)\s*STM")
_FACEMOVES_RE = re.compile(r"Face Moves:\s*([^\n]+?)(?:\s+Community|$)")


def _clean(text: str) -> str:
    return " ".join(text.split())


def _parse_alternative(li: Tag) -> dict[str, Any] | None:
    formatted = li.select_one(".formatted-alg")
    details = li.select_one(".alg-details")
    if not formatted or not details:
        return None
    moves = _clean(formatted.get_text(" ", strip=True))
    if not moves:
        return None
    details_text = _clean(details.get_text(" ", strip=True))
    out: dict[str, Any] = {"moves": moves, "votes": None, "movecount_etm": None,
                            "movecount_stm": None, "face_moves": None}
    if m := _VOTES_RE.search(details_text):
        out["votes"] = int(m.group(1).replace(",", ""))
    if m := _MOVECOUNT_RE.search(details_text):
        out["movecount_etm"] = int(m.group(1))
        out["movecount_stm"] = int(m.group(2))
    if m := _FACEMOVES_RE.search(details_text):
        out["face_moves"] = _clean(m.group(1))
    return out


def _parse_case(div: Tag) -> dict[str, Any]:
    case_name = div.get("data-alg")
    subgroup = div.get("data-subgroup")

    # Standard Alg: the scdb-panel block immediately following "Standard Alg:" label.
    standard_alg: str | None = None
    for panel in div.select("div.scdb-panel"):
        label_div = panel.find("div", string=re.compile(r"Standard Alg"))
        if label_div:
            # Standard alg text is the panel's text minus the label
            full = _clean(panel.get_text(" ", strip=True))
            standard_alg = _clean(full.replace("Standard Alg:", "").strip())
            break

    # Setup-case (the scramble that produces the case state). Helpful aside.
    setup = None
    setup_div = div.select_one(".setup-case")
    if setup_div:
        # Strip the leading "setup:" label
        full = _clean(setup_div.get_text(" ", strip=True))
        setup = _clean(re.sub(r"^setup:\s*", "", full))

    alternatives: list[dict[str, Any]] = []
    for li in div.select("li"):
        if alt := _parse_alternative(li):
            alternatives.append(alt)

    return {
        "case_name": case_name,
        "subgroup": subgroup,
        "setup": setup,
        "standard_alg": standard_alg,
        "alternatives": alternatives,
    }


def parse_file(path: Path) -> list[dict[str, Any]]:
    soup = BeautifulSoup(path.read_text(), "lxml")
    cases = soup.select("div.singlealgorithm[data-alg]")
    return [_parse_case(c) for c in cases]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stage in ("oll", "pll", "f2l"):
        src_path = SCDB_DIR / f"{stage}.html"
        cases = parse_file(src_path)
        out_path = OUT_DIR / f"{stage}.json"
        out_path.write_text(json.dumps(cases, indent=2) + "\n")
        total_alts = sum(len(c["alternatives"]) for c in cases)
        print(
            f"{stage}: parsed {len(cases)} cases, {total_alts} alternatives "
            f"→ {out_path.relative_to(REPO_ROOT)}"
        )


if __name__ == "__main__":
    main()

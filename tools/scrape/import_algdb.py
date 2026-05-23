"""Import the algdb.net snapshot into our stage JSON files.

Source: https://github.com/Vivaldo-Roque/AlgDB_Scraping (a scrape of the now-defunct
algdb.net). Within each case, the algorithm list is ordered by community upvotes,
so position 0 is the most popular alg.

Usage:
    uv run python tools/scrape/import_algdb.py [--source PATH]

Outputs:
    data/methods/cfop/{pll,oll,f2l}.json
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data" / "methods" / "cfop"
DEFAULT_SOURCE = "https://raw.githubusercontent.com/Vivaldo-Roque/AlgDB_Scraping/master/algdb.json"
ALGDB_CASE_URL = "https://algdb.net/puzzle/333/{stage}/{case}"


@dataclass(frozen=True)
class StageSpec:
    algdb_key: str
    method: str
    stage: str
    stage_name: str
    description: str
    algdb_stage_path: str  # path segment used in source URLs


STAGES: tuple[StageSpec, ...] = (
    StageSpec(
        algdb_key="PLL",
        method="cfop",
        stage="pll",
        stage_name="Permutation of the Last Layer",
        description=(
            "Final CFOP step. With the top face oriented, permute the remaining "
            "last-layer pieces into solved position. 21 standard cases plus the "
            "solved (skip) state."
        ),
        algdb_stage_path="pll",
    ),
    StageSpec(
        algdb_key="OLL",
        method="cfop",
        stage="oll",
        stage_name="Orientation of the Last Layer",
        description=(
            "Third CFOP step (full version). Orient all last-layer pieces so the "
            "top face is one color, in a single algorithm. 57 cases."
        ),
        algdb_stage_path="oll",
    ),
    StageSpec(
        algdb_key="F2L",
        method="cfop",
        stage="f2l",
        stage_name="First Two Layers",
        description=(
            "Second CFOP step. Pair up a corner-edge slot and insert it into the "
            "first two layers. 41 standard cases. Most cases are solved intuitively "
            "but algorithmic solutions exist for each."
        ),
        algdb_stage_path="f2l",
    ),
)


# --- canonical case metadata ---------------------------------------------------

# PLL: algdb names are already canonical. We layer human-readable names,
# aliases, and the standard groupings used in speedsolving lit.
PLL_META: dict[str, dict[str, Any]] = {
    "Aa": {
        "name": "Aa Perm",
        "aliases": ["A Perm a", "Aa-Perm"],
        "group": "adjacent-corner-swap",
        "number": 1,
    },
    "Ab": {
        "name": "Ab Perm",
        "aliases": ["A Perm b", "Ab-Perm"],
        "group": "adjacent-corner-swap",
        "number": 2,
    },
    "E": {
        "name": "E Perm",
        "aliases": ["E-Perm"],
        "group": "diagonal-corner-swap",
        "number": 3,
    },
    "F": {
        "name": "F Perm",
        "aliases": ["F-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 4,
    },
    "Ga": {
        "name": "Ga Perm",
        "aliases": ["G Perm a", "Ga-Perm"],
        "group": "g-perm",
        "subgroup": "g-perm-a",
        "number": 5,
    },
    "Gb": {
        "name": "Gb Perm",
        "aliases": ["G Perm b", "Gb-Perm"],
        "group": "g-perm",
        "subgroup": "g-perm-b",
        "number": 6,
    },
    "Gc": {
        "name": "Gc Perm",
        "aliases": ["G Perm c", "Gc-Perm"],
        "group": "g-perm",
        "subgroup": "g-perm-c",
        "number": 7,
    },
    "Gd": {
        "name": "Gd Perm",
        "aliases": ["G Perm d", "Gd-Perm"],
        "group": "g-perm",
        "subgroup": "g-perm-d",
        "number": 8,
    },
    "H": {
        "name": "H Perm",
        "aliases": ["H-Perm"],
        "group": "edges-only",
        "number": 9,
    },
    "Ja": {
        "name": "Ja Perm",
        "aliases": ["J Perm a", "Ja-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 10,
    },
    "Jb": {
        "name": "Jb Perm",
        "aliases": ["J Perm b", "Jb-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 11,
    },
    "Na": {
        "name": "Na Perm",
        "aliases": ["N Perm a", "Na-Perm"],
        "group": "diagonal-corner-swap",
        "number": 12,
    },
    "Nb": {
        "name": "Nb Perm",
        "aliases": ["N Perm b", "Nb-Perm"],
        "group": "diagonal-corner-swap",
        "number": 13,
    },
    "Ra": {
        "name": "Ra Perm",
        "aliases": ["R Perm a", "Ra-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 14,
    },
    "Rb": {
        "name": "Rb Perm",
        "aliases": ["R Perm b", "Rb-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 15,
    },
    "T": {
        "name": "T Perm",
        "aliases": ["T-Perm"],
        "group": "adjacent-corner-swap-with-edges",
        "number": 16,
    },
    "Ua": {
        "name": "Ua Perm",
        "aliases": ["U Perm a", "Ua-Perm"],
        "group": "edges-only",
        "number": 17,
    },
    "Ub": {
        "name": "Ub Perm",
        "aliases": ["U Perm b", "Ub-Perm"],
        "group": "edges-only",
        "number": 18,
    },
    "V": {
        "name": "V Perm",
        "aliases": ["V-Perm"],
        "group": "diagonal-corner-swap",
        "number": 19,
    },
    "Y": {
        "name": "Y Perm",
        "aliases": ["Y-Perm"],
        "group": "diagonal-corner-swap",
        "number": 20,
    },
    "Z": {
        "name": "Z Perm",
        "aliases": ["Z-Perm"],
        "group": "edges-only",
        "number": 21,
    },
}


# OLL: canonical groups by case number. The standard categorization groups OLLs
# by visual pattern (Dot, I-shape, L-shape, etc.) and by whether they're part of
# the OCLL subset (where all edges are already oriented) used in 2LOLL.
# Source: speedsolving.com/wiki/OLL and JPerm's algorithm sheets.
OLL_META: dict[int, dict[str, Any]] = {
    # All-edges-not-oriented "Dot" cases
    1: {"name": "OLL 1", "aliases": ["Dot 1"], "group": "dot"},
    2: {"name": "OLL 2", "aliases": ["Dot 2"], "group": "dot"},
    3: {"name": "OLL 3", "aliases": ["Dot 3"], "group": "dot"},
    4: {"name": "OLL 4", "aliases": ["Dot 4"], "group": "dot"},
    17: {"name": "OLL 17", "aliases": ["Dot 5"], "group": "dot"},
    18: {"name": "OLL 18", "aliases": ["Dot 6"], "group": "dot"},
    19: {"name": "OLL 19", "aliases": ["Dot 7"], "group": "dot"},
    20: {"name": "OLL 20", "aliases": ["Dot 8", "Checkers"], "group": "dot"},
    # Squares
    5: {"name": "OLL 5", "aliases": ["Square 1"], "group": "square"},
    6: {"name": "OLL 6", "aliases": ["Square 2"], "group": "square"},
    # Small Lightning Bolts
    7: {"name": "OLL 7", "aliases": ["Small Lightning Bolt 1"], "group": "small-lightning-bolt"},
    8: {"name": "OLL 8", "aliases": ["Small Lightning Bolt 2"], "group": "small-lightning-bolt"},
    # Fish Shapes
    9: {"name": "OLL 9", "aliases": ["Fish 1"], "group": "fish"},
    10: {"name": "OLL 10", "aliases": ["Fish 2"], "group": "fish"},
    35: {"name": "OLL 35", "aliases": ["Fish 3"], "group": "fish"},
    37: {"name": "OLL 37", "aliases": ["Fish 4", "Mounted Fish"], "group": "fish"},
    # Big Lightning Bolts
    11: {"name": "OLL 11", "aliases": ["Big Lightning Bolt 1"], "group": "big-lightning-bolt"},
    12: {"name": "OLL 12", "aliases": ["Big Lightning Bolt 2"], "group": "big-lightning-bolt"},
    # Knight Move Shapes
    13: {"name": "OLL 13", "aliases": ["Knight Move 1"], "group": "knight-move"},
    14: {"name": "OLL 14", "aliases": ["Knight Move 2"], "group": "knight-move"},
    15: {"name": "OLL 15", "aliases": ["Knight Move 3"], "group": "knight-move"},
    16: {"name": "OLL 16", "aliases": ["Knight Move 4"], "group": "knight-move"},
    # I-Shapes (edges all oriented except in a line)
    51: {"name": "OLL 51", "aliases": ["I-Shape 1", "Bunny"], "group": "i-shape"},
    52: {"name": "OLL 52", "aliases": ["I-Shape 2"], "group": "i-shape"},
    55: {"name": "OLL 55", "aliases": ["I-Shape 3"], "group": "i-shape"},
    56: {"name": "OLL 56", "aliases": ["I-Shape 4"], "group": "i-shape"},
    # OCLL subset: all edges oriented, only corners to orient. Used in 2LOLL.
    21: {"name": "OLL 21", "aliases": ["H (OCLL)"], "group": "ocll", "tags": ["ocll"]},
    22: {"name": "OLL 22", "aliases": ["Pi (OCLL)"], "group": "ocll", "tags": ["ocll"]},
    23: {"name": "OLL 23", "aliases": ["U (OCLL)", "Headlights"], "group": "ocll", "tags": ["ocll"]},
    24: {"name": "OLL 24", "aliases": ["T (OCLL)"], "group": "ocll", "tags": ["ocll"]},
    25: {"name": "OLL 25", "aliases": ["L (OCLL)", "Bowtie"], "group": "ocll", "tags": ["ocll"]},
    26: {"name": "OLL 26", "aliases": ["Anti-Sune"], "group": "ocll", "tags": ["ocll"]},
    27: {"name": "OLL 27", "aliases": ["Sune"], "group": "ocll", "tags": ["ocll"]},
    # P-Shapes
    31: {"name": "OLL 31", "aliases": ["P 1"], "group": "p-shape"},
    32: {"name": "OLL 32", "aliases": ["P 2"], "group": "p-shape"},
    43: {"name": "OLL 43", "aliases": ["P 3"], "group": "p-shape"},
    44: {"name": "OLL 44", "aliases": ["P 4"], "group": "p-shape"},
    # W-Shapes
    36: {"name": "OLL 36", "aliases": ["W 1"], "group": "w-shape"},
    38: {"name": "OLL 38", "aliases": ["W 2"], "group": "w-shape"},
    # C-Shapes
    34: {"name": "OLL 34", "aliases": ["C 1"], "group": "c-shape"},
    46: {"name": "OLL 46", "aliases": ["C 2"], "group": "c-shape"},
    # T-Shapes
    33: {"name": "OLL 33", "aliases": ["T 1"], "group": "t-shape"},
    45: {"name": "OLL 45", "aliases": ["T 2"], "group": "t-shape"},
    # L-Shapes (awkward / breaks)
    47: {"name": "OLL 47", "aliases": ["L 1"], "group": "l-shape"},
    48: {"name": "OLL 48", "aliases": ["L 2"], "group": "l-shape"},
    49: {"name": "OLL 49", "aliases": ["L 3"], "group": "l-shape"},
    50: {"name": "OLL 50", "aliases": ["L 4"], "group": "l-shape"},
    53: {"name": "OLL 53", "aliases": ["L 5"], "group": "l-shape"},
    54: {"name": "OLL 54", "aliases": ["L 6"], "group": "l-shape"},
    # Awkward / Misc
    28: {"name": "OLL 28", "aliases": ["Awkward 1"], "group": "awkward"},
    29: {"name": "OLL 29", "aliases": ["Awkward 2"], "group": "awkward"},
    30: {"name": "OLL 30", "aliases": ["Awkward 3"], "group": "awkward"},
    39: {"name": "OLL 39", "aliases": ["Awkward 4"], "group": "awkward"},
    40: {"name": "OLL 40", "aliases": ["Awkward 5"], "group": "awkward"},
    41: {"name": "OLL 41", "aliases": ["Awkward 6"], "group": "awkward"},
    42: {"name": "OLL 42", "aliases": ["Awkward 7"], "group": "awkward"},
    57: {"name": "OLL 57", "aliases": ["H/Pi crossover"], "group": "all-edges-oriented"},
}


def algdb_url(stage_path: str, case_label: str) -> str:
    return ALGDB_CASE_URL.format(stage=stage_path, case=case_label.lower())


def pll_case(case: dict[str, Any]) -> dict[str, Any]:
    label = case["Case"]
    meta = PLL_META[label]
    case_id = f"{label.lower()}-perm" if len(label) <= 2 else label.lower()
    out: dict[str, Any] = {
        "id": case_id,
        "name": meta["name"],
        "number": meta["number"],
        "group": meta["group"],
    }
    if "subgroup" in meta:
        out["subgroup"] = meta["subgroup"]
    if "aliases" in meta:
        out["aliases"] = meta["aliases"]
    out["algorithms"] = build_algorithms(case["Algs"], "pll", label)
    return out


def oll_case(case: dict[str, Any]) -> dict[str, Any]:
    label = case["Case"]  # e.g. "O21"
    num = int(label[1:])
    meta = OLL_META.get(num, {"name": f"OLL {num}", "group": "other"})
    out: dict[str, Any] = {
        "id": f"oll-{num}",
        "name": meta["name"],
        "number": num,
        "group": meta["group"],
    }
    if "aliases" in meta:
        out["aliases"] = meta["aliases"]
    if "tags" in meta:
        out["tags"] = meta["tags"]
    out["algorithms"] = build_algorithms(case["Algs"], "oll", str(num))
    return out


def f2l_case(case: dict[str, Any]) -> dict[str, Any]:
    label = case["Case"]  # e.g. "F1"
    num = int(label[1:])
    out: dict[str, Any] = {
        "id": f"f2l-{num}",
        "name": f"F2L {num}",
        "number": num,
        "group": f2l_group(num),
    }
    out["algorithms"] = build_algorithms(case["Algs"], "f2l", str(num))
    return out


def f2l_group(num: int) -> str:
    """Standard F2L case grouping by corner and edge positioning.

    1-2: corner in top, edge in top (basic)
    3-4: corner in top, edge in top, pair already made
    5-6: edge in slot
    7-8: corner in slot
    9-22: corner+edge in slot (incorrect orientations)
    23-30: incorrect orientation when pair separated
    31-34: pair made in top
    35-41: special / advanced
    """
    if 1 <= num <= 4:
        return "basic-pair-in-top"
    if 5 <= num <= 6:
        return "edge-in-slot"
    if 7 <= num <= 8:
        return "corner-in-slot"
    if 9 <= num <= 22:
        return "both-in-slot"
    if 23 <= num <= 30:
        return "separated-pair"
    if 31 <= num <= 34:
        return "pair-made-in-top"
    return "other"


def build_algorithms(algs: list[str], stage_path: str, case_label: str) -> list[dict[str, Any]]:
    """Order = algdb upvote order. Position 0 = primary."""
    src_url = algdb_url(stage_path, case_label)
    out: list[dict[str, Any]] = []
    for i, alg in enumerate(algs):
        entry: dict[str, Any] = {
            "moves": alg,
            "length_htm": htm_count(alg),
        }
        if i == 0:
            entry["popularity"] = "primary"
            entry["popularity_source"] = "algdb.net votes"
        else:
            entry["popularity"] = "common" if i < 3 else "alternative"
        entry["popularity_rank"] = i + 1
        entry["source_urls"] = [src_url]
        out.append(entry)
    return out


def htm_count(alg: str) -> int:
    """Half-turn metric. Rotations (x/y/z) and wide-move prefixes don't count
    as face turns. We count any token whose primary letter is a face (R, L, U,
    D, F, B) or wide-face (r, l, u, d, f, b, M, S, E) — all of those are one
    move in HTM regardless of single/double/prime."""
    count = 0
    face_chars = set("RLUDFBrludfbMSE")
    for token in alg.replace("(", " ").replace(")", " ").split():
        if not token:
            continue
        head = token[0]
        if head in face_chars:
            count += 1
    return count


def build_stage(spec: StageSpec, source: dict[str, Any]) -> dict[str, Any]:
    raw_cases = source[spec.algdb_key]
    builders = {
        "pll": pll_case,
        "oll": oll_case,
        "f2l": f2l_case,
    }
    build = builders[spec.stage]
    cases = [build(c) for c in raw_cases]
    return {
        "$schema": "../../schema/algorithm.schema.json",
        "method": spec.method,
        "stage": spec.stage,
        "stage_name": spec.stage_name,
        "puzzle": "3x3",
        "notation": "wca-singmaster",
        "description": spec.description,
        "cases": cases,
    }


def load_source(source: str) -> dict[str, Any]:
    path = Path(source)
    if path.exists():
        data = json.loads(path.read_text())
    else:
        with urllib.request.urlopen(source) as resp:  # noqa: S310 — known public URL
            data = json.loads(resp.read().decode())
    return data  # type: ignore[no-any-return]


def write_stages(stages: Iterable[tuple[StageSpec, dict[str, Any]]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for spec, payload in stages:
        out_path = DATA_DIR / f"{spec.stage}.json"
        out_path.write_text(json.dumps(payload, indent=2) + "\n")
        print(f"wrote {out_path.relative_to(REPO_ROOT)}: {len(payload['cases'])} cases")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE,
        help="URL or local path to the algdb JSON snapshot",
    )
    args = parser.parse_args()
    source = load_source(args.source)
    stages = [(spec, build_stage(spec, source)) for spec in STAGES]
    write_stages(stages)


if __name__ == "__main__":
    main()

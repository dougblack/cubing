"""Enrich data/methods/cfop/*.json with JPerm and SpeedCubeDB metadata.

This script does NOT add new algorithms, change algorithm ordering, or rewrite
existing alg strings. It only adds fields:

    Case-level:
        - jperm_group         (from JPerm)
        - probability_weight  (from JPerm)
    Algorithm-level:
        - community_votes     (from SCDB, if the alg matches)
        - jperm_recommended   (true if matches JPerm's top alg for the case)
        - scdb_standard       (true if matches SCDB's standard alg for the case)

Pre-merge dataset must be committed elsewhere; this overwrites in place.

Usage:
    uv run python tools/scrape/parse_jperm.py
    uv run python tools/scrape/parse_speedcubedb.py
    uv run python tools/normalize/merge_sources.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
CFOP_DIR = REPO_ROOT / "data" / "methods" / "cfop"
JPERM_PARSED = REPO_ROOT / "data" / "sources" / "jperm" / "parsed"
SCDB_PARSED = REPO_ROOT / "data" / "sources" / "speedcubedb" / "parsed"

# Field order — keep merged fields adjacent to related fields in JSON output.
CASE_FIELD_ORDER = (
    "id", "name", "aliases", "number", "group", "subgroup", "jperm_group",
    "probability_weight", "tags", "setup", "recognition", "diagram", "algorithms",
)
ALG_FIELD_ORDER = (
    "moves", "auf_pre", "auf_post", "rotation", "popularity", "popularity_rank",
    "popularity_source", "community_votes", "jperm_recommended", "scdb_standard",
    "best_for", "length_htm", "length_stm", "length_qtm", "author", "source_urls",
    "notes",
)


# --- alg normalization (matching) ---------------------------------------------

_WS_RE = re.compile(r"\s+")
_PARENS_RE = re.compile(r"[()]")
_PRIME_VARIANTS = {
    "’": "'",  # right single quotation mark
    "ʼ": "'",  # modifier letter apostrophe
    "′": "'",  # prime
}


def normalize_alg(moves: str) -> str:
    """Canonicalize an alg string for cross-source equality comparison.

    - Strip parentheses (grouping is visual).
    - Collapse whitespace.
    - Normalize fancy unicode primes to ASCII apostrophe.
    Move-set differences (e.g. 'Uw' vs 'u', 'R2'' vs 'R2') are NOT normalized;
    canonical equivalence would need a real alg parser.
    """
    s = moves
    for orig, repl in _PRIME_VARIANTS.items():
        s = s.replace(orig, repl)
    s = _PARENS_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


# --- case name matching -------------------------------------------------------


def jperm_case_key(stage: str, name: int | str) -> str:
    """Canonical key used to look up JPerm cases."""
    if stage == "oll":
        return f"oll-{int(name)}"
    if stage == "pll":
        return f"{str(name).lower()}-perm"
    raise ValueError(stage)


def scdb_case_key(stage: str, case_name: str) -> str:
    """Canonical key used to look up SCDB cases. SCDB names are like
    'OLL 1', 'F2L 23', 'Aa'. Match the trailing number specifically — the
    bare `\\d+` regex matches the '2' in 'F2L' before the actual case number."""
    if stage == "oll":
        m = re.search(r"(\d+)\s*$", case_name)
        if not m:
            raise ValueError(f"unexpected SCDB OLL name: {case_name}")
        return f"oll-{int(m.group(1))}"
    if stage == "pll":
        return f"{case_name.lower()}-perm"
    if stage == "f2l":
        m = re.search(r"(\d+)\s*$", case_name)
        if not m:
            raise ValueError(f"unexpected SCDB F2L name: {case_name}")
        return f"f2l-{int(m.group(1))}"
    raise ValueError(stage)


# --- merge --------------------------------------------------------------------


def build_jperm_lookup(stage: str) -> dict[str, dict[str, Any]]:
    path = JPERM_PARSED / f"{stage}.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    return {jperm_case_key(stage, c["name"]): c for c in raw}


def build_scdb_lookup(stage: str) -> dict[str, dict[str, Any]]:
    path = SCDB_PARSED / f"{stage}.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text())
    return {scdb_case_key(stage, c["case_name"]): c for c in raw}


def _reorder(d: dict[str, Any], order: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {k: d[k] for k in order if k in d}
    for k, v in d.items():
        if k not in out:
            out[k] = v
    return out


def merge_stage(stage_path: Path, stage_kind: str) -> tuple[int, int, int, int]:
    """Returns (cases, cases_with_jperm, alg_matches_jperm, alg_matches_scdb)."""
    data = json.loads(stage_path.read_text())
    jperm = build_jperm_lookup(stage_kind)
    scdb = build_scdb_lookup(stage_kind)

    cases_with_jperm = 0
    alg_jperm_matches = 0
    alg_scdb_matches = 0

    for case in data["cases"]:
        cid = case["id"]

        # JPerm: case-level group + probability_weight; alg-level recommended flag.
        if jp := jperm.get(cid):
            cases_with_jperm += 1
            if jp.get("group"):
                case["jperm_group"] = jp["group"]
            if jp.get("prob") is not None:
                case["probability_weight"] = jp["prob"]
            top_norm = normalize_alg(jp["algs"][0]) if jp["algs"] else None
        else:
            top_norm = None

        # SCDB: build a lookup from normalized alg -> info
        scdb_alts_by_norm: dict[str, dict[str, Any]] = {}
        scdb_standard_norm: str | None = None
        if sc := scdb.get(cid):
            if sc.get("standard_alg"):
                scdb_standard_norm = normalize_alg(sc["standard_alg"])
            for alt in sc.get("alternatives", []):
                scdb_alts_by_norm[normalize_alg(alt["moves"])] = alt

        for alg in case["algorithms"]:
            norm = normalize_alg(alg["moves"])
            if top_norm is not None and norm == top_norm:
                alg["jperm_recommended"] = True
                alg_jperm_matches += 1
            if scdb_standard_norm is not None and norm == scdb_standard_norm:
                alg["scdb_standard"] = True
            if alt := scdb_alts_by_norm.get(norm):
                if alt.get("votes") is not None:
                    alg["community_votes"] = alt["votes"]
                alg_scdb_matches += 1

        # Reorder for stable output.
        case_ordered = _reorder(case, CASE_FIELD_ORDER)
        case_ordered["algorithms"] = [_reorder(a, ALG_FIELD_ORDER) for a in case["algorithms"]]
        case.clear()
        case.update(case_ordered)

    return len(data["cases"]), cases_with_jperm, alg_jperm_matches, alg_scdb_matches, data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Don't overwrite files.")
    args = parser.parse_args()

    stage_files = {
        "pll": CFOP_DIR / "pll.json",
        "oll": CFOP_DIR / "oll.json",
        "f2l": CFOP_DIR / "f2l.json",
        "2loll": CFOP_DIR / "2loll.json",
    }
    for stage_kind, path in stage_files.items():
        if not path.exists():
            continue
        # 2LOLL has no upstream counterpart in JPerm or SCDB; skip.
        if stage_kind == "2loll":
            print(f"{stage_kind}: skipped (no upstream source)")
            continue
        result = merge_stage(path, stage_kind)
        n_cases, n_jperm, n_alg_jperm, n_alg_scdb, merged = result
        if not args.dry_run:
            path.write_text(json.dumps(merged, indent=2) + "\n")
        print(
            f"{stage_kind}: {n_cases} cases, {n_jperm} JPerm matches, "
            f"{n_alg_jperm} algs marked jperm_recommended, "
            f"{n_alg_scdb} algs received SCDB votes"
        )


if __name__ == "__main__":
    main()

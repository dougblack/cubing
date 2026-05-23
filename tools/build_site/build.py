"""Build a static HTML site for the cubing algorithm dataset.

Reads data/methods/cfop/*.json + diagrams/cfop/<stage>/*.svg, renders Jinja
templates to site/. Static assets and SVGs are copied so the output is
self-contained.

Usage:
    uv run python tools/build_site/build.py
    python -m http.server 8080 -d site   # then open http://localhost:8080
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

REPO_ROOT = Path(__file__).resolve().parents[2]
CFOP_DIR = REPO_ROOT / "data" / "methods" / "cfop"
DIAGRAMS_DIR = REPO_ROOT / "diagrams"
THIS_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = THIS_DIR / "templates"
STATIC_DIR = THIS_DIR / "static"
SITE_DIR = REPO_ROOT / "site"


@dataclass(frozen=True)
class Stage:
    method: str
    stage: str
    short_name: str
    full_name: str
    description: str


STAGES: tuple[Stage, ...] = (
    Stage(
        method="cfop",
        stage="pll",
        short_name="PLL",
        full_name="Permutation of the Last Layer",
        description=(
            "The final CFOP step. With the top face oriented, permute the "
            "remaining last-layer pieces to solve the cube. 21 standard cases."
        ),
    ),
    Stage(
        method="cfop",
        stage="oll",
        short_name="OLL",
        full_name="Orientation of the Last Layer",
        description=(
            "The third CFOP step (full version). Orient every last-layer "
            "piece so the top face is one color in a single algorithm. 57 cases."
        ),
    ),
    Stage(
        method="cfop",
        stage="2loll",
        short_name="2-Look OLL",
        full_name="Two-Look OLL",
        description=(
            "Beginner-friendly OLL: orient the edges first (3 cases), then "
            "the corners (7 cases). 10 algorithms total versus 57 for full OLL."
        ),
    ),
)


# Friendly display labels for the internal group identifiers used in the JSON.
GROUP_DISPLAY: dict[str, str] = {
    "edges-only": "Edges Only",
    "adjacent-corner-swap": "Adjacent Corner Swap",
    "adjacent-corner-swap-with-edges": "Adjacent Corner Swap",
    "diagonal-corner-swap": "Diagonal Corner Swap",
    "g-perm": "G Perm",
    "ocll": "OCLL",
    "oell": "OELL",
    "dot": "Dot",
    "square": "Square",
    "small-lightning-bolt": "Small Lightning Bolt",
    "big-lightning-bolt": "Big Lightning Bolt",
    "fish": "Fish Shape",
    "knight-move": "Knight Move",
    "i-shape": "I Shape",
    "p-shape": "P Shape",
    "w-shape": "W Shape",
    "c-shape": "C Shape",
    "t-shape": "T Shape",
    "l-shape": "L Shape",
    "awkward": "Awkward",
    "all-edges-oriented": "All Edges Oriented",
    "cross": "Cross",
    "other": "Other",
}


def display_group(case: dict[str, Any]) -> str | None:
    # Prefer JPerm's label when present; fall back to our internal mapping.
    if jp := case.get("jperm_group"):
        return jp
    if g := case.get("group"):
        return GROUP_DISPLAY.get(g, g.replace("-", " ").title())
    return None


def probability_text(case: dict[str, Any], stage: str) -> str | None:
    pw = case.get("probability_weight")
    if pw is None:
        return None
    # Convert weight units to the standard fraction. PLL totals 71 wait — actually
    # PLL's standard probability is given out of /18 because the 21 cases collapse
    # to 18 distinct states after AUF. JPerm's weights (1,2,4) sum to 71, but
    # match the 1/18, 2/18, 4/18 buckets. For OLL we have weights summing to 216
    # which match /216. Just render as "weight: N" when we're not sure of the
    # denominator; render as fraction for known stages.
    denom = None
    if stage == "pll":
        denom = 72  # 4 × 18; aligns with JPerm's weights summing to 72 for 21 cases
    elif stage == "oll":
        denom = 216  # standard OLL probability denominator
    if denom is not None:
        return f"{pw}/{denom}"
    return f"weight {pw}"


def make_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=False,
        lstrip_blocks=False,
    )


def case_href(stage: Stage, case_id: str) -> str:
    return f"/cfop/{stage.stage}/{case_id}.html"


def diagram_href(stage: Stage, case_id: str) -> str:
    return f"/diagrams/cfop/{stage.stage}/{case_id}.svg"


def stage_href(stage: Stage) -> str:
    return f"/cfop/{stage.stage}/index.html"


def asset_prefix_for(depth: int) -> str:
    """Compute the relative prefix from a page at the given URL depth to site root.

    depth=0  -> "" (homepage)
    depth=2  -> "../../" (e.g. cfop/<stage>/index.html)
    depth=3  -> "../../../" (e.g. cfop/<stage>/<case>.html)
    """
    return "../" * depth


def to_relative(absolute: str, depth: int) -> str:
    """Turn an absolute-rooted href like '/diagrams/...' into a relative one."""
    return asset_prefix_for(depth) + absolute.lstrip("/")


def write(path: Path, contents: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents)


def copy_static() -> None:
    out_assets = SITE_DIR / "assets"
    if out_assets.exists():
        shutil.rmtree(out_assets)
    shutil.copytree(STATIC_DIR, out_assets)


def copy_diagrams() -> None:
    out_diagrams = SITE_DIR / "diagrams"
    if out_diagrams.exists():
        shutil.rmtree(out_diagrams)
    shutil.copytree(DIAGRAMS_DIR, out_diagrams)


def load_stage_data(stage: Stage) -> dict[str, Any]:
    return json.loads((CFOP_DIR / f"{stage.stage}.json").read_text())


def main() -> None:
    if SITE_DIR.exists():
        shutil.rmtree(SITE_DIR)
    SITE_DIR.mkdir()

    env = make_env()

    # Pre-load all stage data so we can compute totals for the footer.
    all_stage_data: dict[str, dict[str, Any]] = {s.stage: load_stage_data(s) for s in STAGES}
    total_cases = sum(len(d["cases"]) for d in all_stage_data.values())
    total_algs = sum(len(c["algorithms"]) for d in all_stage_data.values() for c in d["cases"])

    # Map stage slug -> list of case IDs, serialized into the page so JS can
    # compute per-stage learned counts even on pages (like the homepage) that
    # don't render individual case cards.
    stage_case_ids_json = json.dumps(
        {s.stage: [c["id"] for c in all_stage_data[s.stage]["cases"]] for s in STAGES}
    )

    base_ctx: dict[str, Any] = {
        "total_cases": total_cases,
        "total_algs": total_algs,
        "stage_case_ids_json": stage_case_ids_json,
    }

    # --- homepage ---
    home_stages = []
    for s in STAGES:
        data = all_stage_data[s.stage]
        home_stages.append(
            {
                "slug": s.stage,
                "short_name": s.short_name,
                "full_name": s.full_name,
                "description": s.description,
                "case_count": len(data["cases"]),
                "alg_count": sum(len(c["algorithms"]) for c in data["cases"]),
                "href": to_relative(stage_href(s), depth=0),
            }
        )
    home_html = env.get_template("index.html").render(
        asset_prefix=asset_prefix_for(0),
        stages=home_stages,
        **base_ctx,
    )
    write(SITE_DIR / "index.html", home_html)

    # --- per-stage and per-case pages ---
    stage_tmpl = env.get_template("stage.html")
    case_tmpl = env.get_template("case.html")
    for s in STAGES:
        data = all_stage_data[s.stage]
        # Sort cases by their `number` field when present (preserves OLL 1..57 etc),
        # else by id.
        cases_sorted = sorted(
            data["cases"],
            key=lambda c: (c.get("number") if c.get("number") is not None else 9999, c["id"]),
        )

        # Stage index page (depth=2 from site root: cfop/<stage>/index.html).
        stage_cases = []
        for c in cases_sorted:
            alg_moves = [a["moves"] for a in c["algorithms"]]
            primary_alg = alg_moves[0] if alg_moves else ""
            stage_cases.append(
                {
                    "id": c["id"],
                    "name": c["name"],
                    "group_label": display_group(c),
                    "probability_text": probability_text(c, s.stage),
                    "primary_alg": primary_alg,
                    "alg_moves": alg_moves,
                    "href": to_relative(case_href(s, c["id"]), depth=2),
                    "diagram_href": to_relative(diagram_href(s, c["id"]), depth=2),
                }
            )
        stage_ctx = {
            "short_name": s.short_name,
            "full_name": s.full_name,
            "description": s.description,
            "case_count": len(cases_sorted),
            "stage": s.stage,
        }
        stage_html = stage_tmpl.render(
            asset_prefix=asset_prefix_for(2),
            stage=stage_ctx,
            cases=stage_cases,
            **base_ctx,
        )
        write(SITE_DIR / "cfop" / s.stage / "index.html", stage_html)

        # Per-case detail pages (depth=2 from site root: cfop/<stage>/<case>.html).
        for c in cases_sorted:
            case_ctx = {
                "id": c["id"],
                "name": c["name"],
                "aliases": c.get("aliases") or [],
                "group_label": display_group(c),
                "tags": c.get("tags") or [],
                "probability_text": probability_text(c, s.stage),
                "alg_count": len(c["algorithms"]),
                "algorithms": c["algorithms"],
                "diagram_href": to_relative(diagram_href(s, c["id"]), depth=2),
            }
            case_html = case_tmpl.render(
                asset_prefix=asset_prefix_for(2),
                stage=stage_ctx,
                case=case_ctx,
                **base_ctx,
            )
            write(SITE_DIR / "cfop" / s.stage / f"{c['id']}.html", case_html)

    copy_static()
    copy_diagrams()

    page_count = len(list(SITE_DIR.rglob("*.html")))
    print(f"built {page_count} pages → {SITE_DIR.relative_to(REPO_ROOT)}/")


if __name__ == "__main__":
    main()

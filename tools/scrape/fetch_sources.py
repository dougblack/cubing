"""Fetch raw upstream data from each source we know about.

This script just downloads files; it does not parse or merge anything.
The goal is to snapshot the raw data so we can re-parse / re-import later
without making fresh HTTP requests.

Sources:
    - algdb: Vivaldo-Roque's algdb.net JSON scrape (single file).
    - jperm: J Perm's OLL and PLL alg JS files (raw JavaScript).
    - speedcubedb: SpeedCubeDB's OLL/PLL/F2L HTML pages.

Usage:
    uv run python tools/scrape/fetch_sources.py [--source NAME ...] [--force]
"""

from __future__ import annotations

import argparse
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCES_DIR = REPO_ROOT / "data" / "sources"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_DELAY_SECONDS = 1.0  # be polite between requests to the same host


@dataclass(frozen=True)
class Download:
    source: str
    url: str
    dest: Path


DOWNLOADS: tuple[Download, ...] = (
    Download(
        source="algdb",
        url="https://raw.githubusercontent.com/Vivaldo-Roque/AlgDB_Scraping/master/algdb.json",
        dest=SOURCES_DIR / "algdb" / "algdb.json",
    ),
    Download(
        source="jperm",
        url="https://jperm.net/lib/oll.js",
        dest=SOURCES_DIR / "jperm" / "oll.js",
    ),
    Download(
        source="jperm",
        url="https://jperm.net/lib/pll.js",
        dest=SOURCES_DIR / "jperm" / "pll.js",
    ),
    Download(
        source="speedcubedb",
        url="https://speedcubedb.com/a/3x3/OLL",
        dest=SOURCES_DIR / "speedcubedb" / "oll.html",
    ),
    Download(
        source="speedcubedb",
        url="https://speedcubedb.com/a/3x3/PLL",
        dest=SOURCES_DIR / "speedcubedb" / "pll.html",
    ),
    Download(
        source="speedcubedb",
        url="https://speedcubedb.com/a/3x3/F2L",
        dest=SOURCES_DIR / "speedcubedb" / "f2l.html",
    ),
)


HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch(d: Download, force: bool) -> str:
    if d.dest.exists() and not force:
        return f"skip (exists): {d.dest.relative_to(REPO_ROOT)}"
    d.dest.parent.mkdir(parents=True, exist_ok=True)
    resp = httpx.get(d.url, headers=HEADERS, follow_redirects=True, timeout=30.0)
    resp.raise_for_status()
    d.dest.write_bytes(resp.content)
    return f"fetched {len(resp.content):>9,} bytes -> {d.dest.relative_to(REPO_ROOT)}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        action="append",
        choices=sorted({d.source for d in DOWNLOADS}),
        help="Limit to a single source (repeatable). Default: all.",
    )
    parser.add_argument("--force", action="store_true", help="Re-fetch even if file exists.")
    args = parser.parse_args()

    wanted: tuple[Download, ...] = tuple(
        d for d in DOWNLOADS if (not args.source) or d.source in args.source
    )
    last_host: str | None = None
    for d in wanted:
        host = d.url.split("/")[2]
        if host == last_host:
            time.sleep(REQUEST_DELAY_SECONDS)
        last_host = host
        print(fetch(d, args.force))


if __name__ == "__main__":
    main()

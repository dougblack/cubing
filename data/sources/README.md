# External source snapshots

Raw, unmodified data pulled from upstream sources. Refreshed via:

```
uv run python tools/scrape/fetch_sources.py [--source NAME ...] [--force]
```

| Path | Source | Format | Notes |
|---|---|---|---|
| `algdb/algdb.json` | [Vivaldo-Roque/AlgDB_Scraping](https://github.com/Vivaldo-Roque/AlgDB_Scraping) | JSON | Snapshot of the now-defunct algdb.net. `{F2L, OLL, PLL, COLL, WV}` keys; each value is a list of `{Case, Algs[]}` ordered by community upvote rank. Drives `tools/scrape/import_algdb.py`. |
| `jperm/oll.js` | [jperm.net/lib/oll.js](https://jperm.net/lib/oll.js) | JavaScript | J Perm's OLL alg sheet. Declares `algsetAlgs = [{name, alg[], group, prob, arrows}]`. The `group` field gives canonical visual categories ("Fish Shape", "Awkward Shape", etc.); `prob` is real-solve frequency. First alg in each list is J Perm's recommended pick. |
| `jperm/pll.js` | [jperm.net/lib/pll.js](https://jperm.net/lib/pll.js) | JavaScript | Same structure as `oll.js`, for the 21 PLL cases. |
| `speedcubedb/oll.html` | [speedcubedb.com/a/3x3/OLL](https://speedcubedb.com/a/3x3/OLL) | HTML | Server-rendered page. Each case lists one "Standard Alg" plus alternatives with explicit `Community Votes: N` counts and movecount/gen metadata. |
| `speedcubedb/pll.html` | [speedcubedb.com/a/3x3/PLL](https://speedcubedb.com/a/3x3/PLL) | HTML | Same as above for PLL. |
| `speedcubedb/f2l.html` | [speedcubedb.com/a/3x3/F2L](https://speedcubedb.com/a/3x3/F2L) | HTML | Same as above for F2L. |

## Why we keep these

These files are the inputs to whatever normalization / merge logic we run.
Checking them in means:

- The pipeline is reproducible without making fresh HTTP requests every time.
- We can diff future fetches against the snapshot to see what changed upstream.
- The algdb snapshot's upstream URL could disappear; this is a safety net.

## What is and isn't merged

All three sources flow into `data/methods/cfop/`:

- `algdb` — drives the base list of cases and algorithms via
  `tools/scrape/import_algdb.py`. Each case's `algorithms` array is in
  algdb's upvote order; the first entry is marked `popularity: primary`.
- `jperm` — adds `jperm_group` and `probability_weight` to each case and
  marks the matching algorithm with `jperm_recommended: true` (when JPerm's
  top alg appears in our list). Has no F2L data.
- `speedcubedb` — adds `community_votes` to matching algorithms and marks
  the canonical pick with `scdb_standard: true`.

The merge is run via `tools/normalize/merge_sources.py` after the parse
scripts (`parse_jperm.py`, `parse_speedcubedb.py`) have produced their
intermediate JSON under each source's `parsed/` subdirectory. The merge is
**enrichment-only** — it never reorders, rewrites, or adds algorithms.
Algorithm matching uses a strict normalizer (whitespace + parens stripped,
unicode primes folded); notation differences like `Uw` vs `u` count as
non-matches.

## Licensing

None of the sources publish a clear data license. Treat as analysis-only,
personal-use, not for redistribution.

"""Validate stage JSON files against the schema and run cross-file invariants."""

from __future__ import annotations

import json
import sys
from collections.abc import Iterator
from pathlib import Path

import jsonschema

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "data" / "schema" / "algorithm.schema.json"
METHODS_DIR = REPO_ROOT / "data" / "methods"


def iter_stage_files() -> Iterator[Path]:
    yield from sorted(METHODS_DIR.glob("*/*.json"))


def validate_file(path: Path, schema: dict[str, object]) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON: {exc}"]

    validator = jsonschema.Draft202012Validator(schema)
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"{path}: {loc}: {err.message}")

    case_ids: dict[str, int] = {}
    for case in data.get("cases", []):
        cid = case.get("id")
        if not isinstance(cid, str):
            continue
        case_ids[cid] = case_ids.get(cid, 0) + 1
    for cid, count in case_ids.items():
        if count > 1:
            errors.append(f"{path}: duplicate case id '{cid}' (appears {count} times)")

    return errors


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text())
    all_errors: list[str] = []
    files = list(iter_stage_files())
    if not files:
        print(f"no stage files found under {METHODS_DIR}", file=sys.stderr)
        return 1
    for path in files:
        errs = validate_file(path, schema)
        all_errors.extend(errs)
        status = "ok" if not errs else f"{len(errs)} error(s)"
        print(f"{path.relative_to(REPO_ROOT)}: {status}")
    if all_errors:
        print("", file=sys.stderr)
        for err in all_errors:
            print(err, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

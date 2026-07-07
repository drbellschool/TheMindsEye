#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.ingest.texas_portal import TexasPortalAdapter


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Search or ingest a Texas Portal source candidate.")
    parser.add_argument("--query", help="Search query for Portal to Texas History.")
    parser.add_argument("--ark", help="Portal ARK reference or item URL to ingest.")
    parser.add_argument("--cache-dir", type=Path, default=None, help="Override raw cache directory.")
    parser.add_argument(
        "--normalized-dir",
        type=Path,
        default=None,
        help="Override normalized output directory.",
    )
    parser.add_argument("--limit", type=int, default=10, help="Maximum search hits to print.")
    parser.add_argument("--base-url", default="https://texashistory.unt.edu", help="Portal base URL.")
    args = parser.parse_args(argv)

    if bool(args.query) == bool(args.ark):
        parser.error("provide exactly one of --query or --ark")

    adapter = TexasPortalAdapter(
        repo_root=ROOT,
        cache_dir=args.cache_dir,
        normalized_dir=args.normalized_dir,
        base_url=args.base_url,
    )

    if args.query:
        result = adapter.search(args.query, limit=args.limit)
        print(json.dumps(asdict(result), indent=2, sort_keys=True))
        return 0

    snapshot = adapter.fetch_item(args.ark)
    saved_to = adapter.write_normalized_snapshot(snapshot)
    payload = {
        "saved_to": str(saved_to),
        "snapshot": asdict(snapshot),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.community_web.server import make_handler as _make_handler


def make_handler(town_slug: str = "texarkana", state_dir: Path | None = None):
    return _make_handler(
        town_slug=town_slug,
        state_dir=state_dir,
        root_redirect_target=f"/{town_slug}/community-dashboard",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the legacy Texarkana compatibility view.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind. Defaults to 127.0.0.1.")
    parser.add_argument("--port", default=8765, type=int, help="Port to bind. Defaults to 8765.")
    parser.add_argument("--town", default="texarkana", help="Town slug to render. Defaults to texarkana.")
    parser.add_argument(
        "--state-dir",
        type=Path,
        default=None,
        help="Directory for local review state. Defaults to the town local-cache review_state folder.",
    )
    args = parser.parse_args(argv)

    server = ThreadingHTTPServer(
        (args.host, args.port),
        make_handler(
            town_slug=args.town,
            state_dir=args.state_dir,
            root_redirect_target=f"/{args.town}/community-dashboard",
        ),
    )
    url = f"http://{args.host}:{args.port}/{args.town}/community-dashboard"
    print(f"Serving The Mind's Eye town view at {url}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping town view server.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

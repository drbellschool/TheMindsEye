#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_town_package
from mindseye.web_view import render_town_package_page


def make_handler(town_slug: str) -> type[BaseHTTPRequestHandler]:
    class TownViewHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/health":
                self._send_text("ok\n", "text/plain; charset=utf-8")
                return
            if path not in {"/", f"/{town_slug}"}:
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            try:
                package = load_town_package(ROOT, town_slug)
                html = render_town_package_page(package)
            except Exception as exc:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                return

            self._send_text(html, "text/html; charset=utf-8")

        def log_message(self, format: str, *args: object) -> None:
            sys.stderr.write("town-view: " + format % args + "\n")

        def _send_text(self, content: str, content_type: str) -> None:
            body = content.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return TownViewHandler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the local read-only Mind's Eye town package view.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind. Defaults to 127.0.0.1.")
    parser.add_argument("--port", default=8765, type=int, help="Port to bind. Defaults to 8765.")
    parser.add_argument("--town", default="texarkana", help="Town slug to render. Defaults to texarkana.")
    args = parser.parse_args(argv)

    server = ThreadingHTTPServer((args.host, args.port), make_handler(args.town))
    url = f"http://{args.host}:{args.port}/"
    print(f"Serving The Mind's Eye read-only town view at {url}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping town view server.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_town_package
from mindseye.building_data import load_building_manifest
from mindseye.community_review import build_community_review_packet
from mindseye.models import MindseyeDataError
from mindseye.review_state import append_review_event, build_building_review_event, build_community_review_event
from mindseye.web_view import render_town_package_page


def make_handler(town_slug: str, state_dir: Path | None = None) -> type[BaseHTTPRequestHandler]:
    runtime_state_dir = (
        Path(state_dir)
        if state_dir is not None
        else ROOT / "data" / "towns" / town_slug / "local_cache" / "review_state"
    )

    class TownViewHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/health":
                self._send_text("ok\n", "text/plain; charset=utf-8")
                return
            if path == "/":
                self._redirect(f"/{town_slug}#community-dashboard", HTTPStatus.FOUND)
                return
            if path not in {"/", f"/{town_slug}"}:
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            try:
                package = load_town_package(ROOT, town_slug)
                html = render_town_package_page(package, town_slug=town_slug, state_root=runtime_state_dir)
            except Exception as exc:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                return

            self._send_text(html, "text/html; charset=utf-8")

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            if path != "/api/review-action":
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            try:
                form_data = self._read_form_data()
                redirect_to = self._process_review_action(form_data)
            except MindseyeDataError as exc:
                self.send_error(HTTPStatus.BAD_REQUEST, str(exc))
                return
            except Exception as exc:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                return

            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", redirect_to)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            sys.stderr.write("town-view: " + format % args + "\n")

        def _read_form_data(self) -> dict[str, str]:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            raw_body = self.rfile.read(content_length).decode("utf-8") if content_length else ""
            parsed = parse_qs(raw_body, keep_blank_values=True)
            return {key: values[-1] if values else "" for key, values in parsed.items()}

        def _process_review_action(self, form_data: dict[str, str]) -> str:
            package = load_town_package(ROOT, town_slug)
            record_domain = self._require_form_value(form_data, "record_domain")
            record_id = self._require_form_value(form_data, "record_id")
            return_to = self._normalize_return_to(form_data.get("return_to", ""))

            if record_domain == "community_review":
                record_group = self._require_form_value(form_data, "record_group")
                review_packet = build_community_review_packet(
                    package,
                    town_slug=town_slug,
                    state_root=runtime_state_dir,
                )
                record = self._find_review_record(review_packet, record_group, record_id)
                if record is None:
                    raise MindseyeDataError(f"community review record not found: {record_id}")

                event = build_community_review_event(
                    town_slug=town_slug,
                    record_group=record_group,
                    record_id=record_id,
                    review_status=self._require_form_value(form_data, "review_status"),
                    historical_basis=self._require_form_value(form_data, "historical_basis"),
                    notes=form_data.get("notes", ""),
                    return_to=return_to,
                )
                append_review_event(runtime_state_dir, event)
                return return_to

            if record_domain == "building":
                manifest = load_building_manifest(ROOT, town_slug, state_root=runtime_state_dir)
                record = self._find_building_record(manifest, record_id)
                if record is None:
                    raise MindseyeDataError(f"building record not found: {record_id}")
                if record.review_record_id is None or record.identity_status not in {"reviewed", "approved"}:
                    raise MindseyeDataError(f"building record is not a reviewed anchor: {record_id}")

                event = build_building_review_event(
                    town_slug=town_slug,
                    record_id=record_id,
                    identity_status=self._require_form_value(form_data, "identity_status"),
                    identity_basis=self._require_form_value(form_data, "identity_basis"),
                    visual_detail_status=self._require_form_value(form_data, "visual_detail_status"),
                    notes=form_data.get("notes", ""),
                    return_to=return_to,
                )
                if event["overrides"]["identity_status"] not in {"reviewed", "approved"}:
                    raise MindseyeDataError("building editor only accepts reviewed or approved identity_status")
                append_review_event(runtime_state_dir, event)
                return return_to

            raise MindseyeDataError(f"unsupported record_domain: {record_domain}")

        def _find_review_record(
            self,
            review_packet: dict[str, object],
            record_group: str,
            record_id: str,
        ) -> dict[str, object] | None:
            records = review_packet.get(record_group)
            if not isinstance(records, list):
                return None
            for record in records:
                if isinstance(record, dict) and str(record.get("review_record_id", "")) == record_id:
                    return record
            return None

        def _find_building_record(self, manifest: object, record_id: str):
            buildings = getattr(manifest, "buildings", ())
            for record in buildings:
                if getattr(record, "building_id", "") == record_id:
                    return record
            return None

        def _require_form_value(self, form_data: dict[str, str], key: str) -> str:
            value = form_data.get(key, "").strip()
            if not value:
                raise MindseyeDataError(f"missing form field: {key}")
            return value

        def _normalize_return_to(self, raw_return_to: str) -> str:
            target = raw_return_to.strip()
            if not target:
                target = "#community-dashboard"
            if target.startswith("#"):
                return f"/{town_slug}{target}"
            if target.startswith("/") and "://" not in target and not target.startswith("//"):
                return target
            raise MindseyeDataError("invalid return_to target")

        def _send_text(self, content: str, content_type: str) -> None:
            body = content.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _redirect(self, location: str, status: HTTPStatus = HTTPStatus.SEE_OTHER) -> None:
            self.send_response(status)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()

    return TownViewHandler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the local Mind's Eye town package view.")
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

    server = ThreadingHTTPServer((args.host, args.port), make_handler(args.town, args.state_dir))
    url = f"http://{args.host}:{args.port}/{args.town}#community-dashboard"
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

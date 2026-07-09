from __future__ import annotations

import argparse
import mimetypes
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ..building_data import load_building_manifest
from ..community_review import build_community_review_packet
from ..models import MindseyeDataError
from ..review_state import append_review_event, build_building_review_event, build_community_review_event
from ..town_loader import load_town_package
from .routes import normalize_path, resolve_route, route_path
from .template_engine import TemplateEngine
from .view_models import build_community_page_model

ROOT = Path(__file__).resolve().parents[3]
TEMPLATE_ROOT = Path(__file__).resolve().parent / "templates"
STATIC_ROOT = Path(__file__).resolve().parent / "static"


def make_handler(
    town_slug: str = "texarkana",
    state_dir: Path | None = None,
    repo_root: Path | None = None,
    root_redirect_target: str = "/community",
) -> type[BaseHTTPRequestHandler]:
    runtime_root = Path(repo_root) if repo_root is not None else ROOT
    runtime_state_dir = (
        Path(state_dir)
        if state_dir is not None
        else runtime_root / "data" / "towns" / town_slug / "local_cache" / "review_state"
    )
    template_engine = TemplateEngine(TEMPLATE_ROOT)

    class CommunityWebHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = normalize_path(urlparse(self.path).path)
            if path == "/health":
                self._send_text("ok\n", "text/plain; charset=utf-8")
                return
            if path == "/":
                self._redirect(root_redirect_target, HTTPStatus.FOUND)
                return
            if path.startswith("/static/"):
                self._serve_static(path)
                return

            route = resolve_route(path)
            if route is None:
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            try:
                model = build_community_page_model(
                    route.route_id,
                    repo_root=runtime_root,
                    town_slug=town_slug,
                    state_root=runtime_state_dir,
                    engine=template_engine,
                )
                route_shell_html = template_engine.render(route.template_name, model)
                model = dict(model)
                model["route_shell_html"] = route_shell_html
                model.setdefault(
                    "footer_note",
                    "Route-based community shell. Legacy debug stays under /debug.",
                )
                html = template_engine.render("base.html", model)
            except Exception as exc:
                self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
                return

            self._send_text(html, "text/html; charset=utf-8")

        def do_POST(self) -> None:
            path = normalize_path(urlparse(self.path).path)
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
            sys.stderr.write("community-web: " + format % args + "\n")

        def _serve_static(self, request_path: str) -> None:
            relative = request_path.removeprefix("/static/")
            static_path = (STATIC_ROOT / relative).resolve()
            if STATIC_ROOT != static_path and STATIC_ROOT not in static_path.parents:
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return
            if not static_path.exists() or not static_path.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "Not found")
                return

            content_type, _ = mimetypes.guess_type(str(static_path))
            if content_type is None:
                content_type = "image/svg+xml" if static_path.suffix == ".svg" else "application/octet-stream"
            body = static_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_form_data(self) -> dict[str, str]:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            raw_body = self.rfile.read(content_length).decode("utf-8") if content_length else ""
            parsed = parse_qs(raw_body, keep_blank_values=True)
            return {key: values[-1] if values else "" for key, values in parsed.items()}

        def _process_review_action(self, form_data: dict[str, str]) -> str:
            package = load_town_package(runtime_root, town_slug)
            record_domain = self._require_form_value(form_data, "record_domain")
            record_id = self._require_form_value(form_data, "record_id")
            return_to = self._normalize_return_to(form_data.get("return_to", ""))

            if record_domain == "community_review":
                record_group = self._require_form_value(form_data, "record_group")
                review_packet = build_community_review_packet(
                    package,
                    repo_root=runtime_root,
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
                manifest = load_building_manifest(runtime_root, town_slug, state_root=runtime_state_dir)
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
                target = "#community"
            if target.startswith("#"):
                route = target.lstrip("#").strip("/")
                if not route or route == "community":
                    return route_path("community")
                if route == "community-dashboard":
                    return route_path("community")
                return f"/community/{route}"
            if target.startswith("/texarkana/"):
                return target
            if target.startswith("/community") or target == "/debug":
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

    return CommunityWebHandler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the route-based Community web shell.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind. Defaults to 127.0.0.1.")
    parser.add_argument("--port", default=8765, type=int, help="Port to bind. Defaults to 8765.")
    parser.add_argument("--town", default="texarkana", help="Town slug to render. Defaults to texarkana.")
    parser.add_argument(
        "--state-dir",
        type=Path,
        default=None,
        help="Directory for local review state. Defaults to the town local-cache review_state folder.",
    )
    parser.add_argument(
        "--root-redirect-target",
        default="/community",
        help="Location to use for / redirects. Defaults to /community.",
    )
    args = parser.parse_args(argv)

    server = ThreadingHTTPServer(
        (args.host, args.port),
        make_handler(
            town_slug=args.town,
            state_dir=args.state_dir,
            root_redirect_target=args.root_redirect_target,
        ),
    )
    print(f"Serving The Mind's Eye Community web shell at http://{args.host}:{args.port}{args.root_redirect_target}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Community web shell server.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

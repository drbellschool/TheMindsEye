from __future__ import annotations

import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.community_web.server import make_handler


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class CommunityWebShellTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.state_dir = Path(self.tempdir.name) / "review_state"
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler("texarkana", self.state_dir))
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        time.sleep(0.05)

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)
        self.tempdir.cleanup()

    def test_required_files_exist(self) -> None:
        required_files = [
            "src/mindseye/community_web/__init__.py",
            "src/mindseye/community_web/server.py",
            "src/mindseye/community_web/routes.py",
            "src/mindseye/community_web/view_models.py",
            "src/mindseye/community_web/template_engine.py",
            "src/mindseye/community_web/templates/base.html",
            "src/mindseye/community_web/templates/community_dashboard.html",
            "src/mindseye/community_web/templates/map_auditor.html",
            "src/mindseye/community_web/templates/building_auditor.html",
            "src/mindseye/community_web/templates/people_auditor.html",
            "src/mindseye/community_web/templates/source_provenance_inspector.html",
            "src/mindseye/community_web/templates/release_gate.html",
            "src/mindseye/community_web/templates/debug.html",
            "src/mindseye/community_web/templates/partials/topbar.html",
            "src/mindseye/community_web/templates/partials/release_gate_card.html",
            "src/mindseye/community_web/templates/partials/status_chips.html",
            "src/mindseye/community_web/templates/partials/review_legend.html",
            "src/mindseye/community_web/templates/partials/evidence_inspector.html",
            "src/mindseye/community_web/templates/partials/route_card.html",
            "src/mindseye/community_web/templates/partials/map_controls.html",
            "src/mindseye/community_web/static/css/theme.css",
            "src/mindseye/community_web/static/css/layout.css",
            "src/mindseye/community_web/static/css/community_dashboard.css",
            "src/mindseye/community_web/static/css/map_auditor.css",
            "src/mindseye/community_web/static/css/building_auditor.css",
            "src/mindseye/community_web/static/css/people_auditor.css",
            "src/mindseye/community_web/static/js/community_dashboard.js",
            "src/mindseye/community_web/static/js/map_auditor.js",
            "src/mindseye/community_web/static/js/building_auditor.js",
            "src/mindseye/community_web/static/js/people_auditor.js",
            "src/mindseye/community_web/static/textures/parchment.svg",
            "src/mindseye/community_web/static/textures/dark-panel.svg",
            "src/mindseye/community_web/static/textures/brass-border.svg",
            "src/mindseye/community_web/static/textures/aged-map-paper.svg",
            "src/mindseye/community_web/static/textures/blueprint-grid.svg",
            "src/mindseye/community_web/static/icons/.gitkeep",
            "scripts/serve_community_app.py",
        ]
        for relative in required_files:
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).exists(), relative)

    def test_root_redirects_to_community(self) -> None:
        opener = urllib.request.build_opener(NoRedirectHandler())
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}/", method="GET")

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            opener.open(request)

        self.assertEqual(ctx.exception.code, 302)
        self.assertEqual(ctx.exception.headers.get("Location"), "/community")
        ctx.exception.close()

    def test_routes_render_with_titles(self) -> None:
        route_expectations = {
            "/community": ["Community Dashboard", "Community Verification Console", "Primary Routes"],
            "/community/map-auditor": ["Map Auditor", "Stitched Map Workspace", "Map Controls"],
            "/community/building-auditor": ["Building Auditor", "Footprint Review", "Art Preview"],
            "/community/people-auditor": ["People Auditor", "Source Issue Browser", "Business Review Workspace"],
            "/community/source-provenance-inspector": ["Source / Provenance Inspector", "Source Metadata", "Citation and Rights"],
            "/community/release-gate": ["Release Gate Report", "Blockers", "Readiness Matrix"],
        }
        for path, expected_fragments in route_expectations.items():
            with self.subTest(path=path):
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}") as response:
                    html = response.read().decode("utf-8")
                for fragment in expected_fragments:
                    self.assertIn(fragment, html)
                self.assertIn("/static/css/theme.css", html)
                self.assertIn("/static/css/layout.css", html)

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/community") as response:
            dashboard_html = response.read().decode("utf-8")
        self.assertIn("/static/css/community_dashboard.css", dashboard_html)
        self.assertIn("/static/js/community_dashboard.js", dashboard_html)

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/community/map-auditor") as response:
            map_html = response.read().decode("utf-8")
        self.assertIn("/static/css/map_auditor.css", map_html)
        self.assertIn("/static/js/map_auditor.js", map_html)

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/community/building-auditor") as response:
            building_html = response.read().decode("utf-8")
        self.assertIn("/static/css/building_auditor.css", building_html)
        self.assertIn("/static/js/building_auditor.js", building_html)

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/community/people-auditor") as response:
            people_html = response.read().decode("utf-8")
        self.assertIn("/static/css/people_auditor.css", people_html)
        self.assertIn("/static/js/people_auditor.js", people_html)

    def test_static_assets_serve(self) -> None:
        for path in [
            "/static/css/theme.css",
            "/static/css/layout.css",
            "/static/textures/parchment.svg",
            "/static/js/community_dashboard.js",
        ]:
            with self.subTest(path=path):
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}") as response:
                    body = response.read()
                    self.assertGreater(len(body), 0)

    def test_debug_route_embeds_legacy_view(self) -> None:
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/debug") as response:
            html = response.read().decode("utf-8")

        self.assertIn("Town Package Status", html)
        self.assertIn("Debug Snapshot", html)

    def test_server_does_not_contain_one_giant_html_string(self) -> None:
        server_text = (ROOT / "src/mindseye/community_web/server.py").read_text(encoding="utf-8")
        self.assertNotIn("<html", server_text)
        self.assertNotIn("<style", server_text)
        self.assertNotIn("STYLE_BLOCK", server_text)


if __name__ == "__main__":
    unittest.main()


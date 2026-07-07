from __future__ import annotations

import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "src"))

from serve_town_view import make_handler
from mindseye import build_community_review_packet, load_building_manifest, load_town_package


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ServeTownViewTests(unittest.TestCase):
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

    def test_root_redirects_to_community_dashboard(self) -> None:
        opener = urllib.request.build_opener(NoRedirectHandler())
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}/", method="GET")

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            opener.open(request)

        self.assertEqual(ctx.exception.code, 302)
        self.assertEqual(ctx.exception.headers.get("Location"), "/texarkana#community-dashboard")
        ctx.exception.close()

    def test_texarkana_path_returns_dashboard_html(self) -> None:
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/texarkana") as response:
            html = response.read().decode("utf-8")

        self.assertIn("Community Verification Console", html)
        self.assertIn("community-dashboard", html)

    def test_post_review_action_persists_people_update(self) -> None:
        package = load_town_package(ROOT, "texarkana")
        packet = build_community_review_packet(package)
        person_record = packet["people"][0]
        payload = urlencode(
            {
                "record_domain": "community_review",
                "record_group": "people",
                "record_id": person_record["review_record_id"],
                "review_status": "confirmed",
                "historical_basis": "verified_fact",
                "notes": "Saved from the HTTP review form.",
                "return_to": "#people-auditor",
            }
        ).encode("utf-8")
        opener = urllib.request.build_opener(NoRedirectHandler())
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/review-action",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            opener.open(request)

        self.assertEqual(ctx.exception.code, 303)
        self.assertEqual(ctx.exception.headers.get("Location"), "/texarkana#people-auditor")
        ctx.exception.close()

        replayed_packet = build_community_review_packet(package, state_root=self.state_dir)
        replayed_people = {record["review_record_id"]: record for record in replayed_packet["people"]}
        self.assertEqual(replayed_people[person_record["review_record_id"]]["review_status"], "confirmed")
        self.assertIn("Saved from the HTTP review form.", replayed_people[person_record["review_record_id"]]["notes"])

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/texarkana") as response:
            html = response.read().decode("utf-8")

        self.assertIn("Saved from the HTTP review form.", html)
        self.assertIn(person_record["review_record_id"], html)

    def test_post_review_action_persists_building_update(self) -> None:
        building_manifest = load_building_manifest(ROOT, "texarkana")
        reviewed_building = next(
            building
            for building in building_manifest.buildings
            if building.review_record_id is not None and building.identity_status in {"reviewed", "approved"}
        )
        payload = urlencode(
            {
                "record_domain": "building",
                "record_id": reviewed_building.building_id,
                "identity_status": "approved",
                "identity_basis": "verified_fact",
                "visual_detail_status": "verified",
                "notes": "Saved from the building review form.",
                "return_to": "#map-auditor",
            }
        ).encode("utf-8")
        opener = urllib.request.build_opener(NoRedirectHandler())
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/review-action",
            data=payload,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            opener.open(request)

        self.assertEqual(ctx.exception.code, 303)
        self.assertEqual(ctx.exception.headers.get("Location"), "/texarkana#map-auditor")
        ctx.exception.close()

        replayed_building_manifest = load_building_manifest(ROOT, "texarkana", state_root=self.state_dir)
        replayed_building = next(
            building for building in replayed_building_manifest.buildings if building.building_id == reviewed_building.building_id
        )
        self.assertEqual(replayed_building.identity_status, "approved")
        self.assertEqual(replayed_building.visual_detail_status, "verified")
        self.assertIn("Saved from the building review form.", replayed_building.notes)

        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/texarkana") as response:
            html = response.read().decode("utf-8")

        self.assertIn("Saved from the building review form.", html)
        self.assertIn(reviewed_building.building_id, html)


if __name__ == "__main__":
    unittest.main()

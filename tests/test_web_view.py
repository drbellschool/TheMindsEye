from dataclasses import replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    build_sanborn_image_intake_report,
    build_town_package_view_model,
    load_town_package,
    render_town_package_page,
)


class WebViewTests(unittest.TestCase):
    def test_view_model_uses_loaded_package_and_mission_packet(self):
        package = load_town_package(ROOT, "texarkana")
        model = build_town_package_view_model(package)
        intake_report = build_sanborn_image_intake_report(ROOT, "texarkana")
        present_files = intake_report["present_files"]
        expected_files = intake_report["expected_files"]
        missing_sheet_ids = intake_report["missing_sheet_ids"]

        self.assertEqual(model["package"]["package_id"], "texarkana_1885")
        self.assertEqual(model["mission"]["mission_id"], "mission_texarkana_1885_001")
        self.assertGreaterEqual(len(model["sources"]), 1)
        self.assertGreaterEqual(len(model["locations"]), 1)
        self.assertGreaterEqual(len(model["claims"]), 1)
        self.assertGreaterEqual(len(model["mission"]["teacher_source_notes"]), 1)
        self.assertEqual(model["readiness"]["mission_id"], "mission_texarkana_1885_001")
        self.assertFalse(model["readiness"]["classroom_ready"])
        self.assertEqual(model["sanborn_manifest"]["sheet_count"], 5)
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["present_file_count"], len(present_files))
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["expected_file_count"], len(expected_files))
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["missing_sheet_ids"], missing_sheet_ids)
        self.assertEqual(model["sanborn_manifest"]["sheet_review"]["review_count"], 5)
        self.assertEqual(
            model["sanborn_manifest"]["sheet_review"]["reviews"][0]["sheet_id"],
            "sheet_texarkana_1885_sanborn_001",
        )

    def test_rendered_page_contains_read_only_town_data(self):
        package = load_town_package(ROOT, "texarkana")
        html = render_town_package_page(package)
        intake_report = build_sanborn_image_intake_report(ROOT, "texarkana")
        present_file_count = len(intake_report["present_files"])
        expected_file_count = len(intake_report["expected_files"])

        self.assertIn("<!doctype html>", html)
        self.assertIn("Texarkana", html)
        self.assertIn("Town Package Status", html)
        self.assertIn("source_texarkana_1885_sanborn_loc", html)
        self.assertIn("loc_texarkana_1885_001", html)
        self.assertIn("claim_texarkana_1885_003", html)
        self.assertIn("verified_fact", html)
        self.assertIn("source_based_inference", html)
        self.assertIn("fictional_gameplay", html)
        self.assertIn("Teacher Source Notes", html)
        self.assertIn("Library of Congress", html)
        self.assertIn("Sanborn Sheet Manifest", html)
        self.assertIn("sheet_texarkana_1885_sanborn_005", html)
        self.assertIn("https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=5", html)
        self.assertIn("not_started", html)
        self.assertIn("deferred", html)
        self.assertIn("Sanborn Asset Manifest", html)
        self.assertIn("download_page_recorded_direct_binary_url_unresolved", html)
        self.assertIn("no binaries committed", html)
        self.assertIn("Sanborn Image Intake", html)
        self.assertIn("sheet_texarkana_1885_sanborn_001.jpg", html)
        self.assertIn("Missing sheet IDs", html)
        self.assertIn(f"{present_file_count} present", html)
        self.assertIn(f"{expected_file_count} expected", html)
        self.assertIn("Sanborn Sheet Review", html)
        self.assertIn("5 review notes", html)
        self.assertIn("Kizer Lumber Co's Planning Mill", html)
        self.assertIn("The Arkansaw Cotton Seed Oil Mill.", html)

    def test_rendered_page_contains_classroom_readiness_report(self):
        package = load_town_package(ROOT, "texarkana")
        html = render_town_package_page(package)

        self.assertIn("Classroom Readiness", html)
        self.assertIn("Needs teacher review", html)
        self.assertIn("Current Blockers", html)
        self.assertIn("Readiness Checks", html)
        self.assertIn("placeholder_locations", html)
        self.assertIn("Placeholder map/location records require teacher review", html)
        self.assertIn("loc_texarkana_1885_001", html)
        self.assertIn("historical_source_notes", html)
        self.assertIn("pass", html)

    def test_rendered_page_escapes_dynamic_text(self):
        package = load_town_package(ROOT, "texarkana")
        unsafe_package = replace(package, town_name="<Texarkana>")

        html = render_town_package_page(unsafe_package)

        self.assertIn("&lt;Texarkana&gt;", html)
        self.assertNotIn("<Texarkana>", html)


if __name__ == "__main__":
    unittest.main()

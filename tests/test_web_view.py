from dataclasses import replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_town_package_view_model, load_town_package, render_town_package_page


class WebViewTests(unittest.TestCase):
    def test_view_model_uses_loaded_package_and_mission_packet(self):
        package = load_town_package(ROOT, "texarkana")
        model = build_town_package_view_model(package)

        self.assertEqual(model["package"]["package_id"], "texarkana_1885")
        self.assertEqual(model["mission"]["mission_id"], "mission_texarkana_1885_001")
        self.assertGreaterEqual(len(model["sources"]), 1)
        self.assertGreaterEqual(len(model["locations"]), 1)
        self.assertGreaterEqual(len(model["claims"]), 1)
        self.assertGreaterEqual(len(model["mission"]["teacher_source_notes"]), 1)

    def test_rendered_page_contains_read_only_town_data(self):
        package = load_town_package(ROOT, "texarkana")
        html = render_town_package_page(package)

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

    def test_rendered_page_escapes_dynamic_text(self):
        package = load_town_package(ROOT, "texarkana")
        unsafe_package = replace(package, town_name="<Texarkana>")

        html = render_town_package_page(unsafe_package)

        self.assertIn("&lt;Texarkana&gt;", html)
        self.assertNotIn("<Texarkana>", html)


if __name__ == "__main__":
    unittest.main()

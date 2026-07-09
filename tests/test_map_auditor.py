from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_map_auditor_packet, load_town_package


class MapAuditorTests(unittest.TestCase):
    def test_map_auditor_packet_exposes_map_building_and_provenance_workspaces(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_map_auditor_packet(package)

        self.assertEqual(packet["dashboard_title"], "Texarkana Community Map Auditor")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["progress_summary"]["sheet_reviewed"], 5)
        self.assertEqual(packet["progress_summary"]["building_reviewed"], 2)
        self.assertEqual(packet["progress_summary"]["building_art_approved"], 2)
        self.assertEqual(packet["selected_sheet"]["sheet_label"], "003")
        self.assertEqual(packet["selected_building"]["building_id"], "building_texarkana_1885_003")
        self.assertEqual(packet["stitch_workspace"]["manifest_control_point_status"], "not_started")
        self.assertEqual(packet["stitch_workspace"]["control_point_status"], "partial")
        self.assertEqual(packet["georeference_workspace"]["control_point_count"], 3)
        self.assertEqual(packet["composite_manifest"]["release_gate_status"], "blocked")
        self.assertEqual(packet["provenance_trail"]["source_issue"]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(packet["people_review"][0]["display_name"], "A. S. Blythe")
        self.assertIn("Open Building Auditor", [link["label"] for link in packet["navigation_links"]])
        self.assertEqual(packet["navigation_links"][2]["href"], "#people-auditor")
        self.assertIn("Community", packet["year_gate"]["rule"])
        self.assertEqual(packet["layer_stack"][0]["label"], "Base Map Layer")
        self.assertEqual(packet["layer_stack"][-1]["label"], "Evidence / Provenance Layer")
        self.assertGreaterEqual(len(packet["coverage_grid"]), 1)


if __name__ == "__main__":
    unittest.main()

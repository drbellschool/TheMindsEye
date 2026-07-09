from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_community_dashboard_packet, load_town_package


class CommunityDashboardTests(unittest.TestCase):
    def test_dashboard_packet_exposes_review_lanes_and_scope_levels(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_community_dashboard_packet(package)

        self.assertEqual(packet["dashboard_title"], "Texarkana Community Verification Console")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["year_gate"]["start_year"], 1875)
        self.assertEqual(packet["year_gate"]["end_year"], 1895)
        self.assertEqual([scope["scope_id"] for scope in packet["scope_ladder"]], ["community", "county", "state"])
        self.assertEqual(packet["status_chips"][3]["label"], "People / Businesses")
        self.assertEqual(packet["status_chips"][3]["value"], 2)
        self.assertEqual(
            {domain["domain_id"]: domain["record_count"] for domain in packet["review_domains"]}["people"],
            1,
        )
        self.assertEqual(
            {domain["domain_id"]: domain["record_count"] for domain in packet["review_domains"]}["businesses"],
            1,
        )
        self.assertEqual(packet["navigation_links"][0]["label"], "Open Map Auditor")
        self.assertEqual(packet["navigation_links"][1]["href"], "#building-auditor")
        self.assertEqual(packet["navigation_links"][2]["href"], "#people-auditor")
        self.assertGreaterEqual(len(packet["review_history"]), 2)
        self.assertEqual(packet["community_review"]["source_issues"][0]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(packet["entity_review_panels"]["people"][0]["display_name"], "A. S. Blythe")
        self.assertIn("Exchange", packet["entity_review_panels"]["businesses"][0]["display_name"])
        self.assertEqual(packet["evidence_inspector"]["selected_scope"], "community")
        self.assertEqual(packet["evidence_inspector"]["focus"]["focus_type"], "building_record")
        self.assertEqual(packet["evidence_inspector"]["focus"]["focus_label"], "Building Identity")
        self.assertEqual(packet["release_gate"]["state"], "blocked")


if __name__ == "__main__":
    unittest.main()

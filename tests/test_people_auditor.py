from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_people_auditor_packet, load_town_package


class PeopleAuditorTests(unittest.TestCase):
    def test_people_auditor_packet_exposes_issue_people_and_business_workspaces(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_people_auditor_packet(package)

        self.assertEqual(packet["dashboard_title"], "Texarkana People Auditor")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["review_queue_status"], "seeded_with_issue_adapter")
        self.assertEqual(packet["source_issue_count"], 1)
        self.assertEqual(packet["progress_summary"]["overall_percent"], 50)
        self.assertEqual(packet["progress_summary"]["resolved_total"], 1)
        self.assertEqual(packet["selected_issue"]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(packet["selected_person"]["display_name"], "A. S. Blythe")
        self.assertEqual(packet["selected_business"]["display_name"], "Exchange (H. T. Huey Proprietor)")
        self.assertEqual(packet["people_review"][0]["source_issue"]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(packet["businesses_review"][0]["source_issue"]["page"], "3 of 4")
        self.assertIn("Verified Fact", [item["label"] for item in packet["review_legend"]])
        self.assertEqual(packet["navigation_links"][1]["href"], "#map-auditor")
        self.assertEqual(packet["navigation_links"][2]["href"], "#building-auditor")


if __name__ == "__main__":
    unittest.main()

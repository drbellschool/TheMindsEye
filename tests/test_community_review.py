from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_community_review_packet, load_town_package


class CommunityReviewTests(unittest.TestCase):
    def test_review_packet_exposes_person_business_records_and_source_issue(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_community_review_packet(package)

        self.assertEqual(packet["community_review_manifest_id"], "community_texarkana_1885_review_manifest")
        self.assertEqual(packet["review_queue_status"], "seeded_with_issue_adapter")
        self.assertEqual(packet["source_issue_count"], 1)
        self.assertEqual(len(packet["source_issues"]), 1)
        self.assertEqual(packet["source_issues"][0]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(packet["source_issues"][0]["page"], "3 of 4")
        self.assertEqual(len(packet["people"]), 1)
        self.assertEqual(packet["people"][0]["display_name"], "A. S. Blythe")
        self.assertEqual(packet["people"][0]["source_issue"]["publication_title"], "Daily Texarkana Democrat")
        self.assertEqual(len(packet["businesses"]), 1)
        self.assertIn("Exchange", packet["businesses"][0]["display_name"])
        self.assertEqual(packet["businesses"][0]["source_issue"]["source_issue_id"], "issue_texarkana_1893_daily_texarkana_democrat_098_p3")


if __name__ == "__main__":
    unittest.main()

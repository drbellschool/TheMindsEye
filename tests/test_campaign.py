from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_campaign_packet, load_town_package


class CampaignTests(unittest.TestCase):
    def test_campaign_packet_defines_mastery_progression_and_year_gate(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_campaign_packet(package)

        self.assertEqual(packet["campaign_id"], "campaign_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["mastery_checkpoint_count"], 16)
        self.assertEqual(len(packet["mastery_checkpoints"]), 16)
        self.assertEqual([band["band_number"] for band in packet["mastery_bands"]], [1, 2, 3, 4])
        self.assertEqual(packet["mission_sequence_model"]["preferred_model"], "flexible")
        self.assertFalse(packet["mission_sequence_model"]["mission_count_is_fixed"])
        self.assertEqual(packet["year_gate"]["start_year"], 1875)
        self.assertEqual(packet["year_gate"]["end_year"], 1895)
        self.assertEqual(packet["preassessment_placement"]["entry_points"], [1, 5, 9, 13])
        self.assertTrue(packet["scope_guard"]["town_agnostic"])


if __name__ == "__main__":
    unittest.main()

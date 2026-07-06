from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_town_package
from mindseye.mission_seed import build_teacher_review_packet


class MissionSeedTests(unittest.TestCase):
    def test_teacher_packet_includes_claim_labels_and_locations(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_review_packet(package)

        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertIn("student_hook", packet)
        self.assertIn("teacher_notes", packet)
        self.assertGreaterEqual(len(packet["claims"]), 1)
        self.assertGreaterEqual(len(packet["locations"]), 1)
        self.assertTrue(all("claim_type" in claim for claim in packet["claims"]))

    def test_placeholder_mission_is_not_classroom_ready_by_default(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_review_packet(package)

        self.assertFalse(packet["classroom_ready"])
        self.assertIn("Placeholder", packet["readiness_reason"])


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_student_mission_flow_packet, load_town_package


class StudentMissionTests(unittest.TestCase):
    def test_builds_student_mission_flow_packet(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_student_mission_flow_packet(package)

        self.assertEqual(packet["flow_title"], "Student Mission Flow")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["release_state"], "blocked")
        self.assertGreaterEqual(len(packet["visible_mission_steps"]), 1)
        self.assertGreaterEqual(len(packet["selected_locations"]), 1)
        self.assertGreaterEqual(len(packet["provenance_labels"]), 1)
        self.assertGreaterEqual(len(packet["evidence_packets"]), 1)
        self.assertTrue(packet["artifact_expectation"]["provenance_required"])
        self.assertIn("evidence", packet["student_objective"].lower())


if __name__ == "__main__":
    unittest.main()

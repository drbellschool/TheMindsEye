from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_privacy_baseline_packet, load_town_package


class PrivacyBaselineTests(unittest.TestCase):
    def test_builds_privacy_baseline_packet(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_privacy_baseline_packet(package)

        self.assertEqual(packet["framework_title"], "Pilot Privacy Baseline")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["privacy_status"], "seeded")
        self.assertEqual(packet["retention_posture"], "no_saved_student_profiles")
        self.assertTrue(packet["no_pii_default"])
        self.assertTrue(packet["teacher_final_authority"])
        self.assertFalse(packet["privacy_boundary"]["student_names"])
        self.assertFalse(packet["privacy_boundary"]["student_ids"])
        self.assertFalse(packet["privacy_boundary"]["grades"])
        self.assertFalse(packet["privacy_boundary"]["saved_writing_profiles"])
        self.assertGreaterEqual(len(packet["access_controls"]), 1)
        self.assertGreaterEqual(len(packet["pilot_material_notes"]), 1)
        self.assertGreaterEqual(len(packet["retention_notes"]), 1)


if __name__ == "__main__":
    unittest.main()

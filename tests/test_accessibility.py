from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_accessibility_support_packet, load_town_package


class AccessibilitySupportTests(unittest.TestCase):
    def test_builds_accessibility_support_packet(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_accessibility_support_packet(package)

        self.assertEqual(packet["framework_title"], "Accessibility Supports")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["accessibility_status"], "seeded")
        self.assertEqual(packet["release_state"], "blocked")
        self.assertTrue(packet["support_boundary"]["teacher_authority"])
        self.assertFalse(packet["support_boundary"]["student_profile_inference"])
        self.assertFalse(packet["support_boundary"]["dynamic_scoring"])
        self.assertGreaterEqual(len(packet["support_categories"]), 1)
        self.assertGreaterEqual(len(packet["teacher_notes"]), 1)
        self.assertGreaterEqual(len(packet["mission_scaffold_notes"]), 1)


if __name__ == "__main__":
    unittest.main()

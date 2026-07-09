from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_student_data_minimization_packet, load_town_package


class StudentDataMinimizationTests(unittest.TestCase):
    def test_builds_student_data_minimization_packet(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_student_data_minimization_packet(package)

        self.assertEqual(packet["framework_title"], "Student Data Minimization Plan")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["minimization_status"], "seeded")
        self.assertEqual(packet["collection_strategy"], "instructional_minimum")
        self.assertFalse(packet["student_data_boundary"]["student_names"])
        self.assertFalse(packet["student_data_boundary"]["student_ids"])
        self.assertFalse(packet["student_data_boundary"]["grades"])
        self.assertFalse(packet["student_data_boundary"]["contact_info"])
        self.assertFalse(packet["student_data_boundary"]["home_address"])
        self.assertGreaterEqual(len(packet["default_collections"]), 1)
        self.assertGreaterEqual(len(packet["conditional_collections"]), 1)
        self.assertGreaterEqual(len(packet["prohibited_collections"]), 1)
        self.assertGreaterEqual(len(packet["pilot_questions"]), 1)


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_teacher_interface_packet, load_town_package


class TeacherInterfaceTests(unittest.TestCase):
    def test_teacher_interface_packet_exposes_dashboard_sections(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_interface_packet(package)

        self.assertEqual(packet["portal_title"], "Teacher Review & Classroom Approval")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["standards_alignment"]["workflow_title"], "Standards & TEKS Review")
        self.assertTrue(packet["teacher_scope"]["primary_subject_only"])
        self.assertIn("telegram_review", [module["module_id"] for module in packet["portal_modules"]])
        self.assertIn("postal_review", [module["module_id"] for module in packet["portal_modules"]])
        self.assertIn("teks_library", [module["module_id"] for module in packet["portal_modules"]])
        self.assertIn("behavior_law_flags", [module["module_id"] for module in packet["portal_modules"]])
        self.assertEqual(len(packet["workflow_steps"]), 7)
        self.assertEqual(packet["workflow_steps"][1]["title"], "Standards & TEKS Review")
        self.assertEqual(packet["workflow_steps"][1]["status"], "in_progress")
        self.assertIsNone(packet["summary_cards"][0]["value"])
        self.assertEqual(packet["summary_cards"][1]["status"], "not_calculated")
        self.assertEqual(packet["summary_cards"][2]["status"], "blocked")
        self.assertEqual(
            packet["review_workspace"]["exact_standard_under_review"]["alignment_id"],
            "alignment_texarkana_1885_teks_001",
        )
        self.assertEqual(
            packet["decision_panel"]["decision_actions"][0]["label"],
            "Approve TEKS Alignment",
        )
        self.assertEqual(packet["release_state"]["state"], "blocked")


if __name__ == "__main__":
    unittest.main()

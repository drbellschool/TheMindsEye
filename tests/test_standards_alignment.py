from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_standards_alignment_packet, load_town_package


class StandardsAlignmentTests(unittest.TestCase):
    def test_standards_alignment_packet_exposes_teks_review_state(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_standards_alignment_packet(package)

        self.assertEqual(packet["workflow_title"], "Standards & TEKS Review")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["teks_status"], "pending_teacher_selection")
        self.assertEqual(packet["release_gate"]["status"], "blocked")
        self.assertEqual(packet["current_standard_under_review"]["alignment_id"], "alignment_texarkana_1885_teks_001")
        self.assertEqual(packet["current_standard_under_review"]["alignment_status"], "pending_teacher_selection")
        self.assertTrue(packet["teacher_scope_policy"]["primary_subject_only"])
        self.assertTrue(packet["teacher_scope_policy"]["secondary_teks_allowed"])
        self.assertEqual(packet["secondary_alignment_tethers"], [])
        self.assertEqual(len(packet["hqim_records"]), 1)
        self.assertEqual(len(packet["teks_records"]), 1)
        self.assertIn("send_back_to_tighten_alignment", packet["decision_options"])


if __name__ == "__main__":
    unittest.main()

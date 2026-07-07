from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_assessment_evidence_packet, load_town_package


class AssessmentEvidenceTests(unittest.TestCase):
    def test_builds_assessment_evidence_packet(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_assessment_evidence_packet(package)

        self.assertEqual(packet["framework_title"], "Assessment Evidence Workflow")
        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertEqual(packet["assessment_status"], "not_scored")
        self.assertEqual(packet["release_state"], "blocked")
        self.assertEqual(packet["rubric_boundary"]["status"], "teacher_selected")
        self.assertTrue(packet["rubric_boundary"]["ai_compare_allowed"])
        self.assertTrue(packet["rubric_boundary"]["teacher_override_allowed"])
        self.assertTrue(packet["artifact_expectation"]["provenance_required"])
        self.assertEqual([level["level"] for level in packet["mastery_scale"]], [1, 2, 3, 4])
        self.assertGreaterEqual(len(packet["evidence_trail"]["teacher_source_notes"]), 1)
        self.assertGreaterEqual(len(packet["student_artifact_types"]), 1)


if __name__ == "__main__":
    unittest.main()

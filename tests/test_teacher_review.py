from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import build_teacher_approval_packet, load_teacher_review_manifest, load_town_package


class TeacherReviewTests(unittest.TestCase):
    def test_teacher_review_packet_exposes_pending_approval_state(self):
        package = load_town_package(ROOT, "texarkana")
        packet = build_teacher_approval_packet(package)

        self.assertEqual(packet["mission_id"], "mission_texarkana_1885_001")
        self.assertEqual(packet["town_package_id"], "texarkana_1885")
        self.assertFalse(packet["classroom_release_ready"])
        self.assertEqual(packet["review_status"], "pending_teacher_review")
        self.assertIn("alignment_texarkana_1885_teks_001", packet["pending_alignment_ids"])
        self.assertIn("alignment_texarkana_1885_hqim_001", packet["approved_alignment_ids"])

    def test_teacher_review_manifest_links_to_instructional_alignment(self):
        manifest = load_teacher_review_manifest(ROOT, "texarkana")

        self.assertEqual(manifest.teacher_review_manifest_id, "teacher_review_texarkana_1885_mission_001")
        self.assertEqual(manifest.instructional_manifest_id, "instructional_texarkana_1885_mission_001")
        self.assertEqual(manifest.record_count, 2)
        self.assertEqual(manifest.mission_release_status, "draft")


if __name__ == "__main__":
    unittest.main()

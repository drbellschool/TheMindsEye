from dataclasses import replace
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    build_sanborn_image_intake_report,
    build_town_package_view_model,
    load_town_package,
    render_town_package_page,
)


class WebViewTests(unittest.TestCase):
    def test_view_model_uses_loaded_package_and_mission_packet(self):
        package = load_town_package(ROOT, "texarkana")
        model = build_town_package_view_model(package)
        intake_report = build_sanborn_image_intake_report(ROOT, "texarkana")
        present_files = intake_report["present_files"]
        expected_files = intake_report["expected_files"]
        missing_sheet_ids = intake_report["missing_sheet_ids"]

        self.assertEqual(model["package"]["package_id"], "texarkana_1885")
        self.assertEqual(model["mission"]["mission_id"], "mission_texarkana_1885_001")
        self.assertGreaterEqual(len(model["sources"]), 1)
        self.assertGreaterEqual(len(model["locations"]), 1)
        self.assertGreaterEqual(len(model["claims"]), 1)
        self.assertGreaterEqual(len(model["mission"]["teacher_source_notes"]), 1)
        self.assertEqual(model["readiness"]["mission_id"], "mission_texarkana_1885_001")
        self.assertFalse(model["readiness"]["classroom_ready"])
        self.assertEqual(model["sanborn_manifest"]["sheet_count"], 5)
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["present_file_count"], len(present_files))
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["expected_file_count"], len(expected_files))
        self.assertEqual(model["sanborn_manifest"]["image_intake"]["missing_sheet_ids"], missing_sheet_ids)
        self.assertEqual(model["sanborn_manifest"]["sheet_review"]["review_count"], 5)
        self.assertEqual(model["sanborn_manifest"]["stitching_prep"]["anchor_sheet_id"], "sheet_texarkana_1885_sanborn_003")
        self.assertEqual(model["sanborn_manifest"]["stitching_prep"]["link_count"], 3)
        self.assertEqual(model["building_manifest"]["record_count"], 4)
        self.assertEqual(model["building_manifest"]["building_identity_status"], "reviewed_subset_available")
        self.assertEqual(model["building_manifest"]["building_art_status"], "generic_fallback_only")
        self.assertEqual(
            model["building_manifest"]["verification_suggestions"]["candidate_count"],
            2,
        )
        self.assertEqual(model["map_rendering"]["base_map_layer"]["layer_id"], "base-map")
        self.assertEqual(model["map_rendering"]["building_art_layer"]["status"], "reviewed_subset_available")
        self.assertEqual(model["map_rendering"]["building_art_layer"]["records"][0]["review_anchor_kind"], "building")
        self.assertEqual(
            model["building_manifest"]["buildings"][2]["review_record_id"],
            "review_texarkana_1885_sanborn_003",
        )
        self.assertEqual(model["instructional_alignment"]["teks_status"], "pending_teacher_selection")
        self.assertEqual(model["instructional_alignment"]["record_count"], 2)
        self.assertEqual(model["standards_alignment"]["workflow_title"], "Standards & TEKS Review")
        self.assertEqual(model["standards_alignment"]["release_gate"]["status"], "blocked")
        self.assertTrue(model["standards_alignment"]["teacher_scope_policy"]["primary_subject_only"])
        self.assertEqual(model["teacher_review"]["review_status"], "pending_teacher_review")
        self.assertFalse(model["teacher_review"]["classroom_release_ready"])
        self.assertEqual(model["teacher_interface"]["portal_title"], "Teacher Review & Classroom Approval")
        self.assertTrue(model["teacher_interface"]["teacher_scope"]["primary_subject_only"])
        self.assertEqual(model["student_mission"]["flow_title"], "Student Mission Flow")
        self.assertEqual(model["student_mission"]["release_state"], "blocked")
        self.assertEqual(model["assessment_evidence"]["framework_title"], "Assessment Evidence Workflow")
        self.assertEqual(model["assessment_evidence"]["assessment_status"], "not_scored")
        self.assertEqual(model["accessibility"]["framework_title"], "Accessibility Supports")
        self.assertEqual(model["accessibility"]["accessibility_status"], "seeded")
        self.assertIn("telegram_review", [module["module_id"] for module in model["teacher_interface"]["portal_modules"]])
        self.assertEqual(
            model["sanborn_manifest"]["sheet_review"]["reviews"][0]["sheet_id"],
            "sheet_texarkana_1885_sanborn_001",
        )

    def test_rendered_page_contains_read_only_town_data(self):
        package = load_town_package(ROOT, "texarkana")
        html = render_town_package_page(package)
        intake_report = build_sanborn_image_intake_report(ROOT, "texarkana")
        present_file_count = len(intake_report["present_files"])
        expected_file_count = len(intake_report["expected_files"])

        self.assertIn("<!doctype html>", html)
        self.assertIn("Texarkana", html)
        self.assertIn("Town Package Status", html)
        self.assertIn("source_texarkana_1885_sanborn_loc", html)
        self.assertIn("loc_texarkana_1885_001", html)
        self.assertIn("claim_texarkana_1885_003", html)
        self.assertIn("verified_fact", html)
        self.assertIn("source_based_inference", html)
        self.assertIn("fictional_gameplay", html)
        self.assertIn("Teacher Source Notes", html)
        self.assertIn("Library of Congress", html)
        self.assertIn("Sanborn Sheet Manifest", html)
        self.assertIn("sheet_texarkana_1885_sanborn_005", html)
        self.assertIn("https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=5", html)
        self.assertIn("not_started", html)
        self.assertIn("deferred", html)
        self.assertIn("Sanborn Asset Manifest", html)
        self.assertIn("download_page_recorded_direct_binary_url_unresolved", html)
        self.assertIn("no binaries committed", html)
        self.assertIn("Sanborn Image Intake", html)
        self.assertIn("sheet_texarkana_1885_sanborn_001.jpg", html)
        self.assertIn("Missing sheet IDs", html)
        self.assertIn(f"{present_file_count} present", html)
        self.assertIn(f"{expected_file_count} expected", html)
        self.assertIn("Sanborn Sheet Review", html)
        self.assertIn("5 review notes", html)
        self.assertIn("Kizer Lumber Co's Planning Mill", html)
        self.assertIn("The Arkansaw Cotton Seed Oil Mill.", html)
        self.assertIn("Sanborn Stitching Prep", html)
        self.assertIn("prep_only", html)
        self.assertIn("sheet_texarkana_1885_sanborn_003", html)
        self.assertIn("cross_sheet_reference", html)
        self.assertIn("Building Review Contract", html)
        self.assertIn("Unknown Building", html)
        self.assertIn("generic_art_allowed", html)
        self.assertIn("A.S. Blythe. Wagon Yard &amp; Livery.", html)
        self.assertIn("review_texarkana_1885_sanborn_003", html)
        self.assertIn("sheet_texarkana_1885_sanborn_005 / 5", html)
        self.assertIn("Map Rendering Contract", html)
        self.assertIn("Reviewed art records", html)
        self.assertIn("Fallback art", html)
        self.assertIn("Evidence / Provenance", html)
        self.assertIn("reviewed_building_anchor", html)
        self.assertIn("Verification Suggestions", html)
        self.assertIn("Potential livery stable match from later archival hints", html)
        self.assertIn("insufficient_evidence", html)
        self.assertIn("Instructional Alignment", html)
        self.assertIn("alignment_texarkana_1885_hqim_001", html)
        self.assertIn("pending_teacher_selection", html)
        self.assertIn("Standards & TEKS Review", html)
        self.assertIn("Current Standard Under Review", html)
        self.assertIn("secondary teks tethers stay mission-scoped", html.lower())
        self.assertIn("Teacher Review Approval", html)
        self.assertIn("teacher_review_texarkana_1885_teks_001", html)
        self.assertIn("release blocked", html)
        self.assertIn("Teacher Portal", html)
        self.assertIn("Portal Modules", html)
        self.assertIn("Telegram Review", html)
        self.assertIn("Postal Review", html)
        self.assertIn("Behavior / Law Flags", html)
        self.assertIn("Student Mission Flow", html)
        self.assertIn("Visible Steps", html)
        self.assertIn("Artifact Expectation", html)
        self.assertIn("Visible Evidence", html)
        self.assertIn("Assessment Evidence", html)
        self.assertIn("Mastery Scale", html)
        self.assertIn("Teacher Override", html)
        self.assertIn("Accessibility Supports", html)
        self.assertIn("Support Categories", html)
        self.assertIn("Embedded Scaffolds", html)

    def test_rendered_page_contains_classroom_readiness_report(self):
        package = load_town_package(ROOT, "texarkana")
        html = render_town_package_page(package)

        self.assertIn("Classroom Readiness", html)
        self.assertIn("Needs teacher review", html)
        self.assertIn("Current Blockers", html)
        self.assertIn("Readiness Checks", html)
        self.assertIn("placeholder_locations", html)
        self.assertIn("Placeholder map/location records require teacher review", html)
        self.assertIn("loc_texarkana_1885_001", html)
        self.assertIn("historical_source_notes", html)
        self.assertIn("instructional_alignment", html)
        self.assertIn("pending_teacher_selection", html)
        self.assertIn("teacher_review_approval", html)
        self.assertIn("standards-title", html.lower())
        self.assertIn("teacher portal", html.lower())
        self.assertIn("primary subject", html.lower())
        self.assertIn("pass", html)

    def test_rendered_page_escapes_dynamic_text(self):
        package = load_town_package(ROOT, "texarkana")
        unsafe_package = replace(package, town_name="<Texarkana>")

        html = render_town_package_page(unsafe_package)

        self.assertIn("&lt;Texarkana&gt;", html)
        self.assertNotIn("<Texarkana>", html)


if __name__ == "__main__":
    unittest.main()

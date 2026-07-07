from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_sanborn_sheet_review_manifest, load_sanborn_stitching_manifest


class SanbornStitchingManifestTests(unittest.TestCase):
    def test_loads_committed_stitching_manifest(self):
        manifest = load_sanborn_stitching_manifest(ROOT, "texarkana")

        self.assertEqual(
            manifest.stitching_manifest_id,
            "sanborn_texarkana_1885_loc_stitching_manifest",
        )
        self.assertEqual(manifest.anchor_sheet_id, "sheet_texarkana_1885_sanborn_003")
        self.assertEqual(manifest.sheet_plan_count, 5)
        self.assertEqual(len(manifest.sheet_plans), 5)
        self.assertEqual(manifest.link_count, 3)
        self.assertEqual(len(manifest.links), 3)
        self.assertFalse(manifest.binary_files_committed)
        self.assertEqual(manifest.stitching_status, "prep_only")
        self.assertEqual(manifest.control_point_status, "not_started")
        self.assertEqual(manifest.georeferencing_status, "deferred")
        self.assertEqual(manifest.location_extraction_status, "deferred")
        self.assertEqual(manifest.claim_generation_status, "deferred")

    def test_sheet_plans_map_back_to_review_manifest(self):
        stitching_manifest = load_sanborn_stitching_manifest(ROOT, "texarkana")
        sheet_review_manifest = load_sanborn_sheet_review_manifest(ROOT, "texarkana")
        reviews_by_sheet_id = {review.sheet_id: review for review in sheet_review_manifest.reviews}

        self.assertEqual(
            [plan.sheet_id for plan in stitching_manifest.sheet_plans],
            [review.sheet_id for review in sheet_review_manifest.reviews],
        )

        for plan in stitching_manifest.sheet_plans:
            review = reviews_by_sheet_id[plan.sheet_id]
            self.assertEqual(plan.sheet_number, review.sheet_number)
            self.assertEqual(plan.sheet_role, review.sheet_role)
            self.assertTrue(plan.stitch_priority)
            self.assertTrue(plan.stitch_readiness)
            self.assertGreaterEqual(len(plan.blocking_tasks), 1)
            self.assertTrue(plan.notes)

    def test_links_preserve_planning_boundary_without_claim_generation(self):
        manifest = load_sanborn_stitching_manifest(ROOT, "texarkana")
        links_by_pair = {(link.from_sheet_id, link.to_sheet_id): link for link in manifest.links}

        self.assertIn("planning relationships", manifest.claim_boundary["verified_fact"])
        self.assertIn("source-based stitching inferences", manifest.claim_boundary["source_based_inference"])
        self.assertIn("no fictional gameplay records", manifest.claim_boundary["fictional_gameplay"])
        self.assertEqual(
            set(links_by_pair),
            {
                ("sheet_texarkana_1885_sanborn_002", "sheet_texarkana_1885_sanborn_003"),
                ("sheet_texarkana_1885_sanborn_003", "sheet_texarkana_1885_sanborn_004"),
                ("sheet_texarkana_1885_sanborn_003", "sheet_texarkana_1885_sanborn_005"),
            },
        )
        for link in manifest.links:
            self.assertEqual(link.link_type, "cross_sheet_reference")
            self.assertEqual(link.alignment_status, "candidate")
            self.assertTrue(link.evidence_basis)
            self.assertTrue(link.notes)


if __name__ == "__main__":
    unittest.main()

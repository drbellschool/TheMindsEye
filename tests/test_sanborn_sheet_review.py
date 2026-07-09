from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_sanborn_image_metadata_manifest, load_sanborn_sheet_review_manifest


class SanbornSheetReviewManifestTests(unittest.TestCase):
    def test_loads_committed_sheet_review_manifest(self):
        manifest = load_sanborn_sheet_review_manifest(ROOT, "texarkana")

        self.assertEqual(
            manifest.sheet_review_manifest_id,
            "sanborn_texarkana_1885_loc_sheet_review_manifest",
        )
        self.assertEqual(manifest.review_count, 5)
        self.assertEqual(len(manifest.reviews), 5)
        self.assertFalse(manifest.binary_files_committed)
        self.assertEqual(manifest.stitching_status, "not_started")
        self.assertEqual(manifest.georeferencing_status, "deferred")
        self.assertEqual(manifest.location_extraction_status, "deferred")
        self.assertEqual(manifest.claim_generation_status, "deferred")

    def test_review_records_map_back_to_image_metadata_manifest(self):
        review_manifest = load_sanborn_sheet_review_manifest(ROOT, "texarkana")
        image_metadata_manifest = load_sanborn_image_metadata_manifest(ROOT, "texarkana")
        images_by_sheet_id = {image.sheet_id: image for image in image_metadata_manifest.images}

        self.assertEqual(
            [review.sheet_id for review in review_manifest.reviews],
            [image.sheet_id for image in image_metadata_manifest.images],
        )

        for review in review_manifest.reviews:
            image = images_by_sheet_id[review.sheet_id]
            self.assertEqual(review.sheet_number, image.sheet_number)
            self.assertEqual(review.image_record_id, image.image_record_id)
            self.assertEqual(review.asset_record_id, image.asset_record_id)
            self.assertEqual(review.source_id, image.source_id)
            self.assertEqual(review.map_id, image.map_id)

    def test_review_notes_preserve_source_grounded_boundary(self):
        manifest = load_sanborn_sheet_review_manifest(ROOT, "texarkana")
        reviews_by_sheet_id = {review.sheet_id: review for review in manifest.reviews}

        self.assertIn("directly observed", manifest.claim_boundary["verified_fact"])
        self.assertIn("deferred", manifest.claim_boundary["source_based_inference"])
        self.assertIn("no fictional gameplay records", manifest.claim_boundary["fictional_gameplay"])
        self.assertEqual(
            reviews_by_sheet_id["sheet_texarkana_1885_sanborn_001"].observed_labels,
            (
                "Texarkana Texas & Arkansas",
                "Index. Streets, &c.",
                "Kizer Lumber Co's Planning Mill",
                "Texas Mattress Fac.",
            ),
        )
        self.assertIn(
            "The Arkansaw Cotton Seed Oil Mill.",
            reviews_by_sheet_id["sheet_texarkana_1885_sanborn_005"].observed_labels,
        )
        for review in manifest.reviews:
            self.assertEqual(review.review_status, "sheet_level_visual_review_complete")
            self.assertTrue(review.sheet_role)
            self.assertGreaterEqual(len(review.observed_labels), 1)
            self.assertGreaterEqual(len(review.visible_features), 1)
            self.assertGreaterEqual(len(review.deferred_work), 1)
            self.assertTrue(review.notes)


if __name__ == "__main__":
    unittest.main()

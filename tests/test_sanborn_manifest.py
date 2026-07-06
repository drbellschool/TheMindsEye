import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import ClaimType, Confidence, load_sanborn_sheet_manifest, load_town_package


class SanbornManifestTests(unittest.TestCase):
    def test_loads_verified_loc_sheet_manifest(self):
        manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")

        self.assertEqual(manifest.manifest_id, "sanborn_texarkana_1885_loc_sheet_manifest")
        self.assertEqual(manifest.item_id, "sanborn08781_001")
        self.assertEqual(manifest.resource_id, "g4034tm.g4034tm_g087811885")
        self.assertEqual(manifest.sheet_count, 5)
        self.assertEqual(len(manifest.sheets), 5)
        self.assertEqual(manifest.rights_status, "public_domain")
        self.assertIn("Library of Congress", manifest.repository)

    def test_sheet_ids_and_loc_links_are_stable(self):
        manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")

        self.assertEqual(
            [sheet.sheet_id for sheet in manifest.sheets],
            [
                "sheet_texarkana_1885_sanborn_001",
                "sheet_texarkana_1885_sanborn_002",
                "sheet_texarkana_1885_sanborn_003",
                "sheet_texarkana_1885_sanborn_004",
                "sheet_texarkana_1885_sanborn_005",
            ],
        )
        self.assertEqual([sheet.sheet_number for sheet in manifest.sheets], [1, 2, 3, 4, 5])
        self.assertEqual(
            [sheet.loc_resource_url for sheet in manifest.sheets],
            [
                "https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=1",
                "https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=2",
                "https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=3",
                "https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=4",
                "https://www.loc.gov/resource/g4034tm.g4034tm_g087811885/?sp=5",
            ],
        )

    def test_manifest_links_back_to_existing_package_records(self):
        manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")
        package = load_town_package(ROOT, "texarkana")

        self.assertEqual(manifest.town_package_id, package.package_id)
        self.assertIn(manifest.source_id, package.source_ids)
        self.assertIn(manifest.map_id, {layer["map_id"] for layer in package.map_layers})
        self.assertTrue(all(sheet.source_id == manifest.source_id for sheet in manifest.sheets))
        self.assertTrue(all(sheet.map_id == manifest.map_id for sheet in manifest.sheets))

    def test_manifest_preserves_claim_location_and_mission_boundaries(self):
        before = load_town_package(ROOT, "texarkana")
        manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")
        after = load_town_package(ROOT, "texarkana")

        self.assertEqual([source.source_id for source in after.sources], [source.source_id for source in before.sources])
        self.assertEqual(
            [location.location_id for location in after.locations],
            [location.location_id for location in before.locations],
        )
        self.assertEqual([claim.claim_type for claim in after.claims], [claim.claim_type for claim in before.claims])
        self.assertEqual([claim.confidence for claim in after.claims], [claim.confidence for claim in before.claims])
        self.assertEqual(after.mission_seed.claim_ids, before.mission_seed.claim_ids)
        self.assertEqual(after.mission_seed.location_ids, before.mission_seed.location_ids)
        self.assertEqual(manifest.derived_location_ids, ())
        self.assertEqual(manifest.derived_claim_ids, ())
        self.assertTrue(all(not sheet.derived_location_ids for sheet in manifest.sheets))
        self.assertTrue(all(not sheet.derived_claim_ids for sheet in manifest.sheets))

    def test_manifest_keeps_fact_inference_and_fictional_boundary_explicit(self):
        manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")
        package = load_town_package(ROOT, "texarkana")
        claims_by_id = {claim.claim_id: claim for claim in package.claims}

        self.assertEqual(manifest.stitching_status, "not_started")
        self.assertEqual(manifest.location_extraction_status, "deferred")
        self.assertIn("verified_fact", manifest.claim_boundary)
        self.assertIn("source_based_inference", manifest.claim_boundary)
        self.assertIn("fictional_gameplay", manifest.claim_boundary)
        self.assertEqual(claims_by_id["claim_texarkana_1885_003"].claim_type, ClaimType.VERIFIED_FACT)
        self.assertEqual(claims_by_id["claim_texarkana_1885_003"].confidence, Confidence.HIGH)
        self.assertEqual(
            claims_by_id["claim_texarkana_1885_001"].claim_type,
            ClaimType.SOURCE_BASED_INFERENCE,
        )
        self.assertEqual(claims_by_id["claim_texarkana_1885_001"].confidence, Confidence.LOW)
        self.assertEqual(claims_by_id["claim_texarkana_1885_002"].claim_type, ClaimType.FICTIONAL_GAMEPLAY)
        self.assertEqual(claims_by_id["claim_texarkana_1885_002"].confidence, Confidence.FICTIONAL)


if __name__ == "__main__":
    unittest.main()

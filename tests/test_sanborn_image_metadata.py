import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    build_sanborn_image_metadata_manifest,
    load_sanborn_asset_manifest,
    load_sanborn_image_metadata_manifest,
)


class SanbornImageMetadataManifestTests(unittest.TestCase):
    def test_loads_committed_image_metadata_manifest(self):
        manifest = load_sanborn_image_metadata_manifest(ROOT, "texarkana")

        self.assertEqual(
            manifest.image_metadata_manifest_id,
            "sanborn_texarkana_1885_loc_image_metadata_manifest",
        )
        self.assertEqual(manifest.image_count, 5)
        self.assertEqual(len(manifest.images), 5)
        self.assertFalse(manifest.binary_files_committed)
        self.assertEqual(manifest.stitching_status, "not_started")
        self.assertEqual(manifest.georeferencing_status, "deferred")
        self.assertEqual(manifest.location_extraction_status, "deferred")

    def test_image_metadata_records_map_back_to_asset_manifest(self):
        image_metadata_manifest = load_sanborn_image_metadata_manifest(ROOT, "texarkana")
        asset_manifest = load_sanborn_asset_manifest(ROOT, "texarkana")
        assets_by_id = {asset.asset_record_id: asset for asset in asset_manifest.assets}

        self.assertEqual(
            [image.sheet_id for image in image_metadata_manifest.images],
            [asset.sheet_id for asset in asset_manifest.assets],
        )

        for image in image_metadata_manifest.images:
            asset = assets_by_id[image.asset_record_id]
            self.assertEqual(image.sheet_id, asset.sheet_id)
            self.assertEqual(image.sheet_number, asset.sheet_number)
            self.assertEqual(image.source_id, asset.source_id)
            self.assertEqual(image.map_id, asset.map_id)
            self.assertEqual(image.download_page_url, asset.download_page_url)

    def test_image_metadata_includes_checksums_dimensions_and_loc_origin(self):
        manifest = load_sanborn_image_metadata_manifest(ROOT, "texarkana")

        for image in manifest.images:
            self.assertEqual(len(image.checksum_sha256), 64)
            self.assertTrue(all(character in "0123456789abcdef" for character in image.checksum_sha256))
            self.assertGreater(image.byte_size, 0)
            self.assertGreater(image.width_px, 0)
            self.assertGreater(image.height_px, 0)
            self.assertEqual(image.rights_status, "public_domain")
            self.assertIn("Library of Congress", image.origin_repository)
            self.assertTrue(image.local_cache_relpath.startswith("data/towns/texarkana/local_cache/"))
            self.assertTrue(image.filename.endswith(".jpg"))

    def test_builder_matches_committed_manifest_shape(self):
        built = build_sanborn_image_metadata_manifest(ROOT, "texarkana", captured_date="2026-07-06")
        loaded = load_sanborn_image_metadata_manifest(ROOT, "texarkana")

        self.assertEqual(built["image_metadata_manifest_id"], loaded.image_metadata_manifest_id)
        self.assertEqual(built["image_count"], loaded.image_count)
        self.assertEqual([item["sheet_id"] for item in built["images"]], [image.sheet_id for image in loaded.images])
        self.assertEqual(
            [item["checksum_sha256"] for item in built["images"]],
            [image.checksum_sha256 for image in loaded.images],
        )


if __name__ == "__main__":
    unittest.main()

import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import load_sanborn_asset_manifest, load_sanborn_sheet_manifest


class SanbornAssetManifestTests(unittest.TestCase):
    def test_loads_asset_manifest_without_committed_binaries(self):
        manifest = load_sanborn_asset_manifest(ROOT, "texarkana")

        self.assertEqual(manifest.asset_manifest_id, "sanborn_texarkana_1885_loc_asset_manifest")
        self.assertEqual(manifest.asset_count, 5)
        self.assertEqual(len(manifest.assets), 5)
        self.assertFalse(manifest.binary_files_committed)
        self.assertEqual(manifest.stitching_status, "not_started")
        self.assertEqual(manifest.georeferencing_status, "deferred")
        self.assertEqual(manifest.location_extraction_status, "deferred")

    def test_asset_records_preserve_sheet_ids_and_order(self):
        asset_manifest = load_sanborn_asset_manifest(ROOT, "texarkana")
        sheet_manifest = load_sanborn_sheet_manifest(ROOT, "texarkana")

        self.assertEqual(
            [asset.sheet_id for asset in asset_manifest.assets],
            [sheet.sheet_id for sheet in sheet_manifest.sheets],
        )
        self.assertEqual(
            [asset.download_page_url for asset in asset_manifest.assets],
            [sheet.loc_resource_url for sheet in sheet_manifest.sheets],
        )
        self.assertTrue(all(asset.source_id == sheet_manifest.source_id for asset in asset_manifest.assets))
        self.assertTrue(all(asset.map_id == sheet_manifest.map_id for asset in asset_manifest.assets))

    def test_asset_manifest_records_fetch_blocker_without_claiming_cache(self):
        manifest = load_sanborn_asset_manifest(ROOT, "texarkana")

        self.assertIn("browser_challenge", manifest.automated_fetch_status)
        self.assertTrue(all(asset.asset_url_status.endswith("_unresolved") for asset in manifest.assets))
        self.assertTrue(all(asset.direct_binary_url == "" for asset in manifest.assets))
        self.assertTrue(all(asset.local_cache_path == "" for asset in manifest.assets))
        self.assertTrue(all(asset.checksum_sha256 == "" for asset in manifest.assets))

    def test_observed_download_options_are_limited_to_verified_sheet_pages(self):
        manifest = load_sanborn_asset_manifest(ROOT, "texarkana")
        options_by_sheet = {asset.sheet_id: asset.observed_download_options for asset in manifest.assets}

        self.assertIn("JPEG 1612x1912 px", options_by_sheet["sheet_texarkana_1885_sanborn_001"])
        self.assertIn("TIFF 141.2 MB", options_by_sheet["sheet_texarkana_1885_sanborn_001"])
        self.assertEqual(options_by_sheet["sheet_texarkana_1885_sanborn_002"], ())
        self.assertEqual(options_by_sheet["sheet_texarkana_1885_sanborn_003"], ())
        self.assertEqual(options_by_sheet["sheet_texarkana_1885_sanborn_004"], ())
        self.assertIn("JPEG2000 8.4 MB", options_by_sheet["sheet_texarkana_1885_sanborn_005"])


if __name__ == "__main__":
    unittest.main()

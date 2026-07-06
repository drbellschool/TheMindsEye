from contextlib import contextmanager
import shutil
import sys
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    build_sanborn_image_metadata_manifest,
    load_sanborn_asset_manifest,
    load_sanborn_image_metadata_manifest,
)

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"
PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01"
    b"\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
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

    def test_builder_creates_manifest_from_temp_repo_cache(self):
        with copied_repo() as repo_root:
            cache_dir = repo_root / "data" / "towns" / "texarkana" / "local_cache" / "sanborn_test"
            cache_dir.mkdir(parents=True, exist_ok=True)
            for sheet_number in range(1, 6):
                image_path = cache_dir / f"sheet_texarkana_1885_sanborn_{sheet_number:03d}.png"
                image_path.write_bytes(PNG_1X1)

            built = build_sanborn_image_metadata_manifest(
                repo_root,
                "texarkana",
                cache_dir=cache_dir,
                captured_date="2026-07-06",
            )

        self.assertEqual(built["image_metadata_manifest_id"], "sanborn_texarkana_1885_loc_image_metadata_manifest")
        self.assertEqual(built["image_count"], 5)
        self.assertEqual([item["sheet_id"] for item in built["images"]], [
            "sheet_texarkana_1885_sanborn_001",
            "sheet_texarkana_1885_sanborn_002",
            "sheet_texarkana_1885_sanborn_003",
            "sheet_texarkana_1885_sanborn_004",
            "sheet_texarkana_1885_sanborn_005",
        ])
        self.assertTrue(all(item["filename"].endswith(".png") for item in built["images"]))
        self.assertTrue(all(item["width_px"] == 1 for item in built["images"]))
        self.assertTrue(all(item["height_px"] == 1 for item in built["images"]))
        self.assertTrue(
            all(item["local_cache_relpath"].startswith("data/towns/texarkana/local_cache/") for item in built["images"])
        )


@contextmanager
def copied_repo() -> Path:
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        data_dir = repo_root / "data"
        (data_dir / "towns").mkdir(parents=True)
        shutil.copytree(SCHEMAS, data_dir / "schemas")
        shutil.copytree(TEXARKANA, data_dir / "towns" / "texarkana")
        yield repo_root


if __name__ == "__main__":
    unittest.main()

import hashlib
import sys
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import MindseyeDataError, build_sanborn_image_intake_report

PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01"
    b"\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class SanbornImageIntakeTests(unittest.TestCase):
    def test_empty_cache_reports_expected_files_and_missing_sheets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = build_sanborn_image_intake_report(ROOT, "texarkana", Path(temp_dir))

        self.assertEqual(len(report["expected_files"]), 5)
        self.assertEqual(len(report["present_files"]), 0)
        self.assertEqual(
            report["missing_sheet_ids"],
            [
                "sheet_texarkana_1885_sanborn_001",
                "sheet_texarkana_1885_sanborn_002",
                "sheet_texarkana_1885_sanborn_003",
                "sheet_texarkana_1885_sanborn_004",
                "sheet_texarkana_1885_sanborn_005",
            ],
        )
        self.assertEqual(report["stitching_status"], "not_started")
        self.assertEqual(report["georeferencing_status"], "deferred")
        self.assertEqual(report["location_extraction_status"], "deferred")

    def test_known_sheet_file_maps_to_sheet_id_checksum_and_dimensions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            image_path = cache_dir / "sheet_texarkana_1885_sanborn_001.png"
            image_path.write_bytes(PNG_1X1)

            report = build_sanborn_image_intake_report(ROOT, "texarkana", cache_dir)

        self.assertEqual(len(report["present_files"]), 1)
        record = report["present_files"][0]
        self.assertEqual(record["sheet_id"], "sheet_texarkana_1885_sanborn_001")
        self.assertEqual(record["filename"], "sheet_texarkana_1885_sanborn_001.png")
        self.assertEqual(record["checksum_sha256"], hashlib.sha256(PNG_1X1).hexdigest())
        self.assertEqual(record["width_px"], 1)
        self.assertEqual(record["height_px"], 1)

    def test_unknown_sheet_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            (cache_dir / "sheet_texarkana_1885_sanborn_999.jpg").write_bytes(b"not a known sheet")

            with self.assertRaisesRegex(MindseyeDataError, "unknown Sanborn intake file"):
                build_sanborn_image_intake_report(ROOT, "texarkana", cache_dir)

    def test_non_image_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            (cache_dir / "notes.txt").write_text("manual notes do not belong in the image cache", encoding="utf-8")

            with self.assertRaisesRegex(MindseyeDataError, "unknown Sanborn intake file"):
                build_sanborn_image_intake_report(ROOT, "texarkana", cache_dir)


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (
    build_sanborn_composite_manifest,
    build_sanborn_georeference_workspace,
    load_sanborn_control_point_manifest,
    load_sanborn_layer_stack_manifest,
    load_sanborn_sheet_transform_manifest,
)


class SanbornGeoreferenceTests(unittest.TestCase):
    def test_control_point_manifest_loads_and_marks_missing_sheets(self):
        manifest = load_sanborn_control_point_manifest(ROOT, "texarkana")

        self.assertEqual(manifest["control_point_count"], 3)
        self.assertEqual(manifest["coordinate_system"]["status"], "local_only")
        self.assertEqual(manifest["sheet_statuses"][2]["status"], "local_anchor_only")
        self.assertEqual(
            manifest["missing_control_point_sheet_ids"],
            [
                "sheet_texarkana_1885_sanborn_001",
                "sheet_texarkana_1885_sanborn_002",
                "sheet_texarkana_1885_sanborn_004",
                "sheet_texarkana_1885_sanborn_005",
            ],
        )

    def test_sheet_transform_manifest_validates_local_anchor_alignment(self):
        manifest = load_sanborn_sheet_transform_manifest(ROOT, "texarkana")

        self.assertEqual(manifest["sheet_transform_count"], 5)
        self.assertEqual(manifest["transform_status"], "partial")
        self.assertEqual(manifest["sheet_transforms"][2]["transform_status"], "local_anchor_only")
        self.assertIn(
            "cp_texarkana_1885_sanborn_003_origin",
            manifest["sheet_transforms"][2]["control_point_ids"],
        )
        self.assertGreaterEqual(len(manifest["warnings"]), 1)

    def test_layer_stack_manifest_preserves_the_seven_layer_contract(self):
        manifest = load_sanborn_layer_stack_manifest(ROOT, "texarkana")

        self.assertEqual(manifest["layer_count"], 7)
        self.assertEqual(
            [layer["layer_id"] for layer in manifest["layers"]],
            [
                "base-map",
                "road-rail",
                "building-footprint",
                "building-art",
                "label-layer",
                "quest-marker-layer",
                "evidence-provenance-layer",
            ],
        )
        self.assertEqual(manifest["layers"][3]["status"], "reviewed_subset_available")
        self.assertIn("parchment", " ".join(manifest["texture_requirements"]).lower())

    def test_composite_manifest_generation_keeps_release_gate_blocked(self):
        manifest = build_sanborn_composite_manifest(ROOT, "texarkana")

        self.assertEqual(manifest["composite_status"], "prep_only")
        self.assertEqual(manifest["release_gate_status"], "blocked")
        self.assertEqual(manifest["georeference_workspace"]["control_point_status"], "partial")
        self.assertEqual(manifest["sheet_statuses"][2]["transform_status"], "local_anchor_only")
        self.assertIn("sheet_texarkana_1885_sanborn_002", manifest["missing_control_point_sheet_ids"])
        self.assertGreaterEqual(manifest["warning_count"], 1)
        self.assertGreaterEqual(manifest["blocker_count"], 1)
        self.assertEqual(manifest["sheet_transform_manifest_id"], "sanborn_texarkana_1885_loc_sheet_transform_manifest")


if __name__ == "__main__":
    unittest.main()

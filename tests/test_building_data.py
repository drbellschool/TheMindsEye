import json
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import (  # noqa: E402
    MindseyeDataError,
    load_building_manifest,
    load_verification_suggestion_manifest,
)

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"


class BuildingDataTests(unittest.TestCase):
    def test_loads_building_manifest(self):
        manifest = load_building_manifest(ROOT, "texarkana")
        buildings_by_id = {building.building_id: building for building in manifest.buildings}

        self.assertEqual(manifest.building_manifest_id, "building_texarkana_1885_manifest")
        self.assertEqual(manifest.record_count, 4)
        self.assertEqual(manifest.location_extraction_status, "reviewed_subset_available")
        self.assertEqual(manifest.building_identity_status, "reviewed_subset_available")
        self.assertEqual(manifest.building_art_status, "generic_fallback_only")
        self.assertIn("reviewed subset", manifest.claim_boundary["verified_fact"])

        first_building = buildings_by_id["building_texarkana_1885_001"]
        self.assertEqual(first_building.location_id, "loc_texarkana_1885_001")
        self.assertEqual(first_building.identity_status, "unknown")
        self.assertEqual(first_building.identity_basis, "unassigned")
        self.assertEqual(first_building.reviewed_label, "")
        self.assertEqual(first_building.visual_detail_status, "illustrative")
        self.assertEqual(first_building.default_render_mode, "generic_art_allowed")
        self.assertTrue(first_building.student_visible)
        self.assertTrue(first_building.teacher_visible)
        self.assertEqual(first_building.suggestion_ids, ("suggestion_texarkana_1885_001",))
        self.assertIsNone(first_building.review_record_id)

        reviewed_building = buildings_by_id["building_texarkana_1885_003"]
        self.assertEqual(reviewed_building.location_id, "loc_texarkana_1885_003")
        self.assertEqual(reviewed_building.identity_status, "reviewed")
        self.assertEqual(reviewed_building.identity_basis, "verified_fact")
        self.assertEqual(reviewed_building.review_record_id, "review_texarkana_1885_sanborn_003")
        self.assertEqual(reviewed_building.sheet_id, "sheet_texarkana_1885_sanborn_003")
        self.assertEqual(reviewed_building.sheet_number, 3)
        self.assertEqual(reviewed_building.reviewed_label, "A.S. Blythe. Wagon Yard & Livery.")
        self.assertEqual(reviewed_building.historical_function, "Wagon Yard & Livery")
        self.assertEqual(reviewed_building.visual_detail_status, "inferred")
        self.assertEqual(reviewed_building.supporting_claim_ids, ("claim_texarkana_1885_004",))

    def test_loads_verification_suggestion_manifest(self):
        building_manifest = load_building_manifest(ROOT, "texarkana")
        suggestion_manifest = load_verification_suggestion_manifest(ROOT, "texarkana")
        suggestions_by_id = {
            suggestion.suggestion_id: suggestion for suggestion in suggestion_manifest.suggestions
        }

        self.assertEqual(
            suggestion_manifest.suggestion_manifest_id,
            "verification_texarkana_1885_manifest",
        )
        self.assertEqual(suggestion_manifest.building_manifest_id, building_manifest.building_manifest_id)
        self.assertEqual(suggestion_manifest.review_queue_status, "seed_only")
        self.assertEqual(suggestion_manifest.candidate_count, 2)
        self.assertIn("never become verified building labels", suggestion_manifest.promotion_rule)
        self.assertIn("source-based inference", suggestion_manifest.claim_boundary["source_based_inference"])

        first_suggestion = suggestions_by_id["suggestion_texarkana_1885_001"]
        self.assertEqual(first_suggestion.target_building_id, "building_texarkana_1885_001")
        self.assertEqual(first_suggestion.status, "suggested")
        self.assertEqual(first_suggestion.historical_basis, "source_based_inference")
        self.assertFalse(first_suggestion.auto_publish)
        self.assertFalse(first_suggestion.student_visible)

        for building in building_manifest.buildings:
            self.assertEqual(
                set(building.suggestion_ids),
                {
                    suggestion.suggestion_id
                    for suggestion in suggestion_manifest.suggestions
                    if suggestion.target_building_id == building.building_id
                },
            )

    def test_rejects_unknown_building_with_reviewed_label(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "building_manifest.json",
                lambda manifest: manifest["buildings"][0].__setitem__("reviewed_label", "Fake Reviewed Label"),
            )

            with self.assertRaisesRegex(MindseyeDataError, "reviewed_label|identity review"):
                load_building_manifest(repo_root, "texarkana")

    def test_rejects_auto_publish_suggestion(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "verification_suggestion_manifest.json",
                lambda manifest: manifest["suggestions"][0].__setitem__("auto_publish", True),
            )

            with self.assertRaisesRegex(MindseyeDataError, "auto_publish"):
                load_verification_suggestion_manifest(repo_root, "texarkana")

    def test_rejects_building_suggestion_id_mismatch(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "building_manifest.json",
                lambda manifest: manifest["buildings"][0].__setitem__("suggestion_ids", []),
            )

            with self.assertRaisesRegex(MindseyeDataError, "suggestion_ids do not match"):
                load_verification_suggestion_manifest(repo_root, "texarkana")

    def test_rejects_reviewed_building_without_review_anchor(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "building_manifest.json",
                lambda manifest: manifest["buildings"][2].pop("review_record_id"),
            )

            with self.assertRaisesRegex(MindseyeDataError, "review_record_id"):
                load_building_manifest(repo_root, "texarkana")


@contextmanager
def copied_repo() -> Iterator[Path]:
    with tempfile.TemporaryDirectory() as temp_dir:
        repo_root = Path(temp_dir)
        data_dir = repo_root / "data"
        (data_dir / "towns").mkdir(parents=True)
        shutil.copytree(SCHEMAS, data_dir / "schemas")
        shutil.copytree(TEXARKANA, data_dir / "towns" / "texarkana")
        yield repo_root


def mutate_json(path: Path, mutation: Callable[[Any], None]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mutation(data)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()

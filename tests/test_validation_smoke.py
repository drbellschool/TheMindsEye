from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye.town_validation import validate_town_package

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"


class ValidationSmokeTests(unittest.TestCase):
    def test_texarkana_metadata_has_package_id(self) -> None:
        metadata_path = TEXARKANA / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

        self.assertEqual(metadata["package_id"], "texarkana_1885")

    def test_texarkana_package_passes_schema_and_link_validation(self) -> None:
        validate_town_package(TEXARKANA, SCHEMAS)

    def test_metadata_schema_is_applied(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "metadata.json", lambda metadata: metadata.pop("source_manifest"))

            with self.assertRaisesRegex(ValueError, "source_manifest"):
                validate_town_package(town_dir, SCHEMAS)

    def test_source_schema_is_applied(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "sources.json", lambda sources: sources[0].pop("citation"))

            with self.assertRaisesRegex(ValueError, "citation"):
                validate_town_package(town_dir, SCHEMAS)

    def test_location_schema_is_applied(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "locations.json", lambda locations: locations[0].pop("label"))

            with self.assertRaisesRegex(ValueError, "label"):
                validate_town_package(town_dir, SCHEMAS)

    def test_invalid_claim_type_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "claims.json", lambda claims: claims[0].__setitem__("claim_type", "rumor"))

            with self.assertRaisesRegex(ValueError, "claim_type"):
                validate_town_package(town_dir, SCHEMAS)

    def test_missing_claim_type_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "claims.json", lambda claims: claims[0].pop("claim_type"))

            with self.assertRaisesRegex(ValueError, "claim_type"):
                validate_town_package(town_dir, SCHEMAS)

    def test_invalid_confidence_label_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "claims.json", lambda claims: claims[0].__setitem__("confidence", "certain"))

            with self.assertRaisesRegex(ValueError, "confidence"):
                validate_town_package(town_dir, SCHEMAS)

    def test_historical_claim_without_source_ids_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "claims.json", lambda claims: claims[0].__setitem__("source_ids", []))

            with self.assertRaisesRegex(ValueError, "source_ids|needs at least one source"):
                validate_town_package(town_dir, SCHEMAS)

    def test_missing_source_id_reference_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(
                town_dir / "claims.json",
                lambda claims: claims[0].__setitem__("source_ids", ["source_texarkana_missing"]),
            )

            with self.assertRaisesRegex(ValueError, "missing source"):
                validate_town_package(town_dir, SCHEMAS)

    def test_fictional_gameplay_claim_without_fictional_confidence_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(town_dir / "claims.json", lambda claims: claims[1].__setitem__("confidence", "low"))

            with self.assertRaisesRegex(ValueError, "confidence|fictional"):
                validate_town_package(town_dir, SCHEMAS)

    def test_missing_location_id_reference_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(
                town_dir / "claims.json",
                lambda claims: claims[0].__setitem__("related_location_ids", ["loc_texarkana_missing"]),
            )

            with self.assertRaisesRegex(ValueError, "missing location"):
                validate_town_package(town_dir, SCHEMAS)

    def test_mission_link_to_missing_claim_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(
                town_dir / "mission_seed.json",
                lambda mission: mission.__setitem__("claim_ids", ["claim_texarkana_missing"]),
            )

            with self.assertRaisesRegex(ValueError, "mission references missing claim"):
                validate_town_package(town_dir, SCHEMAS)

    def test_mission_link_to_missing_location_is_rejected(self) -> None:
        with copied_town_package() as town_dir:
            mutate_json(
                town_dir / "mission_seed.json",
                lambda mission: mission.__setitem__("location_ids", ["loc_texarkana_missing"]),
            )

            with self.assertRaisesRegex(ValueError, "mission references missing location"):
                validate_town_package(town_dir, SCHEMAS)


@contextmanager
def copied_town_package() -> Iterator[Path]:
    with tempfile.TemporaryDirectory() as temp_dir:
        town_dir = Path(temp_dir) / "texarkana"
        shutil.copytree(TEXARKANA, town_dir)
        yield town_dir


def mutate_json(path: Path, mutation: Callable[[Any], None]) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mutation(data)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()

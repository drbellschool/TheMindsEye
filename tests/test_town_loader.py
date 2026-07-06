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

from mindseye import ClaimType, Confidence, MindseyeDataError, load_town_package

SCHEMAS = ROOT / "data" / "schemas"
TEXARKANA = ROOT / "data" / "towns" / "texarkana"


class TownLoaderTests(unittest.TestCase):
    def test_loads_texarkana_package_without_hard_coding_engine_state(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertEqual(package.package_id, "texarkana_1885")
        self.assertEqual(package.town_name, "Texarkana")
        self.assertGreaterEqual(len(package.sources), 1)
        self.assertGreaterEqual(len(package.locations), 1)
        self.assertGreaterEqual(len(package.claims), 1)

    def test_claim_types_survive_loading(self):
        package = load_town_package(ROOT, "texarkana")
        claim_types = {claim.claim_type for claim in package.claims}

        self.assertIn(ClaimType.SOURCE_BASED_INFERENCE, claim_types)
        self.assertIn(ClaimType.FICTIONAL_GAMEPLAY, claim_types)

    def test_lists_sources_locations_claims_and_mission_seeds(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertIn("source_texarkana_1885_sanborn_loc", [source.source_id for source in package.sources])
        self.assertIn("loc_texarkana_1885_001", [location.location_id for location in package.locations])
        self.assertIn("claim_texarkana_1885_001", [claim.claim_id for claim in package.claims])
        self.assertEqual([seed.mission_id for seed in package.mission_seeds], ["mission_texarkana_1885_001"])

    def test_texarkana_source_and_location_ids_are_stable(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertEqual(
            [source.source_id for source in package.sources],
            ["source_texarkana_1885_sanborn_loc", "source_texarkana_1885_newspaper_placeholder"],
        )
        self.assertEqual(
            [location.location_id for location in package.locations],
            ["loc_texarkana_1885_001", "loc_texarkana_1885_002"],
        )

    def test_sanborn_source_metadata_is_verified(self):
        package = load_town_package(ROOT, "texarkana")
        sanborn_source = package.sources[0]

        self.assertEqual(sanborn_source.source_id, "source_texarkana_1885_sanborn_loc")
        self.assertEqual(sanborn_source.rights_status, "public_domain")
        self.assertEqual(sanborn_source.access_level, "digital_image")
        self.assertEqual(sanborn_source.url, "https://www.loc.gov/item/sanborn08781_001/")
        self.assertIn("Library of Congress", sanborn_source.repository)
        self.assertIn("Oct. 1885", sanborn_source.citation)

    def test_verified_sanborn_metadata_claim_is_loaded(self):
        package = load_town_package(ROOT, "texarkana")
        claims_by_id = {claim.claim_id: claim for claim in package.claims}

        verified_claim = claims_by_id["claim_texarkana_1885_003"]
        self.assertEqual(verified_claim.claim_type, ClaimType.VERIFIED_FACT)
        self.assertEqual(verified_claim.confidence, Confidence.HIGH)
        self.assertEqual(verified_claim.source_ids, ("source_texarkana_1885_sanborn_loc",))

    def test_claim_confidence_survives_loading(self):
        package = load_town_package(ROOT, "texarkana")
        confidence_by_claim_id = {claim.claim_id: claim.confidence for claim in package.claims}

        self.assertEqual(confidence_by_claim_id["claim_texarkana_1885_001"], Confidence.LOW)
        self.assertEqual(confidence_by_claim_id["claim_texarkana_1885_002"], Confidence.FICTIONAL)

    def test_raw_source_records_are_preserved_separately(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertEqual(len(package.raw_source_records), len(package.sources))
        self.assertIsInstance(package.raw_source_records[0], dict)
        self.assertEqual(package.raw_source_records[0]["source_id"], package.sources[0].source_id)
        self.assertNotIsInstance(package.raw_source_records[0], type(package.sources[0]))

    def test_rejects_location_link_to_missing_source(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "locations.json",
                lambda locations: locations[0].__setitem__("source_ids", ["source_texarkana_missing"]),
            )

            with self.assertRaisesRegex(MindseyeDataError, "missing source"):
                load_town_package(repo_root, "texarkana")

    def test_rejects_claim_link_to_missing_source(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "claims.json",
                lambda claims: claims[0].__setitem__("source_ids", ["source_texarkana_missing"]),
            )

            with self.assertRaisesRegex(MindseyeDataError, "missing source"):
                load_town_package(repo_root, "texarkana")

    def test_rejects_claim_link_to_missing_location(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "claims.json",
                lambda claims: claims[0].__setitem__("related_location_ids", ["loc_texarkana_missing"]),
            )

            with self.assertRaisesRegex(MindseyeDataError, "missing location"):
                load_town_package(repo_root, "texarkana")

    def test_rejects_mission_link_to_missing_claim(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "mission_seed.json",
                lambda mission: mission.__setitem__("claim_ids", ["claim_texarkana_missing"]),
            )

            with self.assertRaisesRegex(MindseyeDataError, "mission references missing claim"):
                load_town_package(repo_root, "texarkana")

    def test_rejects_mission_link_to_missing_location(self):
        with copied_repo() as repo_root:
            mutate_json(
                repo_root / "data" / "towns" / "texarkana" / "mission_seed.json",
                lambda mission: mission.__setitem__("location_ids", ["loc_texarkana_missing"]),
            )

            with self.assertRaisesRegex(MindseyeDataError, "mission references missing location"):
                load_town_package(repo_root, "texarkana")


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

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import ClaimType, load_town_package


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


if __name__ == "__main__":
    unittest.main()

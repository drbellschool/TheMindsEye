from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from mindseye import ClaimType, load_town_package
from mindseye.provenance import claims_by_type, has_unsupported_historical_claims, teacher_claim_summary


class ProvenanceTests(unittest.TestCase):
    def test_nonfiction_claims_have_source_support(self):
        package = load_town_package(ROOT, "texarkana")

        self.assertFalse(has_unsupported_historical_claims(package.claims))

    def test_teacher_summary_preserves_claim_labels(self):
        package = load_town_package(ROOT, "texarkana")
        summary = teacher_claim_summary(package.claims)

        self.assertEqual(len(summary), len(package.claims))
        self.assertTrue(all("claim_type" in item for item in summary))
        self.assertTrue(any(item["claim_type"] == ClaimType.FICTIONAL_GAMEPLAY.value for item in summary))

    def test_claims_can_be_grouped_by_type(self):
        package = load_town_package(ROOT, "texarkana")
        grouped = claims_by_type(package.claims)

        self.assertIn(ClaimType.SOURCE_BASED_INFERENCE, grouped)
        self.assertIn(ClaimType.FICTIONAL_GAMEPLAY, grouped)


if __name__ == "__main__":
    unittest.main()

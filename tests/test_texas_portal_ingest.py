from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import asdict
from datetime import date
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mindseye import MindseyeDataError, SourceRecord
from mindseye.ingest.texas_portal import (
    CachedText,
    TexasPortalAdapter,
    TexasPortalFetchResult,
    build_search_url,
    build_source_id,
    parse_ark_reference,
)


SEARCH_HTML = """
<html>
  <head><title>Search results</title></head>
  <body>
    <a href="/ark:/67531/metapth1248256/">Daily Texarkana Democrat</a>
    <a href="https://texashistory.unt.edu/ark:/67531/metapth1248257/">Another Result</a>
    <a href="/ark:/67531/metapth1248256/">Duplicate result</a>
  </body>
</html>
"""

ITEM_HTML = """
<html>
  <head>
    <title>Daily Texarkana Democrat | Portal to Texas History</title>
    <meta name="description" content="Page 3 of the issue." />
    <meta name="dc.rights" content="No known restrictions on publication." />
  </head>
  <body>
    <a href="metadata.dc.xml">DC Metadata</a>
    <a href="metadata.untl.xml">UNTL Metadata</a>
    <a href="ocr.txt">OCR text</a>
  </body>
</html>
"""

METADATA_XML = """
<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
           xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Daily Texarkana Democrat</dc:title>
  <dc:creator>University of North Texas Libraries</dc:creator>
  <dc:publisher>Portal to Texas History (University of North Texas Libraries)</dc:publisher>
  <dc:date>1893-09-12</dc:date>
  <dc:identifier>ark:/67531/metapth1248256</dc:identifier>
  <dc:rights>No known restrictions on publication.</dc:rights>
  <dc:type>newspaper issue</dc:type>
  <dc:description>Page 3.</dc:description>
</oai_dc:dc>
"""

OCR_TEXT = "Daily Texarkana Democrat\nPage 3\nSawmill on the river front\n"


class TexasPortalIngestionTests(unittest.TestCase):
    def test_url_parsing_and_source_id_generation(self) -> None:
        ark = parse_ark_reference("https://texashistory.unt.edu/ark:/67531/metapth1248256/")

        self.assertEqual(ark, "ark:/67531/metapth1248256")
        self.assertEqual(build_search_url("Texarkana 1885"), "https://texashistory.unt.edu/search/?q=Texarkana+1885")
        self.assertEqual(build_source_id(ark), "source_texas_portal_ark_67531_metapth1248256")

    def test_search_parses_candidate_hits_without_promoting_claims(self) -> None:
        adapter = self._build_adapter(
            {
                "https://texashistory.unt.edu/search/?q=Texarkana+1885": SEARCH_HTML,
            }
        )

        result = adapter.search("Texarkana 1885", limit=10)

        self.assertEqual(result.hit_count, 2)
        self.assertTrue(all(hit.access_level == "search_result" for hit in result.hits))
        self.assertTrue(all(hit.rights_status == "rights_unknown" for hit in result.hits))
        self.assertEqual(result.hits[0].source_id, "source_texas_portal_ark_67531_metapth1248256")

    def test_metadata_normalization_preserves_citation_and_rights(self) -> None:
        adapter = self._build_adapter(
            {
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/": ITEM_HTML,
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/metadata.dc.xml": METADATA_XML,
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/ocr.txt": OCR_TEXT,
            }
        )

        snapshot = adapter.fetch_item("ark:/67531/metapth1248256")

        self.assertEqual(snapshot.source_record.source_id, "source_texas_portal_ark_67531_metapth1248256")
        self.assertEqual(snapshot.source_record.title, "Daily Texarkana Democrat")
        self.assertEqual(snapshot.source_record.source_type, "newspaper_issue")
        self.assertEqual(snapshot.source_record.rights_status, "public_domain")
        self.assertEqual(snapshot.source_record.access_level, "metadata_item_page_and_ocr")
        self.assertIn("Portal to Texas History", snapshot.source_record.citation)
        self.assertEqual(snapshot.citation_fields["date"], "1893-09-12")
        self.assertEqual(snapshot.rights_access["rights_text"], "No known restrictions on publication.")
        self.assertTrue(snapshot.page_excerpts)
        self.assertTrue(any("Page 3" in excerpt for excerpt in snapshot.page_excerpts))

    def test_cache_behavior_reuses_saved_response(self) -> None:
        call_count = {"count": 0}

        def fetcher(url: str) -> TexasPortalFetchResult:
            call_count["count"] += 1
            body = METADATA_XML if url.endswith("metadata.dc.xml") else ITEM_HTML
            return TexasPortalFetchResult(
                url=url,
                status_code=200,
                headers={"content-type": "text/xml; charset=utf-8"},
                content=body.encode("utf-8"),
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            adapter = TexasPortalAdapter(
                repo_root=ROOT,
                cache_dir=cache_dir,
                normalized_dir=cache_dir / "normalized",
                fetcher=fetcher,
                today=lambda: date(2024, 1, 2),
            )
            first = adapter._fetch_cached_text(  # type: ignore[attr-defined]
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/",
                purpose="item_page",
                suffix=".html",
            )
            second = adapter._fetch_cached_text(  # type: ignore[attr-defined]
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/",
                purpose="item_page",
                suffix=".html",
            )

            self.assertFalse(first.from_cache)
            self.assertTrue(second.from_cache)
            self.assertEqual(call_count["count"], 1)
            self.assertTrue(Path(first.cache_path).exists())
            self.assertEqual(first.text, second.text)

    def test_source_record_output_is_json_ready(self) -> None:
        adapter = self._build_adapter(
            {
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/": ITEM_HTML,
                "https://texashistory.unt.edu/ark:/67531/metapth1248256/metadata.dc.xml": METADATA_XML,
            }
        )

        snapshot = adapter.fetch_item("https://texashistory.unt.edu/ark:/67531/metapth1248256/")
        payload = asdict(snapshot)

        self.assertIsInstance(snapshot.source_record, SourceRecord)
        self.assertEqual(payload["source_record"]["source_id"], "source_texas_portal_ark_67531_metapth1248256")
        self.assertEqual(payload["review_state"], "candidate")
        self.assertIn("endpoint_discovery", payload)
        self.assertIn("metadata_fields", payload)

    def test_blank_query_is_rejected(self) -> None:
        adapter = self._build_adapter({})

        with self.assertRaisesRegex(MindseyeDataError, "search query cannot be blank"):
            adapter.search(" ")

    def _build_adapter(self, responses: dict[str, str]) -> TexasPortalAdapter:
        def fetcher(url: str) -> TexasPortalFetchResult:
            if url not in responses:
                raise MindseyeDataError(f"unexpected test fetch: {url}")
            content_type = "text/html; charset=utf-8"
            if url.endswith(".xml"):
                content_type = "application/xml; charset=utf-8"
            elif url.endswith(".txt"):
                content_type = "text/plain; charset=utf-8"
            return TexasPortalFetchResult(
                url=url,
                status_code=200,
                headers={"content-type": content_type},
                content=responses[url].encode("utf-8"),
            )

        return TexasPortalAdapter(
            repo_root=ROOT,
            cache_dir=Path(tempfile.mkdtemp()),
            normalized_dir=Path(tempfile.mkdtemp()),
            fetcher=fetcher,
            today=lambda: date(2024, 1, 2),
        )


if __name__ == "__main__":
    unittest.main()

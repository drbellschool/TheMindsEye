"""Texas Portal / UNT Digital Library ingestion spike.

This module is deliberately conservative:

- it fetches only candidate source records;
- it caches raw responses locally;
- it normalizes metadata into a SourceRecord shape;
- and it keeps OCR/page excerpts separate from verified history.

No claim promotion, gameplay generation, or automatic verification occurs here.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from ..models import MindseyeDataError, SourceRecord
from ..town_loader import repo_root_from

DEFAULT_PORTAL_BASE_URL = "https://texashistory.unt.edu"
DEFAULT_UNT_BASE_URL = "https://digital.library.unt.edu"
DEFAULT_REPOSITORY = "Portal to Texas History (University of North Texas Libraries)"
DEFAULT_USER_AGENT = "TheMindsEye/texas-portal-ingestion-spike"
ARK_PATTERN = re.compile(r"(?:info:)?ark:/(\d+)/([A-Za-z0-9._-]+)", re.IGNORECASE)
ITEM_HINTS = ("ark:/", "/ark:/", "info:ark/")
OCR_HINTS = ("ocr", "transcript", "transcription", "full text", "full-text", "search inside")


@dataclass(frozen=True)
class TexasPortalFetchResult:
    url: str
    status_code: int
    headers: dict[str, str]
    content: bytes


@dataclass(frozen=True)
class CachedText:
    url: str
    cache_path: str
    from_cache: bool
    content_type: str
    text: str


@dataclass(frozen=True)
class TexasPortalSearchHit:
    title: str
    item_url: str
    ark: str
    source_id: str
    citation: str
    rights_status: str
    access_level: str
    snippet: str = ""


@dataclass(frozen=True)
class TexasPortalSearchResult:
    query: str
    search_url: str
    cache_path: str
    hit_count: int
    hits: tuple[TexasPortalSearchHit, ...]
    notes: str = ""


@dataclass(frozen=True)
class TexasPortalEndpointDiscovery:
    item_url: str
    ark: str
    search_url: str
    metadata_urls: tuple[str, ...]
    oai_get_record_url: str
    iiif_manifest_url: str
    thumbnail_url: str
    small_image_url: str
    urls_text_url: str
    stats_url: str
    page_text_urls: tuple[str, ...]
    notes: str = ""


@dataclass(frozen=True)
class TexasPortalSourceSnapshot:
    source_id: str
    ark: str
    item_url: str
    search_url: str
    source_record: SourceRecord
    citation_fields: dict[str, str]
    rights_access: dict[str, str]
    endpoint_discovery: TexasPortalEndpointDiscovery
    metadata_fields: dict[str, list[str]]
    page_excerpts: tuple[str, ...]
    raw_metadata: dict[str, Any]
    review_state: str = "candidate"
    notes: str = ""


@dataclass(frozen=True)
class _ParsedHTML:
    title: str = ""
    meta_fields: dict[str, list[str]] = field(default_factory=dict)
    links: tuple[tuple[str, str], ...] = ()


class _PortalHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title_parts: list[str] = []
        self.meta_fields: dict[str, list[str]] = {}
        self.links: list[tuple[str, str]] = []
        self._current_link_href: str | None = None
        self._current_link_text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {key.lower(): value or "" for key, value in attrs}
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            key = attr_map.get("name") or attr_map.get("property") or attr_map.get("itemprop")
            value = attr_map.get("content") or attr_map.get("value") or attr_map.get("charset")
            if key and value:
                self.meta_fields.setdefault(normalize_field_name(key), []).append(_collapse_whitespace(value))
        elif tag == "a":
            href = attr_map.get("href", "").strip()
            if href:
                self._current_link_href = href
                self._current_link_text_parts = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = False
        elif tag == "a" and self._current_link_href:
            text = _collapse_whitespace("".join(self._current_link_text_parts))
            self.links.append((self._current_link_href, text))
            self._current_link_href = None
            self._current_link_text_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self._current_link_href:
            self._current_link_text_parts.append(data)


class TexasPortalAdapter:
    """Fetch, cache, and normalize Portal to Texas History source records."""

    def __init__(
        self,
        repo_root: Path | None = None,
        cache_dir: Path | None = None,
        normalized_dir: Path | None = None,
        base_url: str = DEFAULT_PORTAL_BASE_URL,
        fetcher: Callable[[str], TexasPortalFetchResult] | None = None,
        today: Callable[[], date] | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.repo_root = repo_root_from(repo_root)
        self.base_url = base_url.rstrip("/")
        self.cache_dir = Path(cache_dir) if cache_dir is not None else self.repo_root / "data" / "raw" / "texas_portal"
        self.normalized_dir = (
            Path(normalized_dir)
            if normalized_dir is not None
            else self.repo_root / "data" / "normalized" / "texas_portal"
        )
        self.fetcher = fetcher or self._default_fetcher
        self.today = today or date.today
        self.timeout_seconds = timeout_seconds
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.normalized_dir.mkdir(parents=True, exist_ok=True)

    def search(self, query: str, limit: int = 10) -> TexasPortalSearchResult:
        query = query.strip()
        if not query:
            raise MindseyeDataError("search query cannot be blank")

        search_url = build_search_url(query, self.base_url)
        cached = self._fetch_cached_text(search_url, purpose="search", suffix=".html")
        parsed = parse_html_document(cached.text)
        hits = tuple(self._parse_search_hits(parsed, search_url)[: max(limit, 0)])
        notes = "Search results are candidate records only; no claims were created."
        return TexasPortalSearchResult(
            query=query,
            search_url=search_url,
            cache_path=cached.cache_path,
            hit_count=len(hits),
            hits=hits,
            notes=notes,
        )

    def fetch_item(self, item_ref: str) -> TexasPortalSourceSnapshot:
        ark, item_url = normalize_item_reference(item_ref, self.base_url)
        source_id = build_source_id(ark or item_url)
        search_url = build_search_url(item_ref if not ark else ark, self.base_url)

        page_doc = self._fetch_cached_text(item_url, purpose="item_page", suffix=".html")
        page_html = parse_html_document(page_doc.text)

        endpoint_discovery = discover_item_endpoints(
            item_url=item_url,
            ark=ark,
            base_url=self.base_url,
            page_html=page_html,
        )

        metadata_documents: dict[str, dict[str, list[str]]] = {}
        merged_fields: dict[str, list[str]] = {}

        page_fields = page_html.meta_fields
        if page_fields:
            metadata_documents[item_url] = page_fields
            merged_fields = merge_metadata_fields(merged_fields, page_fields)

        for metadata_url in self._metadata_candidate_urls(item_url, ark, endpoint_discovery):
            try:
                doc = self._fetch_cached_text(metadata_url, purpose="metadata", suffix=_suffix_for_url(metadata_url))
            except MindseyeDataError:
                continue
            parsed_fields = parse_metadata_document(doc.text)
            if parsed_fields:
                metadata_documents[metadata_url] = parsed_fields
                merged_fields = merge_metadata_fields(merged_fields, parsed_fields)
            if merged_fields.get("title") and (merged_fields.get("rights") or merged_fields.get("access_rights")):
                break

        ocr_text = ""
        ocr_cache_paths: list[str] = []
        for page_text_url in endpoint_discovery.page_text_urls:
            try:
                ocr_doc = self._fetch_cached_text(page_text_url, purpose="ocr", suffix=_suffix_for_url(page_text_url))
            except MindseyeDataError:
                continue
            ocr_cache_paths.append(ocr_doc.cache_path)
            ocr_text = ocr_doc.text
            break

        page_excerpts = build_page_excerpts(ocr_text, page_html.title, merged_fields)
        citation_fields = build_citation_fields(merged_fields, page_html.title, item_url, ark)
        rights_access = build_rights_access_fields(merged_fields, bool(ocr_text), page_text_url=ocr_cache_paths[0] if ocr_cache_paths else "")

        title = citation_fields.get("title") or page_html.title or _title_from_ark(ark) or item_url
        source_type = normalize_source_type(
            select_first_value(merged_fields, "type", "dc_type", "resource_type", "dc_resource_type", "format", "dc_format")
        )
        source_record = SourceRecord(
            source_id=source_id,
            title=title,
            source_type=source_type,
            citation=citation_fields["citation"],
            rights_status=rights_access["rights_status"],
            access_level=rights_access["access_level"],
            repository=citation_fields["repository"],
            url=item_url,
            accessed_date=self.today().isoformat(),
            notes=_build_source_notes(endpoint_discovery, page_excerpts, metadata_documents),
        )

        raw_metadata = {
            "merged_fields": merged_fields,
            "documents": metadata_documents,
            "endpoint_discovery": asdict(endpoint_discovery),
            "page_html": {
                "title": page_html.title,
                "meta_fields": page_html.meta_fields,
                "links": [{"href": href, "text": text} for href, text in page_html.links],
            },
        }

        notes = "Candidate source snapshot only; no claims or review promotions were created."
        return TexasPortalSourceSnapshot(
            source_id=source_id,
            ark=ark,
            item_url=item_url,
            search_url=search_url,
            source_record=source_record,
            citation_fields=citation_fields,
            rights_access=rights_access,
            endpoint_discovery=endpoint_discovery,
            metadata_fields=merged_fields,
            page_excerpts=page_excerpts,
            raw_metadata=raw_metadata,
            review_state="candidate",
            notes=notes,
        )

    def write_normalized_snapshot(self, snapshot: TexasPortalSourceSnapshot, filename: str | None = None) -> Path:
        self.normalized_dir.mkdir(parents=True, exist_ok=True)
        target = self.normalized_dir / (filename or f"{snapshot.source_id}.json")
        target.write_text(json.dumps(asdict(snapshot), indent=2, sort_keys=True), encoding="utf-8")
        return target

    def _metadata_candidate_urls(
        self,
        item_url: str,
        ark: str,
        discovery: TexasPortalEndpointDiscovery,
    ) -> tuple[str, ...]:
        urls: list[str] = [
            build_metadata_url(item_url, "metadata.dc.xml"),
            build_metadata_url(item_url, "metadata.untl.xml"),
            build_metadata_url(item_url, "metadata.dc.rdf"),
        ]
        if discovery.oai_get_record_url:
            urls.append(discovery.oai_get_record_url)
        return tuple(_unique(urls))

    def _fetch_cached_text(self, url: str, purpose: str, suffix: str) -> CachedText:
        cache_path = self._cache_path(url, purpose, suffix)
        if cache_path.exists():
            return CachedText(
                url=url,
                cache_path=str(cache_path),
                from_cache=True,
                content_type=_content_type_for_suffix(suffix),
                text=cache_path.read_text(encoding="utf-8"),
            )

        response = self.fetcher(url)
        text = _decode_response_content(response.content, response.headers)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(text, encoding="utf-8")
        metadata_path = cache_path.with_suffix(cache_path.suffix + ".meta.json")
        metadata_path.write_text(
            json.dumps(
                {
                    "url": response.url,
                    "requested_url": url,
                    "purpose": purpose,
                    "status_code": response.status_code,
                    "content_type": response.headers.get("content-type", ""),
                    "cached_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        return CachedText(
            url=response.url,
            cache_path=str(cache_path),
            from_cache=False,
            content_type=response.headers.get("content-type", ""),
            text=text,
        )

    def _cache_path(self, url: str, purpose: str, suffix: str) -> Path:
        reference = normalize_cache_reference(url)
        digest = hashlib.sha256(f"{purpose}\n{url}".encode("utf-8")).hexdigest()[:12]
        name = f"{purpose}_{reference}_{digest}{suffix}"
        return self.cache_dir / name

    def _parse_search_hits(self, parsed: _ParsedHTML, search_url: str) -> list[TexasPortalSearchHit]:
        hits: list[TexasPortalSearchHit] = []
        seen: set[str] = set()
        for href, text in parsed.links:
            resolved = urljoin(search_url, href)
            ark = parse_ark_reference(resolved) or parse_ark_reference(href) or ""
            if not ark and not any(hint in resolved.lower() for hint in ITEM_HINTS):
                continue
            item_url = build_item_url(ark, self.base_url, resolved if resolved.startswith("http") else "")
            source_ref = ark or item_url
            source_id = build_source_id(source_ref)
            if source_id in seen:
                continue
            seen.add(source_id)
            title = text or parsed.title or _title_from_ark(ark) or source_id
            citation = f"{title}. {item_url}"
            hits.append(
                TexasPortalSearchHit(
                    title=title,
                    item_url=item_url,
                    ark=ark,
                    source_id=source_id,
                    citation=citation,
                    rights_status="rights_unknown",
                    access_level="search_result",
                    snippet="",
                )
            )
        return hits

    def _default_fetcher(self, url: str) -> TexasPortalFetchResult:
        request = Request(
            url,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept": "text/html,application/xml,application/json,text/plain;q=0.9,*/*;q=0.8",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read()
                headers = {key.lower(): value for key, value in response.headers.items()}
                status_code = int(getattr(response, "status", response.getcode() or 200))
                return TexasPortalFetchResult(
                    url=response.geturl(),
                    status_code=status_code,
                    headers=headers,
                    content=body,
                )
        except HTTPError as exc:
            raise MindseyeDataError(f"HTTP error fetching {url}: {exc.code}") from exc
        except URLError as exc:
            raise MindseyeDataError(f"network error fetching {url}: {exc.reason}") from exc


def build_search_url(query: str, base_url: str = DEFAULT_PORTAL_BASE_URL) -> str:
    return f"{base_url.rstrip('/')}/search/?{urlencode({'q': query})}"


def build_item_url(ark: str, base_url: str = DEFAULT_PORTAL_BASE_URL, host_override: str = "") -> str:
    if host_override:
        base = host_override.rstrip("/")
    else:
        base = base_url.rstrip("/")
    if not ark:
        return base + "/"
    return f"{base}/{ark.strip('/')}/"


def build_metadata_url(item_url: str, suffix: str) -> str:
    return f"{item_url.rstrip('/')}/{suffix.lstrip('/')}"


def build_oai_get_record_url(ark: str, base_url: str = DEFAULT_PORTAL_BASE_URL) -> str:
    if not ark:
        return ""
    query = urlencode(
        {
            "verb": "GetRecord",
            "metadataPrefix": "oai_dc",
            "identifier": f"info:{ark}",
        }
    )
    return f"{base_url.rstrip('/')}/oai/?{query}"


def build_stats_url(item_url: str, ark: str) -> str:
    if not ark:
        return ""
    return f"{item_url.rstrip('/')}/stats/stats.json?{urlencode({'ark': ark})}"


def parse_ark_reference(raw: str) -> str:
    match = ARK_PATTERN.search(raw.strip())
    if not match:
        raise MindseyeDataError(f"could not parse ARK reference from: {raw}")
    return f"ark:/{match.group(1)}/{match.group(2).rstrip('/')}"


def normalize_item_reference(raw: str, base_url: str = DEFAULT_PORTAL_BASE_URL) -> tuple[str, str]:
    candidate = raw.strip()
    if not candidate:
        raise MindseyeDataError("item reference cannot be blank")
    ark = ""
    try:
        ark = parse_ark_reference(candidate)
    except MindseyeDataError:
        ark = ""
    if candidate.startswith("http://") or candidate.startswith("https://"):
        if ark:
            parsed = urlparse(candidate)
            base = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else base_url
            return ark, build_item_url(ark, base)
        return "", candidate.rstrip("/") + "/"
    if ark:
        return ark, build_item_url(ark, base_url)
    if candidate.startswith("ark:/") or candidate.startswith("info:ark/"):
        ark = canonicalize_ark(candidate)
        return ark, build_item_url(ark, base_url)
    return "", candidate


def canonicalize_ark(raw: str) -> str:
    return parse_ark_reference(raw)


def build_source_id(reference: str) -> str:
    try:
        ark = parse_ark_reference(reference)
        normalized = normalize_cache_reference(ark)
        return f"source_texas_portal_{normalized}"
    except MindseyeDataError:
        digest = hashlib.sha256(reference.strip().encode("utf-8")).hexdigest()[:16]
        return f"source_texas_portal_{digest}"


def discover_item_endpoints(
    item_url: str,
    ark: str,
    base_url: str = DEFAULT_PORTAL_BASE_URL,
    page_html: _ParsedHTML | None = None,
) -> TexasPortalEndpointDiscovery:
    metadata_urls = tuple(
        url
        for url in (
            build_metadata_url(item_url, "metadata.untl.xml"),
            build_metadata_url(item_url, "metadata.dc.rdf"),
            build_metadata_url(item_url, "metadata.dc.xml"),
            build_metadata_url(item_url, "metadata.mets.xml"),
            build_metadata_url(item_url, "opensearch.xml"),
            build_metadata_url(item_url, "manifest/"),
            build_metadata_url(item_url, "thumbnail/"),
            build_metadata_url(item_url, "small/"),
            build_metadata_url(item_url, "urls.txt"),
        )
        if url
    )
    search_url = build_search_url(ark or item_url, base_url)
    oai_get_record_url = build_oai_get_record_url(ark, base_url)
    stats_url = build_stats_url(item_url, ark)
    page_text_urls = tuple(_discover_page_text_urls(item_url, page_html) if page_html is not None else ())
    return TexasPortalEndpointDiscovery(
        item_url=item_url,
        ark=ark,
        search_url=search_url,
        metadata_urls=metadata_urls,
        oai_get_record_url=oai_get_record_url,
        iiif_manifest_url=build_metadata_url(item_url, "manifest/"),
        thumbnail_url=build_metadata_url(item_url, "thumbnail/"),
        small_image_url=build_metadata_url(item_url, "small/"),
        urls_text_url=build_metadata_url(item_url, "urls.txt"),
        stats_url=stats_url,
        page_text_urls=page_text_urls,
        notes="Discovery is candidate-only; OCR/page-text links are optional and may vary by record.",
    )


def parse_html_document(text: str) -> _ParsedHTML:
    parser = _PortalHTMLParser()
    parser.feed(text)
    title = _collapse_whitespace("".join(parser.title_parts))
    return _ParsedHTML(title=title, meta_fields=dict(parser.meta_fields), links=tuple(parser.links))


def parse_metadata_document(text: str) -> dict[str, list[str]]:
    text = text.strip()
    if not text:
        return {}
    if "<" in text and ">" in text:
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return parse_html_meta_fields(text)
        return parse_xml_metadata_fields(root)
    return {}


def parse_html_meta_fields(text: str) -> dict[str, list[str]]:
    parsed = parse_html_document(text)
    return parsed.meta_fields


def parse_xml_metadata_fields(root: ET.Element) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for element in root.iter():
        local_name = _xml_local_name(element.tag)
        if not local_name:
            continue
        value = _collapse_whitespace(element.text or "")
        if not value:
            continue
        if list(element):
            continue
        fields.setdefault(normalize_field_name(local_name), []).append(value)
    return fields


def merge_metadata_fields(
    existing: dict[str, list[str]],
    incoming: dict[str, list[str]],
) -> dict[str, list[str]]:
    merged: dict[str, list[str]] = {key: list(values) for key, values in existing.items()}
    for key, values in incoming.items():
        bucket = merged.setdefault(key, [])
        for value in values:
            if value not in bucket:
                bucket.append(value)
    return merged


def build_citation_fields(
    metadata_fields: dict[str, list[str]],
    html_title: str,
    item_url: str,
    ark: str,
) -> dict[str, str]:
    title = (
        select_first_value(metadata_fields, "title", "dc_title", "name")
        or html_title
        or _title_from_ark(ark)
        or item_url
    )
    creator = select_joined_value(metadata_fields, "creator", "dc_creator", "contributor", "dc_contributor")
    publisher = select_first_value(metadata_fields, "publisher", "dc_publisher", "provider", "dc_provider") or DEFAULT_REPOSITORY
    date_value = select_first_value(metadata_fields, "date", "dc_date", "issued", "dc_issued", "created", "dc_created")
    identifier = ark or select_first_value(metadata_fields, "identifier", "dc_identifier") or item_url
    rights_text = select_first_value(metadata_fields, "rights", "dc_rights", "access_rights", "dc_access_rights")
    citation_parts = [title]
    if creator:
        citation_parts.append(creator)
    if date_value:
        citation_parts.append(date_value)
    citation_parts.append(publisher)
    citation_parts.append(item_url)
    citation = ". ".join(part for part in citation_parts if part)
    return {
        "title": title,
        "creator": creator,
        "publisher": publisher,
        "date": date_value,
        "identifier": identifier,
        "rights_text": rights_text,
        "citation": citation,
        "repository": publisher,
        "source_url": item_url,
    }


def build_rights_access_fields(
    metadata_fields: dict[str, list[str]],
    ocr_available: bool,
    page_text_url: str = "",
) -> dict[str, str]:
    rights_text = select_first_value(metadata_fields, "rights", "dc_rights", "access_rights", "dc_access_rights")
    rights_status = classify_rights_status(rights_text)
    access_level = "metadata_and_item_page"
    if ocr_available:
        access_level = "metadata_item_page_and_ocr"
    if not rights_text:
        rights_text = "rights not stated in fetched metadata"
    access_note = "OCR candidate discovered" if ocr_available else "OCR not discovered for this record"
    if page_text_url:
        access_note = f"{access_note}; page text cache: {page_text_url}"
    return {
        "rights_text": rights_text,
        "rights_status": rights_status,
        "access_level": access_level,
        "access_note": access_note,
    }


def build_page_excerpts(
    ocr_text: str,
    html_title: str,
    metadata_fields: dict[str, list[str]],
    max_excerpts: int = 3,
) -> tuple[str, ...]:
    excerpts: list[str] = []
    if ocr_text.strip():
        excerpts.extend(_top_nonempty_lines(ocr_text, max_excerpts))
    else:
        description = select_first_value(
            metadata_fields,
            "description",
            "dc_description",
            "abstract",
            "dc_abstract",
            "summary",
            "dc_summary",
        )
        if html_title:
            excerpts.append(html_title)
        if description and description != html_title:
            excerpts.append(description)
    if not excerpts and html_title:
        excerpts.append(html_title)
    return tuple(_unique(excerpts)[:max_excerpts])


def classify_rights_status(rights_text: str | None) -> str:
    if not rights_text:
        return "rights_unknown"
    lowered = rights_text.lower()
    if any(term in lowered for term in ("no known restrictions", "public domain", "public-domain", "pd ")):
        return "public_domain"
    if any(term in lowered for term in ("copyright", "all rights reserved", "restricted", "permission")):
        return "copyright_restricted"
    return "rights_unclear"


def normalize_source_type(raw: str | None) -> str:
    if not raw:
        return "portal_item"
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", raw).strip("_").lower()
    return cleaned or "portal_item"


def select_first_value(metadata_fields: dict[str, list[str]], *keys: str) -> str:
    for key in keys:
        values = metadata_fields.get(key, [])
        for value in values:
            if value.strip():
                return value.strip()
    return ""


def select_joined_value(metadata_fields: dict[str, list[str]], *keys: str) -> str:
    values: list[str] = []
    for key in keys:
        for value in metadata_fields.get(key, []):
            cleaned = value.strip()
            if cleaned and cleaned not in values:
                values.append(cleaned)
    return "; ".join(values)


def normalize_field_name(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", text)
    text = re.sub(r"[^A-Za-z0-9]+", "_", text)
    return text.strip("_").lower()


def normalize_cache_reference(raw: str, max_length: int = 70) -> str:
    text = raw.strip()
    text = text.replace("info:ark/", "ark_")
    text = text.replace("ark:/", "ark_")
    text = re.sub(r"[^A-Za-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_").lower()
    if not text:
        text = "record"
    if len(text) > max_length:
        text = text[:max_length].rstrip("_")
    return text


def _build_source_notes(
    endpoint_discovery: TexasPortalEndpointDiscovery,
    page_excerpts: tuple[str, ...],
    metadata_documents: dict[str, dict[str, list[str]]],
) -> str:
    parts = [
        "candidate_only",
        f"metadata_documents={len(metadata_documents)}",
        f"page_excerpts={len(page_excerpts)}",
        f"metadata_urls={len(endpoint_discovery.metadata_urls)}",
    ]
    if endpoint_discovery.page_text_urls:
        parts.append(f"page_text_candidates={len(endpoint_discovery.page_text_urls)}")
    return "; ".join(parts)


def _discover_page_text_urls(item_url: str, parsed: _ParsedHTML | None) -> list[str]:
    if parsed is None:
        return []
    discovered: list[str] = []
    for href, text in parsed.links:
        resolved = urljoin(item_url, href)
        lower_href = resolved.lower()
        lower_text = text.lower()
        if "urls.txt" in lower_href:
            continue
        if any(hint in lower_href for hint in OCR_HINTS) or any(hint in lower_text for hint in OCR_HINTS):
            discovered.append(resolved)
        elif lower_href.endswith(".txt") and "urls.txt" not in lower_href:
            discovered.append(resolved)
    return _unique(discovered)


def _decode_response_content(content: bytes, headers: dict[str, str]) -> str:
    charset = headers.get("content-type", "")
    match = re.search(r"charset=([A-Za-z0-9._-]+)", charset, re.IGNORECASE)
    encoding = match.group(1) if match else "utf-8"
    try:
        return content.decode(encoding)
    except UnicodeDecodeError:
        return content.decode("utf-8", errors="replace")


def _suffix_for_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.lower()
    if path.endswith(".xml"):
        return ".xml"
    if path.endswith(".rdf"):
        return ".rdf"
    if path.endswith(".json"):
        return ".json"
    if path.endswith(".txt"):
        return ".txt"
    return ".html"


def _content_type_for_suffix(suffix: str) -> str:
    suffix = suffix.lower()
    if suffix == ".xml":
        return "application/xml"
    if suffix == ".rdf":
        return "application/rdf+xml"
    if suffix == ".json":
        return "application/json"
    if suffix == ".txt":
        return "text/plain"
    return "text/html"


def _title_from_ark(ark: str) -> str:
    if not ark:
        return ""
    return ark.split("/")[-1]


def _xml_local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def _collapse_whitespace(raw: str) -> str:
    return " ".join(raw.split())


def _top_nonempty_lines(text: str, limit: int) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = _collapse_whitespace(raw_line)
        if not line or line in seen:
            continue
        seen.add(line)
        lines.append(line)
        if len(lines) >= limit:
            break
    return lines


def _unique(items: list[str] | tuple[str, ...]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            output.append(item)
    return output


def _metadata_value_present(fields: dict[str, list[str]], key: str) -> bool:
    return bool(select_first_value(fields, key))

"""Ingestion helpers for source discovery and normalization."""

from .texas_portal import (
    TexasPortalAdapter,
    TexasPortalEndpointDiscovery,
    TexasPortalFetchResult,
    TexasPortalSearchHit,
    TexasPortalSearchResult,
    TexasPortalSourceSnapshot,
    build_search_url,
    build_source_id,
    parse_ark_reference,
)

__all__ = [
    "TexasPortalAdapter",
    "TexasPortalEndpointDiscovery",
    "TexasPortalFetchResult",
    "TexasPortalSearchHit",
    "TexasPortalSearchResult",
    "TexasPortalSourceSnapshot",
    "build_search_url",
    "build_source_id",
    "parse_ark_reference",
]

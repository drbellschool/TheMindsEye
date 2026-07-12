import type { GeoCoordinate } from "./historical-map-georeference.ts";

export type GeocodeBoundingBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type GeocodeSuccess = {
  ok: true;
  source: "direct_coordinates" | "nominatim";
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox: GeocodeBoundingBox | null;
  defaultZoom: number;
};

export type GeocodeFailureCode = "empty_query" | "query_too_long" | "invalid_coordinates" | "no_results" | "provider_error";

export type GeocodeFailure = {
  ok: false;
  code: GeocodeFailureCode;
  message: string;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: unknown;
};

const maxGeocodeQueryLength = 160;
const geocodeCacheTtlMs = 24 * 60 * 60 * 1000;
const geocodeCache = new Map<string, { expiresAt: number; result: GeocodeResult }>();

export function normalizeLocationQuery(query: unknown): { ok: true; query: string } | GeocodeFailure {
  if (typeof query !== "string") {
    return { ok: false, code: "empty_query", message: "Enter a town, address, ZIP code, or latitude and longitude." };
  }

  const normalized = query.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return { ok: false, code: "empty_query", message: "Enter a town, address, ZIP code, or latitude and longitude." };
  }

  if (normalized.length > maxGeocodeQueryLength) {
    return { ok: false, code: "query_too_long", message: `Location searches are limited to ${maxGeocodeQueryLength} characters.` };
  }

  return { ok: true, query: normalized };
}

export function parseDirectCoordinates(query: string): GeoCoordinate | null {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

export function parseNominatimBoundingBox(value: unknown): GeocodeBoundingBox | null {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const [south, north, west, east] = value.map((item) => Number(item));

  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west) ||
    north < south ||
    east < west ||
    north > 90 ||
    south < -90 ||
    east > 180 ||
    west < -180
  ) {
    return null;
  }

  return { north, south, east, west };
}

export function mapNominatimResult(query: string, row: NominatimResult | null | undefined): GeocodeResult {
  const latitude = Number(row?.lat);
  const longitude = Number(row?.lon);

  if (!row || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false, code: "no_results", message: "No usable map location was found for that search." };
  }

  return {
    ok: true,
    source: "nominatim",
    query,
    displayName: row.display_name?.trim() || query,
    latitude,
    longitude,
    boundingBox: parseNominatimBoundingBox(row.boundingbox),
    defaultZoom: 15,
  };
}

export function buildTownPackageLocationUpdate(result: GeocodeSuccess) {
  return {
    center_latitude: result.latitude,
    center_longitude: result.longitude,
    default_zoom: result.defaultZoom,
    location_query: result.query,
    location_display_name: result.displayName,
    location_north: result.boundingBox?.north ?? null,
    location_south: result.boundingBox?.south ?? null,
    location_east: result.boundingBox?.east ?? null,
    location_west: result.boundingBox?.west ?? null,
  };
}

export function mapViewFromGeocodeResult(result: GeocodeSuccess): { center: GeoCoordinate; zoom: number } {
  return {
    center: { latitude: result.latitude, longitude: result.longitude },
    zoom: result.defaultZoom,
  };
}

function cacheKey(query: string): string {
  return query.toLowerCase();
}

export async function geocodeLocation(
  rawQuery: unknown,
  fetchImpl: FetchLike = fetch,
  nowMs = Date.now(),
): Promise<GeocodeResult> {
  const normalized = normalizeLocationQuery(rawQuery);

  if (!normalized.ok) {
    return normalized;
  }

  const directCoordinates = parseDirectCoordinates(normalized.query);

  if (directCoordinates) {
    return {
      ok: true,
      source: "direct_coordinates",
      query: normalized.query,
      displayName: `${directCoordinates.latitude.toFixed(6)}, ${directCoordinates.longitude.toFixed(6)}`,
      latitude: directCoordinates.latitude,
      longitude: directCoordinates.longitude,
      boundingBox: null,
      defaultZoom: 15,
    };
  }

  const key = cacheKey(normalized.query);
  const cached = geocodeCache.get(key);

  if (cached && cached.expiresAt > nowMs) {
    return cached.result;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", normalized.query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.GEOCODING_USER_AGENT ?? "TheMindsEye/0.1 (https://github.com/drbellschool/TheMindsEye)",
      },
    });

    if (!response.ok) {
      return { ok: false, code: "provider_error", message: `Location search failed with provider status ${response.status}.` };
    }

    const data = await response.json();
    const result = mapNominatimResult(normalized.query, Array.isArray(data) ? (data[0] as NominatimResult | undefined) : null);

    if (result.ok) {
      geocodeCache.set(key, { expiresAt: nowMs + geocodeCacheTtlMs, result });
    }

    return result;
  } catch {
    return { ok: false, code: "provider_error", message: "Location search failed before a map result was returned." };
  }
}

import { cache } from "react";

import {
  clampOverlayOpacity,
  cornersFromBounds,
  isNearZeroCoordinate,
  isOperationalMapCenter,
  normalizeControlPoint,
  normalizeGeoreferenceStatus,
  normalizeGeoreferenceTargetType,
  normalizeTransformationType,
  type AffineTransformMatrix,
  type GeoCoordinate,
  type HistoricalMapControlPoint,
  type HistoricalMapGeoreference,
} from "./historical-map-georeference.ts";
import {
  mergeSavedAndDefaultSheetGeoreferences,
  normalizeGeoEditMode,
  normalizeGeographicMapSettings,
  normalizeSheetGeographicTransform,
  normalizeSheetGeoreferenceStatus,
  normalizeSheetPlacementStatus,
  normalizeSheetWarpType,
  normalizeProjectiveMatrix,
  type SheetGeographicTransform,
} from "./historical-map-sheet-georeference.ts";
import {
  mergeSavedAndDefaultMapPieceGeoreferences,
  normalizeSanbornMapPieceGeoreference,
  persistedMapPieceTargetGeometry,
  validateMapPieceGeographicCorners,
  type SanbornMapPieceGeoreference,
} from "./sanborn-map-piece-georeference.ts";
import {
  normalizeTownIndexRegionType,
  normalizeTownIndexStatus,
  validateTownIndexRegionPolygon,
  type SanbornTownIndexRegionRecord,
} from "./sanborn-town-index.ts";
import {
  findDuplicateStudioSheetNumbers,
  findMissingStudioSheetNumbers,
  isControlledSanbornStoragePath,
  mergeSavedAndDefaultPlacements,
  normalizePlacement,
  normalizeReviewClassification,
  normalizeViewport,
  studioSignedUrlTtlSeconds,
  type HistoricalMapStudioState,
  type StudioMode,
  type StudioPlacement,
  type StudioSheetAsset,
  type StudioSourceOption,
  type StudioTownPackage,
  type StudioWorkspace,
} from "./historical-map-studio.ts";
import { sanbornSheetBucket } from "./sanborn-intake.ts";
import { createEmptySanbornAtlasInventoryState } from "./sanborn-atlas.ts";
import { loadSanbornAtlasInventory } from "./sanborn-atlas-data.ts";
import { createAdminClient, hasSupabaseAdminEnv } from "./supabase/admin.ts";

type TownPackageRow = {
  id: string;
  package_id: string;
  name: string;
  state_region: string | null;
  year: number;
  center_latitude?: number | null;
  center_longitude?: number | null;
  default_zoom?: number | null;
  location_query?: string | null;
  location_display_name?: string | null;
  location_north?: number | null;
  location_south?: number | null;
  location_east?: number | null;
  location_west?: number | null;
};

type SourceRecordRow = {
  id: string;
  source_id: string;
  internal_source_id?: string | null;
  title: string;
  source_url: string | null;
  archive_name: string | null;
  rights_note: string | null;
  repository_name?: string | null;
  collection_name?: string | null;
  repository_external_id?: string | null;
  persistent_url?: string | null;
  item_page_url?: string | null;
  iiif_manifest_url?: string | null;
  image_service_url?: string | null;
  item_resource_id?: string | null;
  town_name?: string | null;
  county_name?: string | null;
  state_name?: string | null;
  edition_year?: number | null;
  sheet_number?: string | null;
  map_publisher?: string | null;
  publication_date?: string | null;
  downloaded_at?: string | null;
  imported_at?: string | null;
  imported_by?: string | null;
  rights_statement?: string | null;
  rights_url?: string | null;
  access_note?: string | null;
  access_date?: string | null;
  citation_note?: string | null;
  source_status?: string | null;
};

type MapLayerRow = {
  sheet_number: number | null;
};

type SanbornAssetRow = {
  id: string;
  asset_id: string;
  town_package_id: string;
  source_record_id: string | null;
  map_layer_id: string | null;
  sheet_number: number | null;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256_checksum: string;
  source_url: string | null;
  archive_name: string | null;
  rights_note: string | null;
  evidence_classification: string | null;
  review_status: string | null;
  intake_notes: string | null;
  uploaded_at: string | null;
  updated_at: string | null;
};

type WorkspaceRow = {
  id: string;
  workspace_id: string;
  town_package_id: string;
  map_year: number;
  name: string;
  review_status: string | null;
  evidence_classification: string | null;
  viewport_x: number | null;
  viewport_y: number | null;
  viewport_scale: number | null;
  selected_basemap: string | null;
  geographic_center_latitude: number | null;
  geographic_center_longitude: number | null;
  geographic_zoom: number | null;
  geographic_edit_mode: string | null;
  global_historical_opacity: number | null;
  updated_at: string | null;
};

type PlacementRow = {
  sanborn_sheet_asset_id: string;
  x: number | null;
  y: number | null;
  scale_x: number | null;
  scale_y: number | null;
  skew_x: number | null;
  skew_y: number | null;
  rotation: number | null;
  opacity: number | null;
  layer_order: number | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
  is_flipped_horizontally: boolean | null;
  is_flipped_vertically: boolean | null;
};

type GeoreferenceRow = {
  id: string;
  georeference_id: string;
  sanborn_sheet_asset_id: string | null;
  target_type: string | null;
  status: string | null;
  transformation_type: string | null;
  north_latitude: number | null;
  south_latitude: number | null;
  east_longitude: number | null;
  west_longitude: number | null;
  northwest_latitude: number | null;
  northwest_longitude: number | null;
  northeast_latitude: number | null;
  northeast_longitude: number | null;
  southeast_latitude: number | null;
  southeast_longitude: number | null;
  southwest_latitude: number | null;
  southwest_longitude: number | null;
  transform_matrix: AffineTransformMatrix | null;
  residual_error: number | null;
  control_point_count: number | null;
  selected_basemap: string | null;
  overlay_opacity: number | null;
  overlay_visible: boolean | null;
  show_control_points: boolean | null;
  show_sheet_boundaries: boolean | null;
  rendering_mode: "rectangular_preview" | "warped_preview" | null;
  review_status: string | null;
  evidence_classification: string | null;
  notes: string | null;
  updated_at: string | null;
};

type SheetGeoreferenceRow = {
  sheet_georeference_id: string;
  sanborn_sheet_asset_id: string;
  northwest_latitude: number;
  northwest_longitude: number;
  northeast_latitude: number;
  northeast_longitude: number;
  southeast_latitude: number;
  southeast_longitude: number;
  southwest_latitude: number;
  southwest_longitude: number;
  center_latitude: number;
  center_longitude: number;
  longitude_span: number;
  latitude_span: number;
  rotation: number | null;
  scale_x: number | null;
  scale_y: number | null;
  skew_x: number | null;
  skew_y: number | null;
  pivot_x: number | null;
  pivot_y: number | null;
  warp_type: string | null;
  projective_matrix: unknown;
  transform_version: number | null;
  placement_status: string | null;
  is_flipped_horizontally: boolean | null;
  is_flipped_vertically: boolean | null;
  opacity: number | null;
  layer_order: number | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
  georeference_status: string | null;
  review_status: string | null;
  evidence_classification: string | null;
  updated_at: string | null;
};

type MapPieceGeoreferenceRow = {
  piece_georeference_id: string;
  atlas_page_id: string;
  map_piece_id: string;
  northwest_latitude: number;
  northwest_longitude: number;
  northeast_latitude: number;
  northeast_longitude: number;
  southeast_latitude: number;
  southeast_longitude: number;
  southwest_latitude: number;
  southwest_longitude: number;
  center_latitude: number;
  center_longitude: number;
  rotation: number | null;
  opacity: number | null;
  layer_order: number | null;
  placement_status: string | null;
  target_geometry: string | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
  review_status: string | null;
  evidence_classification: string | null;
  notes: string | null;
  updated_at: string | null;
};

type ControlPointRow = {
  georeference_id: string;
  sanborn_sheet_asset_id: string | null;
  control_point_id: string;
  label: string;
  image_x: number | null;
  image_y: number | null;
  latitude: number | null;
  longitude: number | null;
  confidence: string | null;
  residual_error: number | null;
  is_complete: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TownIndexRegionRow = {
  id: string;
  region_id?: string;
  source_region_id?: string;
  town_package_id: string;
  atlas_id: string;
  index_atlas_page_id?: string;
  atlas_page_id?: string;
  source_asset_id?: string | null;
  linked_atlas_page_id: string | null;
  linked_sheet_asset_id: string | null;
  region_label: string;
  sheet_reference: string | null;
  printed_reference?: string | null;
  region_type: string | null;
  source_polygon?: unknown;
  normalized_polygon?: unknown;
  workflow_status: string | null;
  progress_status?: string | null;
  include_in_town_index?: boolean | null;
  available_to_map_pieces?: boolean | null;
  review_status: string | null;
  evidence_classification: string | null;
  notes: string | null;
  updated_at: string | null;
};

export type LoadHistoricalMapStudioOptions = {
  townPackageId?: string | null;
  mapYear?: string | number | null;
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function createEmptyState(input: {
  mode: StudioMode;
  warningMessage?: string;
  townPackages?: StudioTownPackage[];
  activeTownPackage?: StudioTownPackage | null;
  activeMapYear?: number | null;
}): HistoricalMapStudioState {
  return {
    mode: input.mode,
    warningMessage: input.warningMessage,
    dataSource: "setup_required",
    townPackages: input.townPackages ?? [],
    activeTownPackage: input.activeTownPackage ?? null,
    activeMapYear: input.activeMapYear ?? null,
    availableMapYears: input.activeMapYear ? [input.activeMapYear] : [],
    expectedSheetCount: 0,
    uploadedSheetCount: 0,
    missingSheetNumbers: [],
    duplicateSheetNumbers: [],
    sourceOptions: [],
    workspace: null,
    sheets: [],
    placements: [],
    sheetGeoreferences: [],
    mapPieceGeoreferences: [],
    townIndexRegions: [],
    geographicMap: normalizeGeographicMapSettings(null),
    georeferences: [],
    atlasInventory: createEmptySanbornAtlasInventoryState({ warningMessage: input.warningMessage }),
    selectedBasemap: "osm",
    overlayOpacity: 0.65,
    overlayVisible: true,
    locationSource: "unresolved",
    lastLoadedAt: new Date().toISOString(),
  };
}

function mapTown(row: TownPackageRow): StudioTownPackage {
  return {
    id: row.id,
    packageId: row.package_id,
    name: row.name,
    region: row.state_region ?? "Unknown region",
    year: row.year,
    centerLatitude: typeof row.center_latitude === "number" ? row.center_latitude : null,
    centerLongitude: typeof row.center_longitude === "number" ? row.center_longitude : null,
    defaultZoom: typeof row.default_zoom === "number" ? row.default_zoom : null,
    locationQuery: row.location_query ?? null,
    locationDisplayName: row.location_display_name ?? null,
    locationNorth: typeof row.location_north === "number" ? row.location_north : null,
    locationSouth: typeof row.location_south === "number" ? row.location_south : null,
    locationEast: typeof row.location_east === "number" ? row.location_east : null,
    locationWest: typeof row.location_west === "number" ? row.location_west : null,
  };
}

const configuredTownFallbacks: Record<string, { center: GeoCoordinate; zoom: number }> = {
  texarkana_1885: {
    center: { latitude: 33.425, longitude: -94.047 },
    zoom: 15,
  },
};

function getTownPackageCenter(town: StudioTownPackage | null | undefined): GeoCoordinate | null {
  if (!town || typeof town.centerLatitude !== "number" || typeof town.centerLongitude !== "number") {
    return null;
  }

  const center = { latitude: town.centerLatitude, longitude: town.centerLongitude };

  return isOperationalMapCenter(center) ? center : null;
}

function getConfiguredTownFallback(town: StudioTownPackage | null | undefined): { center: GeoCoordinate; zoom: number } | null {
  if (!town) {
    return null;
  }

  return configuredTownFallbacks[town.packageId] ?? null;
}

function getBoundsCenter(bounds: { northLatitude: number; southLatitude: number; eastLongitude: number; westLongitude: number } | null): GeoCoordinate | null {
  if (!bounds) {
    return null;
  }

  const center = {
    latitude: (bounds.northLatitude + bounds.southLatitude) / 2,
    longitude: (bounds.eastLongitude + bounds.westLongitude) / 2,
  };

  return isOperationalMapCenter(center) ? center : null;
}

function getSheetGeoreferenceBoundsCenter(sheets: SheetGeographicTransform[]): GeoCoordinate | null {
  const coordinates = sheets
    .filter((sheet) => sheet.isVisible && sheet.placementStatus !== "unplaced" && !isNearZeroCoordinate({ latitude: sheet.centerLatitude, longitude: sheet.centerLongitude }))
    .flatMap((sheet) => [sheet.corners.northwest, sheet.corners.northeast, sheet.corners.southeast, sheet.corners.southwest])
    .filter((coordinate): coordinate is GeoCoordinate => Boolean(coordinate) && isOperationalMapCenter(coordinate));

  if (coordinates.length < 2) {
    return null;
  }

  return getBoundsCenter({
    northLatitude: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
    southLatitude: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
    eastLongitude: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
    westLongitude: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
  });
}

function getControlPointCenter(georeferences: HistoricalMapGeoreference[]): GeoCoordinate | null {
  const coordinates = georeferences
    .flatMap((georeference) => georeference.controlPoints)
    .filter((point): point is HistoricalMapControlPoint & GeoCoordinate => typeof point.latitude === "number" && typeof point.longitude === "number")
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))
    .filter((coordinate) => isOperationalMapCenter(coordinate));

  if (coordinates.length === 0) {
    return null;
  }

  return {
    latitude: coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / coordinates.length,
    longitude: coordinates.reduce((sum, coordinate) => sum + coordinate.longitude, 0) / coordinates.length,
  };
}

export function resolveInitialGeographicMapView(input: {
  workspaceCenter?: GeoCoordinate | null;
  workspaceZoom?: number | null;
  town: StudioTownPackage | null;
  sheetGeoreferences?: SheetGeographicTransform[];
  georeferences?: HistoricalMapGeoreference[];
}): { center: GeoCoordinate | null; zoom: number; recoveredFromInvalidWorkspaceCenter: boolean; source: string } {
  const workspaceCenter = input.workspaceCenter && isOperationalMapCenter(input.workspaceCenter) ? input.workspaceCenter : null;
  const townCenter = getTownPackageCenter(input.town);
  const sheetCenter = getSheetGeoreferenceBoundsCenter(input.sheetGeoreferences ?? []);
  const georeferenceBoundsCenter = getBoundsCenter((input.georeferences ?? []).find((georeference) => georeference.bounds)?.bounds ?? null);
  const controlPointCenter = getControlPointCenter(input.georeferences ?? []);
  const configuredFallback = getConfiguredTownFallback(input.town);
  const townDefaultZoom = typeof input.town?.defaultZoom === "number" ? input.town.defaultZoom : null;
  const workspaceZoom = Number.isFinite(input.workspaceZoom) ? Number(input.workspaceZoom) : null;

  if (workspaceCenter) {
    return { center: workspaceCenter, zoom: workspaceZoom ?? townDefaultZoom ?? configuredFallback?.zoom ?? 15, recoveredFromInvalidWorkspaceCenter: false, source: "workspace" };
  }

  if (townCenter) {
    return { center: townCenter, zoom: townDefaultZoom ?? workspaceZoom ?? configuredFallback?.zoom ?? 15, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "town_package" };
  }

  if (sheetCenter) {
    return { center: sheetCenter, zoom: workspaceZoom ?? townDefaultZoom ?? configuredFallback?.zoom ?? 15, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "sheet_bounds" };
  }

  if (georeferenceBoundsCenter) {
    return { center: georeferenceBoundsCenter, zoom: workspaceZoom ?? townDefaultZoom ?? configuredFallback?.zoom ?? 15, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "georeference_bounds" };
  }

  if (controlPointCenter) {
    return { center: controlPointCenter, zoom: workspaceZoom ?? townDefaultZoom ?? configuredFallback?.zoom ?? 15, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "control_points" };
  }

  if (configuredFallback) {
    return { center: configuredFallback.center, zoom: configuredFallback.zoom, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "configured_fallback" };
  }

  return { center: null, zoom: workspaceZoom ?? townDefaultZoom ?? 15, recoveredFromInvalidWorkspaceCenter: Boolean(input.workspaceCenter), source: "unresolved" };
}

export function selectActiveTownPackage(
  towns: StudioTownPackage[],
  townPackageId?: string | null,
): { town: StudioTownPackage | null; warningMessage?: string } {
  if (towns.length === 0) {
    return { town: null };
  }

  if (!townPackageId) {
    return { town: towns[0] };
  }

  const requested = towns.find((town) => town.id === townPackageId || town.packageId === townPackageId);

  if (requested) {
    return { town: requested };
  }

  const recovered = towns[0];
  console.warn("[HistoricalMapStudio] Recovered missing requested town package", {
    requestedTownPackageId: townPackageId,
    recoveredTownPackageId: recovered.id,
    recoveredPackageId: recovered.packageId,
  });

  return {
    town: recovered,
    warningMessage: `Recovered from unavailable town package "${townPackageId}" by loading ${recovered.name} ${recovered.year}.`,
  };
}

function parseMapYear(value: string | number | null | undefined, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mapSourceOptions(rows: SourceRecordRow[]): StudioSourceOption[] {
  return rows
    .map((row) => ({
      sourceRecordId: row.id,
      sourceId: row.source_id,
      internalSourceId: row.internal_source_id ?? null,
      title: row.title,
      sourceUrl: row.source_url,
      archiveName: row.archive_name,
      rightsNote: row.rights_note,
      repositoryName: row.repository_name ?? null,
      collectionName: row.collection_name ?? null,
      repositoryExternalId: row.repository_external_id ?? null,
      persistentUrl: row.persistent_url ?? null,
      itemPageUrl: row.item_page_url ?? null,
      iiifManifestUrl: row.iiif_manifest_url ?? null,
      imageServiceUrl: row.image_service_url ?? null,
      itemResourceId: row.item_resource_id ?? null,
      townName: row.town_name ?? null,
      countyName: row.county_name ?? null,
      stateName: row.state_name ?? null,
      editionYear: row.edition_year ?? null,
      sheetNumber: row.sheet_number ?? null,
      mapPublisher: row.map_publisher ?? null,
      publicationDate: row.publication_date ?? null,
      downloadedAt: row.downloaded_at ?? null,
      importedAt: row.imported_at ?? null,
      importedBy: row.imported_by ?? null,
      rightsStatement: row.rights_statement ?? null,
      rightsUrl: row.rights_url ?? null,
      accessNote: row.access_note ?? null,
      accessDate: row.access_date ?? null,
      citationNote: row.citation_note ?? null,
      sourceStatus: row.source_status ?? null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function createSignedUrlForAsset(supabase: SupabaseAdminClient, town: StudioTownPackage, row: SanbornAssetRow) {
  if (row.storage_bucket !== sanbornSheetBucket) {
    return {
      signedUrl: null,
      signedUrlExpiresAt: null,
      signedUrlError: "Unexpected storage bucket for Sanborn asset.",
    };
  }

  if (!isControlledSanbornStoragePath(row.storage_path, town.packageId)) {
    return {
      signedUrl: null,
      signedUrlExpiresAt: null,
      signedUrlError: "Stored path failed controlled-path validation.",
    };
  }

  const signedUrlResult = await supabase.storage.from(sanbornSheetBucket).createSignedUrl(row.storage_path, studioSignedUrlTtlSeconds);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    return {
      signedUrl: null,
      signedUrlExpiresAt: null,
      signedUrlError: signedUrlResult.error?.message ?? "Signed URL generation failed.",
    };
  }

  return {
    signedUrl: signedUrlResult.data.signedUrl,
    signedUrlExpiresAt: new Date(Date.now() + studioSignedUrlTtlSeconds * 1000).toISOString(),
    signedUrlError: undefined,
  };
}

async function mapAssets(supabase: SupabaseAdminClient, town: StudioTownPackage, assetRows: SanbornAssetRow[], sourceRows: SourceRecordRow[]): Promise<StudioSheetAsset[]> {
  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const signedUrlResults = await Promise.all(assetRows.map((row) => createSignedUrlForAsset(supabase, town, row)));

  return assetRows.map((row, index) => {
    const source = row.source_record_id ? sourceById.get(row.source_record_id) : null;
    const signedUrl = signedUrlResults[index];

    return {
      assetId: row.asset_id,
      rowId: row.id,
      townPackageId: row.town_package_id,
      sourceRecordId: row.source_record_id,
      sourceId: source?.source_id ?? null,
      sourceTitle: source?.title ?? null,
      mapLayerId: row.map_layer_id,
      sheetNumber: row.sheet_number,
      originalFilename: row.original_filename,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      signedUrl: signedUrl.signedUrl,
      signedUrlExpiresAt: signedUrl.signedUrlExpiresAt,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      checksum: row.sha256_checksum,
      sourceUrl: row.source_url ?? source?.source_url ?? null,
      archiveName: row.archive_name ?? source?.archive_name ?? null,
      rightsNote: row.rights_note ?? source?.rights_note ?? null,
      evidenceClassification: normalizeReviewClassification(row.evidence_classification),
      reviewStatus: normalizeReviewClassification(row.review_status),
      intakeNotes: row.intake_notes,
      uploadedAt: row.uploaded_at,
      updatedAt: row.updated_at,
      signedUrlError: signedUrl.signedUrlError,
    };
  });
}

function mapWorkspace(row: WorkspaceRow | null, town: StudioTownPackage, mapYear: number): StudioWorkspace {
  const workspaceId = row?.workspace_id ?? `${town.packageId}-${mapYear}-historical-map-studio`;

  return {
    workspaceId,
    name: row?.name ?? `${town.name} ${mapYear} Historical Map Studio`,
    townPackageId: town.id,
    mapYear,
    reviewStatus: normalizeReviewClassification(row?.review_status),
    evidenceClassification: normalizeReviewClassification(row?.evidence_classification),
    viewport: normalizeViewport({
      x: row?.viewport_x ?? 0,
      y: row?.viewport_y ?? 0,
      scale: row?.viewport_scale ?? 1,
    }),
    updatedAt: row?.updated_at ?? null,
    isPersisted: Boolean(row),
  };
}

function mapGeographicSettings(row: WorkspaceRow | null, resolvedView: { center: GeoCoordinate | null; zoom: number }) {
  return normalizeGeographicMapSettings({
    center: resolvedView.center,
    zoom: resolvedView.zoom,
    editMode: normalizeGeoEditMode(row?.geographic_edit_mode),
    movementScope: "selected_sheet",
    globalHistoricalOpacity: row?.global_historical_opacity ?? 1,
  });
}

function mapPlacements(rows: PlacementRow[], assets: StudioSheetAsset[]): StudioPlacement[] {
  const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));

  return rows
    .map((row): StudioPlacement | null => {
      const asset = assetByRowId.get(row.sanborn_sheet_asset_id);

      if (!asset) {
        return null;
      }

      return normalizePlacement({
        assetId: asset.assetId,
        x: row.x ?? 0,
        y: row.y ?? 0,
        scaleX: row.scale_x ?? 1,
        scaleY: row.scale_y ?? 1,
        skewX: row.skew_x ?? 0,
        skewY: row.skew_y ?? 0,
        rotation: row.rotation ?? 0,
        opacity: row.opacity ?? 1,
        layerOrder: row.layer_order ?? 0,
        isVisible: row.is_visible ?? true,
        isLocked: row.is_locked ?? false,
        isFlippedHorizontally: row.is_flipped_horizontally ?? false,
        isFlippedVertically: row.is_flipped_vertically ?? false,
        isPersisted: true,
      });
    })
    .filter((placement): placement is StudioPlacement => Boolean(placement));
}

function mapSheetGeoreferences(rows: SheetGeoreferenceRow[], assets: StudioSheetAsset[]): SheetGeographicTransform[] {
  const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));

  return rows
    .map((row) => {
      const asset = assetByRowId.get(row.sanborn_sheet_asset_id);

      if (!asset) {
        return null;
      }

      return normalizeSheetGeographicTransform({
        sheetGeoreferenceId: row.sheet_georeference_id,
        assetId: asset.assetId,
        centerLatitude: row.center_latitude,
        centerLongitude: row.center_longitude,
        longitudeSpan: row.longitude_span,
        latitudeSpan: row.latitude_span,
        corners: {
          northwest: { latitude: row.northwest_latitude, longitude: row.northwest_longitude },
          northeast: { latitude: row.northeast_latitude, longitude: row.northeast_longitude },
          southeast: { latitude: row.southeast_latitude, longitude: row.southeast_longitude },
          southwest: { latitude: row.southwest_latitude, longitude: row.southwest_longitude },
        },
        rotation: row.rotation ?? 0,
        scaleX: row.scale_x ?? 1,
        scaleY: row.scale_y ?? 1,
        skewX: row.skew_x ?? 0,
        skewY: row.skew_y ?? 0,
        pivotX: row.pivot_x ?? 0.5,
        pivotY: row.pivot_y ?? 0.5,
        warpType: normalizeSheetWarpType(row.warp_type),
        projectiveMatrix: normalizeProjectiveMatrix(row.projective_matrix),
        transformVersion: row.transform_version ?? 1,
        placementStatus: normalizeSheetPlacementStatus(row.placement_status, row.is_visible ?? true),
        isFlippedHorizontally: row.is_flipped_horizontally ?? false,
        isFlippedVertically: row.is_flipped_vertically ?? false,
        opacity: row.opacity ?? 1,
        layerOrder: row.layer_order ?? 0,
        isVisible: row.is_visible ?? true,
        isLocked: row.is_locked ?? false,
        georeferenceStatus: normalizeSheetGeoreferenceStatus(row.georeference_status),
        reviewStatus: normalizeReviewClassification(row.review_status),
        evidenceClassification: normalizeReviewClassification(row.evidence_classification),
        updatedAt: row.updated_at,
        isPersisted: true,
      });
    })
    .filter((placement): placement is SheetGeographicTransform => Boolean(placement));
}

function mapMapPieceGeoreferences(rows: MapPieceGeoreferenceRow[], atlasInventory: Awaited<ReturnType<typeof loadSanbornAtlasInventory>>): { placements: SanbornMapPieceGeoreference[]; invalidCount: number } {
  const pieceByRowId = new Map(atlasInventory.pieces.map((piece) => [piece.rowId, piece]));
  const pageByRowId = new Map(atlasInventory.pages.map((page) => [page.rowId, page]));
  let invalidCount = 0;

  const placements = rows
    .map((row) => {
      const piece = pieceByRowId.get(row.map_piece_id);
      const page = pageByRowId.get(row.atlas_page_id);

      if (!piece || !page) {
        invalidCount += 1;
        return null;
      }

      const corners = {
        northwest: { latitude: row.northwest_latitude, longitude: row.northwest_longitude },
        northeast: { latitude: row.northeast_latitude, longitude: row.northeast_longitude },
        southeast: { latitude: row.southeast_latitude, longitude: row.southeast_longitude },
        southwest: { latitude: row.southwest_latitude, longitude: row.southwest_longitude },
      };
      const validation = validateMapPieceGeographicCorners(corners);

      if (row.target_geometry !== persistedMapPieceTargetGeometry || !validation.ok) {
        invalidCount += 1;
        return null;
      }

      return normalizeSanbornMapPieceGeoreference({
        pieceGeoreferenceId: row.piece_georeference_id,
        pieceId: piece.pieceId,
        atlasPageId: page.pageId,
        targetGeometry: persistedMapPieceTargetGeometry,
        centerLatitude: row.center_latitude,
        centerLongitude: row.center_longitude,
        corners,
        rotation: row.rotation ?? 0,
        opacity: row.opacity ?? undefined,
        layerOrder: row.layer_order ?? 0,
        placementStatus: row.placement_status ?? undefined,
        isVisible: row.is_visible ?? true,
        isLocked: row.is_locked ?? false,
        reviewStatus: normalizeReviewClassification(row.review_status),
        evidenceClassification: normalizeReviewClassification(row.evidence_classification),
        notes: row.notes,
        updatedAt: row.updated_at,
        isPersisted: true,
      });
    })
    .filter((placement): placement is SanbornMapPieceGeoreference => Boolean(placement));

  return { placements, invalidCount };
}

function mapTownIndexRegions(
  rows: TownIndexRegionRow[],
  atlasInventory: Awaited<ReturnType<typeof loadSanbornAtlasInventory>>,
  assets: StudioSheetAsset[],
): { regions: SanbornTownIndexRegionRecord[]; invalidCount: number } {
  const atlasByRowId = new Map(atlasInventory.atlases.map((atlas) => [atlas.rowId, atlas]));
  const pageByRowId = new Map(atlasInventory.pages.map((page) => [page.rowId, page]));
  const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));
  let invalidCount = 0;

  const regions = rows
    .map((row): SanbornTownIndexRegionRecord | null => {
      const atlas = atlasByRowId.get(row.atlas_id);
      const sourcePageRowId = row.atlas_page_id ?? row.index_atlas_page_id;
      const sourceAssetRowId = row.source_asset_id ?? null;
      const indexPage = sourcePageRowId ? pageByRowId.get(sourcePageRowId) : null;
      const sourceAsset = sourceAssetRowId ? assetByRowId.get(sourceAssetRowId) ?? null : null;
      const linkedPage = row.linked_atlas_page_id ? pageByRowId.get(row.linked_atlas_page_id) ?? null : null;
      const linkedAsset = row.linked_sheet_asset_id ? assetByRowId.get(row.linked_sheet_asset_id) ?? null : null;
      const polygon = validateTownIndexRegionPolygon(row.normalized_polygon ?? row.source_polygon);

      if (!atlas || !indexPage || !polygon.ok) {
        invalidCount += 1;
        return null;
      }

      return {
        rowId: row.id,
        regionId: row.source_region_id ?? row.region_id ?? row.id,
        townPackageId: row.town_package_id,
        atlasRowId: row.atlas_id,
        atlasId: atlas.atlasId,
        indexAtlasPageRowId: sourcePageRowId ?? "",
        indexAtlasPageId: indexPage.pageId,
        sourceAssetRowId: sourceAssetRowId ?? indexPage.sanbornSheetAssetRowId,
        sourceAssetId: sourceAsset?.assetId ?? indexPage.sanbornSheetAssetId,
        linkedAtlasPageRowId: row.linked_atlas_page_id,
        linkedAtlasPageId: linkedPage?.pageId ?? null,
        linkedSheetAssetRowId: row.linked_sheet_asset_id,
        linkedSheetAssetId: linkedAsset?.assetId ?? linkedPage?.sanbornSheetAssetId ?? null,
        regionLabel: row.region_label,
        sheetReference: row.printed_reference ?? row.sheet_reference,
        regionType: normalizeTownIndexRegionType(row.region_type),
        sourcePolygon: polygon.polygon,
        workflowStatus: normalizeTownIndexStatus(row.workflow_status),
        progressStatus: normalizeTownIndexStatus(row.progress_status),
        includeInTownIndex: row.include_in_town_index ?? true,
        availableToMapPieces: row.available_to_map_pieces === true,
        reviewStatus: normalizeReviewClassification(row.review_status),
        evidenceClassification: normalizeReviewClassification(row.evidence_classification),
        notes: row.notes,
        updatedAt: row.updated_at,
        isPersisted: true,
      };
    })
    .filter((region): region is SanbornTownIndexRegionRecord => Boolean(region));

  return { regions, invalidCount };
}

function getCornerCoordinate(latitude: number | null, longitude: number | null) {
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null;
}

function mapGeoreferences(rows: GeoreferenceRow[], controlPointRows: ControlPointRow[], assets: StudioSheetAsset[]): HistoricalMapGeoreference[] {
  const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));
  const pointsByGeoreferenceId = new Map<string, HistoricalMapControlPoint[]>();

  for (const row of controlPointRows) {
    const existing = pointsByGeoreferenceId.get(row.georeference_id) ?? [];
    existing.push(
      normalizeControlPoint({
        controlPointId: row.control_point_id,
        targetAssetId: row.sanborn_sheet_asset_id ? assetByRowId.get(row.sanborn_sheet_asset_id)?.assetId ?? null : null,
        label: row.label,
        imageX: row.image_x,
        imageY: row.image_y,
        latitude: row.latitude,
        longitude: row.longitude,
        confidence: row.confidence ?? "draft",
        residualError: row.residual_error,
        isComplete: row.is_complete ?? undefined,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
    pointsByGeoreferenceId.set(row.georeference_id, existing);
  }

  return rows.map((row) => {
    const bounds =
      typeof row.north_latitude === "number" &&
      typeof row.south_latitude === "number" &&
      typeof row.east_longitude === "number" &&
      typeof row.west_longitude === "number"
        ? {
            northLatitude: row.north_latitude,
            southLatitude: row.south_latitude,
            eastLongitude: row.east_longitude,
            westLongitude: row.west_longitude,
          }
        : null;
    const corners = {
      northwest: getCornerCoordinate(row.northwest_latitude, row.northwest_longitude),
      northeast: getCornerCoordinate(row.northeast_latitude, row.northeast_longitude),
      southeast: getCornerCoordinate(row.southeast_latitude, row.southeast_longitude),
      southwest: getCornerCoordinate(row.southwest_latitude, row.southwest_longitude),
    };
    const targetAsset = row.sanborn_sheet_asset_id ? assetByRowId.get(row.sanborn_sheet_asset_id) : null;
    const controlPoints = pointsByGeoreferenceId.get(row.id) ?? [];

    return {
      georeferenceId: row.georeference_id,
      targetType: normalizeGeoreferenceTargetType(row.target_type),
      targetAssetId: targetAsset?.assetId ?? null,
      status: normalizeGeoreferenceStatus(row.status),
      transformationType: normalizeTransformationType(row.transformation_type),
      bounds,
      corners:
        corners.northwest || corners.northeast || corners.southeast || corners.southwest
          ? corners
          : cornersFromBounds(bounds),
      transformMatrix: row.transform_matrix,
      residualError: row.residual_error,
      controlPointCount: row.control_point_count ?? 0,
      reviewStatus: row.review_status ?? "unknown",
      evidenceClassification: row.evidence_classification ?? "unknown",
      notes: row.notes,
      overlayOpacity: clampOverlayOpacity(row.overlay_opacity),
      overlayVisible: row.overlay_visible ?? true,
      selectedBasemap: row.selected_basemap ?? "osm",
      showControlPoints: row.show_control_points ?? true,
      showSheetBoundaries: row.show_sheet_boundaries ?? true,
      renderingMode: row.rendering_mode ?? "rectangular_preview",
      updatedAt: row.updated_at,
      controlPoints: controlPoints.map((point) => ({ ...point, targetAssetId: point.targetAssetId ?? targetAsset?.assetId ?? null })),
    };
  });
}

function getExpectedSheetCount(rows: MapLayerRow[]): number {
  if (rows.length === 0) {
    return 0;
  }

  return Math.max(rows.length, ...rows.map((row) => row.sheet_number ?? 0));
}

export const loadHistoricalMapStudioData = cache(async (options: LoadHistoricalMapStudioOptions): Promise<HistoricalMapStudioState> => {
  if (!hasSupabaseAdminEnv()) {
    return createEmptyState({
      mode: "read_only",
      warningMessage:
        "Supabase admin configuration is missing. Add SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to the Vercel Preview environment, then redeploy.",
    });
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: "Supabase admin client could not be initialized.",
    });
  }

  const townPackageLocationSelect =
    "id, package_id, name, state_region, year, center_latitude, center_longitude, default_zoom, location_query, location_display_name, location_north, location_south, location_east, location_west";
  const townPackageCenterSelect = "id, package_id, name, state_region, year, center_latitude, center_longitude, default_zoom";
  const townPackageBaseSelect = "id, package_id, name, state_region, year";
  let townPackagesResult: { data: unknown[] | null; error: { message: string } | null } = await supabase
    .from("town_packages")
    .select(townPackageLocationSelect)
    .order("year", { ascending: false });

  if (townPackagesResult.error && /location_query|location_display_name|location_north|location_south|location_east|location_west/i.test(townPackagesResult.error.message)) {
    console.warn("[HistoricalMapStudio] Town location columns are unavailable; falling back to town center select.", {
      message: townPackagesResult.error.message,
    });
    townPackagesResult = await supabase
      .from("town_packages")
      .select(townPackageCenterSelect)
      .order("year", { ascending: false });
  }

  if (townPackagesResult.error && /center_latitude|center_longitude|default_zoom/i.test(townPackagesResult.error.message)) {
    console.warn("[HistoricalMapStudio] Town center columns are unavailable; falling back to legacy town package select.", {
      message: townPackagesResult.error.message,
    });
    townPackagesResult = await supabase
      .from("town_packages")
      .select(townPackageBaseSelect)
      .order("year", { ascending: false });
  }

  if (townPackagesResult.error) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: `Town package query failed: ${townPackagesResult.error.message}`,
    });
  }

  const townPackages = ((townPackagesResult.data ?? []) as TownPackageRow[]).map(mapTown);
  const activeTownSelection = selectActiveTownPackage(townPackages, options.townPackageId);
  const activeTownPackage = activeTownSelection.town;

  if (!activeTownPackage) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: "No town package is available. Create or seed a town package before using the studio.",
      townPackages,
    });
  }

  const activeMapYear = parseMapYear(options.mapYear, activeTownPackage.year);
  const sourceRecordProvenanceSelect =
    "id, source_id, internal_source_id, title, source_url, archive_name, rights_note, repository_name, collection_name, repository_external_id, persistent_url, item_page_url, iiif_manifest_url, image_service_url, item_resource_id, town_name, county_name, state_name, edition_year, sheet_number, map_publisher, publication_date, downloaded_at, imported_at, imported_by, rights_statement, rights_url, access_note, access_date, citation_note, source_status";
  const sourceRecordBaseSelect = "id, source_id, title, source_url, archive_name, rights_note";
  const [sourceRecordsInitialResult, mapLayersResult, assetsResult, workspaceResult] = await Promise.all([
    supabase
      .from("source_records")
      .select(sourceRecordProvenanceSelect)
      .eq("town_package_id", activeTownPackage.id)
      .order("title", { ascending: true }),
    supabase.from("map_layers").select("sheet_number").eq("town_package_id", activeTownPackage.id).order("sheet_number", { ascending: true }),
    supabase
      .from("sanborn_sheet_assets")
      .select(
        "id, asset_id, town_package_id, source_record_id, map_layer_id, sheet_number, original_filename, storage_bucket, storage_path, mime_type, byte_size, width, height, sha256_checksum, source_url, archive_name, rights_note, evidence_classification, review_status, intake_notes, uploaded_at, updated_at",
      )
      .eq("town_package_id", activeTownPackage.id)
      .order("sheet_number", { ascending: true })
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("historical_map_workspaces")
      .select(
        "id, workspace_id, town_package_id, map_year, name, review_status, evidence_classification, viewport_x, viewport_y, viewport_scale, selected_basemap, geographic_center_latitude, geographic_center_longitude, geographic_zoom, geographic_edit_mode, global_historical_opacity, updated_at",
      )
      .eq("town_package_id", activeTownPackage.id)
      .eq("map_year", activeMapYear)
      .maybeSingle<WorkspaceRow>(),
  ]);
  let sourceRecordsResult = sourceRecordsInitialResult as unknown as {
    data: SourceRecordRow[] | null;
    error: { message: string } | null;
  };

  if (
    sourceRecordsResult.error &&
    /internal_source_id|repository_name|collection_name|repository_external_id|persistent_url|item_page_url|iiif_manifest_url|image_service_url|item_resource_id|town_name|county_name|state_name|edition_year|sheet_number|map_publisher|publication_date|downloaded_at|imported_at|imported_by|rights_statement|rights_url|access_note|access_date|citation_note|source_status/i.test(
      sourceRecordsResult.error.message,
    )
  ) {
    console.warn("[HistoricalMapStudio] Source provenance columns are unavailable; falling back to legacy source select.", {
      message: sourceRecordsResult.error.message,
    });
    sourceRecordsResult = (await supabase
      .from("source_records")
      .select(sourceRecordBaseSelect)
      .eq("town_package_id", activeTownPackage.id)
      .order("title", { ascending: true })) as unknown as {
      data: SourceRecordRow[] | null;
      error: { message: string } | null;
    };
  }

  const queryError = sourceRecordsResult.error ?? mapLayersResult.error ?? assetsResult.error;

  if (queryError) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: `Historical Map Studio data query failed: ${queryError.message}`,
      townPackages,
      activeTownPackage,
      activeMapYear,
    });
  }

  const sourceRows = (sourceRecordsResult.data ?? []) as SourceRecordRow[];
  const mapLayerRows = (mapLayersResult.data ?? []) as MapLayerRow[];
  const assetRows = (assetsResult.data ?? []) as SanbornAssetRow[];
  const assets = await mapAssets(supabase, activeTownPackage, assetRows, sourceRows);
  const atlasInventory = await loadSanbornAtlasInventory({
    supabase,
    town: activeTownPackage,
    assets,
    mapYear: activeMapYear,
  });
  let townIndexRegionRows: TownIndexRegionRow[] = [];
  let workspaceWarning: string | undefined;
  let townIndexWarning: string | undefined;
  let workspaceRow: WorkspaceRow | null = null;
  let placementRows: PlacementRow[] = [];
  let sheetGeoreferenceRows: SheetGeoreferenceRow[] = [];
  let mapPieceGeoreferenceRows: MapPieceGeoreferenceRow[] = [];
  let georeferenceRows: GeoreferenceRow[] = [];
  let controlPointRows: ControlPointRow[] = [];

  if (atlasInventory.atlases.length > 0) {
    let townIndexRegionsResult = (await supabase
      .from("sanborn_source_regions")
      .select(
        "id, source_region_id, town_package_id, atlas_id, atlas_page_id, source_asset_id, linked_atlas_page_id, linked_sheet_asset_id, region_label, printed_reference, region_type, normalized_polygon, include_in_town_index, available_to_map_pieces, workflow_status, review_status, evidence_classification, notes, updated_at",
      )
      .eq("town_package_id", activeTownPackage.id)
      .in("atlas_id", atlasInventory.atlases.map((atlas) => atlas.rowId))
      .order("printed_reference", { ascending: true })
      .order("region_label", { ascending: true })) as { data: TownIndexRegionRow[] | null; error: { message: string } | null };

    if (townIndexRegionsResult.error) {
      const sourceRegionError = townIndexRegionsResult.error.message;
      townIndexRegionsResult = (await supabase
        .from("sanborn_town_index_regions")
        .select(
          "id, region_id, town_package_id, atlas_id, index_atlas_page_id, linked_atlas_page_id, linked_sheet_asset_id, region_label, sheet_reference, region_type, source_polygon, workflow_status, progress_status, review_status, evidence_classification, notes, updated_at",
        )
        .eq("town_package_id", activeTownPackage.id)
        .in("atlas_id", atlasInventory.atlases.map((atlas) => atlas.rowId))
        .order("sheet_reference", { ascending: true })
        .order("region_label", { ascending: true })) as { data: TownIndexRegionRow[] | null; error: { message: string } | null };

      if (townIndexRegionsResult.error) {
        townIndexWarning = `Source region query failed: ${sourceRegionError}. Town Index region fallback also failed: ${townIndexRegionsResult.error.message}. Apply migration 0016 to enable functional source regions.`;
      } else {
        townIndexWarning = `Functional source regions are not available yet: ${sourceRegionError}. Loaded legacy Town Index regions until migration 0016 is applied.`;
        townIndexRegionRows = (townIndexRegionsResult.data ?? []) as TownIndexRegionRow[];
      }
    } else {
      townIndexRegionRows = (townIndexRegionsResult.data ?? []) as TownIndexRegionRow[];
    }
  }

  if (workspaceResult.error) {
    workspaceWarning = `Layout persistence query failed: ${workspaceResult.error.message}`;
  } else {
    workspaceRow = workspaceResult.data;

    if (workspaceRow) {
      const placementsResult = await supabase
        .from("historical_map_sheet_placements")
        .select("sanborn_sheet_asset_id, x, y, scale_x, scale_y, skew_x, skew_y, rotation, opacity, layer_order, is_visible, is_locked, is_flipped_horizontally, is_flipped_vertically")
        .eq("workspace_id", workspaceRow.id);

      if (placementsResult.error) {
        workspaceWarning = `Saved placement query failed: ${placementsResult.error.message}`;
      } else {
        placementRows = (placementsResult.data ?? []) as PlacementRow[];
      }

      const sheetGeoreferencesResult = await supabase
      .from("historical_map_sheet_georeferences")
        .select(
          "sheet_georeference_id, sanborn_sheet_asset_id, northwest_latitude, northwest_longitude, northeast_latitude, northeast_longitude, southeast_latitude, southeast_longitude, southwest_latitude, southwest_longitude, center_latitude, center_longitude, longitude_span, latitude_span, rotation, scale_x, scale_y, skew_x, skew_y, pivot_x, pivot_y, warp_type, projective_matrix, transform_version, placement_status, is_flipped_horizontally, is_flipped_vertically, opacity, layer_order, is_visible, is_locked, georeference_status, review_status, evidence_classification, updated_at",
        )
        .eq("workspace_id", workspaceRow.id);

      if (sheetGeoreferencesResult.error) {
        workspaceWarning = `Saved sheet geographic placement query failed: ${sheetGeoreferencesResult.error.message}`;
      } else {
        sheetGeoreferenceRows = (sheetGeoreferencesResult.data ?? []) as SheetGeoreferenceRow[];
      }

      const mapPieceGeoreferencesResult = await supabase
        .from("sanborn_map_piece_georeferences")
        .select(
          "piece_georeference_id, atlas_page_id, map_piece_id, northwest_latitude, northwest_longitude, northeast_latitude, northeast_longitude, southeast_latitude, southeast_longitude, southwest_latitude, southwest_longitude, center_latitude, center_longitude, rotation, opacity, layer_order, placement_status, target_geometry, is_visible, is_locked, review_status, evidence_classification, notes, updated_at",
        )
        .eq("workspace_id", workspaceRow.id);

      if (mapPieceGeoreferencesResult.error) {
        workspaceWarning = `Saved map piece placement query failed: ${mapPieceGeoreferencesResult.error.message}. Apply migration 0011 to enable piece map placement.`;
      } else {
        mapPieceGeoreferenceRows = (mapPieceGeoreferencesResult.data ?? []) as MapPieceGeoreferenceRow[];
      }

      const georeferencesResult = await supabase
        .from("historical_map_georeferences")
        .select(
          "id, georeference_id, sanborn_sheet_asset_id, target_type, status, transformation_type, north_latitude, south_latitude, east_longitude, west_longitude, northwest_latitude, northwest_longitude, northeast_latitude, northeast_longitude, southeast_latitude, southeast_longitude, southwest_latitude, southwest_longitude, transform_matrix, residual_error, control_point_count, selected_basemap, overlay_opacity, overlay_visible, show_control_points, show_sheet_boundaries, rendering_mode, review_status, evidence_classification, notes, updated_at",
        )
        .eq("workspace_id", workspaceRow.id);

      if (georeferencesResult.error) {
        workspaceWarning = `Saved georeference query failed: ${georeferencesResult.error.message}`;
      } else {
        georeferenceRows = (georeferencesResult.data ?? []) as GeoreferenceRow[];
        const georeferenceIds = georeferenceRows.map((row) => row.id);

        if (georeferenceIds.length > 0) {
          const controlPointsResult = await supabase
            .from("historical_map_control_points")
            .select("georeference_id, sanborn_sheet_asset_id, control_point_id, label, image_x, image_y, latitude, longitude, confidence, residual_error, is_complete, notes, created_at, updated_at")
            .in("georeference_id", georeferenceIds)
            .order("created_at", { ascending: true });

          if (controlPointsResult.error) {
            workspaceWarning = `Saved control-point query failed: ${controlPointsResult.error.message}`;
          } else {
            controlPointRows = (controlPointsResult.data ?? []) as ControlPointRow[];
          }
        }
      }
    }
  }

  const workspace = mapWorkspace(workspaceRow, activeTownPackage, activeMapYear);
  const savedPlacements = mapPlacements(placementRows, assets);
  const placements = mergeSavedAndDefaultPlacements(assets, savedPlacements);
  const savedSheetGeoreferences = mapSheetGeoreferences(sheetGeoreferenceRows, assets);
  const savedMapPieceGeoreferenceMapping = mapMapPieceGeoreferences(mapPieceGeoreferenceRows, atlasInventory);
  if (savedMapPieceGeoreferenceMapping.invalidCount > 0 && !workspaceWarning) {
    workspaceWarning = `Saved map piece placement query returned ${savedMapPieceGeoreferenceMapping.invalidCount} invalid geographic placement row(s).`;
  }
  const mapPieceGeoreferences = mergeSavedAndDefaultMapPieceGeoreferences(atlasInventory.pieces, savedMapPieceGeoreferenceMapping.placements);
  const townIndexRegionMapping = mapTownIndexRegions(townIndexRegionRows, atlasInventory, assets);
  if (townIndexRegionMapping.invalidCount > 0 && !townIndexWarning) {
    townIndexWarning = `Town Index region query returned ${townIndexRegionMapping.invalidCount} invalid row(s).`;
  }
  const georeferences = mapGeoreferences(georeferenceRows, controlPointRows, assets);
  const workspaceCenter =
    typeof workspaceRow?.geographic_center_latitude === "number" && typeof workspaceRow.geographic_center_longitude === "number"
      ? { latitude: workspaceRow.geographic_center_latitude, longitude: workspaceRow.geographic_center_longitude }
      : null;
  const resolvedMapView = resolveInitialGeographicMapView({
    workspaceCenter,
    workspaceZoom: workspaceRow?.geographic_zoom ?? null,
    town: activeTownPackage,
    sheetGeoreferences: savedSheetGeoreferences,
    georeferences,
  });
  const sheetGeoreferences = mergeSavedAndDefaultSheetGeoreferences(assets, savedSheetGeoreferences, resolvedMapView.center);
  const primaryGeoreference = georeferences[0];
  const expectedSheetCount = getExpectedSheetCount(mapLayerRows);
  const sourceOptions = mapSourceOptions(sourceRows);
  const mapWarning =
    resolvedMapView.recoveredFromInvalidWorkspaceCenter && resolvedMapView.center
      ? `Recovered map center from invalid saved coordinates using ${resolvedMapView.source.replaceAll("_", " ")}.`
      : undefined;
  const warningMessage = [workspaceWarning, activeTownSelection.warningMessage, mapWarning, townIndexWarning].filter(Boolean).join(" ");

  return {
    mode: workspaceWarning ? "read_only" : "public",
    warningMessage: warningMessage || undefined,
    dataSource: "supabase",
    townPackages,
    activeTownPackage,
    activeMapYear,
    availableMapYears: [...new Set([activeTownPackage.year, activeMapYear])].sort((a, b) => b - a),
    expectedSheetCount,
    uploadedSheetCount: assets.length,
    missingSheetNumbers: findMissingStudioSheetNumbers(assets, expectedSheetCount),
    duplicateSheetNumbers: findDuplicateStudioSheetNumbers(assets),
    sourceOptions,
    workspace,
    sheets: assets,
    placements,
    sheetGeoreferences,
    mapPieceGeoreferences,
    townIndexRegions: townIndexRegionMapping.regions,
    geographicMap: mapGeographicSettings(workspaceRow, resolvedMapView),
    georeferences,
    atlasInventory,
    selectedBasemap: workspaceRow?.selected_basemap ?? primaryGeoreference?.selectedBasemap ?? "osm",
    overlayOpacity: primaryGeoreference?.overlayOpacity ?? 0.65,
    overlayVisible: primaryGeoreference?.overlayVisible ?? true,
    locationSource: resolvedMapView.source,
    lastLoadedAt: new Date().toISOString(),
  };
});

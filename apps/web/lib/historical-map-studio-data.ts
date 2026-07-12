import { cache } from "react";

import {
  clampOverlayOpacity,
  cornersFromBounds,
  normalizeControlPoint,
  normalizeGeoreferenceStatus,
  normalizeGeoreferenceTargetType,
  normalizeTransformationType,
  type AffineTransformMatrix,
  type HistoricalMapControlPoint,
  type HistoricalMapGeoreference,
} from "./historical-map-georeference.ts";
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
import { hasMapStudioOwnerPassword } from "./map-studio-auth.ts";
import { sanbornSheetBucket } from "./sanborn-intake.ts";
import { createAdminClient, hasSupabaseAdminEnv } from "./supabase/admin.ts";

type TownPackageRow = {
  id: string;
  package_id: string;
  name: string;
  state_region: string | null;
  year: number;
};

type SourceRecordRow = {
  id: string;
  source_id: string;
  title: string;
  source_url: string | null;
  archive_name: string | null;
  rights_note: string | null;
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
  updated_at: string | null;
};

type PlacementRow = {
  sanborn_sheet_asset_id: string;
  x: number | null;
  y: number | null;
  scale_x: number | null;
  scale_y: number | null;
  rotation: number | null;
  opacity: number | null;
  layer_order: number | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
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

type ControlPointRow = {
  georeference_id: string;
  control_point_id: string;
  label: string;
  image_x: number | null;
  image_y: number | null;
  latitude: number | null;
  longitude: number | null;
  confidence: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type LoadHistoricalMapStudioOptions = {
  isOwner: boolean;
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
    georeferences: [],
    selectedBasemap: "osm",
    overlayOpacity: 0.65,
    overlayVisible: true,
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
  };
}

function selectActiveTown(towns: StudioTownPackage[], townPackageId?: string | null): StudioTownPackage | null {
  if (towns.length === 0) {
    return null;
  }

  return towns.find((town) => town.id === townPackageId || town.packageId === townPackageId) ?? towns[0];
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
      title: row.title,
      sourceUrl: row.source_url,
      archiveName: row.archive_name,
      rightsNote: row.rights_note,
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

function mapPlacements(rows: PlacementRow[], assets: StudioSheetAsset[]): StudioPlacement[] {
  const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));

  return rows
    .map((row) => {
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
        rotation: row.rotation ?? 0,
        opacity: row.opacity ?? 1,
        layerOrder: row.layer_order ?? 0,
        isVisible: row.is_visible ?? true,
        isLocked: row.is_locked ?? false,
        isPersisted: true,
      });
    })
    .filter((placement): placement is StudioPlacement => Boolean(placement));
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
        label: row.label,
        imageX: row.image_x,
        imageY: row.image_y,
        latitude: row.latitude,
        longitude: row.longitude,
        confidence: row.confidence ?? "draft",
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
      controlPoints: pointsByGeoreferenceId.get(row.id) ?? [],
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
  if (!hasMapStudioOwnerPassword()) {
    return createEmptyState({
      mode: "setup_required",
      warningMessage: "MAP_STUDIO_OWNER_PASSWORD is not configured. Historical Map Studio writes are disabled.",
    });
  }

  if (!options.isOwner) {
    return createEmptyState({
      mode: "login_required",
      warningMessage: "Sign in as the owner to use Historical Map Studio.",
    });
  }

  if (!hasSupabaseAdminEnv()) {
    return createEmptyState({
      mode: "setup_required",
      warningMessage: "Supabase admin configuration is missing. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return createEmptyState({
      mode: "setup_required",
      warningMessage: "Supabase admin client could not be initialized.",
    });
  }

  const townPackagesResult = await supabase
    .from("town_packages")
    .select("id, package_id, name, state_region, year")
    .order("year", { ascending: false });

  if (townPackagesResult.error) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: `Town package query failed: ${townPackagesResult.error.message}`,
    });
  }

  const townPackages = ((townPackagesResult.data ?? []) as TownPackageRow[]).map(mapTown);
  const activeTownPackage = selectActiveTown(townPackages, options.townPackageId);

  if (!activeTownPackage) {
    return createEmptyState({
      mode: "read_only",
      warningMessage: "No town package is available. Create or seed a town package before using the studio.",
      townPackages,
    });
  }

  const activeMapYear = parseMapYear(options.mapYear, activeTownPackage.year);
  const [sourceRecordsResult, mapLayersResult, assetsResult, workspaceResult] = await Promise.all([
    supabase
      .from("source_records")
      .select("id, source_id, title, source_url, archive_name, rights_note")
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
      .select("id, workspace_id, town_package_id, map_year, name, review_status, evidence_classification, viewport_x, viewport_y, viewport_scale, updated_at")
      .eq("town_package_id", activeTownPackage.id)
      .eq("map_year", activeMapYear)
      .maybeSingle<WorkspaceRow>(),
  ]);

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
  let workspaceWarning: string | undefined;
  let workspaceRow: WorkspaceRow | null = null;
  let placementRows: PlacementRow[] = [];
  let georeferenceRows: GeoreferenceRow[] = [];
  let controlPointRows: ControlPointRow[] = [];

  if (workspaceResult.error) {
    workspaceWarning = `Layout persistence query failed: ${workspaceResult.error.message}`;
  } else {
    workspaceRow = workspaceResult.data;

    if (workspaceRow) {
      const placementsResult = await supabase
        .from("historical_map_sheet_placements")
        .select("sanborn_sheet_asset_id, x, y, scale_x, scale_y, rotation, opacity, layer_order, is_visible, is_locked")
        .eq("workspace_id", workspaceRow.id);

      if (placementsResult.error) {
        workspaceWarning = `Saved placement query failed: ${placementsResult.error.message}`;
      } else {
        placementRows = (placementsResult.data ?? []) as PlacementRow[];
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
            .select("georeference_id, control_point_id, label, image_x, image_y, latitude, longitude, confidence, notes, created_at, updated_at")
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
  const georeferences = mapGeoreferences(georeferenceRows, controlPointRows, assets);
  const primaryGeoreference = georeferences[0];
  const expectedSheetCount = getExpectedSheetCount(mapLayerRows);
  const sourceOptions = mapSourceOptions(sourceRows);

  return {
    mode: workspaceWarning ? "read_only" : "owner",
    warningMessage: workspaceWarning,
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
    georeferences,
    selectedBasemap: primaryGeoreference?.selectedBasemap ?? "osm",
    overlayOpacity: primaryGeoreference?.overlayOpacity ?? 0.65,
    overlayVisible: primaryGeoreference?.overlayVisible ?? true,
    lastLoadedAt: new Date().toISOString(),
  };
});

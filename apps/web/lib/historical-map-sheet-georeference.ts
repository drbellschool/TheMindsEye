import { reviewStatuses, type ReviewStatus } from "./community-status.ts";
import {
  clampNumber,
  maxStudioOpacity,
  maxStudioScale,
  minStudioOpacity,
  minStudioScale,
  normalizeReviewClassification,
  normalizeRotation,
  normalizeSkew,
  type StudioPlacement,
  type StudioSheetAsset,
} from "./historical-map-studio.ts";
import { isValidLatitude, isValidLongitude, validateGeoCoordinate, type GeoCoordinate, type GeoCorners } from "./historical-map-georeference.ts";

export const sheetGeoreferenceStatuses = ["not_started", "bounding_box", "control_points_draft", "aligned_draft", "reviewed"] as const;
export const geoEditModes = ["pan_modern_map", "edit_historical_sheets"] as const;
export const movementScopes = ["selected_sheet", "entire_assembly"] as const;

export type SheetGeoreferenceStatus = (typeof sheetGeoreferenceStatuses)[number];
export type GeoEditMode = (typeof geoEditModes)[number];
export type MovementScope = (typeof movementScopes)[number];

export type SheetGeographicTransform = {
  sheetGeoreferenceId: string;
  assetId: string;
  centerLatitude: number;
  centerLongitude: number;
  longitudeSpan: number;
  latitudeSpan: number;
  corners: GeoCorners;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  isFlippedHorizontally: boolean;
  isFlippedVertically: boolean;
  opacity: number;
  layerOrder: number;
  isVisible: boolean;
  isLocked: boolean;
  georeferenceStatus: SheetGeoreferenceStatus;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  controlPointCount: number;
  residualError: number | null;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type GeographicMapSettings = {
  center: GeoCoordinate | null;
  zoom: number;
  editMode: GeoEditMode;
  movementScope: MovementScope;
  globalHistoricalOpacity: number;
};

export type SheetGeographicPresentState = {
  sheets: SheetGeographicTransform[];
  mapSettings: GeographicMapSettings;
};

export type SheetGeographicHistoryState = {
  past: SheetGeographicPresentState[];
  present: SheetGeographicPresentState;
  future: SheetGeographicPresentState[];
};

export const defaultGeographicZoom = 15;
export const minGeographicSpan = 0.000001;
export const maxGeographicSpan = 5;
export const maxSheetGeoHistoryEntries = 60;

export function normalizeGeoEditMode(value: string | null | undefined): GeoEditMode {
  return geoEditModes.includes(value as GeoEditMode) ? (value as GeoEditMode) : "pan_modern_map";
}

export function normalizeMovementScope(value: string | null | undefined): MovementScope {
  return movementScopes.includes(value as MovementScope) ? (value as MovementScope) : "selected_sheet";
}

export function normalizeSheetGeoreferenceStatus(value: string | null | undefined): SheetGeoreferenceStatus {
  return sheetGeoreferenceStatuses.includes(value as SheetGeoreferenceStatus) ? (value as SheetGeoreferenceStatus) : "not_started";
}

export function normalizeGeographicMapSettings(input: Partial<GeographicMapSettings> | null | undefined): GeographicMapSettings {
  const center = input?.center && validateGeoCoordinate(input.center).ok ? input.center : null;

  return {
    center,
    zoom: clampNumber(Number(input?.zoom ?? defaultGeographicZoom), 1, 22),
    editMode: normalizeGeoEditMode(input?.editMode),
    movementScope: normalizeMovementScope(input?.movementScope),
    globalHistoricalOpacity: clampNumber(Number(input?.globalHistoricalOpacity ?? 1), 0, 1),
  };
}

function normalizeSpan(value: number | null | undefined): number {
  return clampNumber(Number(value ?? 0.003), minGeographicSpan, maxGeographicSpan);
}

function normalizeCenterLatitude(value: number | null | undefined): number {
  return isValidLatitude(value) ? Number(value) : 0;
}

function normalizeCenterLongitude(value: number | null | undefined): number {
  return isValidLongitude(value) ? Number(value) : 0;
}

function hasValidCorners(corners: GeoCorners | null | undefined): corners is Required<GeoCorners> {
  return Boolean(
    corners?.northwest &&
      corners.northeast &&
      corners.southeast &&
      corners.southwest &&
      validateGeoCoordinate(corners.northwest).ok &&
      validateGeoCoordinate(corners.northeast).ok &&
      validateGeoCoordinate(corners.southeast).ok &&
      validateGeoCoordinate(corners.southwest).ok,
  );
}

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function deriveSheetGeoCorners(input: {
  centerLatitude: number;
  centerLongitude: number;
  latitudeSpan: number;
  longitudeSpan: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  skewX?: number;
  skewY?: number;
  isFlippedHorizontally?: boolean;
  isFlippedVertically?: boolean;
}): GeoCorners {
  const scaleX = clampNumber(Number(input.scaleX ?? 1), minStudioScale, maxStudioScale);
  const scaleY = clampNumber(Number(input.scaleY ?? 1), minStudioScale, maxStudioScale);
  const signedScaleX = scaleX * (input.isFlippedHorizontally ? -1 : 1);
  const signedScaleY = scaleY * (input.isFlippedVertically ? -1 : 1);
  const halfWidth = normalizeSpan(input.longitudeSpan) / 2;
  const halfHeight = normalizeSpan(input.latitudeSpan) / 2;
  const skewX = Math.tan((normalizeSkew(Number(input.skewX ?? 0)) * Math.PI) / 180);
  const skewY = Math.tan((normalizeSkew(Number(input.skewY ?? 0)) * Math.PI) / 180);
  const localCorners = {
    northwest: { x: -halfWidth, y: -halfHeight },
    northeast: { x: halfWidth, y: -halfHeight },
    southeast: { x: halfWidth, y: halfHeight },
    southwest: { x: -halfWidth, y: halfHeight },
  };

  return Object.fromEntries(
    Object.entries(localCorners).map(([key, point]) => {
      const scaledX = point.x * signedScaleX;
      const scaledY = point.y * signedScaleY;
      const skewedX = scaledX + skewX * scaledY;
      const skewedY = skewY * scaledX + scaledY;
      const rotated = rotatePoint(skewedX, skewedY, normalizeRotation(Number(input.rotation ?? 0)));

      return [
        key,
        {
          latitude: clampNumber(input.centerLatitude - rotated.y, -90, 90),
          longitude: clampNumber(input.centerLongitude + rotated.x, -180, 180),
        },
      ];
    }),
  ) as GeoCorners;
}

export function normalizeSheetGeographicTransform(
  input: Partial<SheetGeographicTransform> & {
    assetId: string;
  },
): SheetGeographicTransform {
  const centerLatitude = normalizeCenterLatitude(input.centerLatitude);
  const centerLongitude = normalizeCenterLongitude(input.centerLongitude);
  const latitudeSpan = normalizeSpan(input.latitudeSpan);
  const longitudeSpan = normalizeSpan(input.longitudeSpan);
  const rotation = normalizeRotation(Number(input.rotation ?? 0));
  const scaleX = clampNumber(Number(input.scaleX ?? 1), minStudioScale, maxStudioScale);
  const scaleY = clampNumber(Number(input.scaleY ?? 1), minStudioScale, maxStudioScale);
  const skewX = normalizeSkew(Number(input.skewX ?? 0));
  const skewY = normalizeSkew(Number(input.skewY ?? 0));
  const normalized = {
    sheetGeoreferenceId: input.sheetGeoreferenceId?.trim() || `${input.assetId}-sheet-georef`,
    assetId: input.assetId,
    centerLatitude,
    centerLongitude,
    longitudeSpan,
    latitudeSpan,
    corners: hasValidCorners(input.corners)
      ? input.corners
      : deriveSheetGeoCorners({
            centerLatitude,
            centerLongitude,
            latitudeSpan,
            longitudeSpan,
            rotation,
            scaleX,
            scaleY,
            skewX,
            skewY,
            isFlippedHorizontally: input.isFlippedHorizontally,
            isFlippedVertically: input.isFlippedVertically,
        }),
    rotation,
    scaleX,
    scaleY,
    skewX,
    skewY,
    isFlippedHorizontally: input.isFlippedHorizontally ?? false,
    isFlippedVertically: input.isFlippedVertically ?? false,
    opacity: clampNumber(Number(input.opacity ?? 1), minStudioOpacity, maxStudioOpacity),
    layerOrder: Number.isInteger(input.layerOrder) ? Number(input.layerOrder) : 0,
    isVisible: input.isVisible ?? true,
    isLocked: input.isLocked ?? false,
    georeferenceStatus: normalizeSheetGeoreferenceStatus(input.georeferenceStatus),
    reviewStatus: reviewStatuses.includes(input.reviewStatus as ReviewStatus) ? (input.reviewStatus as ReviewStatus) : "unknown",
    evidenceClassification: normalizeReviewClassification(input.evidenceClassification),
    controlPointCount: Number.isInteger(input.controlPointCount) && Number(input.controlPointCount) >= 0 ? Number(input.controlPointCount) : 0,
    residualError: Number.isFinite(input.residualError) && Number(input.residualError) >= 0 ? Number(input.residualError) : null,
    updatedAt: input.updatedAt ?? null,
    isPersisted: input.isPersisted ?? false,
  };

  return normalized;
}

export function updateSheetGeographicTransform(
  sheets: SheetGeographicTransform[],
  assetId: string,
  patch: Partial<SheetGeographicTransform>,
): SheetGeographicTransform[] {
  return sheets.map((sheet) => (sheet.assetId === assetId ? normalizeSheetGeographicTransform({ ...sheet, ...patch, assetId }) : sheet));
}

export function moveSheetGeographicTransform(sheet: SheetGeographicTransform, delta: { latitude: number; longitude: number }): SheetGeographicTransform {
  return normalizeSheetGeographicTransform({
    ...sheet,
    centerLatitude: sheet.centerLatitude + delta.latitude,
    centerLongitude: sheet.centerLongitude + delta.longitude,
    corners: deriveSheetGeoCorners({
      ...sheet,
      centerLatitude: sheet.centerLatitude + delta.latitude,
      centerLongitude: sheet.centerLongitude + delta.longitude,
    }),
  });
}

export function moveSheetGeographicAssembly(sheets: SheetGeographicTransform[], delta: { latitude: number; longitude: number }): SheetGeographicTransform[] {
  return sheets.map((sheet) => moveSheetGeographicTransform(sheet, delta));
}

export function reorderSheetGeographicTransform(
  sheets: SheetGeographicTransform[],
  assetId: string,
  action: "forward" | "backward" | "front" | "back",
): SheetGeographicTransform[] {
  const sorted = [...sheets].sort((a, b) => a.layerOrder - b.layerOrder);
  const index = sorted.findIndex((sheet) => sheet.assetId === assetId);

  if (index < 0) {
    return sheets;
  }

  const [selected] = sorted.splice(index, 1);

  if (action === "front") {
    sorted.push(selected);
  } else if (action === "back") {
    sorted.unshift(selected);
  } else if (action === "forward") {
    sorted.splice(Math.min(index + 1, sorted.length), 0, selected);
  } else {
    sorted.splice(Math.max(index - 1, 0), 0, selected);
  }

  return sorted.map((sheet, layerOrder) => normalizeSheetGeographicTransform({ ...sheet, layerOrder, assetId: sheet.assetId }));
}

function getLocalPlacementCenter(placement: StudioPlacement, asset: Pick<StudioSheetAsset, "width" | "height">) {
  return {
    x: placement.x + (asset.width * placement.scaleX) / 2,
    y: placement.y + (asset.height * placement.scaleY) / 2,
  };
}

export function createSheetGeoreferencesFromStitching(input: {
  assets: Array<Pick<StudioSheetAsset, "assetId" | "width" | "height">>;
  placements: StudioPlacement[];
  center: GeoCoordinate;
}): SheetGeographicTransform[] {
  const assetById = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const placementPairs = input.placements
    .filter((placement) => placement.isVisible)
    .map((placement) => ({ placement, asset: assetById.get(placement.assetId) }))
    .filter((item): item is { placement: StudioPlacement; asset: Pick<StudioSheetAsset, "assetId" | "width" | "height"> } => Boolean(item.asset));

  if (placementPairs.length === 0) {
    return [];
  }

  const centers = placementPairs.map(({ placement, asset }) => getLocalPlacementCenter(placement, asset));
  const minX = Math.min(...centers.map((center) => center.x));
  const maxX = Math.max(...centers.map((center) => center.x));
  const minY = Math.min(...centers.map((center) => center.y));
  const maxY = Math.max(...centers.map((center) => center.y));
  const localWidth = Math.max(1, maxX - minX);
  const localHeight = Math.max(1, maxY - minY);
  const targetLongitudeSpan = 0.018;
  const targetLatitudeSpan = 0.012;
  const degreesPerPixel = Math.min(targetLongitudeSpan / localWidth, targetLatitudeSpan / localHeight);
  const localCenter = {
    x: minX + localWidth / 2,
    y: minY + localHeight / 2,
  };

  return placementPairs
    .map(({ placement, asset }) => {
      const center = getLocalPlacementCenter(placement, asset);
      const centerLongitude = input.center.longitude + (center.x - localCenter.x) * degreesPerPixel;
      const centerLatitude = input.center.latitude - (center.y - localCenter.y) * degreesPerPixel;
      const longitudeSpan = Math.max(minGeographicSpan, asset.width * placement.scaleX * degreesPerPixel);
      const latitudeSpan = Math.max(minGeographicSpan, asset.height * placement.scaleY * degreesPerPixel);

      return normalizeSheetGeographicTransform({
        sheetGeoreferenceId: `${asset.assetId}-sheet-georef`,
        assetId: asset.assetId,
        centerLatitude,
        centerLongitude,
        longitudeSpan,
        latitudeSpan,
        rotation: placement.rotation,
        scaleX: 1,
        scaleY: 1,
        skewX: placement.skewX,
        skewY: placement.skewY,
        isFlippedHorizontally: placement.isFlippedHorizontally,
        isFlippedVertically: placement.isFlippedVertically,
        opacity: placement.opacity,
        layerOrder: placement.layerOrder,
        isVisible: placement.isVisible,
        isLocked: placement.isLocked,
        georeferenceStatus: "bounding_box",
        reviewStatus: "unknown",
        evidenceClassification: "unknown",
        isPersisted: false,
      });
    })
    .sort((a, b) => a.layerOrder - b.layerOrder);
}

export function mergeSavedAndDefaultSheetGeoreferences(
  assets: Array<Pick<StudioSheetAsset, "assetId" | "width" | "height">>,
  saved: SheetGeographicTransform[],
): SheetGeographicTransform[] {
  const savedByAssetId = new Map(saved.map((sheet) => [sheet.assetId, sheet]));
  const defaults = assets
    .filter((asset) => !savedByAssetId.has(asset.assetId))
    .map((asset, index) =>
      normalizeSheetGeographicTransform({
        assetId: asset.assetId,
        sheetGeoreferenceId: `${asset.assetId}-sheet-georef`,
        centerLatitude: 0,
        centerLongitude: 0,
        latitudeSpan: Math.max(minGeographicSpan, asset.height / 100000),
        longitudeSpan: Math.max(minGeographicSpan, asset.width / 100000),
        layerOrder: saved.length + index,
        isVisible: false,
        georeferenceStatus: "not_started",
      }),
    );

  return [...saved.map((sheet) => normalizeSheetGeographicTransform({ ...sheet, isPersisted: true })), ...defaults].sort((a, b) => a.layerOrder - b.layerOrder);
}

export function cloneSheetGeographicPresent(present: SheetGeographicPresentState): SheetGeographicPresentState {
  return {
    mapSettings: { ...present.mapSettings, center: present.mapSettings.center ? { ...present.mapSettings.center } : null },
    sheets: present.sheets.map((sheet) => ({ ...sheet, corners: { ...sheet.corners } })),
  };
}

export function buildInitialSheetGeographicHistory(present: SheetGeographicPresentState): SheetGeographicHistoryState {
  return {
    past: [],
    present: cloneSheetGeographicPresent(present),
    future: [],
  };
}

export function pushSheetGeographicHistory(history: SheetGeographicHistoryState, nextPresent: SheetGeographicPresentState): SheetGeographicHistoryState {
  return {
    past: [...history.past, cloneSheetGeographicPresent(history.present)].slice(-maxSheetGeoHistoryEntries),
    present: cloneSheetGeographicPresent(nextPresent),
    future: [],
  };
}

export function undoSheetGeographicHistory(history: SheetGeographicHistoryState): SheetGeographicHistoryState {
  if (history.past.length === 0) {
    return history;
  }

  const previous = history.past[history.past.length - 1];

  return {
    past: history.past.slice(0, -1),
    present: cloneSheetGeographicPresent(previous),
    future: [cloneSheetGeographicPresent(history.present), ...history.future].slice(0, maxSheetGeoHistoryEntries),
  };
}

export function redoSheetGeographicHistory(history: SheetGeographicHistoryState): SheetGeographicHistoryState {
  if (history.future.length === 0) {
    return history;
  }

  const next = history.future[0];

  return {
    past: [...history.past, cloneSheetGeographicPresent(history.present)].slice(-maxSheetGeoHistoryEntries),
    present: cloneSheetGeographicPresent(next),
    future: history.future.slice(1),
  };
}

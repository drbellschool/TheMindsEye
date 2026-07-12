import { reviewStatuses, type ReviewStatus } from "./community-status.ts";
import {
  clampNumber,
  clampHistoricalOpacity,
  defaultHistoricalSheetOpacity,
  maxStudioScale,
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
export const sheetWarpTypes = ["projective", "affine", "rectangular"] as const;
export const sheetPlacementStatuses = ["unplaced", "draft", "placed", "aligned", "reviewed"] as const;

export type SheetGeoreferenceStatus = (typeof sheetGeoreferenceStatuses)[number];
export type GeoEditMode = (typeof geoEditModes)[number];
export type MovementScope = (typeof movementScopes)[number];
export type SheetWarpType = (typeof sheetWarpTypes)[number];
export type SheetPlacementStatus = (typeof sheetPlacementStatuses)[number];
export type ProjectiveMatrix = [number, number, number, number, number, number, number, number, number];
type CompleteGeoCorners = {
  northwest: GeoCoordinate;
  northeast: GeoCoordinate;
  southeast: GeoCoordinate;
  southwest: GeoCoordinate;
};

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
  pivotX: number;
  pivotY: number;
  warpType: SheetWarpType;
  projectiveMatrix: ProjectiveMatrix | null;
  transformVersion: number;
  placementStatus: SheetPlacementStatus;
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

export function normalizeSheetWarpType(value: string | null | undefined): SheetWarpType {
  return sheetWarpTypes.includes(value as SheetWarpType) ? (value as SheetWarpType) : "projective";
}

export function normalizeSheetPlacementStatus(value: string | null | undefined, isVisible = true): SheetPlacementStatus {
  if (sheetPlacementStatuses.includes(value as SheetPlacementStatus)) {
    return value as SheetPlacementStatus;
  }

  return isVisible ? "placed" : "unplaced";
}

export function normalizeProjectiveMatrix(value: unknown): ProjectiveMatrix | null {
  if (!Array.isArray(value) || value.length !== 9) {
    return null;
  }

  const matrix = value.map((item) => Number(item));

  return matrix.every((item) => Number.isFinite(item)) ? (matrix as ProjectiveMatrix) : null;
}

export function normalizeGeographicMapSettings(input: Partial<GeographicMapSettings> | null | undefined): GeographicMapSettings {
  const center = input?.center && validateGeoCoordinate(input.center).ok ? input.center : null;

  return {
    center,
    zoom: clampNumber(Number(input?.zoom ?? defaultGeographicZoom), 1, 22),
    editMode: normalizeGeoEditMode(input?.editMode),
    movementScope: normalizeMovementScope(input?.movementScope),
    globalHistoricalOpacity: clampHistoricalOpacity(input?.globalHistoricalOpacity, defaultHistoricalSheetOpacity),
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

function hasValidCorners(corners: GeoCorners | null | undefined): corners is CompleteGeoCorners {
  if (
    !corners?.northwest ||
    !corners.northeast ||
    !corners.southeast ||
    !corners.southwest ||
    !validateGeoCoordinate(corners.northwest).ok ||
    !validateGeoCoordinate(corners.northeast).ok ||
    !validateGeoCoordinate(corners.southeast).ok ||
    !validateGeoCoordinate(corners.southwest).ok
  ) {
    return false;
  }

  const latitudes = [corners.northwest.latitude, corners.northeast.latitude, corners.southeast.latitude, corners.southwest.latitude];
  const longitudes = [corners.northwest.longitude, corners.northeast.longitude, corners.southeast.longitude, corners.southwest.longitude];

  return Math.max(...latitudes) - Math.min(...latitudes) > minGeographicSpan / 10 && Math.max(...longitudes) - Math.min(...longitudes) > minGeographicSpan / 10;
}

function getCornersBounds(corners: CompleteGeoCorners) {
  const latitudes = [corners.northwest.latitude, corners.northeast.latitude, corners.southeast.latitude, corners.southwest.latitude];
  const longitudes = [corners.northwest.longitude, corners.northeast.longitude, corners.southeast.longitude, corners.southwest.longitude];

  return {
    northLatitude: Math.max(...latitudes),
    southLatitude: Math.min(...latitudes),
    eastLongitude: Math.max(...longitudes),
    westLongitude: Math.min(...longitudes),
  };
}

function normalizePivot(value: number | null | undefined): number {
  return Number(clampNumber(Number(value ?? 0.5), 0, 1).toFixed(4));
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
  let centerLatitude = normalizeCenterLatitude(input.centerLatitude);
  let centerLongitude = normalizeCenterLongitude(input.centerLongitude);
  let latitudeSpan = normalizeSpan(input.latitudeSpan);
  let longitudeSpan = normalizeSpan(input.longitudeSpan);
  const rotation = normalizeRotation(Number(input.rotation ?? 0));
  const scaleX = clampNumber(Number(input.scaleX ?? 1), minStudioScale, maxStudioScale);
  const scaleY = clampNumber(Number(input.scaleY ?? 1), minStudioScale, maxStudioScale);
  const skewX = normalizeSkew(Number(input.skewX ?? 0));
  const skewY = normalizeSkew(Number(input.skewY ?? 0));
  const corners = hasValidCorners(input.corners)
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
      });

  if (hasValidCorners(corners)) {
    const bounds = getCornersBounds(corners);
    centerLatitude = Number(((bounds.northLatitude + bounds.southLatitude) / 2).toFixed(8));
    centerLongitude = Number(((bounds.eastLongitude + bounds.westLongitude) / 2).toFixed(8));
    latitudeSpan = normalizeSpan(bounds.northLatitude - bounds.southLatitude);
    longitudeSpan = normalizeSpan(bounds.eastLongitude - bounds.westLongitude);
  }

  const normalized = {
    sheetGeoreferenceId: input.sheetGeoreferenceId?.trim() || `${input.assetId}-sheet-georef`,
    assetId: input.assetId,
    centerLatitude,
    centerLongitude,
    longitudeSpan,
    latitudeSpan,
    corners,
    rotation,
    scaleX,
    scaleY,
    skewX,
    skewY,
    pivotX: normalizePivot(input.pivotX),
    pivotY: normalizePivot(input.pivotY),
    warpType: normalizeSheetWarpType(input.warpType),
    projectiveMatrix: normalizeProjectiveMatrix(input.projectiveMatrix),
    transformVersion: Number.isInteger(input.transformVersion) && Number(input.transformVersion) > 0 ? Number(input.transformVersion) : 1,
    placementStatus: normalizeSheetPlacementStatus(input.placementStatus, input.isVisible ?? true),
    isFlippedHorizontally: input.isFlippedHorizontally ?? false,
    isFlippedVertically: input.isFlippedVertically ?? false,
    opacity: clampHistoricalOpacity(input.opacity, defaultHistoricalSheetOpacity),
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

function patchRequiresDerivedCorners(patch: Partial<SheetGeographicTransform>): boolean {
  if (patch.corners) {
    return false;
  }

  return [
    "centerLatitude",
    "centerLongitude",
    "latitudeSpan",
    "longitudeSpan",
    "rotation",
    "scaleX",
    "scaleY",
    "skewX",
    "skewY",
    "isFlippedHorizontally",
    "isFlippedVertically",
  ].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

export function placeSheetAtMapCenter(
  sheet: SheetGeographicTransform,
  center: GeoCoordinate,
  options: { longitudeSpan?: number; latitudeSpan?: number } = {},
): SheetGeographicTransform {
  return normalizeSheetGeographicTransform({
    ...sheet,
    corners: undefined,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    longitudeSpan: options.longitudeSpan ?? sheet.longitudeSpan,
    latitudeSpan: options.latitudeSpan ?? sheet.latitudeSpan,
    isVisible: true,
    placementStatus: "draft",
    georeferenceStatus: sheet.georeferenceStatus === "not_started" ? "bounding_box" : sheet.georeferenceStatus,
    transformVersion: sheet.transformVersion + 1,
  });
}

export function updateSheetGeographicCorner(
  sheet: SheetGeographicTransform,
  corner: keyof GeoCorners,
  coordinate: GeoCoordinate,
): SheetGeographicTransform {
  return normalizeSheetGeographicTransform({
    ...sheet,
    corners: {
      ...sheet.corners,
      [corner]: coordinate,
    },
    isVisible: true,
    placementStatus: "placed",
    warpType: "projective",
    transformVersion: sheet.transformVersion + 1,
  });
}

export function removeSheetGeographicPlacement(sheet: SheetGeographicTransform): SheetGeographicTransform {
  return normalizeSheetGeographicTransform({
    ...sheet,
    isVisible: false,
    placementStatus: "unplaced",
    georeferenceStatus: "not_started",
    projectiveMatrix: null,
    transformVersion: sheet.transformVersion + 1,
  });
}

export function isAccidentalZeroSheetPlacement(sheet: SheetGeographicTransform): boolean {
  const coordinates = [sheet.corners.northwest, sheet.corners.northeast, sheet.corners.southeast, sheet.corners.southwest].filter(
    (coordinate): coordinate is GeoCoordinate => Boolean(coordinate),
  );

  return (
    Math.abs(sheet.centerLatitude) <= 0.000001 &&
    Math.abs(sheet.centerLongitude) <= 0.000001 &&
    coordinates.length === 4 &&
    coordinates.every((coordinate) => Math.abs(coordinate.latitude) <= 0.000001 && Math.abs(coordinate.longitude) <= 0.000001)
  );
}

export function resetSheetGeographicPlacementToCenter(
  sheet: SheetGeographicTransform,
  center: GeoCoordinate,
  options: { longitudeSpan?: number; latitudeSpan?: number } = {},
): SheetGeographicTransform {
  return placeSheetAtMapCenter(
    normalizeSheetGeographicTransform({
      ...sheet,
      corners: undefined,
      isVisible: true,
      placementStatus: "draft",
      opacity: sheet.opacity || defaultHistoricalSheetOpacity,
    }),
    center,
    options,
  );
}

function coordinatesMatch(left: GeoCoordinate | null | undefined, right: GeoCoordinate | null | undefined, tolerance: number): boolean {
  return Boolean(
    left &&
      right &&
      Math.abs(left.latitude - right.latitude) <= tolerance &&
      Math.abs(left.longitude - right.longitude) <= tolerance,
  );
}

export function sheetPlacementMatchesForPersistence(
  expected: SheetGeographicTransform,
  saved: SheetGeographicTransform,
  tolerance = 0.0000001,
): boolean {
  return (
    expected.assetId === saved.assetId &&
    Math.abs(expected.opacity - saved.opacity) <= 0.0001 &&
    coordinatesMatch(expected.corners.northwest, saved.corners.northwest, tolerance) &&
    coordinatesMatch(expected.corners.northeast, saved.corners.northeast, tolerance) &&
    coordinatesMatch(expected.corners.southeast, saved.corners.southeast, tolerance) &&
    coordinatesMatch(expected.corners.southwest, saved.corners.southwest, tolerance)
  );
}

export function selectManualSheetPlacementForSave(
  sheets: SheetGeographicTransform[],
  assetId: string | null | undefined,
): SheetGeographicTransform[] {
  if (!assetId) {
    return [];
  }

  return sheets.filter((sheet) => sheet.assetId === assetId && sheet.isVisible && sheet.placementStatus !== "unplaced");
}

export function updateSheetGeographicTransform(
  sheets: SheetGeographicTransform[],
  assetId: string,
  patch: Partial<SheetGeographicTransform>,
): SheetGeographicTransform[] {
  return sheets.map((sheet) =>
    sheet.assetId === assetId
      ? normalizeSheetGeographicTransform({
          ...sheet,
          ...(patchRequiresDerivedCorners(patch) ? { corners: undefined } : null),
          ...patch,
          assetId,
          transformVersion: sheet.transformVersion + 1,
        })
      : sheet,
  );
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
    placementStatus: sheet.placementStatus === "unplaced" ? "placed" : sheet.placementStatus,
    transformVersion: sheet.transformVersion + 1,
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
        pivotX: 0.5,
        pivotY: 0.5,
        warpType: "projective",
        placementStatus: "placed",
        isPersisted: false,
      });
    })
    .sort((a, b) => a.layerOrder - b.layerOrder);
}

export function mergeSavedAndDefaultSheetGeoreferences(
  assets: Array<Pick<StudioSheetAsset, "assetId" | "width" | "height">>,
  saved: SheetGeographicTransform[],
  defaultCenter: GeoCoordinate | null = null,
): SheetGeographicTransform[] {
  const savedByAssetId = new Map(saved.map((sheet) => [sheet.assetId, sheet]));
  const defaults = assets
    .filter((asset) => !savedByAssetId.has(asset.assetId))
    .map((asset, index) =>
      normalizeSheetGeographicTransform({
        assetId: asset.assetId,
        sheetGeoreferenceId: `${asset.assetId}-sheet-georef`,
        centerLatitude: defaultCenter?.latitude ?? 0,
        centerLongitude: defaultCenter?.longitude ?? 0,
        latitudeSpan: Math.max(minGeographicSpan, asset.height / 100000),
        longitudeSpan: Math.max(minGeographicSpan, asset.width / 100000),
        layerOrder: saved.length + index,
        isVisible: false,
        georeferenceStatus: "not_started",
        placementStatus: "unplaced",
        opacity: defaultHistoricalSheetOpacity,
        warpType: "projective",
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

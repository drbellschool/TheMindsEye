import { reviewStatuses, type ReviewStatus } from "./community-status.ts";
import type { HistoricalMapGeoreference } from "./historical-map-georeference.ts";
import type { GeographicMapSettings, SheetGeographicTransform } from "./historical-map-sheet-georeference.ts";

export const studioAutosaveDelayMs = 13_000;
export const studioSignedUrlTtlSeconds = 300;
export const minStudioScale = 0.05;
export const maxStudioScale = 8;
export const minStudioSkew = -45;
export const maxStudioSkew = 45;
export const minStudioOpacity = 0.05;
export const maxStudioOpacity = 1;
export const defaultHistoricalSheetOpacity = 0.5;
export const maxStudioHistoryEntries = 60;
export const studioTransformerAnchors = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type StudioSaveStatus = "idle" | "saving" | "saved" | "error";
export type StudioMode = "read_only" | "public";

export type StudioTownPackage = {
  id: string;
  packageId: string;
  name: string;
  region: string;
  year: number;
  centerLatitude: number | null;
  centerLongitude: number | null;
  defaultZoom: number | null;
  locationQuery?: string | null;
  locationDisplayName?: string | null;
  locationNorth?: number | null;
  locationSouth?: number | null;
  locationEast?: number | null;
  locationWest?: number | null;
};

export type StudioSourceOption = {
  sourceRecordId: string;
  sourceId: string;
  title: string;
  sourceUrl: string | null;
  archiveName: string | null;
  rightsNote: string | null;
};

export type StudioSheetAsset = {
  assetId: string;
  rowId: string;
  townPackageId: string;
  sourceRecordId: string | null;
  sourceId: string | null;
  sourceTitle: string | null;
  mapLayerId: string | null;
  sheetNumber: number | null;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  signedUrl: string | null;
  signedUrlExpiresAt: string | null;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  sourceUrl: string | null;
  archiveName: string | null;
  rightsNote: string | null;
  evidenceClassification: ReviewStatus;
  reviewStatus: ReviewStatus;
  intakeNotes: string | null;
  uploadedAt: string | null;
  updatedAt: string | null;
  signedUrlError?: string;
};

export type StudioPlacement = {
  assetId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  rotation: number;
  opacity: number;
  layerOrder: number;
  isVisible: boolean;
  isLocked: boolean;
  isFlippedHorizontally: boolean;
  isFlippedVertically: boolean;
  isPersisted: boolean;
};

export type StudioViewport = {
  x: number;
  y: number;
  scale: number;
};

export type StudioWorkspace = {
  workspaceId: string;
  name: string;
  townPackageId: string;
  mapYear: number;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  viewport: StudioViewport;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type HistoricalMapStudioState = {
  mode: StudioMode;
  warningMessage?: string;
  dataSource: "supabase" | "setup_required";
  townPackages: StudioTownPackage[];
  activeTownPackage: StudioTownPackage | null;
  activeMapYear: number | null;
  availableMapYears: number[];
  expectedSheetCount: number;
  uploadedSheetCount: number;
  missingSheetNumbers: number[];
  duplicateSheetNumbers: number[];
  sourceOptions: StudioSourceOption[];
  workspace: StudioWorkspace | null;
  sheets: StudioSheetAsset[];
  placements: StudioPlacement[];
  sheetGeoreferences: SheetGeographicTransform[];
  geographicMap: GeographicMapSettings;
  georeferences: HistoricalMapGeoreference[];
  selectedBasemap: string;
  overlayOpacity: number;
  overlayVisible: boolean;
  locationSource: string;
  lastLoadedAt: string;
};

export type StudioPresentState = {
  viewport: StudioViewport;
  placements: StudioPlacement[];
};

export type StudioHistoryState = {
  past: StudioPresentState[];
  present: StudioPresentState;
  future: StudioPresentState[];
};

export type StudioMetadataInput = {
  sheetNumber?: number | null;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  archiveName?: string | null;
  rightsNote?: string | null;
  intakeNotes?: string | null;
  evidenceClassification?: string | null;
  reviewStatus?: string | null;
};

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function clampHistoricalOpacity(value: number | null | undefined, fallback = defaultHistoricalSheetOpacity): number {
  const numeric = Number(value ?? fallback);

  return clampNumber(Number.isFinite(numeric) ? numeric : fallback, minStudioOpacity, maxStudioOpacity);
}

export function shouldRefreshSignedUrl(expiresAt: string | null | undefined, nowMs = Date.now(), refreshWindowMs = 60_000): boolean {
  if (!expiresAt) {
    return true;
  }

  const expiresMs = Date.parse(expiresAt);

  return !Number.isFinite(expiresMs) || expiresMs - nowMs <= refreshWindowMs;
}

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let normalized = value % 360;

  if (normalized > 180) {
    normalized -= 360;
  }

  if (normalized < -180) {
    normalized += 360;
  }

  return Number(normalized.toFixed(3));
}

export function normalizeSkew(value: number): number {
  return Number(clampNumber(Number(value), minStudioSkew, maxStudioSkew).toFixed(3));
}

export function normalizePlacement(input: Partial<StudioPlacement> & { assetId: string; layerOrder?: number }): StudioPlacement {
  return {
    assetId: input.assetId,
    x: Number.isFinite(input.x) ? Number(input.x) : 0,
    y: Number.isFinite(input.y) ? Number(input.y) : 0,
    scaleX: clampNumber(Number(input.scaleX ?? 1), minStudioScale, maxStudioScale),
    scaleY: clampNumber(Number(input.scaleY ?? 1), minStudioScale, maxStudioScale),
    skewX: normalizeSkew(Number(input.skewX ?? 0)),
    skewY: normalizeSkew(Number(input.skewY ?? 0)),
    rotation: normalizeRotation(Number(input.rotation ?? 0)),
    opacity: clampNumber(Number(input.opacity ?? 1), minStudioOpacity, maxStudioOpacity),
    layerOrder: Number.isInteger(input.layerOrder) ? Number(input.layerOrder) : 0,
    isVisible: input.isVisible ?? true,
    isLocked: input.isLocked ?? false,
    isFlippedHorizontally: input.isFlippedHorizontally ?? false,
    isFlippedVertically: input.isFlippedVertically ?? false,
    isPersisted: input.isPersisted ?? false,
  };
}

export function normalizeViewport(input: Partial<StudioViewport> | null | undefined): StudioViewport {
  return {
    x: Number.isFinite(input?.x) ? Number(input?.x) : 0,
    y: Number.isFinite(input?.y) ? Number(input?.y) : 0,
    scale: clampNumber(Number(input?.scale ?? 1), 0.05, 6),
  };
}

export function normalizeReviewClassification(value: string | null | undefined): ReviewStatus {
  return reviewStatuses.includes(value as ReviewStatus) ? (value as ReviewStatus) : "unknown";
}

export function validateStudioMetadataInput(input: StudioMetadataInput): { ok: true; value: Required<StudioMetadataInput> } | { ok: false; error: string } {
  const sheetNumber = input.sheetNumber === null || input.sheetNumber === undefined ? null : Number(input.sheetNumber);

  if (sheetNumber !== null && (!Number.isInteger(sheetNumber) || sheetNumber <= 0)) {
    return { ok: false, error: "Sheet number must be a positive integer or empty." };
  }

  const evidenceClassification = normalizeReviewClassification(input.evidenceClassification);
  const reviewStatus = normalizeReviewClassification(input.reviewStatus);

  if (input.evidenceClassification && input.evidenceClassification !== evidenceClassification) {
    return { ok: false, error: "Evidence classification is not allowed." };
  }

  if (input.reviewStatus && input.reviewStatus !== reviewStatus) {
    return { ok: false, error: "Review status is not allowed." };
  }

  return {
    ok: true,
    value: {
      sheetNumber,
      sourceRecordId: normalizeOptionalString(input.sourceRecordId, 120),
      sourceUrl: normalizeOptionalString(input.sourceUrl, 2000),
      archiveName: normalizeOptionalString(input.archiveName, 500),
      rightsNote: normalizeOptionalString(input.rightsNote, 2000),
      intakeNotes: normalizeOptionalString(input.intakeNotes, 4000),
      evidenceClassification,
      reviewStatus,
    },
  };
}

export function normalizeOptionalString(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
}

export function getSheetNumbers(assets: Array<{ sheetNumber: number | null }>): number[] {
  return assets.map((asset) => asset.sheetNumber).filter((sheetNumber): sheetNumber is number => Number.isInteger(sheetNumber));
}

export function selectPreferredSheetAfterUpload(assets: Array<{ assetId: string }>, pendingAssetId: string | null | undefined): string {
  if (pendingAssetId && assets.some((asset) => asset.assetId === pendingAssetId)) {
    return pendingAssetId;
  }

  return assets[0]?.assetId ?? "";
}

export function findDuplicateStudioSheetNumbers(assets: Array<{ sheetNumber: number | null }>): number[] {
  const counts = new Map<number, number>();

  for (const sheetNumber of getSheetNumbers(assets)) {
    counts.set(sheetNumber, (counts.get(sheetNumber) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sheetNumber]) => sheetNumber)
    .sort((a, b) => a - b);
}

export function findMissingStudioSheetNumbers(assets: Array<{ sheetNumber: number | null }>, expectedSheetCount: number): number[] {
  if (!Number.isInteger(expectedSheetCount) || expectedSheetCount <= 0) {
    return [];
  }

  const present = new Set(getSheetNumbers(assets));
  const missing: number[] = [];

  for (let sheetNumber = 1; sheetNumber <= expectedSheetCount; sheetNumber += 1) {
    if (!present.has(sheetNumber)) {
      missing.push(sheetNumber);
    }
  }

  return missing;
}

export function createDefaultGridPlacements(assets: Array<{ assetId: string; width: number; height: number }>): StudioPlacement[] {
  if (assets.length === 0) {
    return [];
  }

  const columns = Math.ceil(Math.sqrt(assets.length));
  const targetWidth = 520;
  const gap = 90;
  const cellWidth = targetWidth + gap;
  const cellHeight = 620;

  return assets.map((asset, index) => {
    const scale = clampNumber(targetWidth / Math.max(asset.width, 1), 0.08, 0.65);
    const column = index % columns;
    const row = Math.floor(index / columns);

    return normalizePlacement({
      assetId: asset.assetId,
      x: column * cellWidth,
      y: row * cellHeight,
      scaleX: scale,
      scaleY: scale,
      layerOrder: index,
      isPersisted: false,
    });
  });
}

export function mergeSavedAndDefaultPlacements(
  assets: Array<{ assetId: string; width: number; height: number }>,
  savedPlacements: StudioPlacement[],
): StudioPlacement[] {
  const savedByAssetId = new Map(savedPlacements.map((placement) => [placement.assetId, placement]));
  const missingAssets = assets.filter((asset) => !savedByAssetId.has(asset.assetId));
  const maxLayerOrder = Math.max(-1, ...savedPlacements.map((placement) => placement.layerOrder));
  const defaultPlacements = createDefaultGridPlacements(missingAssets).map((placement, index) => ({
    ...placement,
    layerOrder: maxLayerOrder + index + 1,
  }));

  return [...savedPlacements.map((placement) => normalizePlacement({ ...placement, isPersisted: true })), ...defaultPlacements].sort(
    (a, b) => a.layerOrder - b.layerOrder,
  );
}

export function reorderPlacement(placements: StudioPlacement[], assetId: string, action: "forward" | "backward" | "front" | "back"): StudioPlacement[] {
  const sorted = [...placements].sort((a, b) => a.layerOrder - b.layerOrder);
  const index = sorted.findIndex((placement) => placement.assetId === assetId);

  if (index < 0) {
    return placements;
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

  return sorted.map((placement, layerOrder) => ({ ...placement, layerOrder }));
}

export function updatePlacement(placements: StudioPlacement[], assetId: string, patch: Partial<StudioPlacement>): StudioPlacement[] {
  return placements.map((placement) => (placement.assetId === assetId ? normalizePlacement({ ...placement, ...patch, assetId }) : placement));
}

export function canDragStudioPlacement(placement: Pick<StudioPlacement, "isVisible" | "isLocked">): boolean {
  return placement.isVisible && !placement.isLocked;
}

export function canEditHistoricalSheetOnMap(input: { mode: string; isVisible: boolean; isLocked: boolean }): boolean {
  return input.mode === "edit_historical_sheets" && input.isVisible && !input.isLocked;
}

export function shouldPanModernMap(mode: string): boolean {
  return mode !== "edit_historical_sheets";
}

export function shouldPanStudioStage(input: { isSpacePanning: boolean; pointerButton: number; targetIsStage: boolean }): boolean {
  return input.targetIsStage && (input.isSpacePanning || input.pointerButton === 1);
}

export function shouldClearStudioSelection(input: { targetIsStage: boolean; isStagePanning: boolean; pointerButton: number }): boolean {
  return input.targetIsStage && !input.isStagePanning && input.pointerButton === 0;
}

export function shouldAttachStudioTransformer(input: { isSelected: boolean; isLocked: boolean; nodeMounted: boolean }): boolean {
  return input.isSelected && !input.isLocked && input.nodeMounted;
}

export function canAutosaveStudioMode(mode: StudioMode): boolean {
  return mode !== "read_only";
}

export function applyInspectorTransformPatch(placement: StudioPlacement, patch: Partial<StudioPlacement>): StudioPlacement {
  return normalizePlacement({ ...placement, ...patch, assetId: placement.assetId });
}

export function buildInitialHistory(present: StudioPresentState): StudioHistoryState {
  return {
    past: [],
    present: clonePresent(present),
    future: [],
  };
}

export function pushStudioHistory(history: StudioHistoryState, nextPresent: StudioPresentState): StudioHistoryState {
  const past = [...history.past, clonePresent(history.present)].slice(-maxStudioHistoryEntries);

  return {
    past,
    present: clonePresent(nextPresent),
    future: [],
  };
}

export function undoStudioHistory(history: StudioHistoryState): StudioHistoryState {
  if (history.past.length === 0) {
    return history;
  }

  const previous = history.past[history.past.length - 1];

  return {
    past: history.past.slice(0, -1),
    present: clonePresent(previous),
    future: [clonePresent(history.present), ...history.future].slice(0, maxStudioHistoryEntries),
  };
}

export function redoStudioHistory(history: StudioHistoryState): StudioHistoryState {
  if (history.future.length === 0) {
    return history;
  }

  const next = history.future[0];

  return {
    past: [...history.past, clonePresent(history.present)].slice(-maxStudioHistoryEntries),
    present: clonePresent(next),
    future: history.future.slice(1),
  };
}

export function clonePresent(present: StudioPresentState): StudioPresentState {
  return {
    viewport: { ...present.viewport },
    placements: present.placements.map((placement) => ({ ...placement })),
  };
}

export function shouldIgnoreStudioShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function isControlledSanbornStoragePath(path: string, expectedTownPackageId?: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return false;
  }

  const parts = path.split("/");

  if (parts.length < 4 || parts[1] !== "sanborn-sheets") {
    return false;
  }

  if (expectedTownPackageId && parts[0] !== expectedTownPackageId) {
    return false;
  }

  return parts.every((part) => part.length > 0);
}

export function planDeleteSheetOperations() {
  return ["delete_workspace_placements", "delete_metadata_record", "remove_storage_object"] as const;
}

export function planReplacementOperations() {
  return ["upload_replacement_object", "update_metadata_record", "remove_previous_storage_object"] as const;
}

export function getWorkspaceStatus(input: { sheets: number; unsavedChanges: boolean; saveStatus: StudioSaveStatus; warningMessage?: string }): string {
  if (input.warningMessage) {
    return "attention_required";
  }

  if (input.sheets === 0) {
    return "empty_workspace";
  }

  if (input.saveStatus === "error") {
    return "save_error";
  }

  if (input.unsavedChanges) {
    return "unsaved_changes";
  }

  return "ready";
}

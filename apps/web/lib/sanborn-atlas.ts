import { reviewStatuses, type ReviewStatus } from "./community-status.ts";

export const sanbornPageTypes = [
  "title",
  "legend",
  "graphic_index",
  "street_index",
  "specials_index",
  "numbered_sheet",
  "supplement",
  "unknown",
] as const;

export const sanbornMapPieceTypes = [
  "regular_block",
  "block_fragment",
  "detached_inset",
  "industrial_special",
  "railroad_special",
  "waterfront_special",
  "institutional_special",
  "unclassified_region",
] as const;

export const sanbornMapPieceCreationMethods = ["human", "computer_vision_candidate", "ocr_assisted", "import"] as const;
export const sanbornMapPieceInventoryStatuses = ["draft", "reviewed", "rejected"] as const;

export type SanbornPageType = (typeof sanbornPageTypes)[number];
export type SanbornMapPieceType = (typeof sanbornMapPieceTypes)[number];
export type SanbornMapPieceCreationMethod = (typeof sanbornMapPieceCreationMethods)[number];
export type SanbornMapPieceInventoryStatus = (typeof sanbornMapPieceInventoryStatuses)[number];

export type SanbornNormalizedPoint = {
  x: number;
  y: number;
};

export type SanbornSourceBBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SanbornAtlasRecord = {
  rowId: string;
  atlasId: string;
  townPackageId: string;
  sourceRecordId: string | null;
  title: string;
  editionYear: number;
  editionDate: string | null;
  volumeLabel: string | null;
  expectedPageCount: number | null;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type SanbornAtlasPageRecord = {
  rowId: string;
  pageId: string;
  atlasRowId: string;
  atlasId: string;
  sanbornSheetAssetId: string;
  sanbornSheetAssetRowId: string;
  pageSequence: number;
  pageType: SanbornPageType;
  sheetNumber: number | null;
  volumeLabel: string | null;
  displayLabel: string | null;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type SanbornMapPieceRecord = {
  rowId: string;
  pieceId: string;
  atlasPageRowId: string;
  atlasPageId: string;
  parentPieceId: string | null;
  pieceSequence: number;
  pieceType: SanbornMapPieceType;
  blockNumberText: string | null;
  titleText: string | null;
  sourcePolygon: SanbornNormalizedPoint[];
  sourceBBox: SanbornSourceBBox;
  creationMethod: SanbornMapPieceCreationMethod;
  inventoryStatus: SanbornMapPieceInventoryStatus;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  notes: string | null;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type SanbornAtlasInventoryState = {
  mode: "public" | "read_only";
  dataSource: "supabase" | "unavailable";
  warningMessage?: string;
  atlases: SanbornAtlasRecord[];
  pages: SanbornAtlasPageRecord[];
  pieces: SanbornMapPieceRecord[];
  unassignedAssetIds: string[];
  activeAtlasId: string | null;
  activePageId: string | null;
  lastLoadedAt: string;
};

export type SanbornPieceValidationResult =
  | { ok: true; polygon: SanbornNormalizedPoint[]; bbox: SanbornSourceBBox }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNormalizedCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

export function isSanbornPageType(value: string | null | undefined): value is SanbornPageType {
  return sanbornPageTypes.includes(value as SanbornPageType);
}

export function isSanbornMapPieceType(value: string | null | undefined): value is SanbornMapPieceType {
  return sanbornMapPieceTypes.includes(value as SanbornMapPieceType);
}

export function normalizeSanbornPageType(value: string | null | undefined): SanbornPageType {
  return isSanbornPageType(value) ? value : "unknown";
}

export function normalizeSanbornMapPieceType(value: string | null | undefined): SanbornMapPieceType {
  return isSanbornMapPieceType(value) ? value : "unclassified_region";
}

export function normalizeSanbornMapPieceCreationMethod(value: string | null | undefined): SanbornMapPieceCreationMethod {
  return sanbornMapPieceCreationMethods.includes(value as SanbornMapPieceCreationMethod) ? (value as SanbornMapPieceCreationMethod) : "human";
}

export function normalizeSanbornMapPieceInventoryStatus(value: string | null | undefined): SanbornMapPieceInventoryStatus {
  return sanbornMapPieceInventoryStatuses.includes(value as SanbornMapPieceInventoryStatus) ? (value as SanbornMapPieceInventoryStatus) : "draft";
}

export function normalizeSanbornReviewStatus(value: string | null | undefined): ReviewStatus {
  return reviewStatuses.includes(value as ReviewStatus) ? (value as ReviewStatus) : "unknown";
}

export function normalizeOptionalSanbornText(value: string | null | undefined, maxLength = 500): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : null;
}

export function normalizePositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function calculateSourceBoundingBox(points: SanbornNormalizedPoint[]): SanbornSourceBBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Number(Math.min(...xs).toFixed(6)),
    minY: Number(Math.min(...ys).toFixed(6)),
    maxX: Number(Math.max(...xs).toFixed(6)),
    maxY: Number(Math.max(...ys).toFixed(6)),
  };
}

export function countDistinctNormalizedPolygonVertices(points: SanbornNormalizedPoint[]): number {
  return new Set(points.map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`)).size;
}

export function calculateNormalizedPolygonArea(points: SanbornNormalizedPoint[]): number {
  if (points.length < 3) {
    return 0;
  }

  const areaSum = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(areaSum) / 2;
}

export function validateNormalizedPolygon(value: unknown): SanbornPieceValidationResult {
  if (!Array.isArray(value) || value.length < 3) {
    return { ok: false, error: "Map piece polygon must contain at least three points." };
  }

  const polygon: SanbornNormalizedPoint[] = [];

  for (const point of value) {
    if (!isRecord(point)) {
      return { ok: false, error: "Map piece polygon points must be objects." };
    }

    const x = Number(point.x);
    const y = Number(point.y);

    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      return { ok: false, error: "Map piece polygon coordinates must be normalized between 0 and 1." };
    }

    polygon.push({ x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) });
  }

  if (countDistinctNormalizedPolygonVertices(polygon) < 3) {
    return { ok: false, error: "Map piece polygon must contain at least three distinct points." };
  }

  if (calculateNormalizedPolygonArea(polygon) <= 0.000000000001) {
    return { ok: false, error: "Map piece polygon must have nonzero area." };
  }

  return { ok: true, polygon, bbox: calculateSourceBoundingBox(polygon) };
}

export function pixelToNormalizedPoint(input: { x: number; y: number; width: number; height: number }): SanbornNormalizedPoint {
  const width = Math.max(1, Number(input.width));
  const height = Math.max(1, Number(input.height));

  return {
    x: clampNormalizedCoordinate(Number(input.x) / width),
    y: clampNormalizedCoordinate(Number(input.y) / height),
  };
}

export function normalizedToPixelPoint(point: SanbornNormalizedPoint, width: number, height: number): { x: number; y: number } {
  return {
    x: Number((clampNormalizedCoordinate(point.x) * Math.max(1, width)).toFixed(3)),
    y: Number((clampNormalizedCoordinate(point.y) * Math.max(1, height)).toFixed(3)),
  };
}

export function reorderAtlasPages<T extends { pageSequence: number; pageId: string }>(pages: T[]): T[] {
  return [...pages]
    .sort((left, right) => left.pageSequence - right.pageSequence || left.pageId.localeCompare(right.pageId))
    .map((page, index) => ({ ...page, pageSequence: index + 1 }));
}

export function reorderMapPieces<T extends { pieceSequence: number; pieceId: string }>(pieces: T[]): T[] {
  return [...pieces]
    .sort((left, right) => left.pieceSequence - right.pieceSequence || left.pieceId.localeCompare(right.pieceId))
    .map((piece, index) => ({ ...piece, pieceSequence: index + 1 }));
}

export function getUnassignedSanbornUploads<TAsset extends { assetId: string }, TPage extends { sanbornSheetAssetId: string }>(
  assets: TAsset[],
  pages: TPage[],
): TAsset[] {
  const assigned = new Set(pages.map((page) => page.sanbornSheetAssetId));
  return assets.filter((asset) => !assigned.has(asset.assetId));
}

export function sanitizeSanbornStableIdSegment(value: string | number | null | undefined): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "unknown";
}

export function buildDefaultSanbornAtlasId(input: { townPackageId: string; editionYear: number; volumeLabel?: string | null }): string {
  const town = sanitizeSanbornStableIdSegment(input.townPackageId);
  const volume = sanitizeSanbornStableIdSegment(input.volumeLabel);
  const suffix = volume === "unknown" ? "" : `-${volume}`;

  return `${town}-${input.editionYear}${suffix}-sanborn-atlas`;
}

export function buildDefaultSanbornPageId(input: { atlasId: string; assetId: string }): string {
  return `${sanitizeSanbornStableIdSegment(input.atlasId)}-${sanitizeSanbornStableIdSegment(input.assetId)}-page`;
}

export function buildDefaultSanbornPieceId(input: { pageId: string; pieceSequence: number; suffix?: string | null }): string {
  const suffix = sanitizeSanbornStableIdSegment(input.suffix ?? input.pieceSequence);
  return `${sanitizeSanbornStableIdSegment(input.pageId)}-piece-${suffix}`;
}

export function createEmptySanbornAtlasInventoryState(input?: Partial<Pick<SanbornAtlasInventoryState, "warningMessage" | "mode" | "dataSource">>): SanbornAtlasInventoryState {
  return {
    mode: input?.mode ?? "read_only",
    dataSource: input?.dataSource ?? "unavailable",
    warningMessage: input?.warningMessage,
    atlases: [],
    pages: [],
    pieces: [],
    unassignedAssetIds: [],
    activeAtlasId: null,
    activePageId: null,
    lastLoadedAt: new Date().toISOString(),
  };
}

export function validateMapPieceSaveTownScope(input: { pageTownPackageId: string | null | undefined; activeTownPackageId: string | null | undefined }) {
  if (!input.pageTownPackageId || !input.activeTownPackageId || input.pageTownPackageId !== input.activeTownPackageId) {
    return { ok: false as const, error: "Map pieces can only be saved for atlas pages in the active town package." };
  }

  return { ok: true as const };
}

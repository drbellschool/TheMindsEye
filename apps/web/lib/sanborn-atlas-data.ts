import {
  createEmptySanbornAtlasInventoryState,
  getUnassignedSanbornUploads,
  normalizeSanbornMapPieceCreationMethod,
  normalizeSanbornMapPieceInventoryStatus,
  normalizeSanbornMapPieceType,
  normalizeSanbornPageType,
  normalizeSanbornReviewStatus,
  validateNormalizedPolygon,
  type SanbornAtlasInventoryState,
  type SanbornAtlasPageRecord,
  type SanbornAtlasRecord,
  type SanbornMapPieceRecord,
  type SanbornSourceBBox,
} from "./sanborn-atlas.ts";
import type { StudioSheetAsset, StudioTownPackage } from "./historical-map-studio.ts";
import type { createAdminClient } from "./supabase/admin.ts";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type SanbornAtlasRow = {
  id: string;
  atlas_id: string;
  town_package_id: string;
  source_record_id: string | null;
  title: string;
  edition_year: number;
  edition_date: string | null;
  volume_label: string | null;
  expected_page_count: number | null;
  notes?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  review_status: string | null;
  evidence_classification: string | null;
  updated_at: string | null;
};

type SanbornAtlasPageRow = {
  id: string;
  page_id: string;
  atlas_id: string;
  sanborn_sheet_asset_id: string;
  page_sequence: number;
  page_type: string | null;
  sheet_number: number | null;
  printed_reference?: string | null;
  volume_label: string | null;
  display_label: string | null;
  is_primary_town_index?: boolean | null;
  classification_notes?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  review_status: string | null;
  evidence_classification: string | null;
  updated_at: string | null;
};

type SanbornMapPieceRow = {
  id: string;
  piece_id: string;
  atlas_page_id: string;
  parent_piece_id: string | null;
  piece_sequence: number;
  piece_type: string | null;
  block_number_text: string | null;
  title_text: string | null;
  source_polygon: unknown;
  source_bbox: unknown;
  creation_method: string | null;
  inventory_status: string | null;
  review_status: string | null;
  evidence_classification: string | null;
  notes: string | null;
  updated_at: string | null;
};

function mapAtlas(row: SanbornAtlasRow): SanbornAtlasRecord {
  return {
    rowId: row.id,
    atlasId: row.atlas_id,
    townPackageId: row.town_package_id,
    sourceRecordId: row.source_record_id,
    title: row.title,
    editionYear: row.edition_year,
    editionDate: row.edition_date,
    volumeLabel: row.volume_label,
    expectedPageCount: row.expected_page_count,
    notes: row.notes ?? null,
    archivedAt: row.archived_at ?? null,
    archiveReason: row.archive_reason ?? null,
    reviewStatus: normalizeSanbornReviewStatus(row.review_status),
    evidenceClassification: normalizeSanbornReviewStatus(row.evidence_classification),
    updatedAt: row.updated_at,
    isPersisted: true,
  };
}

function mapPage(row: SanbornAtlasPageRow, atlasByRowId: Map<string, SanbornAtlasRecord>, assetByRowId: Map<string, StudioSheetAsset>): SanbornAtlasPageRecord | null {
  const atlas = atlasByRowId.get(row.atlas_id);
  const asset = assetByRowId.get(row.sanborn_sheet_asset_id);

  if (!atlas || !asset) {
    return null;
  }

  return {
    rowId: row.id,
    pageId: row.page_id,
    atlasRowId: row.atlas_id,
    atlasId: atlas.atlasId,
    sanbornSheetAssetId: asset.assetId,
    sanbornSheetAssetRowId: asset.rowId,
    pageSequence: row.page_sequence,
    pageType: normalizeSanbornPageType(row.page_type),
    sheetNumber: row.sheet_number,
    printedReference: row.printed_reference ?? null,
    volumeLabel: row.volume_label,
    displayLabel: row.display_label,
    isPrimaryTownIndex: row.is_primary_town_index === true,
    classificationNotes: row.classification_notes ?? null,
    archivedAt: row.archived_at ?? null,
    archiveReason: row.archive_reason ?? null,
    reviewStatus: normalizeSanbornReviewStatus(row.review_status),
    evidenceClassification: normalizeSanbornReviewStatus(row.evidence_classification),
    updatedAt: row.updated_at,
    isPersisted: true,
  };
}

function normalizeBbox(value: unknown, fallback: SanbornSourceBBox): SanbornSourceBBox {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Record<string, unknown>;
  const minX = Number(candidate.minX);
  const minY = Number(candidate.minY);
  const maxX = Number(candidate.maxX);
  const maxY = Number(candidate.maxY);

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return fallback;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

function mapPiece(row: SanbornMapPieceRow, pageByRowId: Map<string, SanbornAtlasPageRecord>, pieceIdByRowId: Map<string, string>): SanbornMapPieceRecord | null {
  const page = pageByRowId.get(row.atlas_page_id);
  const polygonResult = validateNormalizedPolygon(row.source_polygon);

  if (!page || !polygonResult.ok) {
    return null;
  }

  return {
    rowId: row.id,
    pieceId: row.piece_id,
    atlasPageRowId: row.atlas_page_id,
    atlasPageId: page.pageId,
    parentPieceId: row.parent_piece_id ? pieceIdByRowId.get(row.parent_piece_id) ?? null : null,
    pieceSequence: row.piece_sequence,
    pieceType: normalizeSanbornMapPieceType(row.piece_type),
    blockNumberText: row.block_number_text,
    titleText: row.title_text,
    sourcePolygon: polygonResult.polygon,
    sourceBBox: normalizeBbox(row.source_bbox, polygonResult.bbox),
    creationMethod: normalizeSanbornMapPieceCreationMethod(row.creation_method),
    inventoryStatus: normalizeSanbornMapPieceInventoryStatus(row.inventory_status),
    reviewStatus: normalizeSanbornReviewStatus(row.review_status),
    evidenceClassification: normalizeSanbornReviewStatus(row.evidence_classification),
    notes: row.notes,
    updatedAt: row.updated_at,
    isPersisted: true,
  };
}

function unavailableState(message: string, assets: StudioSheetAsset[]): SanbornAtlasInventoryState {
  return {
    ...createEmptySanbornAtlasInventoryState({
      mode: "read_only",
      dataSource: "unavailable",
      warningMessage: message,
    }),
    unassignedAssetIds: assets.map((asset) => asset.assetId),
  };
}

export async function loadSanbornAtlasInventory(input: {
  supabase: SupabaseAdminClient;
  town: StudioTownPackage;
  assets: StudioSheetAsset[];
  mapYear: number;
}): Promise<SanbornAtlasInventoryState> {
  const { supabase, town, assets, mapYear } = input;
  const atlasSelectWithArchive = "id, atlas_id, town_package_id, source_record_id, title, edition_year, edition_date, volume_label, expected_page_count, notes, archived_at, archive_reason, review_status, evidence_classification, updated_at";
  const atlasSelectBase = "id, atlas_id, town_package_id, source_record_id, title, edition_year, edition_date, volume_label, expected_page_count, review_status, evidence_classification, updated_at";
  let atlasResult: { data: unknown[] | null; error: { message: string } | null } = await supabase
    .from("sanborn_atlases")
    .select(atlasSelectWithArchive)
    .eq("town_package_id", town.id)
    .is("archived_at", null)
    .order("edition_year", { ascending: false })
    .order("volume_label", { ascending: true });

  if (atlasResult.error && /notes|archived_at|archive_reason/i.test(atlasResult.error.message)) {
    console.warn("[HistoricalMapStudio] Atlas archive columns are unavailable; falling back to active atlas select.", {
      message: atlasResult.error.message,
    });
    atlasResult = await supabase
      .from("sanborn_atlases")
      .select(atlasSelectBase)
      .eq("town_package_id", town.id)
      .order("edition_year", { ascending: false })
      .order("volume_label", { ascending: true });
  }

  if (atlasResult.error) {
    return unavailableState(`Sanborn atlas inventory is unavailable: ${atlasResult.error.message}. Apply migration 0010 to enable atlas/page/piece workflow.`, assets);
  }

  const atlases = ((atlasResult.data ?? []) as SanbornAtlasRow[]).map(mapAtlas).filter((atlas) => !atlas.archivedAt);
  const atlasByRowId = new Map(atlases.map((atlas) => [atlas.rowId, atlas]));
  const activeAtlas = atlases.find((atlas) => atlas.editionYear === mapYear) ?? atlases[0] ?? null;
  let allPages: SanbornAtlasPageRecord[] = [];
  let pages: SanbornAtlasPageRecord[] = [];
  let pieces: SanbornMapPieceRecord[] = [];

  if (atlases.length > 0) {
    const pageSelectWithClassification =
      "id, page_id, atlas_id, sanborn_sheet_asset_id, page_sequence, page_type, sheet_number, printed_reference, volume_label, display_label, is_primary_town_index, classification_notes, archived_at, archive_reason, review_status, evidence_classification, updated_at";
    const pageSelectBase = "id, page_id, atlas_id, sanborn_sheet_asset_id, page_sequence, page_type, sheet_number, volume_label, display_label, review_status, evidence_classification, updated_at";
    let pageResult: { data: unknown[] | null; error: { message: string } | null } = await supabase
      .from("sanborn_atlas_pages")
      .select(pageSelectWithClassification)
      .in("atlas_id", atlases.map((atlas) => atlas.rowId))
      .order("page_sequence", { ascending: true });

    if (
      pageResult.error &&
      /printed_reference|is_primary_town_index|classification_notes|archived_at|archive_reason/i.test(pageResult.error.message)
    ) {
      console.warn("[HistoricalMapStudio] Page classification columns are unavailable; falling back to legacy atlas page select.", {
        message: pageResult.error.message,
      });
      pageResult = await supabase
        .from("sanborn_atlas_pages")
        .select(pageSelectBase)
        .in("atlas_id", atlases.map((atlas) => atlas.rowId))
        .order("page_sequence", { ascending: true });
    }

    if (pageResult.error) {
      return unavailableState(`Sanborn atlas pages could not be loaded: ${pageResult.error.message}`, assets);
    }

    const assetByRowId = new Map(assets.map((asset) => [asset.rowId, asset]));
    const mappedPages = ((pageResult.data ?? []) as SanbornAtlasPageRow[])
      .map((row) => mapPage(row, atlasByRowId, assetByRowId))
      .filter((page): page is SanbornAtlasPageRecord => Boolean(page));
    allPages = mappedPages;
    pages = mappedPages.filter((page) => !page.archivedAt);

    if (pages.length > 0) {
      const pieceResult = await supabase
        .from("sanborn_map_pieces")
        .select("id, piece_id, atlas_page_id, parent_piece_id, piece_sequence, piece_type, block_number_text, title_text, source_polygon, source_bbox, creation_method, inventory_status, review_status, evidence_classification, notes, updated_at")
        .in("atlas_page_id", pages.map((page) => page.rowId))
        .order("piece_sequence", { ascending: true });

      if (pieceResult.error) {
        return unavailableState(`Sanborn map pieces could not be loaded: ${pieceResult.error.message}`, assets);
      }

      const pieceRows = (pieceResult.data ?? []) as SanbornMapPieceRow[];
      const pageByRowId = new Map(pages.map((page) => [page.rowId, page]));
      const pieceIdByRowId = new Map(pieceRows.map((row) => [row.id, row.piece_id]));
      pieces = pieceRows
        .map((row) => mapPiece(row, pageByRowId, pieceIdByRowId))
        .filter((piece): piece is SanbornMapPieceRecord => Boolean(piece));
    }
  }

  const activePages = activeAtlas ? pages.filter((page) => page.atlasId === activeAtlas.atlasId) : pages;
  const activePage = activePages[0] ?? pages[0] ?? null;

  return {
    mode: "public",
    dataSource: "supabase",
    atlases,
    pages,
    pieces,
    unassignedAssetIds: getUnassignedSanbornUploads(assets, allPages).map((asset) => asset.assetId),
    activeAtlasId: activeAtlas?.atlasId ?? null,
    activePageId: activePage?.pageId ?? null,
    lastLoadedAt: new Date().toISOString(),
  };
}

import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornPieceId,
  isSanbornMapPieceType,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
  normalizeSanbornMapPieceCreationMethod,
  normalizeSanbornMapPieceInventoryStatus,
  normalizeSanbornReviewStatus,
  validateMapPieceSaveTownScope,
  validateNormalizedPolygon,
} from "@/lib/sanborn-atlas";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type MapPieceSaveBody = {
  townPackageId?: string;
  pageId?: string;
  pieces?: Array<{
    pieceId?: string | null;
    parentPieceId?: string | null;
    pieceSequence?: number | string | null;
    pieceType?: string | null;
    blockNumberText?: string | null;
    titleText?: string | null;
    sourcePolygon?: unknown;
    creationMethod?: string | null;
    inventoryStatus?: string | null;
    notes?: string | null;
  }>;
};

type AtlasPageRow = {
  id: string;
  page_id: string;
  atlas_id: string;
};

type AtlasRow = {
  id: string;
  town_package_id: string;
};

type ExistingPieceRow = {
  id: string;
  piece_id: string;
};

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as MapPieceSaveBody | null;

  if (!body || !body.pageId || !Array.isArray(body.pieces)) {
    return jsonError(400, "Map piece payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const pageResult = await supabase
    .from("sanborn_atlas_pages")
    .select("id, page_id, atlas_id")
    .eq("page_id", body.pageId)
    .maybeSingle<AtlasPageRow>();

  if (pageResult.error) {
    return jsonError(503, "Sanborn atlas page could not be loaded before saving map pieces.");
  }

  if (!pageResult.data) {
    return jsonError(404, "Sanborn atlas page was not found.");
  }

  const atlasResult = await supabase.from("sanborn_atlases").select("id, town_package_id").eq("id", pageResult.data.atlas_id).maybeSingle<AtlasRow>();

  if (atlasResult.error) {
    return jsonError(503, "Sanborn atlas could not be verified before saving map pieces.");
  }

  const scope = validateMapPieceSaveTownScope({
    pageTownPackageId: atlasResult.data?.town_package_id,
    activeTownPackageId: townPackage.id,
  });

  if (!scope.ok) {
    return jsonError(400, scope.error);
  }

  const normalizedPieces = body.pieces.map((piece, index) => {
    const pieceSequence = normalizePositiveInteger(piece.pieceSequence) ?? index + 1;
    const pieceType = piece.pieceType;
    const polygon = validateNormalizedPolygon(piece.sourcePolygon);

    if (!isSanbornMapPieceType(pieceType)) {
      return { ok: false as const, error: "Map piece type is not allowed." };
    }

    if (!polygon.ok) {
      return { ok: false as const, error: polygon.error };
    }

    return {
      ok: true as const,
      value: {
        pieceId:
          normalizeOptionalSanbornText(piece.pieceId, 240) ??
          buildDefaultSanbornPieceId({
            pageId: pageResult.data!.page_id,
            pieceSequence,
          }),
        parentPieceId: normalizeOptionalSanbornText(piece.parentPieceId, 240),
        pieceSequence,
        pieceType,
        blockNumberText: normalizeOptionalSanbornText(piece.blockNumberText, 120),
        titleText: normalizeOptionalSanbornText(piece.titleText, 240),
        sourcePolygon: polygon.polygon,
        sourceBBox: polygon.bbox,
        creationMethod: normalizeSanbornMapPieceCreationMethod(piece.creationMethod),
        inventoryStatus: normalizeSanbornMapPieceInventoryStatus(piece.inventoryStatus),
        notes: normalizeOptionalSanbornText(piece.notes, 4000),
      },
    };
  });
  const invalidPiece = normalizedPieces.find((piece) => !piece.ok);

  if (invalidPiece && !invalidPiece.ok) {
    return jsonError(400, invalidPiece.error);
  }

  const pieces = normalizedPieces.map((piece) => (piece.ok ? piece.value : neverPiece()));
  const sequenceCount = new Set(pieces.map((piece) => piece.pieceSequence)).size;
  const pieceIdCount = new Set(pieces.map((piece) => piece.pieceId)).size;

  if (sequenceCount !== pieces.length) {
    return jsonError(400, "Map piece sequences must be unique.");
  }

  if (pieceIdCount !== pieces.length) {
    return jsonError(400, "Map piece IDs must be unique.");
  }

  const existingPiecesResult = await supabase.from("sanborn_map_pieces").select("id, piece_id").eq("atlas_page_id", pageResult.data.id);

  if (existingPiecesResult.error) {
    return jsonError(503, "Existing map pieces could not be loaded before saving.");
  }

  const existingPieces = (existingPiecesResult.data ?? []) as ExistingPieceRow[];
  const existingRowIdByPieceId = new Map(existingPieces.map((piece) => [piece.piece_id, piece.id]));
  const incomingPieceIds = new Set(pieces.map((piece) => piece.pieceId));

  for (const [index, piece] of existingPieces.entries()) {
    const offsetResult = await supabase
      .from("sanborn_map_pieces")
      .update({ piece_sequence: 100_000 + index + 1 })
      .eq("id", piece.id);

    if (offsetResult.error) {
      return jsonError(503, "Existing map pieces could not be prepared for reordering.");
    }
  }

  for (const piece of existingPieces) {
    if (incomingPieceIds.has(piece.piece_id)) {
      continue;
    }

    const deleteResult = await supabase.from("sanborn_map_pieces").delete().eq("id", piece.id);

    if (deleteResult.error) {
      return jsonError(503, "Removed map pieces could not be deleted from the draft inventory.");
    }
  }

  const records = pieces.map((piece) => ({
    piece_id: piece.pieceId,
    atlas_page_id: pageResult.data!.id,
    parent_piece_id: piece.parentPieceId ? existingRowIdByPieceId.get(piece.parentPieceId) ?? null : null,
    piece_sequence: piece.pieceSequence,
    piece_type: piece.pieceType,
    block_number_text: piece.blockNumberText,
    title_text: piece.titleText,
    source_polygon: piece.sourcePolygon,
    source_bbox: piece.sourceBBox,
    creation_method: piece.creationMethod,
    inventory_status: piece.inventoryStatus,
    review_status: normalizeSanbornReviewStatus("unknown"),
    evidence_classification: normalizeSanbornReviewStatus("unknown"),
    notes: piece.notes,
  }));

  if (records.length > 0) {
    const saveResult = await supabase
      .from("sanborn_map_pieces")
      .upsert(records, { onConflict: "piece_id" })
      .select("id, piece_id, updated_at");

    if (saveResult.error) {
      return jsonError(503, "Sanborn map pieces could not be saved.");
    }
  }

  return NextResponse.json({
    ok: true,
    pageId: pageResult.data.page_id,
    pieceCount: records.length,
    savedAt: new Date().toISOString(),
  });
}

function neverPiece(): never {
  throw new Error("Invalid map piece normalization state.");
}

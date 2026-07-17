import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornPieceId,
  isSanbornMapPieceType,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
  normalizeSanbornMapPieceCreationMethod,
  normalizeSanbornMapPieceInventoryStatus,
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

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as MapPieceSaveBody | null;
  const pageId = normalizeOptionalSanbornText(body?.pageId, 220);

  if (!body || !pageId || !Array.isArray(body.pieces)) {
    return jsonError(400, "Map piece payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
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

    const pieceId =
      normalizeOptionalSanbornText(piece.pieceId, 240) ??
      buildDefaultSanbornPieceId({
        pageId,
        pieceSequence,
      });
    const parentPieceId = normalizeOptionalSanbornText(piece.parentPieceId, 240);

    if (parentPieceId && parentPieceId === pieceId) {
      return { ok: false as const, error: "Parent piece cannot be the same as the child piece." };
    }

    return {
      ok: true as const,
      value: {
        pieceId,
        parentPieceId,
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

  const saveResult = await supabase.rpc("save_sanborn_map_pieces", {
    p_town_package_id: townPackage.id,
    p_page_id: pageId,
    p_pieces: pieces,
  });

  if (saveResult.error) {
    const status = saveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn map pieces could not be saved: ${saveResult.error.message}`);
  }

  return NextResponse.json({
    ok: true,
    pageId,
    pieceCount: pieces.length,
    result: saveResult.data ?? null,
    savedAt: new Date().toISOString(),
  });
}

function neverPiece(): never {
  throw new Error("Invalid map piece normalization state.");
}

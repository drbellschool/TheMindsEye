import type { SanbornMapPieceRecord } from "./sanborn-atlas.ts";

export function normalizeMapPieceBlockLabel(value: string | null | undefined): string {
  const normalized = value?.trim().replace(/^block\s+/i, "").trim();
  return normalized ? `Block ${normalized}` : "";
}

export function formatMapPiecePlacementLabel(piece: Pick<SanbornMapPieceRecord, "blockNumberText" | "titleText" | "pieceSequence"> | null | undefined): string {
  if (!piece) return "No map piece selected";

  const blockLabel = normalizeMapPieceBlockLabel(piece.blockNumberText);
  const title = piece.titleText?.trim() ?? "";
  if (blockLabel && title) {
    if (title.toLowerCase() === blockLabel.toLowerCase()) return blockLabel;
    if (title.toLowerCase().startsWith(`${blockLabel.toLowerCase()} `)) return `${blockLabel}${title.slice(blockLabel.length)}`.trim();
    return `${blockLabel} - ${title}`;
  }
  if (blockLabel) return blockLabel;
  if (title) return title;
  return `Feature ${String(piece.pieceSequence).padStart(2, "0")}`;
}

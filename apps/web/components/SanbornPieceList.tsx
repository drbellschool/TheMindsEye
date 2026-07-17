"use client";

import {
  sanbornMapPieceInventoryStatuses,
  sanbornMapPieceTypes,
  type SanbornMapPieceRecord,
  type SanbornMapPieceType,
  type SanbornMapPieceInventoryStatus,
} from "@/lib/sanborn-atlas";

type SanbornPieceListProps = {
  pieces: SanbornMapPieceRecord[];
  selectedPieceId: string;
  readOnly: boolean;
  onSelectPiece: (pieceId: string) => void;
  onPatchPiece: (pieceId: string, patch: Partial<SanbornMapPieceRecord>) => void;
  onReorderPiece: (pieceId: string, direction: "up" | "down") => void;
  onDeletePiece: (pieceId: string) => void;
};

function pieceLabel(piece: SanbornMapPieceRecord): string {
  return piece.titleText || piece.blockNumberText || `Piece ${piece.pieceSequence}`;
}

export function SanbornPieceList({
  pieces,
  selectedPieceId,
  readOnly,
  onSelectPiece,
  onPatchPiece,
  onReorderPiece,
  onDeletePiece,
}: SanbornPieceListProps) {
  const sortedPieces = [...pieces].sort((left, right) => left.pieceSequence - right.pieceSequence);

  if (sortedPieces.length === 0) {
    return <p className="sanborn-atlas-empty">No map pieces have been inventoried for this page.</p>;
  }

  return (
    <div className="sanborn-piece-list">
      {sortedPieces.map((piece, index) => (
        <article className={`sanborn-piece-list__item${piece.pieceId === selectedPieceId ? " is-selected" : ""}`} key={piece.pieceId}>
          <button className="sanborn-piece-list__select" onClick={() => onSelectPiece(piece.pieceId)} type="button">
            <strong>{pieceLabel(piece)}</strong>
            <span>{piece.pieceType.replaceAll("_", " ")}</span>
          </button>
          <div className="sanborn-piece-list__fields">
            <label>
              Type
              <select
                disabled={readOnly}
                value={piece.pieceType}
                onChange={(event) => onPatchPiece(piece.pieceId, { pieceType: event.target.value as SanbornMapPieceType })}
              >
                {sanbornMapPieceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Block number
              <input
                disabled={readOnly}
                value={piece.blockNumberText ?? ""}
                onChange={(event) => onPatchPiece(piece.pieceId, { blockNumberText: event.target.value })}
              />
            </label>
            <label>
              Title text
              <input
                disabled={readOnly}
                value={piece.titleText ?? ""}
                onChange={(event) => onPatchPiece(piece.pieceId, { titleText: event.target.value })}
              />
            </label>
            <label>
              Inventory
              <select
                disabled={readOnly}
                value={piece.inventoryStatus}
                onChange={(event) => onPatchPiece(piece.pieceId, { inventoryStatus: event.target.value as SanbornMapPieceInventoryStatus })}
              >
                {sanbornMapPieceInventoryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="sanborn-piece-list__notes">
              Notes
              <textarea disabled={readOnly} value={piece.notes ?? ""} onChange={(event) => onPatchPiece(piece.pieceId, { notes: event.target.value })} />
            </label>
          </div>
          <div className="sanborn-piece-list__actions">
            <button className="sanborn-button" disabled={readOnly || index === 0} onClick={() => onReorderPiece(piece.pieceId, "up")} type="button">
              Move up
            </button>
            <button className="sanborn-button" disabled={readOnly || index === sortedPieces.length - 1} onClick={() => onReorderPiece(piece.pieceId, "down")} type="button">
              Move down
            </button>
            <button className="sanborn-button" disabled={readOnly} onClick={() => onDeletePiece(piece.pieceId)} type="button">
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

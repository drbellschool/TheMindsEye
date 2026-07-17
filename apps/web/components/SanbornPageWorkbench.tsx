"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { SanbornPieceList } from "@/components/SanbornPieceList";
import {
  buildDefaultSanbornPieceId,
  calculateSourceBoundingBox,
  normalizedToPixelPoint,
  pixelToNormalizedPoint,
  type SanbornAtlasPageRecord,
  type SanbornMapPieceRecord,
  type SanbornNormalizedPoint,
} from "@/lib/sanborn-atlas";
import type { StudioSheetAsset } from "@/lib/historical-map-studio";

type SanbornPageWorkbenchProps = {
  page: SanbornAtlasPageRecord | null;
  asset: StudioSheetAsset | null;
  pieces: SanbornMapPieceRecord[];
  selectedPieceId: string;
  readOnly: boolean;
  onSelectPiece: (pieceId: string) => void;
  onPiecesChange: (pieces: SanbornMapPieceRecord[]) => void;
  onPatchPiece: (pieceId: string, patch: Partial<SanbornMapPieceRecord>) => void;
  onReorderPiece: (pieceId: string, direction: "up" | "down") => void;
  onDeletePiece: (pieceId: string) => void;
  onSavePieces: () => void;
};

type EditorMode = "select" | "draw" | "add_vertex";

function pointsToAttribute(points: SanbornNormalizedPoint[], width: number, height: number): string {
  return points
    .map((point) => normalizedToPixelPoint(point, width, height))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function getSvgPoint(event: ReactPointerEvent<SVGElement>, svg: SVGSVGElement | null, asset: StudioSheetAsset): SanbornNormalizedPoint | null {
  if (!svg) {
    return null;
  }

  const rect = svg.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = ((event.clientX - rect.left) / rect.width) * asset.width;
  const y = ((event.clientY - rect.top) / rect.height) * asset.height;

  return pixelToNormalizedPoint({ x, y, width: asset.width, height: asset.height });
}

function updatePiecePolygon(piece: SanbornMapPieceRecord, polygon: SanbornNormalizedPoint[]): SanbornMapPieceRecord {
  return {
    ...piece,
    sourcePolygon: polygon,
    sourceBBox: calculateSourceBoundingBox(polygon),
  };
}

function createPiece(page: SanbornAtlasPageRecord, sequence: number, points: SanbornNormalizedPoint[]): SanbornMapPieceRecord {
  const suffix = `${sequence}-${Date.now()}`;

  return {
    rowId: "",
    pieceId: buildDefaultSanbornPieceId({ pageId: page.pageId, pieceSequence: sequence, suffix }),
    atlasPageRowId: page.rowId,
    atlasPageId: page.pageId,
    parentPieceId: null,
    pieceSequence: sequence,
    pieceType: "unclassified_region",
    blockNumberText: null,
    titleText: null,
    sourcePolygon: points,
    sourceBBox: calculateSourceBoundingBox(points),
    creationMethod: "human",
    inventoryStatus: "draft",
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    notes: null,
    updatedAt: null,
    isPersisted: false,
  };
}

export function SanbornPageWorkbench({
  page,
  asset,
  pieces,
  selectedPieceId,
  readOnly,
  onSelectPiece,
  onPiecesChange,
  onPatchPiece,
  onReorderPiece,
  onDeletePiece,
  onSavePieces,
}: SanbornPageWorkbenchProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [draftPoints, setDraftPoints] = useState<SanbornNormalizedPoint[]>([]);
  const [draggingVertex, setDraggingVertex] = useState<{ pieceId: string; vertexIndex: number } | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const sortedPieces = useMemo(() => [...pieces].sort((left, right) => left.pieceSequence - right.pieceSequence), [pieces]);
  const selectedPiece = sortedPieces.find((piece) => piece.pieceId === selectedPieceId) ?? null;

  useEffect(() => {
    setSelectedVertexIndex(null);
    setDraggingVertex(null);
  }, [selectedPieceId]);

  if (!page || !asset) {
    return (
      <section className="sanborn-page-workbench">
        <p className="sanborn-atlas-empty">Select an atlas page to inspect its original source image and inventory map pieces.</p>
      </section>
    );
  }

  function patchPolygon(pieceId: string, polygon: SanbornNormalizedPoint[]) {
    onPiecesChange(
      sortedPieces.map((piece) => (piece.pieceId === pieceId ? updatePiecePolygon(piece, polygon) : piece)),
    );
  }

  function handleSvgPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (readOnly || !asset) {
      return;
    }

    const point = getSvgPoint(event, svgRef.current, asset);

    if (!point) {
      return;
    }

    if (editorMode === "draw") {
      setDraftPoints((current) => [...current, point]);
      return;
    }

    if (editorMode === "add_vertex" && selectedPiece) {
      patchPolygon(selectedPiece.pieceId, [...selectedPiece.sourcePolygon, point]);
      setSelectedVertexIndex(selectedPiece.sourcePolygon.length);
    }
  }

  function handleSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (readOnly || !draggingVertex || !asset) {
      return;
    }

    const point = getSvgPoint(event, svgRef.current, asset);

    if (!point) {
      return;
    }

    const piece = sortedPieces.find((candidate) => candidate.pieceId === draggingVertex.pieceId);

    if (!piece) {
      return;
    }

    const polygon = piece.sourcePolygon.map((candidate, index) => (index === draggingVertex.vertexIndex ? point : candidate));
    patchPolygon(piece.pieceId, polygon);
  }

  function finishDraft() {
    if (!page || draftPoints.length < 3) {
      return;
    }

    const nextSequence = Math.max(0, ...sortedPieces.map((piece) => piece.pieceSequence)) + 1;
    const nextPiece = createPiece(page, nextSequence, draftPoints);
    onPiecesChange([...sortedPieces, nextPiece]);
    onSelectPiece(nextPiece.pieceId);
    setDraftPoints([]);
    setEditorMode("select");
  }

  function removeSelectedVertex() {
    if (!selectedPiece || selectedVertexIndex === null || selectedPiece.sourcePolygon.length <= 3) {
      return;
    }

    patchPolygon(
      selectedPiece.pieceId,
      selectedPiece.sourcePolygon.filter((_, index) => index !== selectedVertexIndex),
    );
    setSelectedVertexIndex(null);
  }

  function clearDraft() {
    setDraftPoints([]);
    setEditorMode("select");
  }

  return (
    <section className="sanborn-page-workbench">
      <div className="sanborn-page-workbench__source">
        <header className="sanborn-page-workbench__header">
          <div>
            <strong>{page.displayLabel || `Page ${page.pageSequence}`}</strong>
            <span>{page.pageType.replaceAll("_", " ")}</span>
          </div>
          <div className="sanborn-page-workbench__tools" role="group" aria-label="Map piece editor">
            <button className={`sanborn-button${editorMode === "select" ? " sanborn-button--primary" : ""}`} onClick={() => setEditorMode("select")} type="button">
              Select
            </button>
            <button className={`sanborn-button${editorMode === "draw" ? " sanborn-button--primary" : ""}`} disabled={readOnly} onClick={() => setEditorMode("draw")} type="button">
              Draw piece
            </button>
            <button className={`sanborn-button${editorMode === "add_vertex" ? " sanborn-button--primary" : ""}`} disabled={readOnly || !selectedPiece} onClick={() => setEditorMode("add_vertex")} type="button">
              Add vertex
            </button>
            <button className="sanborn-button" disabled={readOnly || !selectedPiece || selectedVertexIndex === null || selectedPiece.sourcePolygon.length <= 3} onClick={removeSelectedVertex} type="button">
              Remove vertex
            </button>
            <button className="sanborn-button sanborn-button--primary" disabled={readOnly || draftPoints.length < 3} onClick={finishDraft} type="button">
              Finish polygon
            </button>
            <button className="sanborn-button" disabled={readOnly || draftPoints.length === 0} onClick={clearDraft} type="button">
              Clear draft
            </button>
            <button className="sanborn-button sanborn-button--primary" disabled={readOnly || !page} onClick={onSavePieces} type="button">
              Save pieces
            </button>
          </div>
        </header>
        <div className="sanborn-page-workbench__image-frame">
          {asset.signedUrl ? (
            <img alt={asset.originalFilename} src={asset.signedUrl} />
          ) : (
            <div className="sanborn-page-workbench__image-missing">Signed source image unavailable.</div>
          )}
          <svg
            aria-label="Manual Sanborn map piece polygon editor"
            className="sanborn-page-workbench__overlay"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={() => setDraggingVertex(null)}
            preserveAspectRatio="none"
            ref={svgRef}
            viewBox={`0 0 ${asset.width} ${asset.height}`}
          >
            {sortedPieces.map((piece) => {
              const selected = piece.pieceId === selectedPieceId;
              const points = pointsToAttribute(piece.sourcePolygon, asset.width, asset.height);

              return (
                <g key={piece.pieceId}>
                  <polygon
                    className={`sanborn-page-workbench__polygon${selected ? " is-selected" : ""}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectPiece(piece.pieceId);
                      setEditorMode("select");
                    }}
                    points={points}
                  />
                  {selected
                    ? piece.sourcePolygon.map((point, index) => {
                        const pixel = normalizedToPixelPoint(point, asset.width, asset.height);
                        return (
                          <circle
                            className={`sanborn-page-workbench__vertex${selectedVertexIndex === index ? " is-selected" : ""}`}
                            cx={pixel.x}
                            cy={pixel.y}
                            key={`${piece.pieceId}-${index}`}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onSelectPiece(piece.pieceId);
                              setSelectedVertexIndex(index);
                              setDraggingVertex({ pieceId: piece.pieceId, vertexIndex: index });
                            }}
                            r={10}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}
            {draftPoints.length > 0 ? (
              <>
                <polyline className="sanborn-page-workbench__draft" points={pointsToAttribute(draftPoints, asset.width, asset.height)} />
                {draftPoints.map((point, index) => {
                  const pixel = normalizedToPixelPoint(point, asset.width, asset.height);
                  return <circle className="sanborn-page-workbench__draft-point" cx={pixel.x} cy={pixel.y} key={`${point.x}-${point.y}-${index}`} r={8} />;
                })}
              </>
            ) : null}
          </svg>
        </div>
      </div>

      <aside className="sanborn-page-workbench__pieces">
        <SanbornPieceList
          pieces={sortedPieces}
          selectedPieceId={selectedPieceId}
          readOnly={readOnly}
          onDeletePiece={onDeletePiece}
          onPatchPiece={onPatchPiece}
          onReorderPiece={onReorderPiece}
          onSelectPiece={onSelectPiece}
        />
      </aside>
    </section>
  );
}

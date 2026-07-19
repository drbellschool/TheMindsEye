"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

import { SanbornPieceList } from "@/components/SanbornPieceList";
import {
  buildDefaultSanbornPieceId,
  calculateSourceBoundingBox,
  getSanbornPageTypeLabel,
  normalizedToPixelPoint,
  pixelToNormalizedPoint,
  type SanbornAtlasPageRecord,
  type SanbornMapPieceRecord,
  type SanbornNormalizedPoint,
} from "@/lib/sanborn-atlas";
import type { StudioSheetAsset } from "@/lib/historical-map-studio";
import {
  clampSanbornSourceImageZoom,
  getSanbornSourceImagePanDelta,
  planFitSelectedSanbornPolygon,
  stepSanbornSourceImageZoom,
} from "@/lib/sanborn-source-image-viewport";

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
  onSavePagesAndContinue?: () => void;
  savePagesAndContinueDisabled?: boolean;
  showPieceList?: boolean;
  classificationBlockedMessage?: string;
  repairClassificationAction?: ReactNode;
};

type EditorMode = "select" | "draw" | "add_vertex" | "pan";

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
  onSavePagesAndContinue,
  savePagesAndContinueDisabled = false,
  showPieceList = true,
  classificationBlockedMessage = "",
  repairClassificationAction = null,
}: SanbornPageWorkbenchProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [draftPoints, setDraftPoints] = useState<SanbornNormalizedPoint[]>([]);
  const [draggingVertex, setDraggingVertex] = useState<{ pieceId: string; vertexIndex: number } | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [sourceZoom, setSourceZoom] = useState(1);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [panDrag, setPanDrag] = useState<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const sortedPieces = useMemo(() => [...pieces].sort((left, right) => left.pieceSequence - right.pieceSequence), [pieces]);
  const selectedPiece = sortedPieces.find((piece) => piece.pieceId === selectedPieceId) ?? null;
  const pieceInventoryBlocked = Boolean(page && !page.isPersisted);
  const classificationBlocked = Boolean(classificationBlockedMessage);
  const editorReadOnly = readOnly || pieceInventoryBlocked || classificationBlocked;
  const panActive = editorMode === "pan" || spacePanActive;
  const disabledToolReason = pieceInventoryBlocked
    ? "Save the atlas page assignments before drawing map pieces."
    : classificationBlocked
      ? classificationBlockedMessage
      : readOnly
        ? "Map piece editing is read-only."
        : undefined;

  useEffect(() => {
    setSelectedVertexIndex(null);
    setDraggingVertex(null);
  }, [selectedPieceId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        setSpacePanActive(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePanActive(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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
    if (editorReadOnly || !asset || panActive || event.button !== 0) {
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
    if (editorReadOnly || !draggingVertex || !asset || panActive) {
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
    if (editorReadOnly || !page || draftPoints.length < 3) {
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
    if (editorReadOnly || !selectedPiece || selectedVertexIndex === null || selectedPiece.sourcePolygon.length <= 3) {
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

  function zoomSourceImage(direction: "in" | "out") {
    setSourceZoom((current) => stepSanbornSourceImageZoom(current, direction));
  }

  function setSourceImageZoom(nextZoom: number) {
    setSourceZoom(clampSanbornSourceImageZoom(nextZoom));
  }

  function resetSourceImageView() {
    setSourceZoom(1);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }

  function fitSelectedPiece() {
    if (!selectedPiece || !asset || !viewportRef.current) {
      return;
    }

    const viewport = viewportRef.current;
    const baseWidth = Math.max(1, viewport.clientWidth);
    const baseHeight = Math.max(1, baseWidth * (asset.height / Math.max(1, asset.width)));
    const plan = planFitSelectedSanbornPolygon({
      polygon: selectedPiece.sourcePolygon,
      imageWidth: baseWidth,
      imageHeight: baseHeight,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
    });

    if (!plan) {
      return;
    }

    setSourceZoom(plan.zoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = plan.scrollLeft;
      viewport.scrollTop = plan.scrollTop;
    });
  }

  function handleViewportWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const viewport = event.currentTarget;
    const rect = viewport.getBoundingClientRect();
    const wheelStep = event.ctrlKey || event.metaKey ? 1.12 : 1.1;
    const nextZoom = stepSanbornSourceImageZoom(sourceZoom, event.deltaY < 0 ? "in" : "out", wheelStep);
    const zoomRatio = nextZoom / sourceZoom;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    setSourceZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = (viewport.scrollLeft + localX) * zoomRatio - localX;
      viewport.scrollTop = (viewport.scrollTop + localY) * zoomRatio - localY;
    });
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panActive && event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanDrag({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    });
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panDrag || panDrag.pointerId !== event.pointerId) {
      return;
    }

    const delta = getSanbornSourceImagePanDelta({
      startClientX: panDrag.startClientX,
      startClientY: panDrag.startClientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
    });

    event.currentTarget.scrollLeft = panDrag.scrollLeft - delta.deltaX;
    event.currentTarget.scrollTop = panDrag.scrollTop - delta.deltaY;
  }

  function endViewportPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panDrag?.pointerId === event.pointerId) {
      setPanDrag(null);
    }
  }

  function handleViewportKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomSourceImage("in");
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      zoomSourceImage("out");
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      setSourceImageZoom(1);
    }
  }

  return (
    <section className={`sanborn-page-workbench${showPieceList ? "" : " sanborn-page-workbench--center-only"}`}>
      <div className="sanborn-page-workbench__source">
        <header className="sanborn-page-workbench__header">
          <div>
            <strong>{page.displayLabel || `Page ${page.pageSequence}`}</strong>
            <span>{getSanbornPageTypeLabel(page.pageType)}</span>
          </div>
          <div className="sanborn-page-workbench__tools" role="group" aria-label="Map piece editor">
            <button className={`sanborn-button${editorMode === "select" ? " sanborn-button--primary" : ""}`} onClick={() => setEditorMode("select")} type="button">
              Select
            </button>
            <button className={`sanborn-button${editorMode === "pan" ? " sanborn-button--primary" : ""}`} onClick={() => setEditorMode("pan")} type="button">
              Pan
            </button>
            <button className={`sanborn-button${editorMode === "draw" ? " sanborn-button--primary" : ""}`} disabled={editorReadOnly} onClick={() => setEditorMode("draw")} title={disabledToolReason} type="button">
              Draw piece
            </button>
            <button className={`sanborn-button${editorMode === "add_vertex" ? " sanborn-button--primary" : ""}`} disabled={editorReadOnly || !selectedPiece} onClick={() => setEditorMode("add_vertex")} title={!selectedPiece ? "Select a map piece before adding a vertex." : disabledToolReason} type="button">
              Add vertex
            </button>
            <button className="sanborn-button" disabled={editorReadOnly || !selectedPiece || selectedVertexIndex === null || selectedPiece.sourcePolygon.length <= 3} onClick={removeSelectedVertex} title={disabledToolReason} type="button">
              Remove vertex
            </button>
            <button className="sanborn-button sanborn-button--primary" disabled={editorReadOnly || draftPoints.length < 3} onClick={finishDraft} title={disabledToolReason} type="button">
              Finish polygon
            </button>
            <button className="sanborn-button" disabled={editorReadOnly || draftPoints.length === 0} onClick={clearDraft} title={disabledToolReason} type="button">
              Clear draft
            </button>
            <button className="sanborn-button sanborn-button--primary" disabled={editorReadOnly || !page} onClick={onSavePieces} title={disabledToolReason} type="button">
              Save pieces
            </button>
            <button className="sanborn-button" onClick={() => zoomSourceImage("out")} type="button">Zoom out</button>
            <button className="sanborn-button" onClick={() => zoomSourceImage("in")} type="button">Zoom in</button>
            <button className="sanborn-button" onClick={() => setSourceImageZoom(1)} type="button">100%</button>
            <button className="sanborn-button" onClick={resetSourceImageView} type="button">Fit image</button>
            <button className="sanborn-button" onClick={resetSourceImageView} type="button">Reset view</button>
            <button className="sanborn-button" disabled={!selectedPiece} onClick={fitSelectedPiece} type="button">Fit selected piece</button>
            <span className="sanborn-page-workbench__zoom" aria-live="polite">{Math.round(sourceZoom * 100)}%</span>
          </div>
        </header>
        {pieceInventoryBlocked ? (
          <div className="sanborn-page-workbench__blocker">
            <strong>Save the atlas page assignments before drawing map pieces.</strong>
            <button className="sanborn-button sanborn-button--primary" disabled={savePagesAndContinueDisabled || !onSavePagesAndContinue} onClick={onSavePagesAndContinue} type="button">
              Save pages and continue
            </button>
          </div>
        ) : null}
        {classificationBlocked ? (
          <div className="sanborn-page-workbench__blocker">
            <strong>{classificationBlockedMessage}</strong>
            {repairClassificationAction}
          </div>
        ) : null}
        <div
          className={`sanborn-page-workbench__viewport${panActive || panDrag ? " is-panning" : ""}`}
          onPointerCancel={endViewportPan}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={endViewportPan}
          onKeyDown={handleViewportKeyDown}
          onWheel={handleViewportWheel}
          ref={viewportRef}
          tabIndex={0}
        >
          <div className="sanborn-page-workbench__image-frame" style={{ width: `${sourceZoom * 100}%` }}>
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
                        if (panActive) {
                          return;
                        }
                        if (event.button !== 0) {
                          return;
                        }
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
                                if (panActive) {
                                  return;
                                }
                                if (event.button !== 0) {
                                  return;
                                }
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
      </div>

      {showPieceList ? (
        <aside className="sanborn-page-workbench__pieces">
          <SanbornPieceList
            pieces={sortedPieces}
            selectedPieceId={selectedPieceId}
            readOnly={editorReadOnly}
            onDeletePiece={onDeletePiece}
            onPatchPiece={onPatchPiece}
            onReorderPiece={onReorderPiece}
            onSelectPiece={onSelectPiece}
          />
        </aside>
      ) : null}
    </section>
  );
}

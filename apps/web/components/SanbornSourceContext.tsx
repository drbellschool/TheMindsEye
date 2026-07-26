"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import { SanbornSourceImageStatus, useSanbornSourceImageState } from "@/components/SanbornSourceImage";
import { buildSanbornSourceContextViewport, normalizedPointToSourceContextPoint, panSanbornSourceContextViewport, type SanbornSourceContextViewport } from "@/lib/sanborn-source-context";
import type { SanbornMapPieceRecord } from "@/lib/sanborn-atlas";
import type { StudioSheetAsset } from "@/lib/historical-map-studio";
import { formatMapPiecePlacementLabel } from "@/lib/map-piece-label";

type SanbornSourceContextProps = {
  piece: SanbornMapPieceRecord | null;
  asset: StudioSheetAsset | null;
  sourceLabel: string;
};

export function SanbornSourceContext({ piece, asset, sourceLabel }: SanbornSourceContextProps) {
  const [hidden, setHidden] = useState(false);
  const [manualViewport, setManualViewport] = useState<{ key: string; viewport: SanbornSourceContextViewport } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; viewport: SanbornSourceContextViewport } | null>(null);
  const sourceImage = useSanbornSourceImageState({ asset });
  const automaticViewport = piece && asset ? buildSanbornSourceContextViewport({
    sourceGeometry: piece.sourceGeometry,
    sourcePolygon: piece.sourcePolygon,
    sourceBBox: piece.sourceBBox,
    imageWidth: asset.width,
    imageHeight: asset.height,
  }) : null;
  const viewportKey = `${piece?.pieceId ?? ""}:${asset?.assetId ?? ""}:${asset?.signedUrl ?? ""}`;
  const viewport = manualViewport?.key === viewportKey ? manualViewport.viewport : automaticViewport;
  const points = piece?.sourceGeometry?.points ?? piece?.sourcePolygon ?? [];
  const overlayPoints = viewport && asset
    ? points.map((point) => normalizedPointToSourceContextPoint(point, viewport, asset.width, asset.height)).map((point) => `${point.x * viewport.width},${point.y * viewport.height}`).join(" ")
    : "";

  useEffect(() => {
    setHidden(window.sessionStorage.getItem("mindseye-source-context-hidden") === "true");
  }, []);

  useEffect(() => {
    setManualViewport(null);
    dragRef.current = null;
  }, [viewportKey]);

  function toggleHidden(value: boolean) {
    setHidden(value);
    window.sessionStorage.setItem("mindseye-source-context-hidden", String(value));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!viewport || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewport };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport || !asset) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = (event.clientX - drag.startX) * viewport.width / Math.max(1, rect.width);
    const deltaY = (event.clientY - drag.startY) * viewport.height / Math.max(1, rect.height);
    setManualViewport({
      key: viewportKey,
      viewport: panSanbornSourceContextViewport(drag.viewport, deltaX, deltaY, asset.width, asset.height),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resetView() {
    dragRef.current = null;
    setManualViewport(null);
  }

  if (!piece || !asset || !viewport) return null;
  if (hidden) {
    return <button className="sanborn-source-context__show sanborn-button" onClick={() => toggleHidden(false)} type="button">Show source context</button>;
  }

  return (
    <aside className="sanborn-source-context" aria-label="Source context">
      <header className="sanborn-source-context__header">
        <div><span>SOURCE CONTEXT</span><strong>{formatMapPiecePlacementLabel(piece)}</strong><small>{sourceLabel}</small></div>
        <div className="sanborn-source-context__actions">
          <button aria-label="Reset source context view" className="sanborn-source-context__reset" onClick={resetView} type="button">Reset view</button>
          <button aria-label="Hide source context" className="sanborn-source-context__hide" onClick={() => toggleHidden(true)} type="button">Hide</button>
        </div>
      </header>
      <div className={`sanborn-source-context__viewport is-${sourceImage.state}`} onPointerCancel={handlePointerUp} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} style={{ aspectRatio: viewport.aspectRatio }}>
        {asset.signedUrl ? (
          <svg aria-label={`Source context for ${formatMapPiecePlacementLabel(piece)}`} className="sanborn-source-context__svg" preserveAspectRatio="none" role="img" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
            <image className="sanborn-source-context__image" href={asset.signedUrl} height={asset.height} key={sourceImage.imageKey} onError={sourceImage.onError} onLoad={sourceImage.onLoad} preserveAspectRatio="xMidYMid slice" width={asset.width} x={-viewport.x} y={-viewport.y} />
            {sourceImage.isLoaded && overlayPoints ? <polygon className="sanborn-source-context__highlight" points={overlayPoints} /> : null}
          </svg>
        ) : null}
        <SanbornSourceImageStatus filename={asset.originalFilename} onRetry={sourceImage.retryImage} state={sourceImage.state} />
      </div>
      <small className="sanborn-source-context__filename">{asset.originalFilename}</small>
    </aside>
  );
}

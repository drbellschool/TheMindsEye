"use client";

import { useEffect, useState } from "react";

import { SanbornSourceImageStatus, useSanbornSourceImageState } from "@/components/SanbornSourceImage";
import { buildSanbornSourceContextViewport, normalizedPointToSourceContextPoint } from "@/lib/sanborn-source-context";
import type { SanbornMapPieceRecord } from "@/lib/sanborn-atlas";
import type { StudioSheetAsset } from "@/lib/historical-map-studio";

type SanbornSourceContextProps = {
  piece: SanbornMapPieceRecord | null;
  asset: StudioSheetAsset | null;
  sourceLabel: string;
};

export function SanbornSourceContext({ piece, asset, sourceLabel }: SanbornSourceContextProps) {
  const [hidden, setHidden] = useState(false);
  const sourceImage = useSanbornSourceImageState({ asset });
  const viewport = piece && asset ? buildSanbornSourceContextViewport({
    sourceGeometry: piece.sourceGeometry,
    sourcePolygon: piece.sourcePolygon,
    sourceBBox: piece.sourceBBox,
    imageWidth: asset.width,
    imageHeight: asset.height,
  }) : null;
  const points = piece?.sourceGeometry?.points ?? piece?.sourcePolygon ?? [];
  const overlayPoints = viewport && asset
    ? points.map((point) => normalizedPointToSourceContextPoint(point, viewport, asset.width, asset.height)).map((point) => `${point.x * viewport.width},${point.y * viewport.height}`).join(" ")
    : "";

  useEffect(() => {
    setHidden(window.sessionStorage.getItem("mindseye-source-context-hidden") === "true");
  }, []);

  function toggleHidden(value: boolean) {
    setHidden(value);
    window.sessionStorage.setItem("mindseye-source-context-hidden", String(value));
  }

  if (!piece || !asset || !viewport) return null;
  if (hidden) {
    return <button className="sanborn-source-context__show sanborn-button" onClick={() => toggleHidden(false)} type="button">Show source context</button>;
  }

  return (
    <aside className="sanborn-source-context" aria-label="Source context">
      <header className="sanborn-source-context__header">
        <div><span>SOURCE CONTEXT</span><strong>{piece.titleText || piece.blockNumberText || sourceLabel}</strong><small>{sourceLabel}</small></div>
        <button aria-label="Hide source context" className="sanborn-source-context__hide" onClick={() => toggleHidden(true)} type="button">Hide</button>
      </header>
      <div className={`sanborn-source-context__viewport is-${sourceImage.state}`} style={{ aspectRatio: viewport.aspectRatio }}>
        {asset.signedUrl ? (
          <svg aria-label={`Source context for ${piece.titleText || piece.blockNumberText || sourceLabel}`} className="sanborn-source-context__svg" preserveAspectRatio="none" role="img" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
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

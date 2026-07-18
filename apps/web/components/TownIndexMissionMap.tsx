"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { StudioSheetAsset } from "@/lib/historical-map-studio";
import {
  normalizedToPixelPoint,
  pixelToNormalizedPoint,
  type SanbornAtlasPageRecord,
  type SanbornNormalizedPoint,
} from "@/lib/sanborn-atlas";
import {
  sanbornTownIndexStatuses,
  validateTownIndexRegionPolygon,
  type SanbornTownIndexRegionRecord,
  type SanbornTownIndexStatus,
} from "@/lib/sanborn-town-index";

export type TownIndexMissionMapMode = "select" | "draw" | "move";

type TownIndexMissionMapProps = {
  indexPage: SanbornAtlasPageRecord | null;
  indexAsset: StudioSheetAsset | null;
  regions: SanbornTownIndexRegionRecord[];
  selectedRegionId: string;
  mode: TownIndexMissionMapMode;
  draftPoints: SanbornNormalizedPoint[];
  readOnly: boolean;
  onSelectRegion: (regionId: string) => void;
  onDraftPointsChange: (points: SanbornNormalizedPoint[]) => void;
  onUpdateRegionPolygon: (regionId: string, polygon: SanbornNormalizedPoint[]) => void;
  onOpenLinkedRegion: (region: SanbornTownIndexRegionRecord) => void;
};

const statusLabels: Record<SanbornTownIndexStatus, string> = {
  missing: "Missing",
  not_started: "Not started",
  started: "Started",
  placed: "Placed",
  reviewed: "Reviewed",
  conflict: "Conflict",
};

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function centroid(points: SanbornNormalizedPoint[]): SanbornNormalizedPoint {
  const sum = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: points.length > 0 ? sum.x / points.length : 0.5,
    y: points.length > 0 ? sum.y / points.length : 0.5,
  };
}

function movePolygon(points: SanbornNormalizedPoint[], delta: SanbornNormalizedPoint): SanbornNormalizedPoint[] {
  return points.map((point) => ({
    x: clamp01(point.x + delta.x),
    y: clamp01(point.y + delta.y),
  }));
}

export function TownIndexMissionMap({
  indexPage,
  indexAsset,
  regions,
  selectedRegionId,
  mode,
  draftPoints,
  readOnly,
  onSelectRegion,
  onDraftPointsChange,
  onUpdateRegionPolygon,
  onOpenLinkedRegion,
}: TownIndexMissionMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<{ regionId: string; vertexIndex: number } | null>(null);
  const [draggingRegion, setDraggingRegion] = useState<{ regionId: string; start: SanbornNormalizedPoint; original: SanbornNormalizedPoint[] } | null>(null);
  const selectedRegion = regions.find((region) => region.regionId === selectedRegionId) ?? null;
  const sortedRegions = useMemo(
    () => [...regions].sort((left, right) => left.regionLabel.localeCompare(right.regionLabel) || left.regionId.localeCompare(right.regionId)),
    [regions],
  );

  if (!indexPage || !indexAsset) {
    return (
      <section className="town-index-mission-map">
        <div className="town-index-mission-map__empty">
          <strong>No Town Index page is designated.</strong>
          <span>Mark an atlas page as graphic index, street index, or specials index before drawing index regions.</span>
        </div>
      </section>
    );
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (readOnly || mode !== "draw" || !indexAsset) {
      return;
    }

    const point = getSvgPoint(event, svgRef.current, indexAsset);

    if (point) {
      onDraftPointsChange([...draftPoints, point]);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (readOnly || !indexAsset) {
      return;
    }

    const point = getSvgPoint(event, svgRef.current, indexAsset);

    if (!point) {
      return;
    }

    if (draggingVertex) {
      const region = regions.find((candidate) => candidate.regionId === draggingVertex.regionId);
      if (!region) return;

      const nextPolygon = region.sourcePolygon.map((candidate, index) => (index === draggingVertex.vertexIndex ? point : candidate));
      if (validateTownIndexRegionPolygon(nextPolygon).ok) {
        onUpdateRegionPolygon(region.regionId, nextPolygon);
      }
      return;
    }

    if (draggingRegion) {
      const delta = { x: point.x - draggingRegion.start.x, y: point.y - draggingRegion.start.y };
      const nextPolygon = movePolygon(draggingRegion.original, delta);
      if (validateTownIndexRegionPolygon(nextPolygon).ok) {
        onUpdateRegionPolygon(draggingRegion.regionId, nextPolygon);
      }
    }
  }

  function finishPointerInteraction() {
    setDraggingVertex(null);
    setDraggingRegion(null);
  }

  return (
    <section className="town-index-mission-map" aria-label="Town Index mission map">
      <header className="town-index-mission-map__header">
        <div>
          <strong>{indexPage.displayLabel || `Index page ${indexPage.pageSequence}`}</strong>
          <span>{indexAsset.originalFilename}</span>
        </div>
        <div className="town-index-mission-map__mode" aria-live="polite">
          {mode === "draw" ? "Add region: click points, then close from the inspector." : mode === "move" ? "Move region" : "Select region"}
        </div>
      </header>

      <div className="town-index-mission-map__frame">
        {indexAsset.signedUrl ? (
          <img alt={`Town Index source page ${indexPage.displayLabel || indexPage.pageSequence}`} src={indexAsset.signedUrl} />
        ) : (
          <div className="town-index-mission-map__missing-image">Signed index image unavailable.</div>
        )}
        <svg
          aria-label="Manual Town Index region editor"
          className="town-index-mission-map__overlay"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerInteraction}
          onPointerLeave={finishPointerInteraction}
          preserveAspectRatio="none"
          ref={svgRef}
          viewBox={`0 0 ${indexAsset.width} ${indexAsset.height}`}
        >
          {sortedRegions.map((region) => {
            const selected = region.regionId === selectedRegionId;
            const center = centroid(region.sourcePolygon);
            const centerPixel = normalizedToPixelPoint(center, indexAsset.width, indexAsset.height);
            const status = region.progressStatus;

            return (
              <g className={`town-index-region is-${status}${selected ? " is-selected" : ""}`} key={region.regionId}>
                <polygon
                  aria-label={`${region.regionLabel || region.sheetReference || "Unlabeled region"}: ${statusLabels[status]}`}
                  className="town-index-region__polygon"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectRegion(region.regionId);
                    if (mode === "select" && (region.linkedAtlasPageId || region.linkedSheetAssetId)) {
                      onOpenLinkedRegion(region);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    onSelectRegion(region.regionId);
                    if (mode === "select" && (region.linkedAtlasPageId || region.linkedSheetAssetId)) {
                      onOpenLinkedRegion(region);
                    }
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectRegion(region.regionId);
                    if (!readOnly && mode === "move") {
                      const point = getSvgPoint(event, svgRef.current, indexAsset);
                      if (point) {
                        setDraggingRegion({ regionId: region.regionId, start: point, original: region.sourcePolygon });
                      }
                    }
                  }}
                  points={pointsToAttribute(region.sourcePolygon, indexAsset.width, indexAsset.height)}
                  role="button"
                  tabIndex={0}
                />
                <text className="town-index-region__label" x={centerPixel.x} y={centerPixel.y}>
                  {region.sheetReference || region.regionLabel || "?"}
                </text>
                {selected
                  ? region.sourcePolygon.map((point, index) => {
                      const pixel = normalizedToPixelPoint(point, indexAsset.width, indexAsset.height);
                      return (
                        <circle
                          className="town-index-region__vertex"
                          cx={pixel.x}
                          cy={pixel.y}
                          key={`${region.regionId}-${index}`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            onSelectRegion(region.regionId);
                            if (!readOnly) {
                              setDraggingVertex({ regionId: region.regionId, vertexIndex: index });
                            }
                          }}
                          r={9}
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
          {draftPoints.length > 0 ? (
            <>
              <polyline className="town-index-region__draft" points={pointsToAttribute(draftPoints, indexAsset.width, indexAsset.height)} />
              {draftPoints.map((point, index) => {
                const pixel = normalizedToPixelPoint(point, indexAsset.width, indexAsset.height);
                return <circle className="town-index-region__draft-point" cx={pixel.x} cy={pixel.y} key={`${point.x}-${point.y}-${index}`} r={7} />;
              })}
            </>
          ) : null}
        </svg>
      </div>

      <footer className="town-index-mission-map__legend" aria-label="Town Index status legend">
        {sanbornTownIndexStatuses.map((status) => (
          <span className={`town-index-mission-map__legend-item is-${status}`} key={status}>
            <i aria-hidden="true" />
            {statusLabels[status]}
          </span>
        ))}
      </footer>

      {selectedRegion ? (
        <p className="town-index-mission-map__selection">
          Selected: {selectedRegion.regionLabel || selectedRegion.sheetReference || "Unlabeled region"} - {statusLabels[selectedRegion.progressStatus]}
        </p>
      ) : null}
    </section>
  );
}

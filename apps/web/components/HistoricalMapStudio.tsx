"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import { HistoricalMapLeaflet, basemaps } from "@/components/HistoricalMapLeaflet";
import {
  buildInitialHistory,
  findDuplicateStudioSheetNumbers,
  findMissingStudioSheetNumbers,
  getWorkspaceStatus,
  pushStudioHistory,
  redoStudioHistory,
  reorderPlacement,
  shouldIgnoreStudioShortcut,
  studioAutosaveDelayMs,
  undoStudioHistory,
  updatePlacement,
  type HistoricalMapStudioState,
  type StudioHistoryState,
  type StudioPlacement,
  type StudioPresentState,
  type StudioSaveStatus,
  type StudioSheetAsset,
  type StudioViewport,
} from "@/lib/historical-map-studio";
import { reviewStatuses } from "@/lib/community-status";
import {
  boundsFromCorners,
  calculateAffineTransform,
  clampOverlayOpacity,
  createDefaultGeoCorners,
  deriveGeoreferenceStatus,
  getCompleteControlPoints,
  normalizeControlPoint,
  translateControlPointGeography,
  translateGeoCorners,
  type GeoBounds,
  type GeoCoordinate,
  type GeoCorners,
  type HistoricalMapControlPoint,
  type HistoricalMapGeoreference,
} from "@/lib/historical-map-georeference";
import { formatBytes } from "@/lib/sanborn-intake";

type UploadStatus = {
  filename: string;
  status: "uploading" | "saved" | "failed";
  message: string;
};

type MetadataDraft = {
  sheetNumber: string;
  sourceRecordId: string;
  sourceUrl: string;
  archiveName: string;
  rightsNote: string;
  intakeNotes: string;
  evidenceClassification: string;
  reviewStatus: string;
};

type StudioWorkspaceMode = "stitching" | "georeferencing" | "modern_overlay";

type GeoreferenceDraft = {
  targetType: "sheet" | "workspace";
  targetAssetId: string | null;
  corners: GeoCorners;
  bounds: GeoBounds | null;
  controlPoints: HistoricalMapControlPoint[];
  selectedControlPointId: string;
  selectedBasemap: string;
  overlayOpacity: number;
  overlayVisible: boolean;
  showControlPoints: boolean;
  showSheetBoundaries: boolean;
  notes: string;
  status: string;
};

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Unavailable";
}

function createPresentFromState(studioState: HistoricalMapStudioState): StudioPresentState {
  return {
    viewport: studioState.workspace?.viewport ?? { x: 0, y: 0, scale: 1 },
    placements: studioState.placements,
  };
}

function createMetadataDraft(asset: StudioSheetAsset | null): MetadataDraft {
  return {
    sheetNumber: asset?.sheetNumber ? String(asset.sheetNumber) : "",
    sourceRecordId: asset?.sourceRecordId ?? "",
    sourceUrl: asset?.sourceUrl ?? "",
    archiveName: asset?.archiveName ?? "",
    rightsNote: asset?.rightsNote ?? "",
    intakeNotes: asset?.intakeNotes ?? "",
    evidenceClassification: asset?.evidenceClassification ?? "unknown",
    reviewStatus: asset?.reviewStatus ?? "unknown",
  };
}

function getDefaultTownCenter(studioState: HistoricalMapStudioState): GeoCoordinate {
  const existingGeoreference = studioState.georeferences.find((georeference) => georeference.bounds);

  if (existingGeoreference?.bounds) {
    return {
      latitude: (existingGeoreference.bounds.northLatitude + existingGeoreference.bounds.southLatitude) / 2,
      longitude: (existingGeoreference.bounds.eastLongitude + existingGeoreference.bounds.westLongitude) / 2,
    };
  }

  if (studioState.activeTownPackage?.packageId.toLowerCase().includes("texarkana")) {
    return { latitude: 33.4251, longitude: -94.0477 };
  }

  return { latitude: 0, longitude: 0 };
}

function createGeoreferenceDraft(studioState: HistoricalMapStudioState, targetAssetId: string | null): GeoreferenceDraft {
  const saved =
    studioState.georeferences.find((georeference) => georeference.targetType === "sheet" && georeference.targetAssetId === targetAssetId) ??
    studioState.georeferences.find((georeference) => georeference.targetType === "workspace" && !targetAssetId) ??
    null;
  const corners = saved?.corners ?? createDefaultGeoCorners(getDefaultTownCenter(studioState));
  const bounds = saved?.bounds ?? boundsFromCorners(corners);

  return {
    targetType: targetAssetId ? "sheet" : "workspace",
    targetAssetId,
    corners,
    bounds,
    controlPoints: saved?.controlPoints ?? [],
    selectedControlPointId: saved?.controlPoints[0]?.controlPointId ?? "",
    selectedBasemap: saved?.selectedBasemap ?? studioState.selectedBasemap,
    overlayOpacity: clampOverlayOpacity(saved?.overlayOpacity ?? studioState.overlayOpacity),
    overlayVisible: saved?.overlayVisible ?? studioState.overlayVisible,
    showControlPoints: saved?.showControlPoints ?? true,
    showSheetBoundaries: saved?.showSheetBoundaries ?? true,
    notes: saved?.notes ?? "",
    status: saved?.status ?? "not_started",
  };
}

function updateDraftPoint(points: HistoricalMapControlPoint[], controlPointId: string, patch: Partial<HistoricalMapControlPoint>) {
  return points.map((point) => (point.controlPointId === controlPointId ? normalizeControlPoint({ ...point, ...patch, controlPointId }) : point));
}

function formatCoordinate(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(6) : "unavailable";
}

function getPlacementBounds(assets: StudioSheetAsset[], placements: StudioPlacement[]) {
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const visiblePlacements = placements.filter((placement) => placement.isVisible);

  if (visiblePlacements.length === 0) {
    return null;
  }

  const boxes = visiblePlacements
    .map((placement) => {
      const asset = assetById.get(placement.assetId);

      if (!asset) {
        return null;
      }

      return {
        x1: placement.x,
        y1: placement.y,
        x2: placement.x + asset.width * placement.scaleX,
        y2: placement.y + asset.height * placement.scaleY,
      };
    })
    .filter((box): box is { x1: number; y1: number; x2: number; y2: number } => Boolean(box));

  if (boxes.length === 0) {
    return null;
  }

  return {
    x1: Math.min(...boxes.map((box) => box.x1)),
    y1: Math.min(...boxes.map((box) => box.y1)),
    x2: Math.max(...boxes.map((box) => box.x2)),
    y2: Math.max(...boxes.map((box) => box.y2)),
  };
}

function getRotatedCorners(placement: StudioPlacement, width: number, height: number) {
  const radians = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: 0, y: 0 },
    { x: width * placement.scaleX, y: 0 },
    { x: width * placement.scaleX, y: height * placement.scaleY },
    { x: 0, y: height * placement.scaleY },
  ];

  return corners.map((corner) => ({
    x: placement.x + corner.x * cos - corner.y * sin,
    y: placement.y + corner.x * sin + corner.y * cos,
  }));
}

function escapeSvgAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildWorkspaceCompositeImage(assets: StudioSheetAsset[], placements: StudioPlacement[]) {
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const visiblePlacements = placements
    .filter((placement) => placement.isVisible)
    .map((placement) => ({ placement, asset: assetById.get(placement.assetId) ?? null }))
    .filter((item): item is { placement: StudioPlacement; asset: StudioSheetAsset } => Boolean(item.asset?.signedUrl));

  if (visiblePlacements.length === 0) {
    return null;
  }

  const corners = visiblePlacements.flatMap(({ placement, asset }) => getRotatedCorners(placement, asset.width, asset.height));
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const imageElements = visiblePlacements
    .sort((a, b) => a.placement.layerOrder - b.placement.layerOrder)
    .map(({ placement, asset }) => {
      const href = escapeSvgAttribute(asset.signedUrl!);
      const transform = `translate(${placement.x} ${placement.y}) rotate(${placement.rotation}) scale(${placement.scaleX} ${placement.scaleY})`;

      return `<image href="${href}" width="${asset.width}" height="${asset.height}" opacity="${placement.opacity}" transform="${transform}" preserveAspectRatio="none" />`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">${imageElements}</svg>`;

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    offsetX: minX,
    offsetY: minY,
  };
}

function useLoadedImage(src: string | null, onError: () => void) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setImage(null);
      setFailed(true);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!cancelled) {
        setImage(nextImage);
        setFailed(false);
      }
    };
    nextImage.onerror = () => {
      if (!cancelled) {
        setImage(null);
        setFailed(true);
        onError();
      }
    };
    nextImage.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, onError]);

  return { image, failed };
}

function StudioSheetNode({
  asset,
  placement,
  isSelected,
  isTransformable,
  onSelect,
  onCommit,
  onNode,
  onRefreshSignedUrl,
}: {
  asset: StudioSheetAsset;
  placement: StudioPlacement;
  isSelected: boolean;
  isTransformable: boolean;
  onSelect: () => void;
  onCommit: (patch: Partial<StudioPlacement>) => void;
  onNode: (node: any | null) => void;
  onRefreshSignedUrl: () => void;
}) {
  const imageResult = useLoadedImage(asset.signedUrl, onRefreshSignedUrl);

  if (!placement.isVisible) {
    return null;
  }

  if (!imageResult.image || imageResult.failed) {
    return (
      <>
        <Rect
          ref={onNode}
          x={placement.x}
          y={placement.y}
          width={Math.max(asset.width * placement.scaleX, 220)}
          height={Math.max(asset.height * placement.scaleY, 150)}
          rotation={placement.rotation}
          opacity={placement.opacity}
          fill="rgba(55, 38, 28, 0.82)"
          stroke={isSelected ? "#e2be7e" : "rgba(226,190,126,0.32)"}
          dash={[10, 8]}
          draggable={isTransformable}
          onClick={onSelect}
          onTap={onSelect}
          onDragEnd={(event) => onCommit({ x: event.target.x(), y: event.target.y() })}
        />
        <Text x={placement.x + 18} y={placement.y + 18} text="Image unavailable" fill="#f6e7cb" fontSize={18} />
      </>
    );
  }

  return (
    <KonvaImage
      ref={onNode}
      image={imageResult.image}
      x={placement.x}
      y={placement.y}
      width={asset.width}
      height={asset.height}
      scaleX={placement.scaleX}
      scaleY={placement.scaleY}
      rotation={placement.rotation}
      opacity={placement.opacity}
      stroke={isSelected ? "#e2be7e" : "transparent"}
      strokeWidth={isSelected ? 8 : 0}
      draggable={isTransformable}
      listening
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onCommit({ x: event.target.x(), y: event.target.y() })}
      onTransformEnd={(event) => {
        const node = event.target;
        onCommit({
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

export function HistoricalMapStudio({ initialData }: { initialData: HistoricalMapStudioState }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<any | null>(null);
  const transformerRef = useRef<any | null>(null);
  const sheetNodeRefs = useRef<Map<string, any>>(new Map());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const saveInFlightRef = useRef(false);
  const [stageSize, setStageSize] = useState({ width: 1100, height: 720 });
  const [sheets, setSheets] = useState<StudioSheetAsset[]>(initialData.sheets);
  const [history, setHistory] = useState<StudioHistoryState>(buildInitialHistory(createPresentFromState(initialData)));
  const [selectedAssetId, setSelectedAssetId] = useState(initialData.sheets[0]?.assetId ?? "");
  const [isDirty, setIsDirty] = useState(initialData.placements.some((placement) => !placement.isPersisted) || !initialData.workspace?.isPersisted);
  const [saveStatus, setSaveStatus] = useState<StudioSaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(initialData.workspace?.updatedAt ?? "");
  const [search, setSearch] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [canvasCoordinates, setCanvasCoordinates] = useState({ x: 0, y: 0 });
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>(createMetadataDraft(initialData.sheets[0] ?? null));
  const [studioMode, setStudioMode] = useState<StudioWorkspaceMode>("stitching");
  const [georeferenceDraft, setGeoreferenceDraft] = useState<GeoreferenceDraft>(createGeoreferenceDraft(initialData, initialData.sheets[0]?.assetId ?? null));
  const [historicalClickMode, setHistoricalClickMode] = useState<"idle" | "adding_point">("idle");
  const [mapCursor, setMapCursor] = useState<GeoCoordinate | null>(null);
  const [mapCenter, setMapCenter] = useState<GeoCoordinate>(getDefaultTownCenter(initialData));
  const [modernMapZoom, setModernMapZoom] = useState(15);
  const [fitOverlayRequest, setFitOverlayRequest] = useState(0);
  const [overlayMoveEnabled, setOverlayMoveEnabled] = useState(false);
  const present = history.present;
  const selectedAsset = sheets.find((sheet) => sheet.assetId === selectedAssetId) ?? null;
  const selectedPlacement = present.placements.find((placement) => placement.assetId === selectedAssetId) ?? null;
  const visiblePlacements = present.placements.filter((placement) => placement.isVisible).length;
  const hiddenPlacements = present.placements.length - visiblePlacements;
  const lockedPlacements = present.placements.filter((placement) => placement.isLocked).length;
  const duplicateSheetNumbers = findDuplicateStudioSheetNumbers(sheets);
  const missingSheetNumbers = findMissingStudioSheetNumbers(sheets, initialData.expectedSheetCount);
  const workspaceStatus = getWorkspaceStatus({
    sheets: sheets.length,
    unsavedChanges: isDirty,
    saveStatus,
    warningMessage: initialData.warningMessage,
  });

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setStageSize({
          width: Math.max(520, Math.floor(entry.contentRect.width)),
          height: Math.max(520, Math.floor(entry.contentRect.height)),
        });
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setSheets(initialData.sheets);
    setHistory(buildInitialHistory(createPresentFromState(initialData)));
    setSelectedAssetId(initialData.sheets[0]?.assetId ?? "");
    setMetadataDraft(createMetadataDraft(initialData.sheets[0] ?? null));
    setIsDirty(initialData.placements.some((placement) => !placement.isPersisted) || !initialData.workspace?.isPersisted);
    setSaveStatus("idle");
    setSaveMessage("");
    setLastSavedAt(initialData.workspace?.updatedAt ?? "");
    setGeoreferenceDraft(createGeoreferenceDraft(initialData, initialData.sheets[0]?.assetId ?? null));
    setMapCenter(getDefaultTownCenter(initialData));
  }, [initialData.lastLoadedAt, initialData.sheets, initialData.placements, initialData.workspace]);

  useEffect(() => {
    setMetadataDraft(createMetadataDraft(selectedAsset));
    if (studioMode !== "stitching") {
      setGeoreferenceDraft(createGeoreferenceDraft(initialData, selectedAsset?.assetId ?? null));
    }
  }, [selectedAssetId]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = selectedAssetId ? sheetNodeRefs.current.get(selectedAssetId) : null;
    const locked = selectedPlacement?.isLocked;

    if (transformer && node && !locked) {
      transformer.nodes([node]);
      transformer.getLayer()?.batchDraw();
    } else if (transformer) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    }
  }, [selectedAssetId, selectedPlacement, history.present.placements]);

  useEffect(() => {
    if (!isDirty || initialData.mode !== "owner") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveLayout("autosave");
    }, studioAutosaveDelayMs);

    return () => window.clearTimeout(timeout);
  }, [isDirty, present, initialData.mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreStudioShortcut(event.target)) {
        return;
      }

      if (event.code === "Space") {
        setIsSpacePanning(true);
        return;
      }

      const selected = selectedPlacement;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape") {
        setSelectedAssetId("");
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        fitAllSheets();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.12);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomBy(0.88);
        return;
      }

      if (event.key === "Delete" && selectedAsset) {
        event.preventDefault();
        void deleteSelectedSheet();
        return;
      }

      if (selected && !selected.isLocked && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 20 : 2;
        const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
        const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        commitPlacement(selected.assetId, { x: selected.x + dx, y: selected.y + dy });
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedPlacement, selectedAsset, present]);

  function setPresent(next: StudioPresentState, recordHistory: boolean) {
    setHistory((current) => (recordHistory ? pushStudioHistory(current, next) : { ...current, present: next }));
    setIsDirty(true);
    setSaveStatus("idle");
  }

  function commitPlacement(assetId: string, patch: Partial<StudioPlacement>) {
    const nextPlacements = updatePlacement(present.placements, assetId, {
      ...patch,
      ...(snapToGrid && patch.x !== undefined ? { x: Math.round(patch.x / 20) * 20 } : {}),
      ...(snapToGrid && patch.y !== undefined ? { y: Math.round(patch.y / 20) * 20 } : {}),
    });
    setPresent({ ...present, placements: nextPlacements }, true);
  }

  function commitViewport(viewport: StudioViewport, recordHistory = false) {
    setPresent({ ...present, viewport }, recordHistory);
  }

  function undo() {
    setHistory((current) => undoStudioHistory(current));
    setIsDirty(true);
  }

  function redo() {
    setHistory((current) => redoStudioHistory(current));
    setIsDirty(true);
  }

  async function saveLayout(kind: "manual" | "autosave" = "manual") {
    if (saveInFlightRef.current || !initialData.workspace || !initialData.activeTownPackage || initialData.mode !== "owner") {
      return;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveMessage(kind === "autosave" ? "Autosaving layout..." : "Saving layout...");

    const response = await fetch("/api/community/historical-map-studio/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId: initialData.workspace.workspaceId,
        name: initialData.workspace.name,
        viewport: present.viewport,
        placements: present.placements,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; savedAt?: string } | null;

    saveInFlightRef.current = false;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Layout save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage(kind === "autosave" ? "Autosaved." : "Layout saved.");
    setLastSavedAt(payload.savedAt ?? new Date().toISOString());
    setIsDirty(false);
  }

  function zoomBy(multiplier: number) {
    commitViewport({ ...present.viewport, scale: Math.max(0.05, Math.min(6, present.viewport.scale * multiplier)) }, false);
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (!stage || !pointer) {
      return;
    }

    const oldScale = present.viewport.scale;
    const scaleBy = 1.06;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const mousePointTo = {
      x: (pointer.x - present.viewport.x) / oldScale,
      y: (pointer.y - present.viewport.y) / oldScale,
    };

    commitViewport(
      {
        scale: Math.max(0.05, Math.min(6, newScale)),
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      },
      false,
    );
  }

  function fitAllSheets() {
    const bounds = getPlacementBounds(sheets, present.placements);

    if (!bounds) {
      return;
    }

    const width = Math.max(bounds.x2 - bounds.x1, 1);
    const height = Math.max(bounds.y2 - bounds.y1, 1);
    const scale = Math.min(stageSize.width / (width + 160), stageSize.height / (height + 160), 1.6);

    commitViewport(
      {
        scale,
        x: stageSize.width / 2 - (bounds.x1 + width / 2) * scale,
        y: stageSize.height / 2 - (bounds.y1 + height / 2) * scale,
      },
      true,
    );
  }

  function resetView() {
    commitViewport({ x: 0, y: 0, scale: 1 }, true);
  }

  function centerSelectedSheet() {
    if (!selectedPlacement || !selectedAsset) {
      return;
    }

    commitViewport(
      {
        scale: present.viewport.scale,
        x: stageSize.width / 2 - (selectedPlacement.x + (selectedAsset.width * selectedPlacement.scaleX) / 2) * present.viewport.scale,
        y: stageSize.height / 2 - (selectedPlacement.y + (selectedAsset.height * selectedPlacement.scaleY) / 2) * present.viewport.scale,
      },
      true,
    );
  }

  function resetSelectedTransform() {
    if (!selectedPlacement) {
      return;
    }

    commitPlacement(selectedPlacement.assetId, { scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 });
  }

  function setLayerOrder(action: "forward" | "backward" | "front" | "back") {
    if (!selectedAssetId) {
      return;
    }

    setPresent({ ...present, placements: reorderPlacement(present.placements, selectedAssetId, action) }, true);
  }

  function selectAndCenter(assetId: string) {
    setSelectedAssetId(assetId);
    const placement = present.placements.find((candidate) => candidate.assetId === assetId);
    const asset = sheets.find((candidate) => candidate.assetId === assetId);

    if (placement && asset) {
      commitViewport(
        {
          scale: present.viewport.scale,
          x: stageSize.width / 2 - (placement.x + (asset.width * placement.scaleX) / 2) * present.viewport.scale,
          y: stageSize.height / 2 - (placement.y + (asset.height * placement.scaleY) / 2) * present.viewport.scale,
        },
        false,
      );
    }
  }

  async function refreshSignedUrl(assetId: string) {
    const response = await fetch(`/api/community/historical-map-studio/assets/${encodeURIComponent(assetId)}/signed-url`);
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; asset?: { signedUrl: string; signedUrlExpiresAt: string } } | null;

    if (response.ok && payload?.ok && payload.asset) {
      setSheets((currentSheets) =>
        currentSheets.map((sheet) =>
          sheet.assetId === assetId ? { ...sheet, signedUrl: payload.asset!.signedUrl, signedUrlExpiresAt: payload.asset!.signedUrlExpiresAt, signedUrlError: undefined } : sheet,
        ),
      );
    }
  }

  async function uploadSheets(files: FileList | null) {
    if (!files || !initialData.activeTownPackage) {
      return;
    }

    const startingMissing = missingSheetNumbers[0] ?? sheets.length + 1;
    let offset = 0;
    const statuses: UploadStatus[] = [];

    for (const file of Array.from(files)) {
      statuses.push({ filename: file.name, status: "uploading", message: "Uploading..." });
      setUploadStatuses([...statuses]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetNumber", String(startingMissing + offset));
      formData.append("townPackageId", initialData.activeTownPackage.id);
      formData.append("intakeNotes", "Uploaded from Historical Map Studio.");
      offset += 1;

      const response = await fetch("/api/community/sanborn-sheets", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      statuses[statuses.length - 1] = {
        filename: file.name,
        status: response.ok && payload?.ok ? "saved" : "failed",
        message: response.ok && payload?.ok ? "Uploaded. Refreshing workspace..." : payload?.message ?? "Upload failed.",
      };
      setUploadStatuses([...statuses]);
    }

    router.refresh();
  }

  async function updateMetadata() {
    if (!selectedAsset) {
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/metadata", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: selectedAsset.assetId,
        sheetNumber: metadataDraft.sheetNumber ? Number(metadataDraft.sheetNumber) : null,
        sourceRecordId: metadataDraft.sourceRecordId || null,
        sourceUrl: metadataDraft.sourceUrl,
        archiveName: metadataDraft.archiveName,
        rightsNote: metadataDraft.rightsNote,
        intakeNotes: metadataDraft.intakeNotes,
        evidenceClassification: metadataDraft.evidenceClassification,
        reviewStatus: metadataDraft.reviewStatus,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? "Metadata updated." : payload?.message ?? "Metadata update failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  async function replaceSelectedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file || !selectedAsset) {
      return;
    }

    if (!window.confirm(`Replace image for sheet ${selectedAsset.sheetNumber ?? "unknown"} (${selectedAsset.originalFilename})?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("assetId", selectedAsset.assetId);
    formData.append("file", file);

    const response = await fetch("/api/community/historical-map-studio/replace", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; warningMessage?: string } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? payload.warningMessage ?? "Image replaced." : payload?.message ?? "Replacement failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  async function deleteSelectedSheet() {
    if (!selectedAsset) {
      return;
    }

    if (!window.confirm(`Delete sheet ${selectedAsset.sheetNumber ?? "unknown"} (${selectedAsset.originalFilename})? This removes the stored image and metadata.`)) {
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: selectedAsset.assetId }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; partialFailure?: boolean } | null;

    setSaveStatus(response.ok && payload?.ok ? "saved" : "error");
    setSaveMessage(response.ok && payload?.ok ? "Sheet deleted." : payload?.message ?? "Delete failed.");

    if (response.ok && payload?.ok) {
      router.refresh();
    }
  }

  async function logout() {
    await fetch("/api/community/historical-map-studio/session", { method: "DELETE" });
    router.refresh();
  }

  function setGeoreferenceTarget(targetType: "sheet" | "workspace") {
    const targetAssetId = targetType === "sheet" ? selectedAsset?.assetId ?? sheets[0]?.assetId ?? null : null;
    setGeoreferenceDraft(createGeoreferenceDraft(initialData, targetAssetId));
  }

  function addHistoricalControlPoint(event: MouseEvent<HTMLImageElement>) {
    const workspaceComposite = buildWorkspaceCompositeImage(sheets, present.placements);
    const reference =
      georeferenceDraft.targetType === "workspace"
        ? workspaceComposite
        : selectedAsset
          ? { width: selectedAsset.width, height: selectedAsset.height, offsetX: 0, offsetY: 0 }
          : null;

    if (!reference) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const imageX = reference.offsetX + ((event.clientX - rect.left) / rect.width) * reference.width;
    const imageY = reference.offsetY + ((event.clientY - rect.top) / rect.height) * reference.height;
    const controlPointId = `cp-${Date.now()}`;
    const point = normalizeControlPoint({
      controlPointId,
      label: `CP ${georeferenceDraft.controlPoints.length + 1}`,
      imageX,
      imageY,
      latitude: null,
      longitude: null,
      confidence: "draft",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [...georeferenceDraft.controlPoints, point],
      selectedControlPointId: controlPointId,
      status: "control_points_draft",
    });
    setHistoricalClickMode("idle");
  }

  function completeSelectedControlPoint(latitude: number, longitude: number) {
    const selectedId = georeferenceDraft.selectedControlPointId;

    if (selectedId) {
      setGeoreferenceDraft({
        ...georeferenceDraft,
        controlPoints: updateDraftPoint(georeferenceDraft.controlPoints, selectedId, {
          latitude,
          longitude,
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }

    const controlPointId = `cp-${Date.now()}`;
    const point = normalizeControlPoint({
      controlPointId,
      label: `CP ${georeferenceDraft.controlPoints.length + 1}`,
      imageX: null,
      imageY: null,
      latitude,
      longitude,
      confidence: "draft",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [...georeferenceDraft.controlPoints, point],
      selectedControlPointId: controlPointId,
    });
  }

  function updateControlPoint(controlPointId: string, patch: Partial<HistoricalMapControlPoint>) {
    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: updateDraftPoint(georeferenceDraft.controlPoints, controlPointId, { ...patch, updatedAt: new Date().toISOString() }),
    });
  }

  function deleteSelectedControlPoint() {
    if (!georeferenceDraft.selectedControlPointId) {
      return;
    }

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: georeferenceDraft.controlPoints.filter((point) => point.controlPointId !== georeferenceDraft.selectedControlPointId),
      selectedControlPointId: "",
    });
  }

  function clearDraftPoints() {
    if (!window.confirm("Clear all draft control points for this georeference?")) {
      return;
    }

    setGeoreferenceDraft({
      ...georeferenceDraft,
      controlPoints: [],
      selectedControlPointId: "",
      status: georeferenceDraft.bounds ? "bounding_box" : "not_started",
    });
  }

  function moveCorner(corner: keyof GeoCorners, latitude: number, longitude: number) {
    const corners = {
      ...georeferenceDraft.corners,
      [corner]: { latitude, longitude },
    };

    setGeoreferenceDraft({
      ...georeferenceDraft,
      corners,
      bounds: boundsFromCorners(corners),
      status: "bounding_box",
    });
  }

  function translateOverlay(deltaLatitude: number, deltaLongitude: number) {
    setGeoreferenceDraft((current) => {
      const corners = translateGeoCorners(current.corners, deltaLatitude, deltaLongitude);
      const controlPoints = translateControlPointGeography(current.controlPoints, deltaLatitude, deltaLongitude);

      return {
        ...current,
        corners,
        bounds: boundsFromCorners(corners),
        controlPoints,
        status: deriveGeoreferenceStatus({ corners, controlPoints }),
      };
    });
    setSaveStatus("idle");
  }

  function resetGeographicAlignment() {
    if (!window.confirm("Reset geographic bounds and control points for the current draft?")) {
      return;
    }

    const corners = createDefaultGeoCorners(getDefaultTownCenter(initialData));

    setGeoreferenceDraft({
      ...georeferenceDraft,
      corners,
      bounds: boundsFromCorners(corners),
      controlPoints: [],
      selectedControlPointId: "",
      status: "not_started",
    });
  }

  function calculateAlignment() {
    const completePoints = getCompleteControlPoints(georeferenceDraft.controlPoints);
    const transform = calculateAffineTransform(completePoints);

    setSaveStatus(transform.ok ? "saved" : "error");
    setSaveMessage(
      transform.ok
        ? `Affine alignment calculated from ${completePoints.length} control points. Estimated residual: ${transform.residualError.toExponential(3)} degrees.`
        : transform.error,
    );

    setGeoreferenceDraft({
      ...georeferenceDraft,
      status: deriveGeoreferenceStatus({ corners: georeferenceDraft.corners, controlPoints: georeferenceDraft.controlPoints }),
    });
  }

  async function saveGeoreference() {
    if (!initialData.activeTownPackage || !initialData.workspace) {
      setSaveStatus("error");
      setSaveMessage("A town package and workspace are required before saving georeferencing.");
      return;
    }

    const response = await fetch("/api/community/historical-map-studio/georeference", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        townPackageId: initialData.activeTownPackage.id,
        mapYear: initialData.activeMapYear,
        workspaceId: initialData.workspace.workspaceId,
        workspaceName: initialData.workspace.name,
        targetType: georeferenceDraft.targetType,
        targetAssetId: georeferenceDraft.targetAssetId,
        status: georeferenceDraft.status,
        bounds: georeferenceDraft.bounds,
        corners: georeferenceDraft.corners,
        controlPoints: georeferenceDraft.controlPoints,
        selectedBasemap: georeferenceDraft.selectedBasemap,
        overlayOpacity: georeferenceDraft.overlayOpacity,
        overlayVisible: georeferenceDraft.overlayVisible,
        showControlPoints: georeferenceDraft.showControlPoints,
        showSheetBoundaries: georeferenceDraft.showSheetBoundaries,
        notes: georeferenceDraft.notes,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; residualError?: number; transformWarning?: string } | null;

    if (!response.ok || !payload?.ok) {
      setSaveStatus("error");
      setSaveMessage(payload?.message ?? "Georeference save failed.");
      return;
    }

    setSaveStatus("saved");
    setSaveMessage(payload.transformWarning ? `Georeference saved as rectangular preview. ${payload.transformWarning}` : "Georeference saved.");
    router.refresh();
  }

  const filteredSheets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return sheets.filter((sheet) => {
      if (!normalizedSearch) {
        return true;
      }

      return `${sheet.sheetNumber ?? ""} ${sheet.originalFilename} ${sheet.reviewStatus} ${sheet.sourceTitle ?? ""}`.toLowerCase().includes(normalizedSearch);
    });
  }, [sheets, search]);

  const sortedPlacements = [...present.placements].sort((a, b) => a.layerOrder - b.layerOrder);
  const placementByAssetId = new Map(present.placements.map((placement) => [placement.assetId, placement]));
  const workspaceComposite = useMemo(() => buildWorkspaceCompositeImage(sheets, present.placements), [sheets, present.placements]);
  const selectedControlPoint = georeferenceDraft.controlPoints.find((point) => point.controlPointId === georeferenceDraft.selectedControlPointId) ?? null;
  const completeControlPoints = getCompleteControlPoints(georeferenceDraft.controlPoints);
  const calculatedTransform = calculateAffineTransform(completeControlPoints);
  const selectedOverlayAsset = georeferenceDraft.targetType === "sheet" ? sheets.find((sheet) => sheet.assetId === georeferenceDraft.targetAssetId) ?? selectedAsset : null;
  const historicalReference =
    georeferenceDraft.targetType === "workspace"
      ? workspaceComposite
        ? {
            label: "Stitched workspace composite",
            signedUrl: workspaceComposite.url,
            width: workspaceComposite.width,
            height: workspaceComposite.height,
            offsetX: workspaceComposite.offsetX,
            offsetY: workspaceComposite.offsetY,
          }
        : null
      : selectedAsset?.signedUrl
        ? {
            label: `Historical sheet ${selectedAsset.sheetNumber ?? "unknown"}`,
            signedUrl: selectedAsset.signedUrl,
            width: selectedAsset.width,
            height: selectedAsset.height,
            offsetX: 0,
            offsetY: 0,
          }
        : null;
  const overlayImageUrl = georeferenceDraft.targetType === "workspace" ? workspaceComposite?.url ?? null : selectedOverlayAsset?.signedUrl ?? null;

  return (
    <section className="historical-map-studio">
      <header className="map-studio-topbar">
        <div>
          <p className="panel__eyebrow">Historical Map Studio</p>
          <h2>{initialData.activeTownPackage ? `${initialData.activeTownPackage.name} ${initialData.activeMapYear}` : "No town package"}</h2>
          <p className="small-muted">{initialData.activeTownPackage ? `${initialData.activeTownPackage.region} | ${initialData.activeTownPackage.packageId}` : initialData.warningMessage}</p>
        </div>
        <div className="map-studio-topbar__metrics">
          <span className="tag state-ready">Sheets {sheets.length}</span>
          <span className={`tag state-${missingSheetNumbers.length > 0 ? "guarded" : "ready"}`}>Missing {missingSheetNumbers.length}</span>
          <span className={`tag state-${isDirty ? "reviewing" : "ready"}`}>{isDirty ? "Unsaved changes" : "Saved"}</span>
          <span className={`tag state-${saveStatus === "error" ? "blocked" : saveStatus === "saving" ? "reviewing" : "ready"}`}>{saveStatus}</span>
          <span className="tag state-guarded">Zoom {Math.round(present.viewport.scale * 100)}%</span>
          <span className="tag state-ready">Data source: {initialData.dataSource === "supabase" ? "Supabase" : "Setup required"}</span>
          <span className="tag state-reviewing">Mode: {initialData.mode}</span>
        </div>
        <div className="map-studio-actions">
          <button className="sanborn-button sanborn-button--primary" disabled={!isDirty || saveStatus === "saving"} onClick={() => void saveLayout("manual")} type="button">
            Save layout
          </button>
          <button className="sanborn-button" disabled={history.past.length === 0} onClick={undo} type="button">Undo</button>
          <button className="sanborn-button" disabled={history.future.length === 0} onClick={redo} type="button">Redo</button>
          <button className="sanborn-button" onClick={fitAllSheets} type="button">Fit all sheets</button>
          <button className="sanborn-button" onClick={resetView} type="button">Reset view</button>
          <button className="sanborn-button" onClick={() => uploadInputRef.current?.click()} type="button">Upload sheets</button>
          <button className="sanborn-button" onClick={() => void logout()} type="button">Logout</button>
          <input accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden multiple onChange={(event) => void uploadSheets(event.target.files)} ref={uploadInputRef} type="file" />
        </div>
        <div className="map-studio-mode-switch" aria-label="Historical Map Studio modes">
          {[
            ["stitching", "Stitching"],
            ["georeferencing", "Georeferencing"],
            ["modern_overlay", "Modern Overlay"],
          ].map(([mode, label]) => (
            <button className={`sanborn-button${studioMode === mode ? " sanborn-button--primary" : ""}`} key={mode} onClick={() => setStudioMode(mode as StudioWorkspaceMode)} type="button">
              {label}
            </button>
          ))}
          {studioMode !== "stitching" ? (
            <>
              <button className="sanborn-button" onClick={calculateAlignment} type="button">Calculate alignment</button>
              <button className="sanborn-button sanborn-button--primary" onClick={() => void saveGeoreference()} type="button">Save georeference</button>
            </>
          ) : null}
        </div>
      </header>

      {initialData.warningMessage ? <p className="sanborn-intake__warning">{initialData.warningMessage}</p> : null}
      {saveMessage ? <p className={saveStatus === "error" ? "sanborn-intake__warning" : "small-muted"}>{saveMessage} Last saved: {lastSavedAt ? formatDate(lastSavedAt) : "Not saved yet"}.</p> : null}

      <div className="map-studio-layout">
        <aside className="map-studio-sidebar">
          <label>Town package<select value={initialData.activeTownPackage?.id ?? ""} onChange={(event) => router.push(`/community/historical-map-studio?town=${event.target.value}&year=${initialData.activeMapYear ?? ""}`)}>{initialData.townPackages.map((town) => <option key={town.id} value={town.id}>{town.name} {town.year}</option>)}</select></label>
          <label>Map year<select value={initialData.activeMapYear ?? ""} onChange={(event) => router.push(`/community/historical-map-studio?town=${initialData.activeTownPackage?.id ?? ""}&year=${event.target.value}`)}>{initialData.availableMapYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>Search sheets<input onChange={(event) => setSearch(event.target.value)} placeholder="Sheet, filename, status..." value={search} /></label>
          <div className="map-studio-sidebar__summary">
            <span>Uploaded: {sheets.length}</span>
            <span>Missing: {missingSheetNumbers.length ? missingSheetNumbers.join(", ") : "None"}</span>
            <span>Duplicates: {duplicateSheetNumbers.length ? duplicateSheetNumbers.join(", ") : "None"}</span>
            <span>Hidden: {hiddenPlacements}</span>
            <span>Locked: {lockedPlacements}</span>
          </div>
          {studioMode !== "stitching" ? (
            <div className="map-studio-georef-controls">
              <label>Georeference target<select value={georeferenceDraft.targetType} onChange={(event) => setGeoreferenceTarget(event.target.value as "sheet" | "workspace")}><option value="sheet">Selected sheet</option><option value="workspace">Full stitched workspace</option></select></label>
              <label>Modern basemap<select value={georeferenceDraft.selectedBasemap} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, selectedBasemap: event.target.value })}>{basemaps.map((basemap) => <option key={basemap.key} value={basemap.key}>{basemap.label}</option>)}</select></label>
              <label>Overlay opacity<input max="1" min="0" step="0.05" type="range" value={georeferenceDraft.overlayOpacity} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, overlayOpacity: Number(event.target.value) })} /></label>
              <label><input checked={georeferenceDraft.overlayVisible} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, overlayVisible: event.target.checked })} type="checkbox" /> Historical overlay visible</label>
              <label><input checked={overlayMoveEnabled} onChange={(event) => setOverlayMoveEnabled(event.target.checked)} type="checkbox" /> Move overlay by dragging map</label>
              <label><input checked={georeferenceDraft.showControlPoints} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, showControlPoints: event.target.checked })} type="checkbox" /> Show control points</label>
              <label><input checked={georeferenceDraft.showSheetBoundaries} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, showSheetBoundaries: event.target.checked })} type="checkbox" /> Show sheet boundaries</label>
              <button className="sanborn-button" onClick={() => setHistoricalClickMode("adding_point")} type="button">Add control point</button>
              <button className="sanborn-button" onClick={clearDraftPoints} type="button">Clear draft points</button>
              <button className="sanborn-button" onClick={resetGeographicAlignment} type="button">Reset geographic alignment</button>
              <button className="sanborn-button" onClick={() => setFitOverlayRequest((current) => current + 1)} type="button">Fit overlay bounds</button>
              <p className="small-muted">Rendering mode: rectangular preview. Turn on overlay move to drag the historical image alignment instead of panning the modern map, then save georeference.</p>
            </div>
          ) : null}
          <div className="map-studio-sheet-list">
            {filteredSheets.length === 0 ? <p className="small-muted">No sheets match the current search.</p> : null}
            {filteredSheets.map((sheet) => {
              const placement = placementByAssetId.get(sheet.assetId);
              const warning = duplicateSheetNumbers.includes(sheet.sheetNumber ?? -1) || sheet.signedUrlError;
              return (
                <button className={`map-studio-sheet-row${selectedAssetId === sheet.assetId ? " is-selected" : ""}`} key={sheet.assetId} onClick={() => selectAndCenter(sheet.assetId)} type="button">
                  {sheet.signedUrl ? <img alt="" src={sheet.signedUrl} /> : <span className="map-studio-thumb-fallback">No image</span>}
                  <span><strong>Sheet {sheet.sheetNumber ?? "unknown"}</strong><small>{sheet.originalFilename}</small></span>
                  <span className={`tag state-${warning ? "blocked" : placement?.isVisible === false ? "guarded" : "ready"}`}>{warning ? "warning" : placement?.isVisible === false ? "hidden" : "visible"}</span>
                  <span className={`tag state-${placement?.isLocked ? "guarded" : "ready"}`}>{placement?.isLocked ? "locked" : "unlocked"}</span>
                  <span className="tag state-reviewing">{sheet.reviewStatus}</span>
                </button>
              );
            })}
          </div>
          {uploadStatuses.length > 0 ? (
            <div className="map-studio-upload-status">
              {uploadStatuses.map((status) => <p key={`${status.filename}-${status.status}`}>{status.filename}: {status.message}</p>)}
            </div>
          ) : null}
        </aside>

        <main className={`map-studio-canvas-wrap mode-${studioMode}`} ref={containerRef}>
          {studioMode === "stitching" ? (
            <Stage
              draggable={isSpacePanning}
              height={stageSize.height}
              onDragEnd={(event) => {
                if (isSpacePanning) {
                  commitViewport({ ...present.viewport, x: event.target.x(), y: event.target.y() }, false);
                }
              }}
              onMouseMove={() => {
                const pointer = stageRef.current?.getPointerPosition();
                if (pointer) setCanvasCoordinates({ x: Math.round((pointer.x - present.viewport.x) / present.viewport.scale), y: Math.round((pointer.y - present.viewport.y) / present.viewport.scale) });
              }}
              onWheel={handleWheel}
              ref={stageRef}
              scaleX={present.viewport.scale}
              scaleY={present.viewport.scale}
              width={stageSize.width}
              x={present.viewport.x}
              y={present.viewport.y}
            >
              <Layer>
                <Rect x={-5000} y={-5000} width={10000} height={10000} fill="#15100d" />
                {showGrid
                  ? Array.from({ length: 81 }, (_, index) => index * 100 - 4000).flatMap((position) => [
                      <Line key={`v-${position}`} points={[position, -4000, position, 4000]} stroke="rgba(226,190,126,0.08)" strokeWidth={1 / present.viewport.scale} />,
                      <Line key={`h-${position}`} points={[-4000, position, 4000, position]} stroke="rgba(226,190,126,0.08)" strokeWidth={1 / present.viewport.scale} />,
                    ])
                  : null}
                {sortedPlacements.map((placement) => {
                  const asset = sheets.find((sheet) => sheet.assetId === placement.assetId);
                  if (!asset) return null;
                  return (
                    <StudioSheetNode
                      asset={asset}
                      isSelected={selectedAssetId === asset.assetId}
                      isTransformable={selectedAssetId === asset.assetId && !placement.isLocked}
                      key={asset.assetId}
                      onCommit={(patch) => commitPlacement(asset.assetId, patch)}
                      onNode={(node) => {
                        if (node) sheetNodeRefs.current.set(asset.assetId, node);
                        else sheetNodeRefs.current.delete(asset.assetId);
                      }}
                      onRefreshSignedUrl={() => void refreshSignedUrl(asset.assetId)}
                      onSelect={() => setSelectedAssetId(asset.assetId)}
                      placement={placement}
                    />
                  );
                })}
                <Transformer ref={transformerRef} rotateEnabled enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} />
              </Layer>
            </Stage>
          ) : studioMode === "georeferencing" ? (
            <div className="map-studio-georef-split">
              <div className="map-studio-historical-point-pane">
                <div className="map-studio-georef-pane__header">
                  <strong>{historicalReference ? historicalReference.label : "No historical image available"}</strong>
                  <span className="small-muted">{historicalClickMode === "adding_point" ? "Click the sheet to place the historical point." : "Select Add control point to place a paired point."}</span>
                </div>
                {historicalReference ? (
                  <div className="map-studio-historical-image-frame">
                    <img alt={historicalReference.label} onClick={historicalClickMode === "adding_point" ? addHistoricalControlPoint : undefined} src={historicalReference.signedUrl} />
                    {georeferenceDraft.controlPoints
                      .filter((point) => typeof point.imageX === "number" && typeof point.imageY === "number")
                      .map((point) => {
                        const left = (((point.imageX ?? 0) - historicalReference.offsetX) / historicalReference.width) * 100;
                        const top = (((point.imageY ?? 0) - historicalReference.offsetY) / historicalReference.height) * 100;

                        return (
                          <button
                            className={`map-studio-image-point${point.controlPointId === georeferenceDraft.selectedControlPointId ? " is-selected" : ""}`}
                            key={point.controlPointId}
                            onClick={() => setGeoreferenceDraft({ ...georeferenceDraft, selectedControlPointId: point.controlPointId })}
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                            }}
                            type="button"
                          >
                            {point.label}
                          </button>
                        );
                      })}
                  </div>
                ) : (
                  <div className="sanborn-empty-state"><strong>No signed image available.</strong><p className="small-muted">Refresh signed URLs, select a sheet, or place at least one visible sheet in the workspace.</p></div>
                )}
              </div>
              <div className="map-studio-modern-map-pane">
                <HistoricalMapLeaflet
                  basemapKey={georeferenceDraft.selectedBasemap}
                  bounds={georeferenceDraft.bounds}
                  center={[mapCenter.latitude, mapCenter.longitude]}
                  controlPoints={georeferenceDraft.controlPoints}
                  corners={georeferenceDraft.corners}
                  fitBoundsRequest={fitOverlayRequest}
                  imageUrl={overlayImageUrl}
                  onCornerDrag={moveCorner}
                  onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
                  onMapClick={completeSelectedControlPoint}
                  onMapViewChange={(center, zoom) => {
                    setMapCenter({ latitude: center[0], longitude: center[1] });
                    setModernMapZoom(zoom);
                  }}
                  onMarkerDrag={(controlPointId, latitude, longitude) => updateControlPoint(controlPointId, { latitude, longitude })}
                  onOverlayTranslate={translateOverlay}
                  overlayMoveEnabled={overlayMoveEnabled}
                  overlayOpacity={georeferenceDraft.overlayOpacity}
                  overlayVisible={georeferenceDraft.overlayVisible}
                  selectedControlPointId={georeferenceDraft.selectedControlPointId}
                  showControlPoints={georeferenceDraft.showControlPoints}
                  showSheetBoundaries={georeferenceDraft.showSheetBoundaries}
                  zoom={modernMapZoom}
                />
              </div>
            </div>
          ) : (
            <div className="map-studio-overlay-mode">
              <HistoricalMapLeaflet
                basemapKey={georeferenceDraft.selectedBasemap}
                bounds={georeferenceDraft.bounds}
                center={[mapCenter.latitude, mapCenter.longitude]}
                controlPoints={georeferenceDraft.controlPoints}
                corners={georeferenceDraft.corners}
                fitBoundsRequest={fitOverlayRequest}
                imageUrl={overlayImageUrl}
                onCornerDrag={moveCorner}
                onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
                onMapClick={completeSelectedControlPoint}
                onMapViewChange={(center, zoom) => {
                  setMapCenter({ latitude: center[0], longitude: center[1] });
                  setModernMapZoom(zoom);
                }}
                onMarkerDrag={(controlPointId, latitude, longitude) => updateControlPoint(controlPointId, { latitude, longitude })}
                onOverlayTranslate={translateOverlay}
                overlayMoveEnabled={overlayMoveEnabled}
                overlayOpacity={georeferenceDraft.overlayOpacity}
                overlayVisible={georeferenceDraft.overlayVisible}
                selectedControlPointId={georeferenceDraft.selectedControlPointId}
                showControlPoints={georeferenceDraft.showControlPoints}
                showSheetBoundaries={georeferenceDraft.showSheetBoundaries}
                zoom={modernMapZoom}
              />
            </div>
          )}
        </main>

        <aside className="map-studio-inspector">
          {!selectedAsset || !selectedPlacement ? (
            <div className="sanborn-empty-state"><strong>No sheet selected.</strong><p className="small-muted">Select a sheet from the gallery or canvas.</p></div>
          ) : (
            <>
              <h3>Sheet inspector</h3>
              <div className="map-studio-inspector__grid">
                <label>Sheet number<input value={metadataDraft.sheetNumber} onChange={(event) => setMetadataDraft({ ...metadataDraft, sheetNumber: event.target.value })} /></label>
                <label>Source record<select value={metadataDraft.sourceRecordId} onChange={(event) => {
                  const source = initialData.sourceOptions.find((option) => option.sourceRecordId === event.target.value);
                  setMetadataDraft({ ...metadataDraft, sourceRecordId: event.target.value, sourceUrl: source?.sourceUrl ?? metadataDraft.sourceUrl, archiveName: source?.archiveName ?? metadataDraft.archiveName, rightsNote: source?.rightsNote ?? metadataDraft.rightsNote });
                }}><option value="">Source unavailable</option>{initialData.sourceOptions.map((source) => <option key={source.sourceRecordId} value={source.sourceRecordId}>{source.sourceId} - {source.title}</option>)}</select></label>
                <label>Source URL<input value={metadataDraft.sourceUrl} onChange={(event) => setMetadataDraft({ ...metadataDraft, sourceUrl: event.target.value })} /></label>
                <label>Archive name<input value={metadataDraft.archiveName} onChange={(event) => setMetadataDraft({ ...metadataDraft, archiveName: event.target.value })} /></label>
                <label>Rights note<textarea value={metadataDraft.rightsNote} onChange={(event) => setMetadataDraft({ ...metadataDraft, rightsNote: event.target.value })} /></label>
                <label>Intake notes<textarea value={metadataDraft.intakeNotes} onChange={(event) => setMetadataDraft({ ...metadataDraft, intakeNotes: event.target.value })} /></label>
                <label>Evidence classification<select value={metadataDraft.evidenceClassification} onChange={(event) => setMetadataDraft({ ...metadataDraft, evidenceClassification: event.target.value })}>{reviewStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label>Review status<select value={metadataDraft.reviewStatus} onChange={(event) => setMetadataDraft({ ...metadataDraft, reviewStatus: event.target.value })}>{reviewStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              </div>

              <button className="sanborn-button sanborn-button--primary" onClick={() => void updateMetadata()} type="button">Update metadata</button>

              <div className="map-studio-inspector__grid">
                <label>X position<input type="number" value={Math.round(selectedPlacement.x)} onChange={(event) => commitPlacement(selectedPlacement.assetId, { x: Number(event.target.value) })} /></label>
                <label>Y position<input type="number" value={Math.round(selectedPlacement.y)} onChange={(event) => commitPlacement(selectedPlacement.assetId, { y: Number(event.target.value) })} /></label>
                <label>Scale X<input step="0.01" type="number" value={selectedPlacement.scaleX} onChange={(event) => commitPlacement(selectedPlacement.assetId, { scaleX: Number(event.target.value) })} /></label>
                <label>Scale Y<input step="0.01" type="number" value={selectedPlacement.scaleY} onChange={(event) => commitPlacement(selectedPlacement.assetId, { scaleY: Number(event.target.value) })} /></label>
                <label>Uniform scale<input type="checkbox" checked={Math.abs(selectedPlacement.scaleX - selectedPlacement.scaleY) < 0.001} onChange={(event) => event.target.checked ? commitPlacement(selectedPlacement.assetId, { scaleY: selectedPlacement.scaleX }) : undefined} /></label>
                <label>Rotation<input step="1" type="number" value={selectedPlacement.rotation} onChange={(event) => commitPlacement(selectedPlacement.assetId, { rotation: Number(event.target.value) })} /></label>
                <label>Opacity<input max="1" min="0.1" step="0.05" type="range" value={selectedPlacement.opacity} onChange={(event) => commitPlacement(selectedPlacement.assetId, { opacity: Number(event.target.value) })} /></label>
                <label>Layer order<input type="number" value={selectedPlacement.layerOrder} onChange={(event) => commitPlacement(selectedPlacement.assetId, { layerOrder: Number(event.target.value) })} /></label>
                <label>Visible<input type="checkbox" checked={selectedPlacement.isVisible} onChange={(event) => commitPlacement(selectedPlacement.assetId, { isVisible: event.target.checked })} /></label>
                <label>Locked<input type="checkbox" checked={selectedPlacement.isLocked} onChange={(event) => commitPlacement(selectedPlacement.assetId, { isLocked: event.target.checked })} /></label>
              </div>

              <div className="map-studio-layer-actions">
                <button className="sanborn-button" onClick={() => setLayerOrder("forward")} type="button">Bring forward</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("backward")} type="button">Send backward</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("front")} type="button">Bring to front</button>
                <button className="sanborn-button" onClick={() => setLayerOrder("back")} type="button">Send to back</button>
              </div>

              <div className="map-studio-layer-actions">
                <button className="sanborn-button" onClick={centerSelectedSheet} type="button">Center selected sheet</button>
                <button className="sanborn-button" onClick={resetSelectedTransform} type="button">Reset selected transform</button>
                <button className="sanborn-button" onClick={() => replaceInputRef.current?.click()} type="button">Replace image</button>
                <button className="sanborn-button" onClick={() => void deleteSelectedSheet()} type="button">Delete sheet</button>
                <input accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden onChange={(event) => void replaceSelectedImage(event)} ref={replaceInputRef} type="file" />
              </div>

              <div className="map-studio-readonly">
                <p><strong>Asset ID:</strong> {selectedAsset.assetId}</p>
                <p><strong>Storage path:</strong> {selectedAsset.storagePath}</p>
                <p><strong>MIME:</strong> {selectedAsset.mimeType}</p>
                <p><strong>Size:</strong> {formatBytes(selectedAsset.byteSize)}</p>
                <p><strong>Dimensions:</strong> {selectedAsset.width} x {selectedAsset.height}</p>
                <p><strong>Checksum:</strong> {selectedAsset.checksum}</p>
                <p><strong>Uploaded:</strong> {formatDate(selectedAsset.uploadedAt)}</p>
                <p><strong>Last modified:</strong> {formatDate(selectedAsset.updatedAt)}</p>
              </div>

              {studioMode !== "stitching" ? (
                <div className="map-studio-georef-inspector">
                  <h3>Georeferencing</h3>
                  <p className="small-muted">Status: {georeferenceDraft.status}</p>
                  <p className="small-muted">Control points: {completeControlPoints.length} complete / {georeferenceDraft.controlPoints.length} total</p>
                  <p className="small-muted">Estimated error: {calculatedTransform.ok ? calculatedTransform.residualError.toExponential(3) : calculatedTransform.error}</p>
                  <p className="small-muted">Overlay bounds: {georeferenceDraft.bounds ? `${formatCoordinate(georeferenceDraft.bounds.northLatitude)}, ${formatCoordinate(georeferenceDraft.bounds.westLongitude)} to ${formatCoordinate(georeferenceDraft.bounds.southLatitude)}, ${formatCoordinate(georeferenceDraft.bounds.eastLongitude)}` : "unavailable"}</p>
                  <label>Georeference notes<textarea value={georeferenceDraft.notes} onChange={(event) => setGeoreferenceDraft({ ...georeferenceDraft, notes: event.target.value })} /></label>
                  {selectedControlPoint ? (
                    <div className="map-studio-control-point-editor">
                      <h4>Selected point</h4>
                      <label>Label<input value={selectedControlPoint.label} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { label: event.target.value })} /></label>
                      <label>Image X<input type="number" value={selectedControlPoint.imageX ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { imageX: Number(event.target.value) })} /></label>
                      <label>Image Y<input type="number" value={selectedControlPoint.imageY ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { imageY: Number(event.target.value) })} /></label>
                      <label>Latitude<input step="0.000001" type="number" value={selectedControlPoint.latitude ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { latitude: Number(event.target.value) })} /></label>
                      <label>Longitude<input step="0.000001" type="number" value={selectedControlPoint.longitude ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { longitude: Number(event.target.value) })} /></label>
                      <label>Confidence<input value={selectedControlPoint.confidence} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { confidence: event.target.value })} /></label>
                      <label>Notes<textarea value={selectedControlPoint.notes ?? ""} onChange={(event) => updateControlPoint(selectedControlPoint.controlPointId, { notes: event.target.value })} /></label>
                      <button className="sanborn-button" onClick={deleteSelectedControlPoint} type="button">Delete point</button>
                    </div>
                  ) : (
                    <p className="small-muted">No control point selected.</p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>

      <footer className="map-studio-statusbar">
        <span>Selected: {selectedAsset ? `Sheet ${selectedAsset.sheetNumber ?? "unknown"}` : "None"}</span>
        <span>Canvas: {canvasCoordinates.x}, {canvasCoordinates.y}</span>
        <span>Zoom: {Math.round(present.viewport.scale * 100)}%</span>
        <span>Unsaved: {isDirty ? "yes" : "no"}</span>
        <span>Duplicate sheets: {duplicateSheetNumbers.length ? duplicateSheetNumbers.join(", ") : "none"}</span>
        <span>Missing sheets: {missingSheetNumbers.length ? missingSheetNumbers.join(", ") : "none"}</span>
        <span>Save: {saveStatus}</span>
        <span>Status: {workspaceStatus}</span>
        <span>Map center: {formatCoordinate(mapCenter.latitude)}, {formatCoordinate(mapCenter.longitude)}</span>
        <span>Cursor GPS: {mapCursor ? `${formatCoordinate(mapCursor.latitude)}, ${formatCoordinate(mapCursor.longitude)}` : "outside map"}</span>
        <span>Selected GPS: {selectedControlPoint ? `${formatCoordinate(selectedControlPoint.latitude)}, ${formatCoordinate(selectedControlPoint.longitude)}` : "none"}</span>
        <span>Map zoom: {modernMapZoom}</span>
        <label><input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" /> Grid</label>
        <label><input checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} type="checkbox" /> Snap</label>
      </footer>
    </section>
  );
}

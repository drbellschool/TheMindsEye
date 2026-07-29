"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LatLngTuple } from "leaflet";

import { BirdsEyeSourceMap, type BirdsEyeSourceMapFitMode } from "@/components/BirdsEyeSourceMap";
import { SanbornSourceImageStatus, useSanbornSourceImageState } from "@/components/SanbornSourceImage";
import {
  birdsEyeAnchorTypes,
  birdsEyeCalibrationQuality,
  completeBirdsEyeControlPointCount,
  createBirdsEyeFlatProjection,
  defaultBirdsEyeGlobalParameters,
  projectBirdsEyeThroughSolve,
  solveBirdsEyeStagedCalibration,
  warpBirdsEyeForward,
  type BirdsEyeCalibration,
  type BirdsEyeControlPoint,
  type BirdsEyePerspectiveState,
  type BirdsEyePoint,
} from "@/lib/birds-eye-calibration";
import {
  birdsEyeSceneRegionTypes,
  buildBirdsEyeEvidencePackage,
  checksumBirdsEyeGeographicGeometry,
  createProjectedBirdsEyePresentation,
  denormalizeBirdsEyeImagePoint,
  deriveBirdsEyeCropBounds,
  getBirdsEyePlacedGeometryCoordinates,
  isBirdsEyePresentationStale,
  projectBirdsEyePlacedGeometry,
  replaceBirdsEyeGeometryVertex,
  resetBirdsEyePresentationAdjustment,
  rotateBirdsEyeGeometry,
  scaleBirdsEyeGeometry,
  translateBirdsEyeGeometry,
  validateBirdsEyeImageGeometry,
  type BirdsEyeImageGeometry,
  type BirdsEyeNormalizedPoint,
  type BirdsEyePiecePresentation,
  type BirdsEyePlacedGeometry,
  type BirdsEyeSceneRegion,
  type BirdsEyeSceneRegionType,
} from "@/lib/birds-eye-scene";
import { reviewStatuses } from "@/lib/community-status";
import type { SheetGeographicTransform } from "@/lib/historical-map-sheet-georeference";
import type { StudioSourceOption } from "@/lib/historical-map-studio";

type EditorMode =
  | "select"
  | "pan"
  | "add_calibration_point"
  | "draw_scene_region"
  | "edit_scene_region"
  | "link_map_piece"
  | "adjust_projected_piece";
type WorkspaceTab = "illustration" | "flat_map" | "warped_preview" | "scene_markup";
type InspectorTab = "calibration" | "regions" | "presentation" | "evidence";
type SaveState = "idle" | "saving" | "saved" | "error";
type Snapshot = {
  points: BirdsEyeControlPoint[];
  regions: BirdsEyeSceneRegion[];
  presentations: BirdsEyePiecePresentation[];
};

type Props = {
  state: BirdsEyePerspectiveState;
  townPackageId: string;
  atlasId: string;
  centerLatitude: number;
  centerLongitude: number;
  defaultZoom?: number;
  loading?: boolean;
  readOnly: boolean;
  placedGeometries: BirdsEyePlacedGeometry[];
  sheetBoundaries?: SheetGeographicTransform[];
  sourceOptions?: StudioSourceOption[];
  onStateChange: (state: BirdsEyePerspectiveState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const editorModes: Array<{ id: EditorMode; label: string }> = [
  { id: "select", label: "Select" },
  { id: "pan", label: "Pan" },
  { id: "add_calibration_point", label: "Add calibration point" },
  { id: "draw_scene_region", label: "Draw scene region" },
  { id: "edit_scene_region", label: "Edit scene region" },
  { id: "link_map_piece", label: "Link Map Piece" },
  { id: "adjust_projected_piece", label: "Adjust projected piece" },
];

const mobileTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "illustration", label: "Illustration" },
  { id: "flat_map", label: "Flat Map" },
  { id: "warped_preview", label: "Warped Preview" },
  { id: "scene_markup", label: "Scene Markup" },
];

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    points: structuredClone(snapshot.points),
    regions: structuredClone(snapshot.regions),
    presentations: structuredClone(snapshot.presentations),
  };
}

function pointCompletion(point: BirdsEyeControlPoint | null): { illustration: boolean; geographic: boolean } {
  return {
    illustration: Boolean(point && point.imageX !== null && point.imageY !== null),
    geographic: Boolean(point && point.longitude !== null && point.latitude !== null),
  };
}

function regionPath(geometry: BirdsEyeImageGeometry, width: number, height: number): string {
  return geometry.coordinates.map((point) => `${point.x * width},${point.y * height}`).join(" ");
}

function presentationGeometry(presentation: BirdsEyePiecePresentation): BirdsEyeImageGeometry {
  return presentation.adjustedImageGeometry ?? presentation.projectedImageGeometry;
}

function sourceMapCenter(
  centerLatitude: number,
  centerLongitude: number,
  pieces: BirdsEyePlacedGeometry[],
  points: BirdsEyeControlPoint[],
): LatLngTuple {
  if (Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude) && (Math.abs(centerLatitude) > 0.0001 || Math.abs(centerLongitude) > 0.0001)) {
    return [centerLatitude, centerLongitude];
  }
  const coordinates = [
    ...pieces.flatMap(getBirdsEyePlacedGeometryCoordinates),
    ...points.filter((point) => point.latitude !== null && point.longitude !== null).map((point) => ({ latitude: point.latitude!, longitude: point.longitude! })),
  ];
  if (coordinates.length === 0) return [20, 0];
  return [
    coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / coordinates.length,
    coordinates.reduce((sum, coordinate) => sum + coordinate.longitude, 0) / coordinates.length,
  ];
}

function imagePointFromPointer(
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number },
  view: { x: number; y: number; width: number; height: number },
): BirdsEyePoint {
  const bounds = svg.getBoundingClientRect();
  return {
    x: view.x + ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * view.width,
    y: view.y + ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * view.height,
  };
}

function newControlPoint(sequence: number): BirdsEyeControlPoint {
  return {
    id: `draft-${sequence}`,
    sequence,
    label: `Point ${sequence}`,
    note: "",
    anchorType: "other",
    linkedMapPieceId: null,
    longitude: null,
    latitude: null,
    imageX: null,
    imageY: null,
    sourceMapZoom: null,
    sourceMapBearing: null,
    sourceMapLabel: "",
    historicalImageNote: "",
    geographicNote: "",
    enabled: true,
    deletedAt: null,
  };
}

function saveLabel(state: SaveState): string {
  return state === "saving" ? "Saving" : state === "saved" ? "Saved" : state === "error" ? "Save failed" : "Unsaved";
}

function upsertSceneRegions(
  current: BirdsEyeSceneRegion[],
  incoming: readonly BirdsEyeSceneRegion[],
): BirdsEyeSceneRegion[] {
  const replacements = new Map(incoming.map((region) => [region.regionId, region]));
  const merged = current.map((region) => replacements.get(region.regionId) ?? region);
  const existing = new Set(current.map((region) => region.regionId));
  return [...merged, ...incoming.filter((region) => !existing.has(region.regionId))];
}

function upsertPiecePresentations(
  current: BirdsEyePiecePresentation[],
  incoming: readonly BirdsEyePiecePresentation[],
): BirdsEyePiecePresentation[] {
  const key = (presentation: BirdsEyePiecePresentation) => `${presentation.referenceAssetId}:${presentation.mapPieceId}`;
  const replacements = new Map(incoming.map((presentation) => [key(presentation), presentation]));
  const merged = current.map((presentation) => replacements.get(key(presentation)) ?? presentation);
  const existing = new Set(current.map(key));
  return [...merged, ...incoming.filter((presentation) => !existing.has(key(presentation)))];
}

export function BirdsEyePerspectiveWorkspace({
  state,
  townPackageId,
  atlasId,
  centerLatitude,
  centerLongitude,
  defaultZoom = 16,
  loading = false,
  readOnly,
  placedGeometries,
  sheetBoundaries = [],
  sourceOptions = [],
  onStateChange,
  onDirtyChange,
}: Props) {
  const reference = state.assets.find((asset) => asset.assetId === state.designatedAssetId) ?? null;
  const imageLifecycle = useSanbornSourceImageState({
    asset: reference
      ? {
        assetId: reference.assetId,
        signedUrl: reference.signedUrl,
        originalFilename: reference.originalFilename,
        width: reference.width,
        height: reference.height,
      }
      : null,
  });
  const referenceRef = useRef<SVGSVGElement | null>(null);
  const [points, setPoints] = useState<BirdsEyeControlPoint[]>(state.controlPoints);
  const [regions, setRegions] = useState<BirdsEyeSceneRegion[]>(state.sceneRegions);
  const [presentations, setPresentations] = useState<BirdsEyePiecePresentation[]>(state.piecePresentations);
  const [parameters, setParameters] = useState(state.calibration?.globalParameters ?? { ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude });
  const [selectedSequence, setSelectedSequence] = useState<number | null>(state.controlPoints[0]?.sequence ?? null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(state.sceneRegions[0]?.regionId ?? null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(state.piecePresentations[0]?.mapPieceId ?? null);
  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("illustration");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("calibration");
  const [draftVertices, setDraftVertices] = useState<BirdsEyeNormalizedPoint[]>([]);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [dragVertex, setDragVertex] = useState<{ kind: "region" | "presentation"; id: string; index: number } | null>(null);
  const dragHistoryPushedRef = useRef(false);
  const [showSceneRegions, setShowSceneRegions] = useState(true);
  const [showPresentations, setShowPresentations] = useState(true);
  const [showControlPoints, setShowControlPoints] = useState(true);
  const [showMapPieces, setShowMapPieces] = useState(true);
  const [showSheetBoundaries, setShowSheetBoundaries] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLngTuple>(() => sourceMapCenter(centerLatitude, centerLongitude, placedGeometries, state.controlPoints));
  const [mapZoom, setMapZoom] = useState(defaultZoom);
  const [mapCursor, setMapCursor] = useState<{ latitude: number; longitude: number } | null>(null);
  const [basemapKey, setBasemapKey] = useState("osm");
  const [mapFitRequest, setMapFitRequest] = useState<{ mode: BirdsEyeSourceMapFitMode; token: number }>({ mode: "town", token: 0 });
  const [comparisonMode, setComparisonMode] = useState<"side_by_side" | "overlay" | "difference">("side_by_side");
  const [comparisonOpacity, setComparisonOpacity] = useState(0.5);
  const [blinkComparison, setBlinkComparison] = useState(false);
  const [blinkVisible, setBlinkVisible] = useState(true);
  const [calibrationSaveState, setCalibrationSaveState] = useState<SaveState>("idle");
  const [regionSaveState, setRegionSaveState] = useState<SaveState>("idle");
  const [presentationSaveState, setPresentationSaveState] = useState<SaveState>("idle");
  const [calibrationDirty, setCalibrationDirty] = useState(false);
  const [regionDirty, setRegionDirty] = useState(false);
  const [presentationDirty, setPresentationDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [regionSearch, setRegionSearch] = useState("");
  const [regionTypeFilter, setRegionTypeFilter] = useState<"all" | BirdsEyeSceneRegionType>("all");
  const [regionLinkFilter, setRegionLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [regionReviewFilter, setRegionReviewFilter] = useState<"all" | "reviewed" | "unreviewed">("all");
  const [regionVisibilityFilter, setRegionVisibilityFilter] = useState<"all" | "visible" | "hidden">("all");
  const [regionConfidenceFilter, setRegionConfidenceFilter] = useState<"all" | "high" | "medium" | "low" | "unset">("all");
  const [historyPast, setHistoryPast] = useState<Snapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<Snapshot[]>([]);

  const width = Math.max(1, reference?.width ?? 1600);
  const height = Math.max(1, reference?.height ?? 900);
  const townCenter = Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude) &&
    (Math.abs(centerLatitude) > 0.0001 || Math.abs(centerLongitude) > 0.0001)
    ? [centerLatitude, centerLongitude] as LatLngTuple
    : null;
  const viewBox = useMemo(() => {
    const viewWidth = width / view.zoom;
    const viewHeight = height / view.zoom;
    return { x: view.x, y: view.y, width: viewWidth, height: viewHeight };
  }, [height, view.x, view.y, view.zoom, width]);
  const selectedPoint = points.find((point) => point.sequence === selectedSequence) ?? null;
  const selectedRegion = regions.find((region) => region.regionId === selectedRegionId) ?? null;
  const completion = pointCompletion(selectedPoint);
  const geographicCoordinates = useMemo(
    () => [
      ...placedGeometries.flatMap(getBirdsEyePlacedGeometryCoordinates),
      ...points.filter((point) => point.longitude !== null && point.latitude !== null).map((point) => ({ longitude: point.longitude!, latitude: point.latitude! })),
    ],
    [placedGeometries, points],
  );
  const flatProjection = useMemo(
    () => createBirdsEyeFlatProjection({ coordinates: geographicCoordinates, centerLatitude, centerLongitude, width, height }),
    [centerLatitude, centerLongitude, geographicCoordinates, height, width],
  );
  const solve = useMemo(() => solveBirdsEyeStagedCalibration({ points, flatProjection }), [flatProjection, points]);
  const effectivePresentations = useMemo(() => placedGeometries.flatMap((source) => {
    const projected = projectBirdsEyePlacedGeometry(source, (coordinate) => {
      const point = projectBirdsEyeThroughSolve(coordinate.longitude, coordinate.latitude, solve);
      return { x: point.x / width, y: point.y / height };
    });
    if (!projected) return [];
    const existing = presentations.find((presentation) => presentation.mapPieceId === source.id && presentation.referenceAssetId === state.designatedAssetId) ?? null;
    return [createProjectedBirdsEyePresentation({
      atlasId,
      geometry: projected,
      referenceAssetId: state.designatedAssetId ?? "",
      source,
      townPackageId,
      existing,
    })];
  }), [atlasId, height, placedGeometries, presentations, solve, state.designatedAssetId, townPackageId, width]);
  const selectedPresentation = effectivePresentations.find((presentation) => presentation.mapPieceId === selectedPieceId) ?? null;
  const selectedSourceGeometry = placedGeometries.find((piece) => piece.id === selectedPieceId) ?? null;
  const dirty = calibrationDirty || regionDirty || presentationDirty || draftVertices.length > 0;
  const activeSnapshot = useMemo(() => ({ points, regions, presentations }), [points, presentations, regions]);

  useEffect(() => {
    if (loading || !state.ready) return;
    setPoints(state.controlPoints);
    setRegions(state.sceneRegions);
    setPresentations(state.piecePresentations);
    setParameters(state.calibration?.globalParameters ?? { ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude });
    setSelectedSequence((current) => state.controlPoints.some((point) => point.sequence === current) ? current : state.controlPoints[0]?.sequence ?? null);
    setSelectedRegionId((current) => state.sceneRegions.some((region) => region.regionId === current) ? current : state.sceneRegions[0]?.regionId ?? null);
    setSelectedPieceId((current) => state.piecePresentations.some((presentation) => presentation.mapPieceId === current) ? current : state.piecePresentations[0]?.mapPieceId ?? null);
    setCalibrationDirty(false);
    setRegionDirty(false);
    setPresentationDirty(false);
    setHistoryPast([]);
    setHistoryFuture([]);
  }, [atlasId, centerLatitude, centerLongitude, loading, state.designatedAssetId, state.ready]);

  useEffect(() => {
    const nextCenter = sourceMapCenter(centerLatitude, centerLongitude, placedGeometries, state.controlPoints);
    setMapCenter(nextCenter);
    setMapZoom(defaultZoom);
    setMapFitRequest((current) => ({ mode: "town", token: current.token + 1 }));
    setView({ zoom: 1, x: 0, y: 0 });
    setEditorMode("select");
  }, [atlasId, defaultZoom, readOnly, state.designatedAssetId, townPackageId]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!blinkComparison) {
      setBlinkVisible(true);
      return;
    }
    const interval = window.setInterval(() => setBlinkVisible((visible) => !visible), 650);
    return () => window.clearInterval(interval);
  }, [blinkComparison]);

  function pushHistory() {
    setHistoryPast((past) => [...past.slice(-39), cloneSnapshot(activeSnapshot)]);
    setHistoryFuture([]);
  }

  function undo() {
    const previous = historyPast.at(-1);
    if (!previous) return;
    setHistoryFuture((future) => [cloneSnapshot(activeSnapshot), ...future].slice(0, 40));
    setHistoryPast((past) => past.slice(0, -1));
    setPoints(previous.points);
    setRegions(previous.regions);
    setPresentations(previous.presentations);
    setCalibrationDirty(true);
    setRegionDirty(true);
    setPresentationDirty(true);
  }

  function redo() {
    const next = historyFuture[0];
    if (!next) return;
    setHistoryPast((past) => [...past.slice(-39), cloneSnapshot(activeSnapshot)]);
    setHistoryFuture((future) => future.slice(1));
    setPoints(next.points);
    setRegions(next.regions);
    setPresentations(next.presentations);
    setCalibrationDirty(true);
    setRegionDirty(true);
    setPresentationDirty(true);
  }

  function patchPoint(sequence: number, patch: Partial<BirdsEyeControlPoint>, history = true) {
    if (history) pushHistory();
    setPoints((current) => current.map((point) => point.sequence === sequence ? { ...point, ...patch } : point));
    setCalibrationDirty(true);
    setCalibrationSaveState("idle");
  }

  function patchRegion(regionId: string, patch: Partial<BirdsEyeSceneRegion>, history = true) {
    if (history) pushHistory();
    setRegions((current) => current.map((region) => region.regionId === regionId ? { ...region, ...patch, isPersisted: false } : region));
    setRegionDirty(true);
    setRegionSaveState("idle");
  }

  function upsertPresentation(presentation: BirdsEyePiecePresentation, history = true) {
    if (history) pushHistory();
    setPresentations((current) => {
      const exists = current.some((candidate) => candidate.mapPieceId === presentation.mapPieceId && candidate.referenceAssetId === presentation.referenceAssetId);
      return exists
        ? current.map((candidate) => candidate.mapPieceId === presentation.mapPieceId && candidate.referenceAssetId === presentation.referenceAssetId ? { ...presentation, isPersisted: false } : candidate)
        : [...current, { ...presentation, isPersisted: false }];
    });
    setPresentationDirty(true);
    setPresentationSaveState("idle");
  }

  function addControlPoint() {
    if (readOnly) return;
    pushHistory();
    const sequence = points.length ? Math.max(...points.map((point) => point.sequence)) + 1 : 1;
    setPoints((current) => [...current, newControlPoint(sequence)]);
    setSelectedSequence(sequence);
    setEditorMode("add_calibration_point");
    setInspectorTab("calibration");
    setWorkspaceTab("illustration");
    setCalibrationDirty(true);
    setMessage(`Point ${sequence}: click this landmark in both the illustration and flat map.`);
  }

  function focusIllustrationPoint(point: BirdsEyeControlPoint) {
    if (point.imageX === null || point.imageY === null) return;
    const zoom = Math.max(2, view.zoom);
    setView({
      zoom,
      x: Math.max(0, Math.min(width - width / zoom, point.imageX - width / zoom / 2)),
      y: Math.max(0, Math.min(height - height / zoom, point.imageY - height / zoom / 2)),
    });
    setWorkspaceTab("illustration");
  }

  function setZoom(nextZoom: number) {
    const zoom = Math.max(1, Math.min(12, nextZoom));
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    const nextWidth = width / zoom;
    const nextHeight = height / zoom;
    setView({
      zoom,
      x: Math.max(0, Math.min(width - nextWidth, centerX - nextWidth / 2)),
      y: Math.max(0, Math.min(height - nextHeight, centerY - nextHeight / 2)),
    });
  }

  function pointerToNormalized(event: { clientX: number; clientY: number }): BirdsEyeNormalizedPoint | null {
    if (!referenceRef.current) return null;
    const point = imagePointFromPointer(referenceRef.current, event, viewBox);
    return {
      x: Math.max(0, Math.min(1, point.x / width)),
      y: Math.max(0, Math.min(1, point.y / height)),
    };
  }

  function handleIllustrationPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (editorMode !== "pan") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning({ clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y });
  }

  function handleIllustrationPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (panning && referenceRef.current) {
      const bounds = referenceRef.current.getBoundingClientRect();
      const deltaX = (event.clientX - panning.clientX) / Math.max(1, bounds.width) * viewBox.width;
      const deltaY = (event.clientY - panning.clientY) / Math.max(1, bounds.height) * viewBox.height;
      setView((current) => ({
        ...current,
        x: Math.max(0, Math.min(width - viewBox.width, panning.x - deltaX)),
        y: Math.max(0, Math.min(height - viewBox.height, panning.y - deltaY)),
      }));
      return;
    }
    if (!dragVertex || readOnly) return;
    const normalized = pointerToNormalized(event);
    if (!normalized) return;
    if (!dragHistoryPushedRef.current) {
      pushHistory();
      dragHistoryPushedRef.current = true;
    }
    if (dragVertex.kind === "region") {
      setRegions((current) => current.map((region) => region.regionId === dragVertex.id
        ? {
            ...region,
            imageGeometry: replaceBirdsEyeGeometryVertex(region.imageGeometry, dragVertex.index, normalized),
            cropBounds: deriveBirdsEyeCropBounds(replaceBirdsEyeGeometryVertex(region.imageGeometry, dragVertex.index, normalized)),
            isPersisted: false,
          }
        : region));
      setRegionDirty(true);
    } else {
      const presentation = effectivePresentations.find((candidate) => candidate.mapPieceId === dragVertex.id);
      if (!presentation || presentation.isLocked) return;
      const adjusted = replaceBirdsEyeGeometryVertex(presentationGeometry(presentation), dragVertex.index, normalized);
      upsertPresentation({ ...presentation, adjustedImageGeometry: adjusted, adjustmentStatus: presentation.isVisible ? "adjusted" : "hidden" }, false);
    }
  }

  function handleIllustrationPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPanning(null);
    setDragVertex(null);
    dragHistoryPushedRef.current = false;
  }

  function handleIllustrationClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (readOnly || panning || dragVertex) return;
    const normalized = pointerToNormalized(event);
    if (!normalized) return;
    if (editorMode === "draw_scene_region") {
      if (event.detail > 1) {
        finishRegion();
        return;
      }
      setDraftVertices((current) => [...current, normalized]);
      return;
    }
    if (editorMode === "add_calibration_point" && selectedPoint) {
      const originalImagePoint = denormalizeBirdsEyeImagePoint(normalized, width, height);
      patchPoint(selectedPoint.sequence, { imageX: originalImagePoint.x, imageY: originalImagePoint.y });
      setMessage(`Point ${selectedPoint.sequence}: illustration complete. ${completion.geographic ? "Pair complete." : "Click the same landmark on the flat map."}`);
    }
  }

  function finishRegion() {
    if (!reference || draftVertices.length < 3) {
      setMessage("A scene region needs at least three vertices.");
      return;
    }
    const validation = validateBirdsEyeImageGeometry({ geometryType: "polygon", coordinates: draftVertices, coordinateSpace: "normalized_image" }, { polygonOnly: true });
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }
    pushHistory();
    const regionId = `birds-eye-region-${crypto.randomUUID()}`;
    const region: BirdsEyeSceneRegion = {
      id: null,
      regionId,
      townPackageId,
      atlasId,
      referenceAssetId: reference.assetId,
      regionType: "unknown",
      label: `Unidentified region ${regions.length + 1}`,
      description: "",
      imageGeometry: validation.geometry,
      linkedMapPieceId: null,
      linkedSourceRecordId: null,
      linkedBuildingId: null,
      evidenceClassification: "unknown",
      reviewStatus: "unknown",
      confidence: null,
      visibleFeatures: {},
      reconstructionNotes: "",
      renderingNotes: "",
      cropBounds: deriveBirdsEyeCropBounds(validation.geometry),
      isVisible: true,
      isLocked: false,
      sortOrder: regions.length,
      createdAt: null,
      updatedAt: null,
      archivedAt: null,
      isPersisted: false,
    };
    setRegions((current) => [...current, region]);
    setSelectedRegionId(regionId);
    setDraftVertices([]);
    setEditorMode("edit_scene_region");
    setInspectorTab("regions");
    setRegionDirty(true);
    setMessage("Scene region created. Add provenance and review details, then save.");
  }

  function handleIllustrationKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") {
      cancelRegionDraft();
      setDragVertex(null);
    } else if (event.key === "Backspace" && draftVertices.length > 0) {
      event.preventDefault();
      setDraftVertices((current) => current.slice(0, -1));
    } else if (event.key === "Enter" && editorMode === "draw_scene_region") {
      event.preventDefault();
      finishRegion();
    }
  }

  function cancelRegionDraft() {
    if (draftVertices.length > 0 && !window.confirm("Discard the unsaved scene-region polygon?")) return;
    setDraftVertices([]);
    setMessage("Scene-region draft canceled.");
  }

  function selectPresentation(pieceId: string) {
    setSelectedPieceId(pieceId);
    setInspectorTab("presentation");
    if (!readOnly && editorMode === "link_map_piece" && selectedRegion) {
      patchRegion(selectedRegion.regionId, { linkedMapPieceId: pieceId });
      setMessage(`${selectedRegion.label} linked to Map Piece ${pieceId}. Save the region to persist the link.`);
    }
  }

  function handleMapClick(latitude: number, longitude: number, zoom: number) {
    if (readOnly || editorMode !== "add_calibration_point" || !selectedPoint) return;
    patchPoint(selectedPoint.sequence, {
      latitude,
      longitude,
      sourceMapZoom: zoom,
      sourceMapBearing: 0,
      sourceMapLabel: basemapKey,
    });
    const imageReady = selectedPoint.imageX !== null && selectedPoint.imageY !== null;
    setMessage(`Point ${selectedPoint.sequence}: geographic map complete. ${imageReady ? "Pair complete." : "Click the same landmark in the illustration."}`);
  }

  async function saveCalibration() {
    if (readOnly || !reference) return;
    setCalibrationSaveState("saving");
    setMessage("");
    const completePoints = completeBirdsEyeControlPointCount(points);
    const quality = {
      ...birdsEyeCalibrationQuality(points, new Date().toISOString(), new Date().toISOString()),
      valid: solve.valid,
      averageResidualPixels: solve.averageResidualPixels,
      maximumResidualPixels: solve.maximumResidualPixels,
      worstPointSequence: solve.worstPointSequence,
      stage: solve.stage,
      warnings: solve.warnings,
    };
    const calibrationPayload = {
      referenceAssetId: reference.assetId,
      title: state.calibration?.title ?? "Birds-Eye Perspective Calibration",
      status: solve.valid ? "saved" : "draft",
      unavailableReason: null,
      globalParameters: parameters,
      warpType: "delaunay_piecewise_affine",
      solverVersion: "birds-eye-v2",
      warpModel: {
        stage: solve.stage,
        globalMatrix: solve.globalMatrix,
        flatProjection: solve.flatProjection,
        localWarp: solve.localWarp,
        residuals: solve.residuals,
      },
      qualitySummary: quality,
      notes: state.calibration?.notes ?? "",
    };
    const response = await fetch("/api/community/historical-map-studio/birds-eye-calibration", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ townPackageId, atlasId, calibration: calibrationPayload, controlPoints: points }),
    });
    const result = await response.json().catch(() => null) as { message?: string; calibrationId?: string; pointIds?: Array<{ id: string; sequence: number }> } | null;
    if (!response.ok) {
      setCalibrationSaveState("error");
      setMessage(result?.message ?? "Calibration could not be saved.");
      return;
    }
    const pointIds = new Map((result?.pointIds ?? []).map((point) => [point.sequence, point.id]));
    const savedPoints = points.map((point) => ({ ...point, id: pointIds.get(point.sequence) ?? point.id }));
    const saved: BirdsEyeCalibration = {
      id: result?.calibrationId ?? state.calibration?.id ?? null,
      townPackageId,
      atlasId,
      referenceAssetId: reference.assetId,
      title: String(calibrationPayload.title),
      status: calibrationPayload.status as BirdsEyeCalibration["status"],
      unavailableReason: null,
      globalParameters: parameters,
      warpType: "delaunay_piecewise_affine",
      solverVersion: "birds-eye-v2",
      warpModel: calibrationPayload.warpModel,
      quality,
      notes: String(calibrationPayload.notes),
      updatedAt: new Date().toISOString(),
    };
    const projectionCandidates = effectivePresentations.filter((presentation) => {
      const local = presentations.find((candidate) => candidate.referenceAssetId === presentation.referenceAssetId && candidate.mapPieceId === presentation.mapPieceId);
      if (local && !local.isPersisted) return false;
      return !local ||
        local.sourceGeographicGeometryChecksum !== presentation.sourceGeographicGeometryChecksum ||
        local.adjustmentStatus !== presentation.adjustmentStatus ||
        JSON.stringify(local.projectedImageGeometry) !== JSON.stringify(presentation.projectedImageGeometry);
    });
    let savedProjectionRows: BirdsEyePiecePresentation[] = [];
    let failedProjectionRows: BirdsEyePiecePresentation[] = [];
    let projectionMessage = "";
    if (projectionCandidates.length > 0 && state.sceneDataSource === "supabase") {
      setPresentationSaveState("saving");
      const projectionResponse = await fetch("/api/community/historical-map-studio/birds-eye-piece-presentations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          townPackageId,
          atlasId,
          referenceAssetId: reference.assetId,
          presentations: projectionCandidates,
        }),
      });
      const projectionResult = await projectionResponse.json().catch(() => null) as { message?: string; presentations?: BirdsEyePiecePresentation[] } | null;
      if (projectionResponse.ok && projectionResult?.presentations?.length === projectionCandidates.length) {
        savedProjectionRows = projectionResult.presentations;
        setPresentationSaveState("saved");
        projectionMessage = ` ${savedProjectionRows.length} projected Map Piece baseline${savedProjectionRows.length === 1 ? "" : "s"} saved separately.`;
      } else {
        setPresentationSaveState("error");
        failedProjectionRows = projectionCandidates.map((presentation) => ({ ...presentation, isPersisted: false }));
        projectionMessage = ` Projected Map Pieces were not saved: ${projectionResult?.message ?? "unknown persistence error"}`;
      }
    }
    const nextPresentations = upsertPiecePresentations(presentations, savedProjectionRows.length ? savedProjectionRows : failedProjectionRows);
    const authoritativePresentations = upsertPiecePresentations(state.piecePresentations, savedProjectionRows);
    setPoints(savedPoints);
    setPresentations(nextPresentations);
    setCalibrationDirty(false);
    setPresentationDirty(nextPresentations.some((presentation) => !presentation.isPersisted));
    setCalibrationSaveState("saved");
    onStateChange({ ...state, calibration: saved, controlPoints: savedPoints, piecePresentations: authoritativePresentations });
    setMessage(`Calibration saved with ${completePoints} complete pair${completePoints === 1 ? "" : "s"}. ${solve.statusLabel}.${projectionMessage}`);
  }

  async function saveRegion(region = selectedRegion) {
    if (readOnly || !reference || !region) return;
    const validation = validateBirdsEyeImageGeometry(region.imageGeometry, { polygonOnly: true });
    if (!validation.ok) {
      setRegionSaveState("error");
      setMessage(validation.message);
      return;
    }
    setRegionSaveState("saving");
    const response = await fetch("/api/community/historical-map-studio/birds-eye-scene-regions", {
      method: region.isPersisted ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ townPackageId, atlasId, referenceAssetId: reference.assetId, region: { ...region, imageGeometry: validation.geometry, cropBounds: deriveBirdsEyeCropBounds(validation.geometry) } }),
    });
    const result = await response.json().catch(() => null) as { message?: string; region?: BirdsEyeSceneRegion } | null;
    if (!response.ok || !result?.region) {
      setRegionSaveState("error");
      setMessage(result?.message ?? "Scene region could not be saved.");
      return;
    }
    const nextRegions = regions.map((candidate) => candidate.regionId === result.region!.regionId ? result.region! : candidate);
    setRegions(nextRegions);
    setRegionDirty(nextRegions.some((candidate) => !candidate.isPersisted));
    setRegionSaveState("saved");
    onStateChange({ ...state, sceneRegions: upsertSceneRegions(state.sceneRegions, [result.region]) });
    setMessage(`${result.region.label} saved with its edition and reference provenance.`);
  }

  async function archiveRegion() {
    if (readOnly || !reference || !selectedRegion) return;
    if (!selectedRegion.isPersisted) {
      pushHistory();
      const nextRegions = regions.filter((region) => region.regionId !== selectedRegion.regionId);
      setRegions(nextRegions);
      setSelectedRegionId(nextRegions[0]?.regionId ?? null);
      setRegionDirty(nextRegions.some((region) => !region.isPersisted));
      return;
    }
    if (!window.confirm(`Archive ${selectedRegion.label}? Its review history and provenance will be retained.`)) return;
    setRegionSaveState("saving");
    const response = await fetch("/api/community/historical-map-studio/birds-eye-scene-regions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ townPackageId, atlasId, referenceAssetId: reference.assetId, regionId: selectedRegion.regionId }),
    });
    const result = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) {
      setRegionSaveState("error");
      setMessage(result?.message ?? "Scene region could not be archived.");
      return;
    }
    const nextRegions = regions.filter((region) => region.regionId !== selectedRegion.regionId);
    setRegions(nextRegions);
    setSelectedRegionId(nextRegions[0]?.regionId ?? null);
    setRegionDirty(nextRegions.some((region) => !region.isPersisted));
    setRegionSaveState("saved");
    onStateChange({ ...state, sceneRegions: state.sceneRegions.filter((region) => region.regionId !== selectedRegion.regionId) });
    setMessage("Scene region archived. Its audit history was preserved.");
  }

  async function savePresentation(presentation = selectedPresentation) {
    if (readOnly || !reference || !presentation) return;
    setPresentationSaveState("saving");
    const response = await fetch("/api/community/historical-map-studio/birds-eye-piece-presentations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ townPackageId, atlasId, referenceAssetId: reference.assetId, presentation }),
    });
    const result = await response.json().catch(() => null) as { message?: string; presentation?: BirdsEyePiecePresentation } | null;
    if (!response.ok || !result?.presentation) {
      setPresentationSaveState("error");
      setMessage(result?.message ?? "Piece presentation could not be saved.");
      return;
    }
    const next = upsertPiecePresentations(presentations, [result.presentation]);
    setPresentations(next);
    setPresentationDirty(next.some((candidate) => !candidate.isPersisted));
    setPresentationSaveState("saved");
    onStateChange({ ...state, piecePresentations: upsertPiecePresentations(state.piecePresentations, [result.presentation]) });
    setMessage(`${result.presentation.displayLabel} presentation saved. Map Placement was not modified.`);
  }

  function adjustSelectedPresentation(transform: (geometry: BirdsEyeImageGeometry) => BirdsEyeImageGeometry) {
    if (!selectedPresentation || selectedPresentation.isLocked || readOnly) return;
    const adjusted = transform(presentationGeometry(selectedPresentation));
    upsertPresentation({ ...selectedPresentation, adjustedImageGeometry: adjusted, adjustmentStatus: selectedPresentation.isVisible ? "adjusted" : "hidden" });
  }

  function reprojectSelectedPresentation() {
    if (!selectedPresentation || !selectedSourceGeometry || readOnly) return;
    if (selectedPresentation.adjustedImageGeometry && !window.confirm("Reproject from authoritative Map Placement? The adjusted presentation will be preserved, but its projected baseline and source fingerprint will change.")) return;
    const projected = projectBirdsEyePlacedGeometry(selectedSourceGeometry, (coordinate) => {
      const point = projectBirdsEyeThroughSolve(coordinate.longitude, coordinate.latitude, solve);
      return { x: point.x / width, y: point.y / height };
    });
    if (!projected) return;
    upsertPresentation({
      ...selectedPresentation,
      projectedImageGeometry: projected,
      sourceGeographicGeometryChecksum: checksumBirdsEyeGeographicGeometry(selectedSourceGeometry),
      adjustmentStatus: !selectedPresentation.isVisible ? "hidden" : selectedPresentation.adjustedImageGeometry ? "adjusted" : selectedPresentation.reviewStatus === "unknown" ? "projected" : "reviewed",
    });
    setMessage("Projected baseline refreshed from Map Placement. Geographic source geometry remains unchanged.");
  }

  async function copyEvidencePackage() {
    if (!reference) return;
    const evidence = buildBirdsEyeEvidencePackage({
      referenceAssetId: reference.assetId,
      referenceFilename: reference.originalFilename,
      region: selectedRegion,
      presentation: selectedRegion?.linkedMapPieceId
        ? effectivePresentations.find((presentation) => presentation.mapPieceId === selectedRegion.linkedMapPieceId) ?? null
        : selectedPresentation,
    });
    await navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
    setMessage("Evidence package copied without a signed image URL.");
  }

  const evidencePackage = reference ? buildBirdsEyeEvidencePackage({
    referenceAssetId: reference.assetId,
    referenceFilename: reference.originalFilename,
    region: selectedRegion,
    presentation: selectedRegion?.linkedMapPieceId
      ? effectivePresentations.find((presentation) => presentation.mapPieceId === selectedRegion.linkedMapPieceId) ?? null
      : selectedPresentation,
  }) : null;
  const filteredRegions = regions.filter((region) => {
    if (regionTypeFilter !== "all" && region.regionType !== regionTypeFilter) return false;
    if (regionLinkFilter === "linked" && !region.linkedMapPieceId && !region.linkedSourceRecordId && !region.linkedBuildingId) return false;
    if (regionLinkFilter === "unlinked" && (region.linkedMapPieceId || region.linkedSourceRecordId || region.linkedBuildingId)) return false;
    if (regionReviewFilter === "reviewed" && region.reviewStatus === "unknown") return false;
    if (regionReviewFilter === "unreviewed" && region.reviewStatus !== "unknown") return false;
    if (regionVisibilityFilter === "visible" && !region.isVisible) return false;
    if (regionVisibilityFilter === "hidden" && region.isVisible) return false;
    if (regionConfidenceFilter === "unset" && region.confidence !== null) return false;
    if (regionConfidenceFilter === "high" && (region.confidence === null || region.confidence < 0.8)) return false;
    if (regionConfidenceFilter === "medium" && (region.confidence === null || region.confidence < 0.5 || region.confidence >= 0.8)) return false;
    if (regionConfidenceFilter === "low" && (region.confidence === null || region.confidence >= 0.5)) return false;
    const query = regionSearch.trim().toLowerCase();
    return !query || region.label.toLowerCase().includes(query) || region.description.toLowerCase().includes(query);
  });

  if (loading || !state.ready) {
    return <section className="birds-eye-workspace birds-eye-workspace--loading" aria-busy="true" aria-live="polite"><h2>Birds-Eye Calibration &amp; Scene Markup</h2><p>Loading saved calibration, control points, scene regions, and presentation geometry…</p></section>;
  }

  if (!reference) {
    return <section className="birds-eye-workspace birds-eye-workspace--empty"><h2>Birds-Eye Calibration &amp; Scene Markup</h2><p>Designate an edition-scoped Birds-Eye Reference in Town &amp; Edition before calibrating or tracing scene evidence.</p></section>;
  }

  const previewPieces = effectivePresentations.filter((presentation) => presentation.isVisible);
  const previewPieceCoordinates = previewPieces.flatMap((presentation) => presentation.projectedImageGeometry.coordinates);
  const previewPieceBounds = previewPieceCoordinates.length > 0
    ? {
        x: Math.min(...previewPieceCoordinates.map((point) => point.x)) * width,
        y: Math.min(...previewPieceCoordinates.map((point) => point.y)) * height,
        width: (Math.max(...previewPieceCoordinates.map((point) => point.x)) - Math.min(...previewPieceCoordinates.map((point) => point.x))) * width,
        height: (Math.max(...previewPieceCoordinates.map((point) => point.y)) - Math.min(...previewPieceCoordinates.map((point) => point.y))) * height,
      }
    : null;
  const gridLines = Array.from({ length: 9 }, (_, index) => index / 8).flatMap((ratio, index) => {
    const vertical = Array.from({ length: 17 }, (_, sample) => ({ x: ratio * width, y: sample / 16 * height }));
    const horizontal = Array.from({ length: 17 }, (_, sample) => ({ x: sample / 16 * width, y: ratio * height }));
    const transform = (point: BirdsEyePoint) => {
      const global = {
        x: solve.globalMatrix.a * point.x + solve.globalMatrix.c * point.y + solve.globalMatrix.e,
        y: solve.globalMatrix.b * point.x + solve.globalMatrix.d * point.y + solve.globalMatrix.f,
      };
      return solve.stage === "local" ? warpBirdsEyeForward(global, solve.localWarp) : global;
    };
    return [
      { id: `v-${index}`, points: vertical.map(transform) },
      { id: `h-${index}`, points: horizontal.map(transform) },
    ];
  });

  return (
    <section className="birds-eye-workspace" aria-label="Birds-Eye calibration and scene-markup workspace">
      <header className="birds-eye-workspace__header">
        <div>
          <span className="panel__eyebrow">Step 7 · downstream visual evidence</span>
          <h2>Birds-Eye Calibration &amp; Scene Markup</h2>
          <p>{reference.originalFilename} · {reference.width} × {reference.height}px · Data source: {state.dataSource === "supabase" ? "Supabase" : "Unavailable"}</p>
        </div>
        <div className="birds-eye-workspace__save-summary" aria-label="Step 7 save states">
          <span className={`is-${calibrationSaveState}`}>Calibration: {saveLabel(calibrationSaveState)}</span>
          <span className={`is-${regionSaveState}`}>Region: {saveLabel(regionSaveState)}</span>
          <span className={`is-${presentationSaveState}`}>Presentation: {saveLabel(presentationSaveState)}</span>
        </div>
      </header>

      {readOnly ? <p className="birds-eye-banner is-read-only">This archived or unavailable edition is read-only. Calibration, regions, and presentations remain viewable.</p> : null}
      {state.sceneDataSource === "migration_required" ? <p className="birds-eye-banner is-warning">Scene-region and presentation persistence requires migration <code>0026_birds_eye_scene_regions.sql</code>. Existing calibration remains available.</p> : null}
      <div className="birds-eye-workspace__toolbar" role="toolbar" aria-label="Birds-Eye editor modes">
        {editorModes.map((mode) => <button aria-pressed={editorMode === mode.id} className={`sanborn-button${editorMode === mode.id ? " sanborn-button--primary" : ""}`} disabled={readOnly && mode.id !== "select" && mode.id !== "pan"} key={mode.id} onClick={() => { setEditorMode(mode.id); if (mode.id === "draw_scene_region") setWorkspaceTab("scene_markup"); }} type="button">{mode.label}</button>)}
        <span className="birds-eye-workspace__toolbar-divider" />
        <button className="sanborn-button" disabled={historyPast.length === 0 || readOnly} onClick={undo} type="button">Undo</button>
        <button className="sanborn-button" disabled={historyFuture.length === 0 || readOnly} onClick={redo} type="button">Redo</button>
        <button className="sanborn-button" onClick={() => setZoom(view.zoom * 1.3)} type="button" aria-label="Zoom historical illustration in">Zoom +</button>
        <button className="sanborn-button" onClick={() => setZoom(view.zoom / 1.3)} type="button" aria-label="Zoom historical illustration out">Zoom −</button>
        <button className="sanborn-button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} type="button">Fit image</button>
        <button className="sanborn-button" onClick={() => { setView({ zoom: 1, x: 0, y: 0 }); setPanning(null); }} type="button">Reset view</button>
      </div>

      <nav className="birds-eye-mobile-tabs" aria-label="Birds-Eye workspace views">
        {mobileTabs.map((tab) => <button aria-current={workspaceTab === tab.id ? "page" : undefined} className={workspaceTab === tab.id ? "is-active" : ""} key={tab.id} onClick={() => setWorkspaceTab(tab.id)} type="button">{tab.label}</button>)}
      </nav>

      <div className="birds-eye-workspace__grid">
        <article className={`birds-eye-pane birds-eye-pane--illustration${workspaceTab === "illustration" || workspaceTab === "scene_markup" ? " is-mobile-active" : ""}`}>
          <header><strong>Historical Illustration</strong><span>Source image · normalized markup</span></header>
          <div className="birds-eye-pane__subcontrols">
            <label><input checked={showControlPoints} onChange={(event) => setShowControlPoints(event.target.checked)} type="checkbox" /> Points</label>
            <label><input checked={showSceneRegions} onChange={(event) => setShowSceneRegions(event.target.checked)} type="checkbox" /> Regions</label>
            <label><input checked={showPresentations} onChange={(event) => setShowPresentations(event.target.checked)} type="checkbox" /> Projected pieces</label>
            <span>{Math.round(view.zoom * 100)}%</span>
          </div>
          <div className="birds-eye-pane__image-status"><SanbornSourceImageStatus filename={reference.originalFilename} onRetry={imageLifecycle.retryImage} state={imageLifecycle.state} /></div>
          <svg
            aria-label="Historical Birds-Eye illustration with calibration points and scene markup"
            className={`birds-eye-pane__svg birds-eye-pane__svg--illustration is-mode-${editorMode}`}
            onClick={handleIllustrationClick}
            onKeyDown={handleIllustrationKeyDown}
            onPointerDown={handleIllustrationPointerDown}
            onPointerMove={handleIllustrationPointerMove}
            onPointerUp={handleIllustrationPointerUp}
            ref={referenceRef}
            role="img"
            tabIndex={0}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          >
            <image height={height} href={reference.signedUrl ?? ""} key={imageLifecycle.imageKey} onError={imageLifecycle.onError} onLoad={imageLifecycle.onLoad} preserveAspectRatio="xMidYMid meet" width={width} />
            {showPresentations ? effectivePresentations.filter((presentation) => presentation.isVisible).map((presentation) => {
              const geometry = presentationGeometry(presentation);
              const selected = selectedPieceId === presentation.mapPieceId;
              return <g className={`birds-eye-presentation is-${presentation.adjustmentStatus}${selected ? " is-selected" : ""}`} key={presentation.mapPieceId} onClick={(event) => { event.stopPropagation(); selectPresentation(presentation.mapPieceId); }}>
                {geometry.geometryType === "polygon"
                  ? <polygon fillOpacity={presentation.opacity} points={regionPath(geometry, width, height)} />
                  : geometry.geometryType === "polyline"
                    ? <polyline fill="none" points={regionPath(geometry, width, height)} />
                    : <circle cx={geometry.coordinates[0].x * width} cy={geometry.coordinates[0].y * height} r={Math.max(5, width / 350)} />}
                <text x={geometry.coordinates[0].x * width + 8} y={geometry.coordinates[0].y * height - 8}>{presentation.displayLabel}</text>
                {selected && editorMode === "adjust_projected_piece" && !readOnly ? geometry.coordinates.map((coordinate, index) => <circle className="birds-eye-vertex" cx={coordinate.x * width} cy={coordinate.y * height} key={index} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragVertex({ kind: "presentation", id: presentation.mapPieceId, index }); }} r={Math.max(5, width / 420)} />) : null}
              </g>;
            }) : null}
            {showSceneRegions ? regions.filter((region) => region.isVisible).map((region) => <g className={`birds-eye-region${selectedRegionId === region.regionId ? " is-selected" : ""}`} key={region.regionId} onClick={(event) => { event.stopPropagation(); setSelectedRegionId(region.regionId); setInspectorTab("regions"); }}>
              <polygon points={regionPath(region.imageGeometry, width, height)} />
              <text x={region.imageGeometry.coordinates[0].x * width + 8} y={region.imageGeometry.coordinates[0].y * height - 8}>{region.label}</text>
              {selectedRegionId === region.regionId && editorMode === "edit_scene_region" && !region.isLocked && !readOnly ? region.imageGeometry.coordinates.map((coordinate, index) => <circle className="birds-eye-vertex" cx={coordinate.x * width} cy={coordinate.y * height} key={index} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragVertex({ kind: "region", id: region.regionId, index }); }} r={Math.max(5, width / 420)} />) : null}
            </g>) : null}
            {draftVertices.length ? <g className="birds-eye-region-draft"><polyline points={draftVertices.map((point) => `${point.x * width},${point.y * height}`).join(" ")} />{draftVertices.map((point, index) => <circle cx={point.x * width} cy={point.y * height} key={index} r={Math.max(4, width / 500)} />)}</g> : null}
            {showControlPoints ? points.filter((point) => point.imageX !== null && point.imageY !== null).map((point) => <g className={`birds-eye-point${selectedSequence === point.sequence ? " is-selected" : ""}${point.enabled ? "" : " is-disabled"}`} key={point.id || point.sequence} onClick={(event) => { event.stopPropagation(); setSelectedSequence(point.sequence); setInspectorTab("calibration"); }}>
              <circle cx={point.imageX!} cy={point.imageY!} r={Math.max(width / 220, 7)} />
              <text x={point.imageX! + 10} y={point.imageY! - 10}>{point.sequence}</text>
            </g>) : null}
          </svg>
          {editorMode === "draw_scene_region" ? <div className="birds-eye-draw-actions" aria-live="polite"><span>{draftVertices.length} vertices · Enter/double-click finishes · Escape cancels · Backspace removes last</span><button className="sanborn-button sanborn-button--primary" disabled={draftVertices.length < 3} onClick={finishRegion} type="button">Finish</button><button className="sanborn-button" onClick={cancelRegionDraft} type="button">Cancel</button></div> : null}
        </article>

        <article className={`birds-eye-pane birds-eye-pane--map${workspaceTab === "flat_map" ? " is-mobile-active" : ""}`}>
          <header><strong>Flat Geographic Map</strong><span>Authoritative latitude / longitude · never warped</span></header>
          <div className="birds-eye-map-controls">
            <button className="sanborn-button" onClick={() => setMapFitRequest({ mode: "town", token: Date.now() })} type="button">Fit town</button>
            <button className="sanborn-button" onClick={() => setMapFitRequest({ mode: "pieces", token: Date.now() })} type="button">Fit placed Map Pieces</button>
            <button className="sanborn-button" disabled={selectedPoint?.latitude === null || selectedPoint?.latitude === undefined || selectedPoint.longitude === null} onClick={() => setMapFitRequest({ mode: "selected_point", token: Date.now() })} type="button">Focus selected point</button>
            <label><input checked={showMapPieces} onChange={(event) => setShowMapPieces(event.target.checked)} type="checkbox" /> Map Pieces</label>
            <label><input checked={showSheetBoundaries} onChange={(event) => setShowSheetBoundaries(event.target.checked)} type="checkbox" /> Sanborn boundaries</label>
            <label><input checked={showControlPoints} onChange={(event) => setShowControlPoints(event.target.checked)} type="checkbox" /> Points</label>
          </div>
          <BirdsEyeSourceMap
            activeToken={workspaceTab === "flat_map" ? 1 : 0}
            basemapKey={basemapKey}
            center={mapCenter}
            controlPoints={points}
            fitRequest={mapFitRequest}
            onBasemapChange={setBasemapKey}
            onCursorMove={(latitude, longitude) => setMapCursor({ latitude, longitude })}
            onMapClick={handleMapClick}
            onMapViewChange={(center, zoom) => { setMapCenter(center); setMapZoom(zoom); }}
            onPointMove={(sequence, latitude, longitude, zoom) => patchPoint(sequence, { latitude, longitude, sourceMapZoom: zoom, sourceMapBearing: 0, sourceMapLabel: basemapKey })}
            onSelectPoint={(sequence) => { setSelectedSequence(sequence); setInspectorTab("calibration"); }}
            placedGeometries={placedGeometries}
            readOnly={readOnly}
            selectedSequence={selectedSequence}
            sheetBoundaries={sheetBoundaries}
            showControlPoints={showControlPoints}
            showMapPieces={showMapPieces}
            showSheetBoundaries={showSheetBoundaries}
            townCenter={townCenter}
            zoom={mapZoom}
          />
          <footer className="birds-eye-coordinate-readout" aria-live="polite">{mapCursor ? `${mapCursor.latitude.toFixed(6)}, ${mapCursor.longitude.toFixed(6)}` : "Move over the map for latitude / longitude"}</footer>
        </article>

        <article className={`birds-eye-pane birds-eye-pane--preview${workspaceTab === "warped_preview" ? " is-mobile-active" : ""}`}>
          <header><strong>Warped Geographic Preview</strong><span>{solve.statusLabel}</span></header>
          <div className="birds-eye-preview-controls">
            <label>Compare<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as typeof comparisonMode)}><option value="side_by_side">Side by side</option><option value="overlay">Overlay</option><option value="difference">Difference emphasis</option></select></label>
            <label>Opacity<input disabled={comparisonMode === "side_by_side"} max="1" min="0" onChange={(event) => setComparisonOpacity(Number(event.target.value))} step="0.05" type="range" value={comparisonOpacity} /></label>
            <button aria-pressed={blinkComparison} className={`sanborn-button${blinkComparison ? " sanborn-button--primary" : ""}`} disabled={comparisonMode === "side_by_side"} onClick={() => setBlinkComparison((value) => !value)} type="button">Blink comparison</button>
          </div>
          <svg aria-label="Separate warped geographic preview renderer" className={`birds-eye-pane__svg birds-eye-preview is-${comparisonMode}`} role="img" viewBox={`0 0 ${width} ${height}`}>
            <rect className="birds-eye-preview__background" height={height} width={width} />
            {comparisonMode !== "side_by_side" && blinkVisible ? <image className="birds-eye-preview__comparison-image" height={height} href={reference.signedUrl ?? ""} opacity={comparisonOpacity} preserveAspectRatio="xMidYMid meet" width={width} /> : null}
            <g className="birds-eye-preview__grid">{gridLines.map((line) => <polyline key={line.id} points={line.points.map((point) => `${point.x},${point.y}`).join(" ")} />)}</g>
            {previewPieceBounds ? <rect className="birds-eye-preview__placed-bounds" fill="none" height={Math.max(1, previewPieceBounds.height)} width={Math.max(1, previewPieceBounds.width)} x={previewPieceBounds.x} y={previewPieceBounds.y} /> : null}
            <g className="birds-eye-preview__pieces">{previewPieces.map((presentation) => {
              const geometry = presentation.projectedImageGeometry;
              return geometry.geometryType === "polygon"
                ? <polygon key={presentation.mapPieceId} points={regionPath(geometry, width, height)} />
                : <polyline fill="none" key={presentation.mapPieceId} points={regionPath(geometry, width, height)} />;
            })}</g>
            <g className="birds-eye-preview__network">{solve.localWarp.triangles.map((triangle) => <polygon fill="none" key={triangle.sequences.join("-")} points={triangle.target.map((point) => `${point.x},${point.y}`).join(" ")} />)}</g>
            <g className="birds-eye-preview__residuals">{solve.residuals.map((residual) => <line className={residual.outlier ? "is-outlier" : ""} key={residual.sequence} x1={residual.predicted.x} x2={residual.target.x} y1={residual.predicted.y} y2={residual.target.y} />)}</g>
            <g className="birds-eye-preview__points">{points.filter((point) => point.longitude !== null && point.latitude !== null).map((point) => {
              const projected = projectBirdsEyeThroughSolve(point.longitude!, point.latitude!, solve);
              return <g className={selectedSequence === point.sequence ? "is-selected" : ""} key={point.sequence}><circle cx={projected.x} cy={projected.y} r={Math.max(6, width / 300)} /><text x={projected.x + 8} y={projected.y - 8}>{point.sequence}</text></g>;
            })}</g>
          </svg>
          <footer className="birds-eye-preview-status">
            <strong>{solve.completePointCount} complete pair{solve.completePointCount === 1 ? "" : "s"} · {solve.statusLabel}</strong>
            <span>{solve.stage === "flat" ? "The flat geographic preview is available before calibration." : solve.averageResidualPixels === null ? "Residual not available." : `${solve.averageResidualPixels.toFixed(1)} px average global residual.`}</span>
          </footer>
        </article>
      </div>

      <section className={`birds-eye-inspector${workspaceTab === "scene_markup" ? " is-mobile-active" : ""}`}>
        <nav className="birds-eye-inspector__tabs" aria-label="Birds-Eye inspectors">
          {([
            ["calibration", "Control points"],
            ["regions", "Scene regions"],
            ["presentation", "Map Piece presentation"],
            ["evidence", "Evidence package"],
          ] as Array<[InspectorTab, string]>).map(([tab, label]) => <button aria-selected={inspectorTab === tab} className={inspectorTab === tab ? "is-active" : ""} key={tab} onClick={() => setInspectorTab(tab)} role="tab" type="button">{label}</button>)}
        </nav>

        {inspectorTab === "calibration" ? <div className="birds-eye-inspector__body birds-eye-calibration-inspector">
          <section>
            <div className="birds-eye-inspector__heading"><div><h3>Guided pairing</h3><p>Click this landmark in both the illustration and flat map. Either pane may be first.</p></div><button className="sanborn-button sanborn-button--primary" disabled={readOnly} onClick={addControlPoint} type="button">Add control point</button></div>
            {selectedPoint ? <div className="birds-eye-active-task" aria-live="polite"><strong>Point {selectedPoint.sequence}</strong><span>Illustration: {completion.illustration ? "complete" : "waiting"}</span><span>Geographic map: {completion.geographic ? "complete" : "waiting"}</span><span>{completion.illustration && completion.geographic ? "Pair complete" : "Active task"}</span></div> : <p>Select or add a control point.</p>}
            <div className="birds-eye-guidance"><strong>Landmark strategy</strong><p>Begin with widely separated intersections or railroad crossings. Cover foreground, background, left, right, and center. Use 8–12 strong points for a first usable pass and 15–25 for refinement.</p></div>
            <div className="birds-eye-quality">
              <strong>{solve.statusLabel}</strong>
              <span>{solve.valid ? "Calibration valid" : "Calibration not yet valid"}</span>
              <span>{solve.maximumResidualPixels === null ? "No residual" : `Worst residual ${solve.maximumResidualPixels.toFixed(1)} px at point ${solve.worstPointSequence ?? "—"}`}</span>
              {solve.warnings.map((warning) => <p className="is-warning" key={warning}>{warning}</p>)}
            </div>
          </section>
          <section>
            {selectedPoint ? <div className="birds-eye-form-grid">
              <label>Label<input disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { label: event.target.value })} value={selectedPoint.label} /></label>
              <label>Anchor type<select disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { anchorType: event.target.value as BirdsEyeControlPoint["anchorType"] })} value={selectedPoint.anchorType}>{birdsEyeAnchorTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
              <label>Linked Map Piece<select disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { linkedMapPieceId: event.target.value || null })} value={selectedPoint.linkedMapPieceId ?? ""}><option value="">None</option>{placedGeometries.map((piece) => <option key={piece.id} value={piece.id}>{piece.label}</option>)}</select></label>
              <label>Image X<input disabled readOnly value={selectedPoint.imageX?.toFixed(2) ?? "waiting"} /></label>
              <label>Image Y<input disabled readOnly value={selectedPoint.imageY?.toFixed(2) ?? "waiting"} /></label>
              <label>Latitude<input disabled readOnly value={selectedPoint.latitude?.toFixed(7) ?? "waiting"} /></label>
              <label>Longitude<input disabled readOnly value={selectedPoint.longitude?.toFixed(7) ?? "waiting"} /></label>
              <label>Map zoom<input disabled readOnly value={selectedPoint.sourceMapZoom ?? "—"} /></label>
              <label>Historical image note<textarea disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { historicalImageNote: event.target.value })} value={selectedPoint.historicalImageNote ?? ""} /></label>
              <label>Geographic note<textarea disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { geographicNote: event.target.value })} value={selectedPoint.geographicNote ?? ""} /></label>
              <label>General notes<textarea disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { note: event.target.value })} value={selectedPoint.note} /></label>
              <label className="birds-eye-checkbox"><input checked={selectedPoint.enabled} disabled={readOnly} onChange={(event) => patchPoint(selectedPoint.sequence, { enabled: event.target.checked })} type="checkbox" /> Enabled in solve</label>
              <div className="birds-eye-form-actions">
                <button className="sanborn-button" disabled={!points.some((point) => point.sequence < selectedPoint.sequence)} onClick={() => setSelectedSequence([...points].reverse().find((point) => point.sequence < selectedPoint.sequence)?.sequence ?? selectedPoint.sequence)} type="button">Previous</button>
                <button className="sanborn-button" disabled={!points.some((point) => point.sequence > selectedPoint.sequence)} onClick={() => setSelectedSequence(points.find((point) => point.sequence > selectedPoint.sequence)?.sequence ?? selectedPoint.sequence)} type="button">Next</button>
                <button className="sanborn-button" disabled={!completion.illustration} onClick={() => focusIllustrationPoint(selectedPoint)} type="button">Focus illustration</button>
                <button className="sanborn-button" disabled={!completion.geographic} onClick={() => { setWorkspaceTab("flat_map"); setMapFitRequest({ mode: "selected_point", token: Date.now() }); }} type="button">Focus map</button>
                <button className="sanborn-button" disabled={readOnly} onClick={() => { if (window.confirm(`Delete control point ${selectedPoint.sequence}?`)) { pushHistory(); setPoints((current) => current.filter((point) => point.sequence !== selectedPoint.sequence)); setSelectedSequence(null); setCalibrationDirty(true); } }} type="button">Delete</button>
              </div>
            </div> : null}
            <div className="birds-eye-point-list">{points.map((point) => {
              const pointResidual = solve.residuals.find((residual) => residual.sequence === point.sequence);
              const pointDone = point.imageX !== null && point.imageY !== null && point.latitude !== null && point.longitude !== null;
              return <button className={`${selectedSequence === point.sequence ? "is-selected" : ""}${point.enabled ? "" : " is-disabled"}`} key={point.id || point.sequence} onClick={() => setSelectedSequence(point.sequence)} type="button"><strong>{point.sequence}. {point.label}</strong><span>{pointDone ? "complete" : "incomplete"} · {pointResidual ? `${pointResidual.pixels.toFixed(1)} px residual` : "no residual"}</span></button>;
            })}</div>
            <div className="birds-eye-form-actions"><button className="sanborn-button sanborn-button--primary" disabled={readOnly || calibrationSaveState === "saving"} onClick={() => void saveCalibration()} type="button">Save calibration</button><button className="sanborn-button" disabled={!calibrationDirty || readOnly} onClick={() => { setPoints(state.controlPoints); setParameters(state.calibration?.globalParameters ?? { ...defaultBirdsEyeGlobalParameters, centerLatitude, centerLongitude }); setCalibrationDirty(false); }} type="button">Discard calibration changes</button></div>
          </section>
        </div> : null}

        {inspectorTab === "regions" ? <div className="birds-eye-inspector__body birds-eye-region-inspector">
          <section className="birds-eye-region-list-panel">
            <div className="birds-eye-inspector__heading"><div><h3>Scene regions</h3><p>{regions.length} saved or draft regions for this exact reference asset.</p></div><button className="sanborn-button sanborn-button--primary" disabled={readOnly} onClick={() => { setEditorMode("draw_scene_region"); setWorkspaceTab("scene_markup"); setDraftVertices([]); }} type="button">Draw region</button></div>
            <div className="birds-eye-region-filters">
              <label>Search<input onChange={(event) => setRegionSearch(event.target.value)} placeholder="Label or description" value={regionSearch} /></label>
              <label>Type<select onChange={(event) => setRegionTypeFilter(event.target.value as typeof regionTypeFilter)} value={regionTypeFilter}><option value="all">All types</option>{birdsEyeSceneRegionTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
              <label>Links<select onChange={(event) => setRegionLinkFilter(event.target.value as typeof regionLinkFilter)} value={regionLinkFilter}><option value="all">All</option><option value="linked">Linked</option><option value="unlinked">Unlinked</option></select></label>
              <label>Review<select onChange={(event) => setRegionReviewFilter(event.target.value as typeof regionReviewFilter)} value={regionReviewFilter}><option value="all">All</option><option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option></select></label>
              <label>Visibility<select onChange={(event) => setRegionVisibilityFilter(event.target.value as typeof regionVisibilityFilter)} value={regionVisibilityFilter}><option value="all">All</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label>
              <label>Confidence<select onChange={(event) => setRegionConfidenceFilter(event.target.value as typeof regionConfidenceFilter)} value={regionConfidenceFilter}><option value="all">All</option><option value="high">High (0.8+)</option><option value="medium">Medium (0.5–0.79)</option><option value="low">Low (&lt;0.5)</option><option value="unset">Not set</option></select></label>
            </div>
            <div className="birds-eye-region-list">{filteredRegions.map((region) => <button className={selectedRegionId === region.regionId ? "is-selected" : ""} key={region.regionId} onClick={() => { setSelectedRegionId(region.regionId); setWorkspaceTab("scene_markup"); }} type="button"><strong>{region.label}</strong><span>{region.regionType.replaceAll("_", " ")} · {region.linkedMapPieceId ? "linked" : "unlinked"} · {region.reviewStatus.replaceAll("_", " ")}</span></button>)}</div>
          </section>
          <section>
            {selectedRegion ? <>
              <div className="birds-eye-form-grid">
                <label>Label<input disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { label: event.target.value })} value={selectedRegion.label} /></label>
                <label>Region type<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { regionType: event.target.value as BirdsEyeSceneRegionType })} value={selectedRegion.regionType}>{birdsEyeSceneRegionTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
                <label>Description<textarea disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { description: event.target.value })} value={selectedRegion.description} /></label>
                <label>Primary Map Piece<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { linkedMapPieceId: event.target.value || null })} value={selectedRegion.linkedMapPieceId ?? ""}><option value="">Unidentified / none</option>{placedGeometries.map((piece) => <option key={piece.id} value={piece.id}>{piece.label}</option>)}</select></label>
                <label>Primary source record<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { linkedSourceRecordId: event.target.value || null })} value={selectedRegion.linkedSourceRecordId ?? ""}><option value="">None</option>{sourceOptions.map((source) => <option key={source.sourceRecordId} value={source.sourceRecordId}>{source.internalSourceId ?? source.sourceId} · {source.title}</option>)}</select></label>
                <label>Building record<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { linkedBuildingId: event.target.value || null })} value={selectedRegion.linkedBuildingId ?? ""}><option value="">None / unsupported</option>{state.buildingOptions.map((building) => <option key={building.buildingId} value={building.buildingId}>{building.label}</option>)}</select></label>
                <label>Confidence<input disabled={readOnly || selectedRegion.isLocked} max="1" min="0" onChange={(event) => patchRegion(selectedRegion.regionId, { confidence: event.target.value === "" ? null : Number(event.target.value) })} step="0.05" type="number" value={selectedRegion.confidence ?? ""} /></label>
                <label>Evidence classification<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { evidenceClassification: event.target.value })} value={selectedRegion.evidenceClassification}>{reviewStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
                <label>Review status<select disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { reviewStatus: event.target.value })} value={selectedRegion.reviewStatus}>{reviewStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
                <label>Visible features<textarea disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { visibleFeatures: { ...selectedRegion.visibleFeatures, summary: event.target.value } })} value={String(selectedRegion.visibleFeatures.summary ?? "")} /></label>
                <label>Reconstruction notes<textarea disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { reconstructionNotes: event.target.value })} value={selectedRegion.reconstructionNotes} /></label>
                <label>Rendering notes<textarea disabled={readOnly || selectedRegion.isLocked} onChange={(event) => patchRegion(selectedRegion.regionId, { renderingNotes: event.target.value })} value={selectedRegion.renderingNotes} /></label>
                <label className="birds-eye-checkbox"><input checked={selectedRegion.isVisible} disabled={readOnly} onChange={(event) => patchRegion(selectedRegion.regionId, { isVisible: event.target.checked })} type="checkbox" /> Visible</label>
                <label className="birds-eye-checkbox"><input checked={selectedRegion.isLocked} disabled={readOnly} onChange={(event) => patchRegion(selectedRegion.regionId, { isLocked: event.target.checked })} type="checkbox" /> Lock geometry and metadata</label>
              </div>
              {selectedRegion.cropBounds ? <div className="birds-eye-crop-preview"><strong>Derived crop preview</strong><svg aria-label={`Crop preview for ${selectedRegion.label}`} preserveAspectRatio="xMidYMid slice" viewBox={`${selectedRegion.cropBounds.x * width} ${selectedRegion.cropBounds.y * height} ${selectedRegion.cropBounds.width * width} ${selectedRegion.cropBounds.height * height}`}><image height={height} href={reference.signedUrl ?? ""} width={width} /><polygon points={regionPath(selectedRegion.imageGeometry, width, height)} /></svg></div> : null}
              <div className="birds-eye-form-actions"><button className="sanborn-button sanborn-button--primary" disabled={readOnly || regionSaveState === "saving"} onClick={() => void saveRegion()} type="button">Save region</button><button className="sanborn-button" disabled={readOnly} onClick={() => setEditorMode("edit_scene_region")} type="button">Edit vertices</button><button className="sanborn-button" disabled={readOnly} onClick={() => setEditorMode("link_map_piece")} type="button">Link Map Piece on image</button><button className="sanborn-button" disabled={readOnly} onClick={() => void archiveRegion()} type="button">{selectedRegion.isPersisted ? "Archive" : "Delete draft"}</button></div>
            </> : <p>Select a scene region or draw a new polygon on the historical illustration.</p>}
          </section>
        </div> : null}

        {inspectorTab === "presentation" ? <div className="birds-eye-inspector__body birds-eye-presentation-inspector">
          <section>
            <h3>Projected Map Pieces</h3>
            <p>These image-space shapes are downstream from authoritative Map Placement. Adjustments never write latitude, longitude, corners, placement status, or source geometry.</p>
            <div className="birds-eye-region-list">{effectivePresentations.map((presentation) => {
              const stale = placedGeometries.find((piece) => piece.id === presentation.mapPieceId);
              const states = [
                presentation.isVisible ? null : "Hidden",
                stale && isBirdsEyePresentationStale(presentation, stale) ? "Stale from Map Placement" : presentation.adjustmentStatus.replaceAll("_", " "),
                presentation.reviewStatus.replaceAll("_", " "),
              ].filter(Boolean);
              return <button className={selectedPieceId === presentation.mapPieceId ? "is-selected" : ""} key={presentation.mapPieceId} onClick={() => selectPresentation(presentation.mapPieceId)} type="button"><strong>{presentation.displayLabel}</strong><span>{states.join(" · ")}</span></button>;
            })}</div>
          </section>
          <section>
            {selectedPresentation ? <>
              <div className="birds-eye-piece-state"><strong>{selectedPresentation.displayLabel}</strong><span className={`is-${selectedPresentation.adjustmentStatus}`}>{[
                selectedPresentation.isVisible ? null : "Hidden",
                selectedSourceGeometry && isBirdsEyePresentationStale(selectedPresentation, selectedSourceGeometry) ? "Stale from Map Placement" : selectedPresentation.adjustmentStatus.replaceAll("_", " "),
              ].filter(Boolean).join(" · ")}</span><code>{selectedPresentation.sourceGeographicGeometryChecksum ?? "No source fingerprint yet"}</code></div>
              <div className="birds-eye-form-grid">
                <label>Display label<input disabled={readOnly || selectedPresentation.isLocked} onChange={(event) => upsertPresentation({ ...selectedPresentation, displayLabel: event.target.value })} value={selectedPresentation.displayLabel} /></label>
                <label>Opacity<input disabled={readOnly || selectedPresentation.isLocked} max="1" min="0.05" onChange={(event) => upsertPresentation({ ...selectedPresentation, opacity: Number(event.target.value) })} step="0.05" type="range" value={selectedPresentation.opacity} /></label>
                <label>Review status<select disabled={readOnly || selectedPresentation.isLocked} onChange={(event) => upsertPresentation({ ...selectedPresentation, reviewStatus: event.target.value, adjustmentStatus: !selectedPresentation.isVisible ? "hidden" : selectedSourceGeometry && isBirdsEyePresentationStale(selectedPresentation, selectedSourceGeometry) ? "stale" : selectedPresentation.adjustedImageGeometry ? "adjusted" : event.target.value === "unknown" ? "projected" : "reviewed" })} value={selectedPresentation.reviewStatus}>{reviewStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
                <label>Notes<textarea disabled={readOnly || selectedPresentation.isLocked} onChange={(event) => upsertPresentation({ ...selectedPresentation, notes: event.target.value })} value={selectedPresentation.notes} /></label>
                <label className="birds-eye-checkbox"><input checked={selectedPresentation.isVisible} disabled={readOnly} onChange={(event) => upsertPresentation({ ...selectedPresentation, isVisible: event.target.checked, adjustmentStatus: event.target.checked ? selectedSourceGeometry && isBirdsEyePresentationStale(selectedPresentation, selectedSourceGeometry) ? "stale" : selectedPresentation.adjustedImageGeometry ? "adjusted" : selectedPresentation.reviewStatus === "unknown" ? "projected" : "reviewed" : "hidden" })} type="checkbox" /> Visible</label>
                <label className="birds-eye-checkbox"><input checked={selectedPresentation.isLocked} disabled={readOnly} onChange={(event) => upsertPresentation({ ...selectedPresentation, isLocked: event.target.checked })} type="checkbox" /> Locked</label>
              </div>
              <div className="birds-eye-adjustment-pad" role="group" aria-label="Birds-Eye presentation adjustment controls">
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => translateBirdsEyeGeometry(geometry, -0.005, 0))} type="button">Move left</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => translateBirdsEyeGeometry(geometry, 0.005, 0))} type="button">Move right</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => translateBirdsEyeGeometry(geometry, 0, -0.005))} type="button">Move up</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => translateBirdsEyeGeometry(geometry, 0, 0.005))} type="button">Move down</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => scaleBirdsEyeGeometry(geometry, 1.02))} type="button">Scale +</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => scaleBirdsEyeGeometry(geometry, 0.98))} type="button">Scale −</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => rotateBirdsEyeGeometry(geometry, -1))} type="button">Rotate left</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => adjustSelectedPresentation((geometry) => rotateBirdsEyeGeometry(geometry, 1))} type="button">Rotate right</button>
                <button className="sanborn-button" disabled={readOnly || selectedPresentation.isLocked} onClick={() => setEditorMode("adjust_projected_piece")} type="button">Edit vertices on image</button>
              </div>
              <div className="birds-eye-form-actions"><button className="sanborn-button sanborn-button--primary" disabled={readOnly || presentationSaveState === "saving"} onClick={() => void savePresentation()} type="button">Save presentation</button><button className="sanborn-button" disabled={readOnly || !selectedPresentation.adjustedImageGeometry} onClick={() => upsertPresentation(resetBirdsEyePresentationAdjustment(selectedPresentation))} type="button">Reset to projected</button><button className="sanborn-button" disabled={readOnly || !selectedSourceGeometry} onClick={reprojectSelectedPresentation} type="button">Reproject from Map Placement</button></div>
            </> : <p>Select a projected Map Piece. Placed source geometry appears here even before any control points exist.</p>}
          </section>
        </div> : null}

        {inspectorTab === "evidence" ? <div className="birds-eye-inspector__body birds-eye-evidence-inspector">
          <section><h3>Reconstruction evidence package</h3><p>The future building renderer receives a historical crop, Sanborn footprint, geographic placement, source evidence, scene notes, and nearby context. The artist’s drawing is evidence, not mechanically exact architecture.</p><button className="sanborn-button sanborn-button--primary" disabled={!evidencePackage} onClick={() => void copyEvidencePackage()} type="button">Copy evidence package</button></section>
          <pre aria-label="Evidence package JSON preview">{JSON.stringify(evidencePackage, null, 2)}</pre>
        </div> : null}
      </section>

      <p className="birds-eye-workspace__message" aria-live="polite">{message || (selectedPoint && (!completion.illustration || !completion.geographic) ? `Point ${selectedPoint.sequence}: ${completion.illustration ? "illustration complete" : "illustration waiting"}; ${completion.geographic ? "geographic map complete" : "geographic map waiting"}.` : `${solve.statusLabel}. Flat Geographic Map remains authoritative and unwarped.`)}</p>
    </section>
  );
}

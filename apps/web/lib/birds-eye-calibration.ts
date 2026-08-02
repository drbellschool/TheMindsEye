import type {
  BirdsEyeBuildingOption,
  BirdsEyePiecePresentation,
  BirdsEyeSceneRegion,
} from "./birds-eye-scene.ts";
import type { BirdsEyeDerivedMapPiece } from "./birds-eye-derived-map-pieces.ts";

export const birdsEyeAnchorTypes = ["intersection", "railroad_crossing", "block_corner", "building_landmark", "church", "depot", "school", "courthouse", "water_feature", "road_bend", "other"] as const;
export type BirdsEyeAnchorType = (typeof birdsEyeAnchorTypes)[number];
export type BirdsEyeCalibrationStatus = "draft" | "solved" | "saved" | "needs_review" | "unavailable";

export type BirdsEyeReferenceAsset = {
  id: string;
  assetId: string;
  townPackageId: string;
  sourceRecordId: string | null;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  signedUrl: string | null;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  checksum: string;
  evidenceClassification: string;
  reviewStatus: string;
  rightsNote: string | null;
  intakeNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BirdsEyeControlPoint = {
  id: string;
  sequence: number;
  label: string;
  note: string;
  anchorType: BirdsEyeAnchorType;
  linkedMapPieceId: string | null;
  longitude: number | null;
  latitude: number | null;
  imageX: number | null;
  imageY: number | null;
  sourceMapZoom?: number | null;
  sourceMapBearing?: number | null;
  sourceMapLabel?: string;
  historicalImageNote?: string;
  geographicNote?: string;
  enabled: boolean;
  deletedAt: string | null;
};

export type BirdsEyeGlobalParameters = {
  centerLatitude: number;
  centerLongitude: number;
  bearing: number;
  pitch: number;
  fieldOfView: number;
  perspectiveStrength: number;
  horizon: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  skewX: number;
  skewY: number;
};

export type BirdsEyeCalibrationQuality = {
  totalPoints: number;
  completeEnabledPoints: number;
  disabledPoints: number;
  incompletePoints: number;
  valid: boolean;
  averageResidualPixels: number | null;
  maximumResidualPixels: number | null;
  worstPointSequence: number | null;
  solvedAt: string | null;
  savedAt: string | null;
  stage?: BirdsEyeSolveStage;
  warnings?: string[];
};

export type BirdsEyeCalibration = {
  id: string | null;
  townPackageId: string;
  atlasId: string;
  referenceAssetId: string | null;
  title: string;
  status: BirdsEyeCalibrationStatus;
  unavailableReason: string | null;
  globalParameters: BirdsEyeGlobalParameters;
  warpType: "delaunay_piecewise_affine";
  solverVersion: string;
  warpModel: Record<string, unknown>;
  quality: BirdsEyeCalibrationQuality;
  notes: string;
  updatedAt: string | null;
};

export type BirdsEyePerspectiveState = {
  assets: BirdsEyeReferenceAsset[];
  designatedAssetId: string | null;
  calibration: BirdsEyeCalibration | null;
  controlPoints: BirdsEyeControlPoint[];
  sceneRegions: BirdsEyeSceneRegion[];
  derivedMapPieces: BirdsEyeDerivedMapPiece[];
  piecePresentations: BirdsEyePiecePresentation[];
  buildingOptions: BirdsEyeBuildingOption[];
  sceneDataSource: "supabase" | "migration_required" | "unavailable";
  dataSource: "supabase" | "unavailable";
  ready: boolean;
};

export const defaultBirdsEyeGlobalParameters: BirdsEyeGlobalParameters = {
  centerLatitude: 0,
  centerLongitude: 0,
  bearing: 315,
  pitch: 58,
  fieldOfView: 30,
  perspectiveStrength: 0.3,
  horizon: 0.1,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  skewX: 0,
  skewY: 0,
};

export function normalizeBirdsEyeGlobalParameters(input: Partial<BirdsEyeGlobalParameters> | null | undefined): BirdsEyeGlobalParameters {
  return {
    centerLatitude: Number.isFinite(input?.centerLatitude) ? Number(input!.centerLatitude) : 0,
    centerLongitude: Number.isFinite(input?.centerLongitude) ? Number(input!.centerLongitude) : 0,
    bearing: Number.isFinite(input?.bearing) ? Number(input!.bearing) : defaultBirdsEyeGlobalParameters.bearing,
    pitch: Math.max(1, Math.min(89, Number(input?.pitch ?? defaultBirdsEyeGlobalParameters.pitch))),
    fieldOfView: Math.max(5, Math.min(120, Number(input?.fieldOfView ?? defaultBirdsEyeGlobalParameters.fieldOfView))),
    perspectiveStrength: Math.max(-0.9, Math.min(0.9, Number(input?.perspectiveStrength ?? defaultBirdsEyeGlobalParameters.perspectiveStrength))),
    horizon: Math.max(0, Math.min(1, Number(input?.horizon ?? defaultBirdsEyeGlobalParameters.horizon))),
    scaleX: Math.max(0.00001, Number(input?.scaleX ?? 1)),
    scaleY: Math.max(0.00001, Number(input?.scaleY ?? 1)),
    offsetX: Number(input?.offsetX ?? 0),
    offsetY: Number(input?.offsetY ?? 0),
    skewX: Number(input?.skewX ?? 0),
    skewY: Number(input?.skewY ?? 0),
  };
}

export type BirdsEyePoint = { x: number; y: number };
export type BirdsEyeAffineMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };
export type BirdsEyeSolveStage = "flat" | "translation" | "similarity" | "coarse" | "rough" | "local";
export type BirdsEyeFlatProjection = {
  centerLatitude: number;
  centerLongitude: number;
  pixelsPerMeter: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};
export type BirdsEyePointResidual = {
  sequence: number;
  predicted: BirdsEyePoint;
  target: BirdsEyePoint;
  pixels: number;
  outlier: boolean;
};
export type BirdsEyeStagedSolve = {
  stage: BirdsEyeSolveStage;
  statusLabel: string;
  completePointCount: number;
  valid: boolean;
  globalMatrix: BirdsEyeAffineMatrix;
  flatProjection: BirdsEyeFlatProjection;
  localWarp: BirdsEyeWarpModel;
  residuals: BirdsEyePointResidual[];
  averageResidualPixels: number | null;
  maximumResidualPixels: number | null;
  worstPointSequence: number | null;
  duplicatePointSequences: number[];
  nearCollinear: boolean;
  warnings: string[];
};
export type BirdsEyeTransform = {
  // Future rendering contract: forward maps authoritative geographic
  // coordinates into Step 7 reference pixels; inverse maps a clicked pixel
  // back to geography before the local warp is applied. Map Placement data is
  // never changed by this boundary.
  forward: (longitude: number, latitude: number) => BirdsEyePoint;
  inverse: (point: BirdsEyePoint) => { longitude: number; latitude: number } | null;
};

export type BirdsEyeWarpTriangle = { source: [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint]; target: [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint]; sequences: [number, number, number] };
export type BirdsEyeWarpModel = { type: "delaunay_piecewise_affine"; triangles: BirdsEyeWarpTriangle[]; solvedPointCount: number; averageResidualPixels: number | null; maximumResidualPixels: number | null; worstPointSequence: number | null };

function localMeters(longitude: number, latitude: number, parameters: BirdsEyeGlobalParameters): BirdsEyePoint {
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos((parameters.centerLatitude * Math.PI) / 180);
  return { x: (longitude - parameters.centerLongitude) * longitudeScale, y: (latitude - parameters.centerLatitude) * latitudeScale };
}

function projectLocal(point: BirdsEyePoint, parameters: BirdsEyeGlobalParameters): BirdsEyePoint {
  const bearing = (parameters.bearing * Math.PI) / 180;
  const rightX = Math.sin(bearing);
  const rightY = Math.cos(bearing);
  const forwardX = Math.cos(bearing);
  const forwardY = -Math.sin(bearing);
  const lateral = point.x * rightX + point.y * rightY;
  const depth = point.x * forwardX + point.y * forwardY;
  const normalizedDepth = depth / Math.max(1, Math.abs(depth) + 1000);
  const denominator = Math.max(0.2, 1 + parameters.perspectiveStrength * normalizedDepth);
  const pitch = (parameters.pitch * Math.PI) / 180;
  const x = lateral / denominator;
  const y = depth * Math.cos(pitch) / denominator;
  const skewX = Math.tan((parameters.skewX * Math.PI) / 180);
  const skewY = Math.tan((parameters.skewY * Math.PI) / 180);
  return { x: parameters.offsetX + parameters.scaleX * (x + skewX * y), y: parameters.offsetY + parameters.scaleY * (y + skewY * x) };
}

export function createBirdsEyeGlobalTransform(parametersInput: Partial<BirdsEyeGlobalParameters>): BirdsEyeTransform {
  const parameters = normalizeBirdsEyeGlobalParameters(parametersInput);
  return {
    forward: (longitude, latitude) => projectLocal(localMeters(longitude, latitude, parameters), parameters),
    inverse: (point) => {
      const target = { x: (point.x - parameters.offsetX) / parameters.scaleX, y: (point.y - parameters.offsetY) / parameters.scaleY };
      const localScale = Math.max(1, Math.hypot(target.x, target.y) / 100);
      let local = { x: target.x, y: target.y };
      const localParameters = { ...parameters, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const projected = projectLocal(local, localParameters);
        const error = { x: projected.x - target.x, y: projected.y - target.y };
        if (Math.hypot(error.x, error.y) < 0.001) break;
        const epsilon = localScale * 0.001;
        const dx = projectLocal({ x: local.x + epsilon, y: local.y }, localParameters);
        const dy = projectLocal({ x: local.x, y: local.y + epsilon }, localParameters);
        const a = (dx.x - projected.x) / epsilon;
        const b = (dy.x - projected.x) / epsilon;
        const c = (dx.y - projected.y) / epsilon;
        const d = (dy.y - projected.y) / epsilon;
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-10) return null;
        local = { x: local.x - (d * error.x - b * error.y) / determinant, y: local.y - (-c * error.x + a * error.y) / determinant };
      }
      const latitude = parameters.centerLatitude + local.y / 111320;
      const longitudeScale = 111320 * Math.cos((parameters.centerLatitude * Math.PI) / 180);
      const longitude = parameters.centerLongitude + local.x / longitudeScale;
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    },
  };
}

export function completeBirdsEyeControlPointCount(points: readonly BirdsEyeControlPoint[]): number {
  return points.filter((point) => point.enabled && point.longitude !== null && point.latitude !== null && point.imageX !== null && point.imageY !== null).length;
}

export function birdsEyeCalibrationQuality(points: readonly BirdsEyeControlPoint[], solvedAt: string | null = null, savedAt: string | null = null): BirdsEyeCalibrationQuality {
  const completeEnabledPoints = completeBirdsEyeControlPointCount(points);
  const disabledPoints = points.filter((point) => !point.enabled).length;
  return { totalPoints: points.length, completeEnabledPoints, disabledPoints, incompletePoints: points.length - completeEnabledPoints - disabledPoints, valid: completeEnabledPoints >= 4, averageResidualPixels: null, maximumResidualPixels: null, worstPointSequence: null, solvedAt, savedAt };
}

export function createBirdsEyeFlatProjection(input: {
  coordinates: ReadonlyArray<{ longitude: number; latitude: number }>;
  centerLatitude: number;
  centerLongitude: number;
  width: number;
  height: number;
  padding?: number;
}): BirdsEyeFlatProjection {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const padding = Math.max(0, Math.min(Math.min(width, height) * 0.4, input.padding ?? Math.min(width, height) * 0.08));
  const centerLatitude = Number.isFinite(input.centerLatitude) ? input.centerLatitude : 0;
  const centerLongitude = Number.isFinite(input.centerLongitude) ? input.centerLongitude : 0;
  const longitudeScale = 111320 * Math.max(0.05, Math.cos(centerLatitude * Math.PI / 180));
  const points = input.coordinates
    .filter((coordinate) => Number.isFinite(coordinate.longitude) && Number.isFinite(coordinate.latitude))
    .map((coordinate) => ({
      x: (coordinate.longitude - centerLongitude) * longitudeScale,
      y: -(coordinate.latitude - centerLatitude) * 111320,
    }));
  if (points.length === 0) {
    return { centerLatitude, centerLongitude, pixelsPerMeter: 0.75, offsetX: width / 2, offsetY: height / 2, width, height };
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(25, maxX - minX);
  const spanY = Math.max(25, maxY - minY);
  const pixelsPerMeter = Math.max(0.00001, Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    centerLatitude,
    centerLongitude,
    pixelsPerMeter,
    offsetX: width / 2 - centerX * pixelsPerMeter,
    offsetY: height / 2 - centerY * pixelsPerMeter,
    width,
    height,
  };
}

export function projectBirdsEyeGeographicFlat(
  longitude: number,
  latitude: number,
  projection: BirdsEyeFlatProjection,
): BirdsEyePoint {
  const longitudeScale = 111320 * Math.max(0.05, Math.cos(projection.centerLatitude * Math.PI / 180));
  return {
    x: projection.offsetX + (longitude - projection.centerLongitude) * longitudeScale * projection.pixelsPerMeter,
    y: projection.offsetY - (latitude - projection.centerLatitude) * 111320 * projection.pixelsPerMeter,
  };
}

export function applyBirdsEyeAffine(point: BirdsEyePoint, matrix: BirdsEyeAffineMatrix): BirdsEyePoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let value = column; value <= size; value += 1) augmented[column][value] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let value = column; value <= size; value += 1) augmented[row][value] -= factor * augmented[column][value];
    }
  }
  return augmented.map((row) => row[size]);
}

function solveAffineLeastSquares(source: BirdsEyePoint[], target: BirdsEyePoint[]): BirdsEyeAffineMatrix | null {
  const rows: number[][] = [];
  const values: number[] = [];
  source.forEach((point, index) => {
    rows.push([point.x, 0, point.y, 0, 1, 0], [0, point.x, 0, point.y, 0, 1]);
    values.push(target[index].x, target[index].y);
  });
  const normal = Array.from({ length: 6 }, () => Array(6).fill(0));
  const result = Array(6).fill(0);
  rows.forEach((row, rowIndex) => {
    for (let left = 0; left < 6; left += 1) {
      result[left] += row[left] * values[rowIndex];
      for (let right = 0; right < 6; right += 1) normal[left][right] += row[left] * row[right];
    }
  });
  const solved = solveLinearSystem(normal, result);
  return solved ? { a: solved[0], b: solved[1], c: solved[2], d: solved[3], e: solved[4], f: solved[5] } : null;
}

function similarityMatrix(source: BirdsEyePoint[], target: BirdsEyePoint[]): BirdsEyeAffineMatrix {
  if (source.length === 0) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  if (source.length === 1) return { a: 1, b: 0, c: 0, d: 1, e: target[0].x - source[0].x, f: target[0].y - source[0].y };
  const sourceDelta = { x: source[1].x - source[0].x, y: source[1].y - source[0].y };
  const targetDelta = { x: target[1].x - target[0].x, y: target[1].y - target[0].y };
  const sourceLength = Math.max(1e-8, Math.hypot(sourceDelta.x, sourceDelta.y));
  const targetLength = Math.hypot(targetDelta.x, targetDelta.y);
  const scale = targetLength / sourceLength;
  const rotation = Math.atan2(targetDelta.y, targetDelta.x) - Math.atan2(sourceDelta.y, sourceDelta.x);
  const a = Math.cos(rotation) * scale;
  const b = Math.sin(rotation) * scale;
  const c = -Math.sin(rotation) * scale;
  const d = Math.cos(rotation) * scale;
  return {
    a,
    b,
    c,
    d,
    e: target[0].x - a * source[0].x - c * source[0].y,
    f: target[0].y - b * source[0].x - d * source[0].y,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function detectDuplicateSequences(source: BirdsEyePoint[], target: BirdsEyePoint[], sequences: number[]): number[] {
  const duplicates = new Set<number>();
  for (let left = 0; left < source.length; left += 1) {
    for (let right = left + 1; right < source.length; right += 1) {
      if (Math.hypot(source[left].x - source[right].x, source[left].y - source[right].y) < 4 ||
        Math.hypot(target[left].x - target[right].x, target[left].y - target[right].y) < 4) {
        duplicates.add(sequences[left]);
        duplicates.add(sequences[right]);
      }
    }
  }
  return [...duplicates].sort((left, right) => left - right);
}

function detectNearCollinear(points: BirdsEyePoint[]): boolean {
  if (points.length < 3) return false;
  const spanX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const spanY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  const boundsArea = Math.max(1, spanX * spanY);
  let maximumTriangleArea = 0;
  for (let first = 0; first < points.length - 2; first += 1) {
    for (let second = first + 1; second < points.length - 1; second += 1) {
      for (let third = second + 1; third < points.length; third += 1) {
        const area = Math.abs(
          (points[second].x - points[first].x) * (points[third].y - points[first].y) -
          (points[second].y - points[first].y) * (points[third].x - points[first].x),
        ) / 2;
        maximumTriangleArea = Math.max(maximumTriangleArea, area);
      }
    }
  }
  return maximumTriangleArea / boundsArea < 0.01;
}

function barycentric(point: BirdsEyePoint, triangle: [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint]): [number, number, number] | null {
  const [a, b, c] = triangle;
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-9) return null;
  const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const w = 1 - u - v;
  return u >= -1e-7 && v >= -1e-7 && w >= -1e-7 ? [u, v, w] : null;
}

function interpolate(weights: [number, number, number], triangle: [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint]): BirdsEyePoint {
  return { x: weights[0] * triangle[0].x + weights[1] * triangle[1].x + weights[2] * triangle[2].x, y: weights[0] * triangle[0].y + weights[1] * triangle[1].y + weights[2] * triangle[2].y };
}

function circumcircleContains(point: BirdsEyePoint, triangle: [number, number, number], points: BirdsEyePoint[]): boolean {
  const a = points[triangle[0]], b = points[triangle[1]], c = points[triangle[2]];
  const ax = a.x - point.x, ay = a.y - point.y, bx = b.x - point.x, by = b.y - point.y, cx = c.x - point.x, cy = c.y - point.y;
  const determinant = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
  const orientation = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return orientation > 0 ? determinant > 0 : determinant < 0;
}

function delaunayTriangles(points: BirdsEyePoint[]): Array<[number, number, number]> {
  if (points.length < 3) return [];
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const working = [...points, { x: (minX + maxX) / 2 - 20 * span, y: minY - 10 * span }, { x: (minX + maxX) / 2, y: maxY + 20 * span }, { x: (minX + maxX) / 2 + 20 * span, y: minY - 10 * span }];
  const superA = points.length, superB = points.length + 1, superC = points.length + 2;
  let triangles: Array<[number, number, number]> = [[superA, superB, superC]];
  for (let index = 0; index < points.length; index += 1) {
    const bad = triangles.filter((triangle) => circumcircleContains(working[index], triangle, working));
    const edgeCounts = new Map<string, { edge: [number, number]; count: number }>();
    for (const triangle of bad) for (const edge of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const ordered = [...edge].sort((left, right) => left - right) as [number, number];
      const key = ordered.join(":");
      const entry = edgeCounts.get(key) ?? { edge: ordered, count: 0 };
      entry.count += 1; edgeCounts.set(key, entry);
    }
    triangles = triangles.filter((triangle) => !bad.includes(triangle));
    for (const entry of edgeCounts.values()) if (entry.count === 1) triangles.push([entry.edge[0], entry.edge[1], index]);
  }
  return triangles.filter((triangle) => triangle.every((index) => index < points.length));
}

function createLocalWarpFromProjectedPoints(
  source: BirdsEyePoint[],
  target: BirdsEyePoint[],
  sequences: number[],
  residuals: BirdsEyePointResidual[],
): BirdsEyeWarpModel {
  const residualValues = residuals.map((residual) => residual.pixels);
  const maximumResidualPixels = residualValues.length ? Math.max(...residualValues) : null;
  const worst = maximumResidualPixels === null ? null : residuals.find((residual) => residual.pixels === maximumResidualPixels) ?? null;
  const triangles = source.length >= 6
    ? delaunayTriangles(source).map((triangle) => ({
        source: triangle.map((index) => source[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint],
        target: triangle.map((index) => target[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint],
        sequences: triangle.map((index) => sequences[index]) as [number, number, number],
      }))
    : [];
  return {
    type: "delaunay_piecewise_affine",
    triangles,
    solvedPointCount: source.length,
    averageResidualPixels: residualValues.length ? residualValues.reduce((sum, value) => sum + value, 0) / residualValues.length : null,
    maximumResidualPixels,
    worstPointSequence: worst?.sequence ?? null,
  };
}

export function solveBirdsEyeStagedCalibration(input: {
  points: readonly BirdsEyeControlPoint[];
  flatProjection: BirdsEyeFlatProjection;
}): BirdsEyeStagedSolve {
  const complete = input.points
    .filter((point) => point.enabled && point.longitude !== null && point.latitude !== null && point.imageX !== null && point.imageY !== null)
    .sort((left, right) => left.sequence - right.sequence);
  const source = complete.map((point) => projectBirdsEyeGeographicFlat(point.longitude!, point.latitude!, input.flatProjection));
  const target = complete.map((point) => ({ x: point.imageX!, y: point.imageY! }));
  const sequences = complete.map((point) => point.sequence);
  const duplicatePointSequences = detectDuplicateSequences(source, target, sequences);
  const nearCollinear = detectNearCollinear(source) || detectNearCollinear(target);
  let globalMatrix = similarityMatrix(source, target);
  if (complete.length >= 3 && !nearCollinear) globalMatrix = solveAffineLeastSquares(source, target) ?? globalMatrix;
  const predicted = source.map((point) => applyBirdsEyeAffine(point, globalMatrix));
  const rawResiduals = predicted.map((point, index) => Math.hypot(point.x - target[index].x, point.y - target[index].y));
  const residualMedian = median(rawResiduals);
  const outlierThreshold = Math.max(12, residualMedian * 3);
  const residuals: BirdsEyePointResidual[] = predicted.map((point, index) => ({
    sequence: sequences[index],
    predicted: point,
    target: target[index],
    pixels: rawResiduals[index],
    outlier: complete.length >= 4 && rawResiduals[index] > outlierThreshold,
  }));
  const localWarp = createLocalWarpFromProjectedPoints(predicted, target, sequences, residuals);
  const stage: BirdsEyeSolveStage = complete.length === 0
    ? "flat"
    : complete.length === 1
      ? "translation"
      : complete.length === 2
        ? "similarity"
        : complete.length === 3
          ? "coarse"
          : complete.length < 6
            ? "rough"
            : "local";
  const statusLabel = stage === "flat"
    ? "Flat geographic preview"
    : stage === "translation"
      ? "Translation anchor"
      : stage === "similarity"
        ? "Rotation and scale estimate"
        : stage === "coarse"
          ? "Coarse affine alignment"
          : stage === "rough"
            ? "Rough alignment"
            : "Local warp active";
  const warnings: string[] = [];
  if (duplicatePointSequences.length) warnings.push(`Points ${duplicatePointSequences.join(", ")} are duplicates or too close together.`);
  if (nearCollinear) warnings.push("Control points are nearly collinear. Add landmarks above, below, left, and right of the current set.");
  const outliers = residuals.filter((residual) => residual.outlier).map((residual) => residual.sequence);
  if (outliers.length) warnings.push(`Possible outlier${outliers.length === 1 ? "" : "s"}: point${outliers.length === 1 ? "" : "s"} ${outliers.join(", ")}.`);
  if (complete.length > 0 && complete.length < 4) warnings.push(`${4 - complete.length} more complete pair${4 - complete.length === 1 ? "" : "s"} needed for a valid calibration.`);
  if (complete.length >= 4 && complete.length < 6) warnings.push("Add at least six widely separated pairs to activate local refinement.");
  if (complete.length >= 6 && localWarp.triangles.length === 0) warnings.push("Local refinement could not create a stable control-point network.");
  return {
    stage,
    statusLabel,
    completePointCount: complete.length,
    valid: complete.length >= 4 && duplicatePointSequences.length === 0 && !nearCollinear,
    globalMatrix,
    flatProjection: input.flatProjection,
    localWarp,
    residuals,
    averageResidualPixels: localWarp.averageResidualPixels,
    maximumResidualPixels: localWarp.maximumResidualPixels,
    worstPointSequence: localWarp.worstPointSequence,
    duplicatePointSequences,
    nearCollinear,
    warnings,
  };
}

export function projectBirdsEyeThroughSolve(
  longitude: number,
  latitude: number,
  solve: BirdsEyeStagedSolve,
  options: { globalOnly?: boolean } = {},
): BirdsEyePoint {
  const flat = projectBirdsEyeGeographicFlat(longitude, latitude, solve.flatProjection);
  const global = applyBirdsEyeAffine(flat, solve.globalMatrix);
  return !options.globalOnly && solve.stage === "local" ? warpBirdsEyeForward(global, solve.localWarp) : global;
}

export function solveBirdsEyeLocalWarp(points: readonly BirdsEyeControlPoint[], transform: BirdsEyeTransform): BirdsEyeWarpModel {
  const complete = points.filter((point) => point.enabled && point.longitude !== null && point.latitude !== null && point.imageX !== null && point.imageY !== null);
  const source = complete.map((point) => transform.forward(point.longitude!, point.latitude!));
  const target = complete.map((point) => ({ x: point.imageX!, y: point.imageY! }));
  const residuals = complete.map((point, index) => Math.hypot(target[index].x - source[index].x, target[index].y - source[index].y));
  const maximumResidualPixels = residuals.length ? Math.max(...residuals) : null;
  const worstIndex = residuals.length ? residuals.indexOf(maximumResidualPixels!) : -1;
  const triangles = complete.length >= 6 ? delaunayTriangles(source).map((triangle) => ({ source: triangle.map((index) => source[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint], target: triangle.map((index) => target[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint], sequences: triangle.map((index) => complete[index].sequence) as [number, number, number] })) : [];
  return { type: "delaunay_piecewise_affine", triangles, solvedPointCount: complete.length, averageResidualPixels: residuals.length ? residuals.reduce((sum, value) => sum + value, 0) / residuals.length : null, maximumResidualPixels, worstPointSequence: worstIndex >= 0 ? complete[worstIndex].sequence : null };
}

export function warpBirdsEyeForward(point: BirdsEyePoint, model: BirdsEyeWarpModel): BirdsEyePoint {
  for (const triangle of model.triangles) { const weights = barycentric(point, triangle.source); if (weights) return interpolate(weights, triangle.target); }
  return point;
}

export function warpBirdsEyeInverse(point: BirdsEyePoint, model: BirdsEyeWarpModel): BirdsEyePoint {
  for (const triangle of model.triangles) { const weights = barycentric(point, triangle.target); if (weights) return interpolate(weights, triangle.source); }
  return point;
}

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

export function solveBirdsEyeLocalWarp(points: readonly BirdsEyeControlPoint[], transform: BirdsEyeTransform): BirdsEyeWarpModel {
  const complete = points.filter((point) => point.enabled && point.longitude !== null && point.latitude !== null && point.imageX !== null && point.imageY !== null);
  const source = complete.map((point) => transform.forward(point.longitude!, point.latitude!));
  const target = complete.map((point) => ({ x: point.imageX!, y: point.imageY! }));
  const residuals = complete.map((point, index) => Math.hypot(target[index].x - source[index].x, target[index].y - source[index].y));
  const maximumResidualPixels = residuals.length ? Math.max(...residuals) : null;
  const worstIndex = residuals.length ? residuals.indexOf(maximumResidualPixels!) : -1;
  const triangles = delaunayTriangles(source).map((triangle) => ({ source: triangle.map((index) => source[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint], target: triangle.map((index) => target[index]) as [BirdsEyePoint, BirdsEyePoint, BirdsEyePoint], sequences: triangle.map((index) => complete[index].sequence) as [number, number, number] }));
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

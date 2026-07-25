import type { SanbornMapPieceSourceGeometry } from "./sanborn-map-piece-features.ts";
import type { SanbornNormalizedPoint, SanbornSourceBBox } from "./sanborn-atlas.ts";

export type SanbornSourceContextViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
};

export function clampSanbornSourceContextViewport(
  viewport: SanbornSourceContextViewport,
  imageWidth: number,
  imageHeight: number,
): SanbornSourceContextViewport {
  const width = Math.min(Math.max(1, viewport.width), Math.max(1, imageWidth));
  const height = Math.min(Math.max(1, viewport.height), Math.max(1, imageHeight));
  return {
    ...viewport,
    x: clamp(viewport.x, 0, Math.max(0, imageWidth - width)),
    y: clamp(viewport.y, 0, Math.max(0, imageHeight - height)),
    width,
    height,
    aspectRatio: width / height,
  };
}

export function panSanbornSourceContextViewport(
  viewport: SanbornSourceContextViewport,
  deltaX: number,
  deltaY: number,
  imageWidth: number,
  imageHeight: number,
): SanbornSourceContextViewport {
  return clampSanbornSourceContextViewport(
    { ...viewport, x: viewport.x - deltaX, y: viewport.y - deltaY },
    imageWidth,
    imageHeight,
  );
}

type SourceContextInput = {
  sourceGeometry?: SanbornMapPieceSourceGeometry | null;
  sourcePolygon?: SanbornNormalizedPoint[] | null;
  sourceBBox?: SanbornSourceBBox | null;
  imageWidth: number;
  imageHeight: number;
  previewAspectRatio?: number;
  paddingRatio?: number;
  minimumSpan?: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointsForInput(input: SourceContextInput): SanbornNormalizedPoint[] {
  if (input.sourceGeometry?.points?.length) return input.sourceGeometry.points;
  if (input.sourcePolygon?.length) return input.sourcePolygon;
  if (input.sourceBBox) {
    return [
      { x: input.sourceBBox.minX, y: input.sourceBBox.minY },
      { x: input.sourceBBox.maxX, y: input.sourceBBox.maxY },
    ];
  }
  return [{ x: 0.5, y: 0.5 }];
}

export function buildSanbornSourceContextViewport(input: SourceContextInput): SanbornSourceContextViewport {
  const imageWidth = Number.isFinite(input.imageWidth) && input.imageWidth > 0 ? input.imageWidth : 1;
  const imageHeight = Number.isFinite(input.imageHeight) && input.imageHeight > 0 ? input.imageHeight : 1;
  const aspectRatio = Number.isFinite(input.previewAspectRatio) && (input.previewAspectRatio ?? 0) > 0 ? input.previewAspectRatio as number : 1.35;
  const minimumSpan = clamp(input.minimumSpan ?? 0.18, 0.05, 1);
  const paddingRatio = clamp(input.paddingRatio ?? 0.6, 0.5, 0.7);
  const normalizedAspectRatio = aspectRatio * imageHeight / imageWidth;
  const points = pointsForInput(input);
  const minX = clamp(Math.min(...points.map((point) => point.x)), 0, 1);
  const maxX = clamp(Math.max(...points.map((point) => point.x)), 0, 1);
  const minY = clamp(Math.min(...points.map((point) => point.y)), 0, 1);
  const maxY = clamp(Math.max(...points.map((point) => point.y)), 0, 1);
  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  let width = Math.max(minimumSpan, spanX * (1 + paddingRatio * 2));
  let height = Math.max(minimumSpan, spanY * (1 + paddingRatio * 2));

  if (width / height < normalizedAspectRatio) width = height * normalizedAspectRatio;
  if (width / height > normalizedAspectRatio) height = width / normalizedAspectRatio;
  width = Math.min(1, width);
  height = Math.min(1, height);
  if (width / height < normalizedAspectRatio) width = Math.min(1, height * normalizedAspectRatio);
  if (width / height > normalizedAspectRatio) height = Math.min(1, width / normalizedAspectRatio);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const x = clamp(centerX - width / 2, 0, 1 - width);
  const y = clamp(centerY - height / 2, 0, 1 - height);

  return {
    x: x * imageWidth,
    y: y * imageHeight,
    width: width * imageWidth,
    height: height * imageHeight,
    aspectRatio: (width * imageWidth) / (height * imageHeight),
  };
}

export function normalizedPointToSourceContextPoint(point: SanbornNormalizedPoint, viewport: SanbornSourceContextViewport, imageWidth: number, imageHeight: number): SanbornNormalizedPoint {
  const pixelX = point.x * imageWidth;
  const pixelY = point.y * imageHeight;
  return {
    x: (pixelX - viewport.x) / viewport.width,
    y: (pixelY - viewport.y) / viewport.height,
  };
}

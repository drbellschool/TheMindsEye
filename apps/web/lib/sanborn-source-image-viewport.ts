import { calculateSourceBoundingBox, type SanbornNormalizedPoint } from "./sanborn-atlas.ts";

export const minSanbornSourceImageZoom = 0.25;
export const maxSanbornSourceImageZoom = 8;

export type SanbornSourceViewportPlan = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function clampSanbornSourceImageZoom(value: number): number {
  return Number(clampNumber(value, minSanbornSourceImageZoom, maxSanbornSourceImageZoom).toFixed(3));
}

export function stepSanbornSourceImageZoom(currentZoom: number, direction: "in" | "out", step = 1.25): number {
  const factor = direction === "in" ? step : 1 / step;
  return clampSanbornSourceImageZoom(currentZoom * factor);
}

export function getSanbornSourceImagePanDelta(input: { startClientX: number; startClientY: number; currentClientX: number; currentClientY: number }): {
  deltaX: number;
  deltaY: number;
} {
  return {
    deltaX: input.currentClientX - input.startClientX,
    deltaY: input.currentClientY - input.startClientY,
  };
}

export function planFitSelectedSanbornPolygon(input: {
  polygon: SanbornNormalizedPoint[];
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  paddingRatio?: number;
}): SanbornSourceViewportPlan | null {
  if (
    input.polygon.length < 3 ||
    input.imageWidth <= 0 ||
    input.imageHeight <= 0 ||
    input.viewportWidth <= 0 ||
    input.viewportHeight <= 0
  ) {
    return null;
  }

  const bbox = calculateSourceBoundingBox(input.polygon);
  const sourceWidth = Math.max(1, (bbox.maxX - bbox.minX) * input.imageWidth);
  const sourceHeight = Math.max(1, (bbox.maxY - bbox.minY) * input.imageHeight);
  const paddingRatio = clampNumber(input.paddingRatio ?? 0.2, 0, 0.8);
  const availableWidth = Math.max(1, input.viewportWidth * (1 - paddingRatio));
  const availableHeight = Math.max(1, input.viewportHeight * (1 - paddingRatio));
  const zoom = clampSanbornSourceImageZoom(Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight));
  const scaledImageWidth = input.imageWidth * zoom;
  const scaledImageHeight = input.imageHeight * zoom;
  const centerX = ((bbox.minX + bbox.maxX) / 2) * input.imageWidth * zoom;
  const centerY = ((bbox.minY + bbox.maxY) / 2) * input.imageHeight * zoom;
  const maxScrollLeft = Math.max(0, scaledImageWidth - input.viewportWidth);
  const maxScrollTop = Math.max(0, scaledImageHeight - input.viewportHeight);

  return {
    zoom,
    scrollLeft: Number(clampNumber(centerX - input.viewportWidth / 2, 0, maxScrollLeft).toFixed(2)),
    scrollTop: Number(clampNumber(centerY - input.viewportHeight / 2, 0, maxScrollTop).toFixed(2)),
  };
}

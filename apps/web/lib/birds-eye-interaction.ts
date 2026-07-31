export type BirdsEyeImageView = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BirdsEyeImageViewport = {
  cssWidth: number;
  cssHeight: number;
  imageWidth: number;
  imageHeight: number;
  view: BirdsEyeImageView;
};

export type BirdsEyeScreenPoint = { x: number; y: number };
export type BirdsEyeNormalizedPoint = { x: number; y: number };
export type BirdsEyeCssRect = { x: number; y: number; width: number; height: number };

export type BirdsEyeRenderedImageLayout = {
  valid: true;
  paneRect: BirdsEyeCssRect;
  contentRect: BirdsEyeCssRect;
  renderedImageRect: BirdsEyeCssRect;
  scale: number;
  view: BirdsEyeImageView;
};

export const BIRDS_EYE_MARKER_DIAMETER_CSS_PX = 22;
export const BIRDS_EYE_MARKER_SELECTED_RING_CSS_PX = 28;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateBirdsEyeRenderedImageLayout(input: BirdsEyeImageViewport): BirdsEyeRenderedImageLayout | null {
  if (
    ![input.cssWidth, input.cssHeight, input.imageWidth, input.imageHeight, input.view.x, input.view.y, input.view.width, input.view.height].every(Number.isFinite) ||
    input.cssWidth <= 0 || input.cssHeight <= 0 || input.imageWidth <= 0 || input.imageHeight <= 0 || input.view.width <= 0 || input.view.height <= 0
  ) return null;
  const scale = Math.min(
    input.cssWidth / input.view.width,
    input.cssHeight / input.view.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const renderedWidth = input.view.width * scale;
  const renderedHeight = input.view.height * scale;
  const offsetX = (input.cssWidth - renderedWidth) / 2;
  const offsetY = (input.cssHeight - renderedHeight) / 2;
  return {
    valid: true,
    paneRect: { x: 0, y: 0, width: input.cssWidth, height: input.cssHeight },
    contentRect: { x: offsetX, y: offsetY, width: renderedWidth, height: renderedHeight },
    renderedImageRect: {
      x: offsetX - input.view.x * scale,
      y: offsetY - input.view.y * scale,
      width: input.imageWidth * scale,
      height: input.imageHeight * scale,
    },
    scale,
    view: { ...input.view },
  };
}

export function birdsEyeSvgImageTransform(layout: BirdsEyeRenderedImageLayout): string {
  return `translate(${layout.renderedImageRect.x} ${layout.renderedImageRect.y}) scale(${layout.scale})`;
}

/** Convert CSS pixels in the SVG pane to normalized original-image coordinates. */
export function birdsEyeScreenToNormalized(
  screen: BirdsEyeScreenPoint,
  input: BirdsEyeImageViewport,
): BirdsEyeNormalizedPoint | null {
  const layout = calculateBirdsEyeRenderedImageLayout(input);
  if (!layout) return null;
  const imageX = (screen.x - layout.renderedImageRect.x) / layout.scale;
  const imageY = (screen.y - layout.renderedImageRect.y) / layout.scale;
  if (screen.x < layout.contentRect.x || screen.x > layout.contentRect.x + layout.contentRect.width ||
    screen.y < layout.contentRect.y || screen.y > layout.contentRect.y + layout.contentRect.height) {
    return null;
  }
  return {
    x: clamp01(imageX / Math.max(1, input.imageWidth)),
    y: clamp01(imageY / Math.max(1, input.imageHeight)),
  };
}

/** Convert normalized original-image coordinates to CSS pixels in the SVG pane. */
export function birdsEyeNormalizedToScreen(
  normalized: BirdsEyeNormalizedPoint,
  input: BirdsEyeImageViewport,
): BirdsEyeScreenPoint | null {
  const layout = calculateBirdsEyeRenderedImageLayout(input);
  if (!layout || !Number.isFinite(normalized.x) || !Number.isFinite(normalized.y) || normalized.x < 0 || normalized.x > 1 || normalized.y < 0 || normalized.y > 1) return null;
  const imageX = normalized.x * input.imageWidth;
  const imageY = normalized.y * input.imageHeight;
  return {
    x: layout.renderedImageRect.x + imageX * layout.scale,
    y: layout.renderedImageRect.y + imageY * layout.scale,
  };
}

export function birdsEyeImageRoundTripError(
  normalized: BirdsEyeNormalizedPoint,
  input: BirdsEyeImageViewport,
): number {
  const screen = birdsEyeNormalizedToScreen(normalized, input);
  if (!screen) return Number.POSITIVE_INFINITY;
  const roundTrip = birdsEyeScreenToNormalized(screen, input);
  if (!roundTrip) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    (roundTrip.x - normalized.x) * input.imageWidth,
    (roundTrip.y - normalized.y) * input.imageHeight,
  );
}

export function centeredBirdsEyeMarkerAnchor(size: number): [number, number] {
  const half = Math.max(0, size / 2);
  return [half, half];
}

export function mapClickRoundTripError(
  clickedContainerPoint: BirdsEyeScreenPoint,
  renderedContainerPoint: BirdsEyeScreenPoint,
): number {
  return Math.hypot(
    clickedContainerPoint.x - renderedContainerPoint.x,
    clickedContainerPoint.y - renderedContainerPoint.y,
  );
}

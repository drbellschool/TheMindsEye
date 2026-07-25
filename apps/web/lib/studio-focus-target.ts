export type StudioFocusTarget = {
  targetId: string;
  instruction: string;
};

export type ReconstructionTaskContext = {
  workflow?: string | null;
  atlasPageId?: string | null;
  sheetAssetId?: string | null;
  indexRegionId?: string | null;
  mapPieceId?: string | null;
};

export function focusTargetId(kind: string, id: string | null | undefined): string {
  return `${kind}:${id ?? "active"}`;
}

export function focusTargetForTask(context: ReconstructionTaskContext): StudioFocusTarget {
  if (context.mapPieceId) {
    return { targetId: focusTargetId("map-piece-inspector-card", context.mapPieceId), instruction: "Review and complete this map piece in the inspector." };
  }

  if (context.indexRegionId) {
    return { targetId: focusTargetId("source-region-linked-page", context.indexRegionId), instruction: "Complete the linked sheet and provenance fields for this source region." };
  }

  if (context.atlasPageId || context.sheetAssetId) {
    return { targetId: focusTargetId("page-source-record", context.atlasPageId ?? context.sheetAssetId), instruction: "Link the uploaded page to its source record, then complete the page review." };
  }

  return { targetId: focusTargetId("workflow-status", context.workflow), instruction: "Complete the highlighted workflow section." };
}

export function focusStudioTarget(targetId: string): boolean {
  const element = document.querySelector<HTMLElement>(`[data-focus-target="${CSS.escape(targetId)}"]`);
  if (!element) return false;

  let parent = element.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }

  const focusable = element.matches("button, input, select, textarea, [tabindex]")
    ? element
    : element.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]");
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  if (focusable && typeof focusable.focus === "function") focusable.focus({ preventScroll: true });
  element.classList.remove("is-focus-target");
  void element.offsetWidth;
  element.classList.add("is-focus-target");
  window.setTimeout(() => element.classList.remove("is-focus-target"), 24_000);
  return true;
}

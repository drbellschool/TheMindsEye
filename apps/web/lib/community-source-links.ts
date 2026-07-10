export type CommunitySourceLinkInput = {
  sourceId: string | null | undefined;
  title?: string | null;
  archiveName?: string | null;
};

export type CommunitySourceLink = {
  sourceId: string;
  title: string;
  detail: string;
  href: string;
};

const unavailableSourceIds = new Set([
  "unknown",
  "unavailable",
  "no source loaded",
  "no linked source",
  "source unavailable",
]);

function normalizeText(value: string | null | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export function isValidSourceId(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  const sourceId = value.trim();

  if (!sourceId || unavailableSourceIds.has(sourceId.toLowerCase())) {
    return false;
  }

  return !/[\\/?#\s]/.test(sourceId);
}

export function normalizeSourceLink(input: CommunitySourceLinkInput): CommunitySourceLink | null {
  if (!isValidSourceId(input.sourceId)) {
    return null;
  }

  const sourceId = input.sourceId.trim();

  return {
    sourceId,
    title: normalizeText(input.title, sourceId),
    detail: normalizeText(input.archiveName, "Source metadata available"),
    href: `/community/sources/${encodeURIComponent(sourceId)}`,
  };
}

export function normalizeSourceLinks(inputs: CommunitySourceLinkInput[]): CommunitySourceLink[] {
  const links = new Map<string, CommunitySourceLink>();

  for (const input of inputs) {
    const link = normalizeSourceLink(input);

    if (link && !links.has(link.sourceId)) {
      links.set(link.sourceId, link);
    }
  }

  return [...links.values()];
}

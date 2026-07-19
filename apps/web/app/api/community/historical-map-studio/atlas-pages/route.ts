import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornPageId,
  isSanbornPageType,
  legacySanbornPageTypeAliases,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
  normalizeSanbornPageType,
  pageTypeCanBePrimaryTownIndex,
} from "@/lib/sanborn-atlas";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type AtlasPageSaveBody = {
  townPackageId?: string;
  atlasId?: string;
  pages?: Array<{
    pageId?: string | null;
    assetId?: string | null;
    pageSequence?: number | string | null;
    pageType?: string | null;
    sheetNumber?: number | string | null;
    printedReference?: string | null;
    volumeLabel?: string | null;
    displayLabel?: string | null;
    isPrimaryTownIndex?: boolean | null;
    classificationNotes?: string | null;
  }>;
};

type AtlasPageMoveBody = {
  townPackageId?: string;
  pageId?: string | null;
  destinationAtlasId?: string | null;
  moveChildWork?: boolean | null;
};

type AtlasPageArchiveBody = {
  townPackageId?: string;
  pageId?: string | null;
  archiveReason?: string | null;
};

type LimitedTextResult = { ok: true; value: string | null } | { ok: false; error: string };

function normalizeLimitedText(
  value: string | null | undefined,
  maxLength: number,
  fieldName: string,
  options: { allowLineBreaks?: boolean } = {},
): LimitedTextResult {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} must be text.` };
  }

  const normalized = value.trim();

  if (!normalized) {
    return { ok: true, value: null };
  }

  if (normalized.length > maxLength) {
    return { ok: false, error: `${fieldName} must be ${maxLength} characters or fewer.` };
  }

  const invalidPattern = options.allowLineBreaks ? /[\u0000\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (invalidPattern.test(normalized)) {
    return { ok: false, error: `${fieldName} contains unsupported control characters.` };
  }

  return { ok: true, value: normalized };
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as AtlasPageSaveBody | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 160);

  if (!body || !atlasId || !Array.isArray(body.pages)) {
    return jsonError(400, "Atlas page payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const normalizedPages = body.pages.map((page, index) => {
    const assetId = normalizeOptionalSanbornText(page.assetId, 160);
    const pageSequence = normalizePositiveInteger(page.pageSequence) ?? index + 1;
    const sheetNumber = normalizePositiveInteger(page.sheetNumber);
    const requestedPageType = normalizeOptionalSanbornText(page.pageType, 80);
    const pageType = normalizeSanbornPageType(page.pageType);
    const printedReference = normalizeLimitedText(page.printedReference, 80, "Printed reference");
    const volumeLabel = normalizeLimitedText(page.volumeLabel, 80, "Volume label");
    const displayLabel = normalizeLimitedText(page.displayLabel, 160, "Display title");
    const classificationNotes = normalizeLimitedText(page.classificationNotes, 1000, "Classification notes", { allowLineBreaks: true });

    if (!assetId) {
      return { ok: false as const, error: "Each atlas page must reference a Sanborn sheet asset." };
    }

    if (
      requestedPageType &&
      !isSanbornPageType(requestedPageType) &&
      !Object.prototype.hasOwnProperty.call(legacySanbornPageTypeAliases, requestedPageType)
    ) {
      return { ok: false as const, error: "Atlas page type is not allowed." };
    }

    if (!printedReference.ok) {
      return { ok: false as const, error: printedReference.error };
    }

    if (!volumeLabel.ok) {
      return { ok: false as const, error: volumeLabel.error };
    }

    if (!displayLabel.ok) {
      return { ok: false as const, error: displayLabel.error };
    }

    if (!classificationNotes.ok) {
      return { ok: false as const, error: classificationNotes.error };
    }

    return {
      ok: true as const,
      value: {
        pageId:
          normalizeOptionalSanbornText(page.pageId, 220) ??
          buildDefaultSanbornPageId({
            atlasId,
            assetId,
          }),
        assetId,
        pageSequence,
        pageType,
        sheetNumber,
        printedReference: printedReference.value,
        volumeLabel: volumeLabel.value,
        displayLabel: displayLabel.value,
        isPrimaryTownIndex: page.isPrimaryTownIndex === true,
        classificationNotes: classificationNotes.value,
      },
    };
  });
  const invalidPage = normalizedPages.find((page) => !page.ok);

  if (invalidPage && !invalidPage.ok) {
    return jsonError(400, invalidPage.error);
  }

  const pages = normalizedPages.map((page) => (page.ok ? page.value : neverPage()));
  const sequenceCount = new Set(pages.map((page) => page.pageSequence)).size;
  const assetCount = new Set(pages.map((page) => page.assetId)).size;
  const pageIdCount = new Set(pages.map((page) => page.pageId)).size;
  const primaryTownIndexPages = pages.filter((page) => page.isPrimaryTownIndex);

  if (sequenceCount !== pages.length) {
    return jsonError(400, "Atlas page sequences must be unique.");
  }

  if (assetCount !== pages.length) {
    return jsonError(400, "Each uploaded Sanborn sheet can appear once in atlas pages.");
  }

  if (pageIdCount !== pages.length) {
    return jsonError(400, "Atlas page IDs must be unique.");
  }

  if (primaryTownIndexPages.some((page) => !pageTypeCanBePrimaryTownIndex(page.pageType))) {
    return jsonError(400, "Only Index or mixed pages can be the primary Town Index.");
  }

  if (primaryTownIndexPages.length > 1) {
    return jsonError(400, "Only one primary Town Index page is allowed per Sanborn atlas.");
  }

  const saveResult = await supabase.rpc("save_sanborn_atlas_pages", {
    p_town_package_id: townPackage.id,
    p_atlas_id: atlasId,
    p_pages: pages,
  });

  if (saveResult.error) {
    const status = saveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn atlas pages could not be saved: ${saveResult.error.message}`);
  }

  return NextResponse.json({
    ok: true,
    atlasId,
    pageCount: pages.length,
    result: saveResult.data ?? null,
    savedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as AtlasPageMoveBody | null;
  const pageId = normalizeOptionalSanbornText(body?.pageId, 220);
  const destinationAtlasId = normalizeOptionalSanbornText(body?.destinationAtlasId, 160);

  if (!body || !pageId || !destinationAtlasId) {
    return jsonError(400, "Atlas page move payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const moveResult = await access.supabase.rpc("move_sanborn_atlas_page_to_atlas", {
    p_town_package_id: townPackageResult.data.id,
    p_page_id: pageId,
    p_destination_atlas_id: destinationAtlasId,
    p_move_child_work: body.moveChildWork === true,
  });

  if (moveResult.error) {
    const status = moveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn atlas page could not be moved: ${moveResult.error.message}`);
  }

  return NextResponse.json({
    ok: true,
    result: moveResult.data ?? null,
    savedAt: new Date().toISOString(),
  });
}

export async function PATCH(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as AtlasPageArchiveBody | null;
  const pageId = normalizeOptionalSanbornText(body?.pageId, 220);

  if (!body || !pageId) {
    return jsonError(400, "Atlas page archive payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const archiveReason = normalizeLimitedText(body.archiveReason, 1000, "Archive reason", { allowLineBreaks: true });

  if (!archiveReason.ok) {
    return jsonError(400, archiveReason.error);
  }

  const archiveResult = await access.supabase.rpc("archive_sanborn_atlas_page", {
    p_town_package_id: townPackageResult.data.id,
    p_page_id: pageId,
    p_archive_reason: archiveReason.value ?? "Archived from Historical Map Studio.",
  });

  if (archiveResult.error) {
    const status = archiveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn atlas page could not be archived: ${archiveResult.error.message}`);
  }

  return NextResponse.json({
    ok: true,
    result: archiveResult.data ?? null,
    savedAt: new Date().toISOString(),
  });
}

function neverPage(): never {
  throw new Error("Invalid atlas page normalization state.");
}

import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornPageId,
  isSanbornPageType,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
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
    volumeLabel?: string | null;
    displayLabel?: string | null;
  }>;
};

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
    const pageType = page.pageType;

    if (!assetId) {
      return { ok: false as const, error: "Each atlas page must reference a Sanborn sheet asset." };
    }

    if (!isSanbornPageType(pageType)) {
      return { ok: false as const, error: "Atlas page type is not allowed." };
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
        volumeLabel: normalizeOptionalSanbornText(page.volumeLabel, 80),
        displayLabel: normalizeOptionalSanbornText(page.displayLabel, 160),
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

  if (sequenceCount !== pages.length) {
    return jsonError(400, "Atlas page sequences must be unique.");
  }

  if (assetCount !== pages.length) {
    return jsonError(400, "Each uploaded Sanborn sheet can appear once in atlas pages.");
  }

  if (pageIdCount !== pages.length) {
    return jsonError(400, "Atlas page IDs must be unique.");
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

function neverPage(): never {
  throw new Error("Invalid atlas page normalization state.");
}

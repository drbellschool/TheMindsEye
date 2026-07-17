import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornPageId,
  isSanbornPageType,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
  normalizeSanbornReviewStatus,
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

type AtlasRow = {
  id: string;
  atlas_id: string;
  town_package_id: string;
};

type AssetRow = {
  id: string;
  asset_id: string;
};

type ExistingPageRow = {
  id: string;
};

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as AtlasPageSaveBody | null;

  if (!body || !body.atlasId || !Array.isArray(body.pages)) {
    return jsonError(400, "Atlas page payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const atlasResult = await supabase
    .from("sanborn_atlases")
    .select("id, atlas_id, town_package_id")
    .eq("atlas_id", body.atlasId)
    .eq("town_package_id", townPackage.id)
    .maybeSingle<AtlasRow>();

  if (atlasResult.error) {
    return jsonError(503, "Sanborn atlas could not be loaded before saving pages.");
  }

  if (!atlasResult.data) {
    return jsonError(400, "Atlas pages can only be saved for an atlas in the active town package.");
  }

  const atlas = atlasResult.data;
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
            atlasId: atlas.atlas_id,
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

  if (sequenceCount !== pages.length) {
    return jsonError(400, "Atlas page sequences must be unique.");
  }

  if (assetCount !== pages.length) {
    return jsonError(400, "Each uploaded Sanborn sheet can appear once in atlas pages.");
  }

  const assetsResult =
    pages.length > 0
      ? await supabase.from("sanborn_sheet_assets").select("id, asset_id").eq("town_package_id", townPackage.id).in("asset_id", pages.map((page) => page.assetId))
      : { data: [], error: null };

  if (assetsResult.error) {
    return jsonError(503, "Sanborn sheet assets could not be verified before saving atlas pages.");
  }

  const assetRows = (assetsResult.data ?? []) as AssetRow[];
  const rowIdByAssetId = new Map(assetRows.map((row) => [row.asset_id, row.id]));

  if (rowIdByAssetId.size !== pages.length) {
    return jsonError(400, "Atlas pages can only reference uploaded sheets in the active town package.");
  }

  const existingPagesResult = await supabase.from("sanborn_atlas_pages").select("id").eq("atlas_id", atlas.id);

  if (existingPagesResult.error) {
    return jsonError(503, "Existing atlas pages could not be prepared for reordering.");
  }

  const existingPages = (existingPagesResult.data ?? []) as ExistingPageRow[];
  for (const [index, page] of existingPages.entries()) {
    const offsetResult = await supabase
      .from("sanborn_atlas_pages")
      .update({ page_sequence: 100_000 + index + 1 })
      .eq("id", page.id);

    if (offsetResult.error) {
      return jsonError(503, "Existing atlas pages could not be prepared for reordering.");
    }
  }

  const records = pages.map((page) => ({
    page_id: page.pageId,
    atlas_id: atlas.id,
    sanborn_sheet_asset_id: rowIdByAssetId.get(page.assetId),
    page_sequence: page.pageSequence,
    page_type: page.pageType,
    sheet_number: page.sheetNumber,
    volume_label: page.volumeLabel,
    display_label: page.displayLabel,
    review_status: normalizeSanbornReviewStatus("unknown"),
    evidence_classification: normalizeSanbornReviewStatus("unknown"),
  }));

  if (records.length > 0) {
    const saveResult = await supabase
      .from("sanborn_atlas_pages")
      .upsert(records, { onConflict: "sanborn_sheet_asset_id" })
      .select("id, page_id, updated_at");

    if (saveResult.error) {
      return jsonError(503, "Sanborn atlas pages could not be saved.");
    }
  }

  return NextResponse.json({
    ok: true,
    atlasId: atlas.atlas_id,
    pageCount: records.length,
    savedAt: new Date().toISOString(),
  });
}

function neverPage(): never {
  throw new Error("Invalid atlas page normalization state.");
}

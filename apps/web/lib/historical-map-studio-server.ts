import { NextResponse } from "next/server";

import { createAdminClient, hasSupabaseAdminEnv } from "./supabase/admin.ts";

export type JsonError = NextResponse<{ ok: false; message: string } & Record<string, unknown>>;

export function jsonError(status: number, message: string, details?: Record<string, unknown>): JsonError {
  return NextResponse.json({ ok: false, message, ...details }, { status });
}

export async function requireMapStudioWriteAccess() {
  if (!hasSupabaseAdminEnv()) {
    return {
      ok: false as const,
      response: jsonError(503, "Supabase service-role configuration is required for Historical Map Studio writes."),
    };
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return {
      ok: false as const,
      response: jsonError(503, "Supabase admin client could not be initialized."),
    };
  }

  return {
    ok: true as const,
    supabase,
  };
}

export type ActiveTownPackageRow = {
  id: string;
  package_id: string;
  name: string;
  year: number;
};

export async function getRequestedTownPackage(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  townPackageId: string | null | undefined,
) {
  if (townPackageId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(townPackageId);

    return supabase
      .from("town_packages")
      .select("id, package_id, name, year")
      .eq(isUuid ? "id" : "package_id", townPackageId)
      .limit(1)
      .maybeSingle();
  }

  return supabase.from("town_packages").select("id, package_id, name, year").order("year", { ascending: false }).limit(1).maybeSingle();
}

export type StudioAssetLookupRow = {
  id: string;
  asset_id: string;
  town_package_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  sha256_checksum: string;
  sheet_number: number | null;
};

export async function getStudioAssetByAssetId(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  assetId: string,
) {
  return supabase
    .from("sanborn_sheet_assets")
    .select("id, asset_id, town_package_id, storage_bucket, storage_path, original_filename, sha256_checksum, sheet_number")
    .eq("asset_id", assetId)
    .maybeSingle();
}

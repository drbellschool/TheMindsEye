import { NextRequest } from "next/server";
import { jsonError } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

/**
 * Kept as a compatibility endpoint so older clients receive an actionable
 * response. Image bytes must use the shared prepare/TUS/finalize pipeline.
 */
export async function POST(_request: NextRequest) {
  return jsonError(410, "Image replacement now uses direct resumable upload. Prepare an upload through the shared image-upload endpoint.", { code: "direct_upload_required" });
}

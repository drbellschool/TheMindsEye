import { NextRequest } from "next/server";
import { jsonError } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

/** Compatibility endpoint. Image bytes use the shared direct TUS pipeline. */
export async function POST(_request: NextRequest) {
  return jsonError(410, "Sanborn image uploads now use direct resumable upload. Prepare an upload through the shared image-upload endpoint.", { code: "direct_upload_required" });
}

import { NextRequest, NextResponse } from "next/server";

import {
  createMapStudioSessionCookie,
  getMapStudioCookieOptions,
  hasMapStudioOwnerPassword,
  mapStudioSessionCookieName,
  verifyMapStudioPassword,
} from "@/lib/map-studio-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasMapStudioOwnerPassword()) {
    return NextResponse.json({ ok: false, message: "MAP_STUDIO_OWNER_PASSWORD is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;

  if (!verifyMapStudioPassword(body?.password)) {
    return NextResponse.json({ ok: false, message: "Incorrect Historical Map Studio password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(mapStudioSessionCookieName, createMapStudioSessionCookie(), getMapStudioCookieOptions());

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(mapStudioSessionCookieName, "", {
    ...getMapStudioCookieOptions(),
    maxAge: 0,
  });

  return response;
}

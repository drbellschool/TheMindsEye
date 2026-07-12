import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const mapStudioSessionCookieName = "mindseye_map_studio_owner";
export const mapStudioSessionMaxAgeSeconds = 60 * 60 * 24 * 30;

type SessionPayload = {
  marker: string;
  expiresAt: number;
  nonce: string;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret(): string | null {
  return process.env.MAP_STUDIO_OWNER_PASSWORD ?? null;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function hasMapStudioOwnerPassword(): boolean {
  return Boolean(getSessionSecret());
}

export function verifyMapStudioPassword(candidate: string | null | undefined): boolean {
  const configuredPassword = getSessionSecret();

  if (!configuredPassword || !candidate) {
    return false;
  }

  const configured = Buffer.from(configuredPassword);
  const supplied = Buffer.from(candidate);

  return configured.length === supplied.length && timingSafeEqual(configured, supplied);
}

export function createMapStudioSessionCookie(now = Date.now()): string {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error("MAP_STUDIO_OWNER_PASSWORD is not configured.");
  }

  const payload: SessionPayload = {
    marker: "map-studio-owner",
    expiresAt: now + mapStudioSessionMaxAgeSeconds * 1000,
    nonce: randomBytes(18).toString("base64url"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function validateMapStudioSessionCookie(cookieValue: string | null | undefined, now = Date.now()): boolean {
  const secret = getSessionSecret();

  if (!secret || !cookieValue) {
    return false;
  }

  const [encodedPayload, signature] = cookieValue.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

    return payload.marker === "map-studio-owner" && Number.isFinite(payload.expiresAt) && payload.expiresAt > now;
  } catch {
    return false;
  }
}

export async function hasMapStudioOwnerSession(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return validateMapStudioSessionCookie(cookieStore.get(mapStudioSessionCookieName)?.value);
}

export function getMapStudioCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: mapStudioSessionMaxAgeSeconds,
  };
}

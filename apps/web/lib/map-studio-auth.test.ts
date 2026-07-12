import assert from "node:assert/strict";
import test from "node:test";

import {
  createMapStudioSessionCookie,
  getMapStudioCookieOptions,
  hasMapStudioOwnerPassword,
  mapStudioSessionMaxAgeSeconds,
  validateMapStudioSessionCookie,
  verifyMapStudioPassword,
} from "./map-studio-auth.ts";

const originalPassword = process.env.MAP_STUDIO_OWNER_PASSWORD;

test.afterEach(() => {
  if (originalPassword === undefined) {
    delete process.env.MAP_STUDIO_OWNER_PASSWORD;
  } else {
    process.env.MAP_STUDIO_OWNER_PASSWORD = originalPassword;
  }
});

test("requires a configured owner password", () => {
  delete process.env.MAP_STUDIO_OWNER_PASSWORD;

  assert.equal(hasMapStudioOwnerPassword(), false);
  assert.equal(verifyMapStudioPassword("anything"), false);
  assert.equal(validateMapStudioSessionCookie(null), false);
  assert.throws(() => createMapStudioSessionCookie(), /MAP_STUDIO_OWNER_PASSWORD/);
});

test("validates owner password without exposing it to browser code", () => {
  process.env.MAP_STUDIO_OWNER_PASSWORD = "correct horse battery staple";

  assert.equal(hasMapStudioOwnerPassword(), true);
  assert.equal(verifyMapStudioPassword("correct horse battery staple"), true);
  assert.equal(verifyMapStudioPassword("incorrect"), false);
  assert.equal(verifyMapStudioPassword(null), false);
});

test("creates signed owner-session cookies and rejects tampering or expiration", () => {
  process.env.MAP_STUDIO_OWNER_PASSWORD = "session secret";
  const now = 1_700_000_000_000;
  const cookie = createMapStudioSessionCookie(now);

  assert.equal(validateMapStudioSessionCookie(cookie, now + 1000), true);
  assert.equal(validateMapStudioSessionCookie(`${cookie}tampered`, now + 1000), false);
  assert.equal(validateMapStudioSessionCookie(cookie, now + mapStudioSessionMaxAgeSeconds * 1000 + 1), false);
});

test("uses secure HttpOnly cookie options for the owner session", () => {
  const options = getMapStudioCookieOptions();

  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, mapStudioSessionMaxAgeSeconds);
});

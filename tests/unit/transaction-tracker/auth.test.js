import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionToken,
  isValidSessionToken,
  sessionCookie,
  verifyPassword,
} from "../../../server/auth.js";

test("validates passwords without storing or comparing the raw value", () => {
  assert.equal(verifyPassword("my private password", "my private password"), true);
  assert.equal(verifyPassword("different password", "my private password"), false);
  assert.equal(verifyPassword(undefined, "my private password"), false);
});

test("signs expiring sessions and rejects tampered or expired tokens", () => {
  const secret = randomBytes(32);
  const now = Date.UTC(2026, 9, 22);
  const { token } = createSessionToken(secret, now);

  assert.equal(isValidSessionToken(token, secret, now), true);
  assert.equal(isValidSessionToken(`${token}x`, secret, now), false);
  assert.equal(isValidSessionToken(token, randomBytes(32), now), false);
  assert.equal(isValidSessionToken(token, secret, now + 9 * 60 * 60 * 1000), false);
  assert.equal(isValidSessionToken(undefined, secret, now), false);
});

test("uses HTTP-only strict same-site cookies and supports clearing a session", () => {
  const secret = randomBytes(32);
  const { token } = createSessionToken(secret);

  assert.match(sessionCookie(token, { secure: true }), /HttpOnly; SameSite=Strict/);
  assert.match(sessionCookie(token, { secure: true }), /; Secure$/);
  assert.match(clearSessionCookie({ secure: false }), /Max-Age=0$/);

  assert.equal(
    getSessionToken({ headers: { cookie: `other=value; transaction-tracker-session=${token}` } }),
    token
  );
  assert.equal(getSessionToken({ headers: {} }), null);
});

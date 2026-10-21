import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "transaction-tracker-session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyPassword(candidate, password) {
  if (typeof candidate !== "string" || typeof password !== "string") {
    return false;
  }

  const candidateHash = createHash("sha256").update(candidate).digest();
  const passwordHash = createHash("sha256").update(password).digest();
  return timingSafeEqual(candidateHash, passwordHash);
}

export function createSessionToken(secret, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${expiresAt}.${randomBytes(24).toString("base64url")}`;
  return {
    token: `${payload}.${signature(payload, secret)}`,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function isValidSessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") {
    return false;
  }

  const [rawExpiry, nonce, suppliedSignature, ...extra] = token.split(".");
  if (!rawExpiry || !nonce || !suppliedSignature || extra.length > 0) {
    return false;
  }

  const expiry = Number(rawExpiry);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(now / 1000)) {
    return false;
  }

  const expectedSignature = Buffer.from(signature(`${rawExpiry}.${nonce}`, secret));
  const actualSignature = Buffer.from(suppliedSignature);
  return (
    expectedSignature.length === actualSignature.length &&
    timingSafeEqual(expectedSignature, actualSignature)
  );
}

export function getSessionToken(request) {
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== "string") {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (cookie.slice(0, separator).trim() === SESSION_COOKIE) {
      return cookie.slice(separator + 1).trim();
    }
  }

  return null;
}

export function sessionCookie(token, { secure }) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie({ secure }) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** The unlock cookie lives 8 hours (DEMO-01 AC1). */
export const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

/** Constant-time comparison of two strings of any length (both are hashed first, so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// The signing key mixes the secret with the demo code: changing the code ends every unlock at once.
const key = (secret: string, code: string) => `${secret}\u0000${code}`;

/** `v1.<expiry ms>.<hmac>`; no personal data inside. */
export function signUnlock(secret: string, code: string, now = Date.now()): string {
  const body = `v1.${now + UNLOCK_TTL_MS}`;
  const mac = createHmac("sha256", key(secret, code)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyUnlock(secret: string, code: string, token: string | undefined, now = Date.now()): boolean {
  if (!token || !secret || !code) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= now || expires - now > UNLOCK_TTL_MS) return false;
  const mac = createHmac("sha256", key(secret, code)).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  return safeEqual(mac, parts[2]);
}

/** The failed-attempt counter keys on a hash, never on the IP address itself. */
export function hashIp(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("hex");
}

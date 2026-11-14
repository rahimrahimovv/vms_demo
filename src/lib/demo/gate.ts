import "server-only";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashIp, safeEqual, signUnlock, verifyUnlock, UNLOCK_TTL_MS } from "./token";

/**
 * Demo tools (Switch user, Fill sample, End deadline now, Reset, Load) need BOTH demo mode (DEMO_MODE=true) and an
 * unlocked browser session: the presenter has entered the demo code (D-022, DEMO-01 AC1, CLAUDE.md rule 13).
 * Without both, every demo endpoint and server action answers "Not available" and changes nothing.
 */
export const DEMO_COOKIE = "demo_unlock";
export const NOT_AVAILABLE = "Not available";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

function secrets(): { secret: string; code: string } | null {
  const secret = process.env.DEMO_SESSION_SECRET ?? "";
  const code = process.env.DEMO_ACCESS_CODE ?? "";
  // A missing or weak setting keeps the demo locked instead of open.
  if (secret.length < 16 || code.length < 6) return null;
  return { secret, code };
}

/** Demo mode on AND a valid unlock cookie. */
export async function isDemoUnlocked(): Promise<boolean> {
  if (!isDemoMode()) return false;
  const s = secrets();
  if (!s) return false;
  const jar = await cookies();
  return verifyUnlock(s.secret, s.code, jar.get(DEMO_COOKIE)?.value);
}

/** For route handlers: null when the demo tools may run, otherwise the "Not available" answer. */
export async function demoNotAvailable(): Promise<Response | null> {
  return (await isDemoUnlocked()) ? null : Response.json({ error: NOT_AVAILABLE }, { status: 404 });
}

export type UnlockResult = "ok" | "invalid" | "locked" | "unavailable";

async function clientKey(secret: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashIp(secret, ip);
}

/**
 * Checks the demo code (constant time), limits failed attempts per IP (5 in 15 minutes lock the IP for 15 minutes)
 * and sets the httpOnly signed cookie on success.
 */
export async function unlockDemo(code: string): Promise<UnlockResult> {
  if (!isDemoMode()) return "unavailable";
  const s = secrets();
  if (!s) return "unavailable";
  const db = createAdminClient();
  const key = await clientKey(s.secret);

  const { data: left } = await db.rpc("demo_attempt_status", { p_ip_hash: key });
  if (typeof left === "number" && left > 0) return "locked";

  if (!safeEqual(code.trim(), s.code)) {
    const { data: lockedFor } = await db.rpc("demo_attempt_fail", { p_ip_hash: key });
    return typeof lockedFor === "number" && lockedFor > 0 ? "locked" : "invalid";
  }

  await db.rpc("demo_attempt_clear", { p_ip_hash: key });
  const jar = await cookies();
  jar.set(DEMO_COOKIE, signUnlock(s.secret, s.code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_TTL_MS / 1000,
  });
  return "ok";
}

export async function lockDemo(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
}

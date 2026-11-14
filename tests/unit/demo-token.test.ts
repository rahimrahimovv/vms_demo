import { describe, expect, it } from "vitest";
import { hashIp, safeEqual, signUnlock, UNLOCK_TTL_MS, verifyUnlock } from "@/lib/demo/token";

const SECRET = "test-secret-with-enough-length";
const CODE = "demo-code-123";

describe("demo unlock cookie (D-022)", () => {
  it("accepts a fresh token and rejects it after 8 hours", () => {
    const now = Date.UTC(2026, 10, 18, 10, 0, 0);
    const token = signUnlock(SECRET, CODE, now);
    expect(verifyUnlock(SECRET, CODE, token, now + 1000)).toBe(true);
    expect(verifyUnlock(SECRET, CODE, token, now + UNLOCK_TTL_MS - 1)).toBe(true);
    expect(verifyUnlock(SECRET, CODE, token, now + UNLOCK_TTL_MS + 1)).toBe(false);
  });

  it("rejects a tampered expiry, a tampered signature, junk and a missing cookie", () => {
    const now = Date.now();
    const [v, , mac] = signUnlock(SECRET, CODE, now).split(".");
    expect(verifyUnlock(SECRET, CODE, `${v}.${now + 3 * UNLOCK_TTL_MS}.${mac}`, now)).toBe(false);
    expect(verifyUnlock(SECRET, CODE, `${v}.${now + 1000}.${mac}x`, now)).toBe(false);
    expect(verifyUnlock(SECRET, CODE, "garbage", now)).toBe(false);
    expect(verifyUnlock(SECRET, CODE, undefined, now)).toBe(false);
  });

  it("ends every unlock when the secret or the demo code changes", () => {
    const token = signUnlock(SECRET, CODE);
    expect(verifyUnlock(SECRET, "another-code", token)).toBe(false);
    expect(verifyUnlock("another-secret-long-enough", CODE, token)).toBe(false);
  });

  it("compares in constant time over any length and never stores the IP", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    const h = hashIp(SECRET, "203.0.113.7");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(hashIp(SECRET, "203.0.113.8")).not.toBe(h);
  });
});

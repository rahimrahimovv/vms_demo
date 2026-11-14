import { describe, expect, it } from "vitest";
import { generateTempPassword, TEMP_PASSWORD_LENGTH, validatePasswordChange } from "@/lib/users/password";
import { SECTIONS } from "@/lib/auth/sections";
import en from "../../messages/en.json";

const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);

describe("PLT-03 AC2: the change-password form", () => {
  const ok = { current: "old-password", next: "new-password", confirm: "new-password" };

  it("accepts a valid change", () => {
    expect(validatePasswordChange(ok)).toEqual({});
  });

  it("refuses a new password shorter than 8 characters", () => {
    expect(validatePasswordChange({ ...ok, next: "short", confirm: "short" }).next).toBe("password.errors.tooShort");
    expect(get("password.errors.tooShort")).toBe("Use at least 8 characters");
  });

  it("refuses a confirmation that differs", () => {
    expect(validatePasswordChange({ ...ok, confirm: "other-password" }).confirm).toBe("password.errors.mismatch");
    expect(get("password.errors.mismatch")).toBe("The passwords do not match");
  });

  it("refuses the same password as before", () => {
    expect(validatePasswordChange({ current: "same-password", next: "same-password", confirm: "same-password" }).next).toBe(
      "password.errors.same",
    );
    expect(get("password.errors.same")).toBe("Choose a different password");
  });

  it("asks for the current password; its correctness is decided by the server", () => {
    expect(validatePasswordChange({ ...ok, current: "" }).current).toBe("errors.required");
    expect(get("password.errors.currentWrong")).toBe("The current password is incorrect");
  });

  it("the sign-in page text has no reset link promise (AC7)", () => {
    expect(get("signIn.forgot")).toBe("Forgot your password? Ask your buyer or your administrator to reset it.");
  });
});

describe("PLT-03 AC4: the temporary password", () => {
  it("has 12 characters with an upper-case letter, a lower-case letter and a digit, and no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it("is different every time and long enough to pass the 8-character rule", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTempPassword()));
    expect(seen.size).toBe(100);
    expect(validatePasswordChange({ current: "x", next: [...seen][0], confirm: [...seen][0] })).toEqual({});
  });
});

describe("PLT-03: the user menu is reachable by every role", () => {
  it("the change-password page is not a role section (it is open to every signed-in user)", () => {
    expect(SECTIONS.some((s) => s.href === "/change-password")).toBe(false);
  });
});

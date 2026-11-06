import { describe, expect, it } from "vitest";
import { canAccess, sectionForPath, sectionsFor } from "@/lib/auth/sections";

// PLT-01 AC4/AC5: the menu and the guard come from the same Role Matrix config.
describe("Role Matrix sections", () => {
  it("Admin sees My tasks and Users", () => {
    expect(sectionsFor(["ADMIN"]).map((s) => s.key)).toEqual(["home", "adminUsers"]);
  });

  it.each(["REQUESTER", "APPROVER", "PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "VENDOR"] as const)(
    "%s does not see Users and cannot open it",
    (role) => {
      expect(sectionsFor([role]).map((s) => s.key)).toEqual(["home"]);
      expect(canAccess([role], "adminUsers")).toBe(false);
    },
  );

  it("a user with several roles gets the union", () => {
    expect(canAccess(["REQUESTER", "ADMIN"], "adminUsers")).toBe(true);
  });

  it("a user without roles gets nothing", () => {
    expect(sectionsFor([])).toEqual([]);
    expect(canAccess([], "home")).toBe(false);
  });

  it("maps paths to the section for the top-bar title", () => {
    expect(sectionForPath("/")?.key).toBe("home");
    expect(sectionForPath("/admin/users")?.key).toBe("adminUsers");
    expect(sectionForPath("/admin/users/abc")?.key).toBe("adminUsers");
    expect(sectionForPath("/admin/usersx")).toBeUndefined();
  });
});

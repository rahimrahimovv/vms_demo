import { describe, expect, it } from "vitest";
import { canAccess, sectionForPath, sectionsFor } from "@/lib/auth/sections";

// PLT-01 AC4/AC5: the menu and the guard come from the same Role Matrix config.
describe("Role Matrix sections", () => {
  it("Admin: users, questionnaire builder, vendor cards and AVL (view)", () => {
    expect(sectionsFor(["ADMIN"]).map((s) => s.key)).toEqual(["home", "vendors", "avl", "adminUsers", "adminQuestionnaire"]);
  });

  it("Procurement Specialist: vendor cards, questionnaires, category applications, AVL", () => {
    expect(sectionsFor(["PROCUREMENT_SPECIALIST"]).map((s) => s.key)).toEqual([
      "home",
      "vendors",
      "questionnaires",
      "categoryApplications",
      "avl",
    ]);
  });

  it("Committee Member: vendor cards only (REG-06 AC7)", () => {
    expect(sectionsFor(["COMMITTEE_MEMBER"]).map((s) => s.key)).toEqual(["home", "vendors"]);
    expect(canAccess(["COMMITTEE_MEMBER"], "questionnaires")).toBe(false);
    expect(canAccess(["COMMITTEE_MEMBER"], "avl")).toBe(false);
  });

  it("Vendor: own registration, qualification, categories and profile; no internal screens", () => {
    expect(sectionsFor(["VENDOR"]).map((s) => s.key)).toEqual([
      "home",
      "vendorRegistration",
      "vendorQualification",
      "vendorCategories",
      "vendorProfile",
    ]);
    for (const key of ["vendors", "questionnaires", "categoryApplications", "avl", "adminUsers"] as const) {
      expect(canAccess(["VENDOR"], key)).toBe(false);
    }
  });

  it.each(["REQUESTER", "APPROVER"] as const)("%s sees no vendor or admin screens in Slice 2", (role) => {
    expect(sectionsFor([role]).map((s) => s.key)).toEqual(["home"]);
    expect(canAccess([role], "adminUsers")).toBe(false);
    expect(canAccess([role], "vendors")).toBe(false);
  });

  it("internal users never get the vendor portal screens", () => {
    expect(canAccess(["ADMIN", "PROCUREMENT_SPECIALIST"], "vendorRegistration")).toBe(false);
  });

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
    expect(sectionForPath("/vendors/abc")?.key).toBe("vendors");
    expect(sectionForPath("/vendor/registration")?.key).toBe("vendorRegistration");
  });
});

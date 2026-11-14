import { describe, expect, it } from "vitest";
import { canAccess, sectionForPath, sectionsFor } from "@/lib/auth/sections";
import { bellBadge } from "@/lib/notifications";

// PLT-01 AC4/AC5: the menu and the guard come from the same Role Matrix config.
describe("Role Matrix sections", () => {
  it("Admin: plan, PRs (read), sourcing (read), vendor cards, AVL (view), users, questionnaire, dictionaries, categories, items", () => {
    expect(sectionsFor(["ADMIN"]).map((s) => s.key)).toEqual([
      "home",
      "plan",
      "requisitions",
      "sourcing",
      "purchaseOrders",
      "decisions",
      "minutes",
      "vendors",
      "avl",
      "adminUsers",
      "adminQuestionnaire",
      "adminDictionaries",
      "adminCategories",
      "adminItems",
      "adminCommittee",
    ]);
  });

  it("Procurement Specialist: plan, PRs, sourcing, vendor cards, questionnaires, category applications, AVL", () => {
    expect(sectionsFor(["PROCUREMENT_SPECIALIST"]).map((s) => s.key)).toEqual([
      "home",
      "plan",
      "requisitions",
      "sourcing",
      "purchaseOrders",
      "decisions",
      "minutes",
      "vendors",
      "questionnaires",
      "categoryApplications",
      "changeRequests",
      "avl",
    ]);
  });

  it("Committee Member: sourcing (read), decisions, minutes and vendor cards (REG-06 AC7); no plan, no PRs, no committee setup", () => {
    expect(sectionsFor(["COMMITTEE_MEMBER"]).map((s) => s.key)).toEqual(["home", "sourcing", "purchaseOrders", "decisions", "minutes", "vendors"]);
    expect(canAccess(["COMMITTEE_MEMBER"], "adminCommittee")).toBe(false);
    expect(canAccess(["COMMITTEE_MEMBER"], "questionnaires")).toBe(false);
    expect(canAccess(["COMMITTEE_MEMBER"], "avl")).toBe(false);
    expect(canAccess(["COMMITTEE_MEMBER"], "plan")).toBe(false);
  });

  it("Vendor: own registration, qualification, categories, profile and invitations; no internal screens", () => {
    expect(sectionsFor(["VENDOR"]).map((s) => s.key)).toEqual([
      "home",
      "vendorRegistration",
      "vendorQualification",
      "vendorCategories",
      "vendorProfile",
      "vendorInvitations",
      "vendorPurchaseOrders",
    ]);
    for (const key of ["vendors", "questionnaires", "categoryApplications", "avl", "adminUsers", "plan", "requisitions", "sourcing", "adminItems", "decisions", "minutes", "adminCommittee", "purchaseOrders"] as const) {
      expect(canAccess(["VENDOR"], key)).toBe(false);
    }
  });

  it("Vendor menu: Registration shows only while DRAFT, SUBMITTED, RETURNED or REJECTED (REG-07 AC11)", () => {
    for (const status of ["DRAFT", "SUBMITTED", "RETURNED", "REJECTED"]) {
      expect(sectionsFor(["VENDOR"], status).map((s) => s.key)).toContain("vendorRegistration");
    }
    const approved = sectionsFor(["VENDOR"], "APPROVED").map((s) => s.key);
    expect(approved).not.toContain("vendorRegistration");
    expect(approved).toContain("vendorProfile");
  });

  it("Bell badge shows 99+ above 99 unread", () => {
    expect(bellBadge(99)).toBe("99");
    expect(bellBadge(100)).toBe("99+");
  });

  it("Requester: plan and PRs, no decisions or minutes", () => {
    expect(sectionsFor(["REQUESTER"]).map((s) => s.key)).toEqual(["home", "plan", "requisitions", "purchaseOrders"]);
    expect(canAccess(["REQUESTER"], "minutes")).toBe(false);
    expect(canAccess(["REQUESTER"], "vendorPurchaseOrders")).toBe(false);
  });

  it("Approver: plan, PRs and minutes (Role Matrix: view minutes), no committee setup", () => {
    expect(sectionsFor(["APPROVER"]).map((s) => s.key)).toEqual(["home", "plan", "requisitions", "purchaseOrders", "decisions", "minutes"]);
    expect(canAccess(["APPROVER"], "adminCommittee")).toBe(false);
  });

  it.each(["REQUESTER", "APPROVER"] as const)("%s: no vendor or admin screens", (role) => {
    expect(canAccess([role], "adminDictionaries")).toBe(false);
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
    expect(sectionForPath("/vendor/purchase-orders/abc")?.key).toBe("vendorPurchaseOrders");
    expect(sectionForPath("/purchase-orders/abc")?.key).toBe("purchaseOrders");
  });
});

import type { Role } from "./roles";

/**
 * Sections of the app and the roles that may open them, from the backlog's Role Matrix.
 * Single source of truth for the menu (PLT-01 AC4), the page guard (AC5) and the API 403 (NFR-003).
 * Each slice adds its sections here.
 */
export type SectionKey =
  | "home"
  | "vendorRegistration"
  | "vendorQualification"
  | "vendorCategories"
  | "vendorProfile"
  | "vendors"
  | "questionnaires"
  | "categoryApplications"
  | "avl"
  | "plan"
  | "requisitions"
  | "sourcing"
  | "vendorInvitations"
  | "adminUsers"
  | "adminQuestionnaire"
  | "adminDictionaries"
  | "adminCategories"
  | "adminItems"
  | "adminCommittee"
  | "decisions"
  | "minutes";

export type SectionIcon =
  | "home"
  | "users"
  | "fileText"
  | "clipboardCheck"
  | "tags"
  | "building"
  | "listChecks"
  | "shieldCheck"
  | "clipboardList"
  | "wallet"
  | "shoppingCart"
  | "bookOpen"
  | "folderTree"
  | "package"
  | "gavel"
  | "scrollText";

export type Section = {
  key: SectionKey;
  href: string;
  /** Key under "nav" in messages/en.json */
  labelKey: SectionKey;
  icon: SectionIcon;
  /** null = every signed-in user */
  roles: Role[] | null;
  group: "main" | "procurement" | "vendors" | "admin";
};

export const SECTIONS: Section[] = [
  { key: "home", href: "/", labelKey: "home", icon: "home", roles: null, group: "main" },
  // Vendor portal (Role Matrix: register, questionnaire, apply for categories, keep own profile)
  { key: "vendorRegistration", href: "/vendor/registration", labelKey: "vendorRegistration", icon: "fileText", roles: ["VENDOR"], group: "main" },
  { key: "vendorQualification", href: "/vendor/qualification", labelKey: "vendorQualification", icon: "clipboardCheck", roles: ["VENDOR"], group: "main" },
  { key: "vendorCategories", href: "/vendor/categories", labelKey: "vendorCategories", icon: "tags", roles: ["VENDOR"], group: "main" },
  { key: "vendorProfile", href: "/vendor/profile", labelKey: "vendorProfile", icon: "building", roles: ["VENDOR"], group: "main" },
  // "View the plan" = Requester, Approver, PS, Admin; only the Admin adds, edits or closes lines.
  { key: "vendorInvitations", href: "/vendor/invitations", labelKey: "vendorInvitations", icon: "clipboardList", roles: ["VENDOR"], group: "main" },
  { key: "plan", href: "/plan", labelKey: "plan", icon: "wallet", roles: ["REQUESTER", "APPROVER", "PROCUREMENT_SPECIALIST", "ADMIN"], group: "procurement" },
  // PRs: the Requester creates own PRs, the Approver decides, the PS sources approved ones (Slice 4),
  // the Admin reads. RLS shows other users' PRs only once submitted.
  { key: "requisitions", href: "/requisitions", labelKey: "requisitions", icon: "shoppingCart", roles: ["REQUESTER", "APPROVER", "PROCUREMENT_SPECIALIST", "ADMIN"], group: "procurement" },
  // Sourcing (RFQ-01, RFQ-04, RFQ-06): the Procurement Specialist works on it, the Admin reads. The Committee Member
  // reads too (CMT-04 AC2: the committee sees vendor names and technical documents once the opening is approved);
  // sealed data stays closed by RLS, and only the owner gets action buttons. Assumption to confirm with the BA.
  { key: "sourcing", href: "/sourcing", labelKey: "sourcing", icon: "listChecks", roles: ["PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN"], group: "procurement" },
  // Committee decisions (CMT-02, CMT-04) and minutes (CMT-03): "Vote on winner and PO decisions" = Committee Member
  // (never the sourcing owner); "View minutes" = Approver, PS, Committee Member, Admin. Never vendors.
  { key: "decisions", href: "/decisions", labelKey: "decisions", icon: "gavel", roles: ["APPROVER", "PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN"], group: "procurement" },
  { key: "minutes", href: "/minutes", labelKey: "minutes", icon: "scrollText", roles: ["APPROVER", "PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN"], group: "procurement" },
  // Vendor cards: PS, CM, Admin ("View a vendor card"); only PS decides on registrations.
  { key: "vendors", href: "/vendors", labelKey: "vendors", icon: "building", roles: ["PROCUREMENT_SPECIALIST", "COMMITTEE_MEMBER", "ADMIN"], group: "vendors" },
  // "Review answers, adjust points, confirm the grade or return" = PS
  { key: "questionnaires", href: "/questionnaires", labelKey: "questionnaires", icon: "clipboardCheck", roles: ["PROCUREMENT_SPECIALIST"], group: "vendors" },
  // "Qualify or reject a category application; view the AVL" = PS, Admin (view)
  { key: "categoryApplications", href: "/category-applications", labelKey: "categoryApplications", icon: "listChecks", roles: ["PROCUREMENT_SPECIALIST"], group: "vendors" },
  { key: "avl", href: "/avl", labelKey: "avl", icon: "shieldCheck", roles: ["PROCUREMENT_SPECIALIST", "ADMIN"], group: "vendors" },
  // "Manage users, catalogue, categories, dictionaries, settings, committee" and
  // "Build the qualification questionnaire" = Admin only.
  { key: "adminUsers", href: "/admin/users", labelKey: "adminUsers", icon: "users", roles: ["ADMIN"], group: "admin" },
  { key: "adminQuestionnaire", href: "/admin/questionnaire", labelKey: "adminQuestionnaire", icon: "clipboardList", roles: ["ADMIN"], group: "admin" },
  { key: "adminDictionaries", href: "/admin/dictionaries", labelKey: "adminDictionaries", icon: "bookOpen", roles: ["ADMIN"], group: "admin" },
  { key: "adminCategories", href: "/admin/categories", labelKey: "adminCategories", icon: "folderTree", roles: ["ADMIN"], group: "admin" },
  { key: "adminItems", href: "/admin/items", labelKey: "adminItems", icon: "package", roles: ["ADMIN"], group: "admin" },
  { key: "adminCommittee", href: "/admin/committee", labelKey: "adminCommittee", icon: "gavel", roles: ["ADMIN"], group: "admin" },
];

export const SECTION_GROUPS = ["main", "procurement", "vendors", "admin"] as const;

export function canAccess(roles: readonly Role[], key: SectionKey): boolean {
  const section = SECTIONS.find((s) => s.key === key);
  if (!section) return false;
  if (section.roles === null) return roles.length > 0;
  return section.roles.some((r) => roles.includes(r));
}

export function sectionsFor(roles: readonly Role[]): Section[] {
  return SECTIONS.filter((s) => canAccess(roles, s.key));
}

/** The section a path belongs to (longest matching href), used for the top-bar title. */
export function sectionForPath(pathname: string): Section | undefined {
  return [...SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => (s.href === "/" ? pathname === "/" : pathname === s.href || pathname.startsWith(`${s.href}/`)));
}

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
  | "adminUsers"
  | "adminQuestionnaire";

export type SectionIcon =
  | "home"
  | "users"
  | "fileText"
  | "clipboardCheck"
  | "tags"
  | "building"
  | "listChecks"
  | "shieldCheck"
  | "clipboardList";

export type Section = {
  key: SectionKey;
  href: string;
  /** Key under "nav" in messages/en.json */
  labelKey: SectionKey;
  icon: SectionIcon;
  /** null = every signed-in user */
  roles: Role[] | null;
  group: "main" | "vendors" | "admin";
};

export const SECTIONS: Section[] = [
  { key: "home", href: "/", labelKey: "home", icon: "home", roles: null, group: "main" },
  // Vendor portal (Role Matrix: register, questionnaire, apply for categories, keep own profile)
  { key: "vendorRegistration", href: "/vendor/registration", labelKey: "vendorRegistration", icon: "fileText", roles: ["VENDOR"], group: "main" },
  { key: "vendorQualification", href: "/vendor/qualification", labelKey: "vendorQualification", icon: "clipboardCheck", roles: ["VENDOR"], group: "main" },
  { key: "vendorCategories", href: "/vendor/categories", labelKey: "vendorCategories", icon: "tags", roles: ["VENDOR"], group: "main" },
  { key: "vendorProfile", href: "/vendor/profile", labelKey: "vendorProfile", icon: "building", roles: ["VENDOR"], group: "main" },
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
];

export const SECTION_GROUPS = ["main", "vendors", "admin"] as const;

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

import type { Role } from "./roles";

/**
 * Sections of the app and the roles that may open them, from the backlog's Role Matrix.
 * Single source of truth for the menu (PLT-01 AC4), the page guard (AC5) and the API 403 (NFR-003).
 * Each slice adds its sections here.
 */
export type SectionKey = "home" | "adminUsers";

export type Section = {
  key: SectionKey;
  href: string;
  /** Key under "nav" in messages/en.json */
  labelKey: SectionKey;
  icon: "home" | "users";
  /** null = every signed-in user */
  roles: Role[] | null;
  group: "main" | "admin";
};

export const SECTIONS: Section[] = [
  { key: "home", href: "/", labelKey: "home", icon: "home", roles: null, group: "main" },
  // Role Matrix: "Manage users, catalogue, categories, settings, committee" = Admin only.
  { key: "adminUsers", href: "/admin/users", labelKey: "adminUsers", icon: "users", roles: ["ADMIN"], group: "admin" },
];

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

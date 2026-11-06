export const ROLES = [
  "REQUESTER",
  "APPROVER",
  "PROCUREMENT_SPECIALIST",
  "COMMITTEE_MEMBER",
  "ADMIN",
  "VENDOR",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles the Admin can assign on Users (PLT-01 AC1). Vendors self-register (REG-01). */
export const INTERNAL_ROLES = ROLES.filter((r) => r !== "VENDOR") as Exclude<Role, "VENDOR">[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isInternalRole(value: unknown): value is Exclude<Role, "VENDOR"> {
  return isRole(value) && value !== "VENDOR";
}

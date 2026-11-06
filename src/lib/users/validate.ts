import { isInternalRole, type Role } from "@/lib/auth/roles";

export type UserFormValues = {
  fullName: string;
  email: string;
  password: string;
  roles: Exclude<Role, "VENDOR">[];
  isActive: boolean;
};

/** Error values are message keys in messages/en.json. */
export type UserFormErrors = Partial<Record<"fullName" | "email" | "password" | "roles" | "form", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseUserForm(formData: FormData): UserFormValues {
  const roles = formData.getAll("roles").filter(isInternalRole);
  return {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    roles: [...new Set(roles)],
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  };
}

/** PLT-01 AC1: name, e-mail, initial password of at least 8 characters, one or more roles. */
export function validateNewUser(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!values.fullName) errors.fullName = "users.errors.fullNameRequired";
  if (!EMAIL.test(values.email)) errors.email = "users.errors.emailInvalid";
  if (values.password.length < 8) errors.password = "users.errors.passwordShort";
  if (values.roles.length === 0) errors.roles = "users.errors.rolesRequired";
  return errors;
}

/** Editing: e-mail and password are not changed here. Guards against self-lockout. */
export function validateUserUpdate(
  values: UserFormValues,
  ctx: { targetId: string; currentUserId: string },
): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!values.fullName) errors.fullName = "users.errors.fullNameRequired";
  if (values.roles.length === 0) errors.roles = "users.errors.rolesRequired";
  if (ctx.targetId === ctx.currentUserId) {
    if (!values.roles.includes("ADMIN")) errors.roles = "users.errors.ownAdmin";
    if (!values.isActive) errors.form = "users.errors.ownDeactivate";
  }
  return errors;
}

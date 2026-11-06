import { describe, expect, it } from "vitest";
import { parseUserForm, validateNewUser, validateUserUpdate } from "@/lib/users/validate";

function form(entries: [string, string][]) {
  const fd = new FormData();
  entries.forEach(([k, v]) => fd.append(k, v));
  return fd;
}

describe("PLT-01 AC1: new user form", () => {
  it("accepts name, e-mail, 8+ character password and one or more roles", () => {
    const values = parseUserForm(
      form([
        ["fullName", " Leyla Mammadova "],
        ["email", " Leyla@Demo-Agro.test "],
        ["password", "12345678"],
        ["roles", "REQUESTER"],
        ["roles", "APPROVER"],
      ]),
    );
    expect(values.fullName).toBe("Leyla Mammadova");
    expect(values.email).toBe("leyla@demo-agro.test");
    expect(values.roles).toEqual(["REQUESTER", "APPROVER"]);
    expect(validateNewUser(values)).toEqual({});
  });

  it("rejects a 7-character password, no roles, empty name and bad e-mail", () => {
    const values = parseUserForm(form([["email", "not-an-email"], ["password", "1234567"]]));
    expect(validateNewUser(values)).toEqual({
      fullName: "users.errors.fullNameRequired",
      email: "users.errors.emailInvalid",
      password: "users.errors.passwordShort",
      roles: "users.errors.rolesRequired",
    });
  });

  it("drops VENDOR and unknown roles: the Admin assigns internal roles only", () => {
    const values = parseUserForm(form([["roles", "VENDOR"], ["roles", "SUPERUSER"], ["roles", "ADMIN"]]));
    expect(values.roles).toEqual(["ADMIN"]);
  });
});

describe("editing a user", () => {
  const base = { fullName: "Demo Admin", email: "admin@demo-agro.test", password: "", isActive: true };

  it("an Admin cannot remove their own Admin role", () => {
    const errors = validateUserUpdate({ ...base, roles: ["REQUESTER"] }, { targetId: "a", currentUserId: "a" });
    expect(errors.roles).toBe("users.errors.ownAdmin");
  });

  it("an Admin cannot deactivate their own account", () => {
    const errors = validateUserUpdate(
      { ...base, roles: ["ADMIN"], isActive: false },
      { targetId: "a", currentUserId: "a" },
    );
    expect(errors.form).toBe("users.errors.ownDeactivate");
  });

  it("an Admin may change another user's roles and deactivate them", () => {
    const errors = validateUserUpdate(
      { ...base, roles: ["APPROVER"], isActive: false },
      { targetId: "b", currentUserId: "a" },
    );
    expect(errors).toEqual({});
  });
});

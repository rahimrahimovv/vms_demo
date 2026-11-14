import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import { canAccess, type SectionKey } from "./sections";

/**
 * The signed-in user, or redirect to sign-in. Does NOT apply the password gate: only the change-password
 * page and its action use it. Everything else calls {@link requireUser}.
 */
export async function requireSignedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * For pages and server actions: the current user, or redirect to sign-in. PLT-03 AC6: a user marked "must change
 * password" gets the change-password form and nothing else until the password is changed; a REJECTED vendor gets
 * the "Registration rejected" page.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await requireSignedIn();
  if (user.mustChangePassword) redirect("/change-password");
  // REG-02 AC5: a vendor whose registration was rejected sees only the "Registration rejected" page
  if (user.vendorStatus === "REJECTED") redirect("/registration-rejected");
  return user;
}

/**
 * For pages: call BEFORE loading any data of the section (PLT-01 AC5).
 * Returns { user, allowed }; when not allowed the page renders <NoAccess /> and loads nothing.
 */
export async function checkSection(key: SectionKey): Promise<{ user: CurrentUser; allowed: boolean }> {
  const user = await requireUser();
  return { user, allowed: canAccess(user.roles, key) };
}

/** For route handlers that read the user themselves: false when the PLT-03 gate stops this user (answer 403). */
export function mayUseApi(user: CurrentUser | null): user is CurrentUser {
  return Boolean(user) && !user!.mustChangePassword && user!.vendorStatus !== "REJECTED";
}

/** For route handlers: 401 without a session, 403 without the role or while the password must change (NFR-003). */
export async function guardApi(
  key: SectionKey,
): Promise<{ user: CurrentUser; response: null } | { user: null; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!mayUseApi(user) || !canAccess(user.roles, key)) {
    return { user: null, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

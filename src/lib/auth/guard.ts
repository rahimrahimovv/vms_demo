import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import { canAccess, type SectionKey } from "./sections";

/** For pages and server actions: the current user, or redirect to sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
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

/** For route handlers: 401 without a session, 403 without the role (NFR-003). */
export async function guardApi(
  key: SectionKey,
): Promise<{ user: CurrentUser; response: null } | { user: null; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canAccess(user.roles, key)) {
    return { user: null, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

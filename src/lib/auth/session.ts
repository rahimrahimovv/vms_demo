import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  companyId: string;
  fullName: string;
  email: string;
  roles: Role[];
  /** Set only for vendor users (REG-01). */
  vendorId: string | null;
  /** PLT-03: set after a reset; every page, action and file route stops at the change-password form until it is cleared. */
  mustChangePassword: boolean;
  /** REG-02 AC5: set for vendor users; a REJECTED vendor sees only the "Registration rejected" page. */
  vendorStatus: string | null;
};

/**
 * The signed-in, active user with roles, or null. Cached per request.
 * Reads go through RLS as the user, so a deactivated user resolves to null.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: user } = await supabase
    .from("app_user")
    .select("id, company_id, full_name, email, is_active, vendor_id, must_change_password, user_role(role)")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.is_active) return null;

  const roles = (user.user_role ?? []).map((r: { role: string }) => r.role).filter(isRole);
  if (roles.length === 0) return null;

  let vendorStatus: string | null = null;
  if (user.vendor_id) {
    const { data: vendor } = await supabase.from("vendor").select("status").eq("id", user.vendor_id).maybeSingle();
    vendorStatus = vendor?.status ?? null;
  }

  return {
    id: user.id,
    companyId: user.company_id,
    fullName: user.full_name,
    email: user.email,
    roles,
    vendorId: user.vendor_id ?? null,
    mustChangePassword: user.must_change_password === true,
    vendorStatus,
  };
});

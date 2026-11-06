"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: "invalid" | "unavailable" | null; email: string };

/**
 * PLT-01 AC1/AC3: e-mail + password sign-in. A wrong e-mail or password, or an account
 * that is not an active app user, gives the same message and no session.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "invalid", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const isCredentials = error.status === 400 || error.code === "invalid_credentials" || error.code === "user_banned";
    return { error: isCredentials ? "invalid" : "unavailable", email };
  }

  const { data: appUser } = await supabase
    .from("app_user")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!appUser?.is_active) {
    await supabase.auth.signOut();
    return { error: "invalid", email };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

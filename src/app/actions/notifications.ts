"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { recordHref } from "@/lib/records";

/**
 * PLT-02 AC2: mark the notification read and open its record.
 * Runs as the user: RLS + the column grant allow only flipping is_read on their own rows.
 */
export async function openNotification(id: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification")
    .update({ is_read: true })
    .eq("id", id)
    .select("event, record_type, record_id")
    .maybeSingle();

  redirect(data ? recordHref(data.record_type, data.record_id, user.vendorId ? "vendor" : "internal", data.event) : "/");
}

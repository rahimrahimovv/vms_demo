"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { canAccess } from "@/lib/auth/sections";
import { createClient } from "@/lib/supabase/server";
import { errorKey } from "@/lib/db-errors";
import { isValidCommitteeSize, isValidVotingPeriod } from "@/lib/committee/rules";

export type CommitteeFormState = { error: string | null; saved?: boolean; attempt?: number };

/**
 * CMT-01: the Admin saves the members, the Chair and the voting period (business days). The checks run here
 * for the message and again in committee_save, which is the only way to write the committee.
 */
export async function saveCommittee(_prev: CommitteeFormState, formData: FormData): Promise<CommitteeFormState> {
  const user = await requireUser();
  const fail = (error: string) => ({ error, attempt: Date.now() });
  if (!canAccess(user.roles, "adminCommittee")) return fail("access.denied");

  const members = [...new Set(formData.getAll("member").map(String))];
  const chair = String(formData.get("chair") ?? "");
  const days = Number(formData.get("votingDays"));
  if (!isValidCommitteeSize(members.length)) return fail("errors.committeeSize");
  if (!chair || !members.includes(chair)) return fail("errors.chairRequired");
  if (!isValidVotingPeriod(days)) return fail("errors.votingPeriod");

  const supabase = await createClient();
  const { error } = await supabase.rpc("committee_save", { p_members: members, p_chair: chair, p_voting_days: days });
  if (error) return fail(errorKey(error) ?? "common.genericError");
  revalidatePath("/admin/committee");
  return { error: null, saved: true, attempt: Date.now() };
}

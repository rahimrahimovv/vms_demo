import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { CommitteeForm, type Candidate } from "@/components/committee-form";
import { Button } from "@/components/ui/button";
import { saveCommittee } from "./actions";

type CandidateRow = { id: string; full_name: string; email: string; user_role: { role: string }[] };

/** CMT-01: Admin sets the committee members, the Chair and the voting period. */
export default async function CommitteePage() {
  const { allowed } = await checkSection("adminCommittee");
  if (!allowed) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const [{ data: users }, { data: committee }, { data: members }] = await Promise.all([
    supabase
      .from("app_user")
      .select("id, full_name, email, user_role!inner(role)")
      .eq("is_active", true)
      .eq("user_role.role", "COMMITTEE_MEMBER")
      .order("full_name")
      .returns<CandidateRow[]>(),
    supabase.from("committee").select("voting_period_days").maybeSingle(),
    supabase.from("committee_member").select("user_id, is_chair"),
  ]);
  const candidates: Candidate[] = (users ?? []).map((u) => ({ id: u.id, fullName: u.full_name, email: u.email }));
  const eligible = new Set(candidates.map((c) => c.id));
  // a saved member who lost the role or was deactivated is not shown as selected: Save then asks for a valid list
  const initial = (members ?? []).filter((m) => eligible.has(m.user_id));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">{t("committee.title")}</h2>
      {candidates.length === 0 ? (
        <EmptyState
          message={t("committee.noCandidates")}
          action={
            <Button asChild>
              <Link href="/admin/users">{t("committee.addUsers")}</Link>
            </Button>
          }
        />
      ) : (
        <CommitteeForm
          action={saveCommittee}
          candidates={candidates}
          initialMembers={initial.map((m) => m.user_id)}
          initialChair={initial.find((m) => m.is_chair)?.user_id ?? ""}
          initialDays={committee?.voting_period_days ?? 3}
        />
      )}
    </div>
  );
}

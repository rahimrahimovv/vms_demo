import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { bakuToday } from "@/lib/vendors/rules";
import { loadFormOptions } from "@/lib/requisitions/queries";
import { NoAccess } from "@/components/no-access";
import { RequisitionForm } from "@/components/requisition-form";
import { saveRequisition } from "../actions";

/** PR-01: a new PR. Only Requesters create PRs (Role Matrix). */
export default async function NewRequisitionPage() {
  const { user, allowed } = await checkSection("requisitions");
  if (!allowed || !user.roles.includes("REQUESTER")) return <NoAccess />;

  const t = await getTranslations();
  const supabase = await createClient();
  const options = await loadFormOptions(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-2">
        <h2 className="text-2xl font-bold">{t("requisitions.newTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("requisitions.newSubtitle")}</p>
      </div>
      <RequisitionForm
        action={saveRequisition.bind(null, null)}
        initial={{ planLineId: options.planLines.length === 1 ? options.planLines[0].id : "", lines: [] }}
        {...options}
        today={bakuToday()}
      />
    </div>
  );
}

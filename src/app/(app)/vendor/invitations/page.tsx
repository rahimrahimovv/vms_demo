import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";

type InvitationRow = {
  sourcing_id: string;
  number: string;
  type: string;
  sourcing_status: string;
  deadline: string;
  invitation_status: string;
  proposal_status: string | null;
};

/** RFQ-02: the vendor's own invitations (public.vendor_invitation_list returns nothing of other vendors, NFR-001). */
export default async function VendorInvitationsPage() {
  const { allowed } = await checkSection("vendorInvitations");
  if (!allowed) return <NoAccess />;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase.rpc("vendor_invitation_list");
  const invitations = (data ?? []) as InvitationRow[];

  const rows: Row[] = invitations.map((i) => ({
    id: i.sourcing_id,
    cells: {
      number: {
        sort: i.number,
        node: (
          <Link href={`/vendor/invitations/${i.sourcing_id}`} className="font-medium text-primary hover:underline" data-testid="invitation-link">
            {i.number}
          </Link>
        ),
      },
      type: { sort: i.type, node: t(`sourcing.types.${i.type}`) },
      deadline: { sort: i.deadline, node: formatDateTime(i.deadline) },
      invitation: { sort: i.invitation_status, node: <StatusBadge status={i.invitation_status} /> },
      proposal: {
        sort: i.proposal_status ?? "",
        node: i.proposal_status ? <StatusBadge status={i.proposal_status} /> : t("common.none"),
      },
      sourcing: { sort: i.sourcing_status, node: <StatusBadge status={i.sourcing_status} /> },
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <h2 className="px-2 text-2xl font-bold">{t("nav.vendorInvitations")}</h2>
      {rows.length === 0 ? (
        <EmptyState message={t("invitations.empty")} />
      ) : (
        <SortableTable
          columns={[
            { key: "number", label: t("sourcing.columns.number") },
            { key: "type", label: t("sourcing.columns.type") },
            { key: "deadline", label: t("sourcing.columns.deadline") },
            { key: "invitation", label: t("invitations.columns.invitation") },
            { key: "proposal", label: t("invitations.columns.proposal") },
            { key: "sourcing", label: t("invitations.columns.sourcing") },
          ]}
          rows={rows}
          initialSort={{ key: "deadline", dir: "desc" }}
        />
      )}
    </div>
  );
}

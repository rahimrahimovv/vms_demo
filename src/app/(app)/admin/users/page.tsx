import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SortableTable, type Row } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  user_role: { role: string }[];
};

export default async function UsersPage() {
  const { allowed } = await checkSection("adminUsers");
  if (!allowed) return <NoAccess />; // PLT-01 AC5: nothing below runs, no data is loaded

  const t = await getTranslations();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_user")
    .select("id, full_name, email, is_active, created_at, user_role(role)")
    .order("full_name")
    .returns<UserRow[]>();
  const users = data ?? [];

  const addButton = (
    <Button asChild>
      <Link href="/admin/users/new">
        <UserPlus className="size-4" aria-hidden />
        {t("users.add")}
      </Link>
    </Button>
  );

  const rows: Row[] = users.map((u) => {
    const roles = u.user_role.map((r) => t(`roles.${r.role}`)).join(", ");
    const status = u.is_active ? "ACTIVE" : "INACTIVE";
    return {
      id: u.id,
      cells: {
        name: {
          sort: u.full_name,
          node: (
            <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
              {u.full_name}
            </Link>
          ),
        },
        email: { sort: u.email, node: u.email },
        roles: { sort: roles, node: roles },
        status: { sort: status, node: <StatusBadge status={status} /> },
        created: { sort: u.created_at, node: formatDate(u.created_at) },
      },
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">{addButton}</div>
      {users.length === 0 ? (
        <EmptyState message={t("users.empty")} action={addButton} />
      ) : (
        <SortableTable
          initialSort={{ key: "name", dir: "asc" }}
          columns={[
            { key: "name", label: t("users.columns.name") },
            { key: "email", label: t("users.columns.email") },
            { key: "roles", label: t("users.columns.roles") },
            { key: "status", label: t("users.columns.status") },
            { key: "created", label: t("users.columns.created") },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}

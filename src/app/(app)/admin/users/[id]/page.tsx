import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { isInternalRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { RecordHeader } from "@/components/record-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateUser } from "../actions";
import { UserForm } from "../user-form";

export default async function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { allowed } = await checkSection("adminUsers");
  if (!allowed) return <NoAccess />;

  const { id } = await params;
  const t = await getTranslations();
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("app_user")
    .select("id, full_name, email, is_active, user_role(role)")
    .eq("id", id)
    .maybeSingle();

  if (!user) return <EmptyState message={t("users.errors.notFound")} />;

  const roles: string[] = (user.user_role ?? []).map((r: { role: string }) => r.role);
  const isVendor = roles.includes("VENDOR");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <RecordHeader title={user.full_name} subtitle={user.email} status={user.is_active ? "ACTIVE" : "INACTIVE"} />
      {isVendor ? (
        <Alert>
          <AlertDescription>{t("users.errors.vendorAccount")}</AlertDescription>
        </Alert>
      ) : (
        <UserForm
          mode="edit"
          action={updateUser.bind(null, user.id)}
          initial={{
            errors: {},
            values: {
              fullName: user.full_name,
              email: user.email,
              roles: roles.filter(isInternalRole),
              isActive: user.is_active,
            },
          }}
        />
      )}
    </div>
  );
}

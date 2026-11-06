import { getTranslations } from "next-intl/server";
import { checkSection } from "@/lib/auth/guard";
import { NoAccess } from "@/components/no-access";
import { RecordHeader } from "@/components/record-header";
import { createUser } from "../actions";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  const { allowed } = await checkSection("adminUsers");
  if (!allowed) return <NoAccess />;
  const t = await getTranslations("users");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <RecordHeader title={t("newTitle")} />
      <UserForm
        mode="create"
        action={createUser}
        initial={{ errors: {}, values: { fullName: "", email: "", roles: [], isActive: true } }}
      />
    </div>
  );
}

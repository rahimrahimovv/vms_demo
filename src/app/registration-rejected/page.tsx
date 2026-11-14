import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSignedIn } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

/**
 * REG-02 AC5: a vendor whose registration was REJECTED signs in and sees only this page: the reason and
 * "Contact your buyer". Every other page redirects here (requireUser). Outside the app shell, so there is no menu.
 */
export default async function RegistrationRejectedPage() {
  const user = await requireSignedIn();
  if (user.mustChangePassword) redirect("/change-password");
  if (user.vendorStatus !== "REJECTED" || !user.vendorId) redirect("/");

  const t = await getTranslations();
  const supabase = await createClient();
  const { data: vendor } = await supabase.from("vendor").select("legal_name, review_comment").eq("id", user.vendorId).single();

  return (
    <AuthShell name={t("app.name")}>
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-bold" data-testid="rejected-title">
          {t("rejected.title")}
        </h1>
        <StatusBadge status="REJECTED" />
      </div>
      {vendor?.legal_name && <p className="text-[#3d4a50]">{vendor.legal_name}</p>}
      <div className="surface-warning flex flex-col gap-1 rounded-[18px] p-4" data-testid="rejected-reason">
        <span className="text-xs font-semibold text-[#3d4a50]">{t("rejected.reason")}</span>
        <span className="text-sm whitespace-pre-wrap">{vendor?.review_comment ?? t("common.none")}</span>
      </div>
      <p className="text-sm font-medium" data-testid="rejected-contact">
        {t("rejected.contact")}
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="lg" className="mt-2 w-full">
          {t("userMenu.signOut")}
        </Button>
      </form>
    </AuthShell>
  );
}

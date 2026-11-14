import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSignedIn } from "@/lib/auth/guard";
import { AuthShell } from "@/components/auth-shell";
import { ChangePasswordForm } from "./change-password-form";

/**
 * PLT-03 AC1, AC6: the change-password form. Outside the app shell on purpose: a user marked "must change password"
 * (after a reset) reaches nothing else until the password is changed, so there is no menu here for them.
 */
export default async function ChangePasswordPage() {
  const user = await requireSignedIn();
  const t = await getTranslations();
  const forced = user.mustChangePassword;

  return (
    <AuthShell name={t("app.name")}>
      <h1 className="text-[22px] font-bold">{t("password.title")}</h1>
      <p className="text-[#3d4a50]" data-testid="password-intro">
        {forced ? t("password.forcedNotice") : t("password.intro")}
      </p>
      <ChangePasswordForm />
      {!forced && (
        <Link href="/" className="pt-1.5 text-[13px] font-semibold text-primary hover:underline">
          {t("password.back")}
        </Link>
      )}
    </AuthShell>
  );
}

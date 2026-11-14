import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth-shell";
import { DemoBarSlot } from "@/components/layout/demo-bar-slot";
import { isDemoMode, isDemoUnlocked } from "@/lib/demo/gate";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();
  const showDemoLink = isDemoMode() && !(await isDemoUnlocked());

  return (
    <>
    <DemoBarSlot floating />
    <AuthShell name={t("app.name")}>
      <h1 className="text-[22px] font-bold">{t("signIn.title")}</h1>
      <p className="text-[#3d4a50]">{t("signIn.subtitle")}</p>
      <SignInForm />
      <p className="text-[13px] text-[#3d4a50]" data-testid="forgot-password">
        {t("signIn.forgot")}
      </p>
      <p className="pt-1.5 text-[13px] text-[#3d4a50]">
        {t("signIn.vendorPrompt")}{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline" data-testid="register-link">
          {t("signIn.registerLink")}
        </Link>
      </p>
      {showDemoLink && (
        <p className="text-[13px]">
          <Link href="/demo-access" className="font-semibold text-primary hover:underline" data-testid="demo-access-link">
            {t("demo.access.link")}
          </Link>
        </p>
      )}
    </AuthShell>
    </>
  );
}

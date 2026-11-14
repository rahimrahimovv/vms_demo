import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth-shell";
import { isDemoMode, isDemoUnlocked } from "@/lib/demo/gate";
import { DemoAccessForm } from "./demo-access-form";

/** D-022: the "Demo access" form. Without DEMO_MODE the page does not exist; unlocked browsers have nothing to do here. */
export default async function DemoAccessPage() {
  if (!isDemoMode()) notFound();
  if (await isDemoUnlocked()) redirect("/sign-in");
  const t = await getTranslations();

  return (
    <AuthShell name={t("app.name")}>
      <h1 className="text-[22px] font-bold">{t("demo.access.title")}</h1>
      <p className="text-[#3d4a50]">{t("demo.access.subtitle")}</p>
      <DemoAccessForm />
      <p className="pt-1.5 text-[13px]">
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">
          {t("demo.access.back")}
        </Link>
      </p>
    </AuthShell>
  );
}

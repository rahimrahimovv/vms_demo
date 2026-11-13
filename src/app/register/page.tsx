import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/layout/logo-mark";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { RegisterForm, type RegisterFormState } from "@/components/vendor/register-form";
import { registerVendor } from "./actions";

const EMPTY: RegisterFormState = {
  errors: {},
  values: {
    vendorType: "LOCAL_COMPANY",
    legalName: "",
    voen: "",
    foreignTaxNumber: "",
    countryCode: "",
    idCardNumber: "",
    contactPerson: "",
    contactEmail: "",
    phone: "",
  },
};

/** REG-01: public Register page, the short account form (no sign-in needed). */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();

  return (
    <main className="min-h-screen bg-background px-8 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-9" iconClassName="size-6" />
            <span className="text-xl font-semibold tracking-tight">{t("app.name")}</span>
          </div>
          <Link href="/sign-in" className="text-sm font-medium text-primary hover:underline">
            {t("registration.haveAccount")}
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("registration.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("registration.subtitle")}</p>
        </div>
        <RegisterForm action={registerVendor} initial={EMPTY} />
      </div>
    </main>
  );
}

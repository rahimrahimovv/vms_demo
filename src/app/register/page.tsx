import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { currencyOptions } from "@/lib/currencies";
import { RegistrationForm, type RegistrationFormState } from "@/components/vendor/registration-form";
import { registerVendor } from "./actions";

const EMPTY: RegistrationFormState = {
  errors: {},
  values: {
    vendorType: "LOCAL_COMPANY",
    legalName: "",
    voen: "",
    foreignTaxNumber: "",
    countryCode: "",
    idCardNumber: "",
    legalAddress: "",
    directorName: "",
    isVatPayer: "",
    contactPerson: "",
    contactEmail: "",
    phone: "",
    bankAccounts: [],
    foundedOn: "",
    owners: [],
  },
};

/** REG-01: public Register page (no sign-in needed). */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();

  return (
    <main className="min-h-screen bg-background px-8 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="size-5" aria-hidden />
            </span>
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
        <RegistrationForm mode="register" action={registerVendor} initial={EMPTY} currencies={await currencyOptions(createAdminClient())} />
      </div>
    </main>
  );
}

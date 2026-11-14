import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
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
    <AuthShell name={t("app.name")} wide>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold">{t("registration.title")}</h1>
          <p className="text-[#3d4a50]">{t("registration.subtitle")}</p>
        </div>
        <Link href="/sign-in" className="shrink-0 text-sm font-semibold text-primary hover:underline">
          {t("registration.haveAccount")}
        </Link>
      </div>
      <div className="pt-2">
        <RegisterForm action={registerVendor} initial={EMPTY} />
      </div>
    </AuthShell>
  );
}

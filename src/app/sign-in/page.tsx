import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="size-5" aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">{t("signIn.title")}</CardTitle>
            <CardDescription>{t("signIn.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

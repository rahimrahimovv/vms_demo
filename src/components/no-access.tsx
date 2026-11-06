import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/** PLT-01 AC5: shown instead of the page; the page loads no data of the section. */
export async function NoAccess() {
  const t = await getTranslations("access");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center" data-testid="no-access">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-semibold">{t("denied")}</h2>
      <Button asChild variant="outline">
        <Link href="/">{t("back")}</Link>
      </Button>
    </div>
  );
}

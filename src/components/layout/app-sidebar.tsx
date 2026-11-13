import { getTranslations } from "next-intl/server";
import { SECTION_GROUPS, type Section } from "@/lib/auth/sections";
import { LogoMark } from "./logo-mark";
import { SidebarNav } from "./sidebar-nav";

/** Left sidebar: logo "e-Procurement" and the menu for the user's roles (PLT-01 AC4). */
export async function AppSidebar({ sections }: { sections: Section[] }) {
  const t = await getTranslations();
  const groups = SECTION_GROUPS
    .map((group) => ({
      group,
      label: t(`nav.groups.${group}`),
      items: sections
        .filter((s) => s.group === group)
        .map((s) => ({ key: s.key, href: s.href, icon: s.icon, label: t(`nav.${s.labelKey}`) })),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <LogoMark className="size-8" iconClassName="size-5" />
        <span className="text-base font-semibold tracking-tight">{t("app.name")}</span>
      </div>
      <SidebarNav groups={groups} />
    </aside>
  );
}

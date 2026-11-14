import { getTranslations } from "next-intl/server";
import { SECTION_GROUPS, type Section } from "@/lib/auth/sections";
import { LogoMark } from "./logo-mark";
import { SidebarNav } from "./sidebar-nav";

/**
 * Floating dark-glass sidebar, 16 px from the edges: logo "e-Procurement" and the menu for the user's roles
 * (PLT-01 AC4). Content starts 256 px from the left.
 */
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
    <aside className="shell-sidebar fixed top-(--shell-gap) bottom-(--shell-gap) left-(--shell-gap) z-30 flex w-(--sidebar-w) flex-col overflow-hidden text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <LogoMark tone="sidebar" className="size-[30px]" iconClassName="size-4" />
        <span className="text-[15px] font-bold text-white">{t("app.name")}</span>
      </div>
      <SidebarNav groups={groups} />
    </aside>
  );
}

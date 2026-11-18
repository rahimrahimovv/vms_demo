"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { sectionForPath } from "@/lib/auth/sections";
import type { BellItem } from "@/lib/notifications";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

/** Top bar: a plain 56 px row with a bottom border. Breadcrumb on the left; bell and user on the right. */
export function TopBar({
  userId,
  fullName,
  roleLabels,
  initialItems,
  initialUnread,
}: {
  userId: string;
  fullName: string;
  roleLabels: string[];
  initialItems: BellItem[];
  initialUnread: number;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const section = sectionForPath(pathname);

  return (
    <header className="shell-bar sticky top-0 z-20 -mx-(--page-pad) flex h-(--topbar-h) items-center justify-between px-(--page-pad)">
      <nav aria-label={t("breadcrumb")} className="flex items-center gap-2 text-sm">
        <span className="font-medium" data-testid="page-title">
          {section ? t(section.labelKey) : ""}
        </span>
      </nav>
      <div className="flex items-center gap-3.5">
        <NotificationBell userId={userId} initialItems={initialItems} initialUnread={initialUnread} />
        <UserMenu fullName={fullName} roleLabels={roleLabels} />
      </div>
    </header>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { sectionForPath } from "@/lib/auth/sections";
import type { BellItem } from "@/lib/notifications";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

/** Top bar: page title, bell with unread count, user name and role (CLAUDE.md Design). */
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
    <header className="shell-bar sticky top-(--shell-gap) z-20 flex h-14 items-center justify-between px-5">
      <h1 className="text-base font-semibold" data-testid="page-title">
        {section ? t(section.labelKey) : ""}
      </h1>
      <div className="flex items-center gap-3.5">
        <NotificationBell userId={userId} initialItems={initialItems} initialUnread={initialUnread} />
        <UserMenu fullName={fullName} roleLabels={roleLabels} />
      </div>
    </header>
  );
}

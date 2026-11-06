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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card px-8">
      <h1 className="text-lg font-semibold tracking-tight" data-testid="page-title">
        {section ? t(section.labelKey) : ""}
      </h1>
      <div className="flex items-center gap-4">
        <NotificationBell userId={userId} initialItems={initialItems} initialUnread={initialUnread} />
        <UserMenu fullName={fullName} roleLabels={roleLabels} />
      </div>
    </header>
  );
}

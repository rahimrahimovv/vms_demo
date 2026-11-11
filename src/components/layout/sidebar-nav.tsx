"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  House,
  ListChecks,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sectionForPath, type Section } from "@/lib/auth/sections";

const ICONS: Record<Section["icon"], LucideIcon> = {
  home: House,
  users: Users,
  fileText: FileText,
  clipboardCheck: ClipboardCheck,
  clipboardList: ClipboardList,
  tags: Tags,
  building: Building2,
  listChecks: ListChecks,
  shieldCheck: ShieldCheck,
};

type NavGroup = {
  group: string;
  label: string;
  items: { key: string; href: string; icon: Section["icon"]; label: string }[];
};

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const activeKey = sectionForPath(pathname)?.key;

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5" data-testid="main-menu">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                data-section={item.key}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

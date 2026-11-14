"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderTree,
  Gavel,
  House,
  ListChecks,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Users,
  Wallet,
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
  wallet: Wallet,
  shoppingCart: ShoppingCart,
  bookOpen: BookOpen,
  folderTree: FolderTree,
  package: Package,
  gavel: Gavel,
  scrollText: ScrollText,
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
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pt-1 pb-4" data-testid="main-menu">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-label">{group.label}</p>
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
                  "flex items-center gap-2.5 rounded-[14px] border border-transparent px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white",
                  active && "border-white/25 bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent",
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

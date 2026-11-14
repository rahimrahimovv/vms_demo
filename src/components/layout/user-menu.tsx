"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** User name and role in the top bar, with Sign out. */
export function UserMenu({ fullName, roleLabels }: { fullName: string; roleLabels: string[] }) {
  const t = useTranslations("userMenu");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-[14px] px-2 py-1 text-left hover:bg-white/60">
        <Avatar className="size-[34px]">
          <AvatarFallback className="bg-(--avatar-bg) text-[13px] font-semibold text-brand-ink">
            {initials(fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold" data-testid="user-name">
            {fullName}
          </span>
          <span className="text-xs text-[#3d4a50]" data-testid="user-roles">
            {roleLabels.join(", ")}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut className="size-4" aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

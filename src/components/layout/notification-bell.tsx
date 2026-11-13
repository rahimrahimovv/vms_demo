"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { openNotification } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { BELL_MAX_ITEMS, bellBadge, messageValues, toBellItem, type BellItem, type NotificationRow } from "@/lib/notifications";

/**
 * PLT-02 AC1-2: bell with unread counter, pushed live via Supabase Realtime (RLS limits the
 * stream to the user's own rows). If the live push fails, the next page load refreshes it.
 */
export function NotificationBell({
  userId,
  initialItems,
  initialUnread,
}: {
  userId: string;
  initialItems: BellItem[];
  initialUnread: number;
}) {
  const t = useTranslations();
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // The session comes from cookies asynchronously. Join with the user's token, not the
      // anon key: anon has no access to notification, so an early join receives nothing.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notification", filter: `user_id=eq.${userId}` },
          (payload) => {
            const item = toBellItem(payload.new as NotificationRow);
            setItems((current) => [item, ...current.filter((i) => i.id !== item.id)].slice(0, BELL_MAX_ITEMS));
            if (!item.isRead) setUnread((n) => n + 1);
            router.refresh(); // My tasks counts and lists are server-rendered
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, router]);

  function text(item: BellItem) {
    const key = `notifications.events.${item.event}`;
    const values = messageValues(item.params, item.recordNumber, { has: t.has, translate: (k) => t(k) }, formatDate);
    return t.has(key) ? t(key, values) : t("notifications.fallback", values);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("bell.label", { count: unread })}
          data-testid="bell"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span
              data-testid="bell-count"
              className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            >
              {bellBadge(unread)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel>{t("bell.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("bell.empty")}</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              disabled={pending}
              onSelect={() => startTransition(() => openNotification(item.id))}
              className="flex flex-col items-start gap-1 py-2"
            >
              <span className={cn("text-sm", !item.isRead && "font-semibold")}>
                {!item.isRead && <span className="mr-2 inline-block size-2 rounded-full bg-primary align-middle" />}
                {text(item)}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.recordNumber ? `${item.recordNumber} · ` : ""}
                {formatDateTime(item.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

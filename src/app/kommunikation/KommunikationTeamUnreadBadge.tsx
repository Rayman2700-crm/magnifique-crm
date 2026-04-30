"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CLIENTIQUE_DEMO_TENANT_ID } from "@/lib/demoMode";

function Badge({ count }: { count: number }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (safeCount <= 0) return null;
  return (
    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_5px_14px_rgba(47,121,255,0.32)]">
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}

function countUnreadTeamMessages(rows: any[], currentUserId: string, lastReadMessageId: string | null) {
  const messages = rows
    .map((row: any) => ({
      id: String(row?.id ?? ""),
      senderId: String(row?.sender_id ?? row?.senderId ?? ""),
      createdAt: String(row?.created_at ?? row?.createdAt ?? ""),
    }))
    .filter((message) => message.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const foreignCount = (list: typeof messages) =>
    list.filter((message) => message.senderId && message.senderId !== currentUserId).length;

  if (!lastReadMessageId) return foreignCount(messages);

  const lastReadIndex = messages.findIndex((message) => message.id === lastReadMessageId);
  if (lastReadIndex < 0) return foreignCount(messages);

  return foreignCount(messages.slice(lastReadIndex + 1));
}

export default function KommunikationTeamUnreadBadge({
  tenantId,
  currentUserId,
}: {
  tenantId: string | null;
  currentUserId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamTabOpen = Boolean(pathname?.startsWith("/kommunikation") && searchParams?.get("tab") === "team");
  const [count, setCount] = useState(0);
  const cancelledRef = useRef(false);
  const isDemoMode = tenantId === CLIENTIQUE_DEMO_TENANT_ID;
  const storageKey = useMemo(() => {
    if (!currentUserId) return null;
    return `team-chat:last-read:global:${currentUserId}`;
  }, [currentUserId]);

  useEffect(() => {
    cancelledRef.current = false;

    async function markLatestTeamMessageAsRead(rows: any[]) {
      if (!storageKey || typeof window === "undefined") return;
      const messages = rows
        .map((row: any) => ({ id: String(row?.id ?? ""), createdAt: String(row?.created_at ?? row?.createdAt ?? "") }))
        .filter((message) => message.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const latestMessage = messages[messages.length - 1];
      if (!latestMessage?.id) return;
      if (window.localStorage.getItem(storageKey) !== latestMessage.id) {
        window.localStorage.setItem(storageKey, latestMessage.id);
        window.dispatchEvent(new Event("communication:counts-changed"));
      }
    }

    async function loadUnreadCount() {
      if (teamTabOpen) {
        try {
          const res = await fetch("/api/chat/messages", { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            const rows = Array.isArray(json?.messages) ? json.messages : [];
            await markLatestTeamMessageAsRead(rows);
          }
        } catch {}
        if (!cancelledRef.current) setCount(0);
        return;
      }

      if (isDemoMode || !currentUserId) {
        if (!cancelledRef.current) setCount(0);
        return;
      }

      const lastReadMessageId =
        storageKey && typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;

      let apiCount = 0;
      try {
        const query = lastReadMessageId ? `?teamLastReadMessageId=${encodeURIComponent(lastReadMessageId)}` : "";
        const res = await fetch(`/api/kommunikation/counts${query}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          apiCount = Math.max(0, Math.trunc(Number(json?.teamUnreadCount ?? 0)));
        }
      } catch {}

      let directCount = 0;
      try {
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const rows = Array.isArray(json?.messages) ? json.messages : [];
          directCount = countUnreadTeamMessages(rows, currentUserId, lastReadMessageId);
        }
      } catch {}

      if (!cancelledRef.current) setCount(Math.max(apiCount, directCount));
    }

    loadUnreadCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadUnreadCount();
    }, 3000);
    const onFocus = () => loadUnreadCount();
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) loadUnreadCount();
    };
    const onCountsChanged = () => loadUnreadCount();

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("communication:counts-changed", onCountsChanged);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("communication:counts-changed", onCountsChanged);
    };
  }, [currentUserId, isDemoMode, storageKey, teamTabOpen]);

  return <Badge count={count} />;
}

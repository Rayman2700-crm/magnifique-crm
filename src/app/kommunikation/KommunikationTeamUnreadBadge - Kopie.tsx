"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessageRow = {
  id: string;
  sender_id: string;
  created_at: string;
};

function Badge({ count }: { count: number }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (safeCount <= 0) return null;
  return (
    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f79ff] px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_5px_14px_rgba(47,121,255,0.32)]">
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}

export default function KommunikationTeamUnreadBadge({
  tenantId,
  currentUserId,
}: {
  tenantId: string | null;
  currentUserId: string;
}) {
  const [count, setCount] = useState(0);
  const storageKey = useMemo(() => {
    if (!tenantId || !currentUserId) return null;
    return `team-chat:last-read:${tenantId}:${currentUserId}`;
  }, [tenantId, currentUserId]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function loadUnreadCount() {
      if (!storageKey || !currentUserId) {
        if (!cancelledRef.current) setCount(0);
        return;
      }

      try {
        const lastReadMessageId =
          typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelledRef.current) setCount(0);
          return;
        }

        const json = await res.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];
        const messages: ChatMessageRow[] = rows.map((row: any) => ({
          id: String(row.id),
          sender_id: String(row.sender_id),
          created_at: String(row.created_at),
        }));

        let nextCount = 0;
        if (!lastReadMessageId) {
          nextCount = messages.filter((message) => message.sender_id !== currentUserId).length;
        } else {
          const lastReadIndex = messages.findIndex((message) => message.id === lastReadMessageId);
          nextCount =
            lastReadIndex < 0
              ? messages.filter((message) => message.sender_id !== currentUserId).length
              : messages
                  .slice(lastReadIndex + 1)
                  .filter((message) => message.sender_id !== currentUserId).length;
        }

        if (!cancelledRef.current) setCount(Math.max(0, nextCount));
      } catch {
        if (!cancelledRef.current) setCount(0);
      }
    }

    loadUnreadCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadUnreadCount();
    }, 3000);
    const onFocus = () => loadUnreadCount();
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) loadUnreadCount();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey, currentUserId]);

  return <Badge count={count} />;
}

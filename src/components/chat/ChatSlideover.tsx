"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ChatClient, { type ChatMessageDTO, type RealtimeStatus } from "@/app/dashboard/chat/ChatClient";
import ChatTeamAvatars from "@/components/chat/ChatTeamAvatars";

function getRealtimeStatusLabel(status: RealtimeStatus) {
  if (status === "connected") return "Live verbunden";
  if (status === "reconnecting") return "Synchronisiere...";
  if (status === "connecting") return "Verbinde...";
  return "Offline";
}

function realtimeStatusChipClass(status: RealtimeStatus) {
  if (status === "connected") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "reconnecting") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  if (status === "connecting") {
    return "border-white/15 bg-white/5 text-white/70";
  }

  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function closeIconButtonClass() {
  return "inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.04] text-white/85 transition-colors hover:bg-white/[0.10] hover:text-white";
}

export default function ChatSlideover({
  tenantId,
  currentUserId,
  currentUserName,
}: {
  tenantId: string | null;
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [initialMessages, setInitialMessages] = useState<ChatMessageDTO[]>([]);

  const open = searchParams?.get("openChat") === "1";

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openChat");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadMessages() {
      setLoading(true);
      try {
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];

        const mapped: ChatMessageDTO[] = rows.map((r: any) => ({
          id: String(r.id),
          text: String(r.text ?? ""),
          senderId: String(r.sender_id),
          senderName: String(r.sender_name ?? ""),
          createdAt: String(r.created_at),
          editedAt: r.edited_at ? String(r.edited_at) : null,
          deletedAt: r.deleted_at ? String(r.deleted_at) : null,
          fileName: r.file_name ? String(r.file_name) : null,
          filePath: r.file_path ? String(r.file_path) : null,
          fileType: r.file_type ? String(r.file_type) : null,
          fileSize:
            typeof r.file_size === "number"
              ? r.file_size
              : r.file_size
                ? Number(r.file_size)
                : null,
          fileUrl: r.file_url ? String(r.file_url) : null,
        }));

        if (!cancelled) {
          setInitialMessages(mapped);
        }
      } catch (error) {
        console.error("[chat-slideover] load failed", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => {
        setShown(true);
      });
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timeout = setTimeout(() => {
      setVisible(false);
    }, 220);

    return () => clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, isolation: "isolate" }}>
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.64)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 620,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 18,
          border: "1px solid rgba(216,193,160,0.16)",
          background:
            "linear-gradient(180deg, rgba(31,24,19,0.97) 0%, rgba(18,13,10,0.96) 100%)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.05)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 16px 14px",
            borderBottom: "1px solid rgba(216,193,160,0.12)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 145, flexShrink: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "rgba(246,240,232,0.96)",
                whiteSpace: "nowrap",
                lineHeight: 1.1,
              }}
            >
              Team Chat
            </div>
            <div style={{ marginTop: 10, display: "flex" }}>
              <span
                className={
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                  realtimeStatusChipClass(realtimeStatus)
                }
                title="Zeigt nur den Live-Verbindungsstatus des Chats an"
              >
                {getRealtimeStatusLabel(realtimeStatus)}
              </span>
            </div>
          </div>

          <div
            style={{
              minWidth: 0,
              flex: 1,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <div
              data-chat-team-avatar-wrap="true"
              style={{
                minWidth: 0,
                flex: "1 1 auto",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                overflow: "visible",
              }}
            >
              <ChatTeamAvatars />
            </div>

            <button
              type="button"
              onClick={close}
              className={closeIconButtonClass()}
              aria-label="Schließen"
              title="Schließen"
              style={{ flexShrink: 0 }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <style jsx global>{`
            [data-chat-team-avatar-wrap] > * {
              max-width: 100% !important;
              display: flex !important;
              flex-wrap: wrap !important;
              align-items: center !important;
              justify-content: flex-end !important;
              gap: 8px !important;
              overflow: visible !important;
            }
          `}</style>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: 14,
            background: "rgba(0,0,0,0.10)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Chat wird geladen...
            </div>
          ) : (
            <ChatClient
              tenantId={tenantId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              initialMessages={initialMessages}
              embedded
              onRealtimeStatusChange={setRealtimeStatus}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
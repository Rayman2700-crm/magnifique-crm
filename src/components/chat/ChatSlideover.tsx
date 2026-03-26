"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import ChatClient, { type ChatMessageDTO } from "@/app/dashboard/chat/ChatClient";
import PushSetupClient from "@/components/push/PushSetupClient";
import ChatTeamAvatars from "@/components/chat/ChatTeamAvatars";

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
          backgroundColor: "rgba(0,0,0,0.60)",
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
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(16,16,16,0.94) 0%, rgba(10,10,10,0.94) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
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
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>MAGNIFIQUE BEAUTY INSTITUT</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 18,
                fontWeight: 800,
                color: "rgba(255,255,255,0.95)",
                whiteSpace: "nowrap",
              }}
            >
              Team Chat
            </div>
          </div>

          <div
            style={{
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              overflow: "hidden",
            }}
          >
            <ChatTeamAvatars />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifySelf: "end",
              flexShrink: 0,
            }}
          >
            <PushSetupClient compact />
            <Button variant="secondary" onClick={close}>
              Schließen
            </Button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            padding: 16,
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
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
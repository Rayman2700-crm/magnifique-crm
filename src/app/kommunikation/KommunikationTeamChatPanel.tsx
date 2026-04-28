"use client";

import { useEffect, useState } from "react";
import ChatClient, { type ChatMessageDTO } from "@/app/dashboard/chat/ChatClient";

function mapChatMessage(row: any): ChatMessageDTO {
  return {
    id: String(row.id),
    text: String(row.text ?? ""),
    senderId: String(row.sender_id),
    senderName: String(row.sender_name ?? ""),
    createdAt: String(row.created_at),
    editedAt: row.edited_at ? String(row.edited_at) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    fileName: row.file_name ? String(row.file_name) : null,
    filePath: row.file_path ? String(row.file_path) : null,
    fileType: row.file_type ? String(row.file_type) : null,
    fileSize:
      typeof row.file_size === "number"
        ? row.file_size
        : row.file_size
          ? Number(row.file_size)
          : null,
    fileUrl: row.file_url ? String(row.file_url) : null,
  };
}

export default function KommunikationTeamChatPanel({
  tenantId,
  currentUserId,
  currentUserName,
  initialDraft = "",
}: {
  tenantId: string | null;
  currentUserId: string;
  currentUserName: string;
  initialDraft?: string;
}) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      setLoading(true);
      try {
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];
        const mapped = rows.map(mapChatMessage);

        if (!cancelled) setMessages(mapped);
      } catch (error) {
        console.error("[kommunikation-team-chat] load failed", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        Team Chat wird geladen...
      </div>
    );
  }

  return (
    <ChatClient
      tenantId={tenantId}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      initialMessages={messages}
      initialDraft={initialDraft}
      embedded
    />
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
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


type TeamUser = {
  userId: string;
  fullName: string;
  avatarRingColor: string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0]?.slice(0, 2).toUpperCase() || "?";
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ["#5B4A3D", "#6F4B4B", "#4E5D45", "#4A506B", "#6B584A", "#5F4B6F"];
  return colors[Math.abs(hash) % colors.length];
}

function TeamUserRail({
  users,
  currentUserId,
  onMention,
}: {
  users: TeamUser[];
  currentUserId: string;
  onMention: (user: TeamUser) => void;
}) {
  return (
    <aside className="hidden h-full w-[58px] shrink-0 flex-col items-center gap-2 border-r border-[#d8c1a0]/12 bg-black/[0.10] px-2 py-3 sm:flex">
      <div className="h-px w-8 bg-[#d8c1a0]/14" />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {users.map((user) => {
          const mine = user.userId === currentUserId;
          return (
            <button
              key={user.userId}
              type="button"
              onClick={() => onMention(user)}
              className={
                "group relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-[11px] font-bold text-white transition active:scale-[0.97] " +
                (mine
                  ? "bg-[#d8c1a0]/16 shadow-[0_0_0_2px_rgba(216,193,160,0.08)]"
                  : "bg-[#d8c1a0]/[0.055] hover:bg-[#d8c1a0]/[0.11]")
              }
              style={{
                borderColor: user.avatarRingColor || (mine ? "#d8c1a0" : "rgba(216,193,160,0.28)"),
                boxShadow: user.avatarRingColor
                  ? `0 0 0 2px ${user.avatarRingColor}24`
                  : undefined,
              }}
              title={`${mine ? "Du" : user.fullName} erwähnen`}
              aria-label={`${user.fullName} erwähnen`}
            >
              <span className="absolute inset-0 flex items-center justify-center rounded-full" style={{ backgroundColor: getAvatarColor(user.fullName) }}>
                {getInitials(user.fullName)}
              </span>
              <img
                src={`/users/${user.userId}.png`}
                alt={user.fullName}
                className="relative h-full w-full rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/50 bg-[#d8c1a0] text-[8px] text-black opacity-0 shadow-sm transition group-hover:opacity-100">
                @
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-px w-8 bg-[#d8c1a0]/14" />
    </aside>
  );
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
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      const userMap = new Map<string, TeamUser>();
      userMap.set(currentUserId, {
        userId: currentUserId,
        fullName: currentUserName || "Du",
        avatarRingColor: null,
      });

      try {
        let query = supabase
          .from("user_profiles")
          .select("user_id, full_name, tenant_id, avatar_ring_color")
          .not("user_id", "is", null);

        if (tenantId) query = query.eq("tenant_id", tenantId);

        const { data, error } = await query.order("full_name", { ascending: true });

        if (!error) {
          for (const row of data ?? []) {
            const userId = String(row.user_id || "").trim();
            const fullName = String(row.full_name || "").trim();
            if (!userId || !fullName) continue;
            userMap.set(userId, {
              userId,
              fullName,
              avatarRingColor: row.avatar_ring_color ? String(row.avatar_ring_color) : null,
            });
          }
        }
      } catch (error) {
        console.error("[kommunikation-team-chat] users failed", error);
      }

      if (!cancelled) {
        setTeamUsers(
          Array.from(userMap.values()).sort((a, b) => {
            if (a.userId === currentUserId) return -1;
            if (b.userId === currentUserId) return 1;
            return a.fullName.localeCompare(b.fullName, "de");
          }),
        );
      }
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentUserName, supabase, tenantId]);

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
    <div className="flex h-full min-h-0 overflow-hidden bg-black/[0.02]">
      <TeamUserRail
        users={teamUsers}
        currentUserId={currentUserId}
        onMention={(user) => {
          window.dispatchEvent(
            new CustomEvent("chat:mention-user", {
              detail: { userId: user.userId, fullName: user.fullName },
            }),
          );
        }}
      />
      <div className="min-w-0 flex-1">
        <ChatClient
          tenantId={tenantId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          initialMessages={messages}
          initialDraft={initialDraft}
          embedded
        />
      </div>
    </div>
  );
}

import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ChatClient from "./ChatClient";
import type { ChatMessageDTO } from "./ChatClient";
import PushSetupClient from "@/components/push/PushSetupClient";

const CHAT_STORAGE_BUCKET = "team-chat";

export default async function TeamChatPage() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tenant_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const tenantId = profile?.tenant_id ?? null;

  const { data: rows } = await supabase
    .from("team_messages")
    .select(
      "id, text, sender_id, sender_name, created_at, edited_at, deleted_at, file_name, file_path, file_type, file_size"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const initial: ChatMessageDTO[] = [...(rows ?? [])]
    .reverse()
    .map((r: any) => {
      let fileUrl: string | null = null;

      if (r.file_path) {
        const { data } = admin.storage
          .from(CHAT_STORAGE_BUCKET)
          .getPublicUrl(String(r.file_path));

        fileUrl = data?.publicUrl ?? null;
      }

      return {
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
        fileUrl,
      };
    });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-white">Team Chat</h1>
        <p className="text-sm text-white/60">Interner Chat für euer Team.</p>
      </div>

      <PushSetupClient />

      <ChatClient
        tenantId={tenantId}
        currentUserId={user.id}
        currentUserName={profile?.full_name ?? user.email ?? ""}
        initialMessages={initial}
      />
    </div>
  );
}
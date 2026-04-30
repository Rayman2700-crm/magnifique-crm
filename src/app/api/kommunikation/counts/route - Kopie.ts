import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

export const dynamic = "force-dynamic";

type CustomerConversationCountRow = {
  status: string | null;
  unread_count: number | null;
};

type TeamMessageCountRow = {
  id: string;
  sender_id: string | null;
  created_at: string | null;
};

function safeCount(value: unknown) {
  return Math.max(0, Math.trunc(Number(value ?? 0) || 0));
}

function countTeamUnread(messages: TeamMessageCountRow[], currentUserId: string, lastReadMessageId: string | null) {
  const readableMessages = messages.filter((message) => String(message.id || "").trim());
  const foreignMessages = (rows: TeamMessageCountRow[]) =>
    rows.filter((message) => String(message.sender_id ?? "") !== currentUserId).length;

  if (!lastReadMessageId) return foreignMessages(readableMessages);

  const lastReadIndex = readableMessages.findIndex((message) => message.id === lastReadMessageId);
  if (lastReadIndex < 0) return foreignMessages(readableMessages);

  return foreignMessages(readableMessages.slice(lastReadIndex + 1));
}

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json(
      {
        customerUnreadCount: 0,
        teamUnreadCount: 0,
        totalUnreadCount: 0,
        openConversationCount: 0,
        closedConversationCount: 0,
        allConversationCount: 0,
      },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String(profile?.role ?? "PRACTITIONER");
  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
  });

  let conversationQuery = supabase
    .from("customer_conversations")
    .select("status, unread_count");

  if (effectiveTenantId) {
    conversationQuery = conversationQuery.eq("tenant_id", effectiveTenantId);
  }

  const { data: conversationRowsRaw } = await conversationQuery;
  const conversationRows = (conversationRowsRaw ?? []) as CustomerConversationCountRow[];

  const customerUnreadCount = conversationRows.reduce(
    (sum, row) => sum + safeCount(row.unread_count),
    0,
  );
  const openConversationCount = conversationRows.filter(
    (row) => String(row.status ?? "OPEN").toUpperCase() === "OPEN",
  ).length;
  const closedConversationCount = conversationRows.filter(
    (row) => String(row.status ?? "").toUpperCase() === "CLOSED",
  ).length;

  const url = new URL(request.url);
  const lastReadMessageId = url.searchParams.get("teamLastReadMessageId");

  let teamRows: TeamMessageCountRow[] = [];
  let teamSource = "chat_messages";

  try {
    let teamQuery = supabase
      .from("chat_messages")
      .select("id, sender_id, created_at, tenant_id")
      .order("created_at", { ascending: true })
      .limit(1000);

    if (effectiveTenantId) teamQuery = teamQuery.eq("tenant_id", effectiveTenantId);

    const { data, error } = await teamQuery;
    if (error) throw error;
    teamRows = (data ?? []) as TeamMessageCountRow[];
  } catch {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, sender_id, created_at")
      .order("created_at", { ascending: true })
      .limit(1000);

    teamRows = (data ?? []) as TeamMessageCountRow[];
    teamSource = "chat_messages_without_tenant_filter";
  }

  const teamUnreadCount = countTeamUnread(teamRows, user.id, lastReadMessageId);
  const totalUnreadCount = customerUnreadCount + teamUnreadCount;

  return NextResponse.json({
    customerUnreadCount,
    teamUnreadCount,
    totalUnreadCount,
    openConversationCount,
    closedConversationCount,
    allConversationCount: conversationRows.length,
    meta: {
      role,
      effectiveTenantId,
      teamSource,
      teamLastReadMessageId: lastReadMessageId,
    },
  });
}

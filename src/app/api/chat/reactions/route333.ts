import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// ❗ Removed strict emoji whitelist to allow full UTF-8 emoji support

async function getProfile(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("tenant_id, full_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    tenantId: data?.tenant_id ?? null,
    fullName: data?.full_name ?? "",
  };
}

async function getMessageTenantId(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  messageId: string
) {
  const { data, error } = await supabase
    .from("team_messages")
    .select("id, tenant_id")
    .eq("id", messageId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.tenant_id ? String(data.tenant_id) : null;
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Safe JSON parsing (UTF-8 clean)
    const body = await req.json().catch(() => null);

    const messageId = body?.messageId ? String(body.messageId) : "";
    const emoji = body?.emoji ? String(body.emoji) : "";

    if (!messageId || !emoji) {
      return NextResponse.json(
        { error: "Missing messageId or emoji" },
        { status: 400 }
      );
    }

    // ❗ IMPORTANT: no emoji filtering → allows all emojis correctly
    // (Prevents broken encoding or missing emoji issues)

    const { tenantId: profileTenantId, fullName } = await getProfile(supabase, user.id);
    const messageTenantId = await getMessageTenantId(supabase, messageId);
    const effectiveTenantId = messageTenantId || profileTenantId;

    if (!effectiveTenantId) {
      return NextResponse.json(
        { error: "No tenant found for message" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("team_message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    // Toggle behavior (add/remove reaction)
    if (existing?.id) {
      const { error: deleteError } = await supabase
        .from("team_message_reactions")
        .delete()
        .eq("id", existing.id);

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, action: "removed" });
    }

    const { error: insertError } = await supabase
      .from("team_message_reactions")
      .insert({
        tenant_id: effectiveTenantId,
        message_id: messageId,
        user_id: user.id,
        user_name: fullName || "Team",
        emoji, // ✅ stored as UTF-8 (no transformation)
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, action: "added" });
  } catch (error: any) {
    console.error("[api/chat/reactions] error:", error?.message ?? error);

    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

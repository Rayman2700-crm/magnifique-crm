import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮"];

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

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const messageId = body?.messageId ? String(body.messageId) : "";
    const emoji = body?.emoji ? String(body.emoji) : "";

    if (!messageId || !emoji) {
      return NextResponse.json(
        { error: "Missing messageId or emoji" },
        { status: 400 }
      );
    }

    if (!ALLOWED_EMOJIS.includes(emoji)) {
      return NextResponse.json(
        { error: "Emoji not allowed" },
        { status: 400 }
      );
    }

    const { tenantId, fullName } = await getProfile(supabase, user.id);

    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant found" },
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
        tenant_id: tenantId,
        message_id: messageId,
        user_id: user.id,
        user_name: fullName || "Team",
        emoji,
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
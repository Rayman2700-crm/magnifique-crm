import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

async function getProfile(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    tenantId: data?.tenant_id ?? null,
  };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const text = body?.text ? String(body.text).trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    if (text.length > 2000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const { tenantId } = await getProfile(supabase, user.id);

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("team_messages")
      .select("id, sender_id, tenant_id, deleted_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (existing.sender_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.deleted_at) {
      return NextResponse.json({ error: "Message already deleted" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("team_messages")
      .update({
        text,
        edited_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[chat/messages/:id PATCH] error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { tenantId } = await getProfile(supabase, user.id);

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("team_messages")
      .select("id, sender_id, tenant_id, deleted_at")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (existing.sender_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.deleted_at) {
      return NextResponse.json({ ok: true });
    }

    const { error: deleteError } = await supabase
      .from("team_messages")
      .update({
        text: "",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[chat/messages/:id DELETE] error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
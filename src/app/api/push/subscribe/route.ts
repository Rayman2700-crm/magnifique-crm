import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await req.json().catch(() => null);

    const endpoint = subscription?.endpoint ? String(subscription.endpoint) : "";
    const p256dh = subscription?.keys?.p256dh ? String(subscription.keys.p256dh) : "";
    const auth = subscription?.keys?.auth ? String(subscription.keys.auth) : "";

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const tenantId = profile?.tenant_id ?? null;

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found for user" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Wichtig:
    // Mit dem gleichen Browser kann derselbe Endpoint später einem anderen User gehören.
    // Deshalb hier bewusst mit Service Role speichern.
    const { error: upsertError } = await admin.from("push_subscriptions").upsert(
      {
        tenant_id: tenantId,
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Optional: alte falsche Subscriptions dieses Users bereinigen
    const { error: cleanupError } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .neq("endpoint", endpoint);

    if (cleanupError) {
      console.error("Push subscription cleanup failed:", cleanupError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Push subscribe fatal error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
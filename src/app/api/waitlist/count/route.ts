import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const effectiveTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    let query = admin
      .from("appointment_waitlist")
      .select("id, status");

    if (effectiveTenantId) {
      query = query.eq("tenant_id", effectiveTenantId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = ((data ?? []) as Array<{ id: string; status: string | null }>).filter(
      (row) => String(row.status ?? "active").toLowerCase() === "active"
    ).length;

    return NextResponse.json({ count });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

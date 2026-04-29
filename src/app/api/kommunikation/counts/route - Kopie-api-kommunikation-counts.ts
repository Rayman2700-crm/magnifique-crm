import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

export const dynamic = "force-dynamic";

type CountRow = {
  status: string | null;
  unread_count: number | null;
};

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json(
        { customerUnreadCount: 0, openCount: 0, closedCount: 0, allCount: 0 },
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

    let query = supabase
      .from("customer_conversations")
      .select("status, unread_count");

    if (role !== "ADMIN" && effectiveTenantId) {
      query = query.eq("tenant_id", effectiveTenantId);
    } else if (role === "ADMIN" && effectiveTenantId) {
      query = query.eq("tenant_id", effectiveTenantId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { customerUnreadCount: 0, openCount: 0, closedCount: 0, allCount: 0, message: error.message },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as CountRow[];
    const openCount = rows.filter(
      (row) => String(row.status ?? "OPEN").toUpperCase() === "OPEN",
    ).length;
    const closedCount = rows.filter(
      (row) => String(row.status ?? "").toUpperCase() === "CLOSED",
    ).length;
    const allCount = rows.length;
    const customerUnreadCount = rows.reduce(
      (sum, row) => sum + Math.max(0, Math.trunc(Number(row.unread_count ?? 0))),
      0,
    );

    return NextResponse.json({ customerUnreadCount, openCount, closedCount, allCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { customerUnreadCount: 0, openCount: 0, closedCount: 0, allCount: 0, message },
      { status: 500 },
    );
  }
}

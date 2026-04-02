import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const tenantIds = String(req.nextUrl.searchParams.get("tenantIds") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const personIds = String(req.nextUrl.searchParams.get("personIds") ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (tenantIds.length === 0 || personIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const { data: rows, error } = await admin
      .from("customer_profiles")
      .select("id, tenant_id, person_id")
      .in("tenant_id", tenantIds)
      .in("person_id", personIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unbekannter Fehler." }, { status: 500 });
  }
}

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

    const start = String(req.nextUrl.searchParams.get("start") ?? "").trim();
    const end = String(req.nextUrl.searchParams.get("end") ?? "").trim();
    const tenant = String(req.nextUrl.searchParams.get("tenant") ?? "").trim();

    if (!start || !end) {
      return NextResponse.json({ error: "start und end sind erforderlich." }, { status: 400 });
    }

    let query = admin
      .from("appointments")
      .select(`
        id,
        start_at,
        end_at,
        notes_internal,
        reminder_sent_at,
        tenant_id,
        person_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name, phone, email )
      `)
      .gte("start_at", start)
      .lt("start_at", end)
      .order("start_at", { ascending: true });

    if (tenant) {
      query = query.eq("tenant_id", tenant);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []).map((row: any) => {
      const tenantJoin = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
      const personJoin = Array.isArray(row.person) ? row.person[0] : row.person;
      return {
        id: String(row.id),
        start_at: row.start_at,
        end_at: row.end_at,
        notes_internal: row.notes_internal ?? null,
        reminder_sent_at: row.reminder_sent_at ?? null,
        tenant_id: String(row.tenant_id),
        person_id: row.person_id ? String(row.person_id) : null,
        tenant_name: tenantJoin?.display_name ?? null,
        customer_name: personJoin?.full_name ?? null,
        customer_phone: personJoin?.phone ?? null,
        customer_email: personJoin?.email ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unbekannter Fehler." }, { status: 500 });
  }
}

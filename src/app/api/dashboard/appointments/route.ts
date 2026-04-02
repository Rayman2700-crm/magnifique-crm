import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = String(url.searchParams.get("start") ?? "").trim();
  const end = String(url.searchParams.get("end") ?? "").trim();
  const tenantId = String(url.searchParams.get("tenantId") ?? "").trim();

  if (!start || !end) {
    return NextResponse.json({ error: "start und end sind erforderlich." }, { status: 400 });
  }

  let query = admin
    .from("appointments")
    .select(
      `
        id,
        start_at,
        end_at,
        notes_internal,
        reminder_sent_at,
        tenant_id,
        person_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name, phone, email )
      `
    )
    .gte("start_at", start)
    .lt("start_at", end)
    .order("start_at", { ascending: true });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((row: any) => {
    const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
    const person = Array.isArray(row.person) ? row.person[0] : row.person;

    return {
      id: String(row.id),
      start_at: String(row.start_at),
      end_at: String(row.end_at),
      notes_internal: row.notes_internal ?? null,
      reminder_sent_at: row.reminder_sent_at ?? null,
      tenant_id: String(row.tenant_id),
      person_id: String(row.person_id),
      tenantName: tenant?.display_name ?? null,
      customerName: person?.full_name ?? null,
      customerPhone: person?.phone ?? null,
      customerEmail: person?.email ?? null,
    };
  });

  return NextResponse.json({ items });
}

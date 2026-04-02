import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  notes_internal: string | null;
  reminder_sent_at: string | null;
  tenant_id: string;
  person_id: string | null;
};

type CustomerProfileRow = {
  id: string;
  tenant_id: string;
  person_id: string;
};

function parseNotes(notes: string | null) {
  if (!notes) {
    return {
      title: "Termin",
      note: "",
      status: null as "scheduled" | "completed" | "cancelled" | "no_show" | null,
    };
  }

  const lines = String(notes)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines.find((l) => l.toLowerCase().startsWith("titel:"));
  const noteLine = lines.find((l) => l.toLowerCase().startsWith("notiz:"));
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));

  const title = titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() : "Termin";
  const note = noteLine ? noteLine.replace(/^notiz:\s*/i, "").trim() : "";
  const rawStatus = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "";

  let status: "scheduled" | "completed" | "cancelled" | "no_show" | null = null;
  if (rawStatus === "completed") status = "completed";
  else if (rawStatus === "cancelled") status = "cancelled";
  else if (rawStatus === "no_show") status = "no_show";
  else if (rawStatus === "scheduled") status = "scheduled";

  return { title: title || "Termin", note, status };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const url = new URL(req.url);
  const startISO = String(url.searchParams.get("start") ?? "").trim();
  const endISO = String(url.searchParams.get("end") ?? "").trim();
  const selectedTenantId = String(url.searchParams.get("tenantId") ?? "").trim();
  const creatorTenantId = String(url.searchParams.get("creatorTenantId") ?? "").trim();
  const isAdmin = String(url.searchParams.get("isAdmin") ?? "false").trim() === "true";

  if (!startISO || !endISO) {
    return NextResponse.json({ error: "start und end fehlen." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  let query = admin
    .from("appointments")
    .select("id,start_at,end_at,notes_internal,reminder_sent_at,tenant_id,person_id")
    .gte("start_at", startISO)
    .lt("start_at", endISO)
    .order("start_at", { ascending: true });

  if (selectedTenantId) {
    query = query.eq("tenant_id", selectedTenantId);
  }

  const { data: apptData, error: apptError } = await query;

  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 });
  }

  const appts = (apptData ?? []) as ApptRow[];

  const tenantIds = Array.from(new Set(appts.map((a) => String(a.tenant_id ?? "").trim()).filter(Boolean)));
  const personIds = Array.from(new Set(appts.map((a) => String(a.person_id ?? "").trim()).filter(Boolean)));

  const [{ data: tenantsRaw }, { data: personsRaw }, { data: cpsRaw }] = await Promise.all([
    tenantIds.length
      ? admin.from("tenants").select("id, display_name").in("id", tenantIds)
      : Promise.resolve({ data: [] as any[] }),
    personIds.length
      ? admin.from("persons").select("id, full_name, phone, email").in("id", personIds)
      : Promise.resolve({ data: [] as any[] }),
    tenantIds.length && personIds.length
      ? admin.from("customer_profiles").select("id, tenant_id, person_id").in("tenant_id", tenantIds).in("person_id", personIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const tenantNameById = new Map<string, string>();
  for (const t of (tenantsRaw ?? []) as { id: string; display_name: string | null }[]) {
    tenantNameById.set(String(t.id), String(t.display_name ?? "Behandler") || "Behandler");
  }

  const personById = new Map<string, { full_name: string | null; phone: string | null; email: string | null }>();
  for (const p of (personsRaw ?? []) as { id: string; full_name: string | null; phone: string | null; email: string | null }[]) {
    personById.set(String(p.id), {
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      email: p.email ?? null,
    });
  }

  const cpByTenantAndPerson = new Map<string, string>();
  for (const cp of (cpsRaw ?? []) as CustomerProfileRow[]) {
    cpByTenantAndPerson.set(`${cp.tenant_id}:${cp.person_id}`, cp.id);
  }

  const items = appts.map((a) => {
    const parsed = parseNotes(a.notes_internal);
    const person = a.person_id ? personById.get(String(a.person_id)) : undefined;
    const customerProfileId = a.person_id ? cpByTenantAndPerson.get(`${a.tenant_id}:${a.person_id}`) ?? null : null;
    const canManageCustomerActions = isAdmin || (!!creatorTenantId && String(a.tenant_id) === creatorTenantId);

    return {
      id: a.id,
      start_at: a.start_at,
      end_at: a.end_at,
      title: parsed.title,
      note: parsed.note,
      status: parsed.status,
      tenantId: a.tenant_id,
      tenantName: tenantNameById.get(String(a.tenant_id)) ?? "Behandler",
      customerProfileId,
      customerName: person?.full_name ?? null,
      customerPhone: person?.phone ?? null,
      customerEmail: person?.email ?? null,
      reminderSentAt: a.reminder_sent_at ?? null,
      canOpenCustomerProfile: canManageCustomerActions,
      canCreateFollowUp: canManageCustomerActions,
      canDeleteAppointment: canManageCustomerActions,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

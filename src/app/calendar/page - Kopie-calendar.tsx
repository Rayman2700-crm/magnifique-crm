import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CalendarWeekClient from "@/components/calendar/CalendarWeekClient";
import type { AppointmentStatus } from "@/components/calendar/types";

type TenantJoin = { display_name: string | null };
type PersonJoin = { full_name: string | null; phone: string | null; email: string | null };

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  notes_internal: string | null;
  tenant_id: string;
  person_id: string;
  service_id: string | null;
  service_name_snapshot: string | null;
  service_price_cents_snapshot: number | null;
  service_duration_minutes_snapshot: number | null;
  service_buffer_minutes_snapshot: number | null;

  tenant?: TenantJoin | TenantJoin[] | null;
  person?: PersonJoin | PersonJoin[] | null;
};

type CustomerProfileRow = {
  id: string;
  tenant_id: string;
  person_id: string;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseNotes(notes: string | null) {
  if (!notes) return { title: "", note: "", status: null as AppointmentStatus | null };

  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines.find((l) => l.toLowerCase().startsWith("titel:"));
  const noteLine = lines.find((l) => l.toLowerCase().startsWith("notiz:"));
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));

  const title = titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() : "";
  const note = noteLine ? noteLine.replace(/^notiz:\s*/i, "").trim() : "";
  const rawStatus = statusLine ? statusLine.replace(/^status:\s*/i, "").trim() : "";

  const status: AppointmentStatus | null =
    rawStatus === "scheduled" ||
    rawStatus === "completed" ||
    rawStatus === "cancelled" ||
    rawStatus === "no_show"
      ? rawStatus
      : null;

  return { title, note, status };
}

function firstJoin<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function CalendarPage() {
  const supabase = await supabaseServer();

  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      start_at,
      end_at,
      notes_internal,
      tenant_id,
      person_id,
      service_id,
      service_name_snapshot,
      service_price_cents_snapshot,
      service_duration_minutes_snapshot,
      service_buffer_minutes_snapshot,
      tenant:tenants ( display_name ),
      person:persons ( full_name, phone, email )
    `
    )
    .gte("start_at", from.toISOString())
    .lt("start_at", to.toISOString())
    .order("start_at", { ascending: true });

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Kalender"
          description="Team-Übersicht der nächsten 7 Tage."
          actions={
            <div className="flex gap-2">
              <Link href="/calendar/google">
                <Button variant="secondary">Google Setup</Button>
              </Link>
              <Link href="/customers">
                <Button>Neuer Termin</Button>
              </Link>
            </div>
          }
        />

        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent>
            <div className="font-semibold text-white">Fehler</div>
            <div className="mt-2 break-words text-sm text-red-200">{error.message}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const appts = (data ?? []) as ApptRow[];

  const uniquePairs = new Map<string, { tenant_id: string; person_id: string }>();
  for (const a of appts) {
    if (!a.tenant_id || !a.person_id) continue;
    uniquePairs.set(`${a.tenant_id}:${a.person_id}`, {
      tenant_id: a.tenant_id,
      person_id: a.person_id,
    });
  }

  let cpMap = new Map<string, string>();

  if (uniquePairs.size > 0) {
    const tenantIds = Array.from(new Set(Array.from(uniquePairs.values()).map((p) => p.tenant_id)));
    const personIds = Array.from(new Set(Array.from(uniquePairs.values()).map((p) => p.person_id)));

    const { data: cpsInitial } = await supabase
      .from("customer_profiles")
      .select("id,tenant_id,person_id")
      .in("tenant_id", tenantIds)
      .in("person_id", personIds);

    for (const cp of (cpsInitial ?? []) as CustomerProfileRow[]) {
      cpMap.set(`${cp.tenant_id}:${cp.person_id}`, cp.id);
    }

    const missingPairs = Array.from(uniquePairs.values()).filter(
      (pair) => !cpMap.has(`${pair.tenant_id}:${pair.person_id}`)
    );

    if (missingPairs.length > 0) {
      for (const pair of missingPairs) {
        await supabase.from("customer_profiles").insert({
          tenant_id: pair.tenant_id,
          person_id: pair.person_id,
        });
      }

      const { data: cpsAfterInsert } = await supabase
        .from("customer_profiles")
        .select("id,tenant_id,person_id")
        .in("tenant_id", tenantIds)
        .in("person_id", personIds);

      cpMap = new Map<string, string>();
      for (const cp of (cpsAfterInsert ?? []) as CustomerProfileRow[]) {
        cpMap.set(`${cp.tenant_id}:${cp.person_id}`, cp.id);
      }
    }
  }

  const weekStartISO = dayKey(from);

  const items = appts.map((a) => {
    const parsed = parseNotes(a.notes_internal);
    const key = `${a.tenant_id}:${a.person_id}`;
    const customerProfileId = cpMap.get(key) ?? null;

    const tenant = firstJoin(a.tenant);
    const person = firstJoin(a.person);
    const displayTitle = a.service_name_snapshot?.trim() || parsed.title || "Termin";

    return {
      id: a.id,
      start_at: a.start_at,
      end_at: a.end_at,
      title: displayTitle,
      note: parsed.note ?? "",
      status: parsed.status,
      tenantId: a.tenant_id,
      tenantName: tenant?.display_name ?? "Behandler",
      customerProfileId,
      customerName: person?.full_name ?? null,
      customerPhone: person?.phone ?? null,
      customerEmail: person?.email ?? null,
      serviceId: a.service_id ?? null,
      serviceName: a.service_name_snapshot ?? null,
      servicePriceCentsSnapshot: a.service_price_cents_snapshot ?? null,
      serviceDurationMinutesSnapshot: a.service_duration_minutes_snapshot ?? null,
      serviceBufferMinutesSnapshot: a.service_buffer_minutes_snapshot ?? null,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kalender"
        description="Team-Übersicht der nächsten 7 Tage."
        actions={
          <div className="flex gap-2">
            <Link href="/calendar/google">
              <Button variant="secondary">Google Setup</Button>
            </Link>
            <Link href="/customers">
              <Button>Neuer Termin</Button>
            </Link>
          </div>
        }
      />

      {items.length === 0 ? (
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent>
            <div className="text-white/70">Keine Termine in den nächsten 7 Tagen.</div>
          </CardContent>
        </Card>
      ) : null}

      <CalendarWeekClient weekStartISO={weekStartISO} items={items} />
    </div>
  );
}

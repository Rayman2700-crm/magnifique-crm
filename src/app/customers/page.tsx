import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setAdminTenant } from "@/app/admin/actions";
import { getAdminTenantCookie, getEffectiveTenantId } from "@/lib/effectiveTenant";
import DeleteCustomerButton from "./DeleteCustomerButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CustomerRow = {
  id: string;
  created_at: string | null;
  tenant_id: string | null;
  person_id: string | null;
  person:
    | {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        birthday: string | null;
      }[]
    | null;
  tenant:
    | {
        id: string;
        display_name: string | null;
      }
    | {
        id: string;
        display_name: string | null;
      }[]
    | null;
};

type AppointmentRow = {
  id: string;
  person_id: string | null;
  start_at: string | null;
  end_at: string | null;
  notes_internal: string | null;
  tenant_id?: string | null;
};

type CustomerAnalytics = {
  visitCount: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
  noShowCount: number;
  isWithoutFollowUp: boolean;
};

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function tenantThemeByName(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("radu")) return { pillBg: "rgba(59,130,246,0.16)", border: "rgba(59,130,246,0.26)", pillText: "#bfdbfe" };
  if (n.includes("raluca")) return { pillBg: "rgba(168,85,247,0.16)", border: "rgba(168,85,247,0.26)", pillText: "#e9d5ff" };
  if (n.includes("alexandra")) return { pillBg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.26)", pillText: "#bbf7d0" };
  if (n.includes("barbara")) return { pillBg: "rgba(249,115,22,0.16)", border: "rgba(249,115,22,0.26)", pillText: "#fed7aa" };
  return { pillBg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.10)", pillText: "rgba(255,255,255,0.88)" };
}

function formatShortDate(dateString: string | null | undefined) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function getUserShortCode(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("alexandra")) return "AS";
  if (label.includes("barbara")) return "BE";
  if (label.includes("radu")) return "RC";
  if (label.includes("raluca")) return "RC";
  return "—";
}

function getTenantDisplayLabel(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "Radu";
  if (label.includes("raluca")) return "Raluca";
  if (label.includes("alexandra")) return "Alexandra";
  if (label.includes("barbara")) return "Barbara";
  return (tenantLabel || "—").trim().split(/\s+/)[0] || "—";
}

function getTenantAvatarRing(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "#3b82f6";
  if (label.includes("raluca")) return "#a855f7";
  if (label.includes("alexandra")) return "#22c55e";
  if (label.includes("barbara")) return "#f97316";
  return "rgba(255,255,255,0.30)";
}

function normalizeTenantSortKey(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();
  if (label.includes("radu")) return "1-radu";
  if (label.includes("raluca")) return "2-raluca";
  if (label.includes("alexandra")) return "3-alexandra";
  if (label.includes("barbara")) return "4-barbara";
  return `9-${label}`;
}

function AdminTenantAvatarPicker({
  current,
  options,
  action,
}: {
  current: string;
  options: { tenant_id: string; label: string; user_id: string | null }[];
  action: (formData: FormData) => Promise<void>;
}) {
  const orderedOptions = [...options]
    .map((option) => ({
      ...option,
      displayLabel: getTenantDisplayLabel(option.label),
      shortCode: getUserShortCode(option.label),
      ringColor: getTenantAvatarRing(option.label),
      sortKey: normalizeTenantSortKey(option.label),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <div className="pb-1">
      <div className="flex items-start gap-4 flex-nowrap">
        <form action={action} className="shrink-0">
          <input type="hidden" name="tenant" value="all" />
          <button type="submit" className="flex flex-col items-center gap-2" title="Alle Kunden anzeigen">
            <div className="relative overflow-hidden rounded-full flex items-center justify-center text-sm font-extrabold" style={{ width: 56, height: 56, border: "4px solid rgba(255,255,255,0.55)", boxShadow: "0 12px 26px rgba(0,0,0,0.32)", background: "rgba(255,255,255,0.96)", color: "#000" }}>Alle</div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${current === "all" ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"}`}>Alle</div>
          </button>
        </form>

        {orderedOptions.map((entry) => {
          const active = current === entry.tenant_id;
          return (
            <form key={entry.tenant_id} action={action} className="shrink-0">
              <input type="hidden" name="tenant" value={entry.tenant_id} />
              <button type="submit" className="flex flex-col items-center gap-2" title={`${entry.displayLabel} anzeigen`}>
                <div className="relative overflow-hidden rounded-full" style={{ width: 56, height: 56, border: `4px solid ${entry.ringColor}`, boxShadow: "0 12px 26px rgba(0,0,0,0.32)", background: "rgba(255,255,255,0.04)" }}>
                  {entry.user_id ? (
                    <img src={`/users/${entry.user_id}.png`} alt={entry.displayLabel} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[13px] font-extrabold text-white/90">{entry.shortCode}</div>
                  )}
                  <div style={{ position: "absolute", right: 3, bottom: 3, width: 10, height: 10, borderRadius: 999, backgroundColor: entry.ringColor, boxShadow: "0 0 0 2px rgba(0,0,0,0.65)" }} />
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${active ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"}`}>{entry.displayLabel}</div>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, subtext }: { label: string; value: number; subtext: string }) {
  return (
    <Card className="border-[var(--border)] bg-[var(--surface)] transition hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="min-h-[132px] p-5">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <div className="mt-4 text-[32px] font-semibold leading-none tracking-tight text-[var(--text)]">{value}</div>
        <div className="mt-3 text-sm text-white/50">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function readLineValue(notesInternal: string | null, prefix: string) {
  const lines = (notesInternal ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const line = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function parseStatus(notesInternal: string | null): AppointmentStatus | null {
  const raw = readLineValue(notesInternal, "Status:").toLowerCase();
  if (!raw) return null;
  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  if (raw === "no_show") return "no_show";
  return "scheduled";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?:
    | { q?: string; success?: string; error?: string; only?: string }
    | Promise<{ q?: string; success?: string; error?: string; only?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const qRaw = (sp?.q ?? "").toString();
  const q = qRaw.trim().toLowerCase();
  const errorMsg = (sp?.error ?? "").toString();
  const only = (sp?.only ?? "").toString();
  const onlyNoFollowUp = only === "no-followup";

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return <main className="mx-auto max-w-6xl p-6"><Link href="/login" className="underline">Bitte einloggen</Link></main>;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id, full_name")
    .eq("user_id", user.id)
    .single();

  const role = (profile?.role ?? "PRACTITIONER") as string;
  let tenantOptions: { tenant_id: string; label: string; user_id: string | null }[] = [];
  let currentAdminTenant = "all";

  if (role === "ADMIN") {
    currentAdminTenant = await getAdminTenantCookie();
    const { data: tenantProfiles } = await admin
      .from("user_profiles")
      .select("user_id, role, tenant_id, calendar_tenant_id, full_name")
      .in("role", ["PRACTITIONER", "ADMIN"]);

    const seen = new Set<string>();
    tenantOptions = (tenantProfiles ?? [])
      .map((p: any) => {
        const tenantId = (p?.tenant_id ?? p?.calendar_tenant_id ?? null) as string | null;
        if (!tenantId) return null;
        return { tenant_id: tenantId, label: (p?.full_name as string) || tenantId, user_id: (p?.user_id as string | null) ?? null };
      })
      .filter((x): x is { tenant_id: string; label: string; user_id: string | null } => x !== null)
      .filter((x) => {
        if (seen.has(x.tenant_id)) return false;
        seen.add(x.tenant_id);
        return true;
      });
  }

  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
    calendar_tenant_id: null,
  });

  let customerQuery = admin
    .from("customer_profiles")
    .select(`
      id,
      created_at,
      tenant_id,
      person_id,
      person:persons (
        id,
        full_name,
        phone,
        email,
        birthday
      ),
      tenant:tenants (
        id,
        display_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (effectiveTenantId) customerQuery = customerQuery.eq("tenant_id", effectiveTenantId);

  let appointmentQuery = admin.from("appointments").select("id, person_id, start_at, end_at, notes_internal, tenant_id").limit(5000);
  if (effectiveTenantId) appointmentQuery = appointmentQuery.eq("tenant_id", effectiveTenantId);

  const [{ data: rowsRaw, error }, { data: appointmentsRaw, error: appointmentsError }] = await Promise.all([customerQuery, appointmentQuery]);
  const rows = (rowsRaw ?? []) as CustomerRow[];
  const appointments = (appointmentsRaw ?? []) as AppointmentRow[];

  const customerPersonIds = new Set(rows.map((row) => row.person_id).filter((value): value is string => Boolean(value)));
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const visitsByPersonId = new Map<string, number>();
  const lastVisitByPersonId = new Map<string, string>();
  const nextAppointmentByPersonId = new Map<string, string>();
  const noShowsByPersonId = new Map<string, number>();

  for (const appointment of appointments) {
    const personId = appointment.person_id ?? null;
    const startAt = appointment.start_at ?? null;
    if (!personId || !customerPersonIds.has(personId) || !startAt) continue;
    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) continue;
    const explicitStatus = parseStatus(appointment.notes_internal);
    const isPast = startDate < now;

    if (isPast) {
      const isCompleted = explicitStatus === "completed" || explicitStatus === null;
      const isNoShow = explicitStatus === "no_show";
      if (isCompleted) {
        visitsByPersonId.set(personId, (visitsByPersonId.get(personId) ?? 0) + 1);
        const currentLastVisit = lastVisitByPersonId.get(personId);
        if (!currentLastVisit || new Date(currentLastVisit) < startDate) lastVisitByPersonId.set(personId, startAt);
      }
      if (isNoShow) noShowsByPersonId.set(personId, (noShowsByPersonId.get(personId) ?? 0) + 1);
    } else {
      const isCancelled = explicitStatus === "cancelled";
      if (!isCancelled) {
        const currentNextAppointment = nextAppointmentByPersonId.get(personId);
        if (!currentNextAppointment || new Date(currentNextAppointment) > startDate) nextAppointmentByPersonId.set(personId, startAt);
      }
    }
  }

  const analyticsByCustomerId = new Map<string, CustomerAnalytics>();
  let totalCustomers = 0;
  let activeCustomers30Days = 0;
  let inactiveCustomers60Days = 0;
  let withoutFollowUp = 0;

  for (const row of rows) {
    totalCustomers += 1;
    const personId = row.person_id ?? "";
    const visitCount = visitsByPersonId.get(personId) ?? 0;
    const lastVisitAt = lastVisitByPersonId.get(personId) ?? null;
    const nextAppointmentAt = nextAppointmentByPersonId.get(personId) ?? null;
    const noShowCount = noShowsByPersonId.get(personId) ?? 0;
    const isWithoutFollowUp = visitCount > 0 && !!lastVisitAt && !nextAppointmentAt;

    if (visitCount > 0 && lastVisitAt) {
      const lastVisitDate = new Date(lastVisitAt);
      if (!Number.isNaN(lastVisitDate.getTime()) && lastVisitDate >= thirtyDaysAgo) activeCustomers30Days += 1;
      if (!Number.isNaN(lastVisitDate.getTime()) && !nextAppointmentAt && lastVisitDate < sixtyDaysAgo) inactiveCustomers60Days += 1;
      if (!nextAppointmentAt) withoutFollowUp += 1;
    }

    analyticsByCustomerId.set(row.id, { visitCount, lastVisitAt, nextAppointmentAt, noShowCount, isWithoutFollowUp });
  }

  const filteredRows = rows.filter((row) => {
    const analytics = analyticsByCustomerId.get(row.id);
    if (onlyNoFollowUp && !analytics?.isWithoutFollowUp) return false;
    if (!q) return true;
    const person = firstJoin(row.person);
    const tenant = firstJoin(row.tenant);
    const name = (person?.full_name ?? "").toLowerCase();
    const phone = (person?.phone ?? "").toLowerCase();
    const email = (person?.email ?? "").toLowerCase();
    const tenantLabel = (tenant?.display_name ?? "").toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q) || tenantLabel.includes(q);
  });

  const adminMissingOwnTenant = role === "ADMIN" && currentAdminTenant === "all" && !profile?.tenant_id;
  const resetHref = "/customers";

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-5 md:p-6 xl:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">Clientique Kundenbereich</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Kunden</h1>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Eingeloggt als {profile?.full_name ?? user.email} ({profile?.role ?? "—"})</p>
                {role === "ADMIN" ? (
                  <div className="mt-5 space-y-3">
                    <AdminTenantAvatarPicker current={currentAdminTenant} options={tenantOptions} action={setAdminTenant} />
                    {adminMissingOwnTenant && <div className="text-xs text-red-300">Dein ADMIN-Profil hat aktuell kein tenant_id.</div>}
                  </div>
                ) : null}
              </div>

              <div className="flex w-full max-w-[640px] flex-col gap-3 sm:flex-row">
                <form action="/customers" method="get" className="flex-1">
                  {onlyNoFollowUp ? <input type="hidden" name="only" value="no-followup" /> : null}
                  <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                    <input type="text" name="q" defaultValue={qRaw} placeholder="Name, Telefon, E-Mail oder Behandler suchen" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
                  </div>
                </form>
                <Link href="/customers/new" className="sm:shrink-0"><Button className="h-11 w-full sm:w-auto">+ Neuer Kunde</Button></Link>
              </div>
            </div>

            {(error || appointmentsError || errorMsg) && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error?.message || appointmentsError?.message || errorMsg}</div>}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Kunden gesamt" value={totalCustomers} subtext="Alle sichtbaren Kundenprofile" />
              <SummaryCard label="Aktiv 30 Tage" value={activeCustomers30Days} subtext="Mit gekommenem Besuch in den letzten 30 Tagen" />
              <SummaryCard label="Inaktiv 60 Tage" value={inactiveCustomers60Days} subtext="Länger ohne gekommenen Besuch und ohne Folgetermin" />
              <SummaryCard label="Ohne Folgetermin" value={withoutFollowUp} subtext="Bereits gekommen, aber aktuell nichts geplant" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-0">
            <div className="border-b border-white/8 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-[var(--text)]">{onlyNoFollowUp ? "Kunden ohne Folgetermin" : "Kundenliste"}</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">{filteredRows.length} Ergebnis(se)</div>
                </div>
                <div className="flex items-center gap-2">
                  {onlyNoFollowUp ? <span className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">Filter aktiv</span> : null}
                  {(qRaw || onlyNoFollowUp) ? <Link href={resetHref}><Button variant="secondary" size="sm">Reset</Button></Link> : null}
                </div>
              </div>
            </div>

            <div className="lg:hidden px-4 py-4">
              {filteredRows.length === 0 ? (
                <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-6 text-sm text-white/55">Keine Kunden gefunden.</div>
              ) : (
                <div className="space-y-3">
                  {filteredRows.map((row) => {
                    const person = firstJoin(row.person);
                    const tenant = firstJoin(row.tenant);
                    const tenantLabel = tenant?.display_name || row?.tenant_id || "";
                    const theme = tenantThemeByName(tenantLabel);
                    const analytics = analyticsByCustomerId.get(row.id);
                    const shortCode = getUserShortCode(tenantLabel);
                    return (
                      <div key={row.id} className="rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-4 transition hover:bg-white/[0.035]">
                        <Link href={`/customers/${row.id}`} className="block">
                          <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold" style={{ backgroundColor: theme.pillBg, borderColor: theme.border, color: theme.pillText }}>{shortCode}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-semibold text-white">{person?.full_name ?? "—"}</div>
                              <div className="mt-1 whitespace-nowrap text-sm text-white/75">{person?.phone ?? "—"}</div>
                              <div className="mt-1 truncate text-xs text-white/45">{person?.email ?? "—"}</div>
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Besuche</div><div className="mt-1 text-sm font-semibold text-white">{analytics?.visitCount ?? 0}</div>{(analytics?.noShowCount ?? 0) > 0 ? <div className="mt-1 text-[11px] text-orange-300">{analytics?.noShowCount} No-Show</div> : null}</div>
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Letzter</div><div className="mt-1 text-sm font-medium text-white/75">{formatShortDate(analytics?.lastVisitAt)}</div></div>
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2"><div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Nächster</div><div className="mt-1 text-sm font-medium text-white/75">{formatShortDate(analytics?.nextAppointmentAt)}</div></div>
                          </div>
                          {analytics?.isWithoutFollowUp ? <div className="mt-3 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">Ohne Folgetermin</div> : null}
                          <div className="mt-3 text-xs text-white/40">Erstellt: {formatShortDate(row.created_at)}</div>
                        </Link>
                        {role === "ADMIN" ? <div className="mt-3 flex justify-end"><DeleteCustomerButton customerProfileId={row.id} /></div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[920px] table-auto text-sm">
                <thead className="bg-white/[0.03]"><tr className="text-left text-white/60"><th className="w-[30%] px-6 py-4 font-semibold">Kunde</th><th className="w-[24%] px-4 py-4 font-semibold">Kontakt</th><th className="w-[8%] px-4 py-4 font-semibold text-center">Besuche</th><th className="w-[13%] px-4 py-4 font-semibold">Letzter Besuch</th><th className="w-[13%] px-4 py-4 font-semibold">Nächster Termin</th><th className="w-[12%] px-4 py-4 font-semibold">Erstellt</th>{role === "ADMIN" && <th className="px-6 py-4 text-right font-semibold">Aktion</th>}</tr></thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={role === "ADMIN" ? 7 : 6} className="px-6 py-8 text-sm text-white/55">Keine Kunden gefunden.</td></tr>
                  ) : filteredRows.map((row) => {
                    const person = firstJoin(row.person);
                    const tenant = firstJoin(row.tenant);
                    const tenantLabel = tenant?.display_name || row?.tenant_id || "";
                    const theme = tenantThemeByName(tenantLabel);
                    const analytics = analyticsByCustomerId.get(row.id);
                    const shortCode = getUserShortCode(tenantLabel);
                    return (
                      <tr key={row.id} className="border-t border-white/8 transition hover:bg-white/[0.025]">
                        <td className="px-6 py-4 align-middle"><Link href={`/customers/${row.id}`} className="block"><div className="flex items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold" style={{ backgroundColor: theme.pillBg, borderColor: theme.border, color: theme.pillText }}>{shortCode}</div><div className="min-w-0"><div className="truncate font-semibold text-white">{person?.full_name ?? "—"}</div>{analytics?.isWithoutFollowUp ? <div className="mt-1 text-xs text-amber-300">Ohne Folgetermin</div> : null}</div></div></Link></td>
                        <td className="px-4 py-4 align-middle text-white/75"><div className="whitespace-nowrap">{person?.phone ?? "—"}</div><div className="mt-1 max-w-[220px] truncate text-xs text-white/45">{person?.email ?? "—"}</div></td>
                        <td className="px-4 py-4 align-middle text-center font-semibold text-white"><div>{analytics?.visitCount ?? 0}</div>{(analytics?.noShowCount ?? 0) > 0 ? <div className="mt-1 text-[11px] font-medium text-orange-300">{analytics?.noShowCount} No-Show</div> : null}</td>
                        <td className="px-4 py-4 align-middle text-white/70">{formatShortDate(analytics?.lastVisitAt)}</td>
                        <td className="px-4 py-4 align-middle text-white/70">{formatShortDate(analytics?.nextAppointmentAt)}</td>
                        <td className="px-4 py-4 align-middle text-white/50">{formatShortDate(row.created_at)}</td>
                        {role === "ADMIN" ? <td className="px-6 py-4 align-middle text-right"><DeleteCustomerButton customerProfileId={row.id} /></td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

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
};

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function tenantThemeByName(name: string) {
  const n = (name || "").toLowerCase();

  if (n.includes("radu")) {
    return {
      accent: "#3b82f6",
      surface: "rgba(59,130,246,0.12)",
      border: "rgba(59,130,246,0.26)",
      pillBg: "rgba(59,130,246,0.16)",
      pillText: "#bfdbfe",
    };
  }

  if (n.includes("raluca")) {
    return {
      accent: "#a855f7",
      surface: "rgba(168,85,247,0.12)",
      border: "rgba(168,85,247,0.26)",
      pillBg: "rgba(168,85,247,0.16)",
      pillText: "#e9d5ff",
    };
  }

  if (n.includes("alexandra")) {
    return {
      accent: "#22c55e",
      surface: "rgba(34,197,94,0.12)",
      border: "rgba(34,197,94,0.26)",
      pillBg: "rgba(34,197,94,0.16)",
      pillText: "#bbf7d0",
    };
  }

  if (n.includes("barbara")) {
    return {
      accent: "#f97316",
      surface: "rgba(249,115,22,0.12)",
      border: "rgba(249,115,22,0.26)",
      pillBg: "rgba(249,115,22,0.16)",
      pillText: "#fed7aa",
    };
  }

  return {
    accent: "var(--primary)",
    surface: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.10)",
    pillBg: "rgba(255,255,255,0.08)",
    pillText: "rgba(255,255,255,0.88)",
  };
}

function formatShortDate(dateString: string | null | undefined) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getUserShortCode(tenantLabel: string) {
  const label = tenantLabel.toLowerCase();

  if (label.includes("alexandra")) return "AS";
  if (label.includes("barbara")) return "BE";
  if (label.includes("radu")) return "RC";
  if (label.includes("raluca")) return "RC";

  return "—";
}



function normalizeTenantPersonKey(value: string) {
  const label = (value || "").toLowerCase();

  if (label.includes("radu")) return "radu";
  if (label.includes("raluca")) return "raluca";
  if (label.includes("alexandra")) return "alexandra";
  if (label.includes("barbara")) return "barbara";

  return "";
}

function getTenantDisplayLabel(tenantLabel: string) {
  const key = normalizeTenantPersonKey(tenantLabel);

  if (key === "radu") return "Radu";
  if (key === "raluca") return "Raluca";
  if (key === "alexandra") return "Alexandra";
  if (key === "barbara") return "Barbara";

  const first = (tenantLabel || "").trim().split(/\s+/)[0] || "—";
  return first;
}

function getTenantAvatarRing(tenantLabel: string) {
  const theme = tenantThemeByName(tenantLabel);
  return {
    ring: theme.accent,
    glow: theme.border,
  };
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
  const preferredOrder = ["radu", "raluca", "alexandra", "barbara"];
  const byKey = new Map<string, { tenant_id: string; label: string; user_id: string | null }>();

  for (const option of options) {
    const key = normalizeTenantPersonKey(option.label) || option.tenant_id;
    if (!byKey.has(key)) byKey.set(key, option);
  }

  const orderedOptions = preferredOrder
    .map((key) => byKey.get(key))
    .filter((entry): entry is { tenant_id: string; label: string; user_id: string | null } => Boolean(entry));

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <form action={action}>
        <input type="hidden" name="tenantId" value="all" />
        <button type="submit" className="group flex flex-col items-center gap-2">
          <span
            className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-full transition duration-200"
            style={{
              background: "#ffffff",
              color: "#0B0B0C",
              boxShadow: current === "all"
                ? "0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px rgba(255,255,255,0.92)"
                : "0 0 0 1px rgba(255,255,255,0.14)",
              transform: current === "all" ? "scale(1.03)" : "scale(1)",
            }}
          >
            <span className="text-[15px] font-semibold">Alle</span>
          </span>

          <span
            className="inline-flex min-h-[28px] items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold transition"
            style={{
              borderColor: current === "all" ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.10)",
              background: current === "all" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              color: "#ffffff",
            }}
          >
            Alle
          </span>
        </button>
      </form>

      {orderedOptions.map((entry) => {
        const active = current === entry.tenant_id;
        const ring = getTenantAvatarRing(entry.label);
        const displayLabel = getTenantDisplayLabel(entry.label);

        return (
          <form key={entry.tenant_id} action={action}>
            <input type="hidden" name="tenantId" value={entry.tenant_id} />
            <button type="submit" className="group flex flex-col items-center gap-2">
              <span
                className="inline-flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#0d0d10] transition duration-200"
                style={{
                  boxShadow: active
                    ? `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${ring.ring}, 0 0 16px ${ring.glow}`
                    : `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 3px ${ring.ring}`,
                  transform: active ? "scale(1.03)" : "scale(1)",
                }}
              >
                {entry.user_id ? (
                  <img
                    src={`/users/${entry.user_id}.png`}
                    alt={displayLabel}
                    className="block h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    {getUserShortCode(entry.label)}
                  </span>
                )}
              </span>

              <span
                className="inline-flex min-h-[28px] items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold transition"
                style={{
                  borderColor: active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.10)",
                  background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                  color: "#ffffff",
                }}
              >
                {displayLabel}
              </span>
            </button>
          </form>
        );
      })}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: number;
  subtext: string;
}) {
  return (
    <Card className="border-[var(--border)] bg-[var(--surface)] transition hover:border-white/15 hover:bg-white/[0.035]">
      <CardContent className="min-h-[132px] p-5">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <div className="mt-4 text-[32px] font-semibold leading-none tracking-tight text-[var(--text)]">
          {value}
        </div>
        <div className="mt-3 text-sm text-white/50">{subtext}</div>
      </CardContent>
    </Card>
  );
}

function readLineValue(notesInternal: string | null, prefix: string) {
  const lines = (notesInternal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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
    | { q?: string; success?: string; error?: string }
    | Promise<{ q?: string; success?: string; error?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const qRaw = (sp?.q ?? "").toString();
  const q = qRaw.trim().toLowerCase();
  const errorMsg = (sp?.error ?? "").toString();

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <Link href="/login" className="underline">
          Bitte einloggen
        </Link>
      </main>
    );
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

    const { data: practitioners } = await admin
      .from("user_profiles")
      .select("user_id, tenant_id, calendar_tenant_id, full_name")
      .eq("role", "PRACTITIONER");

    const seen = new Set<string>();

    tenantOptions = (practitioners ?? [])
      .map((p: any) => {
        const tenantId = (p?.calendar_tenant_id ?? p?.tenant_id ?? null) as string | null;
        if (!tenantId) return null;

        return {
          tenant_id: tenantId,
          label: (p?.full_name as string) || tenantId,
          user_id: (p?.user_id as string | null) ?? null,
        };
      })
      .filter((x): x is { tenant_id: string; label: string; user_id: string | null } => x !== null)
      .filter((x) => {
        if (seen.has(x.tenant_id)) return false;
        seen.add(x.tenant_id);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const effectiveTenantId = await getEffectiveTenantId({
    role: profile?.role ?? "PRACTITIONER",
    tenant_id: profile?.tenant_id ?? null,
    calendar_tenant_id: profile?.calendar_tenant_id ?? null,
  });

  let customerQuery = admin
    .from("customer_profiles")
    .select(
      `
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
      `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (effectiveTenantId) {
    customerQuery = customerQuery.eq("tenant_id", effectiveTenantId);
  }

  let appointmentQuery = admin
    .from("appointments")
    .select("id, person_id, start_at, end_at, notes_internal, tenant_id")
    .limit(5000);

  if (effectiveTenantId) {
    appointmentQuery = appointmentQuery.eq("tenant_id", effectiveTenantId);
  }

  const [{ data: rowsRaw, error }, { data: appointmentsRaw, error: appointmentsError }] =
    await Promise.all([customerQuery, appointmentQuery]);

  const rows = (rowsRaw ?? []) as CustomerRow[];
  const appointments = (appointmentsRaw ?? []) as AppointmentRow[];

  const filteredRows = rows.filter((row) => {
    if (!q) return true;

    const person = firstJoin(row.person);
    const tenant = firstJoin(row.tenant);

    const name = (person?.full_name ?? "").toLowerCase();
    const phone = (person?.phone ?? "").toLowerCase();
    const email = (person?.email ?? "").toLowerCase();
    const tenantLabel = (tenant?.display_name ?? "").toLowerCase();

    return (
      name.includes(q) ||
      phone.includes(q) ||
      email.includes(q) ||
      tenantLabel.includes(q)
    );
  });

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const customerPersonIds = new Set(
    rows.map((row) => row.person_id).filter((value): value is string => Boolean(value))
  );

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
        if (!currentLastVisit || new Date(currentLastVisit) < startDate) {
          lastVisitByPersonId.set(personId, startAt);
        }
      }

      if (isNoShow) {
        noShowsByPersonId.set(personId, (noShowsByPersonId.get(personId) ?? 0) + 1);
      }
    } else {
      const isCancelled = explicitStatus === "cancelled";
      if (!isCancelled) {
        const currentNextAppointment = nextAppointmentByPersonId.get(personId);
        if (!currentNextAppointment || new Date(currentNextAppointment) > startDate) {
          nextAppointmentByPersonId.set(personId, startAt);
        }
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

    if (visitCount > 0 && lastVisitAt) {
      const lastVisitDate = new Date(lastVisitAt);

      if (!Number.isNaN(lastVisitDate.getTime()) && lastVisitDate >= thirtyDaysAgo) {
        activeCustomers30Days += 1;
      }

      if (
        !Number.isNaN(lastVisitDate.getTime()) &&
        !nextAppointmentAt &&
        lastVisitDate < sixtyDaysAgo
      ) {
        inactiveCustomers60Days += 1;
      }

      if (!nextAppointmentAt) {
        withoutFollowUp += 1;
      }
    }

    analyticsByCustomerId.set(row.id, {
      visitCount,
      lastVisitAt,
      nextAppointmentAt,
      noShowCount,
    });
  }

  const adminMissingOwnTenant =
    role === "ADMIN" && currentAdminTenant === "all" && !profile?.tenant_id;

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <section>
        <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <CardContent className="p-5 md:p-6 xl:p-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                  Clientique Kundenbereich
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                  Kunden
                </h1>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Eingeloggt als {profile?.full_name ?? user.email} ({profile?.role ?? "—"})
                </p>

                {role === "ADMIN" ? (
                  <div className="mt-5 space-y-3">
                    <AdminTenantAvatarPicker
                      current={currentAdminTenant}
                      options={tenantOptions}
                      action={setAdminTenant}
                    />

                    {currentAdminTenant === "all" && (
                      <div className="text-xs text-white/50">
                        Hinweis: „Alle“ ist die Admin-Ansicht. „Neuer Kunde“ wird dann in deinem
                        eigenen Tenant angelegt.
                      </div>
                    )}

                    {adminMissingOwnTenant && (
                      <div className="text-xs text-red-300">
                        Dein ADMIN-Profil hat aktuell kein tenant_id.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex w-full max-w-[640px] flex-col gap-3 sm:flex-row">
                <form action="/customers" method="get" className="flex-1">
                  <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                    <input
                      type="text"
                      name="q"
                      defaultValue={qRaw}
                      placeholder="Name, Telefon, E-Mail oder Behandler suchen"
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                    />
                  </div>
                </form>

                <Link href="/customers/new" className="sm:shrink-0">
                  <Button className="h-11 w-full sm:w-auto">+ Neuer Kunde</Button>
                </Link>
              </div>
            </div>

            {(error || appointmentsError || errorMsg) && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error?.message || appointmentsError?.message || errorMsg}
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Kunden gesamt"
                value={totalCustomers}
                subtext="Alle sichtbaren Kundenprofile"
              />
              <SummaryCard
                label="Aktiv 30 Tage"
                value={activeCustomers30Days}
                subtext="Mit gekommenem Besuch in den letzten 30 Tagen"
              />
              <SummaryCard
                label="Inaktiv 60 Tage"
                value={inactiveCustomers60Days}
                subtext="Länger ohne gekommenen Besuch und ohne Folgetermin"
              />
              <SummaryCard
                label="Ohne Folgetermin"
                value={withoutFollowUp}
                subtext="Bereits gekommen, aber aktuell nichts geplant"
              />
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
                  <div className="text-lg font-semibold text-[var(--text)]">Kundenliste</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    {filteredRows.length} Ergebnis(se)
                  </div>
                </div>

                {qRaw ? (
                  <Link href="/customers">
                    <Button variant="secondary" size="sm">Reset</Button>
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="lg:hidden px-4 py-4">
              {filteredRows.length === 0 ? (
                <div className="rounded-[20px] border border-white/8 bg-white/[0.02] px-4 py-6 text-sm text-white/55">
                  Keine Kunden gefunden.
                </div>
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
                      <div
                        key={row.id}
                        className="rounded-[22px] border border-white/8 bg-white/[0.02] px-4 py-4 transition hover:bg-white/[0.035]"
                      >
                        <Link href={`/customers/${row.id}`} className="block">
                          <div className="flex items-start gap-3">
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
                              style={{
                                backgroundColor: theme.pillBg,
                                borderColor: theme.border,
                                color: theme.pillText,
                              }}
                            >
                              {shortCode}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-semibold text-white">
                                {person?.full_name ?? "—"}
                              </div>
                              <div className="mt-1 whitespace-nowrap text-sm text-white/75">
                                {person?.phone ?? "—"}
                              </div>
                              <div className="mt-1 truncate text-xs text-white/45">
                                {person?.email ?? "—"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Besuche</div>
                              <div className="mt-1 text-sm font-semibold text-white">
                                {analytics?.visitCount ?? 0}
                              </div>
                              {(analytics?.noShowCount ?? 0) > 0 ? (
                                <div className="mt-1 text-[11px] text-orange-300">
                                  {analytics?.noShowCount} No-Show
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Letzter</div>
                              <div className="mt-1 text-sm font-medium text-white/75">
                                {formatShortDate(analytics?.lastVisitAt)}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-white/40">Nächster</div>
                              <div className="mt-1 text-sm font-medium text-white/75">
                                {formatShortDate(analytics?.nextAppointmentAt)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-white/40">
                            Erstellt: {formatShortDate(row.created_at)}
                          </div>
                        </Link>

                        {role === "ADMIN" ? (
                          <div className="mt-3 flex justify-end">
                            <DeleteCustomerButton customerProfileId={row.id} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[920px] table-auto text-sm">
                <thead className="bg-white/[0.03]">
                  <tr className="text-left text-white/60">
                    <th className="w-[30%] px-6 py-4 font-semibold">Kunde</th>
                    <th className="w-[24%] px-4 py-4 font-semibold">Kontakt</th>
                    <th className="w-[8%] px-4 py-4 font-semibold text-center">Besuche</th>
                    <th className="w-[13%] px-4 py-4 font-semibold">Letzter Besuch</th>
                    <th className="w-[13%] px-4 py-4 font-semibold">Nächster Termin</th>
                    <th className="w-[12%] px-4 py-4 font-semibold">Erstellt</th>
                    {role === "ADMIN" && (
                      <th className="px-6 py-4 text-right font-semibold">Aktion</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={role === "ADMIN" ? 7 : 6}
                        className="px-6 py-8 text-sm text-white/55"
                      >
                        Keine Kunden gefunden.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const person = firstJoin(row.person);
                      const tenant = firstJoin(row.tenant);
                      const tenantLabel = tenant?.display_name || row?.tenant_id || "";
                      const theme = tenantThemeByName(tenantLabel);
                      const analytics = analyticsByCustomerId.get(row.id);
                      const shortCode = getUserShortCode(tenantLabel);

                      return (
                        <tr
                          key={row.id}
                          className="border-t border-white/8 transition hover:bg-white/[0.025]"
                        >
                          <td className="px-6 py-4 align-middle">
                            <Link href={`/customers/${row.id}`} className="block">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
                                  style={{
                                    backgroundColor: theme.pillBg,
                                    borderColor: theme.border,
                                    color: theme.pillText,
                                  }}
                                >
                                  {shortCode}
                                </div>

                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-white">
                                    {person?.full_name ?? "—"}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </td>

                          <td className="px-4 py-4 align-middle text-white/75">
                            <div className="whitespace-nowrap">{person?.phone ?? "—"}</div>
                            <div className="mt-1 max-w-[220px] truncate text-xs text-white/45">
                              {person?.email ?? "—"}
                            </div>
                          </td>

                          <td className="px-4 py-4 align-middle text-center font-semibold text-white">
                            <div>{analytics?.visitCount ?? 0}</div>
                            {(analytics?.noShowCount ?? 0) > 0 ? (
                              <div className="mt-1 text-[11px] font-medium text-orange-300">
                                {analytics?.noShowCount} No-Show
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-4 align-middle text-white/70">
                            {formatShortDate(analytics?.lastVisitAt)}
                          </td>

                          <td className="px-4 py-4 align-middle text-white/70">
                            {formatShortDate(analytics?.nextAppointmentAt)}
                          </td>

                          <td className="px-4 py-4 align-middle text-white/50">
                            {formatShortDate(row.created_at)}
                          </td>

                          {role === "ADMIN" && (
                            <td className="px-6 py-4 align-middle text-right">
                              <DeleteCustomerButton customerProfileId={row.id} />
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

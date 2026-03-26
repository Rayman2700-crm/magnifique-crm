import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setAdminTenant } from "@/app/admin/actions";
import { getAdminTenantCookie, getEffectiveTenantId } from "@/lib/effectiveTenant";
import AdminTenantSelect from "./AdminTenantSelect";
import DeleteCustomerButton from "./DeleteCustomerButton";

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

  let rowBg = "transparent";
  let text = "rgba(255,255,255,0.95)";
  let text2 = "rgba(255,255,255,0.82)";
  let text3 = "rgba(255,255,255,0.68)";
  let border = "rgba(255,255,255,0.10)";

  if (n.includes("radu")) {
    rowBg = "#3F51B5";
    text = "#ffffff";
    text2 = "rgba(255,255,255,0.88)";
    text3 = "rgba(255,255,255,0.76)";
    border = "rgba(0,0,0,0.20)";
  } else if (n.includes("raluca")) {
    rowBg = "#6F2DA8";
    text = "#ffffff";
    text2 = "rgba(255,255,255,0.88)";
    text3 = "rgba(255,255,255,0.76)";
    border = "rgba(0,0,0,0.20)";
  } else if (n.includes("alexandra")) {
    rowBg = "#008000";
    text = "#ffffff";
    text2 = "rgba(255,255,255,0.88)";
    text3 = "rgba(255,255,255,0.76)";
    border = "rgba(0,0,0,0.20)";
  } else if (n.includes("barbara")) {
    rowBg = "#F37A48";
    text = "#0b0b0c";
    text2 = "rgba(11,11,12,0.82)";
    text3 = "rgba(11,11,12,0.70)";
    border = "rgba(0,0,0,0.10)";
  }

  return { rowBg, text, text2, text3, border };
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
  if (label.includes("radu")) return "RA";
  if (label.includes("raluca")) return "RL";

  return "—";
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/55">{subtext}</div>
    </div>
  );
}

function readLineValue(notesInternal: string | null, prefix: string) {
  const lines = (notesInternal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const line = lines.find((entry) =>
    entry.toLowerCase().startsWith(prefix.toLowerCase())
  );

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

  let tenantOptions: { tenant_id: string; label: string }[] = [];
  let currentAdminTenant = "all";

  if (role === "ADMIN") {
    currentAdminTenant = await getAdminTenantCookie();

    const { data: practitioners } = await admin
      .from("user_profiles")
      .select("tenant_id, calendar_tenant_id, full_name")
      .eq("role", "PRACTITIONER");

    const seen = new Set<string>();

    tenantOptions = (practitioners ?? [])
      .map((p: any) => {
        const tenantId = (p?.calendar_tenant_id ?? p?.tenant_id ?? null) as string | null;
        if (!tenantId) return null;

        return {
          tenant_id: tenantId,
          label: (p?.full_name as string) || tenantId,
        };
      })
      .filter((x): x is { tenant_id: string; label: string } => x !== null)
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
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Kunden</h1>
          <p className="mt-1 text-sm text-white/60">
            Eingeloggt als {profile?.full_name ?? user.email} ({profile?.role ?? "—"})
          </p>

          {role === "ADMIN" ? (
            <div className="mt-3 space-y-2">
              <AdminTenantSelect
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

        <div className="flex flex-col gap-3 sm:flex-row">
          <form action="/customers" method="get" className="min-w-[280px]">
            <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3">
              <input
                type="text"
                name="q"
                defaultValue={qRaw}
                placeholder="Name, Telefon, E-Mail suchen"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
            </div>
          </form>

          <Link
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 font-medium text-black transition hover:bg-white/90"
            href="/customers/new"
          >
            + Neuer Kunde
          </Link>
        </div>
      </div>

      {(error || appointmentsError || errorMsg) && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error?.message || appointmentsError?.message || errorMsg}
        </div>
      )}

      <section className="mt-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface)]">
        <div className="overflow-x-auto xl:overflow-x-visible">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-white/70">
                <th className="w-[13%] p-3 font-semibold">Name</th>
                <th className="w-[12%] p-3 font-semibold">Telefon</th>
                <th className="w-[14%] p-3 font-semibold">E-Mail</th>
                <th className="w-[7%] p-3 font-semibold text-center">User</th>
                <th className="w-[7%] p-3 font-semibold text-center">Besuche</th>
                <th className="w-[13%] p-3 font-semibold">Letzter Besuch</th>
                <th className="w-[13%] p-3 font-semibold">Nächster Termin</th>
                <th className="w-[11%] p-3 font-semibold">Erstellt</th>
                {role === "ADMIN" && (
                  <th className="w-[10%] p-3 font-semibold text-right">Löschen</th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={role === "ADMIN" ? 9 : 8}
                    className="p-6 text-sm text-white/60"
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
                      className="border-t"
                      style={{
                        backgroundColor: theme.rowBg,
                        borderColor: theme.border,
                      }}
                    >
                      <td className="p-3 align-middle font-medium">
                        <Link
                          className="block truncate"
                          href={`/customers/${row.id}`}
                          style={{ color: theme.text }}
                          title={person?.full_name ?? "—"}
                        >
                          {person?.full_name ?? "—"}
                        </Link>
                      </td>

                      <td className="p-3 align-middle" style={{ color: theme.text2 }}>
                        <div className="truncate" title={person?.phone ?? "—"}>
                          {person?.phone ?? "—"}
                        </div>
                      </td>

                      <td className="p-3 align-middle" style={{ color: theme.text2 }}>
                        <div className="truncate" title={person?.email ?? "—"}>
                          {person?.email ?? "—"}
                        </div>
                      </td>

                      <td
                        className="p-3 align-middle text-center"
                        style={{ color: theme.text }}
                      >
                        <span className="inline-flex min-w-[38px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold tracking-wide">
                          {shortCode}
                        </span>
                      </td>

                      <td
                        className="p-3 align-middle text-center font-semibold"
                        style={{ color: theme.text }}
                      >
                        {analytics?.visitCount ?? 0}
                      </td>

                      <td className="p-3 align-middle" style={{ color: theme.text2 }}>
                        <div className="truncate" title={formatShortDate(analytics?.lastVisitAt)}>
                          {formatShortDate(analytics?.lastVisitAt)}
                        </div>
                      </td>

                      <td className="p-3 align-middle" style={{ color: theme.text2 }}>
                        <div
                          className="truncate"
                          title={formatShortDate(analytics?.nextAppointmentAt)}
                        >
                          {formatShortDate(analytics?.nextAppointmentAt)}
                        </div>
                      </td>

                      <td className="p-3 align-middle" style={{ color: theme.text3 }}>
                        {formatShortDate(row.created_at)}
                      </td>

                      {role === "ADMIN" && (
                        <td className="p-3 align-middle text-right">
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
      </section>
    </main>
  );
}
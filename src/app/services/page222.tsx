import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import ServicesWorkspace from "./ServicesWorkspace";
import ServiceTenantSelect from "./ServiceTenantSelect";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
  full_name?: string | null;
  user_id?: string | null;
};

type TenantOption = {
  id: string;
  display_name: string | null;
  user_id: string | null;
};

type ServiceRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  default_price_cents: number | null;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  description: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  tenant?:
    | {
        display_name: string | null;
      }
    | {
        display_name: string | null;
      }[]
    | null;
};

type TenantAvatarOption = TenantOption & {
  shortLabel: string;
  ringColor: string;
  displayLabel: string;
};

type StatusFilter = "active" | "inactive" | "all";

function toShortLabel(value: string | null, fallback: string) {
  const source = String(value ?? "").trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getTenantDisplayLabel(name: string | null, fallback: string) {
  const source = String(name ?? "").trim() || fallback;
  return source.split(/\s+/)[0] || fallback;
}

function avatarRingColor(name: string | null, index: number) {
  const n = String(name ?? "").toLowerCase();
  if (n.includes("radu")) return "#3b82f6";
  if (n.includes("raluca")) return "#a855f7";
  if (n.includes("alexandra")) return "#22c55e";
  if (n.includes("barbara")) return "#f97316";
  const colors = ["rgba(255,255,255,0.55)", "#3b82f6", "#a855f7", "#22c55e", "#f97316"];
  return colors[index % colors.length];
}

function buildServicesHref(q: string, status: StatusFilter, createOpen = false) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status !== "active") params.set("status", status);
  if (createOpen) params.set("create", "1");
  const query = params.toString();
  return query ? `/services?${query}` : "/services";
}

function isTenantOption(
  entry: { id: string; display_name: string | null; user_id: string | null } | null
): entry is TenantOption {
  return entry !== null;
}

function statusLinkClass(isActive: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition whitespace-nowrap",
    isActive
      ? "border-white bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.10)]"
      : "border-white/10 bg-black/20 text-white hover:bg-white/10",
  ].join(" ");
}

function statusCountClass(isActive: boolean) {
  return [
    "inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold",
    isActive ? "bg-black/10 text-black" : "bg-white/10 text-white/90",
  ].join(" ");
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; create?: string }>;
}) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) redirect("/dashboard");

  const typedProfile = profile as UserProfileRow;
  const sp = (await searchParams) ?? {};
  const qRaw = String(sp.q ?? "");
  const q = qRaw.trim().toLowerCase();
  const statusFilter = (["active", "inactive", "all"].includes(String(sp.status))
    ? String(sp.status)
    : "active") as StatusFilter;
  const createOpen = String(sp.create ?? "") === "1";

  const role = String(typedProfile.role ?? "PRACTITIONER").toUpperCase();
  const isAdmin = role === "ADMIN";

  const selectedTenantId = await getEffectiveTenantId({
    role: typedProfile.role ?? "PRACTITIONER",
    tenant_id: typedProfile.tenant_id ?? null,
    calendar_tenant_id: typedProfile.calendar_tenant_id ?? null,
  });

  let tenantOptions: TenantOption[] = [];
  let tenantName: string | null = null;
  let services: ServiceRow[] = [];

  if (isAdmin) {
    const { data: tenantProfiles } = await admin
      .from("user_profiles")
      .select("user_id, role, tenant_id, calendar_tenant_id, full_name")
      .in("role", ["PRACTITIONER", "ADMIN"]);

    const seen = new Set<string>();
    tenantOptions = ((tenantProfiles ?? []) as UserProfileRow[])
      .map((entry) => {
        const tenantId = entry.tenant_id ?? entry.calendar_tenant_id ?? null;
        if (!tenantId) return null;
        return {
          id: tenantId,
          display_name: entry.full_name ?? tenantId,
          user_id: entry.user_id ?? null,
        };
      })
      .filter(isTenantOption)
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
  } else if (selectedTenantId) {
    const { data: ownTenant } = await admin
      .from("tenants")
      .select("id, display_name")
      .eq("id", selectedTenantId)
      .single();

    if (ownTenant) {
      tenantOptions = [
        {
          id: ownTenant.id as string,
          display_name: (ownTenant.display_name as string | null) ?? ownTenant.id,
          user_id: user.id,
        },
      ];
    }
  }

  const shouldShowAllServices = isAdmin && !selectedTenantId;

  if (shouldShowAllServices) {
    const { data: serviceRows } = await admin
      .from("services")
      .select(
        "id, tenant_id, name, default_price_cents, duration_minutes, buffer_minutes, description, is_active, created_at, updated_at, tenant:tenants(display_name)"
      )
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    tenantName = "Alle Behandler";
    services = (serviceRows ?? []) as ServiceRow[];
  } else if (selectedTenantId) {
    const [{ data: tenant }, { data: serviceRows }] = await Promise.all([
      admin.from("tenants").select("display_name").eq("id", selectedTenantId).single(),
      admin
        .from("services")
        .select(
          "id, tenant_id, name, default_price_cents, duration_minutes, buffer_minutes, description, is_active, created_at, updated_at, tenant:tenants(display_name)"
        )
        .eq("tenant_id", selectedTenantId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true }),
    ]);

    tenantName = tenant?.display_name ?? null;
    services = (serviceRows ?? []) as ServiceRow[];
  }

  const tenantAvatarOptions: TenantAvatarOption[] = tenantOptions.map((tenant, index) => ({
    ...tenant,
    shortLabel: toShortLabel(tenant.display_name, tenant.id),
    ringColor: avatarRingColor(tenant.display_name, index),
    displayLabel: getTenantDisplayLabel(tenant.display_name, tenant.id),
  }));

  const counts = {
    active: services.filter((service) => Boolean(service.is_active)).length,
    inactive: services.filter((service) => !Boolean(service.is_active)).length,
    all: services.length,
  };

  const filteredServices = services.filter((service) => {
    const active = Boolean(service.is_active);
    const matchesStatus =
      statusFilter === "all" ? true : statusFilter === "active" ? active : !active;

    const haystack = [
      service.name ?? "",
      service.description ?? "",
      ((service.default_price_cents ?? 0) / 100).toFixed(2).replace(".", ","),
      String(service.duration_minutes ?? ""),
      String(service.tenant_id ?? ""),
      String(
        Array.isArray(service.tenant)
          ? service.tenant[0]?.display_name ?? ""
          : service.tenant?.display_name ?? ""
      ),
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !q || haystack.includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <section className="overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="p-5 md:p-7">
          <div
            className="rounded-[28px] border p-5 md:p-6"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                    Clientique Service Center
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                    Dienstleistungen
                  </h1>

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={buildServicesHref(qRaw, "active")}
                      className={statusLinkClass(statusFilter === "active")}
                    >
                      <span>Aktiv</span>
                      <span className={statusCountClass(statusFilter === "active")}>{counts.active}</span>
                    </Link>
                    <Link
                      href={buildServicesHref(qRaw, "inactive")}
                      className={statusLinkClass(statusFilter === "inactive")}
                    >
                      <span>Inaktiv</span>
                      <span className={statusCountClass(statusFilter === "inactive")}>{counts.inactive}</span>
                    </Link>
                    <Link
                      href={buildServicesHref(qRaw, "all")}
                      className={statusLinkClass(statusFilter === "all")}
                    >
                      <span>Alle</span>
                      <span className={statusCountClass(statusFilter === "all")}>{counts.all}</span>
                    </Link>
                  </div>
                </div>

                <div className="w-full xl:w-auto xl:max-w-[620px] xl:min-w-[420px] xl:shrink-0">
                  <div className="flex justify-start xl:justify-end">
                    <div className="max-w-full overflow-x-auto">
                      <div className="min-w-max">
                        <ServiceTenantSelect
                          tenantOptions={tenantAvatarOptions}
                          selectedTenantId={selectedTenantId}
                          isAdmin={isAdmin}
                          fallbackLabel={tenantName ?? "nicht gewählt"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-start xl:justify-end">
                <form action="/services" method="get" className="w-full xl:max-w-[620px]">
                  <input type="hidden" name="status" value={statusFilter} />
                  <div className="flex h-11 items-center rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                    <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      name="q"
                      defaultValue={qRaw}
                      placeholder={shouldShowAllServices ? "Name, Beschreibung, Preis, Dauer, Tenant" : "Name, Beschreibung, Preis, Dauer"}
                      className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                    />
                  </div>
                </form>
              </div>
            </div>
          </div>

          {services.length === 0 ? (
            <section className="mt-6 rounded-[28px] border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
              <div className="text-xl font-semibold">Keine Dienstleistungen gefunden</div>
              <p className="mt-2 text-sm text-amber-50/90">
                {shouldShowAllServices
                  ? "Es sind aktuell keine Dienstleistungen vorhanden."
                  : "Wähle oben zuerst einen Behandler aus. Danach kannst du direkt Dienstleistungen anlegen und bearbeiten."}
              </p>
            </section>
          ) : (
            <ServicesWorkspace
              selectedTenantId={selectedTenantId ?? "all"}
              tenantName={tenantName}
              services={filteredServices}
              initialCreateOpen={!shouldShowAllServices && createOpen}
            />
          )}
        </div>
      </section>
    </main>
  );
}

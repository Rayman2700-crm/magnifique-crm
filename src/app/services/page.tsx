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

function MobileStatusMenu({
  qRaw,
  statusFilter,
  counts,
}: {
  qRaw: string;
  statusFilter: StatusFilter;
  counts: { active: number; inactive: number; all: number };
}) {
  const items: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "active", label: "Aktiv", count: counts.active },
    { key: "inactive", label: "Inaktiv", count: counts.inactive },
    { key: "all", label: "Alle", count: counts.all },
  ];

  const activeCount =
    statusFilter === "inactive"
      ? counts.inactive
      : statusFilter === "all"
        ? counts.all
        : counts.active;

  return (
    <>
      <button
        type="button"
        popoverTarget="services-status-menu"
        popoverTargetAction="toggle"
        className="relative flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_0_0_2px_rgba(11,11,12,0.95),0_10px_28px_rgba(0,0,0,0.30)] md:hidden"
        aria-label="Statusfilter öffnen"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeCount}
        </span>
      </button>

      <div
        id="services-status-menu"
        popover="auto"
        className="md:hidden fixed left-[116px] top-[332px] z-[2147483647] m-0 w-[220px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.995)_0%,rgba(12,13,16,0.995)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.62)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Status wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Dienstleistungen filtern</div>
        </div>

        <div className="grid gap-2">
          {items.map((item) => {
            const selected = statusFilter === item.key;
            return (
              <Link
                key={item.key}
                href={buildServicesHref(qRaw, item.key)}
                className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                style={{
                  borderColor: selected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                  backgroundColor: selected ? "rgba(214,195,163,0.14)" : "rgba(255,255,255,0.04)",
                }}
              >
                <span className="text-sm font-semibold text-white">{item.label}</span>
                <span className="inline-flex min-w-[28px] items-center justify-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/90">
                  {item.count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function MobileCreateButton({
  qRaw,
  statusFilter,
}: {
  qRaw: string;
  statusFilter: StatusFilter;
}) {
  return (
    <Link
      href="/services?create=1"
      aria-label="Dienstleistung hinzufügen"
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
      style={{
        color: "#0b0b0c",
        background: "linear-gradient(180deg, rgba(214,195,163,0.96) 0%, rgba(214,195,163,0.88) 100%)",
        borderColor: "rgba(214,195,163,0.28)",
        boxShadow: "0 12px 28px rgba(214,195,163,0.22), 0 0 0 2px rgba(11,11,12,0.95)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    </Link>
  );
}


function buildAdminTenantHref(tenantId: string) {
  return tenantId === "all" ? "/admin?tenant=all" : `/admin?tenant=${encodeURIComponent(tenantId)}`;
}

function DesktopServicesTenantCompactMenu({
  current,
  options,
}: {
  current: string;
  options: TenantAvatarOption[];
}) {
  const items = [
    {
      id: "all",
      display_name: "Alle",
      user_id: null as string | null,
      shortLabel: "AL",
      ringColor: "rgba(255,255,255,0.55)",
      displayLabel: "Alle",
    },
    ...options,
  ];

  const active = items.find((item) => item.id === current) ?? items[0];
  const ringColors = ["#d6c3a3", ...options.map((item) => item.ringColor)];
  const step = 100 / Math.max(1, ringColors.length);
  const ringBackground = `conic-gradient(${ringColors
    .map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`)
    .join(", ")})`;

  return (
    <div id="desktop-services-tenant-compact">
      <button
        type="button"
        popoverTarget="services-desktop-tenant-menu"
        popoverTargetAction="toggle"
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        aria-label="Behandler auswählen"
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[37px] w-[37px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {active.id === "all" ? (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
          ) : active.user_id ? (
            <img src={`/users/${active.user_id}.png`} alt={active.displayLabel} className="h-full w-full object-cover" />
          ) : (
            active.shortLabel
          )}
        </span>
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {active.id === "all" ? items.length : "1"}
        </span>
      </button>

      <div
        id="services-desktop-tenant-menu"
        popover="auto"
        className="fixed right-28 top-[230px] z-[2147483647] m-0 w-[320px] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl"
      >
        <div className="px-1 pb-2">
          <div className="text-sm font-semibold text-white">Behandler wählen</div>
          <div className="mt-0.5 text-xs text-white/45">Dienstleistungen filtern</div>
        </div>

        <div className="grid gap-2">
          {items.map((item) => {
            const selected = item.id === current;
            const ringColor = item.id === "all" ? "rgba(255,255,255,0.55)" : item.ringColor;
            return (
              <Link
                key={`desktop-services-tenant-${item.id}`}
                href={buildAdminTenantHref(item.id)}
                className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                style={{
                  borderColor: selected ? `${ringColor}66` : "rgba(255,255,255,0.10)",
                  backgroundColor: selected ? `${ringColor}22` : "rgba(255,255,255,0.04)",
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white"
                    style={{ borderColor: ringColor }}
                  >
                    {item.id === "all" ? (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-black">Alle</span>
                    ) : item.user_id ? (
                      <img src={`/users/${item.user_id}.png`} alt={item.displayLabel} className="h-full w-full object-cover" />
                    ) : (
                      item.shortLabel
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{item.displayLabel}</div>
                    <div className="truncate text-xs text-white/50">{item.id === "all" ? "Alle Behandler" : item.display_name ?? item.id}</div>
                  </div>
                </div>

                {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
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
    tenantOptions = ((tenantProfiles ?? []) as UserProfileRow[]).reduce<TenantOption[]>((acc, entry) => {
      const tenantId = entry.tenant_id ?? entry.calendar_tenant_id ?? null;
      if (!tenantId || seen.has(tenantId)) return acc;
      seen.add(tenantId);
      acc.push({
        id: tenantId,
        display_name: entry.full_name ?? tenantId,
        user_id: entry.user_id ?? null,
      });
      return acc;
    }, []);
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

  const searchPlaceholder = shouldShowAllServices ? "Name, Beschreibung, Preis, Dauer, Tenant" : "Name, Beschreibung, Preis, Dauer";
  const currentDesktopTenant = selectedTenantId ?? "all";

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 xl:p-8">
      <section className="overflow-visible rounded-[32px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="p-5 md:p-7">
          <div
            className="overflow-visible rounded-[28px] border p-5 md:p-6"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex flex-col gap-6">
              <div className="md:hidden flex flex-col gap-6">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                    Magnifique Beauty Institut Service Center
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                    Dienstleistungen
                  </h1>
                </div>

                <div className="flex items-center justify-between gap-3 md:hidden">
                  <MobileStatusMenu qRaw={qRaw} statusFilter={statusFilter} counts={counts} />
                  <MobileCreateButton qRaw={qRaw} statusFilter={statusFilter} />
                  <ServiceTenantSelect
                    tenantOptions={tenantAvatarOptions}
                    selectedTenantId={selectedTenantId}
                    isAdmin={isAdmin}
                    fallbackLabel={tenantName ?? "nicht gewählt"}
                  />
                </div>

                <div className="md:hidden flex flex-col gap-3">
                  <form action="/services" method="get" className="w-full">
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
                        placeholder={searchPlaceholder}
                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                      />
                    </div>
                  </form>
                </div>
              </div>

              <div className="hidden md:block">
                <div id="desktop-services-header" className="relative pr-[360px] xl:pr-[640px]">
                  <div className="absolute right-0 top-0 z-30 flex items-start justify-end gap-3">
                    {isAdmin ? (
                      <>
                        <div id="desktop-services-tenant-strip" className="max-w-[640px] overflow-hidden">
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
                        <DesktopServicesTenantCompactMenu current={currentDesktopTenant} options={tenantAvatarOptions} />
                      </>
                    ) : (
                      <div id="desktop-services-tenant-strip" className="max-w-[640px] overflow-hidden">
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
                    )}

                    <div id="desktop-services-search-wrap" className="relative">
                      <button
                        id="desktop-services-search-toggle"
                        type="button"
                        aria-label="Suche öffnen"
                        title="Suche"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.08]"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                      </button>

                      <div
                        id="desktop-services-search-stack"
                        className={`${qRaw ? "pointer-events-auto opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 translate-y-1 scale-95"} absolute right-0 top-[calc(100%+28px)] z-20 transition duration-200`}
                        style={{ width: "420px", maxWidth: "620px" }}
                        aria-hidden={qRaw ? "false" : "true"}
                      >
                        <div
                          id="desktop-services-search-panel"
                          className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                        >
                          <form id="desktop-services-search-form" action="/services" method="get" className="w-full">
                            <input type="hidden" name="status" value={statusFilter} />
                            <div className="flex h-12 items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                              <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="m20 20-3.5-3.5" />
                                </svg>
                              </span>
                              <input
                                id="desktop-services-search-input"
                                type="text"
                                name="q"
                                defaultValue={qRaw}
                                placeholder={searchPlaceholder}
                                autoComplete="off"
                                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                              />
                              <button
                                id="desktop-services-search-clear"
                                type="button"
                                aria-label="Suche löschen"
                                title="Suche löschen"
                                className="ml-3 inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                                style={{ opacity: qRaw ? 1 : 0, pointerEvents: qRaw ? "auto" : "none" }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                  <path d="M6 6l12 12" />
                                  <path d="M18 6 6 18" />
                                </svg>
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>

                    <Link
                      href="/services?create=1"
                      aria-label="Dienstleistung hinzufügen"
                      title="Dienstleistung hinzufügen"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] bg-[var(--primary)] text-black shadow-[0_12px_26px_rgba(214,195,163,0.18)] transition hover:opacity-90"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-[18px] w-[18px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </Link>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)] whitespace-nowrap">
                      Magnifique Beauty Institut Service Center
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                      Dienstleistungen
                    </h1>

                    <div className="mt-4 hidden items-center gap-2 md:flex">
                      <Link href={buildServicesHref(qRaw, "active")} className={statusLinkClass(statusFilter === "active")}>
                        <span>Aktiv</span>
                        <span className={statusCountClass(statusFilter === "active")}>{counts.active}</span>
                      </Link>
                      <Link href={buildServicesHref(qRaw, "inactive")} className={statusLinkClass(statusFilter === "inactive")}>
                        <span>Inaktiv</span>
                        <span className={statusCountClass(statusFilter === "inactive")}>{counts.inactive}</span>
                      </Link>
                      <Link href={buildServicesHref(qRaw, "all")} className={statusLinkClass(statusFilter === "all")}>
                        <span>Alle</span>
                        <span className={statusCountClass(statusFilter === "all")}>{counts.all}</span>
                      </Link>
                    </div>
                  </div>
                </div>
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
              initialCreateOpen={createOpen}
            />
          )}
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 768px) {
          #desktop-services-tenant-strip { display: block; }
          #desktop-services-tenant-compact { display: none; }
        }
        @media (min-width: 768px) and (max-width: 1180px) {
          #desktop-services-tenant-strip { display: none; }
          #desktop-services-tenant-compact { display: block; }
        }
      ` }} />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const wrap = document.getElementById("desktop-services-search-wrap");
              const toggle = document.getElementById("desktop-services-search-toggle");
              const stack = document.getElementById("desktop-services-search-stack");
              const input = document.getElementById("desktop-services-search-input");
              const clearButton = document.getElementById("desktop-services-search-clear");
              const form = document.getElementById("desktop-services-search-form");
              const header = document.getElementById("desktop-services-header");
              if (!wrap || !toggle || !stack || !input || !form || !header || !clearButton) return;

              let submitTimer = null;
              const shouldStartOpen = ${qRaw ? "true" : "false"};

              const updateClearButton = () => {
                const hasValue = String(input.value || "").trim().length > 0;
                clearButton.style.opacity = hasValue ? "1" : "0";
                clearButton.style.pointerEvents = hasValue ? "auto" : "none";
              };

              const setPanelWidth = () => {
                const wrapRect = wrap.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();
                const innerGap = 8;
                const minWidth = 280;
                const maxWidth = 620;
                const availableWidth = Math.floor(wrapRect.right - headerRect.left - innerGap);
                const targetWidth = Math.max(minWidth, Math.min(maxWidth, availableWidth));
                stack.style.width = targetWidth + "px";
              };

              const openPanel = (focusInput = true) => {
                setPanelWidth();
                stack.classList.remove("pointer-events-none", "opacity-0", "translate-y-1", "scale-95");
                stack.classList.add("pointer-events-auto", "opacity-100", "translate-y-0", "scale-100");
                stack.setAttribute("aria-hidden", "false");
                if (focusInput) {
                  window.requestAnimationFrame(() => {
                    input.focus();
                    const length = input.value.length;
                    input.setSelectionRange(length, length);
                    updateClearButton();
                  });
                } else {
                  updateClearButton();
                }
              };

              const closePanel = () => {
                stack.classList.add("pointer-events-none", "opacity-0", "translate-y-1", "scale-95");
                stack.classList.remove("pointer-events-auto", "opacity-100", "translate-y-0", "scale-100");
                stack.setAttribute("aria-hidden", "true");
              };

              const isOpen = () => stack.getAttribute("aria-hidden") === "false";

              toggle.addEventListener("click", (event) => {
                event.preventDefault();
                if (isOpen()) closePanel();
                else openPanel();
              });

              input.addEventListener("input", () => {
                updateClearButton();
                if (!isOpen()) openPanel(false);
                if (submitTimer) window.clearTimeout(submitTimer);
                submitTimer = window.setTimeout(() => {
                  form.requestSubmit();
                }, 260);
              });

              clearButton.addEventListener("click", (event) => {
                event.preventDefault();
                input.value = "";
                updateClearButton();
                input.focus();
                if (submitTimer) window.clearTimeout(submitTimer);
                form.requestSubmit();
              });

              input.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePanel();
                  toggle.focus();
                }
              });

              document.addEventListener("click", (event) => {
                if (!isOpen()) return;
                if (wrap.contains(event.target)) return;
                closePanel();
              });

              window.addEventListener("resize", () => {
                if (isOpen()) setPanelWidth();
              });

              updateClearButton();
              if (shouldStartOpen) openPanel(false);
              else closePanel();
            })();
          `,
        }}
      />
    </main>
  );
}

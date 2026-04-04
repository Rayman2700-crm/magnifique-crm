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
};

type TenantOption = {
  id: string;
  display_name: string | null;
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
};

type TenantAvatarOption = TenantOption & {
  shortLabel: string;
  ringClassName: string;
};

function toShortLabel(value: string | null, fallback: string) {
  const source = String(value ?? "").trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarRingClassName(index: number) {
  const styles = [
    "border-white/20",
    "border-sky-400/60",
    "border-fuchsia-400/70",
    "border-emerald-400/70",
    "border-orange-400/70",
    "border-violet-400/70",
  ];

  return styles[index % styles.length];
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
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

  if (profileError || !profile) {
    redirect("/dashboard");
  }

  const typedProfile = profile as UserProfileRow;
  const params = (await searchParams) ?? {};
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
    const { data: tenantRows } = await admin
      .from("tenants")
      .select("id, display_name")
      .order("display_name", { ascending: true });

    tenantOptions = (tenantRows ?? []) as TenantOption[];
  } else if (selectedTenantId) {
    const { data: ownTenant } = await admin
      .from("tenants")
      .select("id, display_name")
      .eq("id", selectedTenantId)
      .single();

    if (ownTenant) {
      tenantOptions = [ownTenant as TenantOption];
    }
  }

  if (selectedTenantId) {
    const [{ data: tenant }, { data: serviceRows }] = await Promise.all([
      admin.from("tenants").select("display_name").eq("id", selectedTenantId).single(),
      admin
        .from("services")
        .select(
          "id, tenant_id, name, default_price_cents, duration_minutes, buffer_minutes, description, is_active, created_at, updated_at"
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
    ringClassName: avatarRingClassName(index),
  }));

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
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                  Clientique Service Center
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                  Dienstleistungen
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <Link href="/dashboard">
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Zum Dashboard
                  </button>
                </Link>
                <Link href="/calendar">
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-[16px] border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Zum Kalender
                  </button>
                </Link>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Behandler auswählen
              </div>

              <div className="mt-4">
                <ServiceTenantSelect
                  tenantOptions={tenantAvatarOptions}
                  selectedTenantId={selectedTenantId}
                  isAdmin={isAdmin}
                  fallbackLabel={tenantName ?? "nicht gewählt"}
                />
              </div>
            </div>
          </div>

          {!selectedTenantId ? (
            <section className="mt-6 rounded-[28px] border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
              <div className="text-xl font-semibold">Kein aktiver Behandler ausgewählt</div>
              <p className="mt-2 text-sm text-amber-50/90">
                Wähle oben zuerst einen Behandler aus. Danach kannst du direkt Dienstleistungen anlegen und bearbeiten.
              </p>
            </section>
          ) : (
            <ServicesWorkspace
              selectedTenantId={selectedTenantId}
              tenantName={tenantName}
              services={services}
            />
          )}
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { setActiveServiceTenant } from "./actions";
import ServicesWorkspace from "./ServicesWorkspace";

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

function adminSelectClassName() {
  return [
    "mt-1 w-full rounded-[16px] border px-4 py-3",
    "bg-white text-black border-white/15",
    "focus:outline-none focus:ring-2 focus:ring-white/20",
  ].join(" ");
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
                <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
                  Verwalte Services pro Behandler in einer kompakten, klaren Übersicht im gleichen Stil wie dein Kundenprofil.
                </p>
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

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Aktiver Behandler</div>
                <div className="mt-2 text-base font-semibold text-[var(--text)]">
                  {tenantName ?? "nicht gewählt"}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Rolle</div>
                <div className="mt-2 text-base font-semibold text-[var(--text)]">
                  {isAdmin ? "Admin" : "Behandler"}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Dienstleistungen</div>
                <div className="mt-2 text-base font-semibold text-[var(--text)]">
                  {selectedTenantId ? services.length : 0}
                </div>
              </div>
            </div>
          </div>

          {params.success ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {decodeURIComponent(params.success)}
            </div>
          ) : null}

          {params.error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {decodeURIComponent(params.error)}
            </div>
          ) : null}

          {isAdmin ? (
            <section className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-[var(--text)]">Behandler auswählen</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Wähle den Behandler aus, für den du Dienstleistungen verwalten möchtest.
                </p>
              </div>

              <form action={setActiveServiceTenant} className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="w-full md:max-w-md">
                  <label className="text-sm font-medium text-[var(--text)]">Behandler / Tenant</label>
                  <select
                    name="tenant"
                    defaultValue={selectedTenantId ?? "all"}
                    className={adminSelectClassName()}
                  >
                    <option value="all">Bitte auswählen</option>
                    {tenantOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.display_name ?? tenant.id}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-[18px] bg-white px-5 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  Behandler übernehmen
                </button>
              </form>
            </section>
          ) : null}

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

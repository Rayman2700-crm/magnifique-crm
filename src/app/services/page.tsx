import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
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
    "mt-1 w-full rounded-xl border px-3 py-2",
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

  const selectedTenantId = isAdmin
    ? typedProfile.calendar_tenant_id ?? null
    : typedProfile.calendar_tenant_id ?? typedProfile.tenant_id ?? null;

  let tenantOptions: TenantOption[] = [];
  let tenantName: string | null = null;
  let services: ServiceRow[] = [];

  if (isAdmin) {
    const { data: tenantRows } = await supabase
      .from("tenants")
      .select("id, display_name")
      .order("display_name", { ascending: true });

    tenantOptions = (tenantRows ?? []) as TenantOption[];
  } else if (selectedTenantId) {
    const { data: ownTenant } = await supabase
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
      supabase.from("tenants").select("display_name").eq("id", selectedTenantId).single(),
      supabase
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
    <main className="mx-auto max-w-7xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dienstleistungen</h1>
          <p className="mt-1 text-sm text-white/65">
            Verwalte Services pro Behandler in einer kompakten Übersicht statt in großen Formularblöcken.
          </p>
          <p className="mt-2 text-sm text-white/80">
            Aktiver Behandler: <span className="font-medium text-white">{tenantName ?? "nicht gewählt"}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link className="rounded-xl border border-white/15 px-3 py-2 text-white hover:bg-white/5" href="/dashboard">
            Zum Dashboard
          </Link>
          <Link className="rounded-xl border border-white/15 px-3 py-2 text-white hover:bg-white/5" href="/calendar">
            Zum Kalender
          </Link>
        </div>
      </div>

      {params.success ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {decodeURIComponent(params.success)}
        </div>
      ) : null}

      {params.error ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {decodeURIComponent(params.error)}
        </div>
      ) : null}

      {isAdmin ? (
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Behandler auswählen</h2>
            <p className="mt-1 text-sm text-white/60">
              Wähle den Behandler aus, für den du Dienstleistungen verwalten möchtest.
            </p>
          </div>

          <form action={setActiveServiceTenant} className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="w-full md:max-w-md">
              <label className="text-sm font-medium text-white">Behandler / Tenant</label>
              <select
                name="tenant_id"
                defaultValue={selectedTenantId ?? ""}
                className={adminSelectClassName()}
              >
                <option value="">Bitte auswählen</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.display_name ?? tenant.id}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-2xl bg-white px-4 py-2 font-medium text-black transition hover:opacity-90"
            >
              Behandler übernehmen
            </button>
          </form>
        </section>
      ) : null}

      {!selectedTenantId ? (
        <section className="mt-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-100">
          <div className="text-lg font-semibold">Kein aktiver Behandler ausgewählt</div>
          <p className="mt-2 text-sm text-yellow-50/90">
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
    </main>
  );
}

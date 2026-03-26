import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import IntakeFormClient from "./ui";

type PersonRow = {
  full_name: string | null;
};

type CustomerProfileRow = {
  tenant_id: string | null;
  persons: PersonRow | PersonRow[] | null; // supabase types sometimes as array
};

export default async function NewIntakeFormPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const { id: customerProfileId } = await params;
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("tenant_id, role, full_name")
    .eq("user_id", user.id)
    .single();

  // customer_profile inkl. person name
  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("tenant_id, persons(full_name)")
    .eq("id", customerProfileId)
    .single<CustomerProfileRow>();

  const cpTenantId = cp?.tenant_id ?? null;

  // Tenant-Logik:
  // - PRACTITIONER: eigener tenant_id aus user_profiles
  // - ADMIN: tenant_id aus customer_profile nehmen (später echte Tenant-Auswahl)
  const tenantId =
    profile?.role === "ADMIN" ? cpTenantId : (profile?.tenant_id ?? null);

  const personObj =
    Array.isArray(cp?.persons) ? cp?.persons?.[0] : cp?.persons;
  const customerName = personObj?.full_name ?? "-";

  if (!tenantId) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border p-4 text-sm">
          Admin muss später Tenant wählen. (Aktuell kein Tenant gefunden.)
        </div>
        <div className="mt-4">
          <Link
            className="rounded-xl border px-3 py-2"
            href={`/customers/${customerProfileId}`}
          >
            Zurück
          </Link>
        </div>
      </main>
    );
  }

  // aktives Template (WICHTIG: schema_json)
  const { data: tpl, error: tplErr } = await supabase
    .from("form_templates")
    .select("id, tenant_id, name, version, schema_json")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (tplErr || !tpl) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Fragebogen</h1>
          <Link
            className="rounded-xl border px-3 py-2"
            href={`/customers/${customerProfileId}`}
          >
            Zurück
          </Link>
        </div>

        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Kein aktives Template gefunden. (Tenant: {tenantId})
        </div>
      </main>
    );
  }

  const schema = (tpl as any).schema_json;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {schema?.title ?? "Fragebogen"}
          </h1>
          <p className="text-sm text-gray-500">
            Kunde: {customerName} • Vorlage: {tpl.name} (v{tpl.version})
          </p>
        </div>
        <Link
          className="rounded-xl border px-3 py-2"
          href={`/customers/${customerProfileId}`}
        >
          Zurück
        </Link>
      </div>

      <div className="mt-6">
        <IntakeFormClient
          customerProfileId={customerProfileId}
          tenantId={tenantId}
          templateId={tpl.id}
          templateVersion={tpl.version}
          schema={schema}
        />
      </div>
    </main>
  );
}
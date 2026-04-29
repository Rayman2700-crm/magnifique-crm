import type { SupabaseClient } from "@supabase/supabase-js";

export const CLIENTIQUE_DEMO_TENANT_ID = "22222222-2222-2222-2222-222222222222";
export const CLIENTIQUE_DEMO_SLUG = "demo-beauty-studio";
export const CLIENTIQUE_DEMO_CALENDAR_ID = "demo-studio-calendar";
export const CLIENTIQUE_DEMO_CALENDAR_LABEL = "Demo Studio Kalender";

export function isDemoTenantId(tenantId: string | null | undefined) {
  return String(tenantId ?? "").trim() === CLIENTIQUE_DEMO_TENANT_ID;
}

export function isDemoTenantRecord(row: any) {
  if (!row) return false;
  return (
    row.is_demo === true ||
    String(row.id ?? "").trim() === CLIENTIQUE_DEMO_TENANT_ID ||
    String(row.slug ?? "").trim().toLowerCase() === CLIENTIQUE_DEMO_SLUG
  );
}

export async function getIsDemoTenant(
  supabase: SupabaseClient<any, any, any> | any,
  tenantId: string | null | undefined
) {
  const id = String(tenantId ?? "").trim();
  if (!id) return false;
  if (isDemoTenantId(id)) return true;

  const { data } = await supabase
    .from("tenants")
    .select("id, slug, is_demo")
    .eq("id", id)
    .maybeSingle();

  return isDemoTenantRecord(data);
}

export function demoExternalActionMessage(action = "Diese externe Aktion") {
  return `${action} ist im Demo-Modus deaktiviert. Der Ablauf wird nur mit Demo-Daten simuliert.`;
}

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { CurrentUserContext } from "@/types/auth";

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, tenant_id, calendar_tenant_id, role, full_name, is_active")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Kein user_profile für den eingeloggten User gefunden.");
  }

  if (!profile.is_active) {
    throw new Error("Dieser Benutzer ist deaktiviert.");
  }

  let tenant = null;

  if (profile.tenant_id) {
    const { data: tenantData, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug, display_name, email")
      .eq("id", profile.tenant_id)
      .single();

    if (tenantError) {
      throw new Error("Tenant konnte nicht geladen werden.");
    }

    tenant = tenantData;
  }

  return {
    authUser: {
      id: user.id,
      email: user.email ?? null,
    },
    profile,
    tenant,
  };
}
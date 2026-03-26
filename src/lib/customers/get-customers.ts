import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/get-current-user-context";

export async function getCustomers() {
  const supabase = await supabaseServer();
  const ctx = await getCurrentUserContext();

  if (ctx.profile.role === "ADMIN") {
    const { data, error } = await supabase
      .from("customer_profiles")
      .select(`
        id,
        tenant_id,
        person_id,
        notes,
        status,
        created_at,
        persons (
          id,
          full_name,
          phone,
          email,
          birthday
        ),
        tenants (
          id,
          slug,
          display_name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("customer_profiles")
    .select(`
      id,
      tenant_id,
      person_id,
      notes,
      status,
      created_at,
      persons (
        id,
        full_name,
        phone,
        email,
        birthday
      ),
      tenants (
        id,
        slug,
        display_name
      )
    `)
    .eq("tenant_id", ctx.profile.tenant_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
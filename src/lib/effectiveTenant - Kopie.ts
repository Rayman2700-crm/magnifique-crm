import { cookies } from "next/headers";

export type UserProfileForTenant = {
  role: "ADMIN" | "PRACTITIONER" | string;
  tenant_id: string | null;
  calendar_tenant_id?: string | null;
};

export async function getAdminTenantCookie(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_tenant")?.value ?? "all";
}

export async function getEffectiveTenantId(
  profile: UserProfileForTenant
): Promise<string | null> {
  const role = (profile.role ?? "PRACTITIONER").toUpperCase();

  if (role === "ADMIN") {
    const selectedTenant = await getAdminTenantCookie();
    if (!selectedTenant || selectedTenant === "all") return null;
    return selectedTenant;
  }

  // Für normale User ist der eigene Behandler-/Kunden-Tenant der calendar_tenant_id.
  // tenant_id nur als Fallback verwenden.
  return profile.calendar_tenant_id ?? profile.tenant_id ?? null;
}
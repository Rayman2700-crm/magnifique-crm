"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
};

function buildServicesUrl(key?: "success" | "error", message?: string) {
  const url = new URL("/services", "http://local");
  if (key && message) url.searchParams.set(key, message);
  return url.pathname + (url.search ? url.search : "");
}

function parseMinutes(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function parsePriceCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.replace(/\s+/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

async function requireUserProfile() {
  const supabase = await supabaseServer();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .single();

  if (error || !profile) {
    redirect(buildServicesUrl("error", "Kein Benutzerprofil gefunden."));
  }

  return {
    supabase,
    user,
    profile: profile as UserProfileRow,
  };
}

function normalizedRole(profile: UserProfileRow) {
  return String(profile.role ?? "PRACTITIONER").toUpperCase();
}

function getSelectedTenantId(profile: UserProfileRow) {
  const role = normalizedRole(profile);

  if (role === "ADMIN") {
    return profile.calendar_tenant_id ?? null;
  }

  return profile.calendar_tenant_id ?? profile.tenant_id ?? null;
}

export async function setActiveServiceTenant(formData: FormData) {
  const { supabase, user, profile } = await requireUserProfile();
  const nextTenantId = String(formData.get("tenant_id") ?? "").trim();
  const role = normalizedRole(profile);

  if (!nextTenantId) {
    if (role === "ADMIN") {
      const { error } = await supabase
        .from("user_profiles")
        .update({ calendar_tenant_id: null })
        .eq("user_id", user.id);

      if (error) {
        redirect(buildServicesUrl("error", `Behandler konnte nicht geleert werden: ${error.message}`));
      }

      revalidatePath("/services");
      revalidatePath("/dashboard");
      revalidatePath("/calendar");
      redirect(buildServicesUrl("success", "Aktiver Behandler zurückgesetzt."));
    }

    redirect(buildServicesUrl("error", "Bitte einen gültigen Behandler auswählen."));
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", nextTenantId)
    .single();

  if (tenantError || !tenant) {
    redirect(buildServicesUrl("error", "Behandler/Tenant nicht gefunden."));
  }

  if (role === "ADMIN") {
    const { error } = await supabase
      .from("user_profiles")
      .update({ calendar_tenant_id: nextTenantId })
      .eq("user_id", user.id);

    if (error) {
      redirect(buildServicesUrl("error", `Behandler konnte nicht gesetzt werden: ${error.message}`));
    }
  } else {
    const ownTenantId = profile.calendar_tenant_id ?? profile.tenant_id ?? null;
    if (ownTenantId !== nextTenantId) {
      redirect(buildServicesUrl("error", "Du kannst nur deinen eigenen Behandler auswählen."));
    }
  }

  revalidatePath("/services");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(buildServicesUrl("success", "Aktiver Behandler übernommen ✅"));
}

export async function createService(formData: FormData) {
  const { supabase, profile } = await requireUserProfile();
  const selectedTenantId = getSelectedTenantId(profile);

  if (!selectedTenantId) {
    redirect(buildServicesUrl("error", "Bitte zuerst einen Behandler/Tenant auswählen."));
  }

  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = parseMinutes(formData.get("duration_minutes"), 60);
  const bufferMinutes = parseMinutes(formData.get("buffer_minutes"), 0);
  const defaultPriceCents = parsePriceCents(formData.get("default_price"));
  const description = String(formData.get("description") ?? "").trim();
  const isActive = String(formData.get("is_active") ?? "1") === "1";

  if (!name) {
    redirect(buildServicesUrl("error", "Bitte einen Namen für die Dienstleistung eingeben."));
  }

  if (durationMinutes <= 0) {
    redirect(buildServicesUrl("error", "Die Dauer muss größer als 0 sein."));
  }

  const { error } = await supabase.from("services").insert({
    tenant_id: selectedTenantId,
    name,
    duration_minutes: durationMinutes,
    buffer_minutes: bufferMinutes,
    default_price_cents: defaultPriceCents,
    description: description || null,
    is_active: isActive,
  });

  if (error) {
    redirect(buildServicesUrl("error", `Dienstleistung konnte nicht gespeichert werden: ${error.message}`));
  }

  revalidatePath("/services");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(buildServicesUrl("success", "Dienstleistung angelegt ✅"));
}

export async function updateService(formData: FormData) {
  const { supabase, profile } = await requireUserProfile();
  const selectedTenantId = getSelectedTenantId(profile);

  if (!selectedTenantId) {
    redirect(buildServicesUrl("error", "Bitte zuerst einen Behandler/Tenant auswählen."));
  }

  const serviceId = String(formData.get("service_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = parseMinutes(formData.get("duration_minutes"), 60);
  const bufferMinutes = parseMinutes(formData.get("buffer_minutes"), 0);
  const defaultPriceCents = parsePriceCents(formData.get("default_price"));
  const description = String(formData.get("description") ?? "").trim();
  const isActive = String(formData.get("is_active") ?? "0") === "1";

  if (!serviceId) {
    redirect(buildServicesUrl("error", "Dienstleistung konnte nicht zugeordnet werden."));
  }

  if (!name) {
    redirect(buildServicesUrl("error", "Bitte einen Namen für die Dienstleistung eingeben."));
  }

  const { data: existing, error: existingError } = await supabase
    .from("services")
    .select("id, tenant_id")
    .eq("id", serviceId)
    .single();

  if (existingError || !existing) {
    redirect(buildServicesUrl("error", "Dienstleistung nicht gefunden."));
  }

  if (existing.tenant_id !== selectedTenantId) {
    redirect(buildServicesUrl("error", "Diese Dienstleistung gehört nicht zum aktiven Tenant."));
  }

  const { error } = await supabase
    .from("services")
    .update({
      name,
      duration_minutes: durationMinutes,
      buffer_minutes: bufferMinutes,
      default_price_cents: defaultPriceCents,
      description: description || null,
      is_active: isActive,
    })
    .eq("id", serviceId)
    .eq("tenant_id", selectedTenantId);

  if (error) {
    redirect(buildServicesUrl("error", `Dienstleistung konnte nicht aktualisiert werden: ${error.message}`));
  }

  revalidatePath("/services");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(buildServicesUrl("success", "Dienstleistung aktualisiert ✅"));
}

export async function toggleServiceActive(formData: FormData) {
  const { supabase, profile } = await requireUserProfile();
  const selectedTenantId = getSelectedTenantId(profile);

  if (!selectedTenantId) {
    redirect(buildServicesUrl("error", "Bitte zuerst einen Behandler/Tenant auswählen."));
  }

  const serviceId = String(formData.get("service_id") ?? "").trim();
  const nextActive = String(formData.get("next_active") ?? "0") === "1";

  if (!serviceId) {
    redirect(buildServicesUrl("error", "Dienstleistung konnte nicht zugeordnet werden."));
  }

  const { error } = await supabase
    .from("services")
    .update({ is_active: nextActive })
    .eq("id", serviceId)
    .eq("tenant_id", selectedTenantId);

  if (error) {
    redirect(buildServicesUrl("error", `Status konnte nicht geändert werden: ${error.message}`));
  }

  revalidatePath("/services");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(buildServicesUrl("success", nextActive ? "Dienstleistung aktiviert ✅" : "Dienstleistung deaktiviert ✅"));
}

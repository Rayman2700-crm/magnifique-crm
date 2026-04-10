"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
};

function buildSettingsUrl(input?: { success?: string | null; error?: string | null }) {
  const url = new URL("/einstellungen/mail", "http://local");
  const success = String(input?.success ?? "").trim();
  const error = String(input?.error ?? "").trim();
  if (success) url.searchParams.set("success", success);
  if (error) url.searchParams.set("error", error);
  return url.pathname + (url.search ? url.search : "");
}

async function requireTenantContext() {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, tenant_id, calendar_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const typedProfile = (profile ?? null) as UserProfileRow | null;
  const effectiveTenantId = await getEffectiveTenantId({
    role: typedProfile?.role ?? "PRACTITIONER",
    tenant_id: typedProfile?.tenant_id ?? null,
    calendar_tenant_id: typedProfile?.calendar_tenant_id ?? null,
  });

  return {
    admin,
    user,
    effectiveTenantId,
    role: String(typedProfile?.role ?? "PRACTITIONER").toUpperCase(),
  };
}

export async function saveTenantMailSettings(formData: FormData) {
  const { admin, effectiveTenantId } = await requireTenantContext();

  const tenantId = String(formData.get("tenant_id") ?? "").trim() || effectiveTenantId || "";
  const senderEmail = String(formData.get("email") ?? "").trim();
  const senderName = String(formData.get("mail_sender_name") ?? "").trim();
  const replyToEmail = String(formData.get("mail_reply_to_email") ?? "").trim();
  const isActive = String(formData.get("mail_is_active") ?? "off") === "on";

  if (!tenantId) {
    redirect(buildSettingsUrl({ error: "Kein aktiver Behandler gewählt." }));
  }

  if (!senderEmail) {
    redirect(buildSettingsUrl({ error: "Bitte eine Absender-E-Mail hinterlegen." }));
  }

  const { error } = await admin
    .from("tenants")
    .update({
      email: senderEmail,
      mail_sender_name: senderName || null,
      mail_reply_to_email: replyToEmail || null,
      mail_is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    redirect(buildSettingsUrl({ error: error.message ?? "Mail-Absender konnte nicht gespeichert werden." }));
  }

  revalidatePath("/einstellungen/mail");
  revalidatePath("/rechnungen");
  redirect(buildSettingsUrl({ success: "Mail-Absender gespeichert ✅" }));
}

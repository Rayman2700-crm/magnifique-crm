"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function deleteCustomerProfile(customerProfileId: string, formData: FormData) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const returnToRaw = String(formData.get("returnTo") ?? "").trim();

  function buildRedirectUrl(basePathWithQuery: string, key: "success" | "error", msg: string) {
    const u = new URL(basePathWithQuery || "/customers", "http://local");
    u.searchParams.delete("success");
    u.searchParams.delete("error");
    u.searchParams.set(key, msg);
    return u.pathname + (u.search ? u.search : "");
  }

  const baseReturnUrl = returnToRaw || "/customers";

  // ✅ Role prüfen
  const { data: profile, error: profErr } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profErr || !profile) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Kein Benutzerprofil gefunden."));
  }

  if (profile.role !== "ADMIN") {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Nur ADMIN darf Kunden löschen."));
  }

  // customer_profile laden
  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Kunde nicht gefunden: " + (cpErr?.message ?? "")));
  }

  // ✅ Safety: Wenn Termine existieren -> nicht löschen
  const { count: apptCount, error: apptErr } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", (cp as any).tenant_id)
    .eq("person_id", (cp as any).person_id);

  if (apptErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Konnte Termine nicht prüfen: " + apptErr.message));
  }

  if ((apptCount ?? 0) > 0) {
    redirect(
      buildRedirectUrl(
        baseReturnUrl,
        "error",
        "Kunde hat Termine. Bitte zuerst Termine löschen oder später Archivieren nutzen."
      )
    );
  }

  // ✅ Abhängigkeiten löschen (wenn vorhanden)
  await supabase.from("customer_notes").delete().eq("customer_profile_id", customerProfileId);
  await supabase.from("customer_photos").delete().eq("customer_profile_id", customerProfileId);
  await supabase.from("intake_forms").delete().eq("customer_profile_id", customerProfileId);

  // ✅ customer_profile löschen
  const { error: delErr } = await supabase.from("customer_profiles").delete().eq("id", customerProfileId);
  if (delErr) {
    redirect(buildRedirectUrl(baseReturnUrl, "error", "Kunde konnte nicht gelöscht werden: " + delErr.message));
  }

  redirect(buildRedirectUrl(baseReturnUrl, "success", "Kunde gelöscht ✅"));
}
"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}
function normalizePhone(v: string) {
  return v.replace(/\s+/g, "").trim();
}

export async function updateCustomer(customerProfileId: string, formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const birthdayRaw = String(formData.get("birthday") ?? "").trim(); // YYYY-MM-DD oder ""

  if (!fullName) {
    redirect(`/customers/${customerProfileId}/edit?error=${encodeURIComponent("Bitte Name eingeben")}`);
  }

  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // customer_profile -> person_id holen
  const { data: cp, error: cpErr } = await supabase
    .from("customer_profiles")
    .select("id, person_id")
    .eq("id", customerProfileId)
    .single();

  if (cpErr || !cp?.person_id) {
    redirect(`/customers/${customerProfileId}?error=${encodeURIComponent("Kunde nicht gefunden")}`);
  }

  const { error: updErr } = await supabase
    .from("persons")
    .update({
      full_name: fullName,
      email,
      phone,
      birthday: birthdayRaw || null,
    })
    .eq("id", cp.person_id);

  if (updErr) {
    redirect(
      `/customers/${customerProfileId}/edit?error=${encodeURIComponent(
        "Update fehlgeschlagen: " + updErr.message
      )}`
    );
  }

  redirect(`/customers/${customerProfileId}?success=${encodeURIComponent("Kunde gespeichert ✅")}`);
}
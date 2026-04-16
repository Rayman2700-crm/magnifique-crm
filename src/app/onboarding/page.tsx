import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { supabaseServer } from "@/lib/supabase/server";
import { completeOnboarding } from "./actions";

const DEFAULT_SMALL_BUSINESS_NOTICE = "Gemäß § 6 Abs. 1 Z 27 UStG wird keine Umsatzsteuer berechnet.";
const DEFAULT_FOOTER =
  "Vielen Dank für Ihren Besuch bei Magnifique Beauty Institut. Wir freuen uns, Sie bald wieder verwöhnen zu dürfen.";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const error = sp?.error ?? "";

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, avatar_path, onboarding_completed_at, tenant_id")
    .eq("user_id", user.id)
    .single();

  if (profile?.onboarding_completed_at) redirect("/dashboard");

  const { data: tenant } = profile?.tenant_id
    ? await supabase
        .from("tenants")
        .select("display_name, legal_name, iban, bic, bank_name, kleinunternehmer_text, invoice_prefix")
        .eq("id", profile.tenant_id)
        .single()
    : { data: null as any };

  const { data: settings } = profile?.tenant_id
    ? await supabase
        .from("tenant_settings")
        .select("tax_number, invoice_footer_text")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle()
    : { data: null as any };

  const { data: branding } = profile?.tenant_id
    ? await supabase
        .from("tenant_branding")
        .select("app_name")
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle()
    : { data: null as any };

  return (
    <main className="min-h-dvh bg-gradient-to-b from-black via-[#030303] to-[#050505] p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 text-white">
          <Logo size="md" />
          <h1 className="mt-5 text-2xl font-semibold">Pflicht-Onboarding abschließen</h1>
          <p className="mt-2 text-sm text-white/65">
            Erst wenn Avatar, Firmenlogo und Rechnungsdaten vollständig sind, wird der neue Tenant freigeschaltet.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-7">
          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          <form action={completeOnboarding} className="grid gap-6">
            <section className="grid gap-4 md:grid-cols-2">
              <StaticField label="Benutzer" value={profile?.full_name || user.email || "-"} />
              <StaticField label="Firma" value={tenant?.display_name || tenant?.legal_name || "-"} />
              <UploadField label="Avatar" name="avatar" help="Pflichtfeld. PNG, JPG oder WEBP bis 5 MB." />
              <UploadField label="Firmenlogo für Rechnungen" name="invoice_logo" help="Pflichtfeld. Wird später für Belege verwendet." />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Field label="App-/Firmenname" name="app_name" defaultValue={branding?.app_name || tenant?.display_name || ""} />
              <Field label="Rechnungspräfix" name="invoice_prefix" defaultValue={tenant?.invoice_prefix || ""} required help="z. B. RAD, RAL, ALE" />
              <Field label="IBAN" name="iban" defaultValue={tenant?.iban || ""} required />
              <Field label="BIC" name="bic" defaultValue={tenant?.bic || ""} />
              <Field label="Bankname" name="bank_name" defaultValue={tenant?.bank_name || ""} />
              <Field label="Steuernummer" name="tax_number" defaultValue={settings?.tax_number || ""} required />
            </section>

            <TextAreaField
              label="Kleinunternehmer-Hinweis"
              name="kleinunternehmer_text"
              defaultValue={tenant?.kleinunternehmer_text || DEFAULT_SMALL_BUSINESS_NOTICE}
              required
            />

            <TextAreaField
              label="Rechnungs-Footer"
              name="invoice_footer_text"
              defaultValue={settings?.invoice_footer_text || DEFAULT_FOOTER}
              required
            />

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Onboarding abschließen
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 text-sm text-white/80">
      <span className="font-medium">{label}</span>
      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white/80">{value}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  help,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-white/80">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
      />
      {help ? <span className="text-xs text-white/45">{help}</span> : null}
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm text-white/80">
      <span className="font-medium">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        required={required}
        rows={4}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
      />
    </label>
  );
}

function UploadField({ label, name, help }: { label: string; name: string; help?: string }) {
  return (
    <label className="grid gap-1 text-sm text-white/80">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        required
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-black"
      />
      {help ? <span className="text-xs text-white/45">{help}</span> : null}
    </label>
  );
}

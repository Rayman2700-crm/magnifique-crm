import { supabaseServer } from "@/lib/supabase/server";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";
import { saveTenantMailSettings } from "./actions";

type UserProfileRow = {
  role: string | null;
  tenant_id: string | null;
  calendar_tenant_id: string | null;
};

export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const success = typeof resolvedSearchParams.success === "string" ? resolvedSearchParams.success : "";
  const error = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : "";

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

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

  if (!effectiveTenantId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-white">
        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-100">
          Kein aktiver Behandler gewählt. Bitte zuerst einen Tenant auswählen.
        </div>
      </div>
    );
  }

  const { data: tenantRaw } = await supabase
    .from("tenants")
    .select("id, display_name, email, phone, mail_sender_name, mail_reply_to_email, mail_subject_template, mail_body_template, mail_is_active")
    .eq("id", effectiveTenantId)
    .maybeSingle();

  const tenant = (tenantRaw ?? null) as {
    id: string;
    display_name?: string | null;
    email?: string | null;
    phone?: string | null;
    mail_sender_name?: string | null;
    mail_reply_to_email?: string | null;
    mail_subject_template?: string | null;
    mail_body_template?: string | null;
    mail_is_active?: boolean | null;
  } | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white">
      <div>
        <div className="text-sm text-white/50">Einstellungen</div>
        <h1 className="mt-1 text-3xl font-extrabold">Mail-Absender</h1>
        <p className="mt-2 text-sm text-white/60">
          Hier pflegst du die Absenderdaten für den aktuell aktiven Behandler. Diese Werte werden im Versandmodul direkt für E-Mail-Belege verwendet.
        </p>
      </div>

      {success ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <form action={saveTenantMailSettings} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <input type="hidden" name="tenant_id" value={tenant?.id ?? effectiveTenantId} />

          <div className="grid gap-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Aktiver Behandler</div>
              <div className="mt-2 text-lg font-bold text-white">{tenant?.display_name || "Unbenannter Behandler"}</div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Absender-E-Mail</span>
              <input
                name="email"
                type="email"
                defaultValue={tenant?.email ?? ""}
                placeholder="z. B. radu@deinedomain.at"
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-white/30"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Absendername</span>
              <input
                name="mail_sender_name"
                defaultValue={tenant?.mail_sender_name ?? tenant?.display_name ?? ""}
                placeholder="z. B. Radu Craus"
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-white/30"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Reply-To E-Mail</span>
              <input
                name="mail_reply_to_email"
                type="email"
                defaultValue={tenant?.mail_reply_to_email ?? tenant?.email ?? ""}
                placeholder="optional, sonst wird die Absenderadresse verwendet"
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-white/30"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-sm font-semibold text-white">Verfügbare Platzhalter</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
                {["{customer_name}", "{receipt_number}", "{amount}", "{payment_method}", "{provider_name}"].map((token) => (
                  <span key={token} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {token}
                  </span>
                ))}
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Betreff-Vorlage</span>
              <input
                name="mail_subject_template"
                defaultValue={tenant?.mail_subject_template ?? "Beleg {receipt_number} – {provider_name}"}
                placeholder="z. B. Beleg {receipt_number} – {provider_name}"
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-white/30"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-white">Text-Vorlage</span>
              <textarea
                name="mail_body_template"
                defaultValue={
                  tenant?.mail_body_template ??
                  "Hallo {customer_name},\n\nanbei bzw. zur Ansicht dein Beleg {receipt_number}.\nBetrag: {amount}\nZahlungsart: {payment_method}\n\nVielen Dank für deinen Besuch.\n\nLiebe Grüße\n{provider_name}"
                }
                placeholder="Mailtext mit Platzhaltern"
                rows={10}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/30"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">E-Mail-Versand aktiv</div>
                <div className="mt-1 text-xs text-white/50">Wenn deaktiviert, können für diesen Behandler keine Belege per Mail versendet werden.</div>
              </div>
              <input
                name="mail_is_active"
                type="checkbox"
                defaultChecked={tenant?.mail_is_active !== false}
                className="h-5 w-5 rounded border-white/20 bg-transparent"
              />
            </label>

            <div className="pt-2">
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Mail-Absender speichern
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Aktueller Stand</div>
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Studio / Behandler</div>
                <div className="mt-1 font-semibold text-white">{tenant?.display_name || "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Absender-E-Mail</div>
                <div className="mt-1 font-semibold text-white">{tenant?.email || "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Absendername</div>
                <div className="mt-1 font-semibold text-white">{tenant?.mail_sender_name || tenant?.display_name || "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Reply-To</div>
                <div className="mt-1 font-semibold text-white">{tenant?.mail_reply_to_email || tenant?.email || "—"}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Betreff-Vorlage</div>
                <div className="mt-1 font-semibold text-white">{tenant?.mail_subject_template || "Beleg {receipt_number} – {provider_name}"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Text-Vorlage</div>
                <div className="mt-1 whitespace-pre-wrap font-semibold text-white/85">
                  {tenant?.mail_body_template || "Hallo {customer_name},\n\nanbei bzw. zur Ansicht dein Beleg {receipt_number}.\nBetrag: {amount}\nZahlungsart: {payment_method}\n\nVielen Dank für deinen Besuch.\n\nLiebe Grüße\n{provider_name}"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-white/45">Versandstatus</div>
                <div className="mt-1 font-semibold text-white">{tenant?.mail_is_active !== false ? "Aktiv" : "Deaktiviert"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-4 text-sm text-sky-100">
            Diese Seite steuert direkt die Werte aus der <span className="font-semibold">tenants</span>-Tabelle, die dein Versandmodul bereits für E-Mail-Belege verwendet.
          </div>
        </div>
      </div>
    </div>
  );
}

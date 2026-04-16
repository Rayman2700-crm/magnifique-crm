import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { registerPractitioner } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const error = sp?.error ?? "";

  return (
    <main className="min-h-dvh bg-gradient-to-b from-black via-[#030303] to-[#050505] p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="text-white">
            <Logo size="md" />
            <p className="mt-2 text-sm text-white/60">Neuen Behandler mit eigenem Tenant anlegen.</p>
          </div>
          <Link href="/login" className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline">
            Zurück zum Login
          </Link>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm md:p-7">
          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          <form action={registerPractitioner} className="grid gap-5">
            <section className="grid gap-4 md:grid-cols-2">
              <Field label="Vorname" name="first_name" required />
              <Field label="Nachname" name="last_name" required />
              <Field label="E-Mail" name="email" type="email" required />
              <Field label="Telefon" name="phone" type="tel" />
              <Field label="Passwort" name="password" type="password" required help="Mindestens 8 Zeichen" />
              <Field label="Land" name="country" defaultValue="Österreich" required />
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Field label="Firmenname / Anzeigename" name="company_name" required />
              <Field label="Rechtlicher Name" name="legal_name" help="Falls abweichend vom Firmennamen" />
              <div className="md:col-span-2">
                <Field label="Rechnungsadresse Zeile 1" name="address_line1" required />
              </div>
              <div className="md:col-span-2">
                <Field label="Rechnungsadresse Zeile 2" name="address_line2" />
              </div>
              <Field label="PLZ" name="zip" required />
              <Field label="Ort" name="city" required />
            </section>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
              Nach dem Absenden wird der Account erstellt und eine Bestätigungs-Mail verschickt. Nach Klick auf den Bestätigungslink
              landet der neue Benutzer direkt im Pflicht-Onboarding für Avatar, Firmenlogo, IBAN, Steuernummer und Rechnungseinstellungen.
            </div>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Registrieren und Bestätigungs-Mail senden
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  help,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1 text-sm text-white/80">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
      />
      {help ? <span className="text-xs text-white/45">{help}</span> : null}
    </label>
  );
}

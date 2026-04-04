import Link from "next/link";
import { saveCustomerIntake } from "../actions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Person = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
};

type IntakeRow = {
  id: string;
  created_at: string | null;
  signed_at: string | null;
  status: string | null;
  answers_json: Record<string, any> | null;
};

type CustomerProfileBase = {
  id: string;
  person_id: string | null;
};

function readAnswer(row: IntakeRow | null, key: string) {
  const source = row?.answers_json;
  if (!source || typeof source !== "object") return "";
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readBool(row: IntakeRow | null, key: string) {
  const source = row?.answers_json;
  if (!source || typeof source !== "object") return false;
  return Boolean(source[key]);
}

function readYesNo(row: IntakeRow | null, key: string) {
  const source = row?.answers_json;
  if (!source || typeof source !== "object") return "";
  const value = source[key];
  return value === "yes" || value === "no" ? value : "";
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDateInputValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function splitName(fullName?: string | null) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
  };
}

function yesNoField(
  row: IntakeRow | null,
  key: string,
  label: string
) {
  const value = readYesNo(row, key);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-sm text-white/90">{label}</div>
      <div className="mt-3 flex items-center gap-5">
        <label className="inline-flex items-center gap-2 text-sm text-white/85">
          <input
            type="radio"
            name={key}
            value="yes"
            defaultChecked={value === "yes"}
            className="h-4 w-4 border-white/20 bg-black/30"
          />
          <span>Ja</span>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-white/85">
          <input
            type="radio"
            name={key}
            value="no"
            defaultChecked={value === "no"}
            className="h-4 w-4 border-white/20 bg-black/30"
          />
          <span>Nein</span>
        </label>
      </div>
    </div>
  );
}

export default async function CustomerIntakePage({
  params,
  searchParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { error?: string } | Promise<{ error?: string }>;
}) {
  const p = await params;
  const sp = searchParams ? await searchParams : undefined;
  const customerProfileId = p.id;

  const supabase = supabaseAdmin();

  const { data: customerProfile } = await supabase
    .from("customer_profiles")
    .select("id, person_id")
    .eq("id", customerProfileId)
    .maybeSingle<CustomerProfileBase>();

  if (!customerProfile?.person_id) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-red-200">
          Kundenprofil nicht gefunden.
        </div>
      </main>
    );
  }

  const [{ data: person }, { data: intakeLatest }] = await Promise.all([
    supabase
      .from("persons")
      .select("id, full_name, phone, email, birthday")
      .eq("id", customerProfile.person_id)
      .maybeSingle<Person>(),
    supabase
      .from("intake_forms")
      .select("id, created_at, signed_at, status, answers_json")
      .eq("customer_profile_id", customerProfileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<IntakeRow>(),
  ]);

  const status = String(intakeLatest?.status ?? "").toUpperCase();
  const { firstName, lastName } = splitName(person?.full_name);

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 xl:p-8">
      <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <CardContent className="p-5 md:p-7">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                Clientique Fragebogen zur Erstbehandlung
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                {person?.full_name || "Kunde"}
              </h1>
              <div className="mt-2 text-sm text-[var(--text-muted)]">
                Status: {status === "SIGNED" ? "Ausgefüllt" : status === "DRAFT" ? "In Bearbeitung" : "Nicht ausgefüllt"}
              </div>
              <div className="mt-1 text-sm text-white/45">
                Letzte Änderung: {fmtDateTime(intakeLatest?.signed_at || intakeLatest?.created_at)}
              </div>
            </div>

            <Link href={`/customers/${customerProfileId}`}>
              <Button variant="secondary">Zurück zum Kunden</Button>
            </Link>
          </div>

          {sp?.error ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {sp.error}
            </div>
          ) : null}

          <form action={saveCustomerIntake.bind(null, customerProfileId)} className="mt-6 space-y-6">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 md:p-5">
              <div className="text-sm leading-6 text-white/80">
                Sehr geehrte Kundin, sehr geehrter Kunde, bitte beantworten Sie alle Fragen sorgfältig.
                Ihre Angaben helfen dabei, die Behandlung sicher und passend durchzuführen.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-white/80">Name</label>
                <input
                  name="last_name"
                  defaultValue={readAnswer(intakeLatest ?? null, "last_name") || lastName}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Nachname"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Vorname</label>
                <input
                  name="first_name"
                  defaultValue={readAnswer(intakeLatest ?? null, "first_name") || firstName}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Vorname"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Straße, Hausnummer</label>
                <input
                  name="street"
                  defaultValue={readAnswer(intakeLatest ?? null, "street")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Straße und Hausnummer"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">PLZ Wohnort</label>
                <input
                  name="postal_city"
                  defaultValue={readAnswer(intakeLatest ?? null, "postal_city")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="PLZ und Ort"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Geburtsdatum</label>
                <input
                  type="date"
                  name="birth_date"
                  defaultValue={readAnswer(intakeLatest ?? null, "birth_date") || formatDateInputValue(person?.birthday)}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Telefon</label>
                <input
                  name="phone"
                  defaultValue={readAnswer(intakeLatest ?? null, "phone") || person?.phone || ""}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Telefon"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Mobil</label>
                <input
                  name="mobile"
                  defaultValue={readAnswer(intakeLatest ?? null, "mobile")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Mobilnummer"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">E-Mail</label>
                <input
                  name="email"
                  defaultValue={readAnswer(intakeLatest ?? null, "email") || person?.email || ""}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="E-Mail"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Krankenkasse</label>
                <input
                  name="health_insurance"
                  defaultValue={readAnswer(intakeLatest ?? null, "health_insurance")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Krankenkasse"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Hausarzt</label>
                <input
                  name="family_doctor"
                  defaultValue={readAnswer(intakeLatest ?? null, "family_doctor")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Hausarzt"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {yesNoField(intakeLatest ?? null, "first_foot_care", "Sind Sie zum ersten Mal bei einer Fußpflege?")}
              {yesNoField(intakeLatest ?? null, "pacemaker", "Tragen Sie einen Herzschrittmacher?")}
              {yesNoField(intakeLatest ?? null, "diabetic", "Sind Sie Diabetiker?")}
              {yesNoField(intakeLatest ?? null, "infectious_disease", "Leiden Sie an Infektionserkrankungen wie z. B. Hepatitis?")}
              {yesNoField(intakeLatest ?? null, "rheumatic", "Sind Sie Rheumatiker?")}
              {yesNoField(intakeLatest ?? null, "foot_operations", "Liegen Fußoperationen vor?")}
              {yesNoField(intakeLatest ?? null, "blood_thinners", "Nehmen Sie blutverdünnende Mittel ein?")}
              {yesNoField(intakeLatest ?? null, "varicose_veins", "Haben Sie Krampfadern?")}
              {yesNoField(intakeLatest ?? null, "circulation_disorders", "Leiden Sie an Durchblutungsstörungen?")}
              {yesNoField(intakeLatest ?? null, "thrombosis_risk", "Besteht bei Ihnen Thrombosegefahr?")}
              {yesNoField(intakeLatest ?? null, "high_blood_pressure", "Leiden Sie unter Bluthochdruck?")}
              {yesNoField(intakeLatest ?? null, "stand_walk_a_lot", "Laufen oder stehen Sie viel im Beruf oder privat?")}
              {yesNoField(intakeLatest ?? null, "heart_disease", "Liegen Herzerkrankungen vor?")}
              {yesNoField(intakeLatest ?? null, "tetanus_vaccinated", "Sind Sie gegen Tetanus geimpft?")}
            </div>

            <div>
              <label className="text-xs text-white/80">Bestehen Allergien? Wenn ja, auf welche Substanzen?</label>
              <textarea
                name="allergies"
                rows={3}
                defaultValue={readAnswer(intakeLatest ?? null, "allergies")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="z. B. Duftstoffe, Latex, Pflaster, Cremes"
              />
            </div>

            <div>
              <label className="text-xs text-white/80">Medikamente / zusätzliche medizinische Hinweise</label>
              <textarea
                name="medications"
                rows={4}
                defaultValue={readAnswer(intakeLatest ?? null, "medications")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="z. B. Blutverdünner, Antibiotika, sonstige Hinweise"
              />
            </div>

            <div>
              <label className="text-xs text-white/80">Zusätzliche Notiz</label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={readAnswer(intakeLatest ?? null, "notes")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="Freitext für Anamnese, Wünsche oder Besonderheiten"
              />
            </div>

            <div className="grid gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="text-sm leading-6 text-white/80">
                Die Risiken einer Behandlung sind erfahrungsgemäß gering. Alle Fragen wurden nach bestem Wissen beantwortet.
              </div>

              <label className="flex items-start gap-3 text-sm text-white/85">
                <input
                  type="checkbox"
                  name="consent_treatment"
                  defaultChecked={readBool(intakeLatest ?? null, "consent_treatment")}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                />
                <span>Ich bestätige, dass ich die Behandlung freiwillig wünsche und die Angaben nach bestem Wissen gemacht habe.</span>
              </label>

              <label className="flex items-start gap-3 text-sm text-white/85">
                <input
                  type="checkbox"
                  name="consent_privacy"
                  defaultChecked={readBool(intakeLatest ?? null, "consent_privacy")}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                />
                <span>Ich stimme der Speicherung meiner Angaben für Dokumentation und Behandlung zu.</span>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-white/80">Ort, Datum</label>
                <input
                  name="place_date"
                  defaultValue={readAnswer(intakeLatest ?? null, "place_date")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="z. B. Wien, 28.02.2026"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Name als Unterschrift</label>
                <input
                  name="signature_name"
                  defaultValue={readAnswer(intakeLatest ?? null, "signature_name") || person?.full_name || ""}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="Vor- und Nachname eingeben"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
              <div className="text-sm text-white/45">
                Mit Speichern wird der Fragebogen als ausgefüllt markiert.
              </div>
              <Button type="submit">Fragebogen speichern</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

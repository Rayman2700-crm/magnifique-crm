import Link from "next/link";
import { saveCustomerIntake } from "../actions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Person = {
  id: string;
  full_name: string | null;
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
      .select("id, full_name")
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

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6 xl:p-8">
      <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <CardContent className="p-5 md:p-7">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                Clientique Fragebogen
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
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-white/80">Allergien</label>
                <textarea
                  name="allergies"
                  rows={4}
                  defaultValue={readAnswer(intakeLatest ?? null, "allergies")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="z. B. Duftstoffe, Latex, Kleber"
                />
              </div>

              <div>
                <label className="text-xs text-white/80">Medikamente</label>
                <textarea
                  name="medications"
                  rows={4}
                  defaultValue={readAnswer(intakeLatest ?? null, "medications")}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  placeholder="z. B. Blutverdünner, Antibiotika"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-white/80">Erkrankungen / Hinweise</label>
              <textarea
                name="conditions"
                rows={4}
                defaultValue={readAnswer(intakeLatest ?? null, "conditions")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="z. B. Diabetes, Hauterkrankungen, Schwangerschaft"
              />
            </div>

            <div>
              <label className="text-xs text-white/80">Zusätzliche Notiz</label>
              <textarea
                name="notes"
                rows={5}
                defaultValue={readAnswer(intakeLatest ?? null, "notes")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="Freitext für Anamnese, Wünsche oder Besonderheiten"
              />
            </div>

            <div className="grid gap-3 rounded-[24px] border border-white/10 bg-black/20 p-4">
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

            <div>
              <label className="text-xs text-white/80">Name als Unterschrift</label>
              <input
                name="signature_name"
                defaultValue={readAnswer(intakeLatest ?? null, "signature_name")}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                placeholder="Vor- und Nachname eingeben"
              />
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

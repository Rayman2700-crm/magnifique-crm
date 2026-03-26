"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createCustomer } from "./actions";

function fieldClassName(disabled: boolean) {
  return [
    "mt-1 w-full rounded-xl border px-3 py-2",
    "bg-transparent text-white placeholder:text-white/40 border-white/15",
    "focus:outline-none focus:ring-2 focus:ring-white/20",
    disabled ? "opacity-50 cursor-not-allowed" : "",
  ].join(" ");
}

export default function NewCustomerPage() {
  const searchParams = useSearchParams();

  const preName = searchParams.get("name") ?? "";
  const prePhone = searchParams.get("phone") ?? "";
  const appointmentId = searchParams.get("appointmentId") ?? "";
  const tenantId = searchParams.get("tenantId") ?? "";
  const returnTo = searchParams.get("returnTo") ?? "";
  const error = searchParams.get("error");
  const details = searchParams.get("details");

  const [addToWaitlist, setAddToWaitlist] = useState(false);

  const backHref = useMemo(() => {
    if (returnTo === "dashboard") return "/dashboard";
    return "/customers";
  }, [returnTo]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">Neuer Kunde</h1>
        <Link className="rounded-xl border border-white/15 px-3 py-2 text-white hover:bg-white/5" href={backHref}>
          Zurück
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {decodeURIComponent(error)}
        </div>
      )}

      {details && (
        <div className="mt-2 text-xs text-white/50">
          Details: {decodeURIComponent(details)}
        </div>
      )}

      <form action={createCustomer} className="mt-6 space-y-6">
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium text-white">Name *</label>
              <input
                name="full_name"
                required
                defaultValue={preName}
                className={fieldClassName(false)}
                placeholder="Vorname Nachname"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white">Telefon</label>
              <input
                name="phone"
                defaultValue={prePhone}
                className={fieldClassName(false)}
                placeholder="+43..."
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white">E-Mail</label>
              <input
                name="email"
                type="email"
                className={fieldClassName(false)}
                placeholder="kunde@email.com"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white">Geburtsdatum</label>
              <input name="birthday" type="date" className={fieldClassName(false)} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">Direkt auf Warteliste setzen</div>
              <p className="mt-1 text-sm text-white/65">
                Für neue Anrufer ohne freien Termin. Der Eintrag wird direkt beim Speichern mit angelegt.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAddToWaitlist((value) => !value)}
              aria-pressed={addToWaitlist}
              className={[
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                addToWaitlist
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/15 text-white hover:bg-white/5",
              ].join(" ")}
            >
              {addToWaitlist ? "Aktiv" : "Aktivieren"}
            </button>
          </div>

          <input type="hidden" name="create_waitlist_entry" value={addToWaitlist ? "1" : "0"} />

          <div
            className={[
              "mt-4 rounded-3xl border p-4 transition",
              addToWaitlist
                ? "border-white/10 bg-white/5"
                : "border-white/10 bg-white/5 opacity-60",
            ].join(" ")}
          >
            <div className="mb-4 text-sm font-medium text-white/80">Wartelisten-Details</div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-white">Behandlung</label>
                <input
                  name="waitlist_service_title"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                  placeholder="z. B. PMU Brows"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-white">Bevorzugte Tage</label>
                <input
                  name="waitlist_preferred_days"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                  placeholder="z. B. Mo, Di, Fr oder flexibel"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white">Zeit von</label>
                <input
                  name="waitlist_time_from"
                  type="time"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white">Zeit bis</label>
                <input
                  name="waitlist_time_to"
                  type="time"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white">Priorität</label>
                <select
                  name="waitlist_priority"
                  defaultValue="normal"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                >
                  <option value="low">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-white">Wann hat der Kunde angefragt?</label>
                <select
                  name="waitlist_requested_recently"
                  defaultValue="today"
                  disabled={!addToWaitlist}
                  className={fieldClassName(!addToWaitlist)}
                >
                  <option value="today">Heute angefragt</option>
                  <option value="yesterday">Gestern angefragt</option>
                  <option value="none">Kein Zeitbezug</option>
                </select>
              </div>

              <label
                className={[
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                  addToWaitlist ? "border-white/10 text-white" : "border-white/10 text-white/50 opacity-50",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  name="waitlist_short_notice_ok"
                  value="1"
                  disabled={!addToWaitlist}
                  className="h-4 w-4"
                />
                Kann kurzfristig kommen
              </label>

              <label
                className={[
                  "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
                  addToWaitlist ? "border-white/10 text-white" : "border-white/10 text-white/50 opacity-50",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  name="waitlist_reachable_today"
                  value="1"
                  disabled={!addToWaitlist}
                  className="h-4 w-4"
                />
                Heute gut erreichbar
              </label>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-white">Notiz</label>
                <textarea
                  name="waitlist_notes"
                  disabled={!addToWaitlist}
                  className={[fieldClassName(!addToWaitlist), "min-h-28"].join(" ")}
                  placeholder="z. B. kurzfristig, vormittags, bitte zuerst WhatsApp"
                />
              </div>
            </div>

            <p className="mt-4 text-xs text-white/50">
              Behandlerwunsch wird automatisch auf den aktuell gewählten Behandler / Tenant gesetzt.
            </p>
          </div>
        </section>

        <button className="rounded-xl bg-white px-4 py-2 font-medium text-black">Speichern</button>
      </form>

      <p className="mt-6 text-xs text-white/45">
        Hinweis: Person ist tenant-übergreifend, aber das Kundenprofil wird pro Behandler erstellt.
      </p>
    </main>
  );
}

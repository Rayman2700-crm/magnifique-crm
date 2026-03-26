import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { updateAppointment } from "../../actions";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function parseLines(notesInternal: string | null) {
  return (notesInternal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readLineValue(lines: string[], prefix: string) {
  const line = lines.find((entry) =>
    entry.toLowerCase().startsWith(prefix.toLowerCase())
  );
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function parseTitle(notesInternal: string | null) {
  return readLineValue(parseLines(notesInternal), "Titel:");
}

function parseNote(notesInternal: string | null) {
  return readLineValue(parseLines(notesInternal), "Notiz:");
}

function parseBuffer(notesInternal: string | null) {
  const raw = readLineValue(parseLines(notesInternal), "Buffer:");
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function parseStatus(notesInternal: string | null): AppointmentStatus {
  const raw = readLineValue(parseLines(notesInternal), "Status:").toLowerCase();

  if (raw === "completed") return "completed";
  if (raw === "cancelled") return "cancelled";
  if (raw === "no_show") return "no_show";
  return "scheduled";
}

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params:
    | { id: string; appointmentId: string }
    | Promise<{ id: string; appointmentId: string }>;
  searchParams?: { error?: string } | Promise<{ error?: string }>;
}) {
  const p = await params;
  const customerProfileId = p.id;
  const appointmentId = p.appointmentId;

  const sp = searchParams ? await searchParams : undefined;

  const supabase = await supabaseServer();

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("id, person:persons(full_name)")
    .eq("id", customerProfileId)
    .single();

  const customerName = (cp as any)?.person?.full_name ?? "-";

  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select("id, start_at, end_at, notes_internal")
    .eq("id", appointmentId)
    .single();

  if (apptErr || !appt) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Termin nicht gefunden</h1>
          <Link
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white hover:bg-white/10"
            href={`/customers/${customerProfileId}`}
          >
            Zurück
          </Link>
        </div>
      </main>
    );
  }

  const startIso = (appt as any).start_at as string | null;
  const endIso = (appt as any).end_at as string | null;

  const duration =
    startIso && endIso
      ? Math.max(
          5,
          Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
        )
      : 60;

  const notesInternal = (appt as any).notes_internal as string | null;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Termin ändern</h1>
          <p className="text-sm text-white/60">Kunde: {customerName}</p>
        </div>

        <Link
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white hover:bg-white/10"
          href={`/customers/${customerProfileId}`}
        >
          Zurück
        </Link>
      </div>

      {sp?.error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <form
        className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4"
        action={updateAppointment.bind(null, customerProfileId, appointmentId)}
      >
        <div>
          <label className="text-sm font-medium text-white/85">Titel</label>
          <input
            name="title"
            defaultValue={parseTitle(notesInternal)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            placeholder="z. B. Raluca med."
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">Interne Notiz</label>
          <textarea
            name="notes"
            defaultValue={parseNote(notesInternal)}
            className="mt-1 min-h-[110px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            placeholder="Notiz…"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">Status</label>
          <select
            name="status"
            defaultValue={parseStatus(notesInternal)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
          >
            <option value="scheduled">Geplant</option>
            <option value="completed">Gekommen</option>
            <option value="cancelled">Abgesagt</option>
            <option value="no_show">Nicht gekommen</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-white/85">Start</label>
            <input
              name="start"
              type="datetime-local"
              defaultValue={toDatetimeLocal(startIso)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/85">Dauer (Min)</label>
            <input
              name="duration"
              type="number"
              min={5}
              defaultValue={duration}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/85">Buffer (Min)</label>
            <input
              name="buffer"
              type="number"
              min={0}
              defaultValue={parseBuffer(notesInternal)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>
        </div>

        <button className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
          Termin speichern
        </button>
      </form>
    </main>
  );
}
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { createAppointment } from "./actions";

function safeDecode(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function NewAppointmentPage({
  params,
  searchParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?:
    | {
        error?: string;
        title?: string;
        notes?: string;
        start?: string;
        duration?: string;
        buffer?: string;
        status?: string;
      }
    | Promise<{
        error?: string;
        title?: string;
        notes?: string;
        start?: string;
        duration?: string;
        buffer?: string;
        status?: string;
      }>;
}) {
  const { id: customerProfileId } = await params;
  const sp = searchParams ? await searchParams : undefined;

  const supabase = await supabaseServer();

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("id, persons(full_name)")
    .eq("id", customerProfileId)
    .single();

  const personObj = Array.isArray((cp as any)?.persons) ? (cp as any)?.persons?.[0] : (cp as any)?.persons;

  const customerName = personObj?.full_name ?? "-";
  const initialTitle = safeDecode(sp?.title) || "";
  const initialNotes = safeDecode(sp?.notes) || "";
  const initialStart = safeDecode(sp?.start) || "";
  const initialDuration = Number(sp?.duration ?? 60);
  const initialBuffer = Number(sp?.buffer ?? 0);
  const initialStatus =
    sp?.status === "completed" || sp?.status === "cancelled" || sp?.status === "no_show" || sp?.status === "scheduled"
      ? sp.status
      : "scheduled";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Neuer Termin</h1>
          <p className="text-sm text-white/60">Kunde: {customerName}</p>
        </div>

        <Link
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white hover:bg-white/10"
          href={`/customers/${customerProfileId}`}
        >
          Zurück
        </Link>
      </div>

      {sp?.error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <form
        className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4"
        action={createAppointment.bind(null, customerProfileId)}
      >
        <div>
          <label className="text-sm font-medium text-white/85">Titel (z. B. Kunde + Service)</label>
          <input
            name="title"
            defaultValue={initialTitle}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder:text-white/35"
            placeholder="z. B. Maria Muster – Fußpflege"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">Interne Notiz</label>
          <textarea
            name="notes"
            defaultValue={initialNotes}
            className="mt-1 min-h-[100px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder:text-white/35"
            placeholder="Notizen..."
          />
        </div>

        <div>
          <label className="text-sm font-medium text-white/85">Status</label>
          <select
            name="status"
            defaultValue={initialStatus}
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
              defaultValue={initialStart}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/85">Dauer (Min)</label>
            <input
              name="duration"
              type="number"
              min={5}
              defaultValue={Number.isFinite(initialDuration) && initialDuration > 0 ? initialDuration : 60}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/85">Buffer (Min)</label>
            <input
              name="buffer"
              type="number"
              min={0}
              defaultValue={Number.isFinite(initialBuffer) && initialBuffer >= 0 ? initialBuffer : 0}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
            />
          </div>
        </div>

        <button className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">Termin erstellen</button>
      </form>

      <div className="mt-4 text-xs text-white/45">
        Voraussetzung: Standard-Kalender muss unter{" "}
        <Link className="underline" href="/calendar">
          /calendar
        </Link>{" "}
        gespeichert sein.
      </div>
    </main>
  );
}

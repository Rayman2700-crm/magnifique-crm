"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateAppointmentFromCalendar } from "@/app/calendar/actions";

type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function parseLines(notesInternal: string | null) {
  return (notesInternal ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readLineValue(lines: string[], prefix: string) {
  const line = lines.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return "";
  return line.slice(prefix.length).trim();
}

function parseTitle(notesInternal: string | null) {
  return readLineValue(parseLines(notesInternal), "Titel:") || "Termin";
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

function calcDuration(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) return 60;
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 60;
  return Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000) || 60);
}

export default function EditAppointmentSlideover({
  mounted,
  visible,
  shown,
  onClose,
  appointmentId,
  startAt,
  endAt,
  notesInternal,
}: {
  mounted: boolean;
  visible: boolean;
  shown: boolean;
  onClose: () => void;
  appointmentId: string;
  startAt: string | null;
  endAt: string | null;
  notesInternal: string | null;
}) {
  const initialTitle = useMemo(() => parseTitle(notesInternal), [notesInternal]);
  const initialNotes = useMemo(() => parseNote(notesInternal), [notesInternal]);
  const initialStatus = useMemo(() => parseStatus(notesInternal), [notesInternal]);
  const initialBuffer = useMemo(() => parseBuffer(notesInternal), [notesInternal]);
  const initialDuration = useMemo(() => calcDuration(startAt, endAt), [startAt, endAt]);

  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<AppointmentStatus>(initialStatus);
  const [startValue, setStartValue] = useState(toDatetimeLocal(startAt));
  const [duration, setDuration] = useState(String(initialDuration));
  const [buffer, setBuffer] = useState(String(initialBuffer));
  const [returnTo, setReturnTo] = useState("");

  useEffect(() => {
    if (!visible) return;

    setTitle(parseTitle(notesInternal));
    setNotes(parseNote(notesInternal));
    setStatus(parseStatus(notesInternal));
    setStartValue(toDatetimeLocal(startAt));
    setDuration(String(calcDuration(startAt, endAt)));
    setBuffer(String(parseBuffer(notesInternal)));

    if (typeof window !== "undefined") {
      setReturnTo(window.location.pathname + window.location.search);
    }
  }, [visible, notesInternal, startAt, endAt]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, onClose]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate" }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.92) 0%, rgba(10,10,10,0.92) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Kalender</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
              Termin bearbeiten
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
              Änderungen direkt im Kundenprofil speichern
            </div>
          </div>

          <Button variant="secondary" onClick={onClose}>
            Schließen
          </Button>
        </div>

        <div style={{ padding: 16, overflow: "auto" }}>
          <form action={updateAppointmentFromCalendar.bind(null, appointmentId)} className="space-y-4">
            <input type="hidden" name="returnTo" value={returnTo} />

            <div>
              <label className="text-sm font-medium text-white/85">Titel</label>
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                placeholder="z. B. PMU Brows Angebot"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white/85">Interne Notiz</label>
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 min-h-[110px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                placeholder="Notiz…"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-white/85">Status</label>
              <select
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                style={{ colorScheme: "dark", backgroundColor: "rgba(0,0,0,0.30)" }}
              >
                <option value="scheduled" className="bg-[#0b0b0c] text-white">Geplant</option>
                <option value="completed" className="bg-[#0b0b0c] text-white">Gekommen</option>
                <option value="cancelled" className="bg-[#0b0b0c] text-white">Abgesagt</option>
                <option value="no_show" className="bg-[#0b0b0c] text-white">Nicht gekommen</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-white/85">Start</label>
                <input
                  name="start"
                  type="datetime-local"
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Dauer (Min)</label>
                <input
                  name="duration"
                  type="number"
                  min={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white/85">Buffer (Min)</label>
                <input
                  name="buffer"
                  type="number"
                  min={0}
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15"
                />
              </div>
            </div>

            <Button type="submit" className="w-full">
              Termin speichern
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

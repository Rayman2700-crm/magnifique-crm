"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addWaitlistEntryQuick,
  updateWaitlistStatusQuick,
} from "@/app/calendar/actions";

type WaitlistItem = {
  id: string;
  customerProfileId: string | null;
  tenantId: string;
  tenantName: string;
  customerName: string;
  phone: string | null;
  serviceTitle: string | null;
  priority: string | null;
  shortNoticeOk: boolean;
  reachableToday: boolean;
  requestedRecentlyAt: string | null;
  createdAt: string;
  profileExists: boolean;
};

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function recentLabel(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d >= today) return "Heute angefragt";
  if (d >= yesterday) return "Gestern angefragt";
  return "Zuletzt angefragt";
}

function priorityLabel(value: string | null) {
  const v = String(value ?? "").toLowerCase();
  if (v === "high" || v === "urgent") return "Dringend";
  if (v === "low") return "Flexibel";
  return "Normal";
}

function normalizeWhatsAppPhone(phone: string | null) {
  if (!phone) return null;
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p.replace(/\D/g, "") || null;
}

function AddWaitlistCard({
  onDone,
}: {
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [shortNoticeOk, setShortNoticeOk] = useState(true);
  const [reachableToday, setReachableToday] = useState(true);
  const [requestedRecently, setRequestedRecently] = useState("today");

  const runSubmit = () => {
    startTransition(async () => {
      const result = await addWaitlistEntryQuick({
        fullName,
        phone,
        serviceTitle,
        priority,
        shortNoticeOk,
        reachableToday,
        requestedRecently,
      });

      if (!result?.ok) {
        window.alert(result?.error ?? "Wartelisten-Eintrag konnte nicht erstellt werden.");
        return;
      }

      setFullName("");
      setPhone("");
      setServiceTitle("");
      setPriority("normal");
      setShortNoticeOk(true);
      setReachableToday(true);
      setRequestedRecently("today");
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="mb-5 rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.06] p-5">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-base font-semibold text-white">
            Kunde direkt zur Warteliste hinzufügen
          </div>
          <div className="mt-1 text-sm text-white/60">
            Bestehende Kunden werden automatisch über die Telefonnummer erkannt.
            Wenn noch kein Profil existiert, wird es direkt mit angelegt.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-white/80">Name oder Kundename</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Vorname Nachname"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/80">Telefon</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+43..."
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/80">Behandlung</label>
            <input
              value={serviceTitle}
              onChange={(e) => setServiceTitle(e.target.value)}
              placeholder="z. B. PMU Brows"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/80">Priorität</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              <option value="low">Niedrig</option>
              <option value="normal">Normal</option>
              <option value="high">Hoch</option>
              <option value="urgent">Dringend</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-white/80">Anfragezeitpunkt</label>
            <select
              value={requestedRecently}
              onChange={(e) => setRequestedRecently(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-white/15"
            >
              <option value="today">Heute angefragt</option>
              <option value="yesterday">Gestern angefragt</option>
              <option value="none">Kein Zeitbezug</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
            <input
              type="checkbox"
              checked={shortNoticeOk}
              onChange={(e) => setShortNoticeOk(e.target.checked)}
              className="h-4 w-4"
            />
            Kann kurzfristig kommen
          </label>

          <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
            <input
              type="checkbox"
              checked={reachableToday}
              onChange={(e) => setReachableToday(e.target.checked)}
              className="h-4 w-4"
            />
            Heute gut erreichbar
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={runSubmit}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/15 px-5 text-sm font-semibold text-emerald-200 transition hover:scale-[1.01] hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Speichert..." : "Zur Warteliste hinzufügen"}
          </button>

          <div className="text-xs text-white/45">
            Name oder Telefon reichen aus. Mit Telefonnummer wird ein bestehender Kunde automatisch erkannt.
          </div>
        </div>
      </div>
    </div>
  );
}

function WaitlistRowCard({ item }: { item: WaitlistItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waPhone = normalizeWhatsAppPhone(item.phone);

  const runStatusUpdate = (status: "contacted" | "removed") => {
    startTransition(async () => {
      const result = await updateWaitlistStatusQuick({
        waitlistId: item.id,
        tenantId: item.tenantId,
        status,
      });

      if (!result?.ok) {
        window.alert(result?.error ?? "Status konnte nicht gespeichert werden.");
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold text-fuchsia-200">
              {item.tenantName}
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {item.customerName || "Kunde"}
            </div>
            <div className="mt-1 text-sm text-white/75">
              {item.serviceTitle || "Ohne konkrete Behandlung"}
              {item.phone ? ` · ${item.phone}` : ""}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/85">
                {priorityLabel(item.priority)}
              </span>

              {item.shortNoticeOk ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Kurzfristig möglich
                </span>
              ) : null}

              {item.reachableToday ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
                  Heute erreichbar
                </span>
              ) : null}

              {recentLabel(item.requestedRecentlyAt) ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  {recentLabel(item.requestedRecentlyAt)}
                </span>
              ) : null}
            </div>

            <div className="mt-3 text-xs text-white/45">
              Erstellt: {formatDateTime(item.createdAt)}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {waPhone ? (
              <Link href={`https://wa.me/${waPhone}`} target="_blank">
                <button
                  type="button"
                  className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-200 transition hover:scale-[1.01] hover:bg-emerald-400/20"
                >
                  WhatsApp
                </button>
              </Link>
            ) : null}

            {item.phone ? (
              <Link href={`tel:${item.phone}`}>
                <button
                  type="button"
                  className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:scale-[1.01] hover:bg-white/10"
                >
                  Anrufen
                </button>
              </Link>
            ) : null}

            {item.customerProfileId ? (
              <Link href={`/customers/${item.customerProfileId}?tenantId=${encodeURIComponent(item.tenantId)}`}>
                <button
                  type="button"
                  className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:scale-[1.01] hover:bg-white/10"
                >
                  Zum Kunden
                </button>
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/45 opacity-70"
                title="Kein Kundenprofil gefunden"
              >
                Kein Profil
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => runStatusUpdate("contacted")}
            className="inline-flex h-11 min-w-[148px] items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/15 px-4 text-sm font-semibold text-sky-200 transition hover:scale-[1.01] hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Als kontaktiert
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => runStatusUpdate("removed")}
            className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:scale-[1.01] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Entfernen
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WaitlistSlideover({ items }: { items: WaitlistItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const open = searchParams?.get("openWaitlist") === "1";

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openWaitlist");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timeout = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1350, isolation: "isolate" }}>
      <div
        onClick={close}
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
          top: 0,
          right: 0,
          height: "100%",
          width: "min(760px, calc(100vw - 1rem))",
          transform: shown ? "translateX(0)" : "translateX(24px)",
          opacity: shown ? 1 : 0,
          transition: "transform 220ms ease, opacity 220ms ease",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgb(9,9,11)",
          color: "white",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-white/55">Warteliste</div>
              <div className="text-2xl font-extrabold text-white">Aktive Anfragen</div>
              <div className="mt-1 text-sm text-white/55">
                {items.length === 0
                  ? "Aktuell sind keine aktiven Wartelisten-Einträge vorhanden."
                  : `${items.length} aktive Wartelisten-Einträge`}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAdd((value) => !value)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20"
              >
                {showAdd ? "Formular schließen" : "+ Kunde hinzufügen"}
              </button>

              <button
                type="button"
                onClick={close}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {showAdd ? (
            <AddWaitlistCard onDone={() => setShowAdd(false)} />
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/65">
              Aktuell steht niemand auf der aktiven Warteliste.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <WaitlistRowCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

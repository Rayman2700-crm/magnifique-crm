"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { updateOpenSlotStatusQuick, updateWaitlistStatusQuick } from "@/app/calendar/actions";

type OpenSlotItem = {
  id: string;
  appointmentId: string;
  tenantId: string;
  tenantName: string;
  startAt: string;
  endAt: string;
  waitlistCount: number;
  immediateCount: number;
};

type WaitlistMatchRow = {
  id: string;
  customer_profile_id: string;
  person_id: string | null;
  service_title: string | null;
  preferred_staff_id: string | null;
  preferred_days: string[] | null;
  time_from: string | null;
  time_to: string | null;
  notes: string | null;
  priority: string | null;
  short_notice_ok: boolean | null;
  reachable_today: boolean | null;
  requested_recently_at: string | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  score: number;
};

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatDateLabel(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(dateString));
}

function normalizeDayLabel(value: string) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "";
  return ({
    mo: "mo", montag: "mo", monday: "mo",
    di: "di", dienstag: "di", tuesday: "di",
    mi: "mi", mittwoch: "mi", wednesday: "mi",
    do: "do", donnerstag: "do", thursday: "do",
    fr: "fr", freitag: "fr", friday: "fr",
    sa: "sa", samstag: "sa", saturday: "sa",
    so: "so", sonntag: "so", sunday: "so",
  } as Record<string, string>)[v] ?? v.slice(0, 2);
}

function formatWaitlistDays(value: string[] | null | undefined) {
  if (!Array.isArray(value) || value.length === 0) return "flexibel";
  return value.join(", ");
}

function formatOptionalTimeRange(timeFrom: string | null, timeTo: string | null) {
  const from = String(timeFrom ?? "").trim();
  const to = String(timeTo ?? "").trim();
  if (!from && !to) return "jede Uhrzeit";
  if (from && to) return `${from.slice(0, 5)}–${to.slice(0, 5)} Uhr`;
  if (from) return `ab ${from.slice(0, 5)} Uhr`;
  return `bis ${to.slice(0, 5)} Uhr`;
}

function getPriorityLabel(value: string | null) {
  const v = String(value ?? "normal").toLowerCase();
  if (v === "high") return "Hoch";
  if (v === "low") return "Niedrig";
  return "Normal";
}

function getPrioritySort(value: string | null) {
  const v = String(value ?? "normal").toLowerCase();
  if (v === "high") return 3;
  if (v === "normal") return 2;
  return 1;
}

function recentRequestScore(value: string | null) {
  if (!value) return 0;

  const requestedAt = new Date(value);
  if (Number.isNaN(requestedAt.getTime())) return 0;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (requestedAt >= todayStart) return 5;
  if (requestedAt >= yesterdayStart) return 3;
  if (requestedAt >= weekAgo) return 1;
  return 0;
}

function recentRequestLabel(value: string | null) {
  if (!value) return null;
  const requestedAt = new Date(value);
  if (Number.isNaN(requestedAt.getTime())) return "Zuletzt angefragt";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (requestedAt >= todayStart) return "Heute angefragt";
  if (requestedAt >= yesterdayStart) return "Gestern angefragt";
  return null;
}

function computeWaitlistScore(
  row: {
    preferred_staff_id: string | null;
    preferred_days: string[] | null;
    time_from: string | null;
    time_to: string | null;
    service_title: string | null;
    priority: string | null;
    short_notice_ok: boolean | null;
    reachable_today: boolean | null;
    requested_recently_at: string | null;
  },
  selected: OpenSlotItem
) {
  let score = 0;
  const wantedStaff = String(row.preferred_staff_id ?? "").trim();
  if (!wantedStaff) score += 1;
  if (wantedStaff && wantedStaff === selected.tenantId) score += 4;

  const apptDay = normalizeDayLabel(["so", "mo", "di", "mi", "do", "fr", "sa"][new Date(selected.startAt).getDay()]);
  const preferredDays = Array.isArray(row.preferred_days)
    ? row.preferred_days.map(normalizeDayLabel).filter(Boolean)
    : [];
  if (preferredDays.length === 0) score += 1;
  if (preferredDays.includes(apptDay)) score += 2;

  const start = new Date(selected.startAt);
  const minutes = start.getHours() * 60 + start.getMinutes();
  const timeFrom = String(row.time_from ?? "").trim();
  const timeTo = String(row.time_to ?? "").trim();
  const toMin = (v: string) => {
    const [h, m] = v.split(":");
    return Number(h || 0) * 60 + Number(m || 0);
  };

  if (!timeFrom && !timeTo) score += 1;
  else {
    const afterFrom = !timeFrom || minutes >= toMin(timeFrom);
    const beforeTo = !timeTo || minutes <= toMin(timeTo);
    if (afterFrom && beforeTo) score += 2;
  }

  if (row.short_notice_ok) score += 5;
  if (row.reachable_today) score += 4;
  score += recentRequestScore(row.requested_recently_at);
  score += getPrioritySort(row.priority);

  return score;
}

function normalizePhoneForWhatsApp(phone: string) {
  let p = String(phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p.replace(/\D/g, "");
}

function normalizePhoneForTel(phone: string) {
  let p = String(phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getCreateForWaitlistHref(selected: OpenSlotItem, row: WaitlistMatchRow) {
  if (!row.customer_profile_id) return "#";
  const start = new Date(selected.startAt);
  const durationMin = Math.max(
    5,
    Math.round((new Date(selected.endAt).getTime() - start.getTime()) / 60000) || 60
  );
  const params = new URLSearchParams({
    title: row.service_title || "Termin",
    notes: row.notes || "",
    start: toDatetimeLocalValue(start),
    duration: String(durationMin),
    buffer: "0",
    status: "scheduled",
  });
  return `/customers/${row.customer_profile_id}/appointments/new?${params.toString()}`;
}

export default function OpenSlotsSlideover({ items }: { items: OpenSlotItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [matchMap, setMatchMap] = useState<Record<string, WaitlistMatchRow[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});
  const [pendingWaitlistId, setPendingWaitlistId] = useState<string | null>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);

  const open = searchParams?.get("openSlots") === "1";

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openSlots");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    let alive = true;

    async function loadMatchesForItem(item: OpenSlotItem) {
      try {
        setLoadingMap((current) => ({ ...current, [item.id]: true }));
        setErrorMap((current) => ({ ...current, [item.id]: null }));

        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("appointment_waitlist")
          .select(`
            id,
            customer_profile_id,
            person_id,
            service_title,
            preferred_staff_id,
            preferred_days,
            time_from,
            time_to,
            notes,
            priority,
            short_notice_ok,
            reachable_today,
            requested_recently_at,
            status,
            created_at
          `)
          .eq("tenant_id", item.tenantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(25);

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const profileIds = Array.from(
          new Set(
            rows
              .map((row: any) => String(row.customer_profile_id ?? "").trim())
              .filter(Boolean)
          )
        );

        const profilesById = new Map<
          string,
          { customer_name: string | null; phone: string | null; email: string | null }
        >();

        if (profileIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("customer_profiles")
            .select(`
              id,
              person:persons (
                full_name,
                phone,
                email
              )
            `)
            .in("id", profileIds);

          if (profileError) throw profileError;

          for (const profile of Array.isArray(profiles) ? profiles : []) {
            const personJoin = Array.isArray((profile as any).person)
              ? (profile as any).person[0]
              : (profile as any).person;

            profilesById.set(String((profile as any).id), {
              customer_name: String(personJoin?.full_name ?? "").trim() || null,
              phone: String(personJoin?.phone ?? "").trim() || null,
              email: String(personJoin?.email ?? "").trim() || null,
            });
          }
        }

        const mapped = rows
          .map((row: any) => {
            const profile = profilesById.get(String(row.customer_profile_id ?? ""));
            const preferredDays = Array.isArray(row.preferred_days)
              ? row.preferred_days.map((entry: any) => String(entry)).filter(Boolean)
              : [];

            const match: WaitlistMatchRow = {
              id: String(row.id),
              customer_profile_id: String(row.customer_profile_id ?? ""),
              person_id: row.person_id ? String(row.person_id) : null,
              service_title: row.service_title ? String(row.service_title) : null,
              preferred_staff_id: row.preferred_staff_id ? String(row.preferred_staff_id) : null,
              preferred_days: preferredDays,
              time_from: row.time_from ? String(row.time_from) : null,
              time_to: row.time_to ? String(row.time_to) : null,
              notes: row.notes ? String(row.notes) : null,
              priority: row.priority ? String(row.priority) : null,
              short_notice_ok: row.short_notice_ok === true,
              reachable_today: row.reachable_today === true,
              requested_recently_at: row.requested_recently_at ? String(row.requested_recently_at) : null,
              status: row.status ? String(row.status) : null,
              created_at: row.created_at ? String(row.created_at) : null,
              customer_name: profile?.customer_name ?? null,
              phone: profile?.phone ?? null,
              email: profile?.email ?? null,
              score: computeWaitlistScore(
                {
                  preferred_staff_id: row.preferred_staff_id ? String(row.preferred_staff_id) : null,
                  preferred_days: preferredDays,
                  time_from: row.time_from ? String(row.time_from) : null,
                  time_to: row.time_to ? String(row.time_to) : null,
                  service_title: row.service_title ? String(row.service_title) : null,
                  priority: row.priority ? String(row.priority) : null,
                  short_notice_ok: row.short_notice_ok === true,
                  reachable_today: row.reachable_today === true,
                  requested_recently_at: row.requested_recently_at ? String(row.requested_recently_at) : null,
                },
                item
              ),
            };

            return match;
          })
          .sort(
            (a, b) =>
              b.score - a.score ||
              ((b.requested_recently_at ? new Date(b.requested_recently_at).getTime() : 0) -
                (a.requested_recently_at ? new Date(a.requested_recently_at).getTime() : 0)) ||
              getPrioritySort(b.priority) - getPrioritySort(a.priority)
          )
          .slice(0, 3);

        if (!alive) return;
        setMatchMap((current) => ({ ...current, [item.id]: mapped }));
      } catch (error: any) {
        if (!alive) return;
        setMatchMap((current) => ({ ...current, [item.id]: [] }));
        setErrorMap((current) => ({
          ...current,
          [item.id]: error?.message ?? "Kandidaten konnten nicht geladen werden.",
        }));
      } finally {
        if (!alive) return;
        setLoadingMap((current) => ({ ...current, [item.id]: false }));
      }
    }

    if (open && items.length > 0) {
      items.forEach((item) => {
        void loadMatchesForItem(item);
      });
    }

    return () => {
      alive = false;
    };
  }, [open, items]);

  if (!mounted || !visible || typeof document === "undefined") return null;
  const handleOpenSlotStatusChange = async (
    slotId: string,
    nextStatus: "booked" | "closed" | "expired"
  ) => {
    setPendingSlotId(slotId);

    const result = await updateOpenSlotStatusQuick({
      slotId,
      status: nextStatus,
    });

    if (result?.ok) {
      router.refresh();
    } else {
      setErrorMap((current) => ({
        ...current,
        [slotId]: result?.error ?? "Slot-Status konnte nicht gespeichert werden.",
      }));
    }

    setPendingSlotId(null);
  };

  const handleWaitlistStatusChange = async (
    slotId: string,
    waitlistId: string,
    tenantId: string,
    nextStatus: "contacted" | "booked"
  ) => {
    setPendingWaitlistId(waitlistId);

    const result = await updateWaitlistStatusQuick({
      waitlistId,
      status: nextStatus,
      tenantId,
    });

    if (result?.ok) {
      setMatchMap((current) => ({
        ...current,
        [slotId]: (current[slotId] ?? []).filter((entry) => entry.id !== waitlistId),
      }));

      if (nextStatus === "booked") {
        const slotResult = await updateOpenSlotStatusQuick({
          slotId,
          status: "booked",
        });

        if (!slotResult?.ok) {
          setErrorMap((current) => ({
            ...current,
            [slotId]: slotResult?.error ?? "Slot konnte nicht als vergeben markiert werden.",
          }));
        } else {
          router.refresh();
        }
      }
    } else {
      setErrorMap((current) => ({
        ...current,
        [slotId]: result?.error ?? "Wartelisten-Status konnte nicht gespeichert werden.",
      }));
    }

    setPendingWaitlistId(null);
  };

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
          width: "min(860px, calc(100vw - 1rem))",
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
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <div className="text-sm text-white/55">Freigewordene Slots</div>
            <div className="text-2xl font-extrabold text-white">Offene Zeitfenster</div>
            <div className="mt-1 text-sm text-white/55">
              {items.length === 0
                ? "Aktuell sind keine offenen Slots vorhanden."
                : `${items.length} offene Slots ab heute`}
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/65">
              Aktuell sind keine freigewordenen Slots offen.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const matches = matchMap[item.id] ?? [];
                const isLoading = loadingMap[item.id] === true;
                const error = errorMap[item.id];
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-amber-200">
                          {formatDateLabel(item.startAt)}
                        </div>
                        <div className="mt-1 text-lg font-bold text-white">
                          {formatTime(item.startAt)}–{formatTime(item.endAt)} · {item.tenantName}
                        </div>
                        <div className="mt-2 text-sm text-white/75">
                          {item.waitlistCount} aktive Wartelisten-Kunden für diesen Behandler
                        </div>
                        <div className="mt-1 text-sm text-emerald-200/90">
                          {item.immediateCount} Sofort-Kandidaten
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link href="/calendar">
                          <button
                            type="button"
                            className="inline-flex h-11 min-w-[148px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:scale-[1.01] hover:bg-white/10"
                          >
                            Im Kalender prüfen
                          </button>
                        </Link>

                        <button
                          type="button"
                          disabled={pendingSlotId === item.id}
                          onClick={() => handleOpenSlotStatusChange(item.id, "closed")}
                          className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Slot schließen
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Top-Kandidaten</div>
                        <div className="text-xs text-white/50">
                          Direkt aus dem freien Slot kontaktieren oder vergeben
                        </div>
                      </div>

                      {error ? <div className="mt-3 text-xs text-red-300">{error}</div> : null}

                      {isLoading ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/60">
                          Kandidaten werden geladen...
                        </div>
                      ) : matches.length === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-sm text-white/55">
                          Noch kein passender aktiver Wartelisten-Eintrag für diesen Slot gefunden.
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          {matches.map((entry) => {
                            const createHref = getCreateForWaitlistHref(item, entry);
                            const isPending = pendingWaitlistId === entry.id;
                            return (
                              <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-base font-semibold text-white">
                                      {entry.customer_name || "Unbekannter Kunde"}
                                    </div>
                                    <div className="mt-1 text-sm text-white/70">
                                      {entry.service_title || "ohne Behandlungswunsch"}
                                      {entry.phone ? ` · ${entry.phone}` : ""}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/55">
                                      <span className="rounded-full border border-white/10 px-2 py-1">
                                        {formatWaitlistDays(entry.preferred_days)}
                                      </span>
                                      <span className="rounded-full border border-white/10 px-2 py-1">
                                        {formatOptionalTimeRange(entry.time_from, entry.time_to)}
                                      </span>
                                      <span className="rounded-full border border-white/10 px-2 py-1">
                                        Priorität: {getPriorityLabel(entry.priority)}
                                      </span>
                                      {entry.short_notice_ok ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                          Kurzfristig möglich
                                        </span>
                                      ) : null}
                                      {entry.reachable_today ? (
                                        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-200">
                                          Heute erreichbar
                                        </span>
                                      ) : null}
                                      {recentRequestLabel(entry.requested_recently_at) ? (
                                        <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-200">
                                          {recentRequestLabel(entry.requested_recently_at)}
                                        </span>
                                      ) : null}
                                      <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-100">
                                        Match {entry.score}
                                      </span>
                                    </div>
                                    {entry.notes ? (
                                      <div className="mt-2 text-xs text-white/55">{entry.notes}</div>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Link
                                      href={
                                        entry.phone
                                          ? `https://wa.me/${normalizePhoneForWhatsApp(
                                              entry.phone
                                            )}?text=${encodeURIComponent(
                                              `Hallo ${entry.customer_name || ""}, es ist kurzfristig ein Termin am ${formatDateLabel(
                                                item.startAt
                                              )} um ${formatTime(item.startAt)} frei geworden.`
                                            )}`
                                          : "#"
                                      }
                                      target="_blank"
                                    >
                                      <button
                                        type="button"
                                        disabled={!entry.phone}
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        WhatsApp
                                      </button>
                                    </Link>

                                    <Link href={entry.phone ? `tel:${normalizePhoneForTel(entry.phone)}` : "#"}>
                                      <button
                                        type="button"
                                        disabled={!entry.phone}
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Anrufen
                                      </button>
                                    </Link>

                                    <Link href={`/customers/${entry.customer_profile_id}?tenantId=${encodeURIComponent(item.tenantId)}&tab=waitlist#waitlist`}>
                                      <button
                                        type="button"
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
                                      >
                                        Zum Kunden
                                      </button>
                                    </Link>

                                    <Link href={createHref}>
                                      <button
                                        type="button"
                                        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600/70 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                                      >
                                        Termin anlegen
                                      </button>
                                    </Link>

                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleWaitlistStatusChange(item.id, entry.id, item.tenantId, "contacted")
                                      }
                                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Kontaktiert
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleWaitlistStatusChange(item.id, entry.id, item.tenantId, "booked")
                                      }
                                      className="inline-flex h-10 items-center justify-center rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Als vergeben
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

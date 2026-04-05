"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WeekDayGridView from "@/components/calendar/views/WeekDayGridView";
import MonthView from "@/components/calendar/MonthView";
import YearView from "@/components/calendar/YearView";
import type { Item, ViewMode, DayMeta, Positioned } from "@/components/calendar/types";
import {
  pad2,
  toLocalISODate,
  fmtTime,
  fmtDayHeader,
  tenantTheme,
  layoutDay,
  buildMonthGrid,
  buildYearMonths,
} from "@/components/calendar/utils";

const AppointmentDetailSlideover = dynamic(
  () => import("@/components/calendar/AppointmentDetailSlideover"),
  { ssr: false }
);

const CreateAppointmentSlideover = dynamic(
  () => import("@/components/calendar/CreateAppointmentSlideover"),
  { ssr: false }
);

type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

export default function DashboardWeekGridClient({
  items,
  view,
  anchorISO,
  weekStartISO,
  tenants,
  services = [],
  creatorTenantId,
  onSetDate,
  onSetView,
  createOpen,
  onCloseCreate,
  onOpenCreate,
}: {
  items: Item[];
  view: ViewMode;
  anchorISO: string;
  weekStartISO: string;
  tenants: { id: string; display_name: string | null }[];
  services?: ServiceOption[];
  creatorTenantId: string | null;
  onSetDate: (iso: string) => void;
  onSetView: (view: ViewMode) => void;
  createOpen: boolean;
  onCloseCreate: () => void;
  onOpenCreate?: () => void;
}) {
  const [createVisible, setCreateVisible] = useState(createOpen);
  const [createShown, setCreateShown] = useState(false);
  const [moveSavingId, setMoveSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [mounted, setMounted] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const OVERSCAN_PX = 320;
  const todayISO = useMemo(() => toLocalISODate(new Date()), []);
  const focusISO: string | null = null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  useEffect(() => {
    if (!createOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseCreate();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, onCloseCreate]);

  useEffect(() => {
    if (createOpen) {
      setCreateVisible(true);
      setCreateShown(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setCreateShown(true));
      });
    } else {
      setCreateShown(false);
      const t = setTimeout(() => setCreateVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [createOpen]);

  useEffect(() => {
    didAutoScrollRef.current = false;
  }, [view, anchorISO, weekStartISO]);

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  const navigateLocal = useCallback(
    (next: Partial<{ view: ViewMode; date: string; week: string; focus: string | null }>) => {
      if (next.view && next.view !== view) {
        onSetView(next.view);
      }

      if (next.date && next.date !== anchorISO) {
        onSetDate(next.date);
      }

      didAutoScrollRef.current = false;
    },
    [anchorISO, onSetDate, onSetView, view]
  );

  const moveAppointment = useCallback(async (appointmentId: string, startAt: string, endAt: string) => {
    try {
      setMoveSavingId(appointmentId);

      const res = await fetch("/api/calendar/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, startAt, endAt }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        alert(json?.error ?? "Termin konnte nicht verschoben werden.");
      }
    } catch (e: any) {
      alert(e?.message ?? "Termin konnte nicht verschoben werden.");
    } finally {
      setMoveSavingId(null);
    }
  }, []);

  const dayMeta = useMemo(() => {
    const map = new Map<string, DayMeta>();

    for (const it of items) {
      const day = it.start_at.slice(0, 10);
      const prev = map.get(day);

      if (!prev) {
        const s = new Date(it.start_at);
        const e = new Date(it.end_at);
        const label = `${fmtTime(s)}–${fmtTime(e)} ${it.customerName ?? "Kunde"}`;
        map.set(day, {
          count: 1,
          firstLabel: label,
          firstTenantName: it.tenantName ?? null,
        });
      } else {
        prev.count += 1;
      }
    }

    return map;
  }, [items]);

  const eventsByDayLimited = useMemo(() => {
    const map = new Map<string, Item[]>();

    for (const it of items) {
      const day = it.start_at.slice(0, 10);
      const arr = map.get(day);
      if (!arr) map.set(day, [it]);
      else if (arr.length < 5) arr.push(it);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
      map.set(k, arr);
    }

    return map;
  }, [items]);

  const startHour = 8;
  const endHour = 20;
  const pxPerHour = 56;
  const pxPerMin = pxPerHour / 60;

  const weekDays = useMemo(() => {
    const arr: { iso: string; date: Date; isToday: boolean }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(`${weekStartISO}T12:00:00`);
      d.setDate(d.getDate() + i);
      const iso = toLocalISODate(d);
      arr.push({ iso, date: d, isToday: iso === todayISO });
    }

    return arr;
  }, [weekStartISO, todayISO]);

  const positionedWeekByDay = useMemo(() => {
    const map = new Map<string, Positioned[]>();

    for (const d of weekDays) {
      const placed = layoutDay(items, d.iso, startHour, pxPerMin);
      map.set(d.iso, placed);
    }

    return map;
  }, [weekDays, items, startHour, pxPerMin]);

  const positionedDay = useMemo(() => {
    return layoutDay(items, anchorISO, startHour, pxPerMin);
  }, [items, anchorISO, startHour, pxPerMin]);

  const nowInfo = useMemo(() => {
    const now = new Date();
    const nowISO = toLocalISODate(now);

    const inScope =
      view === "week"
        ? weekDays.some((d) => d.iso === nowISO)
        : view === "day"
        ? nowISO === anchorISO
        : false;

    if (!inScope) return null;

    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMin = startHour * 60;
    const endMin = endHour * 60;

    if (minutes < startMin || minutes > endMin) return null;

    return {
      iso: nowISO,
      top: (minutes - startMin) * pxPerMin,
    };
  }, [view, weekDays, anchorISO, startHour, endHour, pxPerMin]);

  useEffect(() => {
    if (view !== "week" && view !== "day") return;

    const el = scrollRef.current;
    if (!el || !nowInfo) return;
    if (didAutoScrollRef.current) return;

    didAutoScrollRef.current = true;

    requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, nowInfo.top - pxPerHour * 2);
      setScrollTop(el.scrollTop);
      setViewportH(el.clientHeight);
    });
  }, [view, nowInfo, pxPerHour]);

  const monthCells = useMemo(() => {
    return view === "month" ? buildMonthGrid(anchorISO) : [];
  }, [view, anchorISO]);

  const yearMonths = useMemo(() => {
    return view === "year" ? buildYearMonths(anchorISO) : [];
  }, [view, anchorISO]);

  const normalizedServices = useMemo<ServiceOption[]>(
    () =>
      (services ?? []).map((service) => ({
        id: String(service.id),
        tenant_id: String(service.tenant_id),
        name: String(service.name ?? "").trim(),
        duration_minutes:
          service.duration_minutes == null ? null : Number(service.duration_minutes),
        buffer_minutes:
          service.buffer_minutes == null ? null : Number(service.buffer_minutes),
        default_price_cents:
          service.default_price_cents == null ? null : Number(service.default_price_cents),
        is_active: service.is_active ?? null,
      })),
    [services]
  );

  const isMobileCalendar = viewportWidth < 868;
  const mobileAgendaDays = useMemo(() => {
    if (!isMobileCalendar) return [] as { iso: string; date: Date; events: Item[] }[];

    if (view === "week") {
      return weekDays.map((day) => ({
        iso: day.iso,
        date: day.date,
        events: [...(positionedWeekByDay.get(day.iso) ?? [])]
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
      }));
    }

    const date = new Date(`${anchorISO}T12:00:00`);
    return [{
      iso: anchorISO,
      date,
      events: [...items]
        .filter((item) => item.start_at.slice(0, 10) === anchorISO)
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    }];
  }, [anchorISO, isMobileCalendar, items, positionedWeekByDay, view, weekDays]);

  const mobileEmptyLabel = view === "week"
    ? "Keine Termine in dieser Woche"
    : "Keine Termine an diesem Tag";

  return (
    <>
      {isMobileCalendar && (view === "week" || view === "day") ? (
        <div className="mt-4 space-y-4">
          {mobileAgendaDays.every((day) => day.events.length === 0) ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/65">
              {mobileEmptyLabel}
            </div>
          ) : (
            mobileAgendaDays.map((day) => (
              <section key={day.iso} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {new Intl.DateTimeFormat("de-AT", { weekday: "long", day: "2-digit", month: "2-digit" }).format(day.date)}
                    </div>
                    <div className="text-xs text-white/45">
                      {day.events.length} {day.events.length === 1 ? "Termin" : "Termine"}
                    </div>
                  </div>
                  {day.iso === todayISO ? (
                    <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">Heute</span>
                  ) : null}
                </div>

                <div className="p-3 space-y-3">
                  {day.events.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-sm text-white/45">
                      Frei
                    </div>
                  ) : (
                    day.events.map((it) => {
                      const theme = tenantTheme(it.tenantName);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => setSelected(it)}
                          className="w-full rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-3 text-left"
                          style={{ boxShadow: `inset 3px 0 0 ${theme.bg}` }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-[62px] rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-center">
                              <div className="text-[13px] font-bold leading-none text-white">{fmtTime(new Date(it.start_at))}</div>
                              <div className="mt-1 text-[11px] leading-none text-white/45">bis {fmtTime(new Date(it.end_at))}</div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">{it.customerName ?? "Kunde"}</div>
                              <div className="mt-1 truncate text-xs text-white/55">{it.title || "Termin"}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="rounded-full border px-2 py-1" style={{ borderColor: theme.bg, color: theme.text, backgroundColor: theme.bg }}>
                                  {it.tenantName}
                                </span>
                                {it.customerPhone ? <span className="text-white/45">{it.customerPhone}</span> : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <WeekDayGridView
          view={view}
          weekDays={weekDays}
          anchorISO={anchorISO}
          todayISO={todayISO}
          scrollRef={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
              setScrollTop(el.scrollTop);
              setViewportH(el.clientHeight);
            });
          }}
          startHour={startHour}
          endHour={endHour}
          pxPerHour={pxPerHour}
          nowInfo={nowInfo}
          positionedWeekByDay={positionedWeekByDay as any}
          positionedDay={positionedDay as any}
          scrollTop={scrollTop}
          viewportH={viewportH}
          overscanPx={OVERSCAN_PX}
          setSelected={setSelected}
          pad2={pad2}
          fmtDayHeader={fmtDayHeader}
          tenantTheme={tenantTheme}
          itemsById={itemsById}
          onMoveAppointment={moveAppointment}
          moveSavingId={moveSavingId}
          onOpenCreate={() => {
  if (onOpenCreate) {
    onOpenCreate();
  } else {
    // Fallback → direkt öffnen
    setCreateVisible(true);
    setCreateShown(true);
  }
}}
        />
      )}

      <MonthView
        view={view}
        monthCells={monthCells}
        todayISO={todayISO}
        focusISO={focusISO}
        dayMeta={dayMeta}
        eventsByDayLimited={eventsByDayLimited}
        setParams={navigateLocal}
        setSelected={setSelected}
      />

      <YearView
        view={view}
        yearMonths={yearMonths}
        todayISO={todayISO}
        dayMeta={dayMeta}
        setParams={navigateLocal}
      />

      {mounted && selected && (
        <AppointmentDetailSlideover
          mounted={mounted}
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {mounted && createVisible && (
        <CreateAppointmentSlideover
          key={createOpen ? "create-open" : "create-closed"}
          mounted={mounted}
          createVisible={createVisible}
          createShown={createShown}
          onClose={onCloseCreate}
          tenants={tenants}
          services={normalizedServices}
          creatorTenantId={creatorTenantId}
          defaultWeekISO={weekStartISO}
        />
      )}
    </>
  );
}
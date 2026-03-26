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
}) {
  const [createVisible, setCreateVisible] = useState(createOpen);
  const [createShown, setCreateShown] = useState(false);
  const [moveSavingId, setMoveSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [mounted, setMounted] = useState(false);

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


  return (
    <>
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
      />

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
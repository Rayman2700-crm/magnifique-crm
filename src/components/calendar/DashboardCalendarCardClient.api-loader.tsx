"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardWeekGridClient from "@/components/calendar/DashboardWeekGridClient";
import TenantLegendClient from "@/components/calendar/TenantLegendClient";
import type { Item, ViewMode } from "@/components/calendar/types";

type TenantRow = {
  id: string;
  display_name: string | null;
};

type LegendUser = {
  tenantId: string;
  filterTenantId: string;
  userId: string;
  fullName: string | null;
  tenantDisplayName: string;
};

type ServiceOptionInput = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active?: boolean | null;
};

type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMondayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonthLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
}

function startOfYearLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setMonth(0, 1);
  return x;
}

function addDaysLocal(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

function addMonthsLocal(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return toLocalISODate(d);
}

function addYearsLocal(iso: string, years: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setFullYear(d.getFullYear() + years);
  return toLocalISODate(d);
}

function fmtHeader(view: ViewMode, anchorISO: string, weekStartISO: string) {
  if (view === "week") {
    const ws = new Date(`${weekStartISO}T12:00:00`);

    const tmp = new Date(Date.UTC(ws.getFullYear(), ws.getMonth(), ws.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

    const label = new Intl.DateTimeFormat("de-AT", {
      month: "long",
      year: "numeric",
    }).format(ws);

    return { left: label, right: `KW ${weekNo}` };
  }

  if (view === "day") {
    const d = new Date(`${anchorISO}T12:00:00`);
    const label = new Intl.DateTimeFormat("de-AT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(d);
    return { left: label, right: "" };
  }

  if (view === "month") {
    const d = new Date(`${anchorISO}T12:00:00`);
    return {
      left: new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(d),
      right: "",
    };
  }

  return {
    left: String(new Date(`${anchorISO}T12:00:00`).getFullYear()),
    right: "",
  };
}

function isAdminTenantName(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();
  return n.includes("radu");
}

function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const btn = (v: ViewMode, label: string) => {
    const active = value === v;

    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(v);
        }}
        style={{
          height: 38,
          padding: "0 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 800,
          border: "1px solid rgba(255,255,255,0.14)",
          backgroundColor: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {btn("day", "Tag")}
      {btn("week", "Woche")}
      {btn("month", "Monat")}
      {btn("year", "Jahr")}
    </div>
  );
}

export default function DashboardCalendarCardClient({
  tenants,
  legendUsers,
  services = [],
  creatorTenantId,
  isAdmin: isAdminProp,
}: {
  tenants: TenantRow[];
  legendUsers: LegendUser[];
  services?: ServiceOptionInput[];
  creatorTenantId: string | null;
  isAdmin?: boolean;
}) {
  const normalizedServices = useMemo<ServiceOption[]>(
    () =>
      (services ?? []).map((service) => ({
        ...service,
        is_active: service.is_active ?? null,
      })),
    [services]
  );
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [calendarState, setCalendarState] = useState<{ view: ViewMode; anchorISO: string }>({
    view: "week",
    anchorISO: toLocalISODate(new Date()),
  });

  const [items, setItems] = useState<Item[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSeq = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const view = calendarState.view;
  const anchorISO = calendarState.anchorISO;

  const currentLegendUser = useMemo(() => {
    if (!creatorTenantId) return null;
    return legendUsers.find((u) => u.tenantId === creatorTenantId || u.filterTenantId === creatorTenantId) ?? null;
  }, [creatorTenantId, legendUsers]);

  const currentTenantDisplayName =
    currentLegendUser?.tenantDisplayName ?? tenants.find((t) => t.id === creatorTenantId)?.display_name ?? null;

  const isAdmin = useMemo(() => {
    if (typeof isAdminProp === "boolean") return isAdminProp;
    if (legendUsers.length > 1) return true;
    return isAdminTenantName(currentTenantDisplayName);
  }, [currentTenantDisplayName, isAdminProp, legendUsers.length]);

  useEffect(() => {
    if (!creatorTenantId) return;
    setSelectedTenantId((current) => {
      if (isAdmin) return current;
      return current || creatorTenantId;
    });
  }, [creatorTenantId, isAdmin]);

  const weekStartISO = useMemo(() => {
    return toLocalISODate(startOfWeekMondayLocal(new Date(`${anchorISO}T12:00:00`)));
  }, [anchorISO]);

  const headerText = useMemo(() => fmtHeader(view, anchorISO, weekStartISO), [view, anchorISO, weekStartISO]);

  const range = useMemo(() => {
    const anchorDate = new Date(`${anchorISO}T12:00:00`);
    let rangeStart = new Date(anchorDate);
    let rangeEnd = new Date(anchorDate);

    if (view === "day") {
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    } else if (view === "week") {
      const weekStart = startOfWeekMondayLocal(anchorDate);
      rangeStart = new Date(weekStart);
      rangeEnd = new Date(weekStart);
      rangeEnd.setDate(rangeEnd.getDate() + 7);
    } else if (view === "month") {
      const ms = startOfMonthLocal(anchorDate);
      rangeStart = new Date(ms);
      rangeEnd = new Date(ms);
      rangeEnd.setMonth(rangeEnd.getMonth() + 1);
    } else {
      const ys = startOfYearLocal(anchorDate);
      rangeStart = new Date(ys);
      rangeEnd = new Date(ys);
      rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
    }

    return {
      startISO: rangeStart.toISOString(),
      endISO: rangeEnd.toISOString(),
    };
  }, [anchorISO, view]);

  const loadAppointments = useCallback(async () => {
    const seq = ++loadSeq.current;
    const hasExistingItems = hasLoadedOnceRef.current;

    if (hasExistingItems) setIsRefreshing(true);
    else setIsInitialLoading(true);

    setErrorText(null);

    try {
      const url = new URL("/api/dashboard/calendar-items", window.location.origin);
      url.searchParams.set("start", range.startISO);
      url.searchParams.set("end", range.endISO);
      if (selectedTenantId) url.searchParams.set("tenantId", selectedTenantId);
      if (creatorTenantId) url.searchParams.set("creatorTenantId", creatorTenantId);
      url.searchParams.set("isAdmin", isAdmin ? "true" : "false");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json().catch(() => null);

      if (seq !== loadSeq.current) return;

      if (!res.ok) {
        setErrorText(json?.error ?? "Kalender konnte nicht geladen werden.");
        setItems([]);
        setIsInitialLoading(false);
        setIsRefreshing(false);
        return;
      }

      setItems(Array.isArray(json?.items) ? (json.items as Item[]) : []);
      hasLoadedOnceRef.current = true;
      setIsInitialLoading(false);
      setIsRefreshing(false);
    } catch (error: any) {
      if (seq !== loadSeq.current) return;
      setErrorText(error?.message ?? "Kalender konnte nicht geladen werden.");
      setItems([]);
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [creatorTenantId, isAdmin, range.endISO, range.startISO, selectedTenantId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (!createOpen) return;
    const t = setTimeout(() => loadAppointments(), 1200);
    return () => clearTimeout(t);
  }, [createOpen, loadAppointments]);

  const handleToday = useCallback(() => {
    setCalendarState((prev) => ({ ...prev, anchorISO: toLocalISODate(new Date()) }));
  }, []);

  const handlePrev = useCallback(() => {
    setCalendarState((prev) => {
      if (prev.view === "day") return { ...prev, anchorISO: addDaysLocal(prev.anchorISO, -1) };
      if (prev.view === "week") return { ...prev, anchorISO: addDaysLocal(prev.anchorISO, -7) };
      if (prev.view === "month") return { ...prev, anchorISO: addMonthsLocal(prev.anchorISO, -1) };
      return { ...prev, anchorISO: addYearsLocal(prev.anchorISO, -1) };
    });
  }, []);

  const handleNext = useCallback(() => {
    setCalendarState((prev) => {
      if (prev.view === "day") return { ...prev, anchorISO: addDaysLocal(prev.anchorISO, 1) };
      if (prev.view === "week") return { ...prev, anchorISO: addDaysLocal(prev.anchorISO, 7) };
      if (prev.view === "month") return { ...prev, anchorISO: addMonthsLocal(prev.anchorISO, 1) };
      return { ...prev, anchorISO: addYearsLocal(prev.anchorISO, 1) };
    });
  }, []);

  const handleChangeView = useCallback((nextView: ViewMode) => {
    setCalendarState((prev) => ({ ...prev, view: nextView }));
  }, []);

  const handleSetDate = useCallback((iso: string) => {
    setCalendarState((prev) => ({ ...prev, anchorISO: iso }));
  }, []);

  return (
    <Card className="border-[var(--border)] bg-[var(--surface)]">
      <CardContent className="p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-semibold text-white">Kalender</div>
              <div className="text-sm text-white/60">Team-Übersicht</div>
            </div>

            {isAdmin ? (
              <TenantLegendClient users={legendUsers} activeTenantId={selectedTenantId} onSelect={setSelectedTenantId} />
            ) : currentLegendUser ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80">
                {currentLegendUser.fullName ?? currentLegendUser.tenantDisplayName}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              className="whitespace-nowrap"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCreateOpen(true);
              }}
            >
              + Neuer Termin
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="whitespace-nowrap"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCalendarState({ view: "week", anchorISO: toLocalISODate(new Date()) });
              }}
            >
              Kalender öffnen
            </Button>
          </div>
        </div>

        <div className="mt-6">
          {errorText ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="font-semibold text-white">Fehler</div>
              <div className="mt-1 break-words text-sm text-red-200">{errorText}</div>
            </div>
          ) : isInitialLoading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">Kalender wird geladen...</div>
          ) : (
            <div className="relative">
              {isRefreshing && (
                <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  Aktualisiere...
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={handleToday}>Heute</Button>
                  <Button type="button" variant="secondary" onClick={handlePrev}>←</Button>
                  <Button type="button" variant="secondary" onClick={handleNext}>→</Button>

                  <div className="ml-2 text-xl font-bold text-white">
                    {headerText.left}
                    {headerText.right ? <span className="ml-2 text-sm font-semibold text-white/55">{headerText.right}</span> : null}
                  </div>

                  <div className="ml-3 text-xs text-white/45">{items.length} Termin(e)</div>
                </div>

                <ViewSwitch value={view} onChange={handleChangeView} />
              </div>

              <DashboardWeekGridClient
                items={items}
                view={view}
                anchorISO={anchorISO}
                weekStartISO={weekStartISO}
                tenants={tenants}
                services={normalizedServices}
                creatorTenantId={creatorTenantId}
                onSetDate={handleSetDate}
                onSetView={handleChangeView}
                createOpen={createOpen}
                onCloseCreate={() => {
                  setCreateOpen(false);
                  setTimeout(() => loadAppointments(), 250);
                }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

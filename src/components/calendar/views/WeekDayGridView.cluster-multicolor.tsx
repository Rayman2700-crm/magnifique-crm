"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type ViewMode = "day" | "week" | "month" | "year";

type Positioned = {
  id: string;
  tenantName: string;
  reminderSentAt?: string | null;
  _top: number;
  _height: number;
  _col: number;
  _cols: number;
  _timeLine: string;
  _customer: string;
};

type ItemLite = {
  id: string;
  start_at: string;
  end_at: string;
  reminderSentAt?: string | null;
};

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtShortTime(v: string) {
  return String(v).replace(/:00/g, "").replace("–", "-");
}

function initialsFromName(v: string) {
  const parts = String(v || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getReminderBadge(reminderSentAt?: string | null) {
  const sent = !!reminderSentAt;

  return {
    sent,
    shortLabel: sent ? "Erinnert" : "Offen",
    tinyLabel: sent ? "✓" : "!",
    bg: sent ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.18)",
    text: sent ? "#a7f3d0" : "#fde68a",
    border: sent ? "rgba(16,185,129,0.34)" : "rgba(245,158,11,0.34)",
    solidBg: sent ? "#16a34a" : "#f59e0b",
    solidText: sent ? "#ffffff" : "#111111",
  };
}

export default function WeekDayGridView(props: {
  view: ViewMode;
  weekDays: { iso: string; date: Date; isToday: boolean }[];
  anchorISO: string;
  todayISO: string;

  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;

  startHour: number;
  endHour: number;
  pxPerHour: number;
  nowInfo: { iso: string; top: number } | null;

  positionedWeekByDay: Map<string, Positioned[]>;
  positionedDay: Positioned[];

  scrollTop: number;
  viewportH: number;
  overscanPx: number;

  setSelected: (ev: any) => void;

  pad2: (n: number) => string;
  fmtDayHeader: (d: Date) => { dow: string; day: number };
  tenantTheme: (tenantName: string) => { bg: string; text: string; subText: string };

  itemsById: Map<string, ItemLite>;
  onMoveAppointment: (appointmentId: string, startAt: string, endAt: string) => Promise<void>;
  moveSavingId: string | null;
}) {
  const {
    view,
    weekDays,
    anchorISO,
    todayISO,
    scrollRef,
    onScroll,
    startHour,
    endHour,
    pxPerHour,
    nowInfo,
    positionedWeekByDay,
    positionedDay,
    scrollTop,
    viewportH,
    overscanPx,
    setSelected,
    pad2,
    fmtDayHeader,
    tenantTheme,
    itemsById,
    onMoveAppointment,
    moveSavingId,
  } = props;

  const totalHeight = (endHour - startHour + 1) * pxPerHour;
  const pxPerMin = pxPerHour / 60;
  const DRAG_THRESHOLD_PX = 6;
  const TIME_COL_WIDTH = 84;

  const bodyGridRef = useRef<HTMLDivElement | null>(null);

  const [dayColumnWidthPx, setDayColumnWidthPx] = useState(120);
  const [hoveredTinyId, setHoveredTinyId] = useState<string | null>(null);

  const [dragging, setDragging] = useState<{
    id: string;
    iso: string;
    targetIso: string;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    payload: any;
  } | null>(null);

  const dragStateRef = useRef<{
    id: string;
    iso: string;
    targetIso: string;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    payload: any;
  } | null>(null);

  useEffect(() => {
    const updateWidths = () => {
      const grid = bodyGridRef.current;
      if (!grid) return;

      const rect = grid.getBoundingClientRect();
      const dayCount = view === "week" ? 7 : 1;
      const usableWidth = Math.max(0, rect.width - TIME_COL_WIDTH);
      const nextDayWidth = usableWidth > 0 ? usableWidth / dayCount : 120;

      setDayColumnWidthPx(nextDayWidth);
    };

    updateWidths();

    const grid = bodyGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => updateWidths());
    ro.observe(grid);
    window.addEventListener("resize", updateWidths);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateWidths);
    };
  }, [view]);

  const getDayIsoFromClientX = useCallback(
    (clientX: number) => {
      if (view !== "week") return anchorISO;

      const grid = bodyGridRef.current;
      if (!grid || weekDays.length !== 7) return null;

      const rect = grid.getBoundingClientRect();
      const usableLeft = rect.left + TIME_COL_WIDTH;
      const usableWidth = rect.width - TIME_COL_WIDTH;

      if (usableWidth <= 0) return null;
      if (clientX < usableLeft || clientX > rect.right) return null;

      const xInDays = clientX - usableLeft;
      const colWidth = usableWidth / 7;
      const rawIndex = Math.floor(xInDays / colWidth);
      const index = Math.max(0, Math.min(6, rawIndex));

      return weekDays[index]?.iso ?? null;
    },
    [anchorISO, view, weekDays]
  );

  const commitMove = useCallback(
    async (finalClientX?: number) => {
      const active = dragStateRef.current;
      dragStateRef.current = null;

      if (!active) {
        setDragging(null);
        return;
      }

      const item = itemsById.get(active.id);
      if (!item) {
        setDragging(null);
        return;
      }

      let resolvedTargetIso = active.targetIso;

      if (typeof finalClientX === "number") {
        const dropIso = getDayIsoFromClientX(finalClientX);
        if (dropIso) resolvedTargetIso = dropIso;
      }

      const movedEnough =
        Math.abs(active.deltaY) >= DRAG_THRESHOLD_PX ||
        Math.abs(active.deltaX) >= DRAG_THRESHOLD_PX ||
        resolvedTargetIso !== active.iso;

      if (!movedEnough) {
        setDragging(null);
        setSelected(active.payload);
        return;
      }

      const originalStart = new Date(item.start_at);
      const originalEnd = new Date(item.end_at);
      const durationMin = Math.round((originalEnd.getTime() - originalStart.getTime()) / 60000);

      const snappedMin = Math.round(active.deltaY / pxPerMin / 5) * 5;
      const targetIso = resolvedTargetIso || active.iso;

      const nextStart = new Date(`${targetIso}T00:00:00`);
      nextStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      nextStart.setMinutes(nextStart.getMinutes() + snappedMin);

      const nextEnd = new Date(nextStart.getTime() + durationMin * 60000);

      const nextStartMinutes = nextStart.getHours() * 60 + nextStart.getMinutes();
      const nextEndMinutes = nextEnd.getHours() * 60 + nextEnd.getMinutes();

      if (nextStartMinutes < startHour * 60 || nextEndMinutes > endHour * 60) {
        setDragging(null);
        return;
      }

      if (toLocalISODate(nextStart) !== targetIso || toLocalISODate(nextEnd) !== targetIso) {
        setDragging(null);
        return;
      }

      setDragging(null);
      await onMoveAppointment(active.id, nextStart.toISOString(), nextEnd.toISOString());
    },
    [getDayIsoFromClientX, itemsById, onMoveAppointment, pxPerMin, setSelected, startHour, endHour]
  );

  const onPointerDownEvent = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, appointmentId: string, iso: string, payload: any) => {
      if (moveSavingId) return;

      e.preventDefault();
      e.stopPropagation();

      const start = {
        id: appointmentId,
        iso,
        targetIso: iso,
        startX: e.clientX,
        startY: e.clientY,
        deltaX: 0,
        deltaY: 0,
        payload,
      };

      dragStateRef.current = start;
      setDragging(start);

      const onMove = (ev: PointerEvent) => {
        const active = dragStateRef.current;
        if (!active) return;

        const nextTargetIso = getDayIsoFromClientX(ev.clientX) ?? active.iso;
        const next = {
          ...active,
          targetIso: nextTargetIso,
          deltaX: ev.clientX - active.startX,
          deltaY: ev.clientY - active.startY,
          payload: active.payload,
        };

        dragStateRef.current = next;
        setDragging(next);
      };

      const onUp = async (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await commitMove(ev.clientX);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [commitMove, getDayIsoFromClientX, moveSavingId]
  );

  return (
    <>
      {(view === "week" || view === "day") ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div
            className="week-grid-scroll overflow-auto"
            ref={scrollRef}
            onScroll={onScroll}
            style={{
              maxHeight: 800,
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <div
              ref={bodyGridRef}
              style={{
                minWidth: view === "week" ? 920 : 0,
              }}
            >
              <div
                className="grid sticky top-0 z-20 bg-[#111214]/95 backdrop-blur"
                style={{
                  gridTemplateColumns: view === "week" ? `84px repeat(7, minmax(0, 1fr))` : `84px minmax(0, 1fr)`,
                  borderBottom: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div />
                {(view === "week" ? weekDays : weekDays.filter((d) => d.iso === anchorISO)).map((d) => {
                  const head = fmtDayHeader(d.date);
                  return (
                    <div
                      key={d.iso}
                      className="px-3 py-3"
                      style={{
                        borderLeft: "1px solid rgba(255,255,255,0.10)",
                        backgroundColor: d.isToday ? "rgba(255,255,255,0.04)" : "transparent",
                      }}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/45">
                        {head.dow}
                      </div>
                      <div className="mt-1 text-lg font-extrabold text-white">{head.day}</div>
                    </div>
                  );
                })}
              </div>

              <div
                className="grid"
                style={{
                  gridTemplateColumns: view === "week" ? `84px repeat(7, minmax(0, 1fr))` : `84px minmax(0, 1fr)`,
                }}
              >
                <div className="relative" style={{ height: totalHeight }}>
                  {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
                    const h = startHour + i;
                    const isFirst = i === 0;
                    return (
                      <div
                        key={h}
                        className="absolute left-0 w-full text-right text-xs text-white/45"
                        style={{
                          top: i * pxPerHour,
                          transform: isFirst ? "translateY(6px)" : "translateY(-50%)",
                          paddingRight: 14,
                          paddingLeft: 10,
                          lineHeight: 1,
                          pointerEvents: "none",
                        }}
                      >
                        {pad2(h)}:00
                      </div>
                    );
                  })}
                </div>

                {(view === "week" ? weekDays.map((d) => d.iso) : [anchorISO]).map((iso, idx) => {
                  const isToday = iso === todayISO;
                  const dayEvents = view === "week" ? positionedWeekByDay.get(iso) ?? [] : positionedDay;

                  const gridBg: React.CSSProperties = {
                    backgroundImage: `
                    linear-gradient(to bottom, rgba(255,255,255,0.10) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
                  `,
                    backgroundSize: `100% ${pxPerHour}px, 100% ${pxPerHour / 2}px`,
                    backgroundPosition: `0 0, 0 0`,
                  };

                  const todayTint: React.CSSProperties = isToday ? { backgroundColor: "rgba(255,255,255,0.03)" } : {};
                  const borderRight = view === "week" && idx < 6 ? "1px solid rgba(255,255,255,0.14)" : "none";

                  return (
                    <div
                      key={iso}
                      className="relative"
                      style={{
                        height: totalHeight,
                        ...gridBg,
                        ...todayTint,
                        borderLeft: "1px solid rgba(255,255,255,0.14)",
                        borderRight,
                      }}
                    >
                      {nowInfo && nowInfo.iso === iso ? (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: nowInfo.top,
                            height: 2,
                            backgroundColor: "#ff3b30",
                            zIndex: 10,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: -4,
                              top: -4,
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              backgroundColor: "#ff3b30",
                              boxShadow: "0 0 0 3px rgba(255,59,48,0.18)",
                            }}
                          />
                        </div>
                      ) : null}

                      {dayEvents
                        .filter((ev) => {
                          if (!viewportH) return true;

                          const top = ev._top;
                          const bottom = ev._top + ev._height;

                          const vTop = Math.max(0, scrollTop - overscanPx);
                          const vBottom = scrollTop + viewportH + overscanPx;

                          return bottom >= vTop && top <= vBottom;
                        })
                        .map((ev) => {
                          const theme = tenantTheme(ev.tenantName);
                          const badge = getReminderBadge(ev.reminderSentAt);
                          const leftPct = (ev._col / ev._cols) * 100;
                          const widthPct = 100 / ev._cols;
                          const isDragging = dragging?.id === ev.id;
                          const dragOffsetX = isDragging ? dragging.deltaX : 0;
                          const dragOffsetY = isDragging ? dragging.deltaY : 0;
                          const isSaving = moveSavingId === ev.id;

                          const eventWidthPx = Math.max(16, dayColumnWidthPx / ev._cols - 6);
                          const isTiny = eventWidthPx < 72;
                          const isCompact = !isTiny && eventWidthPx < 116;

                          const tooltipOpen = hoveredTinyId === ev.id && isTiny && !dragging;

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onPointerDown={(e) => onPointerDownEvent(e, ev.id, iso, ev)}
                              onMouseEnter={() => {
                                if (!dragging && isTiny) setHoveredTinyId(ev.id);
                              }}
                              onMouseLeave={() => {
                                if (hoveredTinyId === ev.id) setHoveredTinyId(null);
                              }}
                              onBlur={() => {
                                if (hoveredTinyId === ev.id) setHoveredTinyId(null);
                              }}
                              title={!isTiny ? `${ev._timeLine} ${ev._customer} · ${badge.sent ? "Reminder gesendet" : "Reminder offen"}` : undefined}
                              style={{
                                position: "absolute",
                                top: ev._top,
                                height: ev._height,
                                left: `calc(${leftPct}% + 3px)`,
                                width: `calc(${widthPct}% - 6px)`,
                                backgroundColor: theme.bg,
                                color: theme.text,
                                border: "1px solid rgba(255,255,255,0.10)",
                                borderRadius: isTiny ? 10 : 12,
                                padding: isTiny ? "4px" : isCompact ? "6px 8px" : "8px 10px",
                                textAlign: "left",
                                overflow: isTiny ? "visible" : "hidden",
                                zIndex: tooltipOpen ? 30 : isDragging ? 20 : 1,
                                boxShadow: isDragging
                                  ? "0 18px 34px rgba(0,0,0,0.42)"
                                  : "0 10px 24px rgba(0,0,0,0.28)",
                                cursor: isSaving ? "progress" : isDragging ? "grabbing" : "grab",
                                transition: isDragging ? "none" : "transform 120ms ease, box-shadow 120ms ease",
                                transform: isDragging
                                  ? `translate(${dragOffsetX}px, ${dragOffsetY}px)`
                                  : "translate(0px, 0px)",
                                opacity: isSav{clusterInfo.clusters.map((cluster) => {
                        const badge = getReminderBadge(cluster.dominantReminderSentAt);
                        const isHovered = hoveredClusterId === cluster.id;
                        const names = cluster.events.map((x) => shortCustomerName(x._customer));
                        const uniqueTenants = [...new Set(cluster.events.map((x) => x.tenantName))];
                        const tenantMeta = uniqueTenants.map((tenantName) => ({
                          tenantName,
                          theme: luxuryTheme(tenantTheme(tenantName)),
                        }));
                        const topLine = cluster.events[0]?._timeLine ?? "Parallel";
                        const clusterGlow = tenantMeta
                          .slice(0, 4)
                          .map((entry) => `0 0 18px ${withAlpha(entry.theme.accent, "18")}`)
                          .join(", ");

                        return (
                          <button
                            key={cluster.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelected(cluster.events[0]);
                            }}
                            onMouseEnter={() => setHoveredClusterId(cluster.id)}
                            onMouseLeave={() => setHoveredClusterId((current) => (current === cluster.id ? null : current))}
                            style={{
                              position: "absolute",
                              top: cluster.top,
                              left: 6,
                              width: "calc(100% - 12px)",
                              height: Math.max(74, Math.min(110, cluster.height)),
                              borderRadius: 18,
                              background:
                                "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(20,21,24,0.98) 18%, rgba(11,12,15,0.995) 100%)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              boxShadow: isHovered
                                ? `0 22px 38px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.03), ${clusterGlow}`
                                : `0 18px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.03), ${clusterGlow}`,
                              textAlign: "left",
                              padding: "10px 12px 10px 18px",
                              overflow: "visible",
                              backdropFilter: "blur(10px)",
                              zIndex: isHovered ? 26 : 14,
                              transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
                              transform: isHovered ? "translateY(-1px)" : "translateY(0)",
                            }}
                            title={`${cluster.events.length} Termine · ${names.join(", ")}`}
                          >
                            {[2, 1, 0].map((offset) => (
                              <span
                                key={offset}
                                style={{
                                  position: "absolute",
                                  left: 12 + offset * 4,
                                  right: 12 - offset * 4,
                                  top: 10 + offset * 4,
                                  bottom: 10 - offset * 4,
                                  borderRadius: 16,
                                  background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(10,11,14,0.72) 100%)",
                                  border: "1px solid rgba(255,255,255,0.04)",
                                  opacity: 0.22 + offset * 0.11,
                                  zIndex: -1 - offset,
                                }}
                              />
                            ))}

                            <span
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 7,
                                overflow: "hidden",
                                borderTopLeftRadius: 18,
                                borderBottomLeftRadius: 18,
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              {tenantMeta.slice(0, 4).map((entry, index) => (
                                <span
                                  key={`${cluster.id}-rail-${entry.tenantName}`}
                                  style={{
                                    flex: 1,
                                    background: `linear-gradient(180deg, ${entry.theme.accent} 0%, ${entry.theme.accentMid} 100%)`,
                                    boxShadow: index === 0 ? undefined : "inset 0 1px 0 rgba(255,255,255,0.08)",
                                  }}
                                />
                              ))}
                            </span>

                            <div style={{ position: "relative", zIndex: 2 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    borderRadius: 999,
                                    padding: "4px 9px",
                                    background: "rgba(255,255,255,0.055)",
                                    border: "1px solid rgba(255,255,255,0.10)",
                                    color: "rgba(255,255,255,0.72)",
                                    fontSize: 11,
                                    fontWeight: 800,
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {topLine}
                                </span>

                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    {tenantMeta.slice(0, 4).map((entry) => (
                                      <span
                                        key={`${cluster.id}-dot-${entry.tenantName}`}
                                        style={{
                                          width: 8,
                                          height: 8,
                                          borderRadius: 999,
                                          backgroundColor: entry.theme.accent,
                                          boxShadow: `0 0 10px ${entry.theme.accentGlow}`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      borderRadius: 999,
                                      padding: "4px 9px",
                                      background: "rgba(255,255,255,0.055)",
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      color: "rgba(255,255,255,0.96)",
                                      fontSize: 11,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {cluster.events.length} Termine
                                  </span>
                                </div>
                              </div>

                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 15,
                                  fontWeight: 900,
                                  color: "rgba(255,255,255,0.96)",
                                  letterSpacing: "-0.01em",
                                }}
                              >
                                {names.slice(0, 2).join(", ")}
                                {cluster.events.length > 2 ? ` +${cluster.events.length - 2}` : ""}
                              </div>

                              <div
                                style={{
                                  marginTop: 9,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                  {cluster.events.slice(0, 4).map((ev, index) => {
                                    const dotTheme = luxuryTheme(tenantTheme(ev.tenantName));
                                    return (
                                      <span
                                        key={`${cluster.id}-${ev.id}`}
                                        style={{
                                          width: 22,
                                          height: 22,
                                          marginLeft: index === 0 ? 0 : -7,
                                          borderRadius: 999,
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          background: "rgba(12,13,16,0.98)",
                                          border: `1px solid ${dotTheme.accentMid}`,
                                          color: "rgba(255,255,255,0.96)",
                                          fontSize: 10,
                                          fontWeight: 900,
                                          boxShadow: `0 0 10px ${dotTheme.accentSoft}`,
                                        }}
                                      >
                                        {initialsFromName(ev._customer)}
                                      </span>
                                    );
                                  })}
                                  <span
                                    style={{
                                      minWidth: 0,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      color: "rgba(255,255,255,0.54)",
                                      fontSize: 10,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {uniqueTenants.join(" · ")}
                                  </span>
                                </div>

                                <span
                                  style={{
                                    flexShrink: 0,
                                    minWidth: 19,
                                    height: 19,
                                    borderRadius: 999,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: badge.bg,
                                    color: badge.text,
                                    border: `1px solid ${badge.border}`,
                                    fontSize: 10,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                  }}
                                >
                                  {badge.tinyLabel}
                                </span>
                              </div>
                            </div>

                            {isHovered ? (
                              <div
                                style={{
                                  position: "absolute",
                                  left: "50%",
                                  bottom: "100%",
                                  transform: "translate(-50%, -10px)",
                                  background: "linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(10,10,12,0.98) 100%)",
                                  color: "rgba(255,255,255,0.96)",
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  borderRadius: 14,
                                  padding: "11px 12px",
                                  minWidth: 210,
                                  maxWidth: 270,
                                  boxShadow: `0 20px 40px rgba(0,0,0,0.48), ${clusterGlow}`,
                                  pointerEvents: "none",
                                  zIndex: 40,
                                  textAlign: "left",
                                  backdropFilter: "blur(12px)",
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.72)" }}>
                                  Parallel laufende Termine
                                </div>
                                <div style={{ marginTop: 7, display: "grid", gap: 7 }}>
                                  {cluster.events.map((ev) => {
                                    const rowTheme = luxuryTheme(tenantTheme(ev.tenantName));
                                    return (
                                      <div key={`${cluster.id}-tooltip-${ev.id}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span
                                          style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 999,
                                            backgroundColor: rowTheme.accent,
                                            boxShadow: `0 0 8px ${rowTheme.accentGlow}`,
                                            flexShrink: 0,
                                          }}
                                        />
                                        <span style={{ minWidth: 0, fontSize: 11, color: "rgba(255,255,255,0.96)", fontWeight: 700 }}>
                                          {ev._timeLine} · {ev._customer}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}


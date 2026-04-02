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

function shortCustomerName(v: string) {
  const parts = String(v || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "Kunde";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.slice(0, 1)}.`;
}

function clampText(value: string, max: number) {
  const v = String(value || "").trim();
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function getReminderBadge(reminderSentAt?: string | null) {
  const sent = !!reminderSentAt;

  return {
    sent,
    shortLabel: sent ? "Erinnert" : "Offen",
    tinyLabel: sent ? "✓" : "!",
    bg: sent ? "rgba(16,185,129,0.14)" : "rgba(245,158,11,0.14)",
    text: sent ? "#bbf7d0" : "#fde68a",
    border: sent ? "rgba(16,185,129,0.30)" : "rgba(245,158,11,0.32)",
    solidBg: sent ? "#16a34a" : "#f59e0b",
    solidText: sent ? "#ffffff" : "#111111",
  };
}

function withAlpha(color: string, alphaHex: string) {
  if (typeof color !== "string") return color;
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) return `${color}${alphaHex}`;
  return color;
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
      {view === "week" || view === "day" ? (
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
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/45">{head.dow}</div>
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
                          const eventHeightPx = Math.max(28, ev._height);
                          const isTiny = eventWidthPx < 76 || eventHeightPx < 38;
                          const isCompact = !isTiny && (eventWidthPx < 130 || eventHeightPx < 68);
                          const isMedium = !isTiny && !isCompact && (eventWidthPx < 180 || eventHeightPx < 104);
                          const tooltipOpen = hoveredTinyId === ev.id && isTiny && !dragging;

                          const titleText = isTiny
                            ? initialsFromName(ev._customer)
                            : isCompact
                              ? clampText(shortCustomerName(ev._customer), 16)
                              : clampText(ev._customer, isMedium ? 20 : 28);

                          const timeText = isCompact ? fmtShortTime(ev._timeLine) : ev._timeLine;
                          const showTenant = !isTiny && !isCompact;
                          const glowColor = withAlpha(theme.bg, "22");
                          const borderColor = withAlpha(theme.bg, "55");
                          const topTint = withAlpha(theme.bg, "12");

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
                              title={!isTiny ? `${ev._timeLine} ${ev._customer} · ${ev.tenantName} · ${badge.sent ? "Reminder gesendet" : "Reminder offen"}` : undefined}
                              style={{
                                position: "absolute",
                                top: ev._top,
                                height: Math.max(ev._height, isTiny ? 30 : isCompact ? 46 : 58),
                                left: `calc(${leftPct}% + 3px)`,
                                width: `calc(${widthPct}% - 6px)`,
                                background: `linear-gradient(180deg, ${topTint} 0%, rgba(20,21,24,0.97) 18%, rgba(12,13,16,0.99) 100%)`,
                                color: "#ffffff",
                                border: `1px solid ${isDragging ? borderColor : "rgba(255,255,255,0.12)"}`,
                                borderRadius: isTiny ? 11 : 16,
                                padding: isTiny ? "4px 6px 4px 12px" : isCompact ? "7px 8px 7px 14px" : "9px 10px 9px 15px",
                                textAlign: "left",
                                overflow: isTiny ? "visible" : "hidden",
                                zIndex: tooltipOpen ? 30 : isDragging ? 20 : 1,
                                boxShadow: isDragging
                                  ? `0 22px 38px rgba(0,0,0,0.48), 0 0 0 1px ${borderColor}`
                                  : `0 10px 24px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 18px ${glowColor}`,
                                cursor: isSaving ? "progress" : isDragging ? "grabbing" : "grab",
                                transition: isDragging ? "none" : "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
                                transform: isDragging
                                  ? `translate(${dragOffsetX}px, ${dragOffsetY}px)`
                                  : "translate(0px, 0px)",
                                opacity: isSaving ? 0.75 : 1,
                                touchAction: "none",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: isTiny ? "center" : "space-between",
                                alignItems: isTiny ? "center" : "stretch",
                                gap: isTiny ? 0 : 6,
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: isTiny ? 5 : 6,
                                  background: `linear-gradient(180deg, ${withAlpha(theme.bg, "FF")} 0%, ${withAlpha(theme.bg, "CC")} 100%)`,
                                  borderTopLeftRadius: isTiny ? 11 : 16,
                                  borderBottomLeftRadius: isTiny ? 11 : 16,
                                  boxShadow: `0 0 14px ${withAlpha(theme.bg, "55")}`,
                                }}
                              />

                              {tooltipOpen ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    bottom: "100%",
                                    transform: "translate(-50%, -8px)",
                                    background: "rgba(10,10,12,0.96)",
                                    color: "rgba(255,255,255,0.95)",
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: 12,
                                    padding: "10px 11px",
                                    minWidth: 148,
                                    maxWidth: 196,
                                    boxShadow: "0 16px 30px rgba(0,0,0,0.45)",
                                    pointerEvents: "none",
                                    zIndex: 40,
                                    textAlign: "left",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      lineHeight: 1.1,
                                      color: "rgba(255,255,255,0.68)",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {ev._timeLine}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 5,
                                      fontSize: 12,
                                      fontWeight: 800,
                                      lineHeight: 1.15,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {ev._customer}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 5,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "rgba(255,255,255,0.72)",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: 999,
                                        backgroundColor: theme.bg,
                                        boxShadow: `0 0 10px ${withAlpha(theme.bg, "66")}`,
                                      }}
                                    />
                                    {ev.tenantName}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 8,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      borderRadius: 999,
                                      border: `1px solid ${badge.border}`,
                                      background: badge.bg,
                                      color: badge.text,
                                      padding: "3px 8px",
                                      fontSize: 10,
                                      fontWeight: 800,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {badge.sent ? "Reminder gesendet" : "Reminder offen"}
                                  </div>
                                </div>
                              ) : null}

                              {isTiny ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 4,
                                    width: "100%",
                                    paddingLeft: 2,
                                  }}
                                >
                                  <div
                                    style={{
                                      minWidth: 18,
                                      height: 18,
                                      borderRadius: 999,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: withAlpha(theme.bg, "2A"),
                                      color: "#ffffff",
                                      border: `1px solid ${withAlpha(theme.bg, "55")}`,
                                      fontSize: 10,
                                      fontWeight: 900,
                                      lineHeight: 1,
                                      boxShadow: `0 0 10px ${withAlpha(theme.bg, "33")}`,
                                    }}
                                  >
                                    {titleText}
                                  </div>
                                  <span
                                    style={{
                                      minWidth: 15,
                                      height: 15,
                                      borderRadius: 999,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: badge.bg,
                                      color: badge.text,
                                      border: `1px solid ${badge.border}`,
                                      fontSize: 8,
                                      fontWeight: 900,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {badge.tinyLabel}
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div style={{ paddingRight: 22 }}>
                                    <div
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        maxWidth: "100%",
                                        borderRadius: 999,
                                        padding: isCompact ? "2px 7px" : "3px 8px",
                                        background: "rgba(255,255,255,0.06)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        fontSize: isCompact ? 10 : 11,
                                        fontWeight: 800,
                                        color: "rgba(255,255,255,0.78)",
                                        lineHeight: 1.05,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        letterSpacing: "0.01em",
                                      }}
                                    >
                                      {timeText}
                                    </div>

                                    <div
                                      style={{
                                        marginTop: isCompact ? 6 : 7,
                                        fontSize: isCompact ? 12 : isMedium ? 14 : 15,
                                        fontWeight: 900,
                                        lineHeight: 1.08,
                                        color: "#ffffff",
                                        whiteSpace: isMedium ? "nowrap" : "normal",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        display: "-webkit-box",
                                        WebkitLineClamp: isCompact ? 1 : 2,
                                        WebkitBoxOrient: "vertical",
                                        textShadow: "0 1px 0 rgba(0,0,0,0.28)",
                                      }}
                                    >
                                      {titleText}
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 6,
                                      minHeight: 18,
                                    }}
                                  >
                                    {showTenant ? (
                                      <div
                                        style={{
                                          minWidth: 0,
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 6,
                                          fontSize: 10,
                                          fontWeight: 700,
                                          color: "rgba(255,255,255,0.58)",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: 999,
                                            backgroundColor: theme.bg,
                                            flexShrink: 0,
                                            boxShadow: `0 0 8px ${withAlpha(theme.bg, "66")}`,
                                          }}
                                        />
                                        <span
                                          style={{
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {clampText(ev.tenantName, isMedium ? 12 : 16)}
                                        </span>
                                      </div>
                                    ) : (
                                      <div />
                                    )}

                                    <span
                                      style={{
                                        flexShrink: 0,
                                        minWidth: isCompact ? 17 : 19,
                                        height: isCompact ? 17 : 19,
                                        borderRadius: 999,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: badge.bg,
                                        color: badge.text,
                                        border: `1px solid ${badge.border}`,
                                        fontSize: isCompact ? 9 : 10,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        boxShadow: `0 0 12px ${badge.sent ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.14)"}`,
                                      }}
                                    >
                                      {badge.tinyLabel}
                                    </span>
                                  </div>
                                </>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .week-grid-scroll::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
    </>
  );
}

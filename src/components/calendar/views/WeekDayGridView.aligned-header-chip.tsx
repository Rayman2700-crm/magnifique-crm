"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type ClusterGroup = {
  id: string;
  top: number;
  height: number;
  events: Positioned[];
  dominantTenantName: string;
  dominantReminderSentAt?: string | null;
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
    bg: sent ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
    text: sent ? "#d1fae5" : "#fde68a",
    border: sent ? "rgba(16,185,129,0.26)" : "rgba(245,158,11,0.28)",
    solidBg: sent ? "#16a34a" : "#d89a17",
    solidText: sent ? "#ffffff" : "#18120a",
  };
}

function withAlpha(color: string, alphaHex: string) {
  if (typeof color !== "string") return color;
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) return `${color}${alphaHex}`;
  return color;
}

function luxuryTheme(theme: { bg: string; text: string; subText: string }) {
  const accent = theme.bg || "#8b5cf6";
  return {
    accent,
    accentSoft: withAlpha(accent, "26"),
    accentMid: withAlpha(accent, "40"),
    accentGlow: withAlpha(accent, "4D"),
    accentLine: withAlpha(accent, "A8"),
    labelBg: "rgba(255,255,255,0.055)",
    labelBorder: "rgba(255,255,255,0.10)",
    cardBg:
      "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(20,21,24,0.98) 18%, rgba(11,12,15,0.995) 100%)",
    cardText: "rgba(255,255,255,0.96)",
    cardSubtle: "rgba(255,255,255,0.70)",
    cardMuted: "rgba(255,255,255,0.54)",
  };
}

function buildMultiAccentGradient(colors: string[]) {
  const safe = colors.filter(Boolean);
  if (safe.length === 0) return "linear-gradient(180deg, #8b5cf6 0%, #8b5cf6 100%)";
  if (safe.length === 1) return `linear-gradient(180deg, ${safe[0]} 0%, ${safe[0]} 100%)`;

  const step = 100 / safe.length;
  const stops = safe
    .map((color, index) => {
      const start = (index * step).toFixed(2);
      const end = ((index + 1) * step).toFixed(2);
      return `${color} ${start}%, ${color} ${end}%`;
    })
    .join(", ");

  return `linear-gradient(180deg, ${stops})`;
}

function clusterCardTheme(accentColors: string[]) {
  const primary = accentColors[0] || "#8b5cf6";
  return {
    primary,
    stripe: buildMultiAccentGradient(accentColors),
    cardBg:
      "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(18,19,22,0.985) 18%, rgba(10,11,14,0.995) 100%)",
    border: "rgba(255,255,255,0.12)",
    labelBg: "rgba(255,255,255,0.055)",
    labelBorder: "rgba(255,255,255,0.10)",
    text: "rgba(255,255,255,0.96)",
    subtle: "rgba(255,255,255,0.72)",
    muted: "rgba(255,255,255,0.56)",
    shadow: `0 18px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 20px ${withAlpha(primary, "18")}`,
    glow: withAlpha(primary, "38"),
    topLine: withAlpha(primary, "88"),
  };
}

function overlaps(a: Positioned, b: Positioned) {
  const aBottom = a._top + a._height;
  const bBottom = b._top + b._height;
  return a._top < bBottom && b._top < aBottom;
}



function getClusterDisplayHeight(eventCount: number, sourceHeight: number) {
  const base = eventCount >= 5 ? 84 : eventCount === 4 ? 80 : 76;
  return Math.max(68, Math.min(base, Math.max(68, Math.min(sourceHeight, 86))));
}

function buildClusterGroups(events: Positioned[]) {
  const sorted = [...events].sort((a, b) => a._top - b._top || a._height - b._height || a.id.localeCompare(b.id));
  const visited = new Set<string>();
  const clusters: ClusterGroup[] = [];
  const hiddenIds = new Set<string>();

  for (const seed of sorted) {
    if (visited.has(seed.id) || seed._cols < 3) continue;

    const queue: Positioned[] = [seed];
    const group: Positioned[] = [];
    visited.add(seed.id);

    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);

      for (const candidate of sorted) {
        if (visited.has(candidate.id) || candidate._cols < 3) continue;
        if (overlaps(current, candidate)) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }

    if (group.length < 3) continue;

    const dominantTenantName =
      [...group.reduce((acc, ev) => acc.set(ev.tenantName, (acc.get(ev.tenantName) ?? 0) + 1), new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? group[0].tenantName;

    const top = Math.min(...group.map((x) => x._top));
    const bottom = Math.max(...group.map((x) => x._top + x._height));

    clusters.push({
      id: `cluster-${group.map((x) => x.id).join("-")}`,
      top,
      height: Math.max(76, bottom - top),
      events: group.sort((a, b) => a._top - b._top || a._col - b._col),
      dominantTenantName,
      dominantReminderSentAt: group.find((x) => x.reminderSentAt)?.reminderSentAt ?? group[0].reminderSentAt ?? null,
    });

    group.forEach((ev) => hiddenIds.add(ev.id));
  }

  return { clusters, hiddenIds };
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dayColumnWidthPx, setDayColumnWidthPx] = useState(120);
  const [hoveredTinyId, setHoveredTinyId] = useState<string | null>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [openClusterId, setOpenClusterId] = useState<string | null>(null);

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

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (!container.contains(ev.target as Node)) {
        setOpenClusterId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
    (
      e: {
        clientX: number;
        clientY: number;
        preventDefault: () => void;
        stopPropagation: () => void;
      },
      appointmentId: string,
      iso: string,
      payload: any
    ) => {
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
      setOpenClusterId(null);

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

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [commitMove, getDayIsoFromClientX, moveSavingId]
  );

  const clusteredByDay = useMemo(() => {
    const map = new Map<string, { clusters: ClusterGroup[]; hiddenIds: Set<string> }>();
    const dayIsos = view === "week" ? weekDays.map((d) => d.iso) : [anchorISO];

    for (const iso of dayIsos) {
      const events = view === "week" ? positionedWeekByDay.get(iso) ?? [] : positionedDay;
      map.set(iso, buildClusterGroups(events));
    }

    return map;
  }, [anchorISO, positionedDay, positionedWeekByDay, view, weekDays]);

  const openClusterData = useMemo(() => {
    if (!openClusterId) return null;

    for (const [iso, info] of clusteredByDay.entries()) {
      const cluster = info.clusters.find((entry) => entry.id === openClusterId);
      if (cluster) {
        return { iso, cluster };
      }
    }

    return null;
  }, [clusteredByDay, openClusterId]);


  const draggingPreview = useMemo(() => {
    if (!dragging?.payload) return null;

    const payload = dragging.payload as Positioned;
    const previewHeight = Math.max(payload._height ?? 62, 62);
    const rawTop = (payload._top ?? 0) + dragging.deltaY;
    const maxTop = Math.max(0, totalHeight - previewHeight);
    const previewTop = Math.max(0, Math.min(maxTop, rawTop));

    return {
      id: payload.id,
      iso: dragging.targetIso || dragging.iso,
      top: previewTop,
      height: previewHeight,
      tenantName: payload.tenantName,
      customer: payload._customer,
      timeLine: payload._timeLine,
      reminderSentAt: payload.reminderSentAt,
    };
  }, [dragging, totalHeight]);

  return (
    <>
      {view === "week" || view === "day" ? (
        <div ref={containerRef} className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
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
                  const clusterInfo = clusteredByDay.get(iso) ?? { clusters: [], hiddenIds: new Set<string>() };

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
                  const isDragTargetDay = draggingPreview?.iso === iso;

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

                      {draggingPreview && isDragTargetDay ? (() => {
                        const previewBaseTheme = tenantTheme(draggingPreview.tenantName);
                        const previewTheme = luxuryTheme(previewBaseTheme);
                        const previewBadge = getReminderBadge(draggingPreview.reminderSentAt);
                        const previewCompact = draggingPreview.height < 82;

                        return (
                          <>
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: `linear-gradient(180deg, ${withAlpha(previewTheme.accent, "12")} 0%, transparent 32%)`,
                                boxShadow: `inset 0 0 0 1px ${withAlpha(previewTheme.accent, "36")}`,
                                pointerEvents: "none",
                                zIndex: 11,
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: draggingPreview.top,
                                left: 8,
                                width: "calc(100% - 16px)",
                                height: draggingPreview.height,
                                borderRadius: 18,
                                background: previewTheme.cardBg,
                                border: `1px solid ${withAlpha(previewTheme.accent, "A8")}`,
                                boxShadow: `0 26px 48px rgba(0,0,0,0.44), 0 0 0 1px rgba(255,255,255,0.04), 0 0 0 3px ${withAlpha(previewTheme.accent, "24")}, inset 0 0 24px ${previewTheme.accentSoft}`,
                                color: previewTheme.cardText,
                                padding: previewCompact ? "8px 10px 8px 15px" : "10px 12px 10px 16px",
                                pointerEvents: "none",
                                zIndex: 22,
                                opacity: 0.96,
                                backdropFilter: "blur(12px)",
                                transform: "scale(1.01)",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 6,
                                  background: `linear-gradient(180deg, ${previewTheme.accent} 0%, ${previewTheme.accentMid} 100%)`,
                                  borderTopLeftRadius: 18,
                                  borderBottomLeftRadius: 18,
                                  boxShadow: `0 0 18px ${previewTheme.accentGlow}`,
                                }}
                              />
                              <div style={{ paddingRight: 26 }}>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    borderRadius: 999,
                                    padding: "4px 9px",
                                    background: previewTheme.labelBg,
                                    border: `1px solid ${previewTheme.labelBorder}`,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: previewTheme.cardSubtle,
                                    lineHeight: 1.05,
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {previewCompact ? fmtShortTime(draggingPreview.timeLine) : draggingPreview.timeLine}
                                </div>
                                <div
                                  style={{
                                    marginTop: previewCompact ? 7 : 8,
                                    fontSize: previewCompact ? 13 : 15,
                                    fontWeight: 900,
                                    lineHeight: 1.08,
                                    color: previewTheme.cardText,
                                    letterSpacing: "-0.01em",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: previewCompact ? "nowrap" : "normal",
                                    display: "-webkit-box",
                                    WebkitLineClamp: previewCompact ? 1 : 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {previewCompact ? clampText(shortCustomerName(draggingPreview.customer), 18) : clampText(draggingPreview.customer, 28)}
                                </div>
                              </div>
                              <span
                                style={{
                                  position: "absolute",
                                  right: 10,
                                  bottom: 10,
                                  minWidth: 19,
                                  height: 19,
                                  borderRadius: 999,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: previewBadge.bg,
                                  color: previewBadge.text,
                                  border: `1px solid ${previewBadge.border}`,
                                  fontSize: 10,
                                  fontWeight: 900,
                                  lineHeight: 1,
                                }}
                              >
                                {previewBadge.tinyLabel}
                              </span>
                            </div>
                          </>
                        );
                      })() : null}

                      {clusterInfo.clusters.map((cluster) => {
                        const badge = getReminderBadge(cluster.dominantReminderSentAt);
                        const isHovered = hoveredClusterId === cluster.id;
                        const isOpen = openClusterId === cluster.id;
                        const names = cluster.events.map((x) => shortCustomerName(x._customer));
                        const uniqueTenants = [...new Set(cluster.events.map((x) => x.tenantName))];
                        const topLine = cluster.events[0]?._timeLine ?? "Parallel";
                        const accentColors = uniqueTenants.map((tenantName) => luxuryTheme(tenantTheme(tenantName)).accent);
                        const clusterTheme = clusterCardTheme(accentColors);
                        const displayHeight = getClusterDisplayHeight(cluster.events.length, cluster.height);
                        const compactCluster = displayHeight <= 80;
                        const clusterInitials = cluster.events.map((x) => initialsFromName(x._customer));
                        const visibleClusterEvents = cluster.events.slice(0, 4);
                        const remainingClusterCount = Math.max(0, cluster.events.length - visibleClusterEvents.length);

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
                              setOpenClusterId((current) => (current === cluster.id ? null : cluster.id));
                            }}
                            onMouseEnter={() => setHoveredClusterId(cluster.id)}
                            onMouseLeave={() => setHoveredClusterId((current) => (current === cluster.id ? null : current))}
                            style={{
                              position: "absolute",
                              top: cluster.top,
                              left: 6,
                              width: "calc(100% - 12px)",
                              height: displayHeight,
                              borderRadius: 18,
                              background: clusterTheme.cardBg,
                              border: `1px solid ${isHovered ? withAlpha(clusterTheme.primary, "66") : clusterTheme.border}`,
                              boxShadow: clusterTheme.shadow,
                              textAlign: "left",
                              padding: "10px 12px 10px 16px",
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
                                background: clusterTheme.stripe,
                                borderTopLeftRadius: 18,
                                borderBottomLeftRadius: 18,
                                boxShadow: `0 0 18px ${clusterTheme.glow}`,
                              }}
                            />

                            <div style={{ position: "relative", zIndex: 2 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    borderRadius: 999,
                                    padding: compactCluster ? "3px 8px" : "4px 9px",
                                    background: clusterTheme.labelBg,
                                    border: `1px solid ${clusterTheme.labelBorder}`,
                                    color: clusterTheme.subtle,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: "0.01em",
                                    whiteSpace: "nowrap",
                                    lineHeight: 1,
                                  }}
                                >
                                  {fmtShortTime(topLine)}
                                </span>

                                <span
                                  style={{
                                    flexShrink: 0,
                                    width: compactCluster ? 24 : 26,
                                    height: compactCluster ? 24 : 26,
                                    borderRadius: 999,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
                                    color: "#ffffff",
                                    fontSize: 11,
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    boxShadow: "0 10px 18px rgba(37,99,235,0.34), inset 0 1px 0 rgba(255,255,255,0.18)",
                                  }}
                                  title={`${cluster.events.length} Termine`}
                                >
                                  {cluster.events.length}
                                </span>
                              </div>

                              <div
                                style={{
                                  marginTop: compactCluster ? 8 : 10,
                                  paddingRight: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  minWidth: 0,
                                  flexWrap: "nowrap",
                                }}
                              >
                                {visibleClusterEvents.map((ev) => {
                                  const evTheme = luxuryTheme(tenantTheme(ev.tenantName));
                                  const evBadge = getReminderBadge(ev.reminderSentAt);
                                  return (
                                    <span
                                      key={`${cluster.id}-chip-${ev.id}`}
                                      style={{
                                        position: "relative",
                                        width: compactCluster ? 20 : 22,
                                        height: compactCluster ? 20 : 22,
                                        borderRadius: 999,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "rgba(255,255,255,0.05)",
                                        color: clusterTheme.text,
                                        border: `1px solid ${evTheme.accentMid}`,
                                        fontSize: compactCluster ? 10 : 10,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        boxShadow: `0 0 10px ${evTheme.accentSoft}`,
                                        flexShrink: 0,
                                      }}
                                      title={`${ev._customer} · ${evBadge.sent ? "Reminder gesendet" : "Reminder offen"}`}
                                    >
                                      {initialsFromName(ev._customer).slice(0, 1)}
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: -1,
                                          right: -1,
                                          width: 6,
                                          height: 6,
                                          borderRadius: 999,
                                          background: evBadge.sent ? "#16a34a" : "#d89a17",
                                          boxShadow: `0 0 0 1px rgba(10,11,14,0.92), 0 0 8px ${evBadge.sent ? "rgba(22,163,74,0.35)" : "rgba(216,154,23,0.35)"}`,
                                        }}
                                      />
                                    </span>
                                  );
                                })}
                                {remainingClusterCount > 0 ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      minWidth: compactCluster ? 20 : 22,
                                      height: compactCluster ? 20 : 22,
                                      borderRadius: 999,
                                      background: "rgba(255,255,255,0.05)",
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      color: clusterTheme.text,
                                      fontSize: compactCluster ? 10 : 10,
                                      fontWeight: 800,
                                      lineHeight: 1,
                                      flexShrink: 0,
                                    }}
                                  >
                                    +{remainingClusterCount}
                                  </span>
                                ) : null}
                              </div>
                            </div>


                            {isOpen ? null : null}

                            {isHovered ? (
                              <div
                                style={{
                                  position: "absolute",
                                  left: "50%",
                                  bottom: "100%",
                                  transform: "translate(-50%, -10px)",
                                  background: "linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(10,10,12,0.98) 100%)",
                                  color: "rgba(255,255,255,0.96)",
                                  border: "1px solid rgba(255,255,255,0.16)",
                                  borderRadius: 14,
                                  padding: "11px 12px",
                                  minWidth: 196,
                                  maxWidth: 260,
                                  boxShadow: `0 20px 40px rgba(0,0,0,0.48), 0 0 24px ${withAlpha(clusterTheme.primary, "18")}`,
                                  pointerEvents: "none",
                                  zIndex: 40,
                                  textAlign: "left",
                                  backdropFilter: "blur(12px)",
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 800, color: clusterTheme.subtle }}>
                                  Parallel laufende Termine
                                </div>
                                <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
                                  {cluster.events.map((ev) => {
                                    const rowAccent = luxuryTheme(tenantTheme(ev.tenantName)).accent;
                                    return (
                                      <div key={`${cluster.id}-tooltip-${ev.id}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span
                                          style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 999,
                                            backgroundColor: rowAccent,
                                            boxShadow: `0 0 8px ${withAlpha(rowAccent, "66")}`,
                                            flexShrink: 0,
                                          }}
                                        />
                                        <span style={{ minWidth: 0, fontSize: 11, color: clusterTheme.text, fontWeight: 700 }}>
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

                      {dayEvents
                        .filter((ev) => !clusterInfo.hiddenIds.has(ev.id))
                        .filter((ev) => {
                          if (!viewportH) return true;

                          const top = ev._top;
                          const bottom = ev._top + ev._height;
                          const vTop = Math.max(0, scrollTop - overscanPx);
                          const vBottom = scrollTop + viewportH + overscanPx;

                          return bottom >= vTop && top <= vBottom;
                        })
                        .map((ev) => {
                          const baseTheme = tenantTheme(ev.tenantName);
                          const theme = luxuryTheme(baseTheme);
                          const badge = getReminderBadge(ev.reminderSentAt);
                          const leftPct = (ev._col / ev._cols) * 100;
                          const widthPct = 100 / ev._cols;
                          const isDragging = dragging?.id === ev.id;
                          const dragOffsetX = isDragging ? dragging.deltaX : 0;
                          const dragOffsetY = isDragging ? dragging.deltaY : 0;
                          const isSaving = moveSavingId === ev.id;

                          const eventWidthPx = Math.max(16, dayColumnWidthPx / ev._cols - 6);
                          const eventHeightPx = Math.max(28, ev._height);
                          const isTiny = eventWidthPx < 80 || eventHeightPx < 38;
                          const isCompact = !isTiny && (eventWidthPx < 138 || eventHeightPx < 68);
                          const isMedium = !isTiny && !isCompact && (eventWidthPx < 190 || eventHeightPx < 104);
                          const tooltipOpen = hoveredTinyId === ev.id && isTiny && !dragging;

                          const titleText = isTiny
                            ? initialsFromName(ev._customer)
                            : isCompact
                              ? clampText(shortCustomerName(ev._customer), 16)
                              : clampText(ev._customer, isMedium ? 22 : 30);

                          const timeText = isCompact ? fmtShortTime(ev._timeLine) : ev._timeLine;
                          const showTenant = !isTiny && !isCompact;

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}

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
                                height: Math.max(ev._height, isTiny ? 30 : isCompact ? 48 : 62),
                                left: `calc(${leftPct}% + 4px)`,
                                width: `calc(${widthPct}% - 8px)`,
                                background: theme.cardBg,
                                color: theme.cardText,
                                border: `1px solid ${isDragging ? theme.accentLine : "rgba(255,255,255,0.11)"}`,
                                borderRadius: isTiny ? 12 : 18,
                                padding: isTiny ? "4px 7px 4px 13px" : isCompact ? "8px 9px 8px 15px" : "10px 11px 10px 16px",
                                textAlign: "left",
                                overflow: isTiny ? "visible" : "hidden",
                                zIndex: tooltipOpen ? 30 : isDragging ? 20 : 1,
                                boxShadow: isDragging
                                  ? `0 24px 40px rgba(0,0,0,0.50), 0 0 0 1px ${theme.accentLine}`
                                  : `0 16px 32px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 20px ${theme.accentSoft}`,
                                cursor: isSaving ? "progress" : isDragging ? "grabbing" : "pointer",
                                transition: isDragging ? "none" : "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
                                transform: isDragging
                                  ? `translate(${dragOffsetX}px, ${dragOffsetY}px)`
                                  : "translate(0px, 0px)",
                                opacity: isSaving ? 0.75 : isDragging ? 0.28 : 1,
                                touchAction: "none",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: isTiny ? "center" : "space-between",
                                alignItems: isTiny ? "center" : "stretch",
                                gap: isTiny ? 0 : 7,
                                backdropFilter: "blur(10px)",
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelected(ev);
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: isTiny ? 5 : 6,
                                  background: `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accentMid} 100%)`,
                                  borderTopLeftRadius: isTiny ? 12 : 18,
                                  borderBottomLeftRadius: isTiny ? 12 : 18,
                                  boxShadow: `0 0 18px ${theme.accentGlow}`,
                                }}
                              />

                              {!isTiny ? (
                                <span
                                  style={{
                                    position: "absolute",
                                    inset: "0 auto auto 12px",
                                    width: 48,
                                    height: 1,
                                    background: `linear-gradient(90deg, ${theme.accentLine} 0%, transparent 100%)`,
                                    opacity: 0.85,
                                  }}
                                />
                              ) : null}


                              <div
                                role="button"
                                aria-label="Termin verschieben"
                                onPointerDownCapture={(e) => {
                                  onPointerDownEvent(e, ev.id, iso, ev);
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                style={{
                                  position: "absolute",
                                  top: isTiny ? 6 : 6,
                                  right: isTiny ? 6 : 6,
                                  width: isTiny ? 18 : isCompact ? 18 : 20,
                                  height: isTiny ? 18 : isCompact ? 18 : 20,
                                  borderRadius: 999,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(255,255,255,0.10)",
                                  border: "1px solid rgba(255,255,255,0.16)",
                                  color: "rgba(255,255,255,0.78)",
                                  cursor: isSaving ? "progress" : "grab",
                                  zIndex: 3,
                                  fontSize: isTiny ? 9 : isCompact ? 9 : 11,
                                  lineHeight: 1,
                                  userSelect: "none",
                                  WebkitUserSelect: "none",
                                }}
                                title="Ziehen zum Verschieben"
                              >
                                ⋮⋮
                              </div>

                              {tooltipOpen ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    bottom: "100%",
                                    transform: "translate(-50%, -10px)",
                                    background: "linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(10,10,12,0.98) 100%)",
                                    color: "rgba(255,255,255,0.96)",
                                    border: `1px solid ${theme.accentLine}`,
                                    borderRadius: 14,
                                    padding: "11px 12px",
                                    minWidth: 154,
                                    maxWidth: 210,
                                    boxShadow: `0 20px 40px rgba(0,0,0,0.48), 0 0 24px ${theme.accentSoft}`,
                                    pointerEvents: "none",
                                    zIndex: 40,
                                    textAlign: "left",
                                    backdropFilter: "blur(12px)",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      lineHeight: 1.1,
                                      color: theme.cardSubtle,
                                      letterSpacing: "0.02em",
                                    }}
                                  >
                                    {ev._timeLine}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 13,
                                      fontWeight: 900,
                                      lineHeight: 1.15,
                                      color: theme.cardText,
                                    }}
                                  >
                                    {ev._customer}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 6,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: theme.cardMuted,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: 999,
                                        backgroundColor: theme.accent,
                                        boxShadow: `0 0 10px ${theme.accentGlow}`,
                                      }}
                                    />
                                    {ev.tenantName}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 9,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      borderRadius: 999,
                                      border: `1px solid ${badge.border}`,
                                      background: badge.bg,
                                      color: badge.text,
                                      padding: "4px 9px",
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
                                    gap: 5,
                                    width: "100%",
                                    paddingLeft: 2,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      borderRadius: 999,
                                      padding: "2px 6px",
                                      background: theme.labelBg,
                                      border: `1px solid ${theme.labelBorder}`,
                                      color: theme.cardSubtle,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      whiteSpace: "nowrap",
                                      flexShrink: 1,
                                      minWidth: 0,
                                    }}
                                  >
                                    {fmtShortTime(ev._timeLine)}
                                  </span>
                                  <div
                                    style={{
                                      position: "relative",
                                      minWidth: 18,
                                      width: 18,
                                      height: 18,
                                      borderRadius: 999,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: "rgba(255,255,255,0.05)",
                                      color: theme.cardText,
                                      border: `1px solid ${theme.accentMid}`,
                                      fontSize: 10,
                                      fontWeight: 900,
                                      lineHeight: 1,
                                      boxShadow: `0 0 12px ${theme.accentSoft}`,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {titleText}
                                    <span
                                      style={{
                                        position: "absolute",
                                        top: -1,
                                        right: -1,
                                        width: 6,
                                        height: 6,
                                        borderRadius: 999,
                                        background: badge.sent ? "#16a34a" : "#d89a17",
                                        boxShadow: `0 0 0 1px rgba(10,11,14,0.92), 0 0 8px ${badge.sent ? "rgba(22,163,74,0.35)" : "rgba(216,154,23,0.35)"}`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div style={{ paddingRight: isCompact ? 26 : 22 }}>
                                    {isCompact ? (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          paddingRight: 18,
                                          minWidth: 0,
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            maxWidth: "100%",
                                            borderRadius: 999,
                                            padding: "2px 6px",
                                            background: theme.labelBg,
                                            border: `1px solid ${theme.labelBorder}`,
                                            fontSize: 9,
                                            fontWeight: 700,
                                            color: theme.cardSubtle,
                                            lineHeight: 1.05,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            letterSpacing: "0.02em",
                                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                                            flexShrink: 1,
                                            minWidth: 0,
                                          }}
                                        >
                                          {timeText}
                                        </div>

                                        <div
                                          style={{
                                            position: "relative",
                                            minWidth: 18,
                                            width: 18,
                                            height: 18,
                                            borderRadius: 999,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            background: "rgba(255,255,255,0.05)",
                                            color: theme.cardText,
                                            border: `1px solid ${theme.accentMid}`,
                                            fontSize: 10,
                                            fontWeight: 900,
                                            lineHeight: 1,
                                            boxShadow: `0 0 10px ${theme.accentSoft}`,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {initialsFromName(ev._customer).slice(0, 1)}
                                          <span
                                            style={{
                                              position: "absolute",
                                              top: -1,
                                              right: -1,
                                              width: 6,
                                              height: 6,
                                              borderRadius: 999,
                                              background: badge.sent ? "#16a34a" : "#d89a17",
                                              boxShadow: `0 0 0 1px rgba(10,11,14,0.92), 0 0 8px ${badge.sent ? "rgba(22,163,74,0.35)" : "rgba(216,154,23,0.35)"}`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          maxWidth: "100%",
                                          borderRadius: 999,
                                          padding: "2px 6px",
                                          background: theme.labelBg,
                                          border: `1px solid ${theme.labelBorder}`,
                                          fontSize: 9,
                                          fontWeight: 700,
                                          color: theme.cardSubtle,
                                          lineHeight: 1.05,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          letterSpacing: "0.02em",
                                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                                        }}
                                      >
                                        {timeText}
                                      </div>
                                    )}

                                    <div
                                      style={{
                                        marginTop: isCompact ? 7 : 8,
                                        fontSize: isCompact ? 12 : isMedium ? 14 : 15,
                                        fontWeight: 900,
                                        lineHeight: 1.08,
                                        color: theme.cardText,
                                        whiteSpace: isMedium ? "nowrap" : "normal",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        display: "-webkit-box",
                                        WebkitLineClamp: isCompact ? 1 : 2,
                                        WebkitBoxOrient: "vertical",
                                        letterSpacing: "-0.01em",
                                        textShadow: "0 1px 0 rgba(0,0,0,0.25)",
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
                                          color: theme.cardMuted,
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
                                            backgroundColor: theme.accent,
                                            flexShrink: 0,
                                            boxShadow: `0 0 10px ${theme.accentGlow}`,
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

                                    {!isCompact ? (
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
                                          boxShadow: `0 0 12px ${badge.sent ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.12)"}`,
                                        }}
                                      >
                                        {badge.tinyLabel}
                                      </span>
                                    ) : (
                                      <div />
                                    )}
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

      {openClusterData && !dragging ? (() => {
        const cluster = openClusterData.cluster;
        const accentColors = [...new Set(cluster.events.map((entry) => luxuryTheme(tenantTheme(entry.tenantName)).accent))];
        const panelTheme = clusterCardTheme(accentColors);
        const panelBadge = getReminderBadge(cluster.dominantReminderSentAt);
        const panelTopLine = cluster.events[0]?._timeLine ?? "Parallel";

        return (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              width: 356,
              maxWidth: "min(356px, calc(100% - 24px))",
              maxHeight: "calc(100% - 28px)",
              overflow: "hidden",
              borderRadius: 24,
              backgroundColor: "rgba(8,8,10,0.985)",
              backgroundImage: "linear-gradient(180deg, rgba(24,24,30,0.98) 0%, rgba(10,10,14,0.995) 100%)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: `0 34px 90px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.03), 0 0 40px ${withAlpha(panelTheme.primary, "1F")}`,
              zIndex: 90,
              backdropFilter: "blur(20px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "relative",
                padding: "16px 18px 14px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.09)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 6,
                  background: panelTheme.stripe,
                  boxShadow: `0 0 18px ${panelTheme.glow}`,
                }}
              />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.96)", letterSpacing: "0.02em" }}>
                    Termin wählen
                  </div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        padding: "5px 10px",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        color: "rgba(255,255,255,0.82)",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {panelTopLine}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        padding: "5px 10px",
                        background: panelBadge.bg,
                        border: `1px solid ${panelBadge.border}`,
                        color: panelBadge.text,
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {cluster.events.length} parallel
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenClusterId(null);
                  }}
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 18,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  aria-label="Menü schließen"
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: 12, overflowY: "auto", display: "grid", gap: 10 }}>
              {cluster.events.map((ev) => {
                const rowAccent = luxuryTheme(tenantTheme(ev.tenantName)).accent;
                const rowBadge = getReminderBadge(ev.reminderSentAt);
                return (
                  <button
                    key={`${cluster.id}-sidebar-${ev.id}`}
                    type="button"
                    onPointerDownCapture={(e) => {
                      onPointerDownEvent(e, ev.id, openClusterData.iso, ev);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenClusterId(null);
                      setSelected(ev);
                    }}
                    style={{
                      width: "100%",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 14px 14px 18px",
                      borderRadius: 18,
                      backgroundColor: "rgba(22,22,27,0.98)",
                      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.22)",
                      textAlign: "left",
                      cursor: "grab",
                      touchAction: "none",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 5,
                        background: `linear-gradient(180deg, ${rowAccent} 0%, ${withAlpha(rowAccent, "66")} 100%)`,
                        boxShadow: `0 0 14px ${withAlpha(rowAccent, "55")}`,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 999,
                            padding: "4px 9px",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.82)",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {ev._timeLine}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            color: "rgba(255,255,255,0.62)",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              backgroundColor: rowAccent,
                              boxShadow: `0 0 10px ${withAlpha(rowAccent, "55")}`,
                            }}
                          />
                          {ev.tenantName}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          color: "rgba(255,255,255,0.96)",
                          fontSize: 16,
                          fontWeight: 900,
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ev._customer}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          minWidth: 22,
                          height: 22,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: rowBadge.bg,
                          color: rowBadge.text,
                          border: `1px solid ${rowBadge.border}`,
                          fontSize: 10,
                          fontWeight: 900,
                        }}
                      >
                        {rowBadge.tinyLabel}
                      </span>
                      <span
                        style={{
                          width: 34,
                          height: 26,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 2,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          color: "rgba(255,255,255,0.76)",
                          fontSize: 11,
                          fontWeight: 900,
                          letterSpacing: "-0.08em",
                        }}
                      >
                        ⋮⋮
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })() : null}

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

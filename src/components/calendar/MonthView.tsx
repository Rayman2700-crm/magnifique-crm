"use client";

import type React from "react";
import type { DayMeta, Item, ViewMode } from "@/components/calendar/types";

type MonthCell = {
  iso: string;
  inMonth: boolean;
  date: Date;
};

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function tenantTheme(tenantName: string) {
  const n = (tenantName || "").toLowerCase();

  let bg = "rgba(255,255,255,0.06)";
  let text = "rgba(255,255,255,0.92)";
  let subText = "rgba(255,255,255,0.75)";

  if (n.includes("radu")) {
    bg = "#6366F1";
    text = "#0b0b0c";
    subText = "rgba(11,11,12,0.72)";
  } else if (n.includes("raluca")) {
    bg = "#6F2DA8";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
  } else if (n.includes("alexandra")) {
    bg = "#008000";
    text = "#ffffff";
    subText = "rgba(255,255,255,0.82)";
  } else if (n.includes("barbara")) {
    bg = "#F37A48";
    text = "#0b0b0c";
    subText = "rgba(11,11,12,0.72)";
  }

  return { bg, text, subText };
}

function getReminderBadge(reminderSentAt: string | null) {
  const sent = !!reminderSentAt;

  return {
    label: sent ? "Erinnert" : "Offen",
    bg: sent ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.18)",
    text: sent ? "#a7f3d0" : "#fde68a",
    border: sent ? "rgba(16,185,129,0.34)" : "rgba(245,158,11,0.34)",
  };
}

export default function MonthView({
  view,
  monthCells,
  todayISO,
  focusISO,
  dayMeta,
  eventsByDayLimited,
  setParams,
  setSelected,
}: {
  view: ViewMode;
  monthCells: MonthCell[];
  todayISO: string;
  focusISO: string | null;
  dayMeta: Map<string, DayMeta>;
  eventsByDayLimited: Map<string, Item[]>;
  setParams: (next: Partial<{ view: ViewMode; date: string; week: string; focus: string | null }>) => void;
  setSelected: React.Dispatch<React.SetStateAction<Item | null>>;
}) {
  if (view !== "month") return null;

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30"
      style={{ boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }}
    >
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div
            key={d}
            className="px-3 py-2 text-xs text-white/60"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {monthCells.map((c) => {
          const isToday = c.iso === todayISO;
          const isFocus = !!focusISO && c.iso === focusISO;
          const meta = dayMeta.get(c.iso);
          const evs = eventsByDayLimited.get(c.iso) ?? [];

          return (
            <div
              key={c.iso}
              role="button"
              tabIndex={0}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setParams({ view: "day", date: c.iso, focus: null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setParams({ view: "day", date: c.iso, focus: null });
                }
              }}
              style={{
                cursor: "pointer",
                height: 120,
                padding: 10,
                textAlign: "left",
                borderTop: "1px solid rgba(255,255,255,0.10)",
                borderRight: "1px solid rgba(255,255,255,0.10)",
                backgroundColor: c.inMonth ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.02)",
                color: "rgba(255,255,255,0.9)",
                outline: "none",
                transition: "background-color 120ms ease, box-shadow 120ms ease",
                boxShadow: isFocus ? "inset 0 0 0 2px rgba(255,255,255,0.22)" : "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = c.inMonth
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = c.inMonth
                  ? "rgba(0,0,0,0.10)"
                  : "rgba(255,255,255,0.02)";
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    backgroundColor: isToday ? "rgba(255,255,255,0.14)" : "transparent",
                    color: isToday ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.75)",
                  }}
                >
                  {c.date.getDate()}
                </div>

                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  {meta?.count ? `${meta.count}` : ""}
                </div>
              </div>

              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {evs.map((it) => {
                  const theme = tenantTheme(it.tenantName);
                  const badge = getReminderBadge(it.reminderSentAt);
                  const s = new Date(it.start_at);
                  const e = new Date(it.end_at);
                  const label = `${fmtTime(s)}–${fmtTime(e)} ${it.customerName ?? "Kunde"}`;

                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                      }}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setSelected(it);
                      }}
                      style={{
                        borderRadius: 10,
                        padding: "6px 8px",
                        backgroundColor: theme.bg,
                        color: theme.text,
                        border: "1px solid rgba(255,255,255,0.10)",
                        fontSize: 12,
                        fontWeight: 800,
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "transform 120ms ease",
                        display: "grid",
                        gap: 5,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0px)";
                      }}
                      title={`${label} · ${badge.label === "Erinnert" ? "Reminder gesendet" : "Reminder offen"}`}
                    >
                      <div
                        style={{
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {label}
                      </div>

                      <div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 999,
                            border: `1px solid ${badge.border}`,
                            background: badge.bg,
                            color: badge.text,
                            padding: "2px 7px",
                            fontSize: 10,
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

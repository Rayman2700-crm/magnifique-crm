"use client";

import type React from "react";

type ViewMode = "day" | "week" | "month" | "year";

type DayMeta = {
  count: number;
  firstLabel: string | null;
  firstTenantName: string | null;
};

type YearMonth = {
  label: string;
  iso: string;
};

type MonthCell = {
  iso: string;
  inMonth: boolean;
  date: Date;
};

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonthISO(anchorISO: string) {
  const d = new Date(`${anchorISO}T12:00:00`);
  d.setDate(1);
  return toLocalISODate(d);
}

function fmtYear(anchorISO: string) {
  const d = new Date(`${anchorISO}T12:00:00`);
  return String(d.getFullYear());
}

function buildMonthGrid(anchorISO: string): MonthCell[] {
  const start = new Date(`${startOfMonthISO(anchorISO)}T12:00:00`);
  const firstDow = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - firstDow);

  const cells: MonthCell[] = [];
  const month = start.getMonth();

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ iso: toLocalISODate(d), inMonth: d.getMonth() === month, date: d });
  }

  return cells;
}

export default function YearView({
  view,
  yearMonths,
  todayISO,
  dayMeta,
  setParams,
}: {
  view: ViewMode;
  yearMonths: YearMonth[];
  todayISO: string;
  dayMeta: Map<string, DayMeta>;
  setParams: (next: Partial<{ view: ViewMode; date: string; week: string; focus: string | null }>) => void;
}) {
  if (view !== "year") return null;

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {yearMonths.map((m) => {
        const monthGrid = buildMonthGrid(m.iso);

        return (
          <div
            key={m.iso}
            role="button"
            tabIndex={0}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setParams({ view: "month", date: m.iso, focus: null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setParams({ view: "month", date: m.iso, focus: null });
              }
            }}
            className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left"
            style={{
              boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
              cursor: "pointer",
              transition: "transform 120ms ease, background-color 120ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLDivElement).style.backgroundColor = "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)";
              (e.currentTarget as HTMLDivElement).style.backgroundColor = "rgba(0,0,0,0)";
            }}
          >
            <div className="text-white font-semibold">{m.label}</div>
            <div className="mt-1 text-sm text-white/60">{fmtYear(m.iso)}</div>

            <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {["M", "D", "M", "D", "F", "S", "S"].map((x, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.45)",
                    textAlign: "center",
                    paddingBottom: 2,
                  }}
                >
                  {x}
                </div>
              ))}
            </div>

            <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {monthGrid.map((c) => {
                const meta = dayMeta.get(c.iso);
                const isInMonth = c.iso.slice(0, 7) === m.iso.slice(0, 7);
                const isToday = c.iso === todayISO;

                const dots = meta?.count ? Math.min(3, meta.count) : 0;
                const baseText = isInMonth ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.22)";

                return (
                  <button
                    key={c.iso}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setParams({ view: "month", date: c.iso, focus: c.iso });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setParams({ view: "month", date: c.iso, focus: c.iso });
                      }
                    }}
                    title={
                      meta?.count
                        ? `${meta.count} Termine${meta.firstLabel ? ` – z.B. ${meta.firstLabel}` : ""}`
                        : ""
                    }
                    style={{
                      height: 26,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      cursor: "pointer",
                      outline: "none",
                      transition: "background-color 120ms ease",
                      backgroundColor: isToday ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.04)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = isToday
                        ? "rgba(255,255,255,0.22)"
                        : "rgba(255,255,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = isToday
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.04)";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: isToday ? 800 : 600,
                        color: isToday ? "rgba(255,255,255,0.95)" : baseText,
                        lineHeight: 1,
                      }}
                    >
                      {c.date.getDate()}
                    </div>

                    {dots > 0 ? (
                      <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                        {Array.from({ length: dots }).map((_, i) => (
                          <span
                            key={i}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 999,
                              backgroundColor: isInMonth
                                ? "rgba(255,255,255,0.75)"
                                : "rgba(255,255,255,0.25)",
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{ height: 7 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
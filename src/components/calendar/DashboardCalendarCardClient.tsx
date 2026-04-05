"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardWeekGridClient from "@/components/calendar/DashboardWeekGridClient";
import TenantLegendClient from "@/components/calendar/TenantLegendClient";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AppointmentStatus, Item, ViewMode } from "@/components/calendar/types";

type TenantJoin = { display_name: string | null };
type PersonJoin = { full_name: string | null; phone: string | null; email: string | null };

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  notes_internal: string | null;
  reminder_sent_at: string | null;
  tenant_id: string;
  person_id: string;
  tenant?: TenantJoin | TenantJoin[] | null;
  person?: PersonJoin | PersonJoin[] | null;
};

type CustomerProfileRow = {
  id: string;
  tenant_id: string;
  person_id: string;
};

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

function firstJoin<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function parseNotes(notes: string | null) {
  if (!notes) {
    return {
      title: "",
      note: "",
      status: null as AppointmentStatus | null,
    };
  }

  const lines = notes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const titleLine = lines.find((l) => l.toLowerCase().startsWith("titel:"));
  const noteLine = lines.find((l) => l.toLowerCase().startsWith("notiz:"));
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));

  const title = titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() : "";
  const note = noteLine ? noteLine.replace(/^notiz:\s*/i, "").trim() : "";
  const rawStatus = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "";

  let status: AppointmentStatus | null = null;
  if (rawStatus === "completed") status = "completed";
  else if (rawStatus === "cancelled") status = "cancelled";
  else if (rawStatus === "no_show") status = "no_show";
  else if (rawStatus === "scheduled") status = "scheduled";

  return { title, note, status };
}

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


function getLegendAvatarTheme(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();

  if (n.includes("radu")) return { ring: "#4F7CFF", bg: "rgba(79,124,255,0.16)" };
  if (n.includes("raluca")) return { ring: "#A855F7", bg: "rgba(168,85,247,0.16)" };
  if (n.includes("alexandra")) return { ring: "#22C55E", bg: "rgba(34,197,94,0.16)" };
  if (n.includes("barbara")) return { ring: "#F97316", bg: "rgba(249,115,22,0.16)" };

  return { ring: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.08)" };
}

function getLegendInitials(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

type MobileLegendPickerProps = {
  users: LegendUser[];
  activeTenantId: string | null;
  onSelect: (tenantId: string | null) => void;
};

function MobileLegendPicker({
  users,
  activeTenantId,
  onSelect,
}: MobileLegendPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [panelRight, setPanelRight] = useState(12);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelTop(Math.round(rect.bottom + 12));
      setPanelRight(Math.max(12, Math.round(window.innerWidth - rect.right)));
    };

    updatePosition();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.body.style.overflow = "";
    };
  }, [open]);

  const totalCount = users.length + 1;
  const activeUser =
    activeTenantId === null
      ? null
      : users.find((user) => user.filterTenantId === activeTenantId || user.tenantId === activeTenantId) ?? null;

  const ringColors = ["#d6c3a3", ...users.map((user) => getLegendAvatarTheme(user.fullName ?? user.tenantDisplayName).ring)];
  const ringBackground = useMemo(() => {
    const step = 100 / ringColors.length;
    return `conic-gradient(${ringColors
      .map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`)
      .join(", ")})`;
  }, [ringColors]);

  const avatarLabel = activeUser
    ? getLegendInitials(activeUser.fullName ?? activeUser.tenantDisplayName)
    : "TC";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full md:hidden"
        aria-label="Behandler auswählen"
        aria-expanded={open}
        style={{
          background: ringBackground,
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.34)",
        }}
      >
        <span className="flex h-[32px] w-[42px] items-center justify-center rounded-full border-2 border-[#111216] bg-[#0f1013] text-[12px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {avatarLabel}
        </span>

        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[10px] font-extrabold text-white shadow-[0_0_0_2px_rgba(11,11,12,0.92)]">
          {activeUser ? "1" : totalCount}
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Behandler-Auswahl schließen"
                className="fixed inset-0 z-[120] bg-[rgba(0,0,0,0.45)] backdrop-blur-[2px] md:hidden"
                onClick={() => setOpen(false)}
              />

              <div
                className="fixed z-[121] w-[min(320px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl md:hidden"
                style={{ top: panelTop, right: panelRight, maxHeight: "min(70vh, 520px)" }}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Behandler wählen</div>
                    <div className="mt-0.5 text-xs text-white/45">Team-Kalender Filter</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/70"
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                </div>

                <div className="grid max-h-[calc(min(70vh,520px)-56px)] gap-2 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(null);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                    style={{
                      borderColor: activeTenantId === null ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                      backgroundColor: activeTenantId === null ? "rgba(214,195,163,0.14)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-black">
                        Alle
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">Alle</div>
                        <div className="truncate text-xs text-white/50">Alle Behandler</div>
                      </div>
                    </div>
                    {activeTenantId === null ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                  </button>

                  {users.map((user) => {
                    const theme = getLegendAvatarTheme(user.fullName ?? user.tenantDisplayName);
                    const selected = activeTenantId === user.filterTenantId || activeTenantId === user.tenantId;
                    return (
                      <button
                        key={user.userId}
                        type="button"
                        onClick={() => {
                          onSelect(user.filterTenantId);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                        style={{
                          borderColor: selected ? `${theme.ring}66` : "rgba(255,255,255,0.10)",
                          backgroundColor: selected ? theme.bg : "rgba(255,255,255,0.04)",
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white"
                            style={{ borderColor: theme.ring }}
                          >
                            {getLegendInitials(user.fullName ?? user.tenantDisplayName)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {user.fullName ?? user.tenantDisplayName}
                            </div>
                            <div className="truncate text-xs text-white/50">{user.tenantDisplayName}</div>
                          </div>
                        </div>
                        {selected ? <span className="pl-3 text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}



function MobileCircleActionButton({
  label,
  onClick,
  variant = "dark",
  children,
}: {
  label: string;
  onClick: () => void;
  variant?: "dark" | "primary";
  children: ReactNode;
}) {
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
        onClick();
      }}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
      aria-label={label}
      style={{
        borderColor: variant === "primary" ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
        background: variant === "primary"
          ? "linear-gradient(180deg, rgba(214,195,163,0.96) 0%, rgba(214,195,163,0.88) 100%)"
          : "rgba(255,255,255,0.04)",
        color: variant === "primary" ? "#0b0b0c" : "rgba(255,255,255,0.88)",
        boxShadow: variant === "primary"
          ? "0 12px 28px rgba(214,195,163,0.22), 0 0 0 2px rgba(11,11,12,0.95)"
          : "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.30)",
      }}
    >
      {children}
    </button>
  );
}

function MobileViewPicker({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [panelRight, setPanelRight] = useState(12);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelTop(Math.round(rect.bottom + 12));
      setPanelRight(Math.max(12, Math.round(window.innerWidth - rect.right)));
    };

    updatePosition();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.body.style.overflow = "";
    };
  }, [open]);

  const options: { value: ViewMode; label: string }[] = [
    { value: "day", label: "Tag" },
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
    { value: "year", label: "Jahr" },
  ];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
        aria-label="Kalenderansicht auswählen"
        aria-expanded={open}
        style={{
          borderColor: "rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.88)",
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.30)",
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {mounted && open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Ansichtsauswahl schließen"
                className="fixed inset-0 z-[120] bg-[rgba(0,0,0,0.45)] backdrop-blur-[2px] md:hidden"
                onClick={() => setOpen(false)}
              />

              <div
                className="fixed z-[121] w-[min(260px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl md:hidden"
                style={{ top: panelTop, right: panelRight }}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Ansicht wählen</div>
                    <div className="mt-0.5 text-xs text-white/45">Kalender-Modus</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/70"
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                </div>

                <div className="grid gap-2">
                  {options.map((option) => {
                    const selected = value === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                        style={{
                          borderColor: selected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                          backgroundColor: selected ? "rgba(214,195,163,0.14)" : "rgba(255,255,255,0.04)",
                        }}
                      >
                        <span className="text-sm font-semibold text-white">{option.label}</span>
                        {selected ? <span className="text-xs font-semibold text-[var(--primary)]">Aktiv</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}

function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
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
    <div className="flex flex-wrap items-center gap-2">
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
  const supabase = useMemo(() => supabaseBrowser(), []);
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

  const [calendarState, setCalendarState] = useState<{
    view: ViewMode;
    anchorISO: string;
  }>({
    view: "week",
    anchorISO: toLocalISODate(new Date()),
  });

  const [items, setItems] = useState<Item[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSeq = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = calendarState.view;
  const anchorISO = calendarState.anchorISO;

  const currentLegendUser = useMemo(() => {
    if (!creatorTenantId) return null;

    return (
      legendUsers.find(
        (u) => u.tenantId === creatorTenantId || u.filterTenantId === creatorTenantId
      ) ?? null
    );
  }, [creatorTenantId, legendUsers]);

  const currentTenantDisplayName =
    currentLegendUser?.tenantDisplayName ??
    tenants.find((t) => t.id === creatorTenantId)?.display_name ??
    null;

  const isAdmin = useMemo(() => {
    if (typeof isAdminProp === "boolean") return isAdminProp;
    if (legendUsers.length > 1) return true;
    return isAdminTenantName(currentTenantDisplayName);
  }, [currentTenantDisplayName, isAdminProp, legendUsers.length]);

  useEffect(() => {
    if (isAdmin) return;

    // Team-Kalender für normale Benutzer:
    // alle Termine sehen, aber fremde Termine nicht verwalten.
    setSelectedTenantId(null);
  }, [isAdmin]);

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
      let apptQuery = supabase
      .from("appointments")
      .select(
        `
        id,start_at,end_at,notes_internal,reminder_sent_at,tenant_id,person_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name, phone, email )
      `
      )
      .gte("start_at", range.startISO)
      .lt("start_at", range.endISO);

    if (selectedTenantId) {
      apptQuery = apptQuery.eq("tenant_id", selectedTenantId);
    }

    const { data: apptData, error: apptError } = await apptQuery.order("start_at", { ascending: true });

    if (seq !== loadSeq.current) return;

    if (apptError) {
      setErrorText(apptError.message);
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }

    const appts = (apptData ?? []) as ApptRow[];

    const uniquePairs = new Map<string, { tenant_id: string; person_id: string }>();
    for (const a of appts) {
      uniquePairs.set(`${a.tenant_id}:${a.person_id}`, {
        tenant_id: a.tenant_id,
        person_id: a.person_id,
      });
    }

    const cpMap = new Map<string, string>();

    if (uniquePairs.size > 0) {
      const tenantIds = Array.from(new Set(Array.from(uniquePairs.values()).map((p) => p.tenant_id)));
      const personIds = Array.from(new Set(Array.from(uniquePairs.values()).map((p) => p.person_id)));

      const { data: cps } = await supabase
        .from("customer_profiles")
        .select("id,tenant_id,person_id")
        .in("tenant_id", tenantIds)
        .in("person_id", personIds);

      if (seq !== loadSeq.current) return;

      for (const cp of (cps ?? []) as CustomerProfileRow[]) {
        cpMap.set(`${cp.tenant_id}:${cp.person_id}`, cp.id);
      }
    }

    const mappedItems: Item[] = appts.map((a) => {
      const parsed = parseNotes(a.notes_internal);
      const key = `${a.tenant_id}:${a.person_id}`;
      const customerProfileId = cpMap.get(key) ?? null;
      const tenant = firstJoin(a.tenant);
      const person = firstJoin(a.person);

      const canManageCustomerActions = isAdmin || (!!creatorTenantId && a.tenant_id === creatorTenantId);

      return {
        id: a.id,
        start_at: a.start_at,
        end_at: a.end_at,
        title: parsed.title ? parsed.title : "Termin",
        note: parsed.note ?? "",
        status: parsed.status,
        tenantId: a.tenant_id,
        tenantName: tenant?.display_name ?? "Behandler",
        customerProfileId,
        customerName: person?.full_name ?? null,
        customerPhone: person?.phone ?? null,
        customerEmail: person?.email ?? null,
        reminderSentAt: a.reminder_sent_at ?? null,
        canOpenCustomerProfile: canManageCustomerActions,
        canCreateFollowUp: canManageCustomerActions,
        canDeleteAppointment: canManageCustomerActions,
      };
    });

    if (seq !== loadSeq.current) return;

    setItems(mappedItems);
    hasLoadedOnceRef.current = true;
    setIsInitialLoading(false);
    setIsRefreshing(false);
    } catch (error: any) {
      if (seq !== loadSeq.current) return;
      setErrorText(error?.message ?? "Kalender konnte nicht geladen werden.");
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [creatorTenantId, isAdmin, range.endISO, range.startISO, selectedTenantId, supabase]);

  const scheduleRefresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      loadAppointments();
    }, 250);
  }, [loadAppointments]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-appointments-${selectedTenantId ?? "all"}-${view}-${anchorISO}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        scheduleRefresh();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleRefresh();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [anchorISO, scheduleRefresh, selectedTenantId, supabase, view]);

  const handleToday = useCallback(() => {
    setCalendarState((prev) => ({
      ...prev,
      anchorISO: toLocalISODate(new Date()),
    }));
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
    setCalendarState((prev) => ({
      ...prev,
      view: nextView,
    }));
  }, []);

  const handleSetDate = useCallback((iso: string) => {
    setCalendarState((prev) => ({
      ...prev,
      anchorISO: iso,
    }));
  }, []);

  useEffect(() => {
    const openCreate = () => setCreateOpen(true);
    document.addEventListener("open-create-appointment", openCreate as EventListener);
    return () => document.removeEventListener("open-create-appointment", openCreate as EventListener);
  }, []);

  return (
    <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-white">Kalender</div>
                <div className="text-sm text-white/60">Team-Übersicht</div>
              </div>

              <div className="flex items-center gap-2 md:hidden">
                <MobileCircleActionButton
                  label="Neuen Termin erstellen"
                  variant="primary"
                  onClick={() => setCreateOpen(true)}
                >
                  <span className="text-[26px] font-semibold leading-none">+</span>
                </MobileCircleActionButton>
                <MobileViewPicker value={view} onChange={handleChangeView} />
                {isAdmin ? (
                  <MobileLegendPicker
                    users={legendUsers}
                    activeTenantId={selectedTenantId}
                    onSelect={setSelectedTenantId}
                  />
                ) : null}
              </div>
            </div>

            {currentLegendUser && !isAdmin ? (
              <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 md:inline-flex md:w-fit">
                {currentLegendUser.fullName ?? currentLegendUser.tenantDisplayName}
              </div>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="hidden md:block">
              <TenantLegendClient
                users={legendUsers}
                activeTenantId={selectedTenantId}
                onSelect={setSelectedTenantId}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-7">
          {errorText ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="font-semibold text-white">Fehler</div>
              <div className="mt-1 break-words text-sm text-red-200">{errorText}</div>
            </div>
          ) : isInitialLoading ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
              Kalender wird geladen...
            </div>
          ) : (
            <div className="relative">
              {isRefreshing && (
                <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs text-white/80 backdrop-blur">
                  Aktualisiere...
                </div>
              )}

              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToday();
                    }}
                  >
                    Heute
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePrev();
                    }}
                  >
                    ←
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNext();
                    }}
                  >
                    →

                  </Button>

                  <div className="ml-2 text-xl font-bold text-white">
                    {headerText.left}
                    {headerText.right ? (
                      <span className="ml-2 text-sm font-semibold text-white/55">{headerText.right}</span>
                    ) : null}
                  </div>
                </div>

                <div className="hidden md:block"><ViewSwitch value={view} onChange={handleChangeView} /></div>
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
                onCloseCreate={() => setCreateOpen(false)}
                onOpenCreate={() => setCreateOpen(true)}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
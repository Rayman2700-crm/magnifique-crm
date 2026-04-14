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

function getISOWeekNumber(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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


function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  const tf = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${tf.format(start)}-${tf.format(end)}`;
}

function isSameLocalISODate(dateTime: string, iso: string) {
  return toLocalISODate(new Date(dateTime)) === iso;
}

function isAdminTenantName(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();
  return n.includes("radu");
}

function buildMiniMonthGrid(monthAnchorISO: string) {
  const monthStart = startOfMonthLocal(new Date(`${monthAnchorISO}T12:00:00`));
  const gridStart = startOfWeekMondayLocal(monthStart);
  const cells: { iso: string; inMonth: boolean; day: number }[] = [];
  const visibleMonth = monthStart.getMonth();

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      iso: toLocalISODate(d),
      inMonth: d.getMonth() === visibleMonth,
      day: d.getDate(),
    });
  }

  return cells;
}


function normalizePhoneHref(phone: string | null | undefined) {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(/[^\d+]/g, "");
  if (!normalized) return null;

  if (normalized.startsWith("+")) return normalized;
  if (normalized.startsWith("00")) return `+${normalized.slice(2)}`;
  if (normalized.startsWith("0")) return `+43${normalized.slice(1)}`;
  return `+${normalized}`;
}

function PhoneQuickActionsSlideover({
  open,
  shown,
  phone,
  customerName,
  onClose,
}: {
  open: boolean;
  shown: boolean;
  phone: string | null;
  customerName: string | null;
  onClose: () => void;
}) {
  const normalizedPhone = useMemo(() => normalizePhoneHref(phone), [phone]);
  const whatsappHref = normalizedPhone ? `https://wa.me/${normalizedPhone.replace(/\D/g, "")}` : null;
  const telHref = normalizedPhone ? `tel:${normalizedPhone}` : null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1250, isolation: "isolate" }}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Kontaktaktionen schließen"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(4px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 180ms ease",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 88,
          right: 20,
          width: "min(360px, calc(100vw - 24px))",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "linear-gradient(180deg, rgba(28,28,31,0.98) 0%, rgba(18,19,22,0.98) 100%)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.44)",
          overflow: "hidden",
          transform: shown ? "translateX(0) scale(1)" : "translateX(14px) scale(0.98)",
          opacity: shown ? 1 : 0,
          transformOrigin: "top right",
          transition: "transform 180ms ease, opacity 180ms ease",
          backdropFilter: "blur(18px)",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.96)" }}>
            Kunde kontaktieren
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            {customerName ?? "Kunde"}
          </div>
          <div style={{ marginTop: 2, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            {phone ?? "Keine Telefonnummer"}
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <a
              href={telHref ?? "#"}
              onClick={(e) => {
                if (!telHref) e.preventDefault();
              }}
              style={{
                flex: 1,
                minHeight: 88,
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "white",
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: telHref ? 1 : 0.45,
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.79.61 2.65a2 2 0 0 1-.45 2.11L8 9.75a16 16 0 0 0 6.25 6.25l1.27-1.27a2 2 0 0 1 2.11-.45c.86.28 1.75.49 2.65.61A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Anrufen</span>
            </a>

            <a
              href={whatsappHref ?? "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (!whatsappHref) e.preventDefault();
              }}
              style={{
                flex: 1,
                minHeight: 88,
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "white",
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: whatsappHref ? 1 : 0.45,
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                  <path d="M20.52 3.48A11.86 11.86 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.91c0 2.1.55 4.15 1.6 5.96L0 24l6.3-1.65a11.88 11.88 0 0 0 5.77 1.47h.01c6.57 0 11.91-5.34 11.91-11.91 0-3.18-1.24-6.17-3.47-8.43Zm-8.45 18.33h-.01a9.94 9.94 0 0 1-5.07-1.39l-.36-.21-3.74.98 1-3.65-.24-.38a9.9 9.9 0 0 1-1.52-5.25C2.13 6.44 6.59 1.98 12.07 1.98c2.64 0 5.11 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.99c0 5.48-4.46 9.94-9.87 9.94Zm5.45-7.41c-.3-.15-1.77-.87-2.04-.96-.27-.1-.47-.15-.67.15-.2.3-.76.96-.93 1.15-.17.2-.35.22-.65.08-.3-.15-1.26-.46-2.4-1.46-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.5h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.06c.15.2 2.1 3.21 5.09 4.5.71.31 1.26.49 1.69.63.71.23 1.35.2 1.86.12.57-.09 1.77-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.08-.12-.28-.2-.58-.35Z" />
                </svg>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}



function DailyAgendaPanel({
  selectedISO,
  items,
  legendUsers,
  panelHeight,
  searchQuery,
}: {
  selectedISO: string;
  items: Item[];
  legendUsers: LegendUser[];
  panelHeight?: number | null;
  searchQuery?: string;
}) {
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactShown, setContactShown] = useState(false);

  useEffect(() => {
    if (!contactOpen) return;
    const t = window.setTimeout(() => setContactShown(true), 10);
    return () => window.clearTimeout(t);
  }, [contactOpen]);

  const closeContact = useCallback(() => {
    setContactShown(false);
    window.setTimeout(() => {
      setContactOpen(false);
      setContactPhone(null);
      setContactName(null);
    }, 160);
  }, []);

  const hasSearch = Boolean(searchQuery?.trim());

  const dayItems = useMemo(
    () =>
      (hasSearch
        ? items
        : items.filter((item) => isSameLocalISODate(item.start_at, selectedISO))
      ).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [hasSearch, items, selectedISO]
  );

  const selectedLabel = useMemo(() => {
    if (hasSearch) {
      const q = searchQuery?.trim() ?? "";
      return q ? `Suchergebnisse für „${q}”` : "Suchergebnisse";
    }

    return new Intl.DateTimeFormat("de-AT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(`${selectedISO}T12:00:00`));
  }, [hasSearch, searchQuery, selectedISO]);

  const cardHeight = panelHeight ?? 290;

  return (
    <div
      style={{
        width: "100%",
        height: cardHeight,
        minHeight: cardHeight,
        maxHeight: cardHeight,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        padding: 12,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        overflow: "hidden",
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="truncate text-sm font-bold text-white">Tagestermine</div>
          <div className="truncate text-xs text-white/50">{selectedLabel}</div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.03] px-1 py-1 text-xs font-semibold text-white/70">
          {dayItems.length} {dayItems.length === 1 ? "Termin" : "Termine"}
        </div>
      </div>

      {dayItems.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-[14px] border border-dashed border-white/10 bg-black/10 text-sm text-white/45">
          {hasSearch ? "Keine Treffer für diese Suche" : "Keine Termine für diesen Tag"}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {dayItems.map((item, index) => {
            const legendUser =
              legendUsers.find(
                (user) =>
                  user.tenantId === item.tenantId ||
                  user.filterTenantId === item.tenantId ||
                  user.tenantDisplayName === item.tenantName
              ) ?? null;

            const avatarName = legendUser?.fullName ?? item.tenantName;
            const theme = getLegendAvatarTheme(avatarName);

            return (
              <div
                key={item.id}
                className="relative flex items-center gap-2.5 rounded-[12px] border border-white/8 bg-white/[0.03] px-1 py-1 pl-4"
              >
                <div
                  className="absolute left-[4px] top-[4px] bottom-[4px] z-10 w-[4px] rounded-full"
                  style={{
                    backgroundColor: theme.ring,
                    boxShadow: `0 0 0 1px ${theme.ring}, 0 0 12px ${theme.ring}66`,
                  }}
                  aria-hidden="true"
                />

                <div className="shrink-0 text-[13px] font-semibold text-white/92">
                  {formatTimeRange(item.start_at, item.end_at)}
                </div>

                <div className="min-w-0 flex-1 truncate text-[11px] text-white/84">
                  <span className="font-semibold text-white">{index + 1}. {item.customerName ?? "Ohne Kundenname"}</span>
                  <span className="text-white/45"> · </span>
                  {item.customerPhone ? (
                    <button
                      type="button"
                      onClick={() => {
                        setContactPhone(item.customerPhone ?? null);
                        setContactName(item.customerName ?? null);
                        setContactOpen(true);
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-left text-white/92 transition hover:bg-white/[0.08]"
                      aria-label={`Telefon für ${item.customerName ?? "Kunde"} öffnen`}
                      title={item.customerPhone}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.79.61 2.65a2 2 0 0 1-.45 2.11L8 9.75a16 16 0 0 0 6.25 6.25l1.27-1.27a2 2 0 0 1 2.11-.45c.86.28 1.75.49 2.65.61A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-400"
                      aria-label="Keine Telefonnummer vorhanden"
                      title="Keine Telefonnummer vorhanden"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.79.61 2.65a2 2 0 0 1-.45 2.11L8 9.75a16 16 0 0 0 6.25 6.25l1.27-1.27a2 2 0 0 1 2.11-.45c.86.28 1.75.49 2.65.61A2 2 0 0 1 22 16.92z" />
                        <path d="M4 4l16 16" />
                      </svg>
                    </span>
                  )}
                  <span className="text-white/45"> · </span>
                  <span>{item.title || "Dienstleistung unbekannt"}</span>
                </div>

                <div
                  className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border-2 bg-[#111216]"
                  style={{ borderColor: theme.ring }}
                  title={avatarName ?? "Behandler"}
                >
                  {legendUser ? (
                    <img
                      src={`/users/${legendUser.userId}.png`}
                      alt={avatarName ?? "Behandler"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-extrabold text-white">
                      {getLegendInitials(avatarName)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PhoneQuickActionsSlideover
        open={contactOpen}
        shown={contactShown}
        phone={contactPhone}
        customerName={contactName}
        onClose={closeContact}
      />
    </div>
  );
}

function DesktopMiniMonthPicker({
  valueISO,
  view,
  onSelect,
  items,
  onToday,
  isMobileCompact = false,
}: {
  valueISO: string;
  view: ViewMode;
  onSelect: (iso: string) => void;
  items: Item[];
  onToday?: () => void;
  isMobileCompact?: boolean;
}) {
  const [monthISO, setMonthISO] = useState(() => toLocalISODate(startOfMonthLocal(new Date(`${valueISO}T12:00:00`))));

  useEffect(() => {
    setMonthISO(toLocalISODate(startOfMonthLocal(new Date(`${valueISO}T12:00:00`))));
  }, [valueISO]);

  const todayISO = useMemo(() => toLocalISODate(new Date()), []);
  const todayDayLabel = useMemo(() => String(new Date().getDate()).padStart(2, "0"), []);
  const cells = useMemo(() => buildMiniMonthGrid(monthISO), [monthISO]);
  const monthDate = useMemo(() => new Date(`${monthISO}T12:00:00`), [monthISO]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(monthDate),
    [monthDate]
  );
  const selectedWeek = useMemo(() => getISOWeekNumber(valueISO), [valueISO]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const iso = toLocalISODate(new Date(item.start_at));
      map.set(iso, (map.get(iso) ?? 0) + 1);
    }
    return map;
  }, [items]);

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        padding: 12,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {isMobileCompact ? (
          <div
            style={{
              minWidth: 0,
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => onToday?.()}
              aria-label="Heute"
              className="calendar-mini-chevron"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid rgba(214,195,163,0.28)",
                background: "linear-gradient(180deg, rgba(214,195,163,0.96) 0%, rgba(214,195,163,0.88) 100%)",
                color: "#0b0b0c",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.01em",
                flexShrink: 0,
              }}
            >
              {todayDayLabel}
            </button>

            <div
              style={{
                minWidth: 0,
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {monthLabel}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.55)",
                  flexShrink: 0,
                }}
              >
                KW {selectedWeek}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
              {monthLabel}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
              KW {selectedWeek}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: isMobileCompact ? 12 : "auto", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMonthISO((current) => addMonthsLocal(current, -1))}
            aria-label="Vorheriger Monat"
            className="calendar-mini-chevron"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.78)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, display: "block" }} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMonthISO((current) => addMonthsLocal(current, 1))}
            aria-label="Nächster Monat"
            className="calendar-mini-chevron"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(255,255,255,0.78)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, display: "block" }} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
          textAlign: "center",
          fontSize: 10,
          color: "rgba(255,255,255,0.42)",
          marginBottom: 4,
        }}
      >
        {["M", "D", "M", "D", "F", "S", "S"].map((label, index) => (
          <div key={`${label}-${index}`} style={{ padding: "2px 0" }}>
            {label}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {cells.map((cell) => {
          const isSelected = cell.iso === valueISO;
          const isToday = cell.iso === todayISO;
          const count = countsByDay.get(cell.iso) ?? 0;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => onSelect(cell.iso)}
              aria-label={`Tag ${cell.iso} wählen`}
              className="calendar-mini-day"
              data-selected={isSelected ? "true" : "false"}
              style={{
                height: 30,
                minWidth: 0,
                borderRadius: 8,
                border: isSelected
                  ? "1px solid rgba(255,255,255,0.16)"
                  : "1px solid transparent",
                color: isSelected
                  ? "#ffffff"
                  : cell.inMonth
                    ? "rgba(255,255,255,0.86)"
                    : "rgba(255,255,255,0.22)",
                background: isSelected
                  ? "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)"
                  : isToday
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.03)",
                boxShadow: isSelected ? "0 8px 18px rgba(37,99,235,0.20)" : "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                position: "relative",
                overflow: "visible",
                transition: "background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
              }}
            >
              {cell.day}

              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  minWidth: count > 9 ? 18 : 16,
                  height: count > 9 ? 18 : 16,
                  padding: count > 9 ? "0 4px" : "0 0",
                  borderRadius: 999,
                  background: count > 0 ? "#2563eb" : "rgba(255,255,255,0.18)",
                  color: count > 0 ? "#fff" : "rgba(255,255,255,0.80)",
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: count > 9 ? "18px" : "16px",
                  boxShadow: count > 0
                    ? "0 0 0 2px rgba(11,11,12,0.92), 0 0 10px rgba(37,99,235,0.38)"
                    : "0 0 0 2px rgba(11,11,12,0.92)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                {count > 99 ? "99+" : count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


function getLegendAvatarTheme(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();

  if (n.includes("radu")) return { ring: "#4F7CFF", bg: "rgba(79,124,255,0.16)" };
  if (n.includes("raluca")) return { ring: "#A855F7", bg: "rgba(168,85,247,0.16)" };
  if (n.includes("alexandra")) return { ring: "#22C55E", bg: "rgba(34,197,94,0.16)" };
  if (n.includes("barbara")) return { ring: "#F97316", bg: "rgba(249,115,22,0.16)" };

  return { ring: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.08)" };
}


function matchesSelectedTenant(
  item: Item,
  selectedTenantId: string | null,
  legendUsers: LegendUser[]
) {
  if (!selectedTenantId) return true;

  const selected = String(selectedTenantId).trim().toLowerCase();
  if (!selected) return true;

  if (String(item.tenantId ?? "").trim().toLowerCase() === selected) return true;
  if (String(item.tenantName ?? "").trim().toLowerCase() === selected) return true;

  const legendUser =
    legendUsers.find(
      (user) =>
        user.tenantId === item.tenantId ||
        user.filterTenantId === item.tenantId ||
        user.tenantDisplayName === item.tenantName
    ) ?? null;

  if (!legendUser) return false;

  const fullName = String(legendUser.fullName ?? "").trim().toLowerCase();
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const tenantDisplayName = String(legendUser.tenantDisplayName ?? "").trim().toLowerCase();
  const tenantId = String(legendUser.tenantId ?? "").trim().toLowerCase();
  const filterTenantId = String(legendUser.filterTenantId ?? "").trim().toLowerCase();

  return [tenantId, filterTenantId, fullName, firstName, tenantDisplayName].includes(selected);
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


function DesktopHeaderLegend({
  users,
  activeTenantId,
  onSelect,
}: {
  users: LegendUser[];
  activeTenantId: string | null;
  onSelect: (tenantId: string | null) => void;
}) {
  return (
    <div id="dashboard-calendar-header-legend" className="flex items-start gap-3">
      <button type="button" onClick={() => onSelect(null)} className="flex shrink-0 flex-col items-center gap-1.5" title="Alle">
        <div
          className="relative overflow-hidden rounded-full"
          style={{
            width: 44,
            height: 44,
            border: "3px solid rgba(255,255,255,0.55)",
            boxShadow: "0 10px 22px rgba(0,0,0,0.28)",
            background: "rgba(255,255,255,0.96)",
          }}
        >
          <span className="flex h-full w-full items-center justify-center text-[11px] font-extrabold text-black">Alle</span>
        </div>
        <div
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            activeTenantId === null ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"
          }`}
          style={{ backdropFilter: "blur(8px)", lineHeight: 1 }}
        >
          Alle
        </div>
      </button>

      {users.map((user) => {
        const theme = getLegendAvatarTheme(user.fullName ?? user.tenantDisplayName);
        const active = activeTenantId === user.filterTenantId || activeTenantId === user.tenantId;
        const chipLabel = (user.fullName ?? user.tenantDisplayName ?? "Behandler").split(/\s+/)[0] || "Behandler";
        return (
          <button
            key={user.userId}
            type="button"
            onClick={() => onSelect(user.filterTenantId || user.tenantId)}
            className="flex shrink-0 flex-col items-center gap-1.5"
            title={user.fullName ?? user.tenantDisplayName ?? "Behandler"}
          >
            <div
              className="relative overflow-hidden rounded-full"
              style={{
                width: 44,
                height: 44,
                border: `3px solid ${theme.ring}`,
                boxShadow: "0 10px 22px rgba(0,0,0,0.28)",
                background: "#111216",
              }}
            >
              <img
                src={`/users/${user.userId}.png`}
                alt={user.fullName ?? user.tenantDisplayName ?? "Behandler"}
                className="h-full w-full object-cover"
              />
              <div
                style={{
                  position: "absolute",
                  right: 2,
                  bottom: 2,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: theme.ring,
                  boxShadow: "0 0 0 2px rgba(0,0,0,0.65)",
                }}
              />
            </div>
            <div
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                active ? "border border-white bg-white text-black" : "border border-white/10 bg-black/25 text-white/90"
              }`}
              style={{ backdropFilter: "blur(8px)", lineHeight: 1 }}
            >
              {chipLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
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
    if (activeUser) {
      return getLegendAvatarTheme(activeUser.fullName ?? activeUser.tenantDisplayName).ring;
    }

    const step = 100 / ringColors.length;
    return `conic-gradient(${ringColors
      .map((color, index) => `${color} ${Math.round(index * step)}% ${Math.round((index + 1) * step)}%`)
      .join(", ")})`;
  }, [activeUser, ringColors, users]);

  const avatarLabel = activeUser
    ? getLegendInitials(activeUser.fullName ?? activeUser.tenantDisplayName)
    : "Alle";

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
        <span className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] bg-[#0f1013] text-[10px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {activeUser ? (
            <img
              src={`/users/${activeUser.userId}.png`}
              alt={activeUser.fullName ?? activeUser.tenantDisplayName ?? "Behandler"}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-1">{avatarLabel}</span>
          )}
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
                          onSelect(user.filterTenantId || user.tenantId);
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
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#111216] text-sm font-extrabold text-white"
                            style={{ borderColor: theme.ring }}
                          >
                            <img
                              src={`/users/${user.userId}.png`}
                              alt={user.fullName ?? user.tenantDisplayName ?? "Behandler"}
                              className="h-full w-full object-cover"
                            />
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
  anchorISO,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  anchorISO: string;
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

  const compactValueLabel = useMemo(() => {
    const anchorDate = new Date(`${anchorISO}T12:00:00`);

    if (value === "day") {
      return String(anchorDate.getDate()).padStart(2, "0");
    }

    if (value === "week") {
      return `KW${getISOWeekNumber(anchorISO)}`;
    }

    if (value === "month") {
      return new Intl.DateTimeFormat("de-AT", { month: "short" })
        .format(anchorDate)
        .replace(".", "")
        .slice(0, 3);
    }

    return String(anchorDate.getFullYear());
  }, [anchorISO, value]);

  const longValueLabel = useMemo(() => {
    const anchorDate = new Date(`${anchorISO}T12:00:00`);

    if (value === "day") {
      return new Intl.DateTimeFormat("de-AT", {
        day: "2-digit",
        month: "2-digit",
      }).format(anchorDate);
    }

    if (value === "week") {
      return `KW ${getISOWeekNumber(anchorISO)}`;
    }

    if (value === "month") {
      return new Intl.DateTimeFormat("de-AT", {
        month: "long",
      }).format(anchorDate);
    }

    return String(anchorDate.getFullYear());
  }, [anchorISO, value]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
        aria-label={`Kalenderansicht auswählen, aktuell ${longValueLabel}`}
        aria-expanded={open}
        style={{
          borderColor: "rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.88)",
          boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.30)",
        }}
      >
        <span
          className="max-w-[42px] truncate px-1 text-center font-extrabold tracking-tight"
          style={{
            fontSize: compactValueLabel.length >= 4 ? 10 : 11,
            lineHeight: 1,
          }}
        >
          {compactValueLabel}
        </span>
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


const DESKTOP_HEADER_BUTTON_BASE: React.CSSProperties = {
  height: 44,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.88)",
  boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
  transition: "background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease",
};

const DESKTOP_HEADER_BUTTON_ACTIVE: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.98)",
  boxShadow: "0 12px 28px rgba(0,0,0,0.30)",
};


function DesktopHeaderPillButton({
  children,
  active = false,
  className = "",
  style,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      className={`calendar-desktop-pill inline-flex items-center justify-center ${className}`.trim()}
      data-active={active ? "true" : "false"}
      style={{
        ...DESKTOP_HEADER_BUTTON_BASE,
        ...(active ? DESKTOP_HEADER_BUTTON_ACTIVE : {}),
        ...style,
      }}
    >
      {children}
    </button>
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
      <DesktopHeaderPillButton
        active={active}
        className="px-4 text-sm font-semibold"
        onClick={() => onChange(v)}
      >
        {label}
      </DesktopHeaderPillButton>
    );
  };

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
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
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState("");
  const desktopSearchButtonRef = useRef<HTMLButtonElement | null>(null);
  const desktopSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const miniMonthCardRef = useRef<HTMLDivElement | null>(null);
  const [miniMonthCardHeight, setMiniMonthCardHeight] = useState<number | null>(null);

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

    if (view === "year") {
      const ys = startOfYearLocal(anchorDate);
      rangeStart = new Date(ys);
      rangeEnd = new Date(ys);
      rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);
    } else {
      const ms = startOfMonthLocal(anchorDate);
      rangeStart = new Date(ms);
      rangeEnd = new Date(ms);
      rangeEnd.setMonth(rangeEnd.getMonth() + 1);
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
      view: prev.view === "year" ? "week" : prev.view,
    }));
  }, []);

  useEffect(() => {
    const openCreate = () => setCreateOpen(true);
    document.addEventListener("open-create-appointment", openCreate as EventListener);
    return () => document.removeEventListener("open-create-appointment", openCreate as EventListener);
  }, []);

  useEffect(() => {
    const node = miniMonthCardRef.current;
    if (!node) return;

    const updateHeight = () => {
      setMiniMonthCardHeight(node.getBoundingClientRect().height || null);
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [anchorISO, view]);

  useEffect(() => {
    if (!desktopSearchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const panel = desktopSearchPanelRef.current;
      const button = desktopSearchButtonRef.current;

      if (panel?.contains(target) || button?.contains(target)) return;
      setDesktopSearchOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopSearchOpen]);

  const visibleItems = useMemo(() => {
    const q = desktopSearchQuery.trim().toLowerCase();
    const queryTokens = q.split(/\s+/).map((token) => token.trim()).filter(Boolean);

    return items.filter((item) => {
      if (!matchesSelectedTenant(item, selectedTenantId, legendUsers)) {
        return false;
      }

      if (!queryTokens.length) return true;

      const legendUser =
        legendUsers.find(
          (user) =>
            user.tenantId === item.tenantId ||
            user.filterTenantId === item.tenantId ||
            user.tenantDisplayName === item.tenantName
        ) ?? null;

      const legendName = legendUser?.fullName ?? "";
      const legendFirstName = String(legendName).trim().split(/\s+/)[0] ?? "";

      const haystack = [
        item.title,
        item.note,
        item.customerName,
        item.customerPhone,
        item.customerEmail,
        item.tenantName,
        legendName,
        legendFirstName,
        legendUser?.tenantDisplayName ?? "",
        legendUser?.tenantId ?? "",
        legendUser?.filterTenantId ?? "",
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return queryTokens.some((token) => haystack.includes(token));
    });
  }, [desktopSearchQuery, items, legendUsers, selectedTenantId]);

  return (
    <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <CardContent className="p-5 md:p-6 xl:p-8">
        <style jsx global>{`
          .calendar-desktop-pill:hover {
            background: rgba(255,255,255,0.08) !important;
            border-color: rgba(255,255,255,0.16) !important;
            color: rgba(255,255,255,0.98) !important;
          }

          .calendar-desktop-pill[data-active="true"]:hover {
            background: rgba(255,255,255,0.14) !important;
            border-color: rgba(255,255,255,0.22) !important;
          }

          .calendar-mini-chevron {
            transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
          }

          .calendar-mini-chevron:hover {
            background: rgba(255,255,255,0.08) !important;
            border-color: rgba(255,255,255,0.16) !important;
            color: rgba(255,255,255,0.98) !important;
            transform: translateY(-1px);
          }

          .calendar-mini-day:hover {
            background: rgba(255,255,255,0.08) !important;
            border-color: rgba(255,255,255,0.16) !important;
            color: rgba(255,255,255,0.98) !important;
            transform: translateY(-1px);
            box-shadow: 0 10px 18px rgba(0,0,0,0.20);
          }

          .calendar-mini-day[data-selected="true"]:hover {
            background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%) !important;
            border-color: rgba(255,255,255,0.20) !important;
            box-shadow: 0 10px 22px rgba(37,99,235,0.28) !important;
          }

          @media (min-width: 768px) and (max-width: 1020px) {
            #dashboard-calendar-header-shell {
              padding-right: 560px !important;
            }

            #dashboard-calendar-header-actions {
              gap: 10px !important;
            }

            #dashboard-calendar-header-legend { gap: 10px; }
            #dashboard-calendar-header-legend > button > div:first-child {
              width: 40px !important;
              height: 40px !important;
            }
            #dashboard-calendar-header-legend > button > div:last-child {
              font-size: 11px !important;
              padding: 4px 9px !important;
            }
          }
        `}</style>
        <div className="hidden md:block">
          <div id="dashboard-calendar-header-shell" className="relative pr-[360px] xl:pr-[520px]">
            <div id="dashboard-calendar-header-actions" className="absolute right-0 top-0 z-30 flex items-start justify-end gap-3">
              {isAdmin ? (
                <div className="max-w-[520px] overflow-hidden">
                  <div className="max-w-full overflow-x-auto">
                    <div className="min-w-max">
                      <DesktopHeaderLegend
                        users={legendUsers}
                        activeTenantId={selectedTenantId}
                        onSelect={setSelectedTenantId}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="relative">
                <button
                  ref={desktopSearchButtonRef}
                  type="button"
                  aria-label="Suche"
                  title="Suche"
                  onClick={() => setDesktopSearchOpen((current) => !current)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/85 shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.08]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </button>

                {desktopSearchOpen ? (
                  <div
                    ref={desktopSearchPanelRef}
                    className="absolute right-0 top-[calc(100%+14px)] z-40 w-[360px] max-w-[min(360px,calc(100vw-48px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                  >
                    <div className="flex h-12 items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                      <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={desktopSearchQuery}
                        onChange={(e) => setDesktopSearchQuery(e.target.value)}
                        placeholder="Termin, Kunde, E-Mail, Telefon"
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                      />
                      {desktopSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDesktopSearchQuery("");
                          }}
                          className="ml-3 inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                          aria-label="Suche löschen"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path d="M6 6l12 12" />
                            <path d="M18 6 6 18" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCreateOpen(true);
                }}
                aria-label="Termin erstellen"
                title="Termin erstellen"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] bg-[var(--primary)] text-black shadow-[0_12px_26px_rgba(214,195,163,0.18)] transition hover:opacity-90"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>

            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
                Magnifique Beauty Institut Kalender
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
                Kalender
              </h2>
            </div>
          </div>
        </div>

        <div className="md:hidden flex flex-col gap-4 lg:gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">Kalender</div>
              <div className="text-sm text-white/60">Team-Übersicht</div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                ref={desktopSearchButtonRef}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDesktopSearchOpen((current) => !current);
                }}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"
                aria-label="Suche öffnen"
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.88)",
                  boxShadow: "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.30)",
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>

              <MobileCircleActionButton
                label="Neuen Termin erstellen"
                variant="primary"
                onClick={() => setCreateOpen(true)}
              >
                <span className="text-[26px] font-semibold leading-none">+</span>
              </MobileCircleActionButton>
              <MobileViewPicker value={view} onChange={handleChangeView} anchorISO={anchorISO} />
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
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 lg:inline-flex lg:w-fit">
              {currentLegendUser.fullName ?? currentLegendUser.tenantDisplayName}
            </div>
          ) : null}

          {desktopSearchOpen ? (
            <div
              ref={desktopSearchPanelRef}
              className="md:hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.36)] backdrop-blur-xl"
            >
              <div className="flex h-12 items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-4">
                <span className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-white/35">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={desktopSearchQuery}
                  onChange={(e) => setDesktopSearchQuery(e.target.value)}
                  placeholder="Termin, Kunde, E-Mail, Telefon"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                />
                {desktopSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDesktopSearchQuery("");
                    }}
                    className="ml-3 inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] p-0 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                    aria-label="Suche löschen"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M6 6l12 12" />
                      <path d="M18 6 6 18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 lg:mt-7">
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

              <div className="flex flex-col gap-5">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <div className="hidden md:hidden" />

                  <div className="grid gap-4 md:hidden">
                    <div>
                      <DesktopMiniMonthPicker
                        valueISO={anchorISO}
                        view={view}
                        onSelect={handleSetDate}
                        items={visibleItems}
                        onToday={handleToday}
                        isMobileCompact
                      />
                    </div>

                    <div>
                      <DailyAgendaPanel
                        selectedISO={anchorISO}
                        items={visibleItems}
                        legendUsers={legendUsers}
                        searchQuery={desktopSearchQuery}
                      />
                    </div>
                  </div>

                  <div className="hidden md:grid md:grid-cols-1 md:gap-4 lg:grid-cols-3">
                    <div ref={miniMonthCardRef} className="lg:col-span-1">
                      <DesktopMiniMonthPicker valueISO={anchorISO} view={view} onSelect={handleSetDate} items={visibleItems} />
                    </div>

                    <div
                      className="min-h-0 lg:col-span-2"
                      style={miniMonthCardHeight ? { height: miniMonthCardHeight, minHeight: miniMonthCardHeight, maxHeight: miniMonthCardHeight } : undefined}
                    >
                      <DailyAgendaPanel
                        selectedISO={anchorISO}
                        items={visibleItems}
                        legendUsers={legendUsers}
                        panelHeight={miniMonthCardHeight}
                        searchQuery={desktopSearchQuery}
                      />
                    </div>
                  </div>

                  <div className="hidden md:flex md:items-center md:min-w-0">
                    <div className="flex min-w-0 flex-1 items-center">
                      <div className="flex shrink-0 items-center gap-3">
                        <DesktopHeaderPillButton
                          className="px-4 text-sm font-semibold"
                          onClick={() => handleToday()}
                        >
                          Heute
                        </DesktopHeaderPillButton>

                        <DesktopHeaderPillButton
                          className="w-11"
                          onClick={() => handlePrev()}
                          ariaLabel="Zurück"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                          </svg>
                        </DesktopHeaderPillButton>

                        <DesktopHeaderPillButton
                          className="w-11"
                          onClick={() => handleNext()}
                          ariaLabel="Weiter"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </DesktopHeaderPillButton>
                      </div>

                      <div className="w-5 shrink-0 sm:w-6 lg:w-8" aria-hidden="true" />

                      <div className="min-w-0 text-base font-bold text-white sm:text-lg lg:text-xl">
                        {headerText.left}
                        {headerText.right ? (
                          <span className="ml-2 text-sm font-semibold text-white/55">{headerText.right}</span>
                        ) : null}
                      </div>
                    </div>

                    <ViewSwitch value={view} onChange={handleChangeView} />
                  </div>
                </div>
              </div>

              <div className="hidden md:block">
                <DashboardWeekGridClient
                  items={visibleItems}
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

              <div className="hidden">
                <DashboardWeekGridClient
                  items={visibleItems}
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
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

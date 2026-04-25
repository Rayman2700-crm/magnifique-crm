"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardWeekGridClient from "./DashboardWeekGridClient";
import { supabaseBrowser } from "@/lib/supabase/client";
import { deleteAppointmentFromCalendar, getReadOnlyExtraGoogleCalendarEventsForRange, syncGoogleCalendarRangeToAppointments } from "@/app/calendar/actions";
import type { AppointmentStatus, Item, ViewMode } from "@/components/calendar/types";
import AppointmentDetailSlideover from "@/components/calendar/AppointmentDetailSlideover";
import ReminderSlideover from "@/components/reminders/ReminderSlideover";

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
  google_calendar_id?: string | null;
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
  avatarUrl?: string | null;
  ringColor?: string | null;
  bgColor?: string | null;
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


function hasExtraGoogleCalendarMarker(notes: string | null | undefined) {
  return String(notes ?? "").toLowerCase().includes("google zusatzkalender: ja");
}

function getStudioCalendarDotColor(item: Item) {
  const calendarId = String((item as any).googleCalendarId ?? "").trim().toLowerCase();
  if (calendarId === "radu.craus@gmail.com") return "#4F7CFF";
  if (calendarId === "raluca.magnifique@gmail.com") return "#A855F7";
  return String((item as any).googleCalendarColor ?? "").trim() || null;
}

function getReminderIndicator(item: Item) {
  if ((item as any).isExtraGoogleCalendar) return null;
  if ((item.status ?? "scheduled") !== "scheduled") return null;

  const reminderSentAt = String((item as any).reminderSentAt ?? "").trim();
  if (reminderSentAt) {
    return {
      tone: "sent" as const,
      color: "#22c55e",
      label: "Reminder gesendet",
    };
  }

  const startMs = new Date(item.start_at).getTime();
  if (Number.isNaN(startMs)) return null;

  const msUntilStart = startMs - Date.now();
  if (msUntilStart <= 0 || msUntilStart > 48 * 60 * 60 * 1000) {
    return null;
  }

  return {
    tone: "open" as const,
    color: "#facc15",
    label: "Reminder offen",
  };
}

function calendarSourceMeta(calendarId: string | null | undefined) {
  const raw = String(calendarId ?? "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return {
      id: "",
      label: "Google",
      shortLabel: "Google",
      color: "#64748b",
    };
  }

  if (lower.includes("holiday")) {
    return {
      id: raw,
      label: "Feiertage",
      shortLabel: "Feiertage",
      color: "#ef4444",
    };
  }

  if (lower.includes("family")) {
    return {
      id: raw,
      label: "Familie",
      shortLabel: "Familie",
      color: "#10b981",
    };
  }

  if (lower.includes("weeknum") || lower.includes("kalenderwoche")) {
    return {
      id: raw,
      label: "Kalenderwochen",
      shortLabel: "KW",
      color: "#f59e0b",
    };
  }

  if (lower.includes("realist") || lower.includes("internet")) {
    return {
      id: raw,
      label: "Internetkalender",
      shortLabel: "Internet",
      color: "#8b5cf6",
    };
  }

  if (raw.includes("@")) {
    const localPart = raw.split("@")[0] ?? "";
    const words = localPart
      .replace(/[._-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const title = words
      .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
      .join(" ")
      .trim();

    const finalLabel = title || raw;

    return {
      id: raw,
      label: finalLabel,
      shortLabel: finalLabel.split(/\s+/)[0] || finalLabel,
      color: "#3b82f6",
    };
  }

  const safeLabel = raw.length > 28 ? `${raw.slice(0, 28).trim()}…` : raw;

  return {
    id: raw,
    label: safeLabel,
    shortLabel: safeLabel.split(/\s+/)[0] || safeLabel,
    color: "#3b82f6",
  };
}


type CalendarFilterSource = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  kind: "studio" | "extra" | "other";
};

const STUDIO_RADU_CALENDAR_ID = "radu.craus@gmail.com";
const STUDIO_MAGNIFIQUE_CALENDAR_ID = "raluca.magnifique@gmail.com";

function getAllowedStudioCalendarIds(isAdmin: boolean) {
  return isAdmin
    ? [STUDIO_RADU_CALENDAR_ID, STUDIO_MAGNIFIQUE_CALENDAR_ID]
    : [STUDIO_MAGNIFIQUE_CALENDAR_ID];
}

function getStudioCalendarSource(calendarId: string): CalendarFilterSource | null {
  const normalized = normalizeConfiguredCalendarId(calendarId);
  if (normalized === STUDIO_RADU_CALENDAR_ID) {
    return {
      id: STUDIO_RADU_CALENDAR_ID,
      label: "Studio Radu",
      shortLabel: "Radu",
      color: "#4F7CFF",
      kind: "studio",
    };
  }

  if (normalized === STUDIO_MAGNIFIQUE_CALENDAR_ID) {
    return {
      id: STUDIO_MAGNIFIQUE_CALENDAR_ID,
      label: "Studio Magnifique Beauty Institut",
      shortLabel: "Magnifique",
      color: "#A855F7",
      kind: "studio",
    };
  }

  return null;
}

function normalizeConfiguredCalendarId(rawValue: string | null | undefined) {
  const raw = String(rawValue ?? "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "";

  if (lower.includes(STUDIO_RADU_CALENDAR_ID) || lower.includes("studio radu") || lower.includes("radu studio")) {
    return STUDIO_RADU_CALENDAR_ID;
  }

  if (
    lower.includes(STUDIO_MAGNIFIQUE_CALENDAR_ID) ||
    lower.includes("studio raluca") ||
    lower.includes("raluca studio") ||
    lower.includes("studio magnifique") ||
    lower.includes("magnifique beauty institut")
  ) {
    return STUDIO_MAGNIFIQUE_CALENDAR_ID;
  }

  return raw;
}

function getConnectionRowCalendarIds(row: any) {
  const email = String(row?.google_account_email ?? "").trim();
  const name = String(row?.google_account_name ?? "").trim();
  const label = String(row?.connection_label ?? "").trim();
  const combined = [email, name, label].filter(Boolean).join(" ").toLowerCase();

  if (!combined) return [] as string[];

  if (combined.includes(STUDIO_RADU_CALENDAR_ID) || combined.includes("studio radu") || combined.includes("radu studio")) {
    return [STUDIO_RADU_CALENDAR_ID];
  }

  if (
    combined.includes(STUDIO_MAGNIFIQUE_CALENDAR_ID) ||
    combined.includes("studio raluca") ||
    combined.includes("raluca studio") ||
    combined.includes("studio magnifique") ||
    combined.includes("magnifique beauty institut")
  ) {
    return [STUDIO_MAGNIFIQUE_CALENDAR_ID];
  }

  const preferred = email || name || label;
  return preferred ? [preferred] : [];
}

function calendarFilterSourceMeta(item: Item): CalendarFilterSource | null {
  const rawId = String((item as any).googleCalendarId ?? "").trim();
  const rawLabel = String((item as any).googleCalendarLabel ?? "").trim();
  const normalizedId = normalizeConfiguredCalendarId(rawId || rawLabel);
  const lowerLabel = rawLabel.toLowerCase();

  if (!normalizedId && !rawLabel) return null;

  const studioSource = getStudioCalendarSource(normalizedId || rawLabel);
  if (studioSource) return studioSource;

  if (lowerLabel === "google" || lowerLabel === "google kalender" || lowerLabel === "google calendar") {
    return null;
  }

  const meta = calendarSourceMeta(normalizedId || rawLabel);
  const cleanedLabel = rawLabel && rawLabel.toLowerCase() !== "google" ? rawLabel : meta.label;
  const cleanedShortLabel = String((item as any).googleCalendarShortLabel ?? "").trim() || meta.shortLabel;

  return {
    id: normalizedId || meta.id,
    label: cleanedLabel,
    shortLabel: cleanedShortLabel,
    color: String((item as any).googleCalendarColor ?? "").trim() || meta.color,
    kind: Boolean((item as any).isExtraGoogleCalendar) ? "extra" : "other",
  };
}


function EyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
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

function findLegendUserForStudioCalendarId(calendarId: string, legendUsers: LegendUser[]) {
  const normalized = normalizeConfiguredCalendarId(calendarId);
  if (!normalized) return null;

  if (normalized === STUDIO_RADU_CALENDAR_ID) {
    return (
      legendUsers.find((user) => {
        const fullName = String(user.fullName ?? "").toLowerCase();
        const display = String(user.tenantDisplayName ?? "").toLowerCase();
        return fullName.includes("radu") || display.includes("radu");
      }) ?? null
    );
  }

  if (normalized === STUDIO_MAGNIFIQUE_CALENDAR_ID) {
    return (
      legendUsers.find((user) => {
        const fullName = String(user.fullName ?? "").toLowerCase();
        const display = String(user.tenantDisplayName ?? "").toLowerCase();
        return (
          fullName.includes("raluca") ||
          display.includes("magnifique") ||
          display.includes("raluca")
        );
      }) ?? null
    );
  }

  return null;
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
  const [mounted, setMounted] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactShown, setContactShown] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const openReminderSlideover = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openReminders", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}?openReminders=1`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setReturnTo(window.location.pathname + window.location.search);
    }
  }, []);

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

  const reminderSlideoverItems = useMemo(
    () =>
      dayItems
        .filter((item: Item) => Boolean(getReminderIndicator(item)))
        .map((item: Item) => ({
          ...(item as any),
          reminderAt: (item as any).reminderAt ?? null,
        })),
    [dayItems]
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
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
          <div className="hidden truncate text-sm font-bold text-white md:block">Tagestermine</div>
          <div className="truncate text-xs text-white/50 md:text-xs">{selectedLabel}</div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.03] px-1 py-1 text-xs font-semibold text-white/70">
          <span className="md:hidden">{dayItems.length}</span>
          <span className="hidden md:inline">{dayItems.length} {dayItems.length === 1 ? "Termin" : "Termine"}</span>
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
            const theme = getLegendThemeFromUser(legendUser);

            return (
              <div
                key={item.id}
                className="relative flex flex-wrap items-start gap-2.5 rounded-[12px] border border-white/8 bg-white/[0.03] px-1 py-1 pl-4 md:flex-nowrap md:items-center"
              >
                <div
                  className="absolute left-[4px] top-[4px] bottom-[4px] z-10 w-[4px] rounded-full"
                  style={{
                    backgroundColor: theme.ring,
                    boxShadow: `0 0 0 1px ${theme.ring}, 0 0 12px ${theme.ring}66`,
                  }}
                  aria-hidden="true"
                />

                {getStudioCalendarDotColor(item) ? (
                  <div
                    className="shrink-0"
                    title={String((item as any).googleCalendarLabel)}
                    style={{
                      width: 10,
                      height: 25,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: getStudioCalendarDotColor(item) ?? "#64748b",
                        boxShadow: `0 0 10px ${(getStudioCalendarDotColor(item) ?? "#64748b")}88`,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                  </div>
                ) : null}

                <div
                  className="order-1 shrink-0 self-start md:order-none md:self-center"
                  style={{
                    width: 84,
                    height: 25,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div className="text-[13px] font-semibold text-white/92 md:text-[13px]">
                    {formatTimeRange(item.start_at, item.end_at)}
                  </div>
                </div>

                <div className="order-4 min-w-0 basis-full text-[11px] text-white/84 md:order-none md:basis-auto md:flex-1">
                  <div className="flex min-w-0 flex-col gap-2 md:block">
                    <div className="pr-2 md:pr-0">
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
                      <span className="inline">{item.title || "Dienstleistung unbekannt"}</span>
                    </div>
                  </div>
                </div>

                <div className="order-3 ml-auto flex shrink-0 self-end md:order-none md:ml-0 md:self-center">
                  <div className="flex items-center gap-1">
                  {item.canDeleteAppointment ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenInEditMode(true);
                        setSelectedItem(item);
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-white/80 transition hover:scale-[1.04] hover:border-white/20 hover:bg-white/[0.12] hover:text-white"
                      title="Termin bearbeiten"
                      aria-label="Termin bearbeiten"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                  ) : null}

                  {(() => {
                    const reminderIndicator = getReminderIndicator(item);
                    if (!reminderIndicator) return null;

                    return (
                      <button
                        type="button"
                        onClick={openReminderSlideover}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border transition hover:scale-[1.04]"
                        style={{
                          borderColor:
                            reminderIndicator.tone === "sent"
                              ? "rgba(34,197,94,0.36)"
                              : "rgba(250,204,21,0.36)",
                          backgroundColor:
                            reminderIndicator.tone === "sent"
                              ? "rgba(34,197,94,0.12)"
                              : "rgba(250,204,21,0.12)",
                          color: reminderIndicator.color,
                          boxShadow:
                            reminderIndicator.tone === "sent"
                              ? "0 0 0 1px rgba(34,197,94,0.08)"
                              : "0 0 0 1px rgba(250,204,21,0.08)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            reminderIndicator.tone === "sent"
                              ? "rgba(34,197,94,0.20)"
                              : "rgba(250,204,21,0.20)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            reminderIndicator.tone === "sent"
                              ? "rgba(34,197,94,0.12)"
                              : "rgba(250,204,21,0.12)";
                        }}
                        title={reminderIndicator.label}
                        aria-label={reminderIndicator.label}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.6 1.43L4 17h5" />
                          <path d="M9 17a3 3 0 0 0 6 0" />
                        </svg>
                      </button>
                    );
                  })()}

                  {item.canDeleteAppointment ? (
                    <form
                      action={deleteAppointmentFromCalendar.bind(null, item.id)}
                      onSubmit={(event) => {
                        if (!confirm("Termin wirklich löschen? Das löscht auch den Google-Kalender Eintrag.")) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button
                        type="submit"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 text-red-300 transition hover:bg-red-600 hover:text-white"
                        title="Termin löschen"
                        aria-label="Termin löschen"
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </form>
                  ) : null}
                  </div>
                </div>

                <div
                  className="order-2 relative h-6 w-6 shrink-0 self-start overflow-hidden rounded-full border-2 bg-[#111216] md:order-none md:self-center"
                  style={{ borderColor: theme.ring }}
                  title={avatarName ?? "Behandler"}
                >
                  {legendUser ? (
                    <img
                      src={legendUser.avatarUrl || `/users/${legendUser.userId}.png`}
                      alt={avatarName ?? "Behandler"}
                      className="h-full w-full object-cover"
                      onError={avatarFallbackHandler(legendUser.userId)}
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

      <AppointmentDetailSlideover
        mounted={mounted}
        selected={selectedItem as any}
        onClose={() => {
          setSelectedItem(null);
          setOpenInEditMode(false);
        }}
        initialEditMode={openInEditMode}
      />

      <PhoneQuickActionsSlideover
        open={contactOpen}
        shown={contactShown}
        phone={contactPhone}
        customerName={contactName}
        onClose={closeContact}
      />

      <ReminderSlideover items={reminderSlideoverItems as any} currentUserEmail={null} />
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
  availableCalendarSources = [],
  selectedCalendarSourceIds = [],
  setSelectedCalendarSourceIds,
}: {
  valueISO: string;
  view: ViewMode;
  onSelect: (iso: string) => void;
  items: Item[];
  onToday?: () => void;
  isMobileCompact?: boolean;
  availableCalendarSources?: CalendarFilterSource[];
  selectedCalendarSourceIds?: string[];
  setSelectedCalendarSourceIds: (next: string[]) => void;
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
        maxWidth: "100%",
        borderRadius: 16,
        overflow: "hidden",
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

        <div
  style={{
    display: "flex",
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginLeft: isMobileCompact ? 12 : "auto",
  }}
>
          {isMobileCompact ? (
            <MobileCalendarFilterPicker
              sources={availableCalendarSources}
              selectedIds={selectedCalendarSourceIds}
              onChange={setSelectedCalendarSourceIds}
              compact
            />
          ) : null}
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



function pickLegendColor(source: any, keys: string[]) {
  if (!source || typeof source !== "object") return null;

  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function pickLegendNestedColor(source: any) {
  if (!source || typeof source !== "object") return null;

  const nestedCandidates = [source.profile, source.settings, source.tenant, source.theme, source.preferences];
  for (const candidate of nestedCandidates) {
    const nested = pickLegendColor(candidate, [
      "ringColor",
      "avatarRingColor",
      "avatarColor",
      "tenantColor",
      "accentColor",
      "profileColor",
      "primaryColor",
      "brandColor",
      "color",
    ]);
    if (nested) return nested;
  }

  return null;
}

function getLegendThemeFromUser(user: LegendUser | null | undefined) {
  const explicitRing =
    user?.ringColor ??
    pickLegendColor(user as any, [
      "ringColor",
      "avatarRingColor",
      "avatarColor",
      "tenantColor",
      "accentColor",
      "profileColor",
      "primaryColor",
      "brandColor",
      "color",
    ]) ??
    pickLegendNestedColor(user as any);

  const explicitBg =
    user?.bgColor ??
    pickLegendColor(user as any, ["bgColor", "avatarBgColor", "backgroundColor", "accentBgColor"]) ??
    null;

  if (explicitRing) {
    return {
      ring: explicitRing,
      bg: explicitBg ?? `${explicitRing}1f`,
    };
  }

  return getLegendAvatarTheme(user?.fullName ?? user?.tenantDisplayName);
}

function getLegendAvatarTheme(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();

  if (n.includes("radu")) return { ring: "#4F7CFF", bg: "rgba(79,124,255,0.16)" };
  if (n.includes("raluca")) return { ring: "#A855F7", bg: "rgba(168,85,247,0.16)" };
  if (n.includes("alexandra")) return { ring: "#22C55E", bg: "rgba(34,197,94,0.16)" };
  if (n.includes("barbara")) return { ring: "#F97316", bg: "rgba(249,115,22,0.16)" };

  return { ring: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.08)" };
}



function getLegendFilterCandidates(user: LegendUser | null | undefined) {
  if (!user) return [];

  const fullName = String(user.fullName ?? "").trim().toLowerCase();
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const tenantDisplayName = String(user.tenantDisplayName ?? "").trim().toLowerCase();
  const tenantId = String(user.tenantId ?? "").trim().toLowerCase();
  const filterTenantId = String(user.filterTenantId ?? "").trim().toLowerCase();
  const userId = String(user.userId ?? "").trim().toLowerCase();

  return Array.from(
    new Set(
      [tenantId, filterTenantId, tenantDisplayName, fullName, firstName, userId].filter(Boolean)
    )
  );
}

function getLegendFilterValue(user: LegendUser | null | undefined) {
  return getLegendFilterCandidates(user)[0] ?? "";
}

function matchesSelectedTenant(
  item: Item,
  selectedTenantId: string | null,
  legendUsers: LegendUser[]
) {
  if (!selectedTenantId) return true;

  const selected = String(selectedTenantId).trim().toLowerCase();
  if (!selected) return true;

  const directCandidates = Array.from(
    new Set(
      [
        String(item.tenantId ?? "").trim().toLowerCase(),
        String(item.tenantName ?? "").trim().toLowerCase(),
      ].filter(Boolean)
    )
  );

  if (directCandidates.includes(selected)) return true;

  const matchingLegendUsers = legendUsers.filter((user) => {
    const candidates = getLegendFilterCandidates(user);
    return (
      candidates.includes(String(item.tenantId ?? "").trim().toLowerCase()) ||
      candidates.includes(String(item.tenantName ?? "").trim().toLowerCase())
    );
  });

  if (matchingLegendUsers.length === 0) {
    return false;
  }

  return matchingLegendUsers.some((user) => getLegendFilterCandidates(user).includes(selected));
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

function inferLegendUserId(name: string | null | undefined) {
  const n = String(name ?? "").trim().toLowerCase();

  if (n.includes("radu")) return "radu";
  if (n.includes("raluca")) return "raluca";
  if (n.includes("alexandra")) return "alexandra";
  if (n.includes("barbara")) return "barbara";

  const first = n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)[0];

  return first || "user";
}

function resolveAvatarUrl(avatarPath: string | null | undefined, userId: string) {
  const raw = String(avatarPath ?? "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    const normalized = raw.replace(/^\/+/, "").replace(/^avatars\//i, "");
    const { data } = supabaseBrowser().storage.from("avatars").getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }

  return `/users/${userId}.png`;
}

function avatarFallbackHandler(userId: string) {
  return (event: React.SyntheticEvent<HTMLImageElement>) => {
    const fallback = `/users/${userId}.png`;
    if (event.currentTarget.src.endsWith(fallback)) {
      event.currentTarget.style.display = "none";
      const parent = event.currentTarget.parentElement;
      if (parent) {
        parent.dataset.avatarBroken = "1";
      }
      return;
    }
    event.currentTarget.src = fallback;
  };
}

function buildEffectiveLegendUsers(
  legendUsers: LegendUser[],
  tenants: TenantRow[],
  creatorTenantId: string | null
) {
  const tenantNameById = new Map(
    tenants.map((tenant) => [tenant.id, tenant.display_name?.trim() || "Behandler"] as const)
  );

  const normalizedUsers = legendUsers
    .filter((user) => user && (user.userId || user.fullName || user.tenantDisplayName))
    .map((user) => {
      const tenantId = String(user.tenantId ?? "").trim();
      const filterTenantId = String(user.filterTenantId ?? user.tenantId ?? "").trim();
      const fallbackName =
        tenantNameById.get(filterTenantId) ??
        tenantNameById.get(tenantId) ??
        user.tenantDisplayName ??
        user.fullName ??
        "Behandler";

      return {
        tenantId: tenantId || filterTenantId,
        filterTenantId: filterTenantId || tenantId,
        userId: String(user.userId ?? "").trim() || inferLegendUserId(user.fullName ?? fallbackName),
        fullName: user.fullName ?? fallbackName,
        tenantDisplayName: user.tenantDisplayName || fallbackName,
        avatarUrl: user.avatarUrl ?? null,
        ringColor:
          (user as any).ringColor ??
          (user as any).avatarRingColor ??
          (user as any).avatarColor ??
          (user as any).tenantColor ??
          (user as any).accentColor ??
          (user as any).profileColor ??
          (user as any).primaryColor ??
          (user as any).brandColor ??
          pickLegendNestedColor(user as any) ??
          null,
        bgColor:
          (user as any).bgColor ??
          (user as any).avatarBgColor ??
          (user as any).backgroundColor ??
          (user as any).accentBgColor ??
          null,
      } satisfies LegendUser;
    });

  const byUserId = new Map<string, LegendUser>();

  for (const user of normalizedUsers) {
    const existing = byUserId.get(user.userId);

    if (!existing) {
      byUserId.set(user.userId, user);
      continue;
    }

    byUserId.set(user.userId, {
      ...existing,
      tenantId: existing.tenantId || user.tenantId,
      filterTenantId: existing.filterTenantId || user.filterTenantId,
      fullName: existing.fullName || user.fullName,
      tenantDisplayName: existing.tenantDisplayName || user.tenantDisplayName,
      avatarUrl: existing.avatarUrl || user.avatarUrl,
      ringColor: existing.ringColor || user.ringColor,
      bgColor: existing.bgColor || user.bgColor,
    });
  }

  const deduped = Array.from(byUserId.values());

  const representedTenantIds = new Set(
    deduped.flatMap((user) => [String(user.tenantId ?? "").trim(), String(user.filterTenantId ?? "").trim()]).filter(Boolean)
  );

  for (const tenant of tenants) {
    const display = tenant.display_name?.trim();
    if (!display) continue;
    if (representedTenantIds.has(tenant.id)) continue;

    const matchedByName =
      deduped.find((user) => String(user.fullName ?? "").trim().toLowerCase() === display.toLowerCase()) ??
      deduped.find((user) => String(user.tenantDisplayName ?? "").trim().toLowerCase() === display.toLowerCase()) ??
      null;

    if (matchedByName) {
      representedTenantIds.add(tenant.id);
      continue;
    }
  }

  const priority = ["radu", "raluca", "alexandra", "barbara"];

  deduped.sort((a, b) => {
    const aName = String(a.fullName ?? a.tenantDisplayName).toLowerCase();
    const bName = String(b.fullName ?? b.tenantDisplayName).toLowerCase();
    const aIndex = priority.findIndex((entry) => aName.includes(entry));
    const bIndex = priority.findIndex((entry) => bName.includes(entry));

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }

    return aName.localeCompare(bName, "de");
  });

  if (creatorTenantId) {
    const hasCreator = deduped.some(
      (user) => user.tenantId === creatorTenantId || user.filterTenantId === creatorTenantId
    );

    if (!hasCreator) {
      const creatorTenant = tenants.find((tenant) => tenant.id === creatorTenantId);
      if (creatorTenant?.display_name) {
        deduped.push({
          tenantId: creatorTenant.id,
          filterTenantId: creatorTenant.id,
          userId: inferLegendUserId(creatorTenant.display_name),
          fullName: creatorTenant.display_name,
          tenantDisplayName: creatorTenant.display_name,
          avatarUrl: null,
          ringColor: null,
          bgColor: null,
        });
      }
    }
  }

  return deduped;
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
        const theme = getLegendThemeFromUser(user);
        const active = getLegendFilterCandidates(user).includes(String(activeTenantId ?? "").trim().toLowerCase());
        const chipLabel = (user.fullName ?? user.tenantDisplayName ?? "Behandler").split(/\s+/)[0] || "Behandler";
        return (
          <button
            key={user.userId}
            type="button"
            onClick={() => onSelect(getLegendFilterValue(user))}
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
                src={user.avatarUrl || `/users/${user.userId}.png`}
                alt={user.fullName ?? user.tenantDisplayName ?? "Behandler"}
                className="h-full w-full object-cover"
                onError={avatarFallbackHandler(user.userId)}
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
  const [panelLeft, setPanelLeft] = useState(12);
  const [panelWidth, setPanelWidth] = useState(320);
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

      const viewportPadding = 12;
      const preferredWidth = Math.min(320, window.innerWidth - viewportPadding * 2);
      const nextLeft = Math.min(
        Math.max(viewportPadding, Math.round(rect.right - preferredWidth)),
        Math.max(viewportPadding, window.innerWidth - preferredWidth - viewportPadding)
      );

      const availableHeight = window.innerHeight - rect.bottom - viewportPadding;
      const fallbackTop = Math.max(viewportPadding, Math.round(rect.top - Math.min(420, window.innerHeight - viewportPadding * 2)));
      const nextTop =
        availableHeight >= 220
          ? Math.round(rect.bottom + 12)
          : fallbackTop;

      setPanelWidth(preferredWidth);
      setPanelLeft(nextLeft);
      setPanelTop(nextTop);
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
      : users.find((user) => getLegendFilterCandidates(user).includes(String(activeTenantId ?? "").trim().toLowerCase())) ?? null;

  const ringColors = ["#d6c3a3", ...users.map((user) => getLegendThemeFromUser(user).ring)];
  const ringBackground = useMemo(() => {
    if (activeUser) {
      return getLegendThemeFromUser(activeUser).ring;
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
              src={activeUser.avatarUrl || `/users/${activeUser.userId}.png`}
              alt={activeUser.fullName ?? activeUser.tenantDisplayName ?? "Behandler"}
              className="h-full w-full object-cover"
              onError={avatarFallbackHandler(activeUser.userId)}
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
                style={{ top: panelTop, left: panelLeft, width: panelWidth, maxHeight: "min(70vh, 520px)" }}
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
                    const theme = getLegendThemeFromUser(user);
                    const selected = getLegendFilterCandidates(user).includes(String(activeTenantId ?? "").trim().toLowerCase());
                    return (
                      <button
                        key={user.userId}
                        type="button"
                        onClick={() => {
                          onSelect(getLegendFilterValue(user));
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
                              src={user.avatarUrl || `/users/${user.userId}.png`}
                              alt={user.fullName ?? user.tenantDisplayName ?? "Behandler"}
                              className="h-full w-full object-cover"
                              onError={avatarFallbackHandler(user.userId)}
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
                className="fixed z-[121] w-[min(120px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,28,31,0.98)_0%,rgba(18,19,22,0.98)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.44)] backdrop-blur-xl md:hidden"
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
  title,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
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



function MobileCalendarFilterPicker({
  sources,
  selectedIds,
  onChange,
  compact = false,
}: {
  sources: CalendarFilterSource[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelTop, setPanelTop] = useState(0);
  const [panelLeft, setPanelLeft] = useState(12);
  const [panelWidth, setPanelWidth] = useState(320);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const allSelected = sources.length > 0 && selectedIds.length === sources.length;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportPadding = 12;
      const preferredWidth = Math.min(320, window.innerWidth - viewportPadding * 2);
      const nextLeft = Math.min(
        Math.max(viewportPadding, Math.round(rect.right - preferredWidth)),
        Math.max(viewportPadding, window.innerWidth - preferredWidth - viewportPadding)
      );
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const fallbackTop = Math.max(
        viewportPadding,
        Math.round(rect.top - Math.min(420, window.innerHeight - viewportPadding * 2))
      );
      const nextTop = availableBelow >= 220 ? Math.round(rect.bottom + 12) : fallbackTop;

      setPanelWidth(preferredWidth);
      setPanelLeft(nextLeft);
      setPanelTop(nextTop);
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={compact ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border md:hidden" : "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border md:hidden"}
        aria-label="Kalenderanzeige auswählen"
        aria-expanded={open}
        style={{
          borderColor: allSelected ? "rgba(34,197,94,0.42)" : "rgba(255,255,255,0.10)",
          background: allSelected ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.04)",
          color: allSelected ? "#86efac" : "rgba(255,255,255,0.88)",
          boxShadow: compact
            ? (allSelected ? "0 8px 18px rgba(34,197,94,0.18)" : "0 8px 18px rgba(0,0,0,0.22)")
            : (allSelected
                ? "0 0 0 2px rgba(11,11,12,0.95), 0 12px 28px rgba(34,197,94,0.22)"
                : "0 0 0 2px rgba(11,11,12,0.95), 0 10px 28px rgba(0,0,0,0.30)"),
        }}
      >
        <EyeIcon size={compact ? 14 : 18} />
      </button>

      {mounted && open
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Kalenderauswahl schließen"
                className="fixed inset-0 z-[120] bg-[rgba(0,0,0,0.45)] backdrop-blur-[2px] md:hidden"
                onClick={() => setOpen(false)}
              />

              <div
                className="fixed z-[121] w-[min(320px,calc(100vw-24px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl md:hidden"
                style={{ top: panelTop, left: panelLeft, width: panelWidth, maxHeight: "min(70vh, 520px)" }}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Kalender anzeigen</div>
                    <div className="mt-0.5 text-xs text-white/45">Studio- und Zusatzkalender wählen</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                    aria-label="Schließen"
                  >
                    ×
                  </button>
                </div>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(allSelected ? [] : sources.map((source) => source.id))}
                    className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition hover:bg-white/[0.06]"
                    style={{
                      borderColor: allSelected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                      backgroundColor: allSelected ? "rgba(214,195,163,0.10)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">Alle</div>
                      <div className="mt-0.5 text-xs text-white/45">Alle verfügbaren Kalender ein-/ausblenden</div>
                    </div>
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold"
                      style={{
                        borderColor: allSelected ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.16)",
                        background: allSelected ? "rgba(34,197,94,0.16)" : "transparent",
                        color: allSelected ? "#86efac" : "rgba(255,255,255,0.48)",
                      }}
                    >
                      {allSelected ? "✓" : ""}
                    </span>
                  </button>

                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {sources.map((source) => {
                      const isSelected = selectedIds.includes(source.id);
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() =>
                            onChange(
                              isSelected
                                ? selectedIds.filter((id) => id !== source.id)
                                : [...selectedIds, source.id]
                            )
                          }
                          className="flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition hover:bg-white/[0.06]"
                          style={{
                            borderColor: isSelected ? `${source.color}66` : "rgba(255,255,255,0.10)",
                            backgroundColor: isSelected ? `${source.color}12` : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full"
                              style={{ background: source.color }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">{source.label}</div>
                              <div className="truncate text-xs text-white/45">
                                {source.kind === "studio" ? "Studio-Kalender" : source.kind === "extra" ? "Zusatzkalender" : "Kalender"}
                              </div>
                            </div>
                          </div>
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold"
                            style={{
                              borderColor: isSelected ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.16)",
                              background: isSelected ? "rgba(34,197,94,0.16)" : "transparent",
                              color: isSelected ? "#86efac" : "rgba(255,255,255,0.48)",
                            }}
                          >
                            {isSelected ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
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
  const [calendarFilterOpen, setCalendarFilterOpen] = useState(false);
  const [selectedCalendarSourceIds, setSelectedCalendarSourceIds] = useState<string[]>([]);
  const [configuredCalendarSourceIds, setConfiguredCalendarSourceIds] = useState<string[]>([]);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState("");
  const calendarFilterButtonRef = useRef<HTMLDivElement | null>(null);
  const calendarFilterPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopSearchButtonRef = useRef<HTMLButtonElement | null>(null);
  const desktopSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const miniMonthCardRef = useRef<HTMLDivElement | null>(null);
  const [miniMonthCardHeight, setMiniMonthCardHeight] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguredCalendarSourceIds() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) return;

        const [{ data }, { data: connectionRows }] = await Promise.all([
          supabase
            .from("google_oauth_tokens")
            .select("default_calendar_id, enabled_calendar_ids")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("google_oauth_connections")
            .select("google_account_email, google_account_name, connection_label, is_active, is_read_only")
            .eq("owner_user_id", user.id),
        ]);

        if (cancelled) return;

        const rows = Array.isArray(connectionRows) ? connectionRows : [];
        const activeRows = rows.filter((row: any) => row?.is_active === true);

        if (!activeRows.length) {
          setConfiguredCalendarSourceIds([]);
          return;
        }

        const blockedIds = new Set(
          rows
            .filter((row: any) => row?.is_read_only === true && row?.is_active === false)
            .flatMap((row: any) => getConnectionRowCalendarIds(row))
            .map((value: any) => normalizeConfiguredCalendarId(String(value ?? "").trim()))
            .filter(Boolean)
        );

        const defaultId = normalizeConfiguredCalendarId(String((data as any)?.default_calendar_id ?? "").trim());
        const enabledIds = Array.isArray((data as any)?.enabled_calendar_ids)
          ? (data as any).enabled_calendar_ids.map((value: any) => normalizeConfiguredCalendarId(String(value ?? "").trim())).filter(Boolean)
          : [];

        const inferredConnectedIds = Array.from(
          new Set(
            activeRows
              .flatMap((row: any) => getConnectionRowCalendarIds(row))
              .map((value: any) => normalizeConfiguredCalendarId(String(value ?? "").trim()))
              .filter(Boolean)
          )
        );

        const next = Array.from(
          new Set([defaultId, ...enabledIds, ...inferredConnectedIds].filter((value) => value && !blockedIds.has(value)))
        );

        setConfiguredCalendarSourceIds(next);
      } catch {
        if (!cancelled) setConfiguredCalendarSourceIds([]);
      }
    }

    void loadConfiguredCalendarSourceIds();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

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
  const googleSyncPollInFlightRef = useRef(false);
  const lastGoogleSyncAtRef = useRef(0);

  const view = calendarState.view;
  const anchorISO = calendarState.anchorISO;

  const effectiveLegendUsers = useMemo(
    () => buildEffectiveLegendUsers(legendUsers, tenants, creatorTenantId),
    [creatorTenantId, legendUsers, tenants]
  );

  const effectiveLegendUsersWithAvatars = useMemo(
    () =>
      effectiveLegendUsers.map((user) => ({
        ...user,
        avatarUrl: user.avatarUrl ?? `/users/${user.userId}.png`,
      })),
    [effectiveLegendUsers]
  );

  const currentLegendUser = useMemo(() => {
    if (!creatorTenantId) return null;

    return (
      effectiveLegendUsersWithAvatars.find(
        (u) => u.tenantId === creatorTenantId || u.filterTenantId === creatorTenantId
      ) ?? null
    );
  }, [creatorTenantId, effectiveLegendUsersWithAvatars]);

  const studioCalendarTenantMap = useMemo(() => {
    const entries: Array<[string, { tenantId: string; tenantName: string }]> = [];

    for (const calendarId of [STUDIO_RADU_CALENDAR_ID, STUDIO_MAGNIFIQUE_CALENDAR_ID]) {
      const legendUser = findLegendUserForStudioCalendarId(calendarId, effectiveLegendUsersWithAvatars);
      if (!legendUser) continue;

      const tenantId = String(legendUser.filterTenantId || legendUser.tenantId || "").trim();
      const tenantName = String(legendUser.tenantDisplayName || legendUser.fullName || "").trim();

      if (!tenantId || !tenantName) continue;
      entries.push([calendarId, { tenantId, tenantName }]);
    }

    return new Map(entries);
  }, [effectiveLegendUsersWithAvatars]);

  const currentTenantDisplayName =
    currentLegendUser?.tenantDisplayName ??
    tenants.find((t) => t.id === creatorTenantId)?.display_name ??
    null;

  const isAdmin = useMemo(() => {
    if (typeof isAdminProp === "boolean") return isAdminProp;
    if (effectiveLegendUsers.length > 1) return true;
    return isAdminTenantName(currentTenantDisplayName);
  }, [currentTenantDisplayName, effectiveLegendUsers.length, isAdminProp]);

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

  const mapAppointmentRowsToItems = useCallback(async (appts: ApptRow[]) => {
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

      for (const cp of (cps ?? []) as CustomerProfileRow[]) {
        cpMap.set(`${cp.tenant_id}:${cp.person_id}`, cp.id);
      }
    }

    return appts.map((a) => {
      const parsed = parseNotes(a.notes_internal);
      const key = `${a.tenant_id}:${a.person_id}`;
      const customerProfileId = cpMap.get(key) ?? null;
      const tenant = firstJoin(a.tenant);
      const person = firstJoin(a.person);

      const isExtraGoogleCalendar = hasExtraGoogleCalendarMarker(a.notes_internal ?? null);
      const canManageCustomerActions = !isExtraGoogleCalendar && (isAdmin || (!!creatorTenantId && a.tenant_id === creatorTenantId));
      const sourceMeta = isExtraGoogleCalendar
        ? calendarSourceMeta(a.google_calendar_id ?? null)
        : { id: String(a.google_calendar_id ?? "").trim(), label: null, shortLabel: null, color: null };

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
        googleCalendarId: sourceMeta.id,
        googleCalendarLabel: sourceMeta.label,
        googleCalendarShortLabel: sourceMeta.shortLabel,
        googleCalendarColor: sourceMeta.color,
        isExtraGoogleCalendar,
      } as Item;
    });
  }, [creatorTenantId, isAdmin, supabase]);

  const mergeItemsByIdAndSort = useCallback((baseItems: Item[], extraItems: Item[] = []) => {
    const deduped = new Map<string, Item>();
    for (const item of [...baseItems, ...extraItems]) {
      deduped.set(String(item.id), item);
    }
    return Array.from(deduped.values()).sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, []);

  const loadExtraGoogleItems = useCallback(async () => {
    // Private/Zusatzkalender sind pro Benutzer read-only und muessen fuer alle Benutzer sichtbar geladen werden.
    // Nicht nur Admin: jeder eingeloggte Benutzer darf seinen eigenen privaten Kalender anzeigen.
    try {
      const extraResult = await getReadOnlyExtraGoogleCalendarEventsForRange({
        startISO: range.startISO,
        endISO: range.endISO,
      });

      return Array.isArray(extraResult?.items)
        ? extraResult.items.map((event: any) => {
            const calendarId = normalizeConfiguredCalendarId(String(event.googleCalendarId ?? "").trim());
            const mappedTenant = studioCalendarTenantMap.get(calendarId);
            const fallbackTenantId = String(creatorTenantId ?? currentLegendUser?.filterTenantId ?? currentLegendUser?.tenantId ?? "").trim();
            const fallbackTenantName =
              String(currentLegendUser?.tenantDisplayName ?? currentTenantDisplayName ?? "Google Kalender").trim() ||
              "Google Kalender";

            return {
              id: String(event.id),
              start_at: String(event.start_at),
              end_at: String(event.end_at),
              title:
                String(event.note ?? "").trim() ||
                String(event.googleCalendarLabel ?? "").trim() ||
                "Zusatzkalender",
              note: String(event.note ?? "").trim(),
              status: "scheduled" as AppointmentStatus,
              tenantId: mappedTenant?.tenantId ?? fallbackTenantId ?? calendarId,
              tenantName: mappedTenant?.tenantName ?? fallbackTenantName,
              customerProfileId: null,
              customerName: String(event.title ?? "Privater Termin").trim() || "Privater Termin",
              customerPhone: null,
              customerEmail: null,
              reminderSentAt: null,
              canOpenCustomerProfile: false,
              canCreateFollowUp: false,
              canDeleteAppointment: false,
              googleCalendarId: String(event.googleCalendarId ?? "").trim(),
              googleCalendarLabel: String(event.googleCalendarLabel ?? "").trim() || null,
              googleCalendarShortLabel: String(event.googleCalendarShortLabel ?? "").trim() || null,
              googleCalendarColor: String(event.googleCalendarColor ?? "").trim() || null,
              isExtraGoogleCalendar: true,
            } as Item;
          })
        : [];
    } catch (extraError: any) {
      console.error("Zusatzkalender konnten nicht geladen werden", extraError);
      return [] as Item[];
    }
  }, [creatorTenantId, currentLegendUser, currentTenantDisplayName, range.endISO, range.startISO, studioCalendarTenantMap]);

  const loadAppointments = useCallback(async (options?: { skipGoogleSync?: boolean }) => {
    const seq = ++loadSeq.current;
    const hasExistingItems = hasLoadedOnceRef.current;

    if (hasExistingItems) setIsRefreshing(true);
    else setIsInitialLoading(true);

    setErrorText(null);

    try {
      const apptQuery = supabase
        .from("appointments")
        .select(
          `
          id,start_at,end_at,notes_internal,reminder_sent_at,tenant_id,person_id,google_calendar_id,
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

      const mappedItems = await mapAppointmentRowsToItems((apptData ?? []) as ApptRow[]);
      if (seq !== loadSeq.current) return;

      const extraItems = await loadExtraGoogleItems();
      if (seq !== loadSeq.current) return;

      setItems(mergeItemsByIdAndSort(mappedItems, extraItems));
      hasLoadedOnceRef.current = true;
      setIsInitialLoading(false);
      setIsRefreshing(false);

      const nowMs = Date.now();
      const shouldRunGoogleSync = !options?.skipGoogleSync && nowMs - lastGoogleSyncAtRef.current > 20_000;

      if (!shouldRunGoogleSync) return;

      lastGoogleSyncAtRef.current = nowMs;

      syncGoogleCalendarRangeToAppointments({
        startISO: range.startISO,
        endISO: range.endISO,
      })
        .then(() => {
          loadAppointments({ skipGoogleSync: true });
        })
        .catch((syncError: any) => {
          console.error("Google-Kalender Sync fehlgeschlagen", syncError);
        });
    } catch (error: any) {
      if (seq !== loadSeq.current) return;
      setErrorText(error?.message ?? "Kalender konnte nicht geladen werden.");
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [loadExtraGoogleItems, mapAppointmentRowsToItems, mergeItemsByIdAndSort, range.endISO, range.startISO, supabase]);

  const scheduleRefresh = useCallback((options?: { immediate?: boolean }) => {
    if (document.visibilityState !== "visible") return;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    const run = () => {
      loadAppointments({ skipGoogleSync: true });
    };

    if (options?.immediate) {
      run();
      return;
    }

    refreshTimeoutRef.current = setTimeout(run, 250);
  }, [loadAppointments]);

  const upsertAppointmentById = useCallback(async (appointmentId: string) => {
    const normalizedId = String(appointmentId ?? "").trim();
    if (!normalizedId) return;

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
        id,start_at,end_at,notes_internal,reminder_sent_at,tenant_id,person_id,google_calendar_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name, phone, email )
      `
      )
      .eq("id", normalizedId)
      .maybeSingle();

    if (error) {
      scheduleRefresh({ immediate: true });
      return;
    }

    const row = (data ?? null) as ApptRow | null;

    if (!row) {
      setItems((prev) => prev.filter((item) => String(item.id) !== normalizedId));
      return;
    }

    const startMs = new Date(row.start_at).getTime();
    const rangeStartMs = new Date(range.startISO).getTime();
    const rangeEndMs = new Date(range.endISO).getTime();

    if (Number.isNaN(startMs) || startMs < rangeStartMs || startMs >= rangeEndMs) {
      setItems((prev) => prev.filter((item) => String(item.id) !== normalizedId));
      return;
    }

    const mappedItems = await mapAppointmentRowsToItems([row]);
    const nextItem = mappedItems[0] ?? null;

    if (!nextItem) {
      setItems((prev) => prev.filter((item) => String(item.id) !== normalizedId));
      return;
    }

    setItems((prev) => mergeItemsByIdAndSort(prev.filter((item) => String(item.id) !== normalizedId), [nextItem]));
  }, [mapAppointmentRowsToItems, mergeItemsByIdAndSort, range.endISO, range.startISO, scheduleRefresh, supabase]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    const runGoogleSyncOnReturn = async () => {
      if (document.visibilityState !== "visible") return;
      if (googleSyncPollInFlightRef.current) return;

      const nowMs = Date.now();
      // Kein Dauer-Polling mehr: Google wird nur beim Zurueckkehren/Fokus synchronisiert.
      // Der kleine Cooldown verhindert doppelte Syncs durch focus + visibilitychange gleichzeitig.
      if (nowMs - lastGoogleSyncAtRef.current < 10_000) return;

      googleSyncPollInFlightRef.current = true;
      lastGoogleSyncAtRef.current = nowMs;

      try {
        await syncGoogleCalendarRangeToAppointments({
          startISO: range.startISO,
          endISO: range.endISO,
        });

        await loadAppointments({ skipGoogleSync: true });
      } catch (syncError: any) {
        console.error("Google-Kalender Fokus-Sync fehlgeschlagen", syncError);
      } finally {
        googleSyncPollInFlightRef.current = false;
      }
    };

    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void runGoogleSyncOnReturn();
      }
    };

    window.addEventListener("focus", handleVisible);
    window.addEventListener("pageshow", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("pageshow", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
      googleSyncPollInFlightRef.current = false;
    };
  }, [loadAppointments, range.endISO, range.startISO]);

  useEffect(() => {
    const triggerVisibleRefresh = () => {
      if (document.visibilityState !== "visible") return;
      scheduleRefresh({ immediate: true });
    };

    const triggerFocusRefresh = () => {
      scheduleRefresh({ immediate: true });
    };

    window.addEventListener("focus", triggerFocusRefresh);
    window.addEventListener("pageshow", triggerFocusRefresh);
    document.addEventListener("visibilitychange", triggerVisibleRefresh);

    return () => {
      window.removeEventListener("focus", triggerFocusRefresh);
      window.removeEventListener("pageshow", triggerFocusRefresh);
      document.removeEventListener("visibilitychange", triggerVisibleRefresh);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-appointments-realtime-${view}-${anchorISO}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments" }, (payload: any) => {
        void upsertAppointmentById(String((payload as any)?.new?.id ?? ""));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, (payload: any) => {
        void upsertAppointmentById(String((payload as any)?.new?.id ?? (payload as any)?.old?.id ?? ""));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "appointments" }, (payload: any) => {
        const deletedId = String((payload as any)?.old?.id ?? "").trim();
        if (!deletedId) {
          scheduleRefresh({ immediate: true });
          return;
        }
        setItems((prev) => prev.filter((item) => String(item.id) !== deletedId));
      })
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleRefresh({ immediate: true });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [anchorISO, scheduleRefresh, supabase, upsertAppointmentById, view]);

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
    if (!desktopSearchOpen && !calendarFilterOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const searchPanel = desktopSearchPanelRef.current;
      const searchButton = desktopSearchButtonRef.current;
      const filterPanel = calendarFilterPanelRef.current;
      const filterButton = calendarFilterButtonRef.current;

      if (searchPanel?.contains(target) || searchButton?.contains(target)) return;
      if (filterPanel?.contains(target) || filterButton?.contains(target)) return;

      setDesktopSearchOpen(false);
      setCalendarFilterOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDesktopSearchOpen(false);
        setCalendarFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [calendarFilterOpen, desktopSearchOpen]);

  const availableCalendarSources = useMemo<CalendarFilterSource[]>(() => {
    if (!configuredCalendarSourceIds.length) return [];

    const allowedStudioIds = new Set(getAllowedStudioCalendarIds(isAdmin));
    const byId = new Map<string, CalendarFilterSource>();

    for (const calendarId of configuredCalendarSourceIds) {
      const normalizedId = normalizeConfiguredCalendarId(String(calendarId ?? "").trim());
      if (!normalizedId) continue;

      const studioSource = getStudioCalendarSource(normalizedId);
      if (studioSource) {
        if (allowedStudioIds.has(studioSource.id)) {
          byId.set(studioSource.id, studioSource);
        }
        continue;
      }

      const sourceFromItems = items.find(
        (item) => normalizeConfiguredCalendarId(String((item as any).googleCalendarId ?? "").trim()) === normalizedId
      );
      if (sourceFromItems) {
        const source = calendarFilterSourceMeta(sourceFromItems);
        if (source && source.id && source.label.toLowerCase() !== "google") {
          byId.set(source.id, source);
          continue;
        }
      }

      const meta = calendarSourceMeta(normalizedId);
      if (!meta.id || meta.label.toLowerCase() === "google") continue;

      byId.set(normalizedId, {
        id: normalizedId,
        label: meta.label,
        shortLabel: meta.shortLabel,
        color: meta.color,
        kind: "extra",
      });
    }

    return Array.from(byId.values()).sort((a, b) => {
      const rank = (value: CalendarFilterSource) => {
        if (value.id === STUDIO_RADU_CALENDAR_ID) return 0;
        if (value.id === STUDIO_MAGNIFIQUE_CALENDAR_ID) return 1;
        if (value.kind === "extra") return 2;
        return 3;
      };
      return rank(a) - rank(b) || a.label.localeCompare(b.label, "de");
    });
  }, [configuredCalendarSourceIds, isAdmin, items]);

  useEffect(() => {
    if (!availableCalendarSources.length) {
      setSelectedCalendarSourceIds([]);
      return;
    }

    setSelectedCalendarSourceIds((current) => {
      const validCurrent = current.filter((id) => availableCalendarSources.some((source) => source.id === id));
      if (!validCurrent.length) return availableCalendarSources.map((source) => source.id);
      if (validCurrent.length === current.length) return current;
      return validCurrent;
    });
  }, [availableCalendarSources]);

  const allCalendarSourcesSelected =
    availableCalendarSources.length > 0 &&
    selectedCalendarSourceIds.length === availableCalendarSources.length;

  const selectedCalendarSourceIdSet = useMemo(
    () => new Set(selectedCalendarSourceIds),
    [selectedCalendarSourceIds]
  );

  const visibleItems = useMemo(() => {
    const q = desktopSearchQuery.trim().toLowerCase();
    const queryTokens = q.split(/\s+/).map((token) => token.trim()).filter(Boolean);

    return items.filter((item) => {
      const calendarSource = calendarFilterSourceMeta(item);
      if (calendarSource && selectedCalendarSourceIdSet.size > 0 && !selectedCalendarSourceIdSet.has(calendarSource.id)) {
        return false;
      }

      if (!matchesSelectedTenant(item, selectedTenantId, effectiveLegendUsers)) {
        return false;
      }

      if (!queryTokens.length) return true;

      const legendUser =
        effectiveLegendUsersWithAvatars.find(
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
  }, [creatorTenantId, desktopSearchQuery, items, effectiveLegendUsers, selectedCalendarSourceIdSet, selectedTenantId]);

  return (
    <Card className="overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <CardContent className="p-3 md:p-6 xl:p-8">
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

          @media (min-width: 768px) and (max-width: 1080px) {
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
              {effectiveLegendUsers.length > 0 ? (
                <div className="max-w-[520px] overflow-hidden">
                  <div className="max-w-full overflow-x-auto">
                    <div className="min-w-max">
                      <DesktopHeaderLegend
                        users={effectiveLegendUsersWithAvatars}
                        activeTenantId={selectedTenantId}
                        onSelect={setSelectedTenantId}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {(
                <div ref={calendarFilterButtonRef} className="relative">
                  <DesktopHeaderPillButton
                    active={allCalendarSourcesSelected}
                    ariaLabel="Kalenderanzeige auswählen"
                    title="Kalenderanzeige auswählen"
                    onClick={() => setCalendarFilterOpen((current) => !current)}
                    className="h-11 w-11 shrink-0"
                    style={
                      allCalendarSourcesSelected
                        ? {
                            borderColor: "rgba(34,197,94,0.42)",
                            background: "rgba(34,197,94,0.16)",
                            color: "#86efac",
                            boxShadow: "0 12px 28px rgba(34,197,94,0.22)",
                          }
                        : {
                            color: "rgba(255,255,255,0.72)",
                          }
                    }
                  >
                    <EyeIcon size={18} />
                  </DesktopHeaderPillButton>

                  {calendarFilterOpen ? (
                    <div
                      ref={calendarFilterPanelRef}
                      className="absolute right-0 top-[calc(100%+14px)] z-40 w-[320px] max-w-[min(320px,calc(100vw-48px))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.985)_0%,rgba(12,13,16,0.985)_100%)] p-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between px-1 pb-2">
                        <div>
                          <div className="text-sm font-semibold text-white">Kalender anzeigen</div>
                          <div className="mt-0.5 text-xs text-white/45">Studio- und Zusatzkalender wählen</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCalendarFilterOpen(false)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                          aria-label="Schließen"
                        >
                          ×
                        </button>
                      </div>

                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCalendarSourceIds((current) =>
                              current.length === availableCalendarSources.length
                                ? []
                                : availableCalendarSources.map((source) => source.id)
                            )
                          }
                          className="flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition hover:bg-white/[0.06]"
                          style={{
                            borderColor: allCalendarSourcesSelected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                            backgroundColor: allCalendarSourcesSelected ? "rgba(214,195,163,0.10)" : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div>
                            <div className="text-sm font-semibold text-white">Alle</div>
                            <div className="mt-0.5 text-xs text-white/45">Alle verfügbaren Kalender ein-/ausblenden</div>
                          </div>
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold"
                            style={{
                              borderColor: allCalendarSourcesSelected ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.16)",
                              background: allCalendarSourcesSelected ? "rgba(34,197,94,0.16)" : "transparent",
                              color: allCalendarSourcesSelected ? "#86efac" : "rgba(255,255,255,0.48)",
                            }}
                          >
                            {allCalendarSourcesSelected ? "✓" : ""}
                          </span>
                        </button>

                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                          {availableCalendarSources.map((source) => {
                            const isSelected = selectedCalendarSourceIds.includes(source.id);
                            return (
                              <button
                                key={source.id}
                                type="button"
                                onClick={() =>
                                  setSelectedCalendarSourceIds((current) =>
                                    current.includes(source.id)
                                      ? current.filter((id) => id !== source.id)
                                      : [...current, source.id]
                                  )
                                }
                                className="flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition hover:bg-white/[0.06]"
                                style={{
                                  borderColor: isSelected ? "rgba(214,195,163,0.28)" : "rgba(255,255,255,0.10)",
                                  backgroundColor: isSelected ? "rgba(214,195,163,0.10)" : "rgba(255,255,255,0.02)",
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full"
                                    style={{ background: source.color }}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">{source.label}</div>
                                    <div className="mt-0.5 text-xs text-white/45">
                                      {source.kind === "extra" ? "Zusatzkalender" : "Studio-Kalender"}
                                    </div>
                                  </div>
                                </div>
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold"
                                  style={{
                                    borderColor: isSelected ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.16)",
                                    background: isSelected ? "rgba(34,197,94,0.16)" : "transparent",
                                    color: isSelected ? "#86efac" : "rgba(255,255,255,0.48)",
                                  }}
                                >
                                  {isSelected ? "✓" : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

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

        <div className="md:hidden flex flex-col gap-4 lg:gap-6 min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-white">Kalender</div>
              <div className="text-sm text-white/60">Team-Übersicht</div>
            </div>

            <div className="flex shrink-0 items-center gap-2 md:hidden">
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
              {effectiveLegendUsers.length > 0 ? (
                <MobileLegendPicker
                  users={effectiveLegendUsersWithAvatars}
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

                  <div className="grid gap-4 md:hidden min-w-0">
                    <div className="min-w-0">
                      <DesktopMiniMonthPicker
                        valueISO={anchorISO}
                        view={view}
                        onSelect={handleSetDate}
                        items={visibleItems}
                        onToday={handleToday}
                        isMobileCompact
                        availableCalendarSources={availableCalendarSources}
                        selectedCalendarSourceIds={selectedCalendarSourceIds}
                        setSelectedCalendarSourceIds={setSelectedCalendarSourceIds}
                      />
                    </div>

                    <div className="min-w-0">
                      <DailyAgendaPanel
                        selectedISO={anchorISO}
                        items={visibleItems}
                        legendUsers={effectiveLegendUsersWithAvatars}
                        searchQuery={desktopSearchQuery}
                      />
                    </div>
                  </div>

                  <div className="hidden md:grid md:grid-cols-1 md:gap-4 lg:grid-cols-3">
                    <div ref={miniMonthCardRef} className="lg:col-span-1">
                      <DesktopMiniMonthPicker
                        valueISO={anchorISO}
                        view={view}
                        onSelect={handleSetDate}
                        items={visibleItems}
                        availableCalendarSources={availableCalendarSources}
                        selectedCalendarSourceIds={selectedCalendarSourceIds}
                        setSelectedCalendarSourceIds={setSelectedCalendarSourceIds}
                      />
                    </div>

                    <div
                      className="min-h-0 lg:col-span-2"
                      style={miniMonthCardHeight ? { height: miniMonthCardHeight, minHeight: miniMonthCardHeight, maxHeight: miniMonthCardHeight } : undefined}
                    >
                      <DailyAgendaPanel
                        selectedISO={anchorISO}
                        items={visibleItems}
                        legendUsers={effectiveLegendUsersWithAvatars}
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

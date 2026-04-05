"use client";

import type React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteAppointmentFromCalendar,
  openCustomerProfileFromAppointment,
  openFollowUpFromAppointment,
  openWaitlistFromAppointment,
  updateAppointmentFromCalendar,
  updateAppointmentStatusQuick,
  updateWaitlistStatusQuick,
} from "@/app/calendar/actions";
import {
  createFiscalReceiptForPaymentInline,
  createPaymentForSalesOrderInline,
  createSalesOrderFromAppointmentInline,
} from "@/app/rechnungen/actions";
import ActionPill from "@/components/calendar/ActionPill";
import type { AppointmentStatus, Item } from "@/components/calendar/types";
import {
  buildReminderWhatsAppUrl,
  buildWhatsAppText,
  normalizePhoneForTel,
  normalizePhoneForWhatsApp,
} from "@/components/calendar/utils";
import { supabaseBrowser } from "@/lib/supabase/client";

type WaitlistStatus = "active" | "contacted" | "booked" | "removed";

type WaitlistMatchRow = {
  id: string;
  customer_profile_id: string;
  person_id: string | null;
  service_title: string | null;
  preferred_staff_id: string | null;
  preferred_days: string[] | null;
  time_from: string | null;
  time_to: string | null;
  notes: string | null;
  priority: string | null;
  short_notice_ok: boolean | null;
  reachable_today: boolean | null;
  requested_recently_at: string | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  score: number;
};

type SelectedItem = Item & {
  serviceId?: string | null;
  serviceName?: string | null;
  servicePriceCentsSnapshot?: number | null;
  serviceDurationMinutesSnapshot?: number | null;
  serviceBufferMinutesSnapshot?: number | null;
};

type CheckoutService = {
  id: string;
  name: string;
  defaultPriceCents: number;
};

type CheckoutLine = {
  id: string;
  serviceId: string;
  name: string;
  quantity: number;
  taxRate: string;
  price: string;
};

type CheckoutState = {
  salesOrder: null | {
    id: string;
    status: string;
    currencyCode: string;
    totalCents: number;
    taxTotalCents: number;
    createdAt: string;
    lines: Array<{
      name: string;
      quantity: number;
      unitPriceGross: number;
      taxRate: number;
      lineTotalGross: number;
    }>;
  };
  payment: null | {
    id: string;
    amountGross: number;
    currencyCode: string;
    methodCode: string;
    status: string;
    paidAt: string;
  };
  receipt: null | {
    id: string;
    receiptNumber: string;
    status: string;
    verificationStatus: string | null;
    issuedAt: string;
    turnoverValueCents: number;
    currencyCode: string;
    lineCount: number;
  };
};

function formatEuroFromCents(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format((Number(value ?? 0)) / 100);
}

function formatEuroFromGrossCents(value: number | null | undefined, currencyCode = "EUR") {
  if (!Number.isFinite(value)) return "€ 0,00";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currencyCode,
  }).format((Number(value ?? 0)) / 100);
}


function IconButton({
  onClick,
  title,
  children,
  hoverClassName,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  hoverClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition-colors ${hoverClassName ?? "hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}

function clientiqueButtonClass(variant: "dark" | "primary" | "success" | "danger" | "accent" = "dark", fullWidth = false) {
  const width = fullWidth ? " w-full" : "";
  if (variant === "primary") {
    return "inline-flex h-10 items-center justify-center rounded-xl border border-[#d6c3a3]/30 bg-[#d6c3a3] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#e2d2b6]" + width;
  }
  if (variant === "success") {
    return "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-600/80 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-600" + width;
  }
  if (variant === "danger") {
    return "inline-flex h-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-600/80 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600" + width;
  }
  if (variant === "accent") {
    return "inline-flex h-10 items-center justify-center rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/15" + width;
  }
  return "inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-white/90 transition-colors hover:bg-white/[0.08]" + width;
}

function clientiqueActionButtonStyle(fullWidth = false): React.CSSProperties {
  return {
    height: 40,
    padding: "0 8px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: 700,
    width: fullWidth ? "100%" : undefined,
  };
}

function clientiqueIconButtonClass(variant: "dark" | "primary" = "dark") {
  if (variant === "primary") {
    return "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#d6c3a3]/30 bg-[#d6c3a3] text-black transition-colors hover:bg-[#e2d2b6]";
  }
  return "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/90 transition-colors hover:bg-white/[0.08]";
}

function formatGrossEuro(value: number | null | undefined, currencyCode = "EUR") {
  if (!Number.isFinite(value)) return "€ 0,00";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(value ?? 0));
}

function formatDateTime(value: string | null | undefined) {
  const d = new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function moneyStringToCents(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s+/g, "").replace("€", "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function centsToMoneyString(cents: number) {
  return ((Number(cents ?? 0) || 0) / 100).toFixed(2).replace(".", ",");
}

function normalizeDayLabel(value: string) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "";
  return ({
    mo: "mo", montag: "mo", monday: "mo",
    di: "di", dienstag: "di", tuesday: "di",
    mi: "mi", mittwoch: "mi", wednesday: "mi",
    do: "do", donnerstag: "do", thursday: "do",
    fr: "fr", freitag: "fr", friday: "fr",
    sa: "sa", samstag: "sa", saturday: "sa",
    so: "so", sonntag: "so", sunday: "so",
  } as Record<string, string>)[v] ?? v.slice(0, 2);
}

function formatWaitlistDays(value: string[] | null | undefined) {
  if (!Array.isArray(value) || value.length === 0) return "flexibel";
  return value.join(", ");
}

function formatOptionalTimeRange(timeFrom: string | null, timeTo: string | null) {
  const from = String(timeFrom ?? "").trim();
  const to = String(timeTo ?? "").trim();
  if (!from && !to) return "jede Uhrzeit";
  if (from && to) return `${from.slice(0, 5)}–${to.slice(0, 5)} Uhr`;
  if (from) return `ab ${from.slice(0, 5)} Uhr`;
  return `bis ${to.slice(0, 5)} Uhr`;
}

function getPriorityLabel(value: string | null) {
  const v = String(value ?? "normal").toLowerCase();
  if (v === "high") return "Hoch";
  if (v === "low") return "Niedrig";
  return "Normal";
}

function getPrioritySort(value: string | null) {
  const v = String(value ?? "normal").toLowerCase();
  if (v === "high") return 3;
  if (v === "normal") return 2;
  return 1;
}

function recentRequestScore(value: string | null) {
  if (!value) return 0;
  const requestedAt = new Date(value);
  if (Number.isNaN(requestedAt.getTime())) return 0;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (requestedAt >= todayStart) return 5;
  if (requestedAt >= yesterdayStart) return 3;
  if (requestedAt >= weekAgo) return 1;
  return 0;
}

function recentRequestLabel(value: string | null) {
  if (!value) return null;
  const requestedAt = new Date(value);
  if (Number.isNaN(requestedAt.getTime())) return "Zuletzt angefragt";
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (requestedAt >= todayStart) return "Heute angefragt";
  if (requestedAt >= yesterdayStart) return "Gestern angefragt";
  return null;
}

function computeWaitlistScore(row: {
  preferred_staff_id: string | null;
  preferred_days: string[] | null;
  time_from: string | null;
  time_to: string | null;
  service_title: string | null;
  priority: string | null;
  short_notice_ok: boolean | null;
  reachable_today: boolean | null;
  requested_recently_at: string | null;
}, selected: Item) {
  let score = 0;
  const wantedStaff = String(row.preferred_staff_id ?? "").trim();
  if (!wantedStaff) score += 1;
  if (wantedStaff && wantedStaff === selected.tenantId) score += 4;

  const apptDay = normalizeDayLabel(["so", "mo", "di", "mi", "do", "fr", "sa"][new Date(selected.start_at).getDay()]);
  const preferredDays = Array.isArray(row.preferred_days) ? row.preferred_days.map(normalizeDayLabel).filter(Boolean) : [];
  if (preferredDays.length === 0) score += 1;
  if (preferredDays.includes(apptDay)) score += 2;

  const start = new Date(selected.start_at);
  const minutes = start.getHours() * 60 + start.getMinutes();
  const timeFrom = String(row.time_from ?? "").trim();
  const timeTo = String(row.time_to ?? "").trim();
  const toMin = (v: string) => { const [h,m] = v.split(':'); return Number(h||0)*60+Number(m||0); };
  if (!timeFrom && !timeTo) score += 1;
  else {
    const afterFrom = !timeFrom || minutes >= toMin(timeFrom);
    const beforeTo = !timeTo || minutes <= toMin(timeTo);
    if (afterFrom && beforeTo) score += 2;
  }

  const rowService = String(row.service_title ?? "").trim().toLowerCase();
  const apptService = String(selected.title ?? "").trim().toLowerCase();
  if (!rowService) score += 1;
  else if (apptService && (apptService.includes(rowService) || rowService.includes(apptService))) score += 2;

  if (row.short_notice_ok) score += 5;
  if (row.reachable_today) score += 4;
  score += recentRequestScore(row.requested_recently_at);
  score += getPrioritySort(row.priority);
  return score;
}

function getCreateForWaitlistHref(selected: Item, row: WaitlistMatchRow) {
  if (!row.customer_profile_id) return "#";
  const start = new Date(selected.start_at);
  const durationMin = Math.max(5, Math.round((new Date(selected.end_at).getTime() - start.getTime()) / 60000) || 60);
  const params = new URLSearchParams({
    title: row.service_title || selected.title || "Termin",
    notes: row.notes || "",
    start: toDatetimeLocalValue(start),
    duration: String(durationMin),
    buffer: "0",
    status: "scheduled",
  });
  return `/customers/${row.customer_profile_id}/appointments/new?${params.toString()}`;
}

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtSentAt(value: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function inferEditableStatus(status: AppointmentStatus | null, startAt: string): AppointmentStatus {
  if (status) return status;
  const d = new Date(startAt);
  if (!Number.isNaN(d.getTime()) && d < new Date()) return "completed";
  return "scheduled";
}

function getFollowUpHref(selected: Item) {
  if (!selected.customerProfileId) return "#";
  const currentStart = new Date(selected.start_at);
  const nextStart = new Date(currentStart.getTime() + 28 * 24 * 60 * 60 * 1000);
  const durationMin = Math.max(5, Math.round((new Date(selected.end_at).getTime() - currentStart.getTime()) / 60000) || 60);
  const params = new URLSearchParams({
    title: selected.title || "Termin",
    notes: selected.note || "",
    start: toDatetimeLocalValue(nextStart),
    duration: String(durationMin),
    buffer: "0",
    status: "scheduled",
  });
  return `/customers/${selected.customerProfileId}/appointments/new?${params.toString()}`;
}

function getWaitlistHref(selected: Item) {
  if (!selected.customerProfileId) return "#";
  return `/customers/${selected.customerProfileId}?tab=waitlist#waitlist`;
}

function statusButtonStyle(status: AppointmentStatus, active: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    height: 42,
    padding: "0 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 800,
    textAlign: "center",
    justifyContent: "center",
    display: "flex",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.12)",
    transition: "all 120ms ease",
  };
  if (status === "scheduled") {
    return { ...base, border: active ? "1px solid rgba(56,189,248,0.45)" : base.border, background: active ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#bae6fd" : "rgba(255,255,255,0.80)", boxShadow: active ? "inset 0 0 0 1px rgba(56,189,248,0.18)" : "none" };
  }
  if (status === "completed") {
    return { ...base, border: active ? "1px solid rgba(34,197,94,0.45)" : base.border, background: active ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#bbf7d0" : "rgba(255,255,255,0.80)", boxShadow: active ? "inset 0 0 0 1px rgba(34,197,94,0.18)" : "none" };
  }
  return { ...base, border: active ? "1px solid rgba(248,113,113,0.45)" : base.border, background: active ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.04)", color: active ? "#fecaca" : "rgba(255,255,255,0.80)", boxShadow: active ? "inset 0 0 0 1px rgba(248,113,113,0.18)" : "none" };
}

function disabledActionButtonStyle(): string {
  return "inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/40 cursor-not-allowed";
}

export default function AppointmentDetailSlideover({
  mounted,
  selected,
  onClose,
}: {
  mounted: boolean;
  selected: SelectedItem | null;
  onClose: () => void;
}) {
  const [returnTo, setReturnTo] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();
  const [currentUserTenantId, setCurrentUserTenantId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [waitlistMatches, setWaitlistMatches] = useState<WaitlistMatchRow[]>([]);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistStatusPendingId, setWaitlistStatusPendingId] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [isCheckoutPending, startCheckoutTransition] = useTransition();
  const [checkoutServices, setCheckoutServices] = useState<CheckoutService[]>([]);
  const [checkoutLines, setCheckoutLines] = useState<CheckoutLine[]>([]);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    salesOrder: null,
    payment: null,
    receipt: null,
  });
  const [paymentMethod, setPaymentMethod] = useState("CASH");
    const [paymentNotes, setPaymentNotes] = useState("");

  const durationDefault = useMemo(() => {
    if (!selected) return 60;
    const s = new Date(selected.start_at).getTime();
    const e = new Date(selected.end_at).getTime();
    const diffMin = Math.round((e - s) / 60000);
    return Number.isFinite(diffMin) && diffMin > 0 ? diffMin : 60;
  }, [selected]);

  const reminderWhatsAppUrl = useMemo(() => {
    if (!selected) return undefined;
    return buildReminderWhatsAppUrl(selected);
  }, [selected]);
  const isReminderSent = !!selected?.reminderSentAt;

  const [titleValue, setTitleValue] = useState("");
  const [startValue, setStartValue] = useState("");
  const [durationValue, setDurationValue] = useState<number>(60);
  const [notesValue, setNotesValue] = useState("");
  const [statusValue, setStatusValue] = useState<AppointmentStatus>("scheduled");

  useEffect(() => {
    if (!selected) return;
    if (typeof window !== "undefined") {
      setReturnTo(window.location.pathname + window.location.search);
    }
    setEditMode(false);
    setStatusError(null);
    setTitleValue(selected.title || "Termin");
    setStartValue(toDatetimeLocalValue(new Date(selected.start_at)));
    setDurationValue(durationDefault);
    setNotesValue(selected.note || "");
    setStatusValue(inferEditableStatus(selected.status, selected.start_at));
    setCheckoutOpen(false);
    setWaitlistOpen(false);
    setCheckoutLoading(false);
    setCheckoutError(null);
    setCheckoutSuccess(null);
    setCheckoutState({ salesOrder: null, payment: null, receipt: null });
    setPaymentMethod("CASH");
    setPaymentNotes("");
  }, [selected, durationDefault]);

  useEffect(() => {
    let alive = true;
    async function loadPermissions() {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        if (!user) {
          setCurrentUserTenantId(null);
          setIsAdmin(false);
          setPermissionsLoaded(true);
          return;
        }
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role, tenant_id, calendar_tenant_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!alive) return;
        const role = String(profile?.role ?? "").toUpperCase();
        const email = String(user.email ?? "").toLowerCase();
        setIsAdmin(role === "ADMIN" || email.includes("radu"));
        setCurrentUserTenantId(profile?.calendar_tenant_id ?? profile?.tenant_id ?? null);
        setPermissionsLoaded(true);
      } catch {
        if (!alive) return;
        setCurrentUserTenantId(null);
        setIsAdmin(false);
        setPermissionsLoaded(true);
      }
    }
    loadPermissions();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadWaitlistMatches() {
      if (!selected?.tenantId) {
        if (!alive) return;
        setWaitlistMatches([]);
        setWaitlistError(null);
        setWaitlistLoading(false);
        return;
      }
      try {
        setWaitlistLoading(true);
        setWaitlistError(null);
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("appointment_waitlist")
          .select(`
            id, customer_profile_id, person_id, service_title, preferred_staff_id, preferred_days, time_from, time_to,
            notes, priority, short_notice_ok, reachable_today, requested_recently_at, status, created_at
          `)
          .eq("tenant_id", selected.tenantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(25);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const profileIds = Array.from(new Set(rows.map((row: any) => String(row.customer_profile_id ?? "").trim()).filter(Boolean)));
        const profilesById = new Map<string, { customer_name: string | null; phone: string | null; email: string | null }>();
        if (profileIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("customer_profiles")
            .select(`id, person:persons ( full_name, phone, email )`)
            .in("id", profileIds);
          if (profileError) throw profileError;
          for (const profile of Array.isArray(profiles) ? profiles : []) {
            const personJoin = Array.isArray((profile as any).person) ? (profile as any).person[0] : (profile as any).person;
            profilesById.set(String((profile as any).id), {
              customer_name: String(personJoin?.full_name ?? "").trim() || null,
              phone: String(personJoin?.phone ?? "").trim() || null,
              email: String(personJoin?.email ?? "").trim() || null,
            });
          }
        }
        const mapped = rows.map((row: any) => {
          const profile = profilesById.get(String(row.customer_profile_id ?? ""));
          const preferredDays = Array.isArray(row.preferred_days) ? row.preferred_days.map((entry: any) => String(entry)).filter(Boolean) : [];
          return {
            id: String(row.id),
            customer_profile_id: String(row.customer_profile_id ?? ""),
            person_id: row.person_id ? String(row.person_id) : null,
            service_title: row.service_title ? String(row.service_title) : null,
            preferred_staff_id: row.preferred_staff_id ? String(row.preferred_staff_id) : null,
            preferred_days: preferredDays,
            time_from: row.time_from ? String(row.time_from) : null,
            time_to: row.time_to ? String(row.time_to) : null,
            notes: row.notes ? String(row.notes) : null,
            priority: row.priority ? String(row.priority) : null,
            short_notice_ok: row.short_notice_ok === true,
            reachable_today: row.reachable_today === true,
            requested_recently_at: row.requested_recently_at ? String(row.requested_recently_at) : null,
            status: row.status ? String(row.status) : null,
            created_at: row.created_at ? String(row.created_at) : null,
            customer_name: profile?.customer_name ?? null,
            phone: profile?.phone ?? null,
            email: profile?.email ?? null,
            score: computeWaitlistScore({
              preferred_staff_id: row.preferred_staff_id ? String(row.preferred_staff_id) : null,
              preferred_days: preferredDays,
              time_from: row.time_from ? String(row.time_from) : null,
              time_to: row.time_to ? String(row.time_to) : null,
              service_title: row.service_title ? String(row.service_title) : null,
              priority: row.priority ? String(row.priority) : null,
              short_notice_ok: row.short_notice_ok === true,
              reachable_today: row.reachable_today === true,
              requested_recently_at: row.requested_recently_at ? String(row.requested_recently_at) : null,
            }, selected),
          } as WaitlistMatchRow;
        }).sort((a, b) => b.score - a.score);
        if (!alive) return;
        setWaitlistMatches(mapped.slice(0, 6));
      } catch (error: any) {
        if (!alive) return;
        setWaitlistMatches([]);
        setWaitlistError(error?.message ?? "Warteliste konnte nicht geladen werden.");
      } finally {
        if (!alive) return;
        setWaitlistLoading(false);
      }
    }
    loadWaitlistMatches();
    return () => { alive = false; };
  }, [selected]);

  const canManageForThisAppointment =
    isAdmin || (!!currentUserTenantId && currentUserTenantId === selected?.tenantId);

  useEffect(() => {
    let alive = true;
    async function loadCheckoutServices() {
      if (!checkoutOpen || !selected?.tenantId || !canManageForThisAppointment) return;
      try {
        setCheckoutLoading(true);
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("services")
          .select("id, name, default_price_cents")
          .eq("tenant_id", selected.tenantId)
          .order("name", { ascending: true });
        if (error) throw error;
        const services = (Array.isArray(data) ? data : []).map((row: any) => ({
          id: String(row.id),
          name: String(row.name ?? "Dienstleistung"),
          defaultPriceCents: Number(row.default_price_cents ?? 0) || 0,
        })) as CheckoutService[];
        if (!alive) return;
        setCheckoutServices(services);

        const preferredServiceId =
          String(selected.serviceId ?? "").trim() ||
          services.find((service) => service.name === String(selected.serviceName ?? selected.title ?? "").trim())?.id ||
          services[0]?.id ||
          "";
        const preferredService = services.find((service) => service.id === preferredServiceId) ?? null;
        const initialPriceCents =
          Number(selected.servicePriceCentsSnapshot ?? 0) > 0
            ? Number(selected.servicePriceCentsSnapshot ?? 0)
            : Number(preferredService?.defaultPriceCents ?? 0);

        setCheckoutLines([
          {
            id: crypto.randomUUID(),
            serviceId: preferredServiceId,
            name: preferredService?.name ?? String(selected.serviceName ?? selected.title ?? "Dienstleistung"),
            quantity: 1,
            taxRate: "0",
            price: centsToMoneyString(initialPriceCents),
          },
        ]);
        setPaymentMethod("CASH");
      } catch (error: any) {
        if (!alive) return;
        setCheckoutError(error?.message ?? "Dienstleistungen konnten nicht geladen werden.");
      } finally {
        if (!alive) return;
        setCheckoutLoading(false);
      }
    }
    loadCheckoutServices();
    return () => { alive = false; };
  }, [checkoutOpen, selected, canManageForThisAppointment]);

  const canOpenCustomerProfile = selected?.canOpenCustomerProfile;
  const canCreateFollowUp = selected?.canCreateFollowUp;
  const canDeleteAppointment = selected?.canDeleteAppointment;
  const canSendReminder = !!selected?.customerPhone && canManageForThisAppointment;
  const canChangeStatus = canManageForThisAppointment;
  const canStartCheckout =
    canManageForThisAppointment &&
    statusValue === "completed" &&
    !!selected?.customerProfileId &&
    !!String(selected?.serviceName ?? selected?.title ?? "").trim();

  const reminderPermissionHint = permissionsLoaded && !canManageForThisAppointment;
  const statusPermissionHint = permissionsLoaded && !canManageForThisAppointment;

  if (!mounted || !selected || typeof document === "undefined") return null;

  const startDate = new Date(selected.start_at);
  const endDate = new Date(selected.end_at);
  const followUpHref = getFollowUpHref(selected);
  const waitlistHref = getWaitlistHref(selected);

  const serviceLabel = String(selected.serviceName ?? selected.title ?? "").trim() || "Termin";
  const servicePriceLabel = formatEuroFromCents(selected.servicePriceCentsSnapshot);
  const serviceDurationLabel =
    Number.isFinite(selected.serviceDurationMinutesSnapshot) && (selected.serviceDurationMinutesSnapshot ?? 0) > 0
      ? `${selected.serviceDurationMinutesSnapshot} Min`
      : `${durationDefault} Min`;
  const serviceBufferLabel =
    Number.isFinite(selected.serviceBufferMinutesSnapshot) && (selected.serviceBufferMinutesSnapshot ?? 0) >= 0
      ? `${selected.serviceBufferMinutesSnapshot} Min`
      : null;

  const checkoutDraftTotalCents = useMemo(() => {
    return checkoutLines.reduce((sum, line) => sum + moneyStringToCents(line.price) * Math.max(1, line.quantity), 0);
  }, [checkoutLines]);

  useEffect(() => {
    if (!checkoutOpen) return;
    setPaymentMethod("CASH");
  }, [checkoutOpen, checkoutDraftTotalCents]);

  const updateLine = (lineId: string, patch: Partial<CheckoutLine>) => {
    setCheckoutLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const addCheckoutLine = () => {
    const fallback = checkoutServices[0];
    setCheckoutLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        serviceId: fallback?.id ?? "",
        name: fallback?.name ?? "",
        quantity: 1,
        taxRate: "0",
        price: centsToMoneyString(fallback?.defaultPriceCents ?? 0),
      },
    ]);
  };

  const removeCheckoutLine = (lineId: string) => {
    setCheckoutLines((current) => current.filter((line) => line.id !== lineId));
  };

  const handleServiceSelect = (lineId: string, serviceId: string) => {
    const service = checkoutServices.find((entry) => entry.id === serviceId);
    updateLine(lineId, {
      serviceId,
      name: service?.name ?? "",
      price: centsToMoneyString(service?.defaultPriceCents ?? 0),
    });
  };

  const openInlineCheckout = () => {
    setCheckoutOpen(true);
    setCheckoutError(null);
    setCheckoutSuccess(null);
  };

  const handleStatusClick = (nextStatus: AppointmentStatus) => {
    if (!selected || !canChangeStatus || isStatusPending || statusValue === nextStatus) return;
    const previousStatus = statusValue;
    setStatusValue(nextStatus);
    setStatusError(null);
    startStatusTransition(async () => {
      const result = await updateAppointmentStatusQuick({
        appointmentId: selected.id,
        status: nextStatus,
      });
      if (!result?.ok) {
        setStatusValue(previousStatus);
        setStatusError(result?.error ?? "Status konnte nicht gespeichert werden.");
      }
    });
  };

  const handleWaitlistStatusChange = async (waitlistId: string, nextStatus: WaitlistStatus) => {
    if (!canManageForThisAppointment || !waitlistId) return;
    setWaitlistStatusPendingId(waitlistId);
    setWaitlistError(null);
    const result = await updateWaitlistStatusQuick({
      waitlistId,
      status: nextStatus,
      tenantId: selected.tenantId,
    });
    if (!result?.ok) {
      setWaitlistError(result?.error ?? "Wartelisten-Status konnte nicht gespeichert werden.");
      setWaitlistStatusPendingId(null);
      return;
    }
    setWaitlistMatches((current) =>
      current
        .map((entry) => (entry.id === waitlistId ? { ...entry, status: nextStatus } : entry))
        .filter((entry) => String(entry.status ?? "active").toLowerCase() === "active")
    );
    setWaitlistStatusPendingId(null);
  };

  const handleCreateSalesOrder = () => {
    if (!selected) return;
    const validLines = checkoutLines
      .map((line) => ({
        serviceId: line.serviceId || null,
        name: String(line.name ?? "").trim(),
        quantity: Math.max(1, Number(line.quantity ?? 1) || 1),
        priceCents: moneyStringToCents(line.price),
        taxRate: Number(String(line.taxRate ?? "0").replace(",", ".")) || 0,
      }))
      .filter((line) => line.name && line.priceCents >= 0);

    if (validLines.length === 0) {
      setCheckoutError("Bitte mindestens eine Dienstleistung erfassen.");
      return;
    }

    const computedTotalCents = validLines.reduce(
      (sum, line) => sum + Math.max(1, Number(line.quantity ?? 1) || 1) * Math.max(0, Number(line.priceCents ?? 0) || 0),
      0
    );

    setCheckoutError(null);
    setCheckoutSuccess(null);

    startCheckoutTransition(async () => {
      const salesOrderFormData = new FormData();
      salesOrderFormData.set("appointment_id", selected.id);
      salesOrderFormData.set("lines_json", JSON.stringify(validLines));

      const salesOrderResult = await createSalesOrderFromAppointmentInline(salesOrderFormData);
      if (!salesOrderResult.ok || !salesOrderResult.salesOrder?.id) {
        setCheckoutError(salesOrderResult.error ?? "Rechnung konnte nicht erstellt werden.");
        return;
      }

      const salesOrder = {
        ...salesOrderResult.salesOrder,
        totalCents: computedTotalCents,
      };

      const paymentFormData = new FormData();
      paymentFormData.set("appointment_id", selected.id);
      paymentFormData.set("sales_order_id", salesOrder.id);
      paymentFormData.set("payment_method", paymentMethod);
      paymentFormData.set("payment_amount", centsToMoneyString(computedTotalCents));
      paymentFormData.set("payment_notes", paymentNotes);

      const paymentResult = await createPaymentForSalesOrderInline(paymentFormData);
      if (!paymentResult.ok) {
        setCheckoutState((current) => ({ ...current, salesOrder, payment: null }));
        setCheckoutError(paymentResult.error ?? "Zahlung konnte nicht erfasst werden.");
        return;
      }

      setCheckoutState((current) => ({
        ...current,
        salesOrder,
        payment: paymentResult.payment ?? null,
      }));
      setCheckoutSuccess("Rechnung und Zahlung erfasst ✅");
    });
  };

  const handleCreateReceipt = () => {
    if (!selected || !checkoutState.salesOrder?.id || !checkoutState.payment?.id) return;
    setCheckoutError(null);
    setCheckoutSuccess(null);

    startCheckoutTransition(async () => {
      const formData = new FormData();
      formData.set("appointment_id", selected.id);
      formData.set("sales_order_id", checkoutState.salesOrder!.id);
      formData.set("payment_id", checkoutState.payment!.id);

      const result = await createFiscalReceiptForPaymentInline(formData);
      if (!result.ok) {
        setCheckoutError(result.error ?? "Fiscal Receipt konnte nicht erstellt werden.");
        return;
      }
      setCheckoutState((current) => ({ ...current, receipt: result.receipt ?? null }));
      setCheckoutSuccess(result.success ?? "Fiscal Receipt erzeugt ✅");
    });
  };

  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, isolation: "isolate" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(648px, calc(100vw - 1rem))", padding: 12, display: "flex" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", height: "100%", backgroundColor: "#0b0b0c", borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 70px rgba(0,0,0,0.62)", display: "flex", flexDirection: "column" }}>
          
<div
            style={{
              padding: 18,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 16,
              alignItems: "start",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>
                Termin Details
              </div>

              <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, lineHeight: 1.02, color: "rgba(255,255,255,0.98)" }}>
                {selected.customerName ?? "Unbekannter Kunde"}
              </div>

              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "5px 10px", fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                  {selected.tenantName}
                </span>
                <span style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "5px 10px", fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
                  {fmtDate(startDate)}
                </span>
                <span style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "5px 10px", fontSize: 12, color: "rgba(255,255,255,0.82)" }}>
                  {fmtTime(startDate)}–{fmtTime(endDate)}
                </span>
              </div>

              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 800,
    textAlign: "center",
    justifyContent: "center",
    display: "flex",
    alignItems: "center", color: "rgba(255,255,255,0.95)" }}>{serviceLabel}</div>
                <span style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
                  Dauer: {serviceDurationLabel}
                </span>
                {serviceBufferLabel ? (
                  <span style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "rgba(255,255,255,0.60)" }}>
                    Buffer: {serviceBufferLabel}
                  </span>
                ) : null}
                {servicePriceLabel ? (
                  <span style={{ border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.12)", color: "#bbf7d0", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                    {servicePriceLabel}
                  </span>
                ) : null}
              </div>

              {!checkoutOpen ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)", marginBottom: 8 }}>Status</div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                    <button type="button" disabled={!canChangeStatus || isStatusPending} onClick={() => handleStatusClick("scheduled")} style={statusButtonStyle("scheduled", statusValue === "scheduled")}>Geplant</button>
                    <button type="button" disabled={!canChangeStatus || isStatusPending} onClick={() => handleStatusClick("completed")} style={statusButtonStyle("completed", statusValue === "completed")}>Gekommen</button>
                    <button type="button" disabled={!canChangeStatus || isStatusPending} onClick={() => handleStatusClick("cancelled")} style={statusButtonStyle("cancelled", statusValue === "cancelled")}>Abgesagt</button>
                    <button type="button" disabled={!canChangeStatus || isStatusPending} onClick={() => handleStatusClick("no_show")} style={statusButtonStyle("no_show", statusValue === "no_show")}>Nicht gekommen</button>
                  </div>
                  {statusError ? <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>{statusError}</div> : null}

                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {canDeleteAppointment ? (
                      <form action={deleteAppointmentFromCalendar.bind(null, selected.id)} onSubmit={(e) => { if (!confirm("Termin wirklich löschen? Das löscht auch den Google-Kalender Eintrag.")) e.preventDefault(); }}>
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button type="submit" className={clientiqueButtonClass("danger")}>Termin löschen</button>
                      </form>
                    ) : <button type="button" disabled className={disabledActionButtonStyle()}>Termin löschen</button>}
                    {canCreateFollowUp ? (
                      selected.customerProfileId ? (
                        <Link href={followUpHref}><button type="button" className={clientiqueButtonClass("dark")}>Folgetermin</button></Link>
                      ) : (
                        <form action={openFollowUpFromAppointment.bind(null, selected.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" className={clientiqueButtonClass("dark")}>Folgetermin</button></form>
                      )
                    ) : <button type="button" disabled className={disabledActionButtonStyle()}>Folgetermin</button>}
                    {canOpenCustomerProfile ? (
                      selected.customerProfileId ? (
                        <Link href={waitlistHref}><button type="button" className={clientiqueButtonClass("accent")}>Zur Warteliste</button></Link>
                      ) : (
                        <form action={openWaitlistFromAppointment.bind(null, selected.id)}><input type="hidden" name="returnTo" value={returnTo} /><button type="submit" className={clientiqueButtonClass("accent")}>Zur Warteliste</button></form>
                      )
                    ) : <button type="button" disabled className={disabledActionButtonStyle()}>Zur Warteliste</button>}
                    {canStartCheckout ? (
                      <button
                        type="button"
                        onClick={openInlineCheckout}
                        className={clientiqueButtonClass("success")}
                      >
                        Abrechnen
                      </button>
                    ) : (
                      <button type="button" disabled className={disabledActionButtonStyle()}>Abrechnen</button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch", width: 188, maxWidth: "100%" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                {!checkoutOpen ? (
                  <button
                    type="button"
                    aria-label={editMode ? "Bearbeiten abbrechen" : "Bearbeiten"}
                    title={editMode ? "Bearbeiten abbrechen" : "Bearbeiten"}
                    className={clientiqueIconButtonClass("dark")}
                    onClick={() => setEditMode((v) => !v)}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 21h6" />
                      <path d="M14.5 4.5l5 5" />
                      <path d="M6 18l11-11a1.414 1.414 0 0 0 0-2l-1-1a1.414 1.414 0 0 0-2 0L3 15v3h3z" />
                    </svg>
                  </button>
                ) : null}
                {!checkoutOpen ? (
                  canOpenCustomerProfile ? (
                    selected.customerProfileId ? (
                      <Link href={`/customers/${selected.customerProfileId}?tab=appointments#appointments`}>
                        <span className={clientiqueIconButtonClass("primary")} title="Zum Kundenprofil" aria-label="Zum Kundenprofil">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 3h8l4 4v14H7z" />
                            <path d="M15 3v5h5" />
                            <circle cx="12" cy="11" r="2.3" />
                            <path d="M9.3 17.2c.8-1.5 2-2.2 2.7-2.2s1.9.7 2.7 2.2" />
                            <path d="M18 18l3 3" />
                            <path d="M18 21l3-3" />
                          </svg>
                        </span>
                      </Link>
                    ) : (
                      <form action={openCustomerProfileFromAppointment.bind(null, selected.id)}>
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button type="submit" className={clientiqueIconButtonClass("primary")} title="Zum Kundenprofil" aria-label="Zum Kundenprofil">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 3h8l4 4v14H7z" />
                            <path d="M15 3v5h5" />
                            <circle cx="12" cy="11" r="2.3" />
                            <path d="M9.3 17.2c.8-1.5 2-2.2 2.7-2.2s1.9.7 2.7 2.2" />
                            <path d="M18 18l3 3" />
                            <path d="M18 21l3-3" />
                          </svg>
                        </button>
                      </form>
                    )
                  ) : (
                    <button type="button" disabled className={clientiqueIconButtonClass("dark")} title="Zum Kundenprofil" aria-label="Zum Kundenprofil" style={{ opacity: 0.45, cursor: "not-allowed" }}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 3h8l4 4v14H7z" />
                        <path d="M15 3v5h5" />
                        <circle cx="12" cy="11" r="2.3" />
                        <path d="M9.3 17.2c.8-1.5 2-2.2 2.7-2.2s1.9.7 2.7 2.2" />
                        <path d="M18 18l3 3" />
                        <path d="M18 21l3-3" />
                      </svg>
                    </button>
                  )
                ) : null}
                {checkoutOpen && checkoutState.receipt ? (
                  <IconButton onClick={() => window.print()} title="Drucken" hoverClassName="hover:bg-emerald-400 hover:text-black">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9V3h12v6" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <path d="M6 14h12v7H6z" />
                      <path d="M6 18h12" />
                    </svg>
                  </IconButton>
                ) : null}
                <IconButton onClick={onClose} title="Schließen" hoverClassName="hover:bg-red-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </IconButton>
              </div>

              {checkoutOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                  <button
                    type="button"
                    disabled={isCheckoutPending || !!checkoutState.payment}
                    onClick={handleCreateSalesOrder}
                    className={clientiqueButtonClass("success") + " disabled:cursor-not-allowed disabled:opacity-60"}
                  >
                    {checkoutState.payment ? "Rechnung bereits erstellt" : "Rechnung erstellen"}
                  </button>
                  <button
                    type="button"
                    disabled={isCheckoutPending || !checkoutState.payment || !!checkoutState.receipt}
                    onClick={handleCreateReceipt}
                    className={clientiqueButtonClass("primary") + " disabled:cursor-not-allowed disabled:opacity-60"}
                  >
                    {checkoutState.receipt ? "Fiskal Beleg bereits erzeugt" : "Fiskal Beleg"}
                  </button>
                  {checkoutState.receipt ? (
                    <>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white">
                        Belegnummer: {checkoutState.receipt.receiptNumber || checkoutState.receipt.id}
                      </div>
                      {checkoutState.salesOrder?.id ? (
                        <Link href={`/rechnungen?${new URLSearchParams({ q: checkoutState.salesOrder.id }).toString()}`}>
                          <button
                            type="button"
                            className={clientiqueButtonClass("dark", true)}
                          >
                            Beleg anzeigen
                          </button>
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="appointment-detail-scroll" style={{ padding: 16, display: "grid", gap: 14, overflow: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {!checkoutOpen ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Schnellaktionen</div>
                      <div className="mt-1 text-xs text-white/50">Kontakt, Reminder und Kundenzugriff kompakt an einem Ort.</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/60">
                      {isReminderSent ? "Reminder gesendet" : "Reminder offen"}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionPill
                      variant="whatsapp"
                      href={selected.customerPhone ? `https://wa.me/${normalizePhoneForWhatsApp(selected.customerPhone)}?text=${encodeURIComponent(buildWhatsAppText(selected))}` : undefined}
                      target="_blank"
                      rel="noreferrer"
                      disabled={!selected.customerPhone}
                    >WhatsApp</ActionPill>
                    <ActionPill href={selected.customerPhone ? `tel:${normalizePhoneForTel(selected.customerPhone)}` : undefined} disabled={!selected.customerPhone}>Anrufen</ActionPill>
                    <ActionPill href={selected.customerEmail ? `mailto:${selected.customerEmail}` : undefined} disabled={!selected.customerEmail}>E-Mail</ActionPill>
                    <ActionPill href={canSendReminder && reminderWhatsAppUrl ? reminderWhatsAppUrl : undefined} target="_blank" rel="noreferrer" disabled={!canSendReminder || !reminderWhatsAppUrl}>
                      {isReminderSent ? "Reminder erneut" : "Reminder senden"}
                    </ActionPill>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Kontakt</div>
                      <div className="mt-2 text-sm font-semibold text-white/85">{selected.customerPhone || "Keine Telefonnummer hinterlegt"}</div>
                      <div className="mt-1 text-xs text-white/50">{selected.customerEmail || "Keine E-Mail hinterlegt"}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Reminder</div>
                      {!isReminderSent ? (
                        <div className="mt-2 text-sm font-semibold text-white/80">Noch nicht gesendet</div>
                      ) : (
                        <>
                          <div className="mt-2 text-sm font-semibold text-emerald-300">Reminder gesendet</div>
                          {selected.reminderSentAt ? <div className="mt-1 text-xs text-white/55">{fmtSentAt(selected.reminderSentAt)}</div> : null}
                        </>
                      )}
                      {reminderPermissionHint ? <div className="mt-2 text-xs text-white/45">Nur zuständiger Behandler oder Admin darf Reminder senden.</div> : null}
                    </div>
                  </div>
                </div>

              </>
            ) : null}

            {editMode && !checkoutOpen ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold text-white/80">Termin bearbeiten</div>
                <form action={updateAppointmentFromCalendar.bind(null, selected.id)} className="mt-3 grid gap-3">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="status" value={statusValue} />
                  <div>
                    <label className="text-xs text-white/80">Titel</label>
                    <input name="title" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15" placeholder="z.B. Fußpflege" />
                  </div>
                  <div>
                    <label className="text-xs text-white/80">Start</label>
                    <input type="datetime-local" name="start" value={startValue} onChange={(e) => setStartValue(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15" style={{ colorScheme: "dark" }} />
                  </div>
                  <div>
                    <label className="text-xs text-white/80">Dauer (Min)</label>
                    <input name="duration" type="number" min={5} step={5} value={durationValue} onChange={(e) => setDurationValue(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/15" />
                  </div>
                  <div>
                    <label className="text-xs text-white/80">Notiz (optional)</label>
                    <textarea name="notes" value={notesValue} onChange={(e) => setNotesValue(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15" placeholder="Interne Notiz" rows={3} />
                  </div>
                  <button type="submit" className={clientiqueButtonClass("success")}>Änderungen speichern</button>
                  <div className="text-xs text-white/50">Speichert in DB und aktualisiert Google Calendar.</div>
                </form>
              </div>
            ) : null}

            {!checkoutOpen ? (
              <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-3">
                <button
                  type="button"
                  onClick={() => setWaitlistOpen((value) => !value)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-fuchsia-100">Passende Warteliste</div>
                    <div className="mt-1 text-xs text-white/55">
                      {waitlistOpen ? "Treffer und Aktionen geöffnet." : "Platzsparend eingeklappt – bei Bedarf öffnen."}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">
                      {waitlistLoading ? "lädt..." : `${waitlistMatches.length} Treffer`}
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-white/80">
                      {waitlistOpen ? "−" : "+"}
                    </span>
                  </div>
                </button>

                {waitlistOpen ? (
                  <>
                    {waitlistError ? <div className="mt-3 text-xs text-red-300">{waitlistError}</div> : null}
                    {waitlistLoading ? (
                      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/60">Warteliste wird geladen...</div>
                    ) : waitlistMatches.length === 0 ? (
                      <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-sm text-white/55">Noch kein passender aktiver Wartelisten-Eintrag für diesen Slot gefunden.</div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {waitlistMatches.map((entry) => {
                          const createHref = getCreateForWaitlistHref(selected, entry);
                          const isPending = waitlistStatusPendingId === entry.id;
                          return (
                            <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-base font-semibold text-white">{entry.customer_name || "Unbekannter Kunde"}</div>
                                  <div className="mt-1 text-sm text-white/70">{entry.service_title || "ohne Behandlungswunsch"}</div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/55">
                                    <span className="rounded-full border border-white/10 px-2 py-1">{formatWaitlistDays(entry.preferred_days)}</span>
                                    <span className="rounded-full border border-white/10 px-2 py-1">{formatOptionalTimeRange(entry.time_from, entry.time_to)}</span>
                                    <span className="rounded-full border border-white/10 px-2 py-1">Priorität: {getPriorityLabel(entry.priority)}</span>
                                    {entry.short_notice_ok ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">Kurzfristig möglich</span> : null}
                                    {entry.reachable_today ? <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-200">Heute erreichbar</span> : null}
                                    {recentRequestLabel(entry.requested_recently_at) ? <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-200">{recentRequestLabel(entry.requested_recently_at)}</span> : null}
                                    <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2 py-1 text-fuchsia-100">Match {entry.score}</span>
                                  </div>
                                  {entry.notes ? <div className="mt-2 text-xs text-white/55">{entry.notes}</div> : null}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <Link href={createHref}><button type="button" className={clientiqueButtonClass("success")}>Termin anlegen</button></Link>
                                  <button type="button" style={clientiqueActionButtonStyle()} disabled={!canManageForThisAppointment || isPending} onClick={() => handleWaitlistStatusChange(entry.id, "contacted")}>Kontaktiert</button>
                                  <button type="button" className={clientiqueButtonClass("accent")} disabled={!canManageForThisAppointment || isPending} onClick={() => handleWaitlistStatusChange(entry.id, "booked")}>Als vergeben</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-white/50">Tipp: Erst Kunden kontaktieren, dann den Ersatztermin direkt aus dem freien Slot anlegen.</div>
                  </>
                ) : null}
              </div>
            ) : null}

            {checkoutOpen ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Checkout Builder</div>
                      <h3 className="mt-1 text-2xl font-black text-white">Abrechnung für {selected.customerName ?? "Kunde"}</h3>
                    </div>
                  </div>

                  {checkoutLoading ? <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">Checkout wird geladen…</div> : null}
                  {checkoutError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{checkoutError}</div> : null}
                  {checkoutSuccess ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{checkoutSuccess}</div> : null}

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                    <div className="space-y-4">
                      {checkoutLines.map((line, index) => (
                        <div key={line.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-0 flex-1">
                              <label className="text-sm font-medium text-white">Bezeichnung</label>
                              <div className="mt-1 flex gap-2">
                                <select
                                  value={line.serviceId}
                                  onChange={(e) => handleServiceSelect(line.id, e.target.value)}
                                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
                                >
                                  <option value="">Bitte Dienstleistung wählen</option>
                                  {checkoutServices.map((service) => (
                                    <option key={service.id} value={service.id}>{service.name}</option>
                                  ))}
                                </select>
                                {index === checkoutLines.length - 1 ? (
                                  <button type="button" onClick={addCheckoutLine} className={clientiqueButtonClass("success")} title="Weitere Leistung hinzufügen">+</button>
                                ) : null}
                                {checkoutLines.length > 1 ? (
                                  <button type="button" onClick={() => removeCheckoutLine(line.id)} className={clientiqueButtonClass("dark")}>Entfernen</button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-[120px_120px_180px]">
                            <div>
                              <label className="text-sm font-medium text-white">Menge</label>
                              <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Math.max(1, Number(e.target.value || 1)) })} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-white">Steuer %</label>
                              <input value={line.taxRate} onChange={(e) => updateLine(line.id, { taxRate: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-white">Preis brutto (€)</label>
                              <input value={line.price} onChange={(e) => updateLine(line.id, { price: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none" />
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-white">Zahlungsart</label>
                          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none">
                            <option value="CASH">Bar</option>
                            <option value="CARD">Karte</option>
                            <option value="TRANSFER">Überweisung</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-white">Interne Notiz</label>
                          <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="z. B. komplett kassiert an der Rezeption" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/35" />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <div>
                          <div className="text-sm text-white/65">{checkoutState.salesOrder ? "Rechnungssumme" : "Aktuelle Entwurfssumme"}</div>
                          {checkoutState.payment ? <div className="mt-1 text-xs text-emerald-200">Rechnung und Zahlung bereits erfasst</div> : null}
                        </div>
                        <div className="text-2xl font-black text-white">
                          {checkoutState.salesOrder
                            ? formatEuroFromGrossCents(checkoutState.salesOrder.totalCents, "EUR")
                            : formatEuroFromGrossCents(checkoutDraftTotalCents, "EUR")}
                        </div>
                      </div>
                    </div>
                  </div>

                               </div>
              </div>
            ) : null}
          </div>

          <style jsx>{`
            .appointment-detail-scroll::-webkit-scrollbar {
              display: none;
            }
          `}</style>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

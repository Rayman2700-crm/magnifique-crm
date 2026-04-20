"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { createAppointmentQuick } from "@/app/calendar/actions";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RADU_USER_EMAIL = "radu.craus@gmail.com";

type SelectOption = { value: string; label: string; description?: string };

type TenantOption = { id: string; display_name: string | null };
type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

type UserProfileAvatarRow = {
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  avatar_path: string | null;
  avatar_ring_color: string | null;
};

type CustomerPickerRow = {
  id: string;
  tenant_id: string;
  person_id: string | null;
  created_at: string | null;
  person:
    | {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
      }
    | null;
};

function menuIconButtonClass(active = false, danger = false) {
  if (danger) {
    return "inline-flex h-12 min-w-[56px] items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600/90 hover:text-white";
  }

  return `inline-flex h-12 min-w-[56px] items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.10]`;
}


function resolveAvatarUrl(avatarPath: string | null | undefined, userId: string) {
  const raw = String(avatarPath ?? "").trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
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
      if (parent) parent.dataset.avatarBroken = "1";
      return;
    }
    event.currentTarget.src = fallback;
  };
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function readCurrentUserEmailFromDom() {
  if (typeof document === "undefined") return "";

  const bodyEmail = document.body?.getAttribute("data-user-email");
  if (bodyEmail) return normalizeText(bodyEmail);

  const htmlEmail = document.documentElement?.getAttribute("data-user-email");
  if (htmlEmail) return normalizeText(htmlEmail);

  const metaEmail = document.querySelector('meta[name="current-user-email"]')?.getAttribute("content");
  if (metaEmail) return normalizeText(metaEmail);

  return "";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function parseDatetimeLocal(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if ([year, month, day, hour, minute].some((x) => Number.isNaN(x))) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateTimeLabel(value: string) {
  const parsed = parseDatetimeLocal(value);
  if (!parsed) return "Start wählen";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(date);
}

function roundUpToNextMinutes(d: Date, stepMin: number) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  const next = Math.ceil(m / stepMin) * stepMin;
  if (next === m) return x;
  x.setMinutes(next);
  return x;
}

function formatPrice(cents: number | null | undefined) {
  if (typeof cents !== "number" || Number.isNaN(cents)) return null;
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function getStudioWriteTargetLabel(value: string, canUseStudioRadu: boolean) {
  if (value === "studio_radu" && canUseStudioRadu) return "Studio Radu";
  if (value === "studio_raluca") return "Studio Magnifique Beauty Institut";
  return canUseStudioRadu
    ? "Automatisch (Behandler-Standard)"
    : "Automatisch (Studio Magnifique Beauty Institut)";
}

function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useAnchoredFloatingPanel(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  preferredWidth: number,
  preferredHeight: number
) {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, preferredWidth), viewportWidth - 24);
    const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpwards = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(220, Math.min(preferredHeight, openUpwards ? spaceAbove : spaceBelow));

    setStyle({
      position: "fixed",
      left,
      width,
      maxHeight,
      zIndex: 1600,
      top: openUpwards ? undefined : rect.bottom + 8,
      bottom: openUpwards ? viewportHeight - rect.top + 8 : undefined,
    });
  }, [preferredHeight, preferredWidth, triggerRef]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [open, updatePosition]);

  return { style, updatePosition };
}

function FancySelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  startAdornment,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  startAdornment?: React.ReactNode;
}) {
  const mounted = useIsMounted();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const { style: menuStyle, updatePosition } = useAnchoredFloatingPanel(open, triggerRef, 260, 320);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const buttonLabel = selectedOption?.label ?? placeholder ?? "Bitte wählen…";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className="mt-1 flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-white outline-none transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-3 pr-3">
          {startAdornment ? <span className="shrink-0">{startAdornment}</span> : null}
          <span className={`truncate ${selectedOption ? "text-white" : "text-white/40"}`}>{buttonLabel}</span>
        </span>
        <span className={`text-white/55 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {mounted && open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                ...menuStyle,
                overflowY: "auto",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(180deg, rgba(20,20,20,0.98) 0%, rgba(8,8,8,0.98) 100%)",
                boxShadow: "0 18px 50px rgba(0,0,0,0.48)",
                backdropFilter: "blur(12px)",
                padding: 6,
              }}
            >
              <div className="space-y-1">
                {options.map((option) => {
                  const active = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-white/8"
                      style={{
                        background: active ? "rgba(255,255,255,0.10)" : "transparent",
                        color: "rgba(255,255,255,0.96)",
                      }}
                    >
                      <span className="min-w-0 pr-3">
                        <span className="block leading-5">{option.label}</span>
                        {option.description ? (
                          <span className="mt-0.5 block text-xs text-white/50">{option.description}</span>
                        ) : null}
                      </span>
                      <span className="pt-0.5 text-white/75">{active ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function CustomerPicker({
  tenantId,
  value,
  onSelect,
  selectedProfileId,
  disabled = false,
}: {
  tenantId: string;
  value: string;
  onSelect: (row: CustomerPickerRow) => void;
  selectedProfileId?: string | null;
  disabled?: boolean;
}) {
  const mounted = useIsMounted();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CustomerPickerRow[]>([]);
  const { style: panelStyle, updatePosition } = useAnchoredFloatingPanel(open, triggerRef, 340, 360);

  useEffect(() => {
    if (!open || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const { data, error } = await supabaseBrowser()
        .from("customer_profiles")
        .select(
          `
            id,
            tenant_id,
            person_id,
            created_at,
            person:persons (
              id,
              full_name,
              phone,
              email
            )
          `
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        const normalizedRows: CustomerPickerRow[] = ((data ?? []) as any[])
          .map((row) => {
            const personRaw = Array.isArray(row?.person) ? row.person[0] ?? null : row?.person ?? null;
            return {
              id: String(row?.id ?? ""),
              tenant_id: String(row?.tenant_id ?? tenantId),
              person_id: row?.person_id ? String(row.person_id) : null,
              created_at: row?.created_at ? String(row.created_at) : null,
              person: personRaw
                ? {
                    id: String(personRaw?.id ?? ""),
                    full_name: personRaw?.full_name ?? null,
                    phone: personRaw?.phone ?? null,
                    email: personRaw?.email ?? null,
                  }
                : null,
            } satisfies CustomerPickerRow;
          })
          .filter((row) => row.person?.full_name || row.person?.phone || row.person?.email);
        setRows(normalizedRows);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = String(row.person?.full_name ?? "").toLowerCase();
      const phone = String(row.person?.phone ?? "").toLowerCase();
      const email = String(row.person?.email ?? "").toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q);
    });
  }, [query, rows]);

  const selected = rows.find((row) => row.id === selectedProfileId) ?? null;
  const buttonLabel = selected?.person?.full_name || value || "Kunde auswählen";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || !tenantId}
        onClick={() => {
          if (disabled || !tenantId) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className="mt-1 flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-white outline-none transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-3 pr-3">
          <span className="text-white/65">⌕</span>
          <span className={`truncate ${selected || value ? "text-white" : "text-white/40"}`}>{buttonLabel}</span>
        </span>
        <span className={`text-white/55 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {mounted && open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                ...panelStyle,
                overflow: "hidden",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(180deg, rgba(20,20,20,0.98) 0%, rgba(8,8,8,0.98) 100%)",
                boxShadow: "0 18px 50px rgba(0,0,0,0.48)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="border-b border-white/8 p-3">
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, Telefon oder E-Mail suchen…"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/20"
                />
              </div>

              <div className="max-h-[320px] overflow-y-auto p-2">
                {loading ? (
                  <div className="px-3 py-8 text-center text-sm text-white/55">Kunden werden geladen…</div>
                ) : filteredRows.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-white/55">Keine Kunden für diesen Behandler gefunden.</div>
                ) : (
                  <div className="space-y-1">
                    {filteredRows.map((row) => {
                      const active = row.id === selectedProfileId;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            onSelect(row);
                            setOpen(false);
                            setQuery("");
                          }}
                          className="flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-white/8"
                          style={{
                            background: active ? "rgba(255,255,255,0.10)" : "transparent",
                            color: "rgba(255,255,255,0.96)",
                          }}
                        >
                          <span className="min-w-0 pr-3">
                            <span className="block truncate leading-5">{row.person?.full_name || "Unbekannter Kunde"}</span>
                            <span className="mt-0.5 block text-xs text-white/50">
                              {[row.person?.phone, row.person?.email].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}
                            </span>
                          </span>
                          <span className="pt-0.5 text-white/75">{active ? "✓" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function BeautifulDateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const mounted = useIsMounted();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const baseDate = parseDatetimeLocal(value) ?? roundUpToNextMinutes(new Date(), 15);
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
  const { style: panelStyle, updatePosition } = useAnchoredFloatingPanel(open, triggerRef, 320, 360);

  useEffect(() => {
    const parsed = parseDatetimeLocal(value);
    if (!parsed) return;
    setVisibleMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedDate = parseDatetimeLocal(value) ?? baseDate;
  const selectedHour = selectedDate.getHours();
  const selectedMinute = selectedDate.getMinutes();

  const monthGrid = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startWeekday);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const applyDate = (datePart: Date, overrides?: { hour?: number; minute?: number }) => {
    const hour = overrides?.hour ?? selectedHour;
    const minute = overrides?.minute ?? selectedMinute;
    const next = new Date(
      datePart.getFullYear(),
      datePart.getMonth(),
      datePart.getDate(),
      hour,
      minute,
      0,
      0
    );
    onChange(toDatetimeLocalValue(next));
  };

  const hourOptions = Array.from({ length: 24 }, (_, index) => index);
  const minuteOptions = [0, 15, 30, 45];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className="mt-1 flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-white outline-none transition hover:border-white/20"
      >
        <span className="truncate pr-3">{formatDateTimeLabel(value)}</span>
        <span className={`text-white/55 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      <input type="hidden" name="start" value={value} />

      {mounted && open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              style={{
                ...panelStyle,
                overflow: "hidden",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(180deg, rgba(27,27,27,0.98) 0%, rgba(14,14,14,0.98) 100%)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.52)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-white/80 transition hover:bg-white/8"
                >
                  ←
                </button>
                <div className="text-sm font-semibold capitalize text-white/95">{formatMonthYear(visibleMonth)}</div>
                <button
                  type="button"
                  onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-white/80 transition hover:bg-white/8"
                >
                  →
                </button>
              </div>

              <div className="grid grid-cols-[1fr_76px_76px] gap-0">
                <div className="border-r border-white/8 p-4">
                  <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((label) => (
                      <div key={label}>{label}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthGrid.map((day) => {
                      const sameMonth = day.getMonth() === visibleMonth.getMonth();
                      const selected =
                        day.getFullYear() === selectedDate.getFullYear() &&
                        day.getMonth() === selectedDate.getMonth() &&
                        day.getDate() === selectedDate.getDate();
                      const isToday = (() => {
                        const now = new Date();
                        return (
                          day.getFullYear() === now.getFullYear() &&
                          day.getMonth() === now.getMonth() &&
                          day.getDate() === now.getDate()
                        );
                      })();

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => applyDate(day)}
                          className="flex h-9 items-center justify-center rounded-xl text-sm transition"
                          style={{
                            color: selected
                              ? "#101010"
                              : sameMonth
                              ? "rgba(255,255,255,0.94)"
                              : "rgba(255,255,255,0.28)",
                            background: selected
                              ? "linear-gradient(180deg, rgba(238,223,196,1) 0%, rgba(214,196,166,1) 100%)"
                              : isToday
                              ? "rgba(255,255,255,0.08)"
                              : "transparent",
                            boxShadow: selected ? "0 8px 20px rgba(214,196,166,0.24)" : "none",
                          }}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-h-[280px] overflow-y-auto p-2">
                  <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Std</div>
                  <div className="space-y-1">
                    {hourOptions.map((hour) => {
                      const active = hour === selectedHour;
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => applyDate(selectedDate, { hour })}
                          className="flex w-full items-center justify-center rounded-xl px-2 py-2 text-sm transition"
                          style={{
                            background: active ? "rgba(214,196,166,0.22)" : "transparent",
                            color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.72)",
                          }}
                        >
                          {pad2(hour)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-h-[280px] overflow-y-auto border-l border-white/8 p-2">
                  <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Min</div>
                  <div className="space-y-1">
                    {minuteOptions.map((minute) => {
                      const active = minute === selectedMinute;
                      return (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => applyDate(selectedDate, { minute })}
                          className="flex w-full items-center justify-center rounded-xl px-2 py-2 text-sm transition"
                          style={{
                            background: active ? "rgba(214,196,166,0.22)" : "transparent",
                            color: active ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.72)",
                          }}
                        >
                          {pad2(minute)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 text-xs text-white/55">
                <button
                  type="button"
                  onClick={() => {
                    const now = roundUpToNextMinutes(new Date(), 15);
                    onChange(toDatetimeLocalValue(now));
                    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  }}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-white/75 transition hover:bg-white/8"
                >
                  Jetzt
                </button>
                <div>{formatDateTimeLabel(value)}</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-white/75 transition hover:bg-white/8"
                >
                  Fertig
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export default function CreateAppointmentSlideover({
  mounted,
  createVisible,
  createShown,
  onClose,
  tenants,
  services,
  creatorTenantId,
  defaultWeekISO,
  customerProfileId,
  initialWalkInName,
  initialWalkInPhone,
  forceTenantId,
  hideTenantSelect = false,
  tenantLabel,
  currentUserEmail,
}: {
  mounted: boolean;
  createVisible: boolean;
  createShown: boolean;
  onClose: () => void;
  tenants: TenantOption[];
  services: ServiceOption[];
  creatorTenantId: string | null;
  defaultWeekISO?: string;
  customerProfileId?: string | null;
  initialWalkInName?: string;
  initialWalkInPhone?: string;
  forceTenantId?: string | null;
  hideTenantSelect?: boolean;
  tenantLabel?: string;
  currentUserEmail?: string | null;
}) {
  const sortedTenants = useMemo(() => {
    const copy = [...(tenants ?? [])];
    copy.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "de"));
    return copy;
  }, [tenants]);

  const [selectedTenantId, setSelectedTenantId] = useState<string>(forceTenantId ?? creatorTenantId ?? "");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [startValue, setStartValue] = useState<string>("");
  const [walkInName, setWalkInName] = useState(initialWalkInName ?? "");
  const [walkInPhone, setWalkInPhone] = useState(initialWalkInPhone ?? "");
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState(customerProfileId ?? "");
  const [manualServiceName, setManualServiceName] = useState("");
  const [manualDurationMinutes, setManualDurationMinutes] = useState("60");
  const [manualBufferMinutes, setManualBufferMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [manualServiceOpen, setManualServiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [studioWriteTarget, setStudioWriteTarget] = useState<string>("auto");
  const [returnTo, setReturnTo] = useState<string>("");
  const [practitionerProfile, setPractitionerProfile] = useState<UserProfileAvatarRow | null>(null);
  const [resolvedCurrentUserEmail, setResolvedCurrentUserEmail] = useState<string>(normalizeText(currentUserEmail));

  const creatorTenant = useMemo(
    () => sortedTenants.find((tenant) => tenant.id === creatorTenantId) ?? null,
    [sortedTenants, creatorTenantId]
  );

  const selectedTenant = useMemo(
    () => sortedTenants.find((tenant) => tenant.id === selectedTenantId) ?? null,
    [sortedTenants, selectedTenantId]
  );

  const selectedTenantAvatarUrl = useMemo(() => {
    if (!selectedTenantId || !practitionerProfile?.user_id) return null;
    return resolveAvatarUrl(practitionerProfile.avatar_path, practitionerProfile.user_id);
  }, [practitionerProfile?.avatar_path, practitionerProfile?.user_id, selectedTenantId]);

  const selectedTenantRingColor = useMemo(() => {
    const raw = String(practitionerProfile?.avatar_ring_color ?? "").trim();
    return raw || "rgba(214,196,166,0.95)";
  }, [practitionerProfile?.avatar_ring_color]);

  const tenantFieldAvatar = selectedTenantId && practitionerProfile?.user_id ? (
    <div
      className="relative h-7 w-7 overflow-hidden rounded-full border bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_18px_rgba(0,0,0,0.22)]"
      style={{ borderColor: selectedTenantRingColor }}
      title={tenantLabel || selectedTenant?.display_name || "Behandler"}
    >
      {selectedTenantAvatarUrl ? (
        <img
          src={selectedTenantAvatarUrl}
          alt={tenantLabel || selectedTenant?.display_name || "Behandler"}
          className="h-full w-full object-cover"
          onError={avatarFallbackHandler(practitionerProfile.user_id)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-white/88">
          {String(tenantLabel || selectedTenant?.display_name || "Behandler").trim().slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${selectedTenantRingColor}` }} />
    </div>
  ) : null;

  useEffect(() => {
    const normalizedPropEmail = normalizeText(currentUserEmail);
    if (normalizedPropEmail) {
      setResolvedCurrentUserEmail(normalizedPropEmail);
      return;
    }

    const domUserEmail = readCurrentUserEmailFromDom();
    if (domUserEmail) {
      setResolvedCurrentUserEmail(domUserEmail);
      return;
    }

    let cancelled = false;

    const loadCurrentUserEmail = async () => {
      const { data } = await supabaseBrowser().auth.getUser();
      if (cancelled) return;
      setResolvedCurrentUserEmail(normalizeText(data.user?.email));
    };

    void loadCurrentUserEmail();

    return () => {
      cancelled = true;
    };
  }, [currentUserEmail]);

  const canUseStudioRadu = useMemo(() => {
    if (resolvedCurrentUserEmail) return resolvedCurrentUserEmail === RADU_USER_EMAIL;

    const creatorDisplayName = normalizeText(creatorTenant?.display_name);
    const effectiveLabel = normalizeText(tenantLabel);

    return creatorDisplayName.includes("radu") || effectiveLabel.includes("radu");
  }, [creatorTenant?.display_name, resolvedCurrentUserEmail, tenantLabel]);

  useEffect(() => {
    let cancelled = false;

    const loadPractitionerProfile = async () => {
      if (!selectedTenantId) {
        if (!cancelled) setPractitionerProfile(null);
        return;
      }

      const { data, error } = await supabaseBrowser()
        .from("user_profiles")
        .select("user_id, tenant_id, full_name, avatar_path, avatar_ring_color")
        .eq("tenant_id", selectedTenantId)
        .eq("is_active", true);

      if (cancelled) return;
      if (error) {
        setPractitionerProfile(null);
        return;
      }

      const rows = (data ?? []) as UserProfileAvatarRow[];
      const targetLabel = normalizeText(selectedTenant?.display_name);
      const exactNameMatch =
        rows.find((row) => normalizeText(row.full_name) === targetLabel) ??
        rows.find((row) => targetLabel && normalizeText(row.full_name).includes(targetLabel)) ??
        rows[0] ??
        null;

      setPractitionerProfile(exactNameMatch);
    };

    void loadPractitionerProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedTenant?.display_name, selectedTenantId]);


  const tenantServices = useMemo(() => {
    return (services ?? [])
      .filter((service) => service.tenant_id === selectedTenantId && service.is_active !== false)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [services, selectedTenantId]);

  const selectedService = useMemo(
    () => tenantServices.find((service) => service.id === selectedServiceId) ?? null,
    [tenantServices, selectedServiceId]
  );

  useEffect(() => {
    if (!createVisible) return;

    const next = roundUpToNextMinutes(new Date(), 15);
    setStartValue(toDatetimeLocalValue(next));
    setWalkInName(initialWalkInName ?? "");
    setWalkInPhone(initialWalkInPhone ?? "");
    setSelectedCustomerProfileId(customerProfileId ?? "");
    setNotes("");
    setStudioWriteTarget("auto");
    setSelectedTenantId(forceTenantId ?? creatorTenantId ?? "");
    setSelectedServiceId("");
    setManualServiceName("");
    setManualDurationMinutes("60");
    setManualBufferMinutes("0");

    if (typeof window !== "undefined") {
      setReturnTo(window.location.pathname + window.location.search);
    }
  }, [createVisible, creatorTenantId, customerProfileId, forceTenantId, initialWalkInName, initialWalkInPhone]);

  useEffect(() => {
    if (!forceTenantId && !creatorTenantId) return;
    setSelectedTenantId(forceTenantId ?? creatorTenantId ?? "");
  }, [creatorTenantId, forceTenantId]);

  useEffect(() => {
    if (!selectedTenantId) {
      setSelectedServiceId("");
      return;
    }

    setSelectedServiceId((current) => {
      if (current && tenantServices.some((service) => service.id === current)) return current;
      return tenantServices[0]?.id ?? "";
    });
  }, [selectedTenantId, tenantServices]);

  const previousTenantIdRef = useRef<string>("");

  useEffect(() => {
    if (!selectedTenantId) {
      previousTenantIdRef.current = selectedTenantId;
      return;
    }
    if (!previousTenantIdRef.current) {
      previousTenantIdRef.current = selectedTenantId;
      return;
    }
    if (previousTenantIdRef.current === selectedTenantId) return;
    previousTenantIdRef.current = selectedTenantId;
    setSelectedCustomerProfileId("");
    setWalkInName("");
    setWalkInPhone("");
  }, [selectedTenantId]);

  useEffect(() => {
    if (studioWriteTarget !== "studio_radu") return;
    if (canUseStudioRadu) return;
    setStudioWriteTarget("auto");
  }, [canUseStudioRadu, studioWriteTarget]);

  useEffect(() => {
    if (!createVisible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createVisible, onClose]);

  if (!mounted || !createVisible || typeof document === "undefined") return null;

  const isManualService = !selectedService && manualServiceName.trim().length > 0;
  const titleValue = selectedService?.name ?? manualServiceName.trim() ?? "";
  const durationValue = selectedService?.duration_minutes ?? Math.max(0, Number.parseInt(manualDurationMinutes || "0", 10) || 0);
  const bufferValue = selectedService?.buffer_minutes ?? Math.max(0, Number.parseInt(manualBufferMinutes || "0", 10) || 0);
  const priceLabel = formatPrice(selectedService?.default_price_cents ?? null);
  const effectiveTenantLabel = tenantLabel || selectedTenant?.display_name || "Behandler";
  const summaryCustomerLabel = walkInName.trim() || "Kein Kunde";
  const summaryServiceLabel = titleValue || "Keine Dienstleistung";
  const summaryNoteLabel = notes.trim() || "Keine Notiz";
  const summaryDateTimeLabel = startValue ? formatDateTimeLabel(startValue) : "Start wählen";
  const canSubmit = Boolean(selectedTenantId && titleValue.trim() && startValue.trim());

  const studioCalendarOptions: SelectOption[] = [
    {
      value: "auto",
      label: canUseStudioRadu
        ? "Automatisch (Behandler-Standard)"
        : "Automatisch (Studio Magnifique Beauty Institut)",
    },
    ...(canUseStudioRadu ? [{ value: "studio_radu", label: "Studio Radu" }] : []),
    { value: "studio_raluca", label: "Studio Magnifique Beauty Institut" },
  ];

  const tenantOptions: SelectOption[] = sortedTenants.map((tenant) => ({
    value: tenant.id,
    label: tenant.display_name ?? "Behandler",
  }));

  const serviceOptions: SelectOption[] = tenantServices.map((service) => ({
    value: service.id,
    label: service.name,
    description: [
      typeof service.duration_minutes === "number" ? `${service.duration_minutes} Min` : null,
      typeof service.buffer_minutes === "number" ? `Buffer ${service.buffer_minutes} Min` : null,
      formatPrice(service.default_price_cents),
    ]
      .filter(Boolean)
      .join(" · "),
  }));


  const content = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate" }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: createShown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: createShown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.92) 0%, rgba(10,10,10,0.92) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: createShown ? "translateX(0)" : "translateX(18px)",
          opacity: createShown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Kalender</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
                Neuer Termin
              </div>
            </div>

            <div className="flex items-center gap-3 self-start">
              {selectedTenantId && practitionerProfile?.user_id ? (
                <div
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_10px_24px_rgba(0,0,0,0.28)]"
                  style={{ borderColor: selectedTenantRingColor }}
                  title={tenantLabel || selectedTenant?.display_name || "Behandler"}
                >
                  {selectedTenantAvatarUrl ? (
                    <img
                      src={selectedTenantAvatarUrl}
                      alt={tenantLabel || selectedTenant?.display_name || "Behandler"}
                      className="h-full w-full object-cover"
                      onError={avatarFallbackHandler(practitionerProfile.user_id)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white/88">
                      {String(tenantLabel || selectedTenant?.display_name || "Behandler").trim().slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${selectedTenantRingColor}` }} />
                </div>
              ) : null}

              <button
                type="submit"
                form="create-appointment-form"
                className={canSubmit
                  ? "inline-flex h-12 min-w-[56px] items-center justify-center rounded-[16px] border border-emerald-500/30 bg-emerald-600/70 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                  : "inline-flex h-12 min-w-[56px] items-center justify-center rounded-[16px] border border-white/12 bg-white/[0.04] px-4 text-sm font-semibold text-white/45 transition-colors cursor-not-allowed opacity-100"}
                aria-label="Termin erstellen"
                title={canSubmit ? "Termin erstellen" : "Pflichtfelder fehlen noch"}
                disabled={!canSubmit}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              <button type="button" onClick={onClose} className={menuIconButtonClass(false, true)} aria-label="Schließen" title="Schließen">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-4 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-3">
                <div className="text-white/45">Dienstleistung</div>
                <div className="mt-0.5 break-words font-medium text-white/92">{summaryServiceLabel}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-white/45">Kunde</div>
                <div className="mt-0.5 break-words font-medium text-white/92">{summaryCustomerLabel}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-white/45">Start</div>
                <div className="mt-0.5 break-words font-medium text-white/92">{summaryDateTimeLabel}</div>
              </div>
              <div>
                <div className="text-white/45">Dauer</div>
                <div className="mt-0.5 font-medium text-white/92">{durationValue} Min</div>
              </div>
              <div>
                <div className="text-white/45">Buffer</div>
                <div className="mt-0.5 font-medium text-white/92">{bufferValue} Min</div>
              </div>
              <div>
                <div className="text-white/45">Preis</div>
                <div className="mt-0.5 break-words font-medium text-white/92">{priceLabel ?? "—"}</div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-white/45">Notiz</div>
                <div className="mt-0.5 break-words font-medium text-white/78">{summaryNoteLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 16,
            overflow: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className="[&::-webkit-scrollbar]:hidden"
        >
          <form id="create-appointment-form" action={createAppointmentQuick} className="space-y-4">
            <input type="hidden" name="customerProfileId" value={selectedCustomerProfileId} />

            {hideTenantSelect ? (
              <div>
                <label className="text-white text-sm">Behandler</label>
                <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/90">
                  {tenantFieldAvatar}
                  <span className="truncate">{effectiveTenantLabel}</span>
                </div>
                <input type="hidden" name="tenantId" value={selectedTenantId} />
              </div>
            ) : (
              <div>
                <label className="text-white text-sm">Behandler</label>
                <FancySelect
                  value={selectedTenantId}
                  onChange={setSelectedTenantId}
                  options={tenantOptions}
                  placeholder="Bitte wählen…"
                  startAdornment={tenantFieldAvatar}
                />
                <input type="hidden" name="tenantId" value={selectedTenantId} />
              </div>
            )}

            <input type="hidden" name="creatorTenantId" value={creatorTenantId ?? ""} />
            <input type="hidden" name="week" value={defaultWeekISO ?? ""} />
            <input type="hidden" name="tenant" value="" />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div>
              <label className="text-white text-sm">Studio-Kalender</label>
              <FancySelect value={studioWriteTarget} onChange={setStudioWriteTarget} options={studioCalendarOptions} />
              <input type="hidden" name="studioWriteTarget" value={studioWriteTarget} />
            </div>

            <div>
              <label className="text-white text-sm">Dienstleistung</label>
              <FancySelect
                value={selectedServiceId}
                onChange={(nextValue) => {
                  setSelectedServiceId(nextValue);
                  if (nextValue) {
                    setManualServiceName("");
                  }
                }}
                options={serviceOptions}
                placeholder={selectedTenantId ? "Dienstleistung wählen…" : "Bitte zuerst Behandler wählen…"}
                disabled={!selectedTenantId || serviceOptions.length === 0}
              />
              <input type="hidden" name="serviceId" value={selectedServiceId} />
              <input type="hidden" name="title" value={titleValue} />
              <input type="hidden" name="duration" value={durationValue} />
              <input type="hidden" name="buffer" value={bufferValue} />

              {selectedService ? (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
                  <div className="font-medium text-white">{selectedService.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/65">
                    <span>Dauer: {durationValue} Min</span>
                    <span>Buffer: {bufferValue} Min</span>
                    {priceLabel ? <span>Preis: {priceLabel}</span> : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setManualServiceOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-3 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">Dienstleistung frei eingeben</div>
                    <div className="mt-0.5 truncate text-xs text-white/50">
                      {manualServiceName.trim() || "z. B. Beratung oder Nachkontrolle"}
                    </div>
                  </div>
                  <span className="text-white/55">{manualServiceOpen ? "Einklappen" : "Aufklappen"}</span>
                </button>

                {manualServiceOpen ? (
                  <div className="border-t border-white/10 px-3 py-3">
                    <input
                      value={manualServiceName}
                      onChange={(e) => {
                        setManualServiceName(e.target.value);
                        if (selectedServiceId) setSelectedServiceId("");
                      }}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                      placeholder="z.B. Beratung"
                    />
                    <div className="mt-2 text-xs text-white/50">
                      Falls die Dienstleistung nicht in der Liste ist, kannst du sie hier frei eingeben. Dauer und Buffer änderst du darunter.
                    </div>
                  </div>
                ) : null}
              </div>

              {!selectedService && serviceOptions.length === 0 ? (
                <div className="mt-2 text-xs text-white/50">
                  Für diesen Behandler sind noch keine aktiven Dienstleistungen hinterlegt.
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-white text-sm">Kunde auswählen (optional)</label>
                <CustomerPicker
                  tenantId={selectedTenantId}
                  value={walkInName}
                  selectedProfileId={selectedCustomerProfileId}
                  onSelect={(row) => {
                    setSelectedCustomerProfileId(row.id);
                    setWalkInName(row.person?.full_name ?? "");
                    setWalkInPhone(row.person?.phone ?? "");
                  }}
                  disabled={!selectedTenantId}
                />
                <div className="mt-2 text-xs text-white/50">
                  Bereits vorhandene Kunden dieses Behandlers kannst du hier direkt übernehmen oder unten frei eingeben.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white text-sm">Kunde (Name)</label>
                  <input
                    name="walkInName"
                    value={walkInName}
                    onChange={(e) => {
                      setWalkInName(e.target.value);
                      if (selectedCustomerProfileId) setSelectedCustomerProfileId("");
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                    placeholder="z.B. Maria Muster"
                  />
                </div>
                <div>
                  <label className="text-white text-sm">Telefon</label>
                  <input
                    name="walkInPhone"
                    value={walkInPhone}
                    onChange={(e) => {
                      setWalkInPhone(e.target.value);
                      if (selectedCustomerProfileId) setSelectedCustomerProfileId("");
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                    placeholder="z.B. +43 660 1234567"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setNotesOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-3 text-left transition hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">Interne Notiz</div>
                  <div className="mt-0.5 truncate text-xs text-white/50">{notes.trim() || "Optionaler Hinweis zum Termin"}</div>
                </div>
                <span className="text-white/55">{notesOpen ? "Einklappen" : "Aufklappen"}</span>
              </button>

              {notesOpen ? (
                <div className="border-t border-white/10 px-3 py-3">
                  <textarea
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[104px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-white/15"
                    placeholder="Interne Notiz"
                  />
                </div>
              ) : null}
            </div>

            <input type="hidden" name="status" value="scheduled" />

            <div>
              <label className="text-white text-sm">Start</label>
              <BeautifulDateTimePicker value={startValue} onChange={setStartValue} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm">Dauer (Min)</label>
                <input
                  value={selectedService ? String(durationValue) : manualDurationMinutes}
                  onChange={(e) => setManualDurationMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                  readOnly={Boolean(selectedService)}
                  className={`mt-1 w-full rounded-xl border border-white/10 px-3 py-2 outline-none ${selectedService ? "bg-black/20 text-white/85" : "bg-black/30 text-white placeholder:text-white/30 focus:ring-2 focus:ring-white/15"}`}
                  placeholder="60"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="text-white text-sm">Buffer</label>
                <input
                  value={selectedService ? String(bufferValue) : manualBufferMinutes}
                  onChange={(e) => setManualBufferMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                  readOnly={Boolean(selectedService)}
                  className={`mt-1 w-full rounded-xl border border-white/10 px-3 py-2 outline-none ${selectedService ? "bg-black/20 text-white/85" : "bg-black/30 text-white placeholder:text-white/30 focus:ring-2 focus:ring-white/15"}`}
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              Termin erstellen
            </Button>

            <div className="text-xs text-white/50">Tipp: ESC schließt dieses Fenster.</div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

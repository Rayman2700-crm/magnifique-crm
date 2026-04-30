"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { tenantTheme } from "@/components/calendar/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  updateOpenSlotStatusQuick,
  updateWaitlistStatusQuick,
} from "@/app/calendar/actions";

type OpenSlotItem = {
  id: string;
  appointmentId: string;
  tenantId: string;
  tenantName: string;
  startAt: string;
  endAt: string;
  waitlistCount: number;
  immediateCount: number;
};

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

type UserProfileAvatarRow = {
  user_id: string;
  tenant_id: string | null;
  full_name: string | null;
  avatar_path: string | null;
  avatar_ring_color: string | null;
};

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatDateLabel(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(dateString));
}

function normalizeDayLabel(value: string) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!v) return "";
  return (
    (
      {
        mo: "mo",
        montag: "mo",
        monday: "mo",
        di: "di",
        dienstag: "di",
        tuesday: "di",
        mi: "mi",
        mittwoch: "mi",
        wednesday: "mi",
        do: "do",
        donnerstag: "do",
        thursday: "do",
        fr: "fr",
        freitag: "fr",
        friday: "fr",
        sa: "sa",
        samstag: "sa",
        saturday: "sa",
        so: "so",
        sonntag: "so",
        sunday: "so",
      } as Record<string, string>
    )[v] ?? v.slice(0, 2)
  );
}

function formatWaitlistDays(value: string[] | null | undefined) {
  if (!Array.isArray(value) || value.length === 0) return "flexibel";
  return value.join(", ");
}

function formatOptionalTimeRange(
  timeFrom: string | null,
  timeTo: string | null,
) {
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

function computeWaitlistScore(
  row: {
    preferred_staff_id: string | null;
    preferred_days: string[] | null;
    time_from: string | null;
    time_to: string | null;
    service_title: string | null;
    priority: string | null;
    short_notice_ok: boolean | null;
    reachable_today: boolean | null;
    requested_recently_at: string | null;
  },
  selected: OpenSlotItem,
) {
  let score = 0;
  const wantedStaff = String(row.preferred_staff_id ?? "").trim();
  if (!wantedStaff) score += 1;
  if (wantedStaff && wantedStaff === selected.tenantId) score += 4;

  const apptDay = normalizeDayLabel(
    ["so", "mo", "di", "mi", "do", "fr", "sa"][
      new Date(selected.startAt).getDay()
    ],
  );
  const preferredDays = Array.isArray(row.preferred_days)
    ? row.preferred_days.map(normalizeDayLabel).filter(Boolean)
    : [];
  if (preferredDays.length === 0) score += 1;
  if (preferredDays.includes(apptDay)) score += 2;

  const start = new Date(selected.startAt);
  const minutes = start.getHours() * 60 + start.getMinutes();
  const timeFrom = String(row.time_from ?? "").trim();
  const timeTo = String(row.time_to ?? "").trim();
  const toMin = (v: string) => {
    const [h, m] = v.split(":");
    return Number(h || 0) * 60 + Number(m || 0);
  };

  if (!timeFrom && !timeTo) score += 1;
  else {
    const afterFrom = !timeFrom || minutes >= toMin(timeFrom);
    const beforeTo = !timeTo || minutes <= toMin(timeTo);
    if (afterFrom && beforeTo) score += 2;
  }

  if (row.short_notice_ok) score += 5;
  if (row.reachable_today) score += 4;
  score += recentRequestScore(row.requested_recently_at);
  score += getPrioritySort(row.priority);

  return score;
}

function normalizePhoneForWhatsApp(phone: string) {
  let p = String(phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p.replace(/\D/g, "");
}

function normalizePhoneForTel(phone: string) {
  let p = String(phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+") && p.startsWith("0")) p = "+43" + p.slice(1);
  if (!p.startsWith("+") && p.startsWith("43")) p = "+" + p;
  return p;
}

function menuIconButtonClass(active = false, danger = false) {
  if (danger) {
    return "inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-600/90 hover:text-white";
  }

  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.10]`;
}

function passiveMenuButtonClass(active = false) {
  return `inline-flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-[16px] border ${
    active ? "border-white/18 bg-white/12" : "border-white/12 bg-white/[0.04]"
  } px-3 text-sm font-semibold text-white cursor-default select-none pointer-events-none`;
}

function cardIconButtonClass(disabled = false) {
  return `inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.04] text-white transition-colors ${
    disabled
      ? "cursor-not-allowed opacity-45 pointer-events-none"
      : "hover:bg-white/[0.10]"
  }`;
}

function cardDangerIconButtonClass(disabled = false) {
  return `inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-red-400/20 bg-red-500/[0.07] text-red-200 transition-colors ${
    disabled
      ? "cursor-not-allowed opacity-45 pointer-events-none"
      : "hover:border-red-400/35 hover:bg-red-500/15 hover:text-red-100"
  }`;
}

function normalizeLookupValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferPractitionerUserIdFromOpenSlot(item: OpenSlotItem) {
  const candidates = [item.tenantName];
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const normalized = normalizeLookupValue(raw);
    if (normalized.includes("radu")) return "radu";
    if (normalized.includes("raluca")) return "raluca";
    if (normalized.includes("alexandra")) return "alexandra";
    if (normalized.includes("barbara")) return "barbara";
    if (normalized.includes("boba")) return "boba";
    const first = normalized
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .split(/\s+/)[0];
    if (first) return first;
  }
  return "user";
}

function findPractitionerProfileForOpenSlot(
  item: OpenSlotItem,
  profiles: UserProfileAvatarRow[],
) {
  const tenantId = String(item.tenantId ?? "").trim();
  const tenantName = normalizeLookupValue(item.tenantName);
  if (tenantId) {
    const tenantProfiles = profiles.filter(
      (profile) => String(profile.tenant_id ?? "").trim() === tenantId,
    );
    if (tenantProfiles.length === 1) return tenantProfiles[0];
    const byName = tenantProfiles.find(
      (profile) => normalizeLookupValue(profile.full_name) === tenantName,
    );
    if (byName) return byName;
  }
  if (tenantName) {
    const matched = profiles.find(
      (profile) => normalizeLookupValue(profile.full_name) === tenantName,
    );
    if (matched) return matched;
  }
  return null;
}

function resolveAvatarUrl(
  avatarPath: string | null | undefined,
  userId: string,
) {
  const raw = String(avatarPath ?? "").trim();
  if (raw) {
    if (
      /^https?:\/\//i.test(raw) ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:")
    )
      return raw;
    const normalized = raw.replace(/^\/+/, "").replace(/^avatars\//i, "");
    const { data } = supabaseBrowser()
      .storage.from("avatars")
      .getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }
  return `/users/${userId}.png`;
}

function avatarHideOnError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
  const parent = event.currentTarget.parentElement;
  if (parent) parent.dataset.avatarBroken = "1";
}

function findDashboardCalendarTarget() {
  const directTarget =
    document.getElementById("dashboard-calendar-card") ||
    document.getElementById("calendar") ||
    document.getElementById("dashboard-calendar") ||
    document.querySelector('[data-dashboard-calendar="true"]');

  const headingTarget = Array.from(document.querySelectorAll("h1,h2,h3")).find(
    (node) => {
      const text = String(node.textContent ?? "")
        .trim()
        .toLowerCase();
      return text === "kalender";
    },
  );

  const target = directTarget || headingTarget;
  return target instanceof HTMLElement ? target : null;
}

function scrollDashboardCalendarWithRetry() {
  let tries = 0;
  const run = () => {
    tries += 1;
    const target = findDashboardCalendarTarget();
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (tries < 16) {
      window.setTimeout(run, 120);
      return;
    }

    window.scrollTo({ top: 150, behavior: "smooth" });
  };

  window.setTimeout(run, 80);
}

function CardIconLink({
  href,
  title,
  children,
  target,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      className={cardIconButtonClass()}
      aria-label={title}
      title={title}
    >
      {children}
    </Link>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getCreateForWaitlistHref(
  selected: OpenSlotItem,
  row: WaitlistMatchRow,
) {
  if (!row.customer_profile_id) return "#";
  const start = new Date(selected.startAt);
  const durationMin = Math.max(
    5,
    Math.round(
      (new Date(selected.endAt).getTime() - start.getTime()) / 60000,
    ) || 60,
  );
  const params = new URLSearchParams({
    title: row.service_title || "Termin",
    notes: row.notes || "",
    start: toDatetimeLocalValue(start),
    duration: String(durationMin),
    buffer: "0",
    status: "scheduled",
    openSlotId: selected.id,
    waitlistId: row.id,
    source: "open-slot",
  });
  return `/customers/${row.customer_profile_id}/appointments/new?${params.toString()}`;
}

export default function OpenSlotsSlideover({
  items,
}: {
  items: OpenSlotItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [matchMap, setMatchMap] = useState<Record<string, WaitlistMatchRow[]>>(
    {},
  );
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});
  const [pendingWaitlistId, setPendingWaitlistId] = useState<string | null>(
    null,
  );
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [practitionerProfiles, setPractitionerProfiles] = useState<
    UserProfileAvatarRow[]
  >([]);

  const open = searchParams?.get("openSlots") === "1";

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openSlots");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  const scrollToDashboardCalendar = useMemo(() => {
    return () => {
      try {
        window.sessionStorage.setItem("dashboard-scroll-to-calendar", "1");
        window.localStorage.setItem("dashboard-scroll-to-calendar", "1");
      } catch {
        // sessionStorage kann in privaten/gesperrten Browser-Modi blockiert sein.
      }

      if (pathname === "/dashboard") {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.delete("openSlots");
        params.delete("scrollToCalendar");
        const qs = params.toString();
        const targetUrl = qs
          ? `/dashboard?${qs}#dashboard-calendar-card`
          : "/dashboard#dashboard-calendar-card";
        router.replace(targetUrl, { scroll: false });
        window.setTimeout(scrollDashboardCalendarWithRetry, 80);
        window.setTimeout(scrollDashboardCalendarWithRetry, 420);
        return;
      }

      window.location.href =
        "/dashboard?scrollToCalendar=1#dashboard-calendar-card";
    };
  }, [router, pathname, searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (pathname !== "/dashboard") return;

    let shouldScroll = searchParams?.get("scrollToCalendar") === "1";

    try {
      if (
        window.sessionStorage.getItem("dashboard-scroll-to-calendar") === "1"
      ) {
        shouldScroll = true;
        window.sessionStorage.removeItem("dashboard-scroll-to-calendar");
      }
    } catch {
      // ignorieren
    }

    if (!shouldScroll) return;

    scrollDashboardCalendarWithRetry();

    if (searchParams?.get("scrollToCalendar") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("scrollToCalendar");
      const qs = params.toString();
      window.setTimeout(() => {
        router.replace(qs ? `/dashboard?${qs}` : "/dashboard", {
          scroll: false,
        });
      }, 350);
    }
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!mounted) return;

    if (open) {
      setVisible(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    setShown(false);
    const timeout = setTimeout(() => setVisible(false), 220);
    return () => clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    let alive = true;

    async function loadMatchesForItem(item: OpenSlotItem) {
      try {
        setLoadingMap((current) => ({ ...current, [item.id]: true }));
        setErrorMap((current) => ({ ...current, [item.id]: null }));

        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from("appointment_waitlist")
          .select(
            `
            id,
            customer_profile_id,
            person_id,
            service_title,
            preferred_staff_id,
            preferred_days,
            time_from,
            time_to,
            notes,
            priority,
            short_notice_ok,
            reachable_today,
            requested_recently_at,
            status,
            created_at
          `,
          )
          .eq("tenant_id", item.tenantId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(25);

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const profileIds = Array.from(
          new Set(
            rows
              .map((row: any) => String(row.customer_profile_id ?? "").trim())
              .filter(Boolean),
          ),
        );

        const profilesById = new Map<
          string,
          {
            customer_name: string | null;
            phone: string | null;
            email: string | null;
          }
        >();

        if (profileIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("customer_profiles")
            .select(
              `
              id,
              person:persons (
                full_name,
                phone,
                email
              )
            `,
            )
            .in("id", profileIds);

          if (profileError) throw profileError;

          for (const profile of Array.isArray(profiles) ? profiles : []) {
            const personJoin = Array.isArray((profile as any).person)
              ? (profile as any).person[0]
              : (profile as any).person;

            profilesById.set(String((profile as any).id), {
              customer_name: String(personJoin?.full_name ?? "").trim() || null,
              phone: String(personJoin?.phone ?? "").trim() || null,
              email: String(personJoin?.email ?? "").trim() || null,
            });
          }
        }

        const mapped = rows
          .map((row: any) => {
            const profile = profilesById.get(
              String(row.customer_profile_id ?? ""),
            );
            const preferredDays = Array.isArray(row.preferred_days)
              ? row.preferred_days
                  .map((entry: any) => String(entry))
                  .filter(Boolean)
              : [];

            const match: WaitlistMatchRow = {
              id: String(row.id),
              customer_profile_id: String(row.customer_profile_id ?? ""),
              person_id: row.person_id ? String(row.person_id) : null,
              service_title: row.service_title
                ? String(row.service_title)
                : null,
              preferred_staff_id: row.preferred_staff_id
                ? String(row.preferred_staff_id)
                : null,
              preferred_days: preferredDays,
              time_from: row.time_from ? String(row.time_from) : null,
              time_to: row.time_to ? String(row.time_to) : null,
              notes: row.notes ? String(row.notes) : null,
              priority: row.priority ? String(row.priority) : null,
              short_notice_ok: row.short_notice_ok === true,
              reachable_today: row.reachable_today === true,
              requested_recently_at: row.requested_recently_at
                ? String(row.requested_recently_at)
                : null,
              status: row.status ? String(row.status) : null,
              created_at: row.created_at ? String(row.created_at) : null,
              customer_name: profile?.customer_name ?? null,
              phone: profile?.phone ?? null,
              email: profile?.email ?? null,
              score: computeWaitlistScore(
                {
                  preferred_staff_id: row.preferred_staff_id
                    ? String(row.preferred_staff_id)
                    : null,
                  preferred_days: preferredDays,
                  time_from: row.time_from ? String(row.time_from) : null,
                  time_to: row.time_to ? String(row.time_to) : null,
                  service_title: row.service_title
                    ? String(row.service_title)
                    : null,
                  priority: row.priority ? String(row.priority) : null,
                  short_notice_ok: row.short_notice_ok === true,
                  reachable_today: row.reachable_today === true,
                  requested_recently_at: row.requested_recently_at
                    ? String(row.requested_recently_at)
                    : null,
                },
                item,
              ),
            };

            return match;
          })
          .sort(
            (a, b) =>
              b.score - a.score ||
              (b.requested_recently_at
                ? new Date(b.requested_recently_at).getTime()
                : 0) -
                (a.requested_recently_at
                  ? new Date(a.requested_recently_at).getTime()
                  : 0) ||
              getPrioritySort(b.priority) - getPrioritySort(a.priority),
          )
          .slice(0, 3);

        if (!alive) return;
        setMatchMap((current) => ({ ...current, [item.id]: mapped }));
      } catch (error: any) {
        if (!alive) return;
        setMatchMap((current) => ({ ...current, [item.id]: [] }));
        setErrorMap((current) => ({
          ...current,
          [item.id]:
            error?.message ?? "Kandidaten konnten nicht geladen werden.",
        }));
      } finally {
        if (!alive) return;
        setLoadingMap((current) => ({ ...current, [item.id]: false }));
      }
    }

    if (open && items.length > 0) {
      items.forEach((item) => {
        void loadMatchesForItem(item);
      });
    }

    return () => {
      alive = false;
    };
  }, [open, items]);

  useEffect(() => {
    let cancelled = false;
    const tenantIds = Array.from(
      new Set(
        (items ?? [])
          .map((item) => String(item.tenantId ?? "").trim())
          .filter(Boolean),
      ),
    );

    async function loadPractitionerProfiles() {
      if (tenantIds.length === 0) {
        if (!cancelled) setPractitionerProfiles([]);
        return;
      }

      const { data, error } = await supabaseBrowser()
        .from("user_profiles")
        .select("user_id, tenant_id, full_name, avatar_path, avatar_ring_color")
        .in("tenant_id", tenantIds)
        .eq("is_active", true);

      if (cancelled) return;
      setPractitionerProfiles(
        error ? [] : ((data ?? []) as UserProfileAvatarRow[]),
      );
    }

    void loadPractitionerProfiles();
    return () => {
      cancelled = true;
    };
  }, [items]);

  if (!mounted || !visible || typeof document === "undefined") return null;
  const handleOpenSlotStatusChange = async (
    slotId: string,
    nextStatus: "booked" | "closed" | "expired",
  ) => {
    setPendingSlotId(slotId);

    const result = await updateOpenSlotStatusQuick({
      slotId,
      status: nextStatus,
    });

    if (result?.ok) {
      router.refresh();
    } else {
      setErrorMap((current) => ({
        ...current,
        [slotId]:
          result?.error ?? "Slot-Status konnte nicht gespeichert werden.",
      }));
    }

    setPendingSlotId(null);
  };

  const handleWaitlistStatusChange = async (
    slotId: string,
    waitlistId: string,
    tenantId: string,
    nextStatus: "contacted" | "booked",
  ) => {
    setPendingWaitlistId(waitlistId);

    const result = await updateWaitlistStatusQuick({
      waitlistId,
      status: nextStatus,
      tenantId,
    });

    if (result?.ok) {
      setMatchMap((current) => ({
        ...current,
        [slotId]: (current[slotId] ?? []).filter(
          (entry) => entry.id !== waitlistId,
        ),
      }));

      if (nextStatus === "booked") {
        const slotResult = await updateOpenSlotStatusQuick({
          slotId,
          status: "booked",
        });

        if (!slotResult?.ok) {
          setErrorMap((current) => ({
            ...current,
            [slotId]:
              slotResult?.error ??
              "Slot konnte nicht als vergeben markiert werden.",
          }));
        } else {
          router.refresh();
        }
      }
    } else {
      setErrorMap((current) => ({
        ...current,
        [slotId]:
          result?.error ??
          "Wartelisten-Status konnte nicht gespeichert werden.",
      }));
    }

    setPendingWaitlistId(null);
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1350,
        isolation: "isolate",
      }}
    >
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "max(18px, calc(env(safe-area-inset-top, 0px) + 12px))",
          right: "max(18px, calc(env(safe-area-inset-right, 0px) + 18px))",
          bottom: "max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px))",
          width: 470,
          maxWidth: "calc(100vw - max(18px, calc(env(safe-area-inset-left, 0px) + 18px)) - max(18px, calc(env(safe-area-inset-right, 0px) + 18px)))",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(16,16,16,0.96) 0%, rgba(10,10,10,0.96) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          transform: shown ? "translateX(0)" : "translateX(18px)",
          opacity: shown ? 1 : 0,
          transition: "all 220ms ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "white",
        }}
      >
        <div
          style={{
            padding: 18,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-3">
            <button
              type="button"
              onClick={scrollToDashboardCalendar}
              className={menuIconButtonClass()}
              aria-label="Zum Kalender scrollen"
              title="Zum Kalender scrollen"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>

            <button type="button" className={passiveMenuButtonClass()} disabled>
              Offen {items.length}
            </button>

            <button
              type="button"
              onClick={close}
              className={menuIconButtonClass(false, true)}
              aria-label="Schließen"
              title="Schließen"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
                  Freigewordene Slots
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 18,
                    fontWeight: 800,
                    color: "rgba(255,255,255,0.95)",
                  }}
                >
                  Offene Zeitfenster
                </div>
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.50)",
                  }}
                >
                  {items.length === 0
                    ? "Aktuell sind keine offenen Slots vorhanden."
                    : `${items.length} offene Slots ab heute`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="waitlist-slideover-scroll flex-1 overflow-y-auto p-4"
          style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
        >
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/65">
              Aktuell sind keine freigewordenen Slots offen.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const matches = matchMap[item.id] ?? [];
                const isLoading = loadingMap[item.id] === true;
                const error = errorMap[item.id];
                const theme = tenantTheme(item.tenantName ?? "");
                const practitionerProfile = findPractitionerProfileForOpenSlot(
                  item,
                  practitionerProfiles,
                );
                const practitionerUserId =
                  String(
                    practitionerProfile?.user_id ??
                      inferPractitionerUserIdFromOpenSlot(item),
                  ).trim() || "user";
                const practitionerAvatarUrl = practitionerProfile?.avatar_path
                  ? resolveAvatarUrl(
                      practitionerProfile.avatar_path,
                      practitionerUserId,
                    )
                  : resolveAvatarUrl(null, practitionerUserId);
                const practitionerRingColor =
                  String(practitionerProfile?.avatar_ring_color ?? "").trim() ||
                  theme.bg ||
                  "rgba(255,255,255,0.18)";
                const isSlotPending = pendingSlotId === item.id;

                return (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[0_12px_30px_rgba(0,0,0,0.24)]"
                  >
                    <div
                      className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
                      style={{
                        backgroundColor: theme.bg || "rgba(255,255,255,0.2)",
                      }}
                    />

                    <div className="p-3.5 pl-5">
                      <div className="flex items-start gap-3">
                        <div className="w-[82px] flex-shrink-0 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-center">
                          <div className="text-[15px] font-extrabold leading-none text-white">
                            Frei
                          </div>
                          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                            Slot
                          </div>
                          <div className="mt-1 text-[10px] font-semibold text-white/58">
                            {formatTime(item.startAt)}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mt-1 truncate text-[15px] font-extrabold leading-tight text-white">
                            {formatDateLabel(item.startAt)}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-white/88">
                            {formatTime(item.startAt)}–{formatTime(item.endAt)}
                          </div>
                          <div className="mt-1 truncate text-[11px] font-semibold text-white/45">
                            {item.tenantName || "Behandler"}
                          </div>
                        </div>

                        <div className="ml-auto flex-shrink-0 self-start">
                          <div
                            className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border bg-black/30 p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
                            style={{
                              borderColor: practitionerRingColor,
                              boxShadow: `0 0 0 2px ${practitionerRingColor}, 0 8px 24px rgba(0,0,0,0.32)`,
                            }}
                          >
                            {practitionerAvatarUrl ? (
                              <img
                                src={practitionerAvatarUrl}
                                alt={item.tenantName || "Behandler"}
                                className="h-full w-full rounded-full object-cover"
                                onError={avatarHideOnError}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] text-white/45">
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="font-semibold uppercase tracking-[0.16em]">
                            Warteliste
                          </div>
                          <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
                            {item.waitlistCount} aktiv
                          </div>
                          <div className="mt-1 text-[11px] font-medium normal-case tracking-normal text-white/55">
                            für diesen Behandler
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="font-semibold uppercase tracking-[0.16em]">
                            Sofort
                          </div>
                          <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
                            {item.immediateCount} Kandidaten
                          </div>
                          <div className="mt-1 text-[11px] font-medium normal-case tracking-normal text-white/55">
                            passend sortiert
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={scrollToDashboardCalendar}
                          className={cardIconButtonClass(false)}
                          aria-label="Im Kalender prüfen"
                          title="Im Kalender prüfen"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4.5 w-4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M8 2v4" />
                            <path d="M16 2v4" />
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          disabled={isSlotPending}
                          onClick={() =>
                            handleOpenSlotStatusChange(item.id, "closed")
                          }
                          className={`${cardDangerIconButtonClass(isSlotPending)} ml-auto`}
                          aria-label="Slot schließen"
                          title="Slot schließen"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4.5 w-4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-extrabold text-white">
                            Top-Kandidaten
                          </div>
                          <div className="text-[11px] font-semibold text-white/45">
                            Match-Liste
                          </div>
                        </div>

                        {error ? (
                          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                          </div>
                        ) : null}

                        {isLoading ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/60">
                            Kandidaten werden geladen...
                          </div>
                        ) : matches.length === 0 ? (
                          <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-sm text-white/55">
                            Noch kein passender aktiver Wartelisten-Eintrag für
                            diesen Slot gefunden.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {matches.map((entry) => {
                              const createHref = getCreateForWaitlistHref(
                                item,
                                entry,
                              );
                              const isPending = pendingWaitlistId === entry.id;
                              const waPhone = entry.phone
                                ? normalizePhoneForWhatsApp(entry.phone)
                                : null;
                              const callPhone = entry.phone
                                ? normalizePhoneForTel(entry.phone)
                                : null;
                              const recentLabel = recentRequestLabel(
                                entry.requested_recently_at,
                              );

                              return (
                                <div
                                  key={entry.id}
                                  className="rounded-[18px] border border-white/10 bg-white/[0.03] p-3"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[15px] font-extrabold leading-tight text-white">
                                        {entry.customer_name ||
                                          "Unbekannter Kunde"}
                                      </div>
                                      <div className="mt-1 truncate text-sm font-semibold text-white/82">
                                        {entry.service_title ||
                                          "Ohne Behandlungswunsch"}
                                      </div>
                                      <div className="mt-1 truncate text-[11px] font-semibold text-white/45">
                                        {entry.phone || "Keine Telefonnummer"}
                                      </div>
                                    </div>

                                    <div className="flex h-10 min-w-[44px] items-center justify-center rounded-[14px] border border-fuchsia-300/20 bg-fuchsia-400/10 px-2 text-[11px] font-extrabold text-fuchsia-100">
                                      {entry.score}
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] text-white/45">
                                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                                      <div className="font-semibold uppercase tracking-[0.16em]">
                                        Wunsch
                                      </div>
                                      <div className="mt-1 truncate text-[12px] font-semibold normal-case tracking-normal text-white/82">
                                        {formatWaitlistDays(
                                          entry.preferred_days,
                                        )}
                                      </div>
                                      <div className="mt-1 truncate text-[11px] font-medium normal-case tracking-normal text-white/55">
                                        {formatOptionalTimeRange(
                                          entry.time_from,
                                          entry.time_to,
                                        )}
                                      </div>
                                    </div>

                                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                                      <div className="font-semibold uppercase tracking-[0.16em]">
                                        Status
                                      </div>
                                      <div className="mt-1 truncate text-[12px] font-semibold normal-case tracking-normal text-white/82">
                                        {getPriorityLabel(entry.priority)}
                                      </div>
                                      <div className="mt-1 truncate text-[11px] font-medium normal-case tracking-normal text-white/55">
                                        {recentLabel || "Wartet"}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                                    {entry.short_notice_ok ? (
                                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                                        kurzfristig
                                      </span>
                                    ) : null}
                                    {entry.reachable_today ? (
                                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-sky-200">
                                        erreichbar
                                      </span>
                                    ) : null}
                                  </div>

                                  {entry.notes ? (
                                    <div className="mt-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/55">
                                      {entry.notes}
                                    </div>
                                  ) : null}

                                  <div className="mt-3 flex items-center gap-2">
                                    {waPhone ? (
                                      <CardIconLink
                                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                          `Hallo ${entry.customer_name || ""}, es ist kurzfristig ein Termin am ${formatDateLabel(
                                            item.startAt,
                                          )} um ${formatTime(item.startAt)} frei geworden.`,
                                        )}`}
                                        title="WhatsApp öffnen"
                                        target="_blank"
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-4.5 w-4.5"
                                          fill="#34d399"
                                          aria-hidden="true"
                                        >
                                          <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Zm-8.45 18.3h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.66-.24-.38a9.9 9.9 0 0 1-1.52-5.21c0-5.46 4.45-9.91 9.92-9.91 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.92-9.92 9.92Zm5.44-7.42c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.66.15-.2.3-.76.98-.94 1.18-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.91-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.35Z" />
                                        </svg>
                                      </CardIconLink>
                                    ) : (
                                      <button
                                        type="button"
                                        className={cardIconButtonClass(true)}
                                        disabled
                                        aria-label="WhatsApp nicht verfügbar"
                                        title="WhatsApp nicht verfügbar"
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-4.5 w-4.5"
                                          fill="rgba(255,255,255,0.28)"
                                          aria-hidden="true"
                                        >
                                          <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Z" />
                                        </svg>
                                      </button>
                                    )}

                                    {callPhone ? (
                                      <CardIconLink
                                        href={`tel:${callPhone}`}
                                        title="Anrufen"
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-4.5 w-4.5"
                                          fill="none"
                                          stroke="#22c55e"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
                                        </svg>
                                      </CardIconLink>
                                    ) : null}

                                    <CardIconLink
                                      href={`/customers/${entry.customer_profile_id}?tenantId=${encodeURIComponent(item.tenantId)}&tab=waitlist#waitlist`}
                                      title="Kunde öffnen"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-4.5 w-4.5"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M20 21a8 8 0 1 0-16 0" />
                                        <circle cx="12" cy="7" r="4" />
                                      </svg>
                                    </CardIconLink>

                                    <CardIconLink
                                      href={createHref}
                                      title="Termin anlegen"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-4.5 w-4.5"
                                        fill="none"
                                        stroke="#34d399"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M12 5v14" />
                                        <path d="M5 12h14" />
                                      </svg>
                                    </CardIconLink>

                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleWaitlistStatusChange(
                                          item.id,
                                          entry.id,
                                          item.tenantId,
                                          "contacted",
                                        )
                                      }
                                      className={cardIconButtonClass(isPending)}
                                      aria-label="Als kontaktiert markieren"
                                      title="Als kontaktiert markieren"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-4.5 w-4.5"
                                        fill="none"
                                        stroke="#38bdf8"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M20 6 9 17l-5-5" />
                                      </svg>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleWaitlistStatusChange(
                                          item.id,
                                          entry.id,
                                          item.tenantId,
                                          "booked",
                                        )
                                      }
                                      className={`${cardIconButtonClass(isPending)} ml-auto`}
                                      aria-label="Als vergeben markieren"
                                      title="Als vergeben markieren"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        className="h-4.5 w-4.5"
                                        fill="none"
                                        stroke="#e879f9"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M20 6 9 17l-5-5" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

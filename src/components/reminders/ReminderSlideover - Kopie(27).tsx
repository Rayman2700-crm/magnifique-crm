"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildReminderWhatsAppUrl, tenantTheme } from "@/components/calendar/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import { markReminderSent } from "@/app/calendar/actions";
import type { Item } from "@/components/calendar/types";

type ReminderItem = Item & {
  reminderAt: string | null;
};

type ReminderApiResponse = {
  count: number;
  items?: ReminderItem[];
  error?: string;
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

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatSentAt(dateString: string | null) {
  if (!dateString) return "";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function isPastAppointment(dateString: string) {
  return new Date(dateString).getTime() < Date.now();
}

function reminderStatus(item: ReminderItem) {
  if (item.reminderSentAt) {
    return {
      label: "Gesendet",
      className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    };
  }

  return {
    label: "Offen",
    className: "border-amber-400/25 bg-amber-500/10 text-amber-100",
  };
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
    disabled ? "cursor-not-allowed opacity-45 pointer-events-none" : "hover:bg-white/[0.10]"
  }`;
}

function pickColor(source: any, keys: string[]) {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNestedColor(source: any) {
  if (!source || typeof source !== "object") return null;
  const nestedCandidates = [source.profile, source.settings, source.tenant, source.theme, source.preferences];
  for (const candidate of nestedCandidates) {
    const nested = pickColor(candidate, [
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

function inferPractitionerUserId(item: ReminderItem) {
  const anyItem = item as any;
  const candidates = [
    anyItem?.userId,
    anyItem?.user_id,
    anyItem?.tenantUserId,
    anyItem?.practitionerUserId,
    anyItem?.staffUserId,
    anyItem?.assignedUserId,
    anyItem?.ownerUserId,
    anyItem?.providerUserId,
    anyItem?.tenantName,
    anyItem?.providerName,
    anyItem?.staffName,
    anyItem?.userName,
    anyItem?.customerName,
  ];

  for (const value of candidates) {
    const raw = String(value ?? '').trim();
    if (!raw) continue;
    const normalized = raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

    if (normalized.includes('radu')) return 'radu';
    if (normalized.includes('raluca')) return 'raluca';
    if (normalized.includes('alexandra')) return 'alexandra';
    if (normalized.includes('barbara')) return 'barbara';
    if (normalized.includes('boba')) return 'boba';

    const first = normalized.replace(/[^a-z0-9\s-]/g, ' ').trim().split(/\s+/)[0];
    if (first) return first;
  }

  return 'user';
}


function normalizeLookupValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferPractitionerName(item: ReminderItem) {
  const anyItem = item as any;
  const candidates = [
    anyItem?.tenantName,
    anyItem?.providerName,
    anyItem?.staffName,
    anyItem?.userName,
    anyItem?.practitionerName,
    anyItem?.ownerName,
    anyItem?.fullName,
  ];

  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (raw) return raw;
  }

  return null;
}

function findPractitionerProfile(item: ReminderItem, profiles: UserProfileAvatarRow[]) {
  const anyItem = item as any;
  const directUserIdCandidates = [
    anyItem?.userId,
    anyItem?.user_id,
    anyItem?.tenantUserId,
    anyItem?.practitionerUserId,
    anyItem?.staffUserId,
    anyItem?.assignedUserId,
    anyItem?.ownerUserId,
    anyItem?.providerUserId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const userId of directUserIdCandidates) {
    const matched = profiles.find((profile) => String(profile.user_id ?? "").trim() === userId);
    if (matched) return matched;
  }

  const tenantId = String(anyItem?.tenantId ?? anyItem?.tenant_id ?? "").trim();
  const practitionerName = normalizeLookupValue(inferPractitionerName(item));

  if (tenantId && practitionerName) {
    const matched = profiles.find((profile) => {
      return String(profile.tenant_id ?? "").trim() === tenantId && normalizeLookupValue(profile.full_name) === practitionerName;
    });
    if (matched) return matched;
  }

  if (tenantId) {
    const tenantProfiles = profiles.filter((profile) => String(profile.tenant_id ?? "").trim() === tenantId);
    if (tenantProfiles.length === 1) return tenantProfiles[0];
  }

  if (practitionerName) {
    const matched = profiles.find((profile) => normalizeLookupValue(profile.full_name) === practitionerName);
    if (matched) return matched;
  }

  return null;
}

function avatarHideOnError(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
  const parent = event.currentTarget.parentElement;
  if (parent) parent.dataset.avatarBroken = "1";
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

function resolvePractitionerAvatar(item: ReminderItem) {
  const anyItem = item as any;
  const nestedSources = [
    anyItem,
    anyItem?.profile,
    anyItem?.settings,
    anyItem?.tenant,
    anyItem?.user,
    anyItem?.practitioner,
    anyItem?.provider,
    anyItem?.staff,
    anyItem?.legendUser,
    anyItem?.legend_user,
  ].filter(Boolean);

  const avatarKeys = [
    "avatarUrl",
    "avatar_url",
    "avatarPath",
    "avatar_path",
    "avatar",
    "avatarFile",
    "avatar_file",
    "imageUrl",
    "image_url",
    "imagePath",
    "image_path",
    "photoUrl",
    "photo_url",
    "photoPath",
    "photo_path",
    "tenantAvatarUrl",
    "tenant_avatar_url",
    "practitionerAvatarUrl",
    "practitioner_avatar_url",
    "providerAvatarUrl",
    "provider_avatar_url",
    "userAvatarUrl",
    "user_avatar_url",
    "staffAvatarUrl",
    "staff_avatar_url",
    "profileImage",
    "profile_image",
  ];

  let directAvatar: string | null = null;
  for (const source of nestedSources) {
    for (const key of avatarKeys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) {
        directAvatar = value.trim();
        break;
      }
    }
    if (directAvatar) break;
  }

  const userId = inferPractitionerUserId(item);
  return resolveAvatarUrl(directAvatar, userId);
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

function resolvePractitionerRingColor(item: ReminderItem) {
  const anyItem = item as any;
  return (
    pickColor(anyItem, [
      "ringColor",
      "avatarRingColor",
      "avatarColor",
      "tenantColor",
      "accentColor",
      "profileColor",
      "primaryColor",
      "brandColor",
      "color",
    ]) || pickNestedColor(anyItem)
  ) as string | null;
}

function smartCustomerHref(item: ReminderItem) {
  const customerProfileId = (item as any)?.customerProfileId as string | undefined;
  if (customerProfileId) return `/customers/${customerProfileId}`;
  if (item.customerPhone) return `/customers?q=${encodeURIComponent(item.customerPhone)}`;
  if (item.customerName) return `/customers?q=${encodeURIComponent(item.customerName)}`;
  return "/customers";
}

function smartCalendarHref(item: ReminderItem) {
  const params = new URLSearchParams();
  params.set("focusAppointment", item.id);
  return `/calendar?${params.toString()}`;
}

function CardIconLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cardIconButtonClass()} aria-label={title} title={title}>
      {children}
    </Link>
  );
}

export default function ReminderSlideover({
  items,
  currentUserEmail,
}: {
  items: ReminderItem[];
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [liveItems, setLiveItems] = useState<ReminderItem[]>(items ?? []);
  const [practitionerProfiles, setPractitionerProfiles] = useState<UserProfileAvatarRow[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAdmin =
    String(currentUserEmail ?? "").toLowerCase().includes("radu") ||
    String(currentUserEmail ?? "").toLowerCase().includes("admin");

  const open = searchParams?.get("openReminders") === "1";

  const close = useMemo(() => {
    return () => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("openReminders");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
  }, [router, pathname, searchParams]);

  const visibleItems = liveItems.filter((item) => !item.reminderSentAt && !isPastAppointment(item.start_at));
  const openCount = visibleItems.length;
  const sentCount = liveItems.filter((item) => Boolean(item.reminderSentAt)).length;
  const firstCalendarHref = "/calendar";
  const firstCustomerHref = "/customers";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLiveItems(items ?? []);
  }, [items]);

  useEffect(() => {
    let cancelled = false;

    const loadPractitionerProfiles = async () => {
      const tenantIds = Array.from(
        new Set(
          (liveItems ?? [])
            .map((item) => String((item as any)?.tenantId ?? (item as any)?.tenant_id ?? "").trim())
            .filter(Boolean)
        )
      );

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

      if (error) {
        setPractitionerProfiles([]);
        return;
      }

      setPractitionerProfiles((data ?? []) as UserProfileAvatarRow[]);
    };

    void loadPractitionerProfiles();

    return () => {
      cancelled = true;
    };
  }, [liveItems]);


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
    if (!open) return;

    let cancelled = false;

    async function loadReminderItems() {
      try {
        setIsLoadingItems(true);
        setFetchError(null);

        const res = await fetch("/api/reminders/count?includeItems=1", {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as ReminderApiResponse | null;

        if (!res.ok) {
          throw new Error(json?.error ?? "Reminder konnten nicht geladen werden.");
        }

        if (!cancelled) {
          setLiveItems(Array.isArray(json?.items) ? json!.items! : []);
        }
      } catch (error: any) {
        if (!cancelled) {
          setFetchError(error?.message ?? "Reminder konnten nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingItems(false);
        }
      }
    }

    loadReminderItems();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleSendReminder(item: ReminderItem, force = false) {
    const reminderHref = buildReminderWhatsAppUrl(item);
    if (!reminderHref) return;

    setErrorMsg(null);

    const popup = window.open("", "_blank", "noopener,noreferrer");
    setPendingId(item.id);

    startTransition(async () => {
      const result = await markReminderSent({
        appointmentId: item.id,
        force,
      });

      if (!result?.ok) {
        if (popup) popup.close();
        setPendingId(null);
        setErrorMsg(result?.error ?? "Reminder konnte nicht markiert werden.");
        return;
      }

      if (popup) {
        popup.location.href = reminderHref;
      } else {
        window.location.href = reminderHref;
      }

      setLiveItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                reminderSentAt: result.reminderSentAt ?? entry.reminderSentAt ?? null,
              }
            : entry
        )
      );

      setPendingId(null);
      router.refresh();
    });
  }

  if (!mounted || !visible || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1350, isolation: "isolate" }}>
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: shown ? "auto" : "none",
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
          background: "linear-gradient(180deg, rgba(16,16,16,0.96) 0%, rgba(10,10,10,0.96) 100%)",
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
        <div style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-3">
            <Link href={firstCalendarHref} className={menuIconButtonClass()} aria-label="Im Kalender öffnen" title="Im Kalender öffnen">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </Link>

            <Link href={firstCustomerHref} className={menuIconButtonClass()} aria-label="Kunde öffnen" title="Kunde öffnen">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 1 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>

            <button
              type="button"
              className={passiveMenuButtonClass()}
              aria-label="Offene Reminder"
              title="Offene Reminder"
              disabled
            >
              <span className="relative inline-flex h-9 w-9 items-center justify-center">
                <span className="pointer-events-none absolute -right-1 -top-1 z-10 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_rgba(11,11,12,0.82),0_0_12px_rgba(37,99,235,0.42)]">{openCount}</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M9 17a3 3 0 0 0 6 0" />
                </svg>
              </span>
            </button>

            <button type="button" className={passiveMenuButtonClass()} disabled>
              Offene {openCount}
            </button>

            <button type="button" onClick={close} className={menuIconButtonClass(false, true)} aria-label="Schließen" title="Schließen">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>Reminder</div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
              Fällige Reminder
            </div>
            <div style={{ marginTop: 5, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
              {isLoadingItems
                ? "Reminder werden geladen..."
                : visibleItems.length === 0
                ? "Aktuell ist nichts offen."
                : `${visibleItems.length} offene Reminder · ${sentCount} gesendet`}
            </div>
          </div>
        </div>

        <div className="reminder-slideover-scroll" style={{ padding: 16, overflow: "auto", msOverflowStyle: "none", scrollbarWidth: "none" }}>
          {errorMsg ? (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMsg}
            </div>
          ) : null}

          {fetchError ? (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {fetchError}
            </div>
          ) : null}

          {isLoadingItems ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
              Reminder werden geladen...
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
              Aktuell sind keine Reminder fällig.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => {
                const theme = tenantTheme(item.tenantName ?? "");
                const hasWhatsApp = Boolean(item.customerPhone && buildReminderWhatsAppUrl(item));
                const whatsappDisabled = !item.customerPhone || !hasWhatsApp || (isPending && pendingId === item.id);
                const customerHref = smartCustomerHref(item);
                const calendarHref = smartCalendarHref(item);
                const whatsappHref = buildReminderWhatsAppUrl(item);
                const practitionerProfile = findPractitionerProfile(item, practitionerProfiles);
                const practitionerUserId = String(practitionerProfile?.user_id ?? inferPractitionerUserId(item)).trim() || inferPractitionerUserId(item);
                const practitionerAvatarUrl = practitionerProfile
                  ? practitionerProfile.avatar_path
                    ? resolveAvatarUrl(practitionerProfile.avatar_path, practitionerUserId)
                    : null
                  : resolvePractitionerAvatar(item);
                const practitionerRingColor =
                  String(practitionerProfile?.avatar_ring_color ?? "").trim() ||
                  resolvePractitionerRingColor(item) ||
                  theme.bg ||
                  "rgba(255,255,255,0.18)";

                return (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] shadow-[0_12px_30px_rgba(0,0,0,0.24)]"
                  >
                    <div
                      className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full"
                      style={{ backgroundColor: theme.bg || "rgba(255,255,255,0.2)" }}
                    />

                    <div className="p-3.5 pl-5">
                      <div className="flex items-start gap-3">
                        <div className="w-[82px] flex-shrink-0 rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-center">
                          <div className="text-[16px] font-extrabold leading-none text-white">{formatTime(item.start_at)}</div>
                          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                            Termin
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mt-1 truncate text-[15px] font-extrabold leading-tight text-white">
                            {item.title || "Termin"}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-white/88">
                            {item.customerName ?? "Walk-in"}
                          </div>
                          {item.reminderSentAt ? (
                            <div className="mt-1 text-[11px] text-emerald-200/85">
                              Gesendet am {formatSentAt(item.reminderSentAt)}
                            </div>
                          ) : null}
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
                                alt={item.tenantName || item.customerName || "Behandler"}
                                className="h-full w-full rounded-full object-cover"
                                onError={avatarHideOnError}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] text-white/45">
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold uppercase tracking-[0.16em]">Telefon</div>
                            {item.customerPhone ? (
                              <a
                                href={`tel:${String(item.customerPhone).replace(/\s+/g, "")}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] transition-colors hover:bg-white/[0.10]"
                                title={`Anrufen: ${item.customerPhone}`}
                                aria-label={`Anrufen: ${item.customerPhone}`}
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
                                </svg>
                              </a>
                            ) : (
                              <div
                                className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04]"
                                title="Keine Telefonnummer"
                                aria-label="Keine Telefonnummer"
                              >
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.61 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.27a2 2 0 0 1 2.11-.45c.84.28 1.71.49 2.61.61A2 2 0 0 1 22 16.92z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
                            {item.customerPhone || "Nicht hinterlegt"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <div className="font-semibold uppercase tracking-[0.16em]">Terminzeit</div>
                          <div className="mt-1 text-[12px] font-semibold normal-case tracking-normal text-white/82">
                            {formatDateTime(item.start_at)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <CardIconLink href={calendarHref} title="Im Kalender öffnen">
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 2v4" />
                            <path d="M16 2v4" />
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                        </CardIconLink>

                        <CardIconLink href={customerHref} title="Kunde öffnen">
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 21a8 8 0 1 0-16 0" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </CardIconLink>

                        <button
                          type="button"
                          className={cardIconButtonClass(whatsappDisabled)}
                          disabled={whatsappDisabled}
                          onClick={() => {
                            if (whatsappDisabled) return;
                            if (!item.reminderSentAt) {
                              handleSendReminder(item, false);
                            } else if (isAdmin) {
                              handleSendReminder(item, true);
                            } else if (whatsappHref) {
                              window.open(whatsappHref, "_blank", "noopener,noreferrer");
                            }
                          }}
                          aria-label={
                            !item.reminderSentAt ? "WhatsApp senden" : isAdmin ? "Reminder erneut senden" : "WhatsApp öffnen"
                          }
                          title={
                            !item.reminderSentAt ? "WhatsApp senden" : isAdmin ? "Reminder erneut senden" : "WhatsApp öffnen"
                          }
                        >
                          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill={whatsappDisabled ? "rgba(255,255,255,0.28)" : "#34d399"} aria-hidden="true">
                            <path d="M20.52 3.48A11.82 11.82 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.92c0 2.1.55 4.15 1.59 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.75 1.47h.01c6.57 0 11.91-5.34 11.91-11.92 0-3.18-1.24-6.17-3.47-8.41Zm-8.45 18.3h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.75.98 1-3.66-.24-.38a9.9 9.9 0 0 1-1.52-5.21c0-5.46 4.45-9.91 9.92-9.91 2.65 0 5.14 1.03 7.01 2.9a9.84 9.84 0 0 1 2.9 7c0 5.47-4.45 9.92-9.92 9.92Zm5.44-7.42c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.66.15-.2.3-.76.98-.94 1.18-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.77-1.64-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.59-.91-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.56-.35Z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className={cardIconButtonClass()}
                          aria-label={!item.reminderSentAt ? "Reminder offen" : "Reminder gesendet"}
                          title={!item.reminderSentAt ? "Reminder offen" : "Reminder gesendet"}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4.5 w-4.5"
                            fill="none"
                            stroke={!item.reminderSentAt ? "#f59e0b" : "currentColor"}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                            <path d="M9 17a3 3 0 0 0 6 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .reminder-slideover-scroll::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
    </div>,
    document.body
  );
}

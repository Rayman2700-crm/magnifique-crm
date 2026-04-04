"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/Logo";
import { tenantTheme } from "@/lib/theme/tenantTheme";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Kunden" },
  { href: "/services", label: "Dienstleistungen" },
  { href: "/dashboard/chat", label: "Team Chat" },
];

type ChatMessageRow = {
  id: string;
  sender_id: string;
  created_at: string;
};

function getAvatarTheme(userLabel?: string) {
  if (!userLabel) return tenantTheme.Radu;

  const normalized = userLabel.trim().toLowerCase();
  const firstWord = normalized.split(/\s+/)[0] ?? normalized;

  const exactKey = Object.keys(tenantTheme).find(
    (name) => name.toLowerCase() === normalized
  );
  if (exactKey) return tenantTheme[exactKey as keyof typeof tenantTheme];

  const firstWordKey = Object.keys(tenantTheme).find(
    (name) => name.toLowerCase() === firstWord
  );
  if (firstWordKey) return tenantTheme[firstWordKey as keyof typeof tenantTheme];

  const includesKey = Object.keys(tenantTheme).find((name) => {
    const key = name.toLowerCase();
    return normalized.includes(key) || normalized.includes(key)
  });

  return includesKey ? tenantTheme[includesKey as keyof typeof tenantTheme] : tenantTheme.Radu;
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 7.1a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.34.11.51.11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function GoogleCalendarMark({ day }: { day: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "#ffffff",
        boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
        flexShrink: 0,
      }}
    >
      <div style={{ height: 7, background: "#4285F4" }} />
      <div style={{ height: 23, display: "grid", gridTemplateColumns: "6px 1fr" }}>
        <div style={{ background: "#34A853" }} />
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#4285F4",
            fontSize: 14,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          />
          {day}
        </div>
      </div>
    </div>
  );
}

function BrandBadge({
  count,
  tone = "blue",
  pulse = false,
}: {
  count: number;
  tone?: "blue" | "gold";
  pulse?: boolean;
}) {
  if (count <= 0) return null;

  const isGold = tone === "gold";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "22px",
        height: "22px",
        padding: "0 7px",
        borderRadius: "999px",
        background: isGold ? "#D6C3A3" : "#2563eb",
        color: isGold ? "#0B0B0C" : "#fff",
        fontSize: "12px",
        fontWeight: 700,
        lineHeight: "22px",
        boxShadow: isGold
          ? "0 0 0 2px rgba(11,11,12,0.82), 0 0 16px rgba(214,195,163,0.28)"
          : "0 0 0 2px rgba(11,11,12,0.82), 0 0 12px rgba(37,99,235,0.42)",
        transform: pulse ? "scale(1.08)" : "scale(1)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        animation: pulse ? "topnavBadgePulse 0.9s ease-in-out 3" : "none",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function UserMenuPopover({
  open,
  shown,
  onClose,
  userLabel,
  userEmail,
  currentUserId,
}: {
  open: boolean;
  shown: boolean;
  onClose: () => void;
  userLabel?: string;
  userEmail?: string | null;
  currentUserId: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, isolation: "isolate" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "transparent" }} />

      <div
        style={{
          position: "absolute",
          top: 72,
          right: 20,
          width: 300,
          maxWidth: "calc(100vw - 24px)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.10)",
          background:
            "linear-gradient(180deg, rgba(28,28,31,0.98) 0%, rgba(18,19,22,0.98) 100%)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.44)",
          overflow: "hidden",
          transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
          opacity: shown ? 1 : 0,
          transformOrigin: "top right",
          transition: "transform 180ms ease, opacity 180ms ease",
          backdropFilter: "blur(18px)",
        }}
      >
        <div
          style={{
            padding: 16,
            display: "flex",
            gap: 12,
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <img
            src={`/users/${currentUserId}.png`}
            alt="Benutzerfoto"
            className="shrink-0 rounded-2xl border border-white/10 object-cover"
            style={{ width: 48, height: 48 }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "rgba(255,255,255,0.96)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {userLabel ?? "Benutzer"}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: "rgba(247,247,245,0.56)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {userEmail ?? "—"}
            </div>
          </div>
        </div>

        <div style={{ padding: 12 }}>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 10,
                height: 46,
                borderRadius: 16,
                border: "1px solid rgba(239,68,68,0.18)",
                background: "rgba(239,68,68,0.08)",
                color: "rgb(248,113,113)",
                fontSize: 15,
                fontWeight: 600,
                padding: "0 14px",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>⨯</span>
              <span>Abmelden</span>
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SettingsMenuPopover({
  open,
  shown,
  onClose,
  onOpenGoogleSetup,
  googleSetupAlertCount = 0,
}: {
  open: boolean;
  shown: boolean;
  onClose: () => void;
  onOpenGoogleSetup: () => void;
  googleSetupAlertCount?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const day = new Date().getDate();
  const showGoogleSetupAlert = googleSetupAlertCount > 0;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1190, isolation: "isolate" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "transparent" }} />

      <div
        style={{
          position: "absolute",
          top: 72,
          right: 78,
          width: 270,
          maxWidth: "calc(100vw - 24px)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.10)",
          background:
            "linear-gradient(180deg, rgba(28,28,31,0.98) 0%, rgba(18,19,22,0.98) 100%)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.44)",
          overflow: "hidden",
          transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
          opacity: shown ? 1 : 0,
          transformOrigin: "top right",
          transition: "transform 180ms ease, opacity 180ms ease",
          backdropFilter: "blur(18px)",
        }}
      >
        <div style={{ padding: 10 }}>
          <button
            type="button"
            onClick={onOpenGoogleSetup}
            className="block w-full rounded-2xl border border-white/10 bg-white/[0.04] text-left transition hover:bg-white/[0.07]"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
              }}
            >
              <GoogleCalendarMark day={day} />

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.96)",
                      lineHeight: 1.2,
                    }}
                  >
                    Google Setup
                  </div>

                  {showGoogleSetupAlert ? (
                    <BrandBadge count={googleSetupAlertCount} tone="blue" />
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "rgba(247,247,245,0.58)",
                    lineHeight: 1.2,
                  }}
                >
                  Google Kalender verbinden
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function TopNav({
  userLabel,
  userEmail,
  rightSlot,
  tenantId,
  currentUserId,
  reminderCount = 0,
  waitlistCount = 0,
  googleSetupAlertCount = 0,
}: {
  userLabel?: string;
  userEmail?: string | null;
  rightSlot?: React.ReactNode;
  tenantId: string | null;
  currentUserId: string;
  reminderCount?: number;
  waitlistCount?: number;
  googleSetupAlertCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [unreadCount, setUnreadCount] = useState(0);
  const [liveReminderCount, setLiveReminderCount] = useState(reminderCount);
  const [liveWaitlistCount, setLiveWaitlistCount] = useState(waitlistCount);

  const [chatPulse, setChatPulse] = useState(false);
  const [reminderPulse, setReminderPulse] = useState(false);
  const [waitlistPulse, setWaitlistPulse] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuShown, setUserMenuShown] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsMenuShown, setSettingsMenuShown] = useState(false);
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  const previousChatCount = useRef(0);
  const previousReminderCount = useRef(reminderCount);
  const previousWaitlistCount = useRef(waitlistCount);
  const avatarTheme = getAvatarTheme(userLabel);
  const logoRingColor = "#D6C3A3";

  const storageKey = useMemo(() => {
    if (!tenantId || !currentUserId) return null;
    return `team-chat:last-read:${tenantId}:${currentUserId}`;
  }, [tenantId, currentUserId]);

  useEffect(() => {
    setLiveReminderCount(reminderCount);
    previousReminderCount.current = reminderCount;
  }, [reminderCount]);

  useEffect(() => {
    setLiveWaitlistCount(waitlistCount);
    previousWaitlistCount.current = waitlistCount;
  }, [waitlistCount]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const t = window.setTimeout(() => setUserMenuShown(true), 10);
    return () => window.clearTimeout(t);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    const t = window.setTimeout(() => setSettingsMenuShown(true), 10);
    return () => window.clearTimeout(t);
  }, [settingsMenuOpen]);

  useEffect(() => {
    const styleId = "topnav-badge-pulse-style";

    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      @keyframes topnavBadgePulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.18); }
        100% { transform: scale(1); }
      }
    `;

    document.head.appendChild(style);

    return () => {
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUnreadCount() {
      if (!storageKey || !currentUserId) {
        if (!cancelled) setUnreadCount(0);
        return;
      }

      try {
        const lastReadMessageId =
          typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

        const res = await fetch("/api/chat/messages", { cache: "no-store" });

        if (!res.ok) {
          if (!cancelled) setUnreadCount(0);
          return;
        }

        const json = await res.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];

        const messages: ChatMessageRow[] = rows.map((row: any) => ({
          id: String(row.id),
          sender_id: String(row.sender_id),
          created_at: String(row.created_at),
        }));

        let count = 0;

        if (!lastReadMessageId) {
          count = messages.filter((m) => m.sender_id !== currentUserId).length;
        } else {
          const lastReadIndex = messages.findIndex((m) => m.id === lastReadMessageId);

          if (lastReadIndex < 0) {
            count = messages.filter((m) => m.sender_id !== currentUserId).length;
          } else {
            count = messages
              .slice(lastReadIndex + 1)
              .filter((m) => m.sender_id !== currentUserId).length;
          }
        }

        const chatOpen = searchParams?.get("openChat") === "1";
        const finalCount =
          pathname?.startsWith("/dashboard/chat") || chatOpen ? 0 : count;

        if (finalCount > previousChatCount.current) {
          setChatPulse(true);
          setTimeout(() => setChatPulse(false), 3000);
        }

        previousChatCount.current = finalCount;

        if (!cancelled) setUnreadCount(finalCount);
      } catch (error) {
        console.error("[topnav] unread count failed", error);
        if (!cancelled) setUnreadCount(0);
      }
    }

    loadUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadUnreadCount();
      }
    }, 3000);

    const onFocus = () => loadUnreadCount();

    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) loadUnreadCount();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey, currentUserId, pathname, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadReminderCount() {
      try {
        const res = await fetch("/api/reminders/count", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const nextCount = Number(json?.count ?? 0);

        if (nextCount > previousReminderCount.current) {
          setReminderPulse(true);
          setTimeout(() => setReminderPulse(false), 3000);
        }

        previousReminderCount.current = nextCount;
        if (!cancelled) setLiveReminderCount(nextCount);
      } catch (error) {
        console.error("[topnav] reminder count failed", error);
      }
    }

    loadReminderCount();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadReminderCount();
    }, 3000);

    const onFocus = () => loadReminderCount();

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWaitlistCount() {
      try {
        const res = await fetch("/api/waitlist/count", { cache: "no-store" });
        if (!res.ok) return;

        const json = await res.json();
        const nextCount = Number(json?.count ?? 0);

        if (nextCount > previousWaitlistCount.current) {
          setWaitlistPulse(true);
          setTimeout(() => setWaitlistPulse(false), 3000);
        }

        previousWaitlistCount.current = nextCount;
        if (!cancelled) setLiveWaitlistCount(nextCount);
      } catch (error) {
        console.error("[topnav] waitlist count failed", error);
      }
    }

    loadWaitlistCount();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadWaitlistCount();
    }, 3000);

    const onFocus = () => loadWaitlistCount();

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const baseTitle = "Clientique";
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);

  function openChat() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openChat", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openReminders() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openReminders", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openWaitlist() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openWaitlist", "1");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function closeUserMenu() {
    setUserMenuShown(false);
    window.setTimeout(() => setUserMenuOpen(false), 160);
  }

  function closeSettingsMenu() {
    setSettingsMenuShown(false);
    window.setTimeout(() => setSettingsMenuOpen(false), 160);
  }

  function toggleSettingsMenu() {
    if (settingsMenuOpen) {
      closeSettingsMenu();
      return;
    }

    setUserMenuShown(false);
    setUserMenuOpen(false);
    setSettingsMenuOpen(true);
  }

  function openGoogleSetup() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openGoogleSetup", "1");
    params.delete("success");
    params.delete("error");
    params.delete("link");
    const qs = params.toString();
    closeSettingsMenu();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const reminderOpen = searchParams?.get("openReminders") === "1";
  const waitlistOpen = searchParams?.get("openWaitlist") === "1";
  const googleSetupActive =
    pathname?.startsWith("/calendar/google") || searchParams?.get("openGoogleSetup") === "1";
  const showGoogleSetupAlert = googleSetupAlertCount > 0;

  const pillClass =
    "clientique-nav-pill inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[rgba(255,255,255,0.08)] hover:bg-white/[0.04] hover:text-[var(--text)]";

  return (
    <div className="clientique-topbar sticky top-0 z-40">
      <div className="mx-auto flex h-[74px] max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:gap-6">
          <Link
            href="/dashboard"
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            aria-label="Dashboard"
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            onFocus={() => setLogoHovered(true)}
            onBlur={() => setLogoHovered(false)}
            style={{
              transition: "transform 180ms ease, box-shadow 180ms ease",
              transform: logoHovered ? "scale(1.05)" : "scale(1)",
              boxShadow: logoHovered
                ? `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${logoRingColor}, 0 0 24px rgba(214,195,163,0.28)`
                : `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${logoRingColor}`,
            }}
          >
            <span
              className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111216]"
              style={{
                transform: logoHovered ? "scale(1.05)" : "scale(1)",
                transition: "transform 180ms ease",
              }}
            >
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#0d0d10] [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
                <Logo showText={false} />
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((item) => {
              const isChat = item.href === "/dashboard/chat";
              const active = isChat
                ? pathname?.startsWith("/dashboard/chat") || searchParams?.get("openChat") === "1"
                : item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname?.startsWith(item.href);

              const commonClass = cn(
                pillClass,
                active && "clientique-nav-pill-active"
              );

              const content = (
                <span className="inline-flex items-center gap-2.5">
                  {item.label}
                  {isChat && unreadCount > 0 ? <BrandBadge count={unreadCount} pulse={chatPulse} /> : null}
                </span>
              );

              if (isChat) {
                return (
                  <button key={item.href} type="button" onClick={openChat} className={commonClass}>
                    {content}
                  </button>
                );
              }

              return (
                <Link key={item.href} href={item.href} className={commonClass}>
                  {content}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={openReminders}
              className={cn(pillClass, reminderOpen && "clientique-nav-pill-active")}
            >
              <span className="inline-flex items-center gap-2.5">
                Reminder
                {liveReminderCount > 0 ? <BrandBadge count={liveReminderCount} pulse={reminderPulse} /> : null}
              </span>
            </button>

            <button
              type="button"
              onClick={openWaitlist}
              className={cn(pillClass, waitlistOpen && "clientique-nav-pill-active")}
            >
              <span className="inline-flex items-center gap-2.5">
                Warteliste
                {liveWaitlistCount > 0 ? <BrandBadge count={liveWaitlistCount} pulse={waitlistPulse} /> : null}
              </span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          {rightSlot}

          <button
            type="button"
            onClick={toggleSettingsMenu}
            className={cn(
              "relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text)]",
              (settingsMenuOpen || googleSetupActive) && "bg-[var(--primary-soft)] text-[var(--text)]"
            )}
            aria-label="Einstellungen"
            title="Einstellungen"
          >
            <SettingsIcon />
            {showGoogleSetupAlert ? (
              <span style={{ position: "absolute", top: "-7px", right: "-7px" }}>
                <BrandBadge count={googleSetupAlertCount} />
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              closeSettingsMenu();
              setUserMenuOpen(true);
            }}
            onMouseEnter={() => setAvatarHovered(true)}
            onMouseLeave={() => setAvatarHovered(false)}
            onFocus={() => setAvatarHovered(true)}
            onBlur={() => setAvatarHovered(false)}
            className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
            style={{
              transition: "transform 180ms ease, box-shadow 180ms ease",
              transform: avatarHovered ? "scale(1.04)" : "scale(1)",
              boxShadow: avatarHovered
                ? `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${avatarTheme.color}, 0 0 16px ${avatarTheme.border}`
                : `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${avatarTheme.color}`,
            }}
            aria-label="Benutzermenü öffnen"
          >
            <span
              className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111216]"
              style={{
                transform: avatarHovered ? "scale(1.05)" : "scale(1)",
                transition: "transform 180ms ease",
              }}
            >
              <img
                src={`/users/${currentUserId}.png`}
                alt="Benutzerfoto"
                className="block h-full w-full object-cover"
              />
            </span>
          </button>
        </div>
      </div>

      <SettingsMenuPopover
        open={settingsMenuOpen}
        shown={settingsMenuShown}
        onClose={closeSettingsMenu}
        onOpenGoogleSetup={openGoogleSetup}
        googleSetupAlertCount={googleSetupAlertCount}
      />

      <UserMenuPopover
        open={userMenuOpen}
        shown={userMenuShown}
        onClose={closeUserMenu}
        userLabel={userLabel}
        userEmail={userEmail}
        currentUserId={currentUserId}
      />
    </div>
  );
}

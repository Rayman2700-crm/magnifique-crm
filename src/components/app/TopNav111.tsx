"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/Logo";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Kunden" },
  { href: "/calendar", label: "Kalender" },
  { href: "/services", label: "Dienstleistungen" },
  { href: "/dashboard/chat", label: "Team Chat" },
];

type ChatMessageRow = {
  id: string;
  sender_id: string;
  created_at: string;
};

function getAvatarRingColor(userLabel?: string, currentUserId?: string) {
  const normalized = `${userLabel ?? ""} ${currentUserId ?? ""}`.trim().toLowerCase();

  if (normalized.includes("radu")) {
    return "#3F51B5";
  }

  if (normalized.includes("raluca")) {
    return "#7B1FA2";
  }

  if (normalized.includes("alexandra")) {
    return "#0A8F08";
  }

  if (normalized.includes("barbara")) {
    return "#F57C00";
  }

  return "#3F51B5";
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
        borderRadius: 7,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "#ffffff",
        boxShadow: "0 8px 18px rgba(0,0,0,0.28)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 7,
          background: "#4285F4",
        }}
      />
      <div
        style={{
          height: 23,
          display: "grid",
          gridTemplateColumns: "6px 1fr",
        }}
      >
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
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 62,
          right: 24,
          width: 290,
          maxWidth: "calc(100vw - 24px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background:
            "linear-gradient(180deg, rgba(58,58,64,0.98) 0%, rgba(24,24,28,0.98) 42%, rgba(18,18,22,0.98) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
          transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
          opacity: shown ? 1 : 0,
          transformOrigin: "top right",
          transition: "transform 180ms ease, opacity 180ms ease",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            gap: 12,
            alignItems: "center",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <img
            src={`/users/${currentUserId}.png`}
            alt="Benutzerfoto"
            className="shrink-0 rounded-xl border border-white/10 object-cover"
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              maxWidth: 44,
              maxHeight: 44,
            }}
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
                marginTop: 3,
                fontSize: 13,
                color: "rgba(255,255,255,0.56)",
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
                height: 44,
                borderRadius: 12,
                border: "1px solid rgba(239,68,68,0.18)",
                background: "rgba(239,68,68,0.08)",
                color: "rgb(248,113,113)",
                fontSize: 15,
                fontWeight: 600,
                padding: "0 14px",
                cursor: "pointer",
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
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 62,
          right: 78,
          width: 260,
          maxWidth: "calc(100vw - 24px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background:
            "linear-gradient(180deg, rgba(58,58,64,0.98) 0%, rgba(24,24,28,0.98) 42%, rgba(18,18,22,0.98) 100%)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
          transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)",
          opacity: shown ? 1 : 0,
          transformOrigin: "top right",
          transition: "transform 180ms ease, opacity 180ms ease",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ padding: 10 }}>
          <button
            type="button"
            onClick={onOpenGoogleSetup}
            className="block w-full rounded-xl border border-white/8 bg-white/5 text-left transition hover:bg-white/10"
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
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
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "22px",
                        height: "22px",
                        padding: "0 7px",
                        borderRadius: "999px",
                        background: "#2563eb",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 700,
                        lineHeight: "22px",
                        boxShadow:
                          "0 0 0 2px rgba(0,0,0,0.85), 0 0 12px rgba(37,99,235,0.55)",
                      }}
                    >
                      {googleSetupAlertCount > 99 ? "99+" : googleSetupAlertCount}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.58)",
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
  const avatarRingColor = getAvatarRingColor(userLabel, currentUserId);
  const logoRingColor = "#D4AF37";

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
      if (e.key === storageKey) {
        loadUnreadCount();
      }
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
      if (document.visibilityState === "visible") {
        loadReminderCount();
      }
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
      if (document.visibilityState === "visible") {
        loadWaitlistCount();
      }
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
    const baseTitle = "MBI CRM";

    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
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

  return (
    <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-black/60 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 rounded-full">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            aria-label="Dashboard"
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            onFocus={() => setLogoHovered(true)}
            onBlur={() => setLogoHovered(false)}
            style={{
              transition: "transform 180ms ease, box-shadow 180ms ease",
              transform: logoHovered ? "scale(1.05)" : "scale(1)",
              boxShadow: logoHovered
                ? `0 0 0 3px ${logoRingColor}, 0 0 18px rgba(212,175,55,0.32)`
                : `0 0 0 3px ${logoRingColor}`,
              background: "transparent",
            }}
          >
            <span
              className="block h-full w-full overflow-hidden rounded-full border-2 border-[#101014]"
              style={{
                transform: logoHovered ? "scale(1.06)" : "scale(1)",
                transition: "transform 180ms ease",
                transformOrigin: "center center",
                willChange: "transform",
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
                "rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-white/10 font-medium text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              );

              const content = (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  {item.label}

                  {isChat && unreadCount > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "22px",
                        height: "22px",
                        padding: "0 7px",
                        borderRadius: "999px",
                        background: "#2563eb",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 700,
                        lineHeight: "22px",
                        boxShadow:
                          "0 0 0 2px rgba(0,0,0,0.85), 0 0 12px rgba(37,99,235,0.55)",
                        transform: chatPulse ? "scale(1.08)" : "scale(1)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        animation: chatPulse ? "topnavBadgePulse 0.9s ease-in-out 3" : "none",
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
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
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition",
                reminderOpen
                  ? "bg-white/10 font-medium text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                Reminder

                {liveReminderCount > 0 ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "22px",
                      height: "22px",
                      padding: "0 7px",
                      borderRadius: "999px",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      lineHeight: "22px",
                      boxShadow:
                        "0 0 0 2px rgba(0,0,0,0.85), 0 0 12px rgba(37,99,235,0.55)",
                      transform: reminderPulse ? "scale(1.08)" : "scale(1)",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                      animation: reminderPulse ? "topnavBadgePulse 0.9s ease-in-out 3" : "none",
                    }}
                  >
                    {liveReminderCount > 99 ? "99+" : liveReminderCount}
                  </span>
                ) : null}
              </span>
            </button>

            <button
              type="button"
              onClick={openWaitlist}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition",
                waitlistOpen
                  ? "bg-white/10 font-medium text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                Warteliste

                {liveWaitlistCount > 0 ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "22px",
                      height: "22px",
                      padding: "0 7px",
                      borderRadius: "999px",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      lineHeight: "22px",
                      boxShadow:
                        "0 0 0 2px rgba(0,0,0,0.85), 0 0 12px rgba(37,99,235,0.55)",
                      transform: waitlistPulse ? "scale(1.08)" : "scale(1)",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                      animation: waitlistPulse ? "topnavBadgePulse 0.9s ease-in-out 3" : "none",
                    }}
                  >
                    {liveWaitlistCount > 99 ? "99+" : liveWaitlistCount}
                  </span>
                ) : null}
              </span>
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {rightSlot}

          <button
            type="button"
            onClick={toggleSettingsMenu}
            className={cn(
              "relative rounded-lg px-3 py-2 text-sm transition",
              settingsMenuOpen || googleSetupActive
                ? "bg-white/10 font-medium text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
            aria-label="Einstellungen"
            title="Einstellungen"
          >
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <SettingsIcon />
            </span>

            {showGoogleSetupAlert ? (
              <span
                style={{
                  position: "absolute",
                  top: "-7px",
                  right: "-7px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "22px",
                  height: "22px",
                  padding: "0 7px",
                  borderRadius: "999px",
                  background: "#2563eb",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 700,
                  lineHeight: "22px",
                  boxShadow:
                    "0 0 0 2px rgba(0,0,0,0.85), 0 0 12px rgba(37,99,235,0.55)",
                }}
              >
                {googleSetupAlertCount > 99 ? "99+" : googleSetupAlertCount}
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
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full cursor-pointer"
            style={{
              transition: "transform 180ms ease, box-shadow 180ms ease",
              transform: avatarHovered ? "scale(1.05)" : "scale(1)",
              boxShadow: avatarHovered
                ? `0 0 0 3px ${avatarRingColor}, 0 0 0 6px rgba(255,255,255,0.14)`
                : `0 0 0 3px ${avatarRingColor}, 0 0 0 6px rgba(255,255,255,0.08)`,
              background: "transparent",
              cursor: "pointer",
            }}
            aria-label="Benutzermenü öffnen"
          >
            <span
              className="block h-full w-full overflow-hidden rounded-full border-2 border-[#101014]"
              style={{
                transform: avatarHovered ? "scale(1.06)" : "scale(1)",
                transition: "transform 180ms ease",
                transformOrigin: "center center",
                willChange: "transform",
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

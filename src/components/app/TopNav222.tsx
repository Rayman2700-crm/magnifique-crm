"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/Logo";
import { tenantTheme } from "@/lib/theme/tenantTheme";

const nav = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
  { href: "/customers", label: "Kunden", key: "customers" },
  { href: "/services", label: "Dienstleistungen", key: "services" },
  { href: "/rechnungen", label: "Rechnungen", key: "receipts" },
  { href: "/dashboard/chat", label: "Team Chat", key: "chat" },
  { href: "#reminders", label: "Reminder", key: "reminders" },
  { href: "#waitlist", label: "Warteliste", key: "waitlist" },
] as const;

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
    return normalized.includes(key);
  });

  return includesKey ? tenantTheme[includesKey as keyof typeof tenantTheme] : tenantTheme.Radu;
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a3 3 0 0 1 0 5.74" />
    </svg>
  );
}

function ServicesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 10v4" />
      <path d="M17 10v4" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h8l4 4v13l-2.25-1.5L14.5 20 12 18.5 9.5 20 7.25 18.5 5 20V5a2 2 0 0 1 2-2Z" />
      <path d="M15 3v5h5" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 7.1a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.34.11.51.11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function GoogleCalendarMark({ day }: { day: number }) {
  return (
    <div aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "#ffffff", boxShadow: "0 10px 24px rgba(0,0,0,0.18)", flexShrink: 0 }}>
      <div style={{ height: 6, background: "#4285F4" }} />
      <div style={{ height: 20, display: "grid", gridTemplateColumns: "5px 1fr" }}>
        <div style={{ background: "#34A853" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "#4285F4", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)" }} />
          {day}
        </div>
      </div>
    </div>
  );
}

function BrandBadge({ count, pulse = false }: { count: number; pulse?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "20px",
        height: "20px",
        padding: "0 6px",
        borderRadius: "999px",
        background: "#2563eb",
        color: "#fff",
        fontSize: "11px",
        fontWeight: 700,
        lineHeight: "20px",
        boxShadow: "0 0 0 2px rgba(11,11,12,0.82), 0 0 12px rgba(37,99,235,0.42)",
        transform: pulse ? "scale(1.08)" : "scale(1)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        animation: pulse ? "topnavBadgePulse 0.9s ease-in-out 3" : "none",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function UserMenuPopover({ open, shown, onClose, userLabel, userEmail, currentUserId }: { open: boolean; shown: boolean; onClose: () => void; userLabel?: string; userEmail?: string | null; currentUserId: string; }) {
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
      <div style={{ position: "absolute", top: 14, right: 16, width: 280, maxWidth: "calc(100vw - 24px)", borderRadius: 22, border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(180deg, rgba(28,28,31,0.98) 0%, rgba(18,19,22,0.98) 100%)", boxShadow: "0 24px 70px rgba(0,0,0,0.44)", overflow: "hidden", transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)", opacity: shown ? 1 : 0, transformOrigin: "top right", transition: "transform 180ms ease, opacity 180ms ease", backdropFilter: "blur(18px)" }}>
        <div style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <img src={`/users/${currentUserId}.png`} alt="Benutzerfoto" className="shrink-0 rounded-xl border border-white/10 object-cover" style={{ width: 42, height: 42 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.96)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userLabel ?? "Benutzer"}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "rgba(247,247,245,0.56)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail ?? "—"}</div>
          </div>
        </div>
        <div style={{ padding: 8 }}>
          <form action="/auth/sign-out" method="post">
            <button type="submit" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "flex-start", gap: 10, height: 42, borderRadius: 16, border: "1px solid rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.08)", color: "rgb(248,113,113)", fontSize: 15, fontWeight: 600, padding: "0 14px" }}>
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

function SettingsMenuPopover({ open, shown, onClose, onOpenGoogleSetup, googleSetupAlertCount = 0 }: { open: boolean; shown: boolean; onClose: () => void; onOpenGoogleSetup: () => void; googleSetupAlertCount?: number; }) {
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
      <div style={{ position: "absolute", top: 14, right: 68, width: 248, maxWidth: "calc(100vw - 24px)", borderRadius: 22, border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(180deg, rgba(28,28,31,0.98) 0%, rgba(18,19,22,0.98) 100%)", boxShadow: "0 24px 70px rgba(0,0,0,0.44)", overflow: "hidden", transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.98)", opacity: shown ? 1 : 0, transformOrigin: "top right", transition: "transform 180ms ease, opacity 180ms ease", backdropFilter: "blur(18px)" }}>
        <div style={{ padding: 8 }}>
          <button type="button" onClick={onOpenGoogleSetup} className="block w-full rounded-xl border border-white/10 bg-white/[0.04] text-left transition hover:bg-white/[0.07]">
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
              <GoogleCalendarMark day={day} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.96)", lineHeight: 1.2 }}>Google Setup</div>
                  {showGoogleSetupAlert ? <BrandBadge count={googleSetupAlertCount} /> : null}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "rgba(247,247,245,0.58)", lineHeight: 1.2 }}>Google Kalender verbinden</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MobileNavDrawer({ open, shown, onClose, pathname, openChat, openReminders, openWaitlist, unreadCount, liveReminderCount, liveWaitlistCount, chatPulse, reminderPulse, waitlistPulse }: { open: boolean; shown: boolean; onClose: () => void; pathname: string | null; openChat: () => void; openReminders: () => void; openWaitlist: () => void; unreadCount: number; liveReminderCount: number; liveWaitlistCount: number; chatPulse: boolean; reminderPulse: boolean; waitlistPulse: boolean; }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
  if (!mounted || !open || typeof document === "undefined") return null;

  const itemClass = "flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left text-sm font-medium text-white/90 transition hover:bg-white/[0.08]";
  const isActive = (href: string) => href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1180, isolation: "isolate" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)", opacity: shown ? 1 : 0, transition: "opacity 200ms ease" }} />
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "min(360px, calc(100vw - 20px))", transform: shown ? "translateX(0)" : "translateX(-24px)", opacity: shown ? 1 : 0, transition: "transform 220ms ease, opacity 220ms ease", borderRight: "1px solid rgba(255,255,255,0.08)", background: "rgb(9,9,11)", color: "white", boxShadow: "12px 0 40px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Navigation</div>
            <div className="mt-1 text-base font-semibold text-white">Clientique Menü</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/80" aria-label="Menü schließen">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {nav.slice(0, 4).map((item) => (
            <Link key={item.key} href={item.href} onClick={onClose} className={cn(itemClass, isActive(item.href) && "border-white/20 bg-white/[0.08]")}>{item.label}</Link>
          ))}
          <button type="button" onClick={() => { onClose(); openChat(); }} className={cn(itemClass, pathname?.startsWith("/dashboard/chat") && "border-white/20 bg-white/[0.08]")}>
            <span>Team Chat</span>{unreadCount > 0 ? <BrandBadge count={unreadCount} pulse={chatPulse} /> : null}
          </button>
          <button type="button" onClick={() => { onClose(); openReminders(); }} className={itemClass}><span>Reminder</span>{liveReminderCount > 0 ? <BrandBadge count={liveReminderCount} pulse={reminderPulse} /> : null}</button>
          <button type="button" onClick={() => { onClose(); openWaitlist(); }} className={itemClass}><span>Warteliste</span>{liveWaitlistCount > 0 ? <BrandBadge count={liveWaitlistCount} pulse={waitlistPulse} /> : null}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SidebarItem({ icon, label, active = false, badgeCount = 0, pulse = false, expanded, href, onClick, divider = false }: { icon: React.ReactNode; label: string; active?: boolean; badgeCount?: number; pulse?: boolean; expanded: boolean; href?: string; onClick?: () => void; divider?: boolean; }) {
  const content = (
    <>
      <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", active ? "border-[rgba(214,195,163,0.24)] bg-[var(--primary-soft)] text-[var(--text)]" : "border-white/10 bg-white/[0.03] text-white/72 group-hover:bg-white/[0.06] group-hover:text-white")}>{icon}
        {badgeCount > 0 && !expanded ? (
          <span className="absolute -right-1 -top-1"><BrandBadge count={badgeCount} pulse={pulse} /></span>
        ) : null}
      </span>
      <span className={cn("flex min-w-0 items-center justify-between overflow-hidden transition-all duration-200", expanded ? "ml-2.5 w-[112px] opacity-100" : "ml-0 w-0 opacity-0") }>
        <span className="truncate text-sm font-medium">{label}</span>
        {badgeCount > 0 ? <BrandBadge count={badgeCount} pulse={pulse} /> : null}
      </span>
    </>
  );

  const className = cn("group flex h-10 items-center rounded-xl px-1.5 text-left", divider && "mt-3 pt-3 border-t border-white/8");
  if (href) return <Link href={href} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} className={cn(className, "w-full")}>{content}</button>;
}

export function TopNav({ userLabel, userEmail, rightSlot, tenantId, currentUserId, reminderCount = 0, waitlistCount = 0, googleSetupAlertCount = 0 }: { userLabel?: string; userEmail?: string | null; rightSlot?: React.ReactNode; tenantId: string | null; currentUserId: string; reminderCount?: number; waitlistCount?: number; googleSetupAlertCount?: number; }) {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuShown, setMobileMenuShown] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const previousChatCount = useRef(0);
  const previousReminderCount = useRef(reminderCount);
  const previousWaitlistCount = useRef(waitlistCount);
  const avatarTheme = getAvatarTheme(userLabel);
  const storageKey = useMemo(() => {
    if (!tenantId || !currentUserId) return null;
    return `team-chat:last-read:${tenantId}:${currentUserId}`;
  }, [tenantId, currentUserId]);

  useEffect(() => { setLiveReminderCount(reminderCount); previousReminderCount.current = reminderCount; }, [reminderCount]);
  useEffect(() => { setLiveWaitlistCount(waitlistCount); previousWaitlistCount.current = waitlistCount; }, [waitlistCount]);
  useEffect(() => { if (!userMenuOpen) return; const t = window.setTimeout(() => setUserMenuShown(true), 10); return () => window.clearTimeout(t); }, [userMenuOpen]);
  useEffect(() => { if (!settingsMenuOpen) return; const t = window.setTimeout(() => setSettingsMenuShown(true), 10); return () => window.clearTimeout(t); }, [settingsMenuOpen]);
  useEffect(() => { if (!mobileMenuOpen) return; const t = window.setTimeout(() => setMobileMenuShown(true), 10); return () => window.clearTimeout(t); }, [mobileMenuOpen]);
  useEffect(() => {
    const styleId = "topnav-badge-pulse-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `@keyframes topnavBadgePulse {0%{transform:scale(1)}50%{transform:scale(1.18)}100%{transform:scale(1)}}`;
    document.head.appendChild(style);
    return () => document.getElementById(styleId)?.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadUnreadCount() {
      if (!storageKey || !currentUserId) {
        if (!cancelled) setUnreadCount(0);
        return;
      }
      try {
        const lastReadMessageId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
        const res = await fetch("/api/chat/messages", { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setUnreadCount(0); return; }
        const json = await res.json();
        const rows = Array.isArray(json?.messages) ? json.messages : [];
        const messages: ChatMessageRow[] = rows.map((row: any) => ({ id: String(row.id), sender_id: String(row.sender_id), created_at: String(row.created_at) }));
        let count = 0;
        if (!lastReadMessageId) count = messages.filter((m) => m.sender_id !== currentUserId).length;
        else {
          const lastReadIndex = messages.findIndex((m) => m.id === lastReadMessageId);
          count = lastReadIndex < 0 ? messages.filter((m) => m.sender_id !== currentUserId).length : messages.slice(lastReadIndex + 1).filter((m) => m.sender_id !== currentUserId).length;
        }
        const chatOpen = searchParams?.get("openChat") === "1";
        const finalCount = pathname?.startsWith("/dashboard/chat") || chatOpen ? 0 : count;
        if (finalCount > previousChatCount.current) { setChatPulse(true); setTimeout(() => setChatPulse(false), 3000); }
        previousChatCount.current = finalCount;
        if (!cancelled) setUnreadCount(finalCount);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }
    loadUnreadCount();
    const interval = setInterval(() => { if (document.visibilityState === "visible") loadUnreadCount(); }, 3000);
    const onFocus = () => loadUnreadCount();
    const onStorage = (e: StorageEvent) => { if (e.key === storageKey) loadUnreadCount(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", onFocus); window.removeEventListener("storage", onStorage); };
  }, [storageKey, currentUserId, pathname, searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadReminderCount() {
      try {
        const res = await fetch("/api/reminders/count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const nextCount = Number(json?.count ?? 0);
        if (nextCount > previousReminderCount.current) { setReminderPulse(true); setTimeout(() => setReminderPulse(false), 3000); }
        previousReminderCount.current = nextCount;
        if (!cancelled) setLiveReminderCount(nextCount);
      } catch {}
    }
    loadReminderCount();
    const interval = setInterval(() => { if (document.visibilityState === "visible") loadReminderCount(); }, 3000);
    const onFocus = () => loadReminderCount();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWaitlistCount() {
      try {
        const res = await fetch("/api/waitlist/count", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const nextCount = Number(json?.count ?? 0);
        if (nextCount > previousWaitlistCount.current) { setWaitlistPulse(true); setTimeout(() => setWaitlistPulse(false), 3000); }
        previousWaitlistCount.current = nextCount;
        if (!cancelled) setLiveWaitlistCount(nextCount);
      } catch {}
    }
    loadWaitlistCount();
    const interval = setInterval(() => { if (document.visibilityState === "visible") loadWaitlistCount(); }, 3000);
    const onFocus = () => loadWaitlistCount();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    const baseTitle = "Clientique";
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);

  function openChat() { const params = new URLSearchParams(searchParams?.toString() ?? ""); params.set("openChat", "1"); const qs = params.toString(); router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }); }
  function openReminders() { const params = new URLSearchParams(searchParams?.toString() ?? ""); params.set("openReminders", "1"); const qs = params.toString(); router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }); }
  function openWaitlist() { const params = new URLSearchParams(searchParams?.toString() ?? ""); params.set("openWaitlist", "1"); const qs = params.toString(); router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }); }
  function closeUserMenu() { setUserMenuShown(false); window.setTimeout(() => setUserMenuOpen(false), 160); }
  function closeSettingsMenu() { setSettingsMenuShown(false); window.setTimeout(() => setSettingsMenuOpen(false), 160); }
  function closeMobileMenu() { setMobileMenuShown(false); window.setTimeout(() => setMobileMenuOpen(false), 160); }
  function toggleSettingsMenu() { if (settingsMenuOpen) { closeSettingsMenu(); return; } closeMobileMenu(); setUserMenuShown(false); setUserMenuOpen(false); setSettingsMenuOpen(true); }
  function openGoogleSetup() { const params = new URLSearchParams(searchParams?.toString() ?? ""); params.set("openGoogleSetup", "1"); params.delete("success"); params.delete("error"); params.delete("link"); const qs = params.toString(); closeSettingsMenu(); router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }); }

  const googleSetupActive = pathname?.startsWith("/calendar/google") || searchParams?.get("openGoogleSetup") === "1";
  const showGoogleSetupAlert = googleSetupAlertCount > 0;
  const isActive = (href: string) => href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);

return (
  <>
<aside
  className={cn(
    "clientique-sidebar-rail fixed inset-y-0 left-0 z-50 border-r border-white/8 bg-[rgba(10,10,11,0.86)] backdrop-blur-xl transition-[width] duration-200",
    expanded ? "w-[216px]" : "w-[68px]"
  )}
  onMouseEnter={() => setExpanded(true)}
  onMouseLeave={() => setExpanded(false)}
>
  <div className="flex h-full flex-col px-2 pb-3">
    
<div className="flex h-[60px] items-center">
      <button
        type="button"
        onClick={() => {
          closeSettingsMenu();
          closeMobileMenu();
          setUserMenuOpen(true);
        }}
        className="flex h-10 w-full items-center justify-center rounded-xl px-2 text-left md:hidden"
        aria-label="Benutzermenü öffnen"
      >
        <span
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ boxShadow: `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${avatarTheme.color}` }}
        >
          <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111216]">
            <img
              src={`/users/${currentUserId}.png`}
              alt="Benutzerfoto"
              className="block h-full w-full object-cover"
            />
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="hidden h-10 w-full items-center rounded-xl px-2 text-left md:flex"
        aria-label="Sidebar ein- oder ausklappen"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#111216] shadow-[0_0_0_2px_rgba(11,11,12,0.95),0_0_0_4px_#D6C3A3]">
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#0d0d10] [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
            <Logo showText={false} />
          </span>
        </span>

        <span
          className={cn(
            "overflow-hidden transition-all duration-200",
            expanded ? "ml-2.5 w-[112px] opacity-100" : "ml-0 w-0 opacity-0"
          )}
        >
          <span className="flex h-10 flex-col justify-center leading-tight">
            <span className="block text-sm font-semibold text-white">Magnifique CRM</span>
            <span className="block text-xs text-white/45">Navigation</span>
          </span>
        </span>
      </button>
    </div>

    <div className="clientique-scrollbar flex-1 overflow-y-auto pr-1">
      <div className="space-y-1">
        <SidebarItem icon={<HomeIcon />} label="Dashboard" href="/dashboard" active={isActive("/dashboard")} expanded={expanded} />
        <SidebarItem icon={<UsersIcon />} label="Kunden" href="/customers" active={isActive("/customers")} expanded={expanded} />
        <SidebarItem icon={<ServicesIcon />} label="Dienstleistungen" href="/services" active={isActive("/services")} expanded={expanded} />
        <SidebarItem icon={<ReceiptIcon />} label="Rechnungen" href="/rechnungen" active={isActive("/rechnungen")} expanded={expanded} />
        <SidebarItem icon={<ChatIcon />} label="Team Chat" onClick={openChat} active={pathname?.startsWith("/dashboard/chat") || searchParams?.get("openChat") === "1"} badgeCount={unreadCount} pulse={chatPulse} expanded={expanded} />
        <SidebarItem icon={<BellIcon />} label="Reminder" onClick={openReminders} active={searchParams?.get("openReminders") === "1"} badgeCount={liveReminderCount} pulse={reminderPulse} expanded={expanded} />
        <SidebarItem icon={<ClockIcon />} label="Warteliste" onClick={openWaitlist} active={searchParams?.get("openWaitlist") === "1"} badgeCount={liveWaitlistCount} pulse={waitlistPulse} expanded={expanded} />
      </div>
    </div>

    <div className="border-t border-white/8 pt-2.5">
      <SidebarItem icon={<SettingsIcon />} label="Einstellungen" onClick={toggleSettingsMenu} active={settingsMenuOpen || googleSetupActive} badgeCount={showGoogleSetupAlert ? googleSetupAlertCount : 0} expanded={expanded} />
    </div>
  </div>
</aside>

    <div className="clientique-topbar fixed left-[64px] right-0 top-0 z-40 hidden border-b border-white/10 md:block">
      <div className="relative flex h-[60px] items-center justify-between px-2.5 sm:px-4 lg:px-6">
        <div className="pointer-events-none absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 md:hidden">
          <div className="text-center text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--primary)]">
            Clientique Dashboard
          </div>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
          {nav.slice(0, 5).map((item) => {
            const isChat = item.href === "/dashboard/chat";
            const active = isChat
              ? pathname?.startsWith("/dashboard/chat") || searchParams?.get("openChat") === "1"
              : item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname?.startsWith(item.href);

            const commonClass = cn(
              "clientique-nav-pill shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:border-[rgba(255,255,255,0.08)] hover:bg-white/[0.04] hover:text-[var(--text)]",
              active && "clientique-nav-pill-active"
            );

            const content = (
              <span className="inline-flex items-center gap-2">
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

          <button type="button" onClick={openReminders} className={cn("clientique-nav-pill shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:border-[rgba(255,255,255,0.08)] hover:bg-white/[0.04] hover:text-[var(--text)]", searchParams?.get("openReminders") === "1" && "clientique-nav-pill-active")}>
            <span className="inline-flex items-center gap-2">
              Reminder
              {liveReminderCount > 0 ? <BrandBadge count={liveReminderCount} pulse={reminderPulse} /> : null}
            </span>
          </button>

          <button type="button" onClick={openWaitlist} className={cn("clientique-nav-pill shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] hover:border-[rgba(255,255,255,0.08)] hover:bg-white/[0.04] hover:text-[var(--text)]", searchParams?.get("openWaitlist") === "1" && "clientique-nav-pill-active")}>
            <span className="inline-flex items-center gap-2">
              Warteliste
              {liveWaitlistCount > 0 ? <BrandBadge count={liveWaitlistCount} pulse={waitlistPulse} /> : null}
            </span>
          </button>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2">
          <div className="hidden md:block">{rightSlot}</div>
          <button type="button" onClick={toggleSettingsMenu} className={cn("relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[rgba(10,10,11,0.86)] text-[var(--text-muted)] backdrop-blur-xl hover:bg-white/[0.06] hover:text-[var(--text)]", (settingsMenuOpen || googleSetupActive) && "bg-[var(--primary-soft)] text-[var(--text)]")} aria-label="Einstellungen" title="Einstellungen"><SettingsIcon />{showGoogleSetupAlert ? <span style={{ position: "absolute", top: "-6px", right: "-6px" }}><BrandBadge count={googleSetupAlertCount} /></span> : null}</button>
          <button type="button" onClick={() => { closeSettingsMenu(); closeMobileMenu(); setUserMenuOpen(true); }} className="relative inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ boxShadow: `0 0 0 2px rgba(11,11,12,0.95), 0 0 0 4px ${avatarTheme.color}` }} aria-label="Benutzermenü öffnen">
            <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111216]"><img src={`/users/${currentUserId}.png`} alt="Benutzerfoto" className="block h-full w-full object-cover" /></span>
          </button>
        </div>
      </div>
    </div>

    <SettingsMenuPopover open={settingsMenuOpen} shown={settingsMenuShown} onClose={closeSettingsMenu} onOpenGoogleSetup={openGoogleSetup} googleSetupAlertCount={googleSetupAlertCount} />
    <UserMenuPopover open={userMenuOpen} shown={userMenuShown} onClose={closeUserMenu} userLabel={userLabel} userEmail={userEmail} currentUserId={currentUserId} />
  </>
);
}
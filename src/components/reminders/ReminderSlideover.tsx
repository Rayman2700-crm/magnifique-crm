"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildReminderWhatsAppUrl, tenantTheme } from "@/components/calendar/utils";
import { markReminderSent } from "@/app/calendar/actions";
import type { Item } from "@/components/calendar/types";

type ReminderItem = Item & {
  reminderAt: string | null;
};

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
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

function getButtonStyle(theme: { text: string }) {
  const text = (theme.text || "").toLowerCase();

  const isDarkText =
    text.includes("#111") ||
    text.includes("#0b") ||
    text.includes("11,11,12") ||
    text.includes("17,") ||
    text.includes("24,") ||
    text.includes("31,") ||
    text.includes("rgb(17") ||
    text.includes("rgb(24") ||
    text.includes("rgb(31");

  return {
    backgroundColor: isDarkText ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.14)",
    borderColor: isDarkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)",
    color: theme.text,
    boxShadow: isDarkText
      ? "inset 0 1px 0 rgba(255,255,255,0.20)"
      : "inset 0 1px 0 rgba(255,255,255,0.12)",
    backdropFilter: "blur(8px)",
  };
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
          top: 0,
          right: 0,
          height: "100%",
          width: "min(760px, calc(100vw - 1rem))",
          transform: shown ? "translateX(0)" : "translateX(24px)",
          opacity: shown ? 1 : 0,
          transition: "transform 220ms ease, opacity 220ms ease",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          background: "rgb(9,9,11)",
          color: "white",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <div className="text-sm text-white/55">Reminder</div>
            <div className="text-2xl font-extrabold text-white">Fällige Reminder</div>
            <div className="mt-1 text-sm text-white/55">
              {items.length === 0
                ? "Aktuell ist nichts offen."
                : `${items.length} offene Reminder`}
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {errorMsg ? (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMsg}
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/65">
              Aktuell sind keine Reminder fällig.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const theme = tenantTheme(item.tenantName ?? "");
                const buttonStyle = getButtonStyle(theme);

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-4 rounded-2xl border p-5 md:flex-row md:items-center md:justify-between"
                    style={{
                      backgroundColor: theme.bg,
                      color: theme.text,
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex min-w-[82px] flex-col justify-center">
                        <div
                          className="text-[18px] font-extrabold leading-none"
                          style={{ color: theme.text }}
                        >
                          {formatTime(item.start_at)}
                        </div>
                        <div
                          className="mt-1 text-[12px] font-medium uppercase tracking-wide"
                          style={{ color: theme.text }}
                        >
                          Termin
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div
                          className="truncate text-[18px] font-bold"
                          style={{ color: theme.text }}
                        >
                          {item.customerName ?? "Walk-in"}
                        </div>
                        <div
                          className="mt-1 truncate text-sm"
                          style={{ color: theme.text }}
                        >
                          {item.title || "Termin"}
                        </div>
                        <div
                          className="mt-1 text-sm"
                          style={{ color: theme.subText }}
                        >
                          {item.tenantName || "Behandler"} · {formatDateTime(item.start_at)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {item.customerPhone ? (
                        <>
                          {!item.reminderSentAt ? (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(item, false)}
                              disabled={isPending && pendingId === item.id}
                              className="inline-flex h-11 min-w-[148px] items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                              style={buttonStyle}
                            >
                              {isPending && pendingId === item.id ? "Sende..." : "Reminder senden"}
                            </button>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div
                                className="rounded-xl border px-4 py-3 text-sm font-semibold"
                                style={buttonStyle}
                              >
                                Reminder gesendet
                                <div className="mt-1 text-xs opacity-80">
                                  gesendet am {formatSentAt(item.reminderSentAt)}
                                </div>
                              </div>

                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleSendReminder(item, true)}
                                  disabled={isPending && pendingId === item.id}
                                  className="inline-flex h-11 min-w-[148px] items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                                  style={buttonStyle}
                                >
                                  {isPending && pendingId === item.id ? "Sende erneut..." : "Erneut senden"}
                                </button>
                              ) : null}
                            </div>
                          )}

                          <Link href={`/customers?q=${encodeURIComponent(item.customerPhone)}`}>
                            <button
                              type="button"
                              className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:scale-[1.01]"
                              style={buttonStyle}
                            >
                              Kunde öffnen
                            </button>
                          </Link>
                        </>
                      ) : (
                        <Link href="/calendar">
                          <button
                            type="button"
                            className="inline-flex h-11 min-w-[122px] items-center justify-center rounded-xl border px-4 text-sm font-semibold transition hover:scale-[1.01]"
                            style={buttonStyle}
                          >
                            Im Kalender öffnen
                          </button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
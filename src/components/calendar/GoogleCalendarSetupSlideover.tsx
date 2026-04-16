"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setDefaultCalendar } from "@/app/calendar/actions";

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

const EMPTY_IDS: string[] = [];
const STUDIO_DEFAULT_CALENDAR_ID = "radu.craus@gmail.com";

function Button({
  children,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  const className =
    variant === "secondary"
      ? "inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
      : "inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90";

  return (
    <button type={type} className={className}>
      {children}
    </button>
  );
}

function MessageCard({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const className =
    tone === "error"
      ? "rounded-3xl border border-red-500/30 bg-red-500/10 p-4"
      : "rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4";

  return <div className={className}>{children}</div>;
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sanitizeCalendarIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

export default function GoogleCalendarSetupSlideover({
  calendars,
  savedDefault,
  savedEnabled,
  loadError,
  isAdmin = false,
}: {
  calendars: CalendarListItem[];
  savedDefault: string | null;
  savedEnabled?: string[] | null;
  loadError: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [enabledIds, setEnabledIds] = useState<string[]>(EMPTY_IDS);

  const open = searchParams?.get("openGoogleSetup") === "1";
  const error = searchParams?.get("error");
  const success = searchParams?.get("success");

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openGoogleSetup", "1");
    return `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  }, [pathname, searchParams]);

  const sortedCalendars = useMemo(() => {
    return [...calendars].sort(
      (a, b) =>
        Number(!!b.primary) - Number(!!a.primary) ||
        String(a.summary ?? a.id).localeCompare(String(b.summary ?? b.id), "de")
    );
  }, [calendars]);

  const studioCalendar = useMemo(() => {
    return (
      sortedCalendars.find((calendar) => String(calendar.id).trim() === STUDIO_DEFAULT_CALENDAR_ID) ??
      sortedCalendars.find((calendar) => String(calendar.summary ?? "").trim() === STUDIO_DEFAULT_CALENDAR_ID) ?? {
        id: STUDIO_DEFAULT_CALENDAR_ID,
        summary: STUDIO_DEFAULT_CALENDAR_ID,
        accessRole: "owner",
      }
    );
  }, [sortedCalendars]);

  const normalizedSavedEnabled = useMemo(() => {
    if (!isAdmin) return [studioCalendar.id];
    return sanitizeCalendarIds([...(Array.isArray(savedEnabled) ? savedEnabled : EMPTY_IDS), studioCalendar.id]);
  }, [isAdmin, savedEnabled, studioCalendar.id]);

  const extraCalendars = useMemo(() => {
    if (!isAdmin) return [];
    return sortedCalendars.filter((calendar) => calendar.id !== studioCalendar.id);
  }, [isAdmin, sortedCalendars, studioCalendar.id]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const nextEnabled = normalizedSavedEnabled.length > 0 ? normalizedSavedEnabled : [studioCalendar.id];
    setEnabledIds((current) => (sameStringArray(current, nextEnabled) ? current : nextEnabled));
  }, [normalizedSavedEnabled, studioCalendar.id]);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }

    const t = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pathname, searchParams]);

  function close() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("openGoogleSetup");
    params.delete("success");
    params.delete("error");
    params.delete("link");
    const qs = params.toString();
    setVisible(false);
    window.setTimeout(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 160);
  }

  function toggleEnabled(calendarId: string) {
    if (!isAdmin) return;

    setEnabledIds((current) => {
      const cleanId = String(calendarId ?? "").trim();
      if (!cleanId || cleanId === studioCalendar.id) return current;
      return current.includes(cleanId)
        ? [studioCalendar.id, ...current.filter((id) => id !== cleanId && id !== studioCalendar.id)]
        : sanitizeCalendarIds([...current, cleanId, studioCalendar.id]);
    });
  }

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, isolation: "isolate" }}>
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: visible ? "rgba(0,0,0,0.52)" : "rgba(0,0,0,0)",
          backdropFilter: visible ? "blur(4px)" : "blur(0px)",
          transition: "background 180ms ease, backdrop-filter 180ms ease",
        }}
      />

      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(860px, 92vw)",
          background:
            "linear-gradient(180deg, rgba(7,7,10,0.98) 0%, rgba(5,5,7,0.98) 100%)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-24px 0 80px rgba(0,0,0,0.55)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms ease",
          overflow: "auto",
        }}
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-black/75 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-6 py-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
                Einstellungen / Google
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight text-white">
                Google Kalender Setup
              </div>
            </div>

            <button
              type="button"
              onClick={close}
              aria-label="Schließen"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {error ? (
            <MessageCard tone="error">
              <div className="text-sm text-red-200 break-words">{decodeURIComponent(error)}</div>
            </MessageCard>
          ) : null}

          {success ? (
            <div className={error ? "mt-4" : ""}>
              <MessageCard tone="success">
                <div className="text-sm text-emerald-200">{decodeURIComponent(success)}</div>
              </MessageCard>
            </div>
          ) : null}

          <div className={`${error || success ? "mt-5 " : ""}space-y-5`}>
            {loadError ? (
              <MessageCard tone="error">
                <div className="text-lg font-semibold text-white">Fehler</div>
                <div className="mt-2 text-sm text-red-200 break-words">{loadError}</div>
                <div className="mt-4">
                  <Link
                    href="/auth/google/start"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90"
                  >
                    Google verbinden
                  </Link>
                </div>
              </MessageCard>
            ) : (
              <div className="grid gap-5">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm text-white/60">
                    Gespeicherter Standard-Kalender:{" "}
                    <span className="font-medium text-white">{STUDIO_DEFAULT_CALENDAR_ID}</span>
                  </div>

                  <form action={setDefaultCalendar} className="mt-5 space-y-4">
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="calendarId" value={studioCalendar.id} />
                    <input type="hidden" name="enabledCalendarIds" value={studioCalendar.id} />
                    {isAdmin
                      ? enabledIds
                          .filter((calendarId) => calendarId !== studioCalendar.id)
                          .map((calendarId) => (
                            <input key={calendarId} type="hidden" name="enabledCalendarIds" value={calendarId} />
                          ))
                      : null}

                    <div className="text-sm font-medium text-white">Standard-Kalender</div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white">
                      <div className="text-sm font-semibold break-words">
                        {(studioCalendar.primary ? "⭐ " : "") + (studioCalendar.summary ?? studioCalendar.id)}
                      </div>
                      <div className="mt-1 text-xs text-white/45 break-all">
                        {studioCalendar.id}
                        {studioCalendar.accessRole ? ` · ${studioCalendar.accessRole}` : ""}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                      Alle Studio-Termine werden weiter in den gemeinsamen Standard-Kalender{" "}
                      <span className="font-medium text-white">{STUDIO_DEFAULT_CALENDAR_ID}</span> geschrieben.
                    </div>

                    {isAdmin ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-white">Zusatzkalender nur für Admin</div>

                        <div className="space-y-2">
                          {extraCalendars.length > 0 ? (
                            extraCalendars.map((calendar) => {
                              const checked = enabledIds.includes(calendar.id);
                              return (
                                <label
                                  key={calendar.id}
                                  className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white break-words">
                                      {(calendar.primary ? "⭐ " : "") + (calendar.summary ?? calendar.id)}
                                    </div>
                                    <div className="mt-1 text-xs text-white/45 break-all">
                                      {calendar.id}
                                      {calendar.accessRole ? ` · ${calendar.accessRole}` : ""}
                                    </div>
                                  </div>

                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleEnabled(calendar.id)}
                                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                                  />
                                </label>
                              );
                            })
                          ) : (
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                              Keine weiteren Kalender gefunden.
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                          Zusatzkalender sind nur zur Anzeige gedacht und schreiben nichts ins CRM.
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
                        Weitere Kalender sind nur für Admin sichtbar.
                      </div>
                    )}

                    <Button type="submit">Speichern</Button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}

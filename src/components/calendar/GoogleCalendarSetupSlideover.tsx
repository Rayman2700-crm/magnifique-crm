"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createTestEvent, setDefaultCalendar } from "@/app/calendar/actions";

type CalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
};

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

export default function GoogleCalendarSetupSlideover({
  calendars,
  savedDefault,
  loadError,
}: {
  calendars: CalendarListItem[];
  savedDefault: string | null;
  loadError: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = searchParams?.get("openGoogleSetup") === "1";
  const error = searchParams?.get("error");
  const success = searchParams?.get("success");
  const link = searchParams?.get("link");

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("openGoogleSetup", "1");
    return `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => setMounted(true), []);

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
                <div className="text-sm text-emerald-200">
                  {decodeURIComponent(success)}
                  {link ? (
                    <>
                      {" "}
                      <a
                        className="underline underline-offset-4"
                        href={decodeURIComponent(link)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        (in Google Kalender öffnen)
                      </a>
                    </>
                  ) : null}
                </div>
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
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm text-white/60">
                    Gespeicherter Standard-Kalender:{" "}
                    <span className="font-medium text-white">
                      {savedDefault ? savedDefault : "— noch keiner —"}
                    </span>
                  </div>

                  <form action={setDefaultCalendar} className="mt-5 space-y-4">
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <div className="text-sm font-medium text-white">
                      Standard-Kalender auswählen
                    </div>

                    <select
                      name="calendarId"
                      defaultValue={savedDefault ?? ""}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-0 transition focus:border-white/20"
                    >
                      <option value="">— Bitte wählen —</option>
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {(calendar.primary ? "⭐ " : "") + (calendar.summary ?? calendar.id)}
                          {calendar.accessRole ? ` (${calendar.accessRole})` : ""}
                        </option>
                      ))}
                    </select>

                    <Button type="submit">Speichern</Button>
                  </form>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-sm font-medium text-white">Testevent</div>

                  <form action={createTestEvent} className="mt-5 space-y-4">
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <select
                      name="calendarId"
                      defaultValue={savedDefault ?? ""}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-0 transition focus:border-white/20"
                    >
                      <option value="">— Bitte wählen —</option>
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {(calendar.primary ? "⭐ " : "") + (calendar.summary ?? calendar.id)}
                        </option>
                      ))}
                    </select>

                    <Button variant="secondary" type="submit">
                      Testevent erstellen
                    </Button>
                  </form>

                  <div className="mt-4 text-sm text-white/50">
                    Tipp: Wenn oben ein Link erscheint, ist die Verbindung korrekt.
                  </div>
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

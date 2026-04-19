"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type StudioTarget = {
  key: string;
  label: string;
  calendarId: string;
};

type ExtraCalendar = {
  id: string;
  summary?: string;
  accessRole?: string;
  primary?: boolean;
};

type Props = {
  saveAction: (formData: FormData) => void | Promise<void>;
  studioTargets: StudioTarget[];
  selectedStudioCalendarId: string;
  extraCalendars: ExtraCalendar[];
  enabledExtraIds: string[];
};

type PopoverPos = { top: number; left: number; width: number; maxHeight: number };

function itemShell(selected: boolean) {
  return [
    "flex w-full items-start justify-between gap-4 rounded-[20px] border px-4 py-3 text-left transition",
    selected
      ? "border-white/18 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      : "border-white/10 bg-black/20 hover:bg-white/[0.05]",
  ].join(" ");
}

function circleCheckClass(selected: boolean) {
  return [
    "mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
    selected
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-white/12 bg-black/30 text-white/25",
  ].join(" ");
}

export default function GoogleCalendarUiSettingsClient({
  saveAction,
  studioTargets,
  selectedStudioCalendarId,
  extraCalendars,
  enabledExtraIds,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const studioButtonRef = useRef<HTMLButtonElement>(null);
  const extrasButtonRef = useRef<HTMLButtonElement>(null);
  const studioPopoverRef = useRef<HTMLDivElement>(null);
  const extrasPopoverRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [studioId, setStudioId] = useState(selectedStudioCalendarId);
  const [extraIds, setExtraIds] = useState<string[]>(enabledExtraIds);
  const [studioPos, setStudioPos] = useState<PopoverPos | null>(null);
  const [extrasPos, setExtrasPos] = useState<PopoverPos | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setStudioId(selectedStudioCalendarId);
  }, [selectedStudioCalendarId]);

  useEffect(() => {
    setExtraIds(enabledExtraIds);
  }, [enabledExtraIds]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const insideStudio = studioButtonRef.current?.contains(target) || studioPopoverRef.current?.contains(target);
      const insideExtras = extrasButtonRef.current?.contains(target) || extrasPopoverRef.current?.contains(target);
      if (!insideStudio) setStudioOpen(false);
      if (!insideExtras) setExtrasOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function computePopoverPos(button: HTMLButtonElement | null): PopoverPos | null {
    if (!button || typeof window === "undefined") return null;
    const rect = button.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const desiredWidth = Math.min(420, Math.max(280, viewportW - 24));
    const left = Math.min(Math.max(12, rect.right - desiredWidth), viewportW - desiredWidth - 12);
    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const showBelow = spaceBelow >= 260 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(220, Math.min(520, showBelow ? spaceBelow - 8 : spaceAbove - 8));
    const estimatedHeight = Math.min(maxHeight, 420);
    const top = showBelow ? rect.bottom + 10 : Math.max(12, rect.top - estimatedHeight - 10);
    return { top, left, width: desiredWidth, maxHeight };
  }

  useEffect(() => {
    function refresh() {
      if (studioOpen) setStudioPos(computePopoverPos(studioButtonRef.current));
      if (extrasOpen) setExtrasPos(computePopoverPos(extrasButtonRef.current));
    }
    refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [studioOpen, extrasOpen]);

  const extraIdSet = useMemo(() => new Set(extraIds), [extraIds]);
  const selectedStudio =
    studioTargets.find((target) => target.calendarId === studioId) ?? null;
  const selectedExtras = extraCalendars.filter((calendar) => extraIdSet.has(calendar.id));

  function submitSoon() {
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  function handleStudioChange(calendarId: string) {
    setStudioId(calendarId);
    setStudioOpen(false);
    submitSoon();
  }

  function handleExtraToggle(calendarId: string) {
    setExtraIds((current) => {
      const next = current.includes(calendarId)
        ? current.filter((id) => id !== calendarId)
        : [...current, calendarId];
      queueMicrotask(() => formRef.current?.requestSubmit());
      return next;
    });
  }

  const studioPopover = mounted && studioOpen && studioPos
    ? createPortal(
        <div
          ref={studioPopoverRef}
          className="fixed z-[120] rounded-[24px] border border-white/12 bg-[#181614]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-md"
          style={{ top: studioPos.top, left: studioPos.left, width: studioPos.width, maxHeight: studioPos.maxHeight }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Studiokalender auswählen</div>
              <div className="mt-0.5 text-xs text-white/45">Standard-Ziel für neue Termine</div>
            </div>
            <button
              type="button"
              onClick={() => setStudioOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
          <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: studioPos.maxHeight - 72 }}>
            {studioTargets.map((target) => {
              const selected = studioId === target.calendarId;
              return (
                <button
                  key={target.key}
                  type="button"
                  onClick={() => handleStudioChange(target.calendarId)}
                  className={itemShell(selected)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white break-words">{target.label}</div>
                    <div className="mt-1 text-xs text-white/45 break-all">{target.calendarId}</div>
                  </div>
                  <div className={circleCheckClass(selected)}>✓</div>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )
    : null;

  const extrasPopover = mounted && extrasOpen && extrasPos
    ? createPortal(
        <div
          ref={extrasPopoverRef}
          className="fixed z-[120] rounded-[24px] border border-white/12 bg-[#181614]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-md"
          style={{ top: extrasPos.top, left: extrasPos.left, width: extrasPos.width, maxHeight: extrasPos.maxHeight }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Zusatzkalender auswählen</div>
              <div className="mt-0.5 text-xs text-white/45">Nur read-only Kalender für die Anzeige</div>
            </div>
            <button
              type="button"
              onClick={() => setExtrasOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Schließen"
            >
              ×
            </button>
          </div>
          {extraCalendars.length > 0 ? (
            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: extrasPos.maxHeight - 72 }}>
              {extraCalendars.map((calendar) => {
                const selected = extraIdSet.has(calendar.id);
                return (
                  <button
                    key={calendar.id}
                    type="button"
                    onClick={() => handleExtraToggle(calendar.id)}
                    className={itemShell(selected)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white break-words">
                        {(calendar.primary ? "⭐ " : "") + (calendar.summary ?? calendar.id)}
                      </div>
                    </div>
                    <div className={circleCheckClass(selected)}>✓</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
              Keine weiteren Zusatzkalender gefunden.
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={wrapRef} className="grid gap-4 md:grid-cols-2 md:items-start">
      <form ref={formRef} action={saveAction} className="contents">
        <input type="hidden" name="returnTo" value="/calendar/google" />
        <input type="hidden" name="calendarId" value={studioId} />
        {extraIds.map((id) => (
          <input key={id} type="hidden" name="enabledCalendarIds" value={id} />
        ))}

        <div className="relative h-full rounded-[24px] border border-white/10 bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Studiokalender für neue Termine</div>
                <div className="mt-1 text-sm text-white/55">
                  Wähle das gespeicherte Standard-Ziel, in das neue CRM-Termine geschrieben werden.
                </div>
              </div>
              <button
                ref={studioButtonRef}
                type="button"
                onClick={() => {
                  setStudioOpen((open) => !open);
                  setExtrasOpen(false);
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Auswählen
              </button>
            </div>

            <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d7c097]">Gespeichert</div>
              <div className="mt-2 text-base font-semibold text-white break-words">
                {selectedStudio ? `${selectedStudio.label} · ${selectedStudio.calendarId}` : "Kein Studiokalender gespeichert"}
              </div>
            </div>
          </div>
        </div>

        <div className="relative h-full rounded-[24px] border border-white/10 bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Zusatzkalender in der UI</div>
                <div className="mt-1 text-sm text-white/55">
                  Read-only Zusatzkalender für die Anzeige im CRM ein- oder ausblenden.
                </div>
              </div>
              <button
                ref={extrasButtonRef}
                type="button"
                onClick={() => {
                  setExtrasOpen((open) => !open);
                  setStudioOpen(false);
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Auswählen
              </button>
            </div>

            <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d7c097]">Ausgewählt</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedExtras.length > 0 ? (
                  selectedExtras.map((calendar) => (
                    <span
                      key={calendar.id}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                    >
                      {calendar.summary ?? calendar.id}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-white/45">Keine Zusatzkalender ausgewählt</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
      {studioPopover}
      {extrasPopover}
    </div>
  );
}

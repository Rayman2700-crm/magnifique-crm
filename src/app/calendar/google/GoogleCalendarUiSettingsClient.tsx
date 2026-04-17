"use client";

import { useMemo, useRef } from "react";

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
  isAdmin: boolean;
};

export default function GoogleCalendarUiSettingsClient({
  saveAction,
  studioTargets,
  selectedStudioCalendarId,
  extraCalendars,
  enabledExtraIds,
  isAdmin,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const selectedSet = useMemo(() => new Set(enabledExtraIds), [enabledExtraIds]);

  return (
    <form ref={formRef} action={saveAction} className="space-y-5">
      <input type="hidden" name="returnTo" value="/calendar/google" />

      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-white">Studiokalender für neue Termine</div>
          <div className="mt-1 text-sm text-white/60">
            Neue CRM-Termine werden immer in einen der beiden Studio-Kalender geschrieben.
          </div>
        </div>

        <select
          name="calendarId"
          defaultValue={selectedStudioCalendarId}
          onChange={() => formRef.current?.requestSubmit()}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-white/20"
        >
          {studioTargets.map((target) => (
            <option key={target.key} value={target.calendarId}>
              {target.label} · {target.calendarId}
            </option>
          ))}
        </select>
      </div>

      {isAdmin ? (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-white">Zusatzkalender in der UI</div>
            <div className="mt-1 text-sm text-white/60">
              Nur für Admin sichtbar. Diese Kalender werden zusätzlich im CRM eingeblendet.
            </div>
          </div>

          {extraCalendars.length > 0 ? (
            <div className="space-y-2">
              {extraCalendars.map((calendar) => (
                <label
                  key={calendar.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
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
                    name="enabledCalendarIds"
                    value={calendar.id}
                    defaultChecked={selectedSet.has(calendar.id)}
                    onChange={() => formRef.current?.requestSubmit()}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
              Keine weiteren Zusatzkalender gefunden.
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}

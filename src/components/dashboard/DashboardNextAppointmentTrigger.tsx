"use client";

import { useEffect, useState } from "react";
import AppointmentDetailSlideover from "@/components/calendar/AppointmentDetailSlideover";

type DashboardAppointmentDetailItem = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  tenantId: string;
  tenantName: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerProfileId: string | null;
  status: "scheduled" | "completed" | "cancelled" | "no_show" | null;
  note: string | null;
  canOpenCustomerProfile: boolean;
  canCreateFollowUp: boolean;
  canDeleteAppointment: boolean;
  serviceName?: string | null;
  servicePriceCentsSnapshot?: number | null;
  serviceDurationMinutesSnapshot?: number | null;
  serviceBufferMinutesSnapshot?: number | null;
  reminderSentAt?: string | null;
};

export default function DashboardNextAppointmentTrigger({
  label,
  selected,
}: {
  label: string;
  selected: DashboardAppointmentDetailItem | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const content = (
    <button
      type="button"
      onClick={() => selected && setOpen(true)}
      disabled={!selected}
      className="flex h-full w-full flex-col items-start justify-center rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-left transition hover:bg-white/[0.05] disabled:cursor-default disabled:hover:bg-black/20"
      aria-label={selected ? "Nächsten Termin öffnen" : "Kein nächster Termin"}
      title={selected ? "Termindetails öffnen" : "Kein nächster Termin"}
    >
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Nächster</div>
      <div className="mt-1 text-[13px] font-semibold leading-tight text-[var(--text)] sm:text-sm">
        {label}
      </div>
    </button>
  );

  return (
    <>
      {content}
      <AppointmentDetailSlideover
        mounted={mounted}
        selected={open ? (selected as any) : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

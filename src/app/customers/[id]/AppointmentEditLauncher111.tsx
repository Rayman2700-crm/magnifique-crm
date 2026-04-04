"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import EditAppointmentSlideover from "@/components/calendar/EditAppointmentSlideover";

export default function AppointmentEditLauncher({
  appointmentId,
  startAt,
  endAt,
  notesInternal,
}: {
  appointmentId: string;
  startAt: string | null;
  endAt: string | null;
  notesInternal: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const openFrame = window.requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(openFrame);
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  const close = () => {
    setShown(false);
    window.setTimeout(() => setVisible(false), 220);
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setVisible(true)}>
        Bearbeiten
      </Button>

      <EditAppointmentSlideover
        mounted={mounted}
        visible={visible}
        shown={shown}
        onClose={close}
        appointmentId={appointmentId}
        startAt={startAt}
        endAt={endAt}
        notesInternal={notesInternal}
      />
    </>
  );
}

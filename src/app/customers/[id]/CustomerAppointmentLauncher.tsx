"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import CreateAppointmentSlideover from "@/components/calendar/CreateAppointmentSlideover";

type TenantOption = { id: string; display_name: string | null };
type ServiceOption = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active: boolean | null;
};

export default function CustomerAppointmentLauncher({
  customerName,
  customerPhone,
  customerTenantId,
  customerTenantLabel,
  services,
  buttonLabel = "Neuer Termin",
  buttonVariant = "default",
}: {
  customerName: string;
  customerPhone: string;
  customerTenantId: string | null;
  customerTenantLabel?: string | null;
  services: ServiceOption[];
  buttonLabel?: string;
  buttonVariant?: "default" | "secondary";
}) {
  const [mounted, setMounted] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [createShown, setCreateShown] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!createVisible) return;

    const openFrame = window.requestAnimationFrame(() => setCreateShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(openFrame);
      document.body.style.overflow = prevOverflow;
    };
  }, [createVisible]);

  const close = () => {
    setCreateShown(false);
    window.setTimeout(() => setCreateVisible(false), 220);
  };

  const tenantOptions = useMemo<TenantOption[]>(() => {
    return customerTenantId ? [{ id: customerTenantId, display_name: customerTenantLabel ?? null }] : [];
  }, [customerTenantId, customerTenantLabel]);

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size="sm"
        onClick={() => setCreateVisible(true)}
      >
        {buttonLabel}
      </Button>

      <CreateAppointmentSlideover
        mounted={mounted}
        createVisible={createVisible}
        createShown={createShown}
        onClose={close}
        tenants={tenantOptions}
        services={services}
        creatorTenantId={customerTenantId}
        initialWalkInName={customerName}
        initialWalkInPhone={customerPhone}
        forceTenantId={customerTenantId}
        hideTenantSelect
        tenantLabel={customerTenantLabel ?? undefined}
      />
    </>
  );
}

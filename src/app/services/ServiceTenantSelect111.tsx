'use client';

import { useEffect, useRef } from "react";
import { setActiveServiceTenant } from "./actions";

type TenantOption = {
  id: string;
  display_name: string | null;
};

export default function ServiceTenantSelect({
  tenantOptions,
  selectedTenantId,
  isAdmin,
  fallbackLabel,
}: {
  tenantOptions: TenantOption[];
  selectedTenantId: string | null;
  isAdmin: boolean;
  fallbackLabel: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!isAdmin && selectRef.current) {
      selectRef.current.disabled = true;
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="text-base font-semibold text-[var(--text)]">{fallbackLabel}</div>;
  }

  return (
    <form ref={formRef} action={setActiveServiceTenant}>
      <select
        ref={selectRef}
        name="tenant"
        defaultValue={selectedTenantId ?? "all"}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-[12px] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-white/15"
        style={{ backgroundColor: "#111214", color: "#ffffff" }}
      >
        <option value="all" style={{ backgroundColor: "#111214", color: "#ffffff" }}>
          Bitte auswählen
        </option>
        {tenantOptions.map((tenant) => (
          <option
            key={tenant.id}
            value={tenant.id}
            style={{ backgroundColor: "#111214", color: "#ffffff" }}
          >
            {tenant.display_name ?? tenant.id}
          </option>
        ))}
      </select>
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TenantLegendClient from "@/components/calendar/TenantLegendClient";
import type { ViewMode } from "@/components/calendar/types";

type TenantRow = {
  id: string;
  display_name: string | null;
};

type LegendUser = {
  tenantId: string;
  filterTenantId: string;
  userId: string;
  fullName: string | null;
  tenantDisplayName: string;
};

type ServiceOptionInput = {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number | null;
  buffer_minutes: number | null;
  default_price_cents: number | null;
  is_active?: boolean | null;
};

function isAdminTenantName(name: string | null | undefined) {
  const n = String(name ?? "").toLowerCase();
  return n.includes("radu");
}

function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const btn = (v: ViewMode, label: string) => {
    const active = value === v;

    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(v);
        }}
        style={{
          height: 38,
          padding: "0 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 800,
          border: "1px solid rgba(255,255,255,0.14)",
          backgroundColor: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.8)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {btn("day", "Tag")}
      {btn("week", "Woche")}
      {btn("month", "Monat")}
      {btn("year", "Jahr")}
    </div>
  );
}

export default function DashboardCalendarCardClient({
  tenants,
  legendUsers,
  services = [],
  creatorTenantId,
  isAdmin,
}: {
  tenants: TenantRow[];
  legendUsers: LegendUser[];
  services?: ServiceOptionInput[];
  creatorTenantId: string | null;
  isAdmin?: boolean;
}) {
  const [view, setView] = useState<ViewMode>("week");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const currentLegendUser = useMemo(() => {
    if (!creatorTenantId) return null;

    return (
      legendUsers.find(
        (u) => u.tenantId === creatorTenantId || u.filterTenantId === creatorTenantId
      ) ?? null
    );
  }, [creatorTenantId, legendUsers]);

  const currentTenantDisplayName =
    currentLegendUser?.tenantDisplayName ??
    tenants.find((t) => t.id === creatorTenantId)?.display_name ??
    null;

  const computedIsAdmin = useMemo(() => {
    if (typeof isAdmin === "boolean") return isAdmin;
    if (legendUsers.length > 1) return true;
    return isAdminTenantName(currentTenantDisplayName);
  }, [currentTenantDisplayName, isAdmin, legendUsers.length]);

  return (
    <Card className="border-[var(--border)] bg-[var(--surface)]">
      <CardContent className="p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-lg font-semibold text-white">Kalender</div>
              <div className="text-sm text-white/60">Team-Übersicht</div>
            </div>

            {computedIsAdmin ? (
              <TenantLegendClient
                users={legendUsers}
                activeTenantId={selectedTenantId}
                onSelect={setSelectedTenantId}
              />
            ) : currentLegendUser ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80">
                {currentLegendUser.fullName ?? currentLegendUser.tenantDisplayName}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button type="button" className="whitespace-nowrap">
              + Neuer Termin
            </Button>

            <Button type="button" variant="secondary" className="whitespace-nowrap">
              Kalender öffnen
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary">Heute</Button>
              <Button type="button" variant="secondary">←</Button>
              <Button type="button" variant="secondary">→</Button>
              <div className="ml-2 text-xl font-bold text-white">Kalender Safe-Mode</div>
            </div>

            <ViewSwitch value={view} onChange={setView} />
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-100">
            Der Dashboard-Kalender ist vorübergehend deaktiviert, damit Supabase stabil bleibt und Login/Dashboard
            nicht wieder unhealthy machen. Die übrigen Dashboard-Karten bleiben normal nutzbar.
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/70">
            Nächster Schritt: Erst Stabilität sichern. Danach bauen wir den Kalender neu mit serverseitigem Laden
            statt browserseitigen Supabase-Requests im Dashboard.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

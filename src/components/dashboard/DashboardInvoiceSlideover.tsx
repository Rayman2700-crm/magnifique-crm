"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createDashboardInvoice } from "@/app/dashboard/actions";

type TenantOption = {
  id: string;
  displayName: string;
};

type ServiceOption = {
  id: string;
  tenantId: string;
  name: string;
  defaultPriceCents: number | null;
};

type CustomerOption = {
  id: string;
  tenantId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
};

function closeQuery(pathname: string, searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("invoice");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function centsToMoneyInput(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-12 w-full items-center justify-center rounded-[16px] bg-[var(--primary)] px-4 text-base font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Rechnung wird erstellt..." : "Rechnung erstellen"}
    </button>
  );
}

export default function DashboardInvoiceSlideover({
  tenants,
  services,
  customers,
  selectedTenantId,
  currentUserName,
  currentTenantName,
  isAdmin,
}: {
  tenants: TenantOption[];
  services: ServiceOption[];
  customers: CustomerOption[];
  selectedTenantId: string;
  currentUserName: string;
  currentTenantName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isOpen = searchParams?.get("invoice") === "1";
  const [mounted, setMounted] = useState(false);

  const [tenantId, setTenantId] = useState(selectedTenantId || tenants[0]?.id || "");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [serviceTitle, setServiceTitle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [taxRate, setTaxRate] = useState("0");
  const [price, setPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const visibleServices = useMemo(() => {
    if (!tenantId) return [];
    return services.filter((service) => service.tenantId === tenantId);
  }, [services, tenantId]);

  const tenantNameById = useMemo(() => {
    return new Map(tenants.map((tenant) => [tenant.id, tenant.displayName]));
  }, [tenants]);

  const customerMatches = useMemo(() => {
    const search = normalizeSearch(customerSearch);

    const matchesSearch = (customer: CustomerOption) => {
      if (!search) return true;
      return normalizeSearch(
        [customer.displayName, customer.phone ?? "", customer.email ?? ""].join(" ")
      ).includes(search);
    };

    const matchingCustomers = customers.filter(matchesSearch);

    const sorted = [...matchingCustomers].sort((a, b) => {
      const aPriority = a.tenantId === tenantId ? 0 : 1;
      const bPriority = b.tenantId === tenantId ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" });
    });

    return sorted.slice(0, 16);
  }, [customers, customerSearch, tenantId]);

  useEffect(() => {
    if (isOpen) {
      const nextTenantId = selectedTenantId || tenants[0]?.id || "";
      setTenantId(nextTenantId);
      setSelectedServiceId("");
      setSelectedCustomerId("");
      setCustomerName("");
      setCustomerSearch("");
      setPickerOpen(false);
      setServiceTitle("");
      setQuantity("1");
      setTaxRate("0");
      setPrice("");
      setPaymentMethod("CASH");
      setNotes("");
      setNotesOpen(false);
    }
  }, [isOpen, selectedTenantId, tenants]);

  useEffect(() => {
    setSelectedServiceId("");
    setSelectedCustomerId("");
    setCustomerName("");
    setCustomerSearch("");
    setPickerOpen(false);
    setServiceTitle("");
    setPrice("");
    setNotes("");
    setNotesOpen(false);
  }, [tenantId]);

  const totalPreview = useMemo(() => {
    const qty = Math.max(1, Number(quantity.replace(",", ".")) || 1);
    const normalized = String(price)
      .trim()
      .replace(/\s+/g, "")
      .replace("€", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const amount = Number(normalized);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(
      qty * safeAmount
    );
  }, [price, quantity]);

  const activeTenantName =
    tenants.find((tenant) => tenant.id === tenantId)?.displayName ||
    currentTenantName ||
    "Behandler";

  const isValid = !!tenantId && !!customerName.trim() && !!serviceTitle.trim() && !!price.trim();

  if (!mounted || !isOpen || typeof document === "undefined") return null;

  const handleClose = () => {
    router.replace(closeQuery(pathname, new URLSearchParams(searchParams?.toString() ?? "")), {
      scroll: false,
    });
  };

  const handleServiceSelect = (nextServiceId: string) => {
    setSelectedServiceId(nextServiceId);
    if (!nextServiceId) return;
    const selectedService = visibleServices.find((service) => service.id === nextServiceId);
    if (!selectedService) return;
    setServiceTitle(selectedService.name);
    setPrice(centsToMoneyInput(selectedService.defaultPriceCents));
  };

  const handleCustomerPick = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.displayName);
    setCustomerSearch(customer.displayName);
    if (customer.tenantId && customer.tenantId !== tenantId) {
      setTenantId(customer.tenantId);
    }
    setPickerOpen(false);
  };

  const renderCustomerButton = (customer: CustomerOption) => {
    const tenantLabel = tenantNameById.get(customer.tenantId) ?? "Anderer Bereich";
    const isFromCurrentTenant = customer.tenantId === tenantId;
    const isActive = selectedCustomerId === customer.id;

    return (
      <button
        key={customer.id}
        type="button"
        onClick={() => handleCustomerPick(customer)}
        className="flex w-full items-start justify-between rounded-[14px] border border-transparent bg-white/[0.03] px-3 py-2 text-left transition hover:border-white/10 hover:bg-white/[0.06]"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{customer.displayName}</div>
          <div className="truncate text-xs text-white/45">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "Gespeichertes Kundenprofil"}
          </div>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {!isFromCurrentTenant ? (
            <span className="inline-flex h-7 items-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/75">
              {tenantLabel}
            </span>
          ) : null}
          {isActive ? <span className="text-xs font-semibold text-emerald-300">Aktiv</span> : null}
        </div>
      </button>
    );
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1400 }}>
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.68)",
          backdropFilter: "blur(6px)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          width: 470,
          maxWidth: "calc(100vw - 36px)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(16,16,16,0.96), rgba(10,10,10,0.96))",
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>Rechnungen</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>Neue Rechnung</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.46)" }}>
              Sales Order, Payment und Fiskalbeleg werden direkt erzeugt.
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Schließen
          </button>
        </div>

        <form action={createDashboardInvoice} style={{ padding: 16, overflow: "auto" }}>
          <div className="space-y-4">
            <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.98),rgba(12,12,12,0.96))] px-4 pb-4 pt-3 backdrop-blur-xl">
              <div className="grid gap-3">
                <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">Vorschau</div>
                  <div className="mt-1.5 truncate text-sm text-white/70">
                    {customerName || "Kein Kunde"} · {serviceTitle || "Keine Leistung"} · {activeTenantName}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-[18px] font-bold leading-none text-white sm:text-[20px]">{totalPreview}</div>
                    <div className="shrink-0 text-[11px] text-white/45">
                      {paymentMethod === "CASH" ? "Bar" : paymentMethod === "CARD" ? "Karte" : "Überweisung"}
                    </div>
                  </div>
                </div>


                <div className="grid grid-cols-2 gap-3">
                  <SubmitButton disabled={!isValid} />
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex h-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] px-4 text-base font-semibold text-white transition hover:bg-white/[0.06]"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white">Behandler</label>
              {isAdmin ? (
                <select
                  name="tenant_id"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                >
                  <option value="">Bitte wählen...</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input type="hidden" name="tenant_id" value={tenantId} />
                  <div className="flex h-12 items-center rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white">
                    {activeTenantName}
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Kunde *</label>
              <input type="hidden" name="customer_profile_id" value={selectedCustomerId} />

              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                className="inline-flex h-12 w-full items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] px-4 text-base font-semibold text-white transition hover:bg-white/[0.06]"
              >
                {selectedCustomerId ? "Kundenwahl ändern" : "Kunde auswählen"}
              </button>

              {selectedCustomerId ? (
                <div className="mt-2 rounded-[16px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                  <div className="text-sm font-semibold text-white">{customerName}</div>
                  <div className="mt-1 text-xs text-white/50">{tenantNameById.get(tenantId) ?? activeTenantName}</div>
                </div>
              ) : null}

              {pickerOpen ? (
                <div className="mt-3 rounded-[18px] border border-white/10 bg-[#0d0e11] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.38)]">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-white">Kunde auswählen</div>
                    <div className="mt-1 text-xs text-white/45">
                      Bestehende Kunden suchen und direkt übernehmen.
                    </div>
                  </div>

                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Name, Telefon oder E-Mail suchen"
                    className="h-11 w-full rounded-[14px] border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-white/30 outline-none"
                  />

                  <div className="mt-3 max-h-64 overflow-auto space-y-1">
                    {customerMatches.length > 0 ? (
                      customerMatches.map((customer) => renderCustomerButton(customer))
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-white/10 px-3 py-3 text-sm text-white/55">
                        Kein Treffer. Dann im Hauptformular einfach frei eingeben.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <input
                  name="customer_name"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId("");
                  }}
                  placeholder="Oder Kunde frei eingeben"
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white placeholder:text-white/30 outline-none"
                />
              </div>

              <div className="mt-2 text-xs text-white/40">
                Der Picker durchsucht jetzt immer alle geladenen Kunden. Treffer vom aktiven Behandler stehen oben.
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Leistung aus Liste (optional)</label>
              <select
                value={selectedServiceId}
                onChange={(e) => handleServiceSelect(e.target.value)}
                className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
              >
                <option value="">Keine Auswahl / frei eingeben</option>
                {visibleServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {typeof service.defaultPriceCents === "number"
                      ? ` · ${new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(service.defaultPriceCents / 100)}`
                      : ""}
                  </option>
                ))}
              </select>
              <input type="hidden" name="service_id" value={selectedServiceId} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white">Leistung *</label>
              <input
                name="service_title"
                value={serviceTitle}
                onChange={(e) => setServiceTitle(e.target.value)}
                placeholder="z. B. RUSSISCHE PEDIKÜRE"
                className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white placeholder:text-white/30 outline-none"
              />
              <div className="mt-2 text-xs text-white/40">
                Du kannst eine Leistung aus der Liste wählen oder hier frei etwas eingeben.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white">Menge *</label>
                <input
                  name="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-white">Steuer %</label>
                <input
                  name="tax_rate"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-white">Preis (€) *</label>
                <input
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="89,00"
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white placeholder:text-white/30 outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-white">Zahlungsart</label>
                <select
                  name="payment_method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-12 w-full rounded-[16px] border border-white/10 bg-black/30 px-4 text-base text-white outline-none"
                >
                  <option value="CASH">Bar</option>
                  <option value="CARD">Karte</option>
                  <option value="TRANSFER">Überweisung</option>
                </select>
              </div>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setNotesOpen((open) => !open)}
                className="flex h-12 w-full items-center justify-between px-4 text-left"
              >
                <span className="text-sm font-medium text-white">Interne Notiz</span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                  {notesOpen ? "Schließen" : "Aufklappen"}
                </span>
              </button>

              {notesOpen ? (
                <div className="border-t border-white/10 px-4 pb-4 pt-3">
                  <textarea
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional: kurze interne Beschreibung"
                    className="min-h-[112px] w-full rounded-[16px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/30 outline-none"
                  />
                </div>
              ) : (
                <input type="hidden" name="notes" value={notes} />
              )}
            </div>


            <div className="text-xs text-white/35">Eingeloggt als {currentUserName}</div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function getTenantLogoPath(invoicePrefix?: string | null): string | null {
  const key = (invoicePrefix ?? "").trim().toUpperCase();

  const logoMap: Record<string, string> = {
    RAD: "/logos/radu-craus.png",
    RAL: "/logos/raluca-craus.png",
    ALE: "/logos/alexandra-sacadat.png",
    BAR: "/logos/barbara-eder.png",
  };

  return logoMap[key] ?? null;
}
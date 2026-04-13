"use client";

import { useRouter } from "next/navigation";

type Props = {
  qRaw: string;
  currentFilter: string;
  practitionerFilter: string;
  closingDate: string;
};

export default function ClosingDateAutoSubmit({
  qRaw,
  currentFilter,
  practitionerFilter,
  closingDate,
}: Props) {
  const router = useRouter();

  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-white/45">Datum</label>
 <input
  type="date"
  name="closingDate"
  defaultValue={closingDate}
  className="mt-1 inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] outline-none transition hover:bg-white/10"
  onChange={(event) => {
    const nextDate = event.currentTarget.value;
    const params = new URLSearchParams();
    if (qRaw.trim()) params.set("q", qRaw.trim());
    if (currentFilter && currentFilter !== "all") params.set("filter", currentFilter);
    if (practitionerFilter && practitionerFilter !== "all") params.set("practitioner", practitionerFilter);
    if (nextDate) params.set("closingDate", nextDate);
    router.replace(`/rechnungen?${params.toString()}`);
  }}
/>
    </div>
  );
}

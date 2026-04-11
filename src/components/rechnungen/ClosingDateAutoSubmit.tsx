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
        className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none"
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

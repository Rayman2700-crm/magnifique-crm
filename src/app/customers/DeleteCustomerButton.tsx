"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { deleteCustomerProfile } from "./actions";

export default function DeleteCustomerButton({
  customerProfileId,
}: {
  customerProfileId: string;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const returnTo = pathname + (sp?.toString() ? `?${sp.toString()}` : "");

  return (
    <form
      action={deleteCustomerProfile.bind(null, customerProfileId)}
      onSubmit={(e) => {
        const ok = confirm(
          "Kunde wirklich löschen?\n\nNur möglich, wenn keine Termine existieren."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 hover:bg-black/40"
      >
        Löschen
      </button>
    </form>
  );
}   
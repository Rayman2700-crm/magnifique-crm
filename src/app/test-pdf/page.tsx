"use client";

import { createInvoicePdf } from "@/lib/pdf/createInvoicePdf";

export default function TestPdfPage() {
  return (
    <main className="p-10">
      <button
        onClick={() => createInvoicePdf()}
        className="rounded-xl bg-black px-5 py-3 text-white"
      >
        Rechnung als PDF erstellen
      </button>
    </main>
  );
}
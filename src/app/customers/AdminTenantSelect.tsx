"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminTenantSelect({
  current,
  options,
  action,
}: {
  current: string;
  options: { tenant_id: string; label: string }[];
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function submit(value: string) {
    if (!formRef.current) return;

    const input = formRef.current.querySelector(
      'input[name="tenant"]'
    ) as HTMLInputElement | null;

    if (input) input.value = value;

    setOpen(false);
    formRef.current.requestSubmit();
  }

  const selected =
    current === "all"
      ? "Alle (Admin)"
      : options.find((o) => o.tenant_id === current)?.label ?? current;

  return (
    <form ref={formRef} action={action}>
      <div ref={containerRef} className="relative inline-block">
        <input type="hidden" name="tenant" defaultValue={current} />

        <Button
          type="button"
          variant="secondary"
          className="min-w-[240px] justify-between gap-3"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{selected}</span>
          <span className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
        </Button>

        {open && (
          <div className="absolute left-0 z-50 mt-2 min-w-full overflow-hidden rounded-[18px] border border-white/10 bg-[var(--surface)] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
            <button
              type="button"
              onClick={() => submit("all")}
              className="block w-full border-b border-white/8 px-4 py-3 text-left text-sm text-white/90 transition hover:bg-white/[0.05]"
            >
              Alle (Admin)
            </button>

            {options.map((o) => (
              <button
                key={o.tenant_id}
                type="button"
                onClick={() => submit(o.tenant_id)}
                className="block w-full px-4 py-3 text-left text-sm text-white/90 transition hover:bg-white/[0.05]"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

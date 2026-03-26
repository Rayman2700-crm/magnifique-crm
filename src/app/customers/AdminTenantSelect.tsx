"use client";

import { useEffect, useRef, useState } from "react";

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
    ) as HTMLInputElement;

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

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-[220px] rounded-xl border border-white/10 bg-[var(--surface)] px-4 py-2 text-sm text-white hover:bg-white/5"
        >
          {selected}
        </button>

        {open && (
          <div className="absolute left-0 mt-2 w-full rounded-xl border border-white/10 bg-black shadow-2xl z-50">
            <button
              type="button"
              onClick={() => submit("all")}
              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
            >
              Alle (Admin)
            </button>

            {options.map((o) => (
              <button
                key={o.tenant_id}
                type="button"
                onClick={() => submit(o.tenant_id)}
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
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
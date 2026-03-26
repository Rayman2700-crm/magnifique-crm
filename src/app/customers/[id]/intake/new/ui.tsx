"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import SignatureCanvas from "react-signature-canvas";
import { submitIntakeForm } from "./actions";

type SchemaField =
  | { key: string; label: string; type: "text" | "date"; required?: boolean }
  | { key: string; label: string; type: "yesno"; required?: boolean };

type Schema = {
  title?: string;
  fields: SchemaField[];
  consentText?: string;
};

export default function IntakeFormClient({
  customerProfileId,
  tenantId,
  templateId,
  templateVersion,
  schema,
}: {
  customerProfileId: string;
  tenantId: string;
  templateId: string;
  templateVersion: number;
  schema: Schema;
}) {
  const fields = schema?.fields ?? [];
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const sigRef = useRef<SignatureCanvas | null>(null);

  const requiredKeys = useMemo(
    () => fields.filter((f) => (f as any).required).map((f) => f.key),
    [fields]
  );

  function setValue(key: string, value: any) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function validate() {
    for (const k of requiredKeys) {
      const v = answers[k];
      if (v === undefined || v === null || String(v).trim() === "") {
        return `Bitte Feld ausfüllen: ${k}`;
      }
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      return "Bitte unterschreiben.";
    }
    return "";
  }

  return (
    <div className="rounded-2xl border p-4">
      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-sm font-medium">
              {f.label} {(f as any).required ? "*" : ""}
            </label>

            {f.type === "text" && (
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={answers[f.key] ?? ""}
                onChange={(e) => setValue(f.key, e.target.value)}
              />
            )}

            {f.type === "date" && (
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2"
                value={answers[f.key] ?? ""}
                onChange={(e) => setValue(f.key, e.target.value)}
              />
            )}

            {f.type === "yesno" && (
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={f.key}
                    checked={answers[f.key] === "yes"}
                    onChange={() => setValue(f.key, "yes")}
                  />
                  Ja
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={f.key}
                    checked={answers[f.key] === "no"}
                    onChange={() => setValue(f.key, "no")}
                  />
                  Nein
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {schema?.consentText && (
        <div className="mt-6 text-sm text-gray-600 whitespace-pre-wrap">
          {schema.consentText}
        </div>
      )}

      <div className="mt-6">
        <div className="text-sm font-medium mb-2">Unterschrift *</div>
        <div className="rounded-2xl border overflow-hidden">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            canvasProps={{ width: 900, height: 220, className: "bg-white w-full" }}
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            className="rounded-xl border px-3 py-2"
            type="button"
            onClick={() => sigRef.current?.clear()}
          >
            Signatur löschen
          </button>
        </div>
      </div>

      <div className="mt-6">
        <button
          className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
          disabled={isPending}
          type="button"
          onClick={() => {
            const msg = validate();
            if (msg) {
              setError(msg);
              return;
            }
            setError("");

            startTransition(async () => {
              const signatureDataUrl = sigRef.current!.toDataURL("image/png");
              await submitIntakeForm({
                tenantId,
                customerProfileId,
                templateId,
                templateVersion,
                answers,
                signatureDataUrl,
              });
            });
          }}
        >
          {isPending ? "Speichere..." : "Speichern & PDF erzeugen"}
        </button>
      </div>
    </div>
  );
}
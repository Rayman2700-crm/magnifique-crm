"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PDFDocument, StandardFonts } from "pdf-lib";

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

type PersonRow = { full_name: string | null };
type CustomerProfileRow = {
  id: string;
  tenant_id: string | null;
  persons: PersonRow | PersonRow[] | null;
};

export async function submitIntakeForm(input: {
  tenantId: string;
  customerProfileId: string;
  templateId: string;
  templateVersion: number;
  answers: Record<string, any>;
  signatureDataUrl: string;
}) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("id, tenant_id, person_id, persons(full_name)")
    .eq("id", input.customerProfileId)
    .single<CustomerProfileRow & { person_id: string }>();

  const personObj = Array.isArray(cp?.persons) ? cp?.persons?.[0] : cp?.persons;
  const customerName = personObj?.full_name ?? "Kunde";
  const personId = (cp as any)?.person_id as string | undefined;

  if (!personId) {
    redirect(
      `/customers/${input.customerProfileId}?error=${encodeURIComponent(
        "Kein person_id im customer_profile gefunden."
      )}`
    );
  }

  // 1) Signatur upload
  const sigBytes = dataUrlToBytes(input.signatureDataUrl);
  const signatureStoragePath = `${input.tenantId}/${input.customerProfileId}/${crypto.randomUUID()}_signature.png`;

  const { error: sigUpErr } = await supabase.storage
    .from("intake-forms")
    .upload(signatureStoragePath, sigBytes, { contentType: "image/png", upsert: false });

  if (sigUpErr) {
    redirect(
      `/customers/${input.customerProfileId}?error=${encodeURIComponent(
        "Signatur Upload fehlgeschlagen: " + sigUpErr.message
      )}`
    );
  }

  // 2) PDF erstellen
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;

  page.drawText("Magnifique CRM – Erstkundenfragebogen", {
    x: left,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 24;

  page.drawText(`Kunde: ${customerName}`, { x: left, y, size: 12, font });
  y -= 16;
  page.drawText(`Datum: ${new Date().toLocaleString()}`, { x: left, y, size: 12, font });
  y -= 24;

  for (const [k, v] of Object.entries(input.answers)) {
    if (y < 170) break;
    page.drawText(`${k}: ${v ?? ""}`, { x: left, y, size: 10, font });
    y -= 14;
  }

  const sigImg = await pdfDoc.embedPng(sigBytes);
  const sigDims = sigImg.scale(0.25);

  page.drawText("Unterschrift:", { x: left, y: 140, size: 12, font: fontBold });
  page.drawImage(sigImg, { x: left, y: 60, width: sigDims.width, height: sigDims.height });

  const pdfBytes = await pdfDoc.save();

  const pdfStoragePath = `${input.tenantId}/${input.customerProfileId}/${crypto.randomUUID()}_intake.pdf`;

  const { error: pdfUpErr } = await supabase.storage
    .from("intake-forms")
    .upload(pdfStoragePath, pdfBytes, { contentType: "application/pdf", upsert: false });

  if (pdfUpErr) {
    await supabase.storage.from("intake-forms").remove([signatureStoragePath]);
    redirect(
      `/customers/${input.customerProfileId}?error=${encodeURIComponent(
        "PDF Upload fehlgeschlagen: " + pdfUpErr.message
      )}`
    );
  }

  // 3) DB Insert (WICHTIG: deine echten Spaltennamen!)
  const { error: dbErr } = await supabase.from("intake_forms").insert({
    tenant_id: input.tenantId,
    person_id: personId,
    customer_profile_id: input.customerProfileId,
    template_id: input.templateId,
    template_version: input.templateVersion,

    answers_json: input.answers,
    signature_storage_path: signatureStoragePath,
    pdf_storage_path: pdfStoragePath,

    created_by: user.id,
    signed_at: new Date().toISOString(),
    status: "SIGNED",
  });

  if (dbErr) {
    await supabase.storage.from("intake-forms").remove([signatureStoragePath, pdfStoragePath]);
    redirect(
      `/customers/${input.customerProfileId}?error=${encodeURIComponent(
        "DB Insert fehlgeschlagen: " + dbErr.message
      )}`
    );
  }

  redirect(`/customers/${input.customerProfileId}`);
}
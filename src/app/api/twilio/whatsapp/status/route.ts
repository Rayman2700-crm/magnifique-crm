import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function supabaseAdmin() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function mapTwilioStatus(status: string) {
  const normalized = status.toLowerCase();

  if (["accepted", "scheduled", "queued"].includes(normalized)) return "QUEUED";
  if (["sending", "sent"].includes(normalized)) return "SENT";
  if (normalized === "delivered") return "DELIVERED";
  if (normalized === "read") return "READ";
  if (["failed", "undelivered", "canceled"].includes(normalized)) return "FAILED";

  return "SENT";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const messageSid = String(form.get("MessageSid") ?? form.get("SmsSid") ?? "");
    const messageStatus = String(form.get("MessageStatus") ?? form.get("SmsStatus") ?? "");
    const errorCode = String(form.get("ErrorCode") ?? "");
    const errorMessage = String(form.get("ErrorMessage") ?? "");

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status = mapTwilioStatus(messageStatus);
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {
      status,
      error_message: errorMessage || errorCode || null,
      metadata: {
        twilio_status: messageStatus,
        twilio_error_code: errorCode || null,
        twilio_error_message: errorMessage || null,
      },
    };

    if (status === "SENT") patch.sent_at = now;
    if (status === "DELIVERED") patch.delivered_at = now;
    if (status === "READ") patch.read_at = now;

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("customer_messages")
      .update(patch)
      .eq("provider", "TWILIO")
      .eq("provider_message_id", messageSid);

    if (error) {
      console.error("Twilio status: update failed", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Twilio status webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

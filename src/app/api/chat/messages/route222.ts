import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const CHAT_STORAGE_BUCKET = "team-chat";
const MAX_TEXT_LENGTH = 2000;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function normalizeMentionValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractMentionNames(text: string) {
  const matches = text.match(/(^|\s)@([^\s@]{2,60})/g) ?? [];
  const names = matches
    .map((part) => {
      const cleaned = part.trim().replace(/^@/, "").replace(/^.+@/, "");
      return cleaned.trim();
    })
    .filter(Boolean);

  return Array.from(new Set(names));
}

async function getProfile(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("tenant_id, full_name, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    tenantId: data?.tenant_id ?? null,
    fullName: data?.full_name ?? "",
    role: data?.role ?? "PRACTITIONER",
  };
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await admin
      .from("team_messages")
      .select(
        "id, text, sender_id, sender_name, created_at, edited_at, deleted_at, file_name, file_path, file_type, file_size, tenant_id"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = [...((data ?? []) as any[])].reverse();

    const messages = rows.map((row) => {
      let fileUrl: string | null = null;

      if (row.file_path) {
        const { data: publicUrlData } = admin.storage
          .from(CHAT_STORAGE_BUCKET)
          .getPublicUrl(row.file_path);

        fileUrl = publicUrlData?.publicUrl ?? null;
      }

      return {
        id: row.id,
        text: row.text,
        sender_id: row.sender_id,
        sender_name: row.sender_name,
        created_at: row.created_at,
        edited_at: row.edited_at,
        deleted_at: row.deleted_at,
        file_name: row.file_name,
        file_path: row.file_path,
        file_type: row.file_type,
        file_size: row.file_size,
        file_url: fileUrl,
        tenant_id: row.tenant_id,
      };
    });

    return NextResponse.json({ messages });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    let text = "";
    let uploadedFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      text = String(formData.get("text") ?? "").trim();

      const maybeFile = formData.get("file");
      if (maybeFile instanceof File && maybeFile.size > 0) {
        uploadedFile = maybeFile;
      }
    } else {
      const body = await req.json().catch(() => null);
      text = body?.text ? String(body.text).trim() : "";
    }

    if (!text && !uploadedFile) {
      return NextResponse.json(
        { error: "Missing text or file" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Message too long" },
        { status: 400 }
      );
    }

    if (uploadedFile && uploadedFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max. 15 MB)" },
        { status: 400 }
      );
    }

    const { tenantId, fullName } = await getProfile(supabase, user.id);

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    let filePath: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;
    let fileSize: number | null = null;

    if (uploadedFile) {
      const safeName = sanitizeFileName(uploadedFile.name || "datei");
      const ext =
        safeName.includes(".") ? safeName.split(".").pop()?.toLowerCase() : "";
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}${
        ext ? `.${ext}` : ""
      }`;

      filePath = `${tenantId}/${uniqueName}`;
      fileName = safeName;
      fileType = uploadedFile.type || "application/octet-stream";
      fileSize = uploadedFile.size;

      const arrayBuffer = await uploadedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await admin.storage
        .from(CHAT_STORAGE_BUCKET)
        .upload(filePath, buffer, {
          contentType: fileType,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message },
          { status: 500 }
        );
      }
    }

    const { data: inserted, error: insertError } = await admin
      .from("team_messages")
      .insert({
        tenant_id: tenantId,
        sender_id: user.id,
        sender_name: fullName || "Team",
        text,
        file_name: fileName,
        file_path: filePath,
        file_type: fileType,
        file_size: fileSize,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insertError) {
      if (filePath) {
        await admin.storage.from(CHAT_STORAGE_BUCKET).remove([filePath]);
      }

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const mentionNames = extractMentionNames(text);

    let mentionedUserIds = new Set<string>();

    if (inserted?.id && mentionNames.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("user_profiles")
        .select("user_id, full_name");

      if (profilesError) {
        console.error("[chat/messages POST] mention profile load failed:", profilesError.message);
      } else {
        const matchedUserIds = new Set<string>();

        for (const mentionName of mentionNames) {
          const normalizedMention = normalizeMentionValue(mentionName);

          for (const profile of profiles ?? []) {
            const fullNameValue = String(profile.full_name ?? "").trim();
            const normalizedFullName = normalizeMentionValue(fullNameValue);

            if (!normalizedFullName) continue;

            const fullMatch = normalizedFullName === normalizedMention;
            const firstNameMatch =
              normalizeMentionValue(fullNameValue.split(/\s+/)[0] ?? "") === normalizedMention;

            if (fullMatch || firstNameMatch) {
              if (profile.user_id && profile.user_id !== user.id) {
                matchedUserIds.add(String(profile.user_id));
              }
            }
          }
        }

        if (matchedUserIds.size > 0) {
          mentionedUserIds = matchedUserIds;

          const mentionRows = Array.from(matchedUserIds).map((mentionedUserId) => ({
            message_id: inserted.id,
            mentioned_user_id: mentionedUserId,
          }));

          const { error: mentionsInsertError } = await admin
            .from("team_message_mentions")
            .insert(mentionRows);

          if (mentionsInsertError) {
            console.error(
              "[chat/messages POST] mention insert failed:",
              mentionsInsertError.message
            );
          }
        }
      }
    }

    const vapidPublicKey = requireEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    const vapidPrivateKey = requireEnv("VAPID_PRIVATE_KEY");
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .neq("user_id", user.id);

    const baseBody = uploadedFile
      ? text
        ? `📎 ${text}`
        : `📎 Datei: ${fileName}`
      : text;

    for (const sub of subs ?? []) {
      try {
        const isMentioned = mentionedUserIds.has(String(sub.user_id));

        const payload = JSON.stringify({
          title: isMentioned
            ? `${fullName || "Team"} hat dich erwähnt`
            : fullName
              ? `Team: ${fullName}`
              : "Neue Team-Nachricht",
          body:
            baseBody.length > 140 ? baseBody.slice(0, 137) + "..." : baseBody,
          url: "/dashboard?openChat=1",
        });

        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (error: any) {
        const statusCode = error?.statusCode ?? "unknown";

        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id ?? null,
      created_at: inserted?.created_at ?? null,
      mentioned_user_ids: Array.from(mentionedUserIds),
    });
  } catch (error: any) {
    console.error("[chat/messages POST] fatal error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

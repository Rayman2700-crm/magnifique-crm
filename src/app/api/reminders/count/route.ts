import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

function parseStatus(notes: string | null) {
  if (!notes) return "scheduled" as const;

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const statusLine = lines.find((line) => line.toLowerCase().startsWith("status:"));
  const value = statusLine ? statusLine.replace(/^status:\s*/i, "").trim().toLowerCase() : "scheduled";

  if (value === "completed") return "completed" as const;
  if (value === "cancelled") return "cancelled" as const;
  if (value === "no_show") return "no_show" as const;
  return "scheduled" as const;
}

function parseTitle(notes: string | null) {
  if (!notes) return "Termin";

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => line.toLowerCase().startsWith("titel:"));
  return titleLine ? titleLine.replace(/^titel:\s*/i, "").trim() || "Termin" : "Termin";
}

function hasExtraGoogleCalendarMarker(notes: string | null | undefined) {
  return String(notes ?? "").toLowerCase().includes("google zusatzkalender: ja");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const admin = supabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const includeItems = request.nextUrl.searchParams.get("includeItems") === "1";

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("role, tenant_id, calendar_tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const isAdmin =
      String(profile?.role ?? "").toUpperCase() === "ADMIN" ||
      String(user.email ?? "").toLowerCase().includes("radu") ||
      String(user.email ?? "").toLowerCase().includes("admin");

    const effectiveTenantId = await getEffectiveTenantId({
      role: profile?.role ?? "PRACTITIONER",
      tenant_id: profile?.tenant_id ?? null,
      calendar_tenant_id: profile?.calendar_tenant_id ?? null,
    });

    if (!includeItems) {
      let countQuery = admin
        .from("appointments")
        .select("id, notes_internal")
        .not("reminder_at", "is", null)
        .is("reminder_sent_at", null)
        .lte("reminder_at", new Date().toISOString());

      if (!isAdmin && effectiveTenantId) {
        countQuery = countQuery.eq("tenant_id", effectiveTenantId);
      }

      const { data, error } = await countQuery;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const count = ((data ?? []) as Array<{ id: string; notes_internal: string | null }>).filter((row) => {
        const status = parseStatus(row.notes_internal);
        return (
          !hasExtraGoogleCalendarMarker(row.notes_internal) &&
          status !== "cancelled" &&
          status !== "completed" &&
          status !== "no_show"
        );
      }).length;

      return NextResponse.json({ count });
    }

    let itemsQuery = admin
      .from("appointments")
      .select(
        `
        id,
        start_at,
        end_at,
        notes_internal,
        reminder_at,
        reminder_sent_at,
        tenant_id,
        person_id,
        tenant:tenants ( display_name ),
        person:persons ( full_name, phone )
      `
      )
      .not("reminder_at", "is", null)
      .is("reminder_sent_at", null)
      .lte("reminder_at", new Date().toISOString())
      .order("start_at", { ascending: true });

    if (!isAdmin && effectiveTenantId) {
      itemsQuery = itemsQuery.eq("tenant_id", effectiveTenantId);
    }

    const { data, error } = await itemsQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filtered = ((data ?? []) as Array<any>).filter((row) => {
      const status = parseStatus(row.notes_internal);
      return (
        !hasExtraGoogleCalendarMarker(row.notes_internal) &&
        status !== "cancelled" &&
        status !== "completed" &&
        status !== "no_show"
      );
    });

    const personIds = Array.from(
      new Set(
        filtered
          .map((row) => (row?.person_id ? String(row.person_id) : null))
          .filter((value): value is string => Boolean(value))
      )
    );

    let customerProfileByTenantAndPerson = new Map<string, string>();

    if (personIds.length > 0) {
      const { data: customerProfiles, error: customerProfilesError } = await admin
        .from("customer_profiles")
        .select("id, tenant_id, person_id")
        .in("person_id", personIds);

      if (customerProfilesError) {
        return NextResponse.json({ error: customerProfilesError.message }, { status: 500 });
      }

      customerProfileByTenantAndPerson = new Map(
        ((customerProfiles ?? []) as Array<{ id: string; tenant_id: string | null; person_id: string | null }>)
          .filter((row) => row.id && row.tenant_id && row.person_id)
          .map((row) => [`${row.tenant_id}::${row.person_id}`, row.id])
      );
    }

    const items = filtered.map((row) => {
      const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
      const person = Array.isArray(row.person) ? row.person[0] : row.person;
      const tenantId = String(row.tenant_id ?? "");
      const personId = row.person_id ? String(row.person_id) : "";
      const customerProfileId = tenantId && personId
        ? customerProfileByTenantAndPerson.get(`${tenantId}::${personId}`) ?? null
        : null;

      return {
        id: String(row.id),
        start_at: String(row.start_at),
        end_at: String(row.end_at),
        title: parseTitle(row.notes_internal),
        note: "",
        status: parseStatus(row.notes_internal),
        tenantId,
        tenantName: String(tenant?.display_name ?? "Behandler"),
        customerProfileId,
        customerName: String(person?.full_name ?? "").trim() || "Walk-in",
        customerPhone: person?.phone ? String(person.phone) : null,
        customerEmail: null,
        reminderSentAt: row.reminder_sent_at ? String(row.reminder_sent_at) : null,
        canOpenCustomerProfile: Boolean(customerProfileId),
        canCreateFollowUp: true,
        canDeleteAppointment: true,
        reminderAt: row.reminder_at ? String(row.reminder_at) : null,
      };
    });

    return NextResponse.json({ count: filtered.length, items });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

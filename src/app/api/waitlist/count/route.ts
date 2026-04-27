import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveTenantId } from "@/lib/effectiveTenant";

type WaitlistBaseRow = {
  id: string;
  tenant_id: string | null;
  customer_profile_id: string | null;
  person_id: string | null;
  service_title: string | null;
  priority: string | null;
  short_notice_ok: boolean | null;
  reachable_today: boolean | null;
  requested_recently_at: string | null;
  created_at: string;
  status: string | null;
};

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

    let query = admin
      .from("appointment_waitlist")
      .select(
        "id, tenant_id, customer_profile_id, person_id, service_title, priority, short_notice_ok, reachable_today, requested_recently_at, created_at, status"
      )
      .eq("status", "active")
      .order("requested_recently_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (!isAdmin && effectiveTenantId) {
      query = query.eq("tenant_id", effectiveTenantId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as WaitlistBaseRow[]).filter((row) => String(row.status ?? "active") === "active");

    if (!includeItems) {
      return NextResponse.json({ count: rows.length });
    }

    const tenantIds = Array.from(
      new Set(rows.map((row) => String(row.tenant_id ?? "").trim()).filter(Boolean))
    );

    const customerProfileIds = Array.from(
      new Set(rows.map((row) => String(row.customer_profile_id ?? "").trim()).filter(Boolean))
    );

    const directPersonIds = rows
      .map((row) => String(row.person_id ?? "").trim())
      .filter(Boolean);

    const tenantNameById = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data: tenants, error: tenantsErr } = await admin
        .from("tenants")
        .select("id, display_name")
        .in("id", tenantIds);

      if (tenantsErr) {
        return NextResponse.json({ error: tenantsErr.message }, { status: 500 });
      }

      for (const tenant of tenants ?? []) {
        tenantNameById.set(String((tenant as any).id), String((tenant as any).display_name ?? "Behandler"));
      }
    }

    const profileById = new Map<string, { id: string; tenant_id: string | null; person_id: string | null }>();
    if (customerProfileIds.length > 0) {
      const { data: profiles, error: profilesErr } = await admin
        .from("customer_profiles")
        .select("id, tenant_id, person_id")
        .in("id", customerProfileIds);

      if (profilesErr) {
        return NextResponse.json({ error: profilesErr.message }, { status: 500 });
      }

      for (const customerProfile of profiles ?? []) {
        profileById.set(String((customerProfile as any).id), {
          id: String((customerProfile as any).id),
          tenant_id: (customerProfile as any).tenant_id ? String((customerProfile as any).tenant_id) : null,
          person_id: (customerProfile as any).person_id ? String((customerProfile as any).person_id) : null,
        });
      }
    }

    const allPersonIds = Array.from(
      new Set([
        ...directPersonIds,
        ...Array.from(profileById.values())
          .map((customerProfile) => String(customerProfile.person_id ?? "").trim())
          .filter(Boolean),
      ])
    );

    const personById = new Map<string, { full_name: string | null; phone: string | null }>();
    if (allPersonIds.length > 0) {
      const { data: persons, error: personsErr } = await admin
        .from("persons")
        .select("id, full_name, phone")
        .in("id", allPersonIds);

      if (personsErr) {
        return NextResponse.json({ error: personsErr.message }, { status: 500 });
      }

      for (const person of persons ?? []) {
        personById.set(String((person as any).id), {
          full_name: (person as any).full_name ? String((person as any).full_name) : null,
          phone: (person as any).phone ? String((person as any).phone) : null,
        });
      }
    }

    const items = rows.map((row) => {
      const tenantId = String(row.tenant_id ?? "").trim();
      const customerProfileId = String(row.customer_profile_id ?? "").trim() || null;
      const profileRow = customerProfileId ? profileById.get(customerProfileId) : null;
      const personId = String(row.person_id ?? profileRow?.person_id ?? "").trim();
      const person = personId ? personById.get(personId) : null;

      return {
        id: String(row.id),
        customerProfileId,
        tenantId,
        tenantName: tenantNameById.get(tenantId) ?? "Behandler",
        customerName: String(person?.full_name ?? "").trim() || "Kunde",
        phone: person?.phone ? String(person.phone) : null,
        serviceTitle: row.service_title ? String(row.service_title) : null,
        priority: row.priority ? String(row.priority) : null,
        shortNoticeOk: Boolean(row.short_notice_ok),
        reachableToday: Boolean(row.reachable_today),
        requestedRecentlyAt: row.requested_recently_at ? String(row.requested_recently_at) : null,
        createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
        profileExists: Boolean(customerProfileId),
      };
    });

    return NextResponse.json({ count: items.length, items });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}

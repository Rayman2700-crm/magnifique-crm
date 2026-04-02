import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawPairs = String(url.searchParams.get("pairs") ?? "").trim();
  if (!rawPairs) {
    return NextResponse.json({ items: [] });
  }

  const parsedPairs = rawPairs
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [tenant_id, person_id] = pair.split("::");
      return { tenant_id: String(tenant_id ?? "").trim(), person_id: String(person_id ?? "").trim() };
    })
    .filter((pair) => pair.tenant_id && pair.person_id);

  if (parsedPairs.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const tenantIds = Array.from(new Set(parsedPairs.map((p) => p.tenant_id)));
  const personIds = Array.from(new Set(parsedPairs.map((p) => p.person_id)));

  const { data, error } = await admin
    .from("customer_profiles")
    .select("id, tenant_id, person_id")
    .in("tenant_id", tenantIds)
    .in("person_id", personIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wanted = new Set(parsedPairs.map((p) => `${p.tenant_id}::${p.person_id}`));
  const items = (data ?? [])
    .filter((row: any) => wanted.has(`${row.tenant_id}::${row.person_id}`))
    .map((row: any) => ({
      id: String(row.id),
      tenant_id: String(row.tenant_id),
      person_id: String(row.person_id),
    }));

  return NextResponse.json({ items });
}

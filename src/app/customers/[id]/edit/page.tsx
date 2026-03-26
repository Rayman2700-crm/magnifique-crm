import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { updateCustomer } from "./actions";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { error?: string } | Promise<{ error?: string }>;
}) {
  const p = await params;
  const customerProfileId = p.id;

  const sp = searchParams ? await searchParams : undefined;

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return (
      <main className="p-6">
        <Link href="/login" className="underline">
          Bitte einloggen
        </Link>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("customer_profiles")
    .select(
      `
      id,
      person_id,
      person:persons (
        id,
        full_name,
        phone,
        email,
        birthday
      )
    `
    )
    .eq("id", customerProfileId)
    .single();

  if (error || !data) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Kunde nicht gefunden</h1>
          <Link className="rounded-xl border px-3 py-2" href="/customers">
            Zurück
          </Link>
        </div>
      </main>
    );
  }

  const person = (data as any).person;

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kunde bearbeiten</h1>
        <Link className="rounded-xl border px-3 py-2" href={`/customers/${customerProfileId}`}>
          Zurück
        </Link>
      </div>

      {sp?.error ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <form
        className="mt-6 rounded-2xl border p-4 space-y-4"
        action={updateCustomer.bind(null, customerProfileId)}
      >
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            name="full_name"
            defaultValue={person?.full_name ?? ""}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            placeholder="Vorname Nachname"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Telefon</label>
            <input
              name="phone"
              defaultValue={person?.phone ?? ""}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="+43..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">E-Mail</label>
            <input
              name="email"
              defaultValue={person?.email ?? ""}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="name@mail.com"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Geburtsdatum</label>
          <input
            name="birthday"
            type="date"
            defaultValue={person?.birthday ?? ""}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          />
        </div>

        <button className="rounded-xl bg-black text-white px-4 py-2">Speichern</button>
      </form>
    </main>
  );
}
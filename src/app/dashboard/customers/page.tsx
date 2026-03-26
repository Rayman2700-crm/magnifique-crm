import { getCustomers } from "@/lib/customers/get-customers";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Kunden</h1>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">E-Mail</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {customers?.map((item: any) => (
              <tr key={item.id} className="border-b">
                <td className="px-4 py-3">{item.persons?.full_name ?? "-"}</td>
                <td className="px-4 py-3">{item.persons?.email ?? "-"}</td>
                <td className="px-4 py-3">{item.persons?.phone ?? "-"}</td>
                <td className="px-4 py-3">{item.tenants?.display_name ?? "-"}</td>
                <td className="px-4 py-3">{item.status ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
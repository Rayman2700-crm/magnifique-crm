"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function setAdminTenant(formData: FormData) {
  const tenant = String(formData.get("tenant") ?? "all");

  const cookieStore = await cookies(); // Next (async cookies)
  cookieStore.set("admin_tenant", tenant, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/customers");
}
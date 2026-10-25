import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transitRules } from "@/db/schema";
import { getAdmin } from "@/lib/auth/admin";

export async function POST(req: Request) {
  if (!(await getAdmin())) return new NextResponse("Forbidden", { status: 403 });
  const f = await req.formData();
  const code = String(f.get("countryCode") ?? "").trim().toUpperCase(), name = String(f.get("countryName") ?? "").trim();
  if (!/^[A-Z]{2}$/.test(code) || !name) return new NextResponse("Bad request", { status: 400 });
  await (await getDb()).insert(transitRules).values({ countryCode: code, countryName: name.slice(0, 80), note: "PLACEHOLDER — not verified.", verified: false }).onConflictDoNothing();
  return NextResponse.redirect(new URL("/admin/transit", req.url), 303);
}

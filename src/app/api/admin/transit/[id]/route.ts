import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transitRules } from "@/db/schema";
import { getAdmin } from "@/lib/auth/admin";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/transit/[id]">) {
  if (!(await getAdmin())) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const f = await req.formData();
  await (await getDb()).update(transitRules).set({
    note: String(f.get("note") ?? "").slice(0, 500), verified: f.get("verified") === "on", enabled: f.get("enabled") === "on", updatedAt: new Date(),
  }).where(eq(transitRules.id, Number(id)));
  return NextResponse.redirect(new URL("/admin/transit", req.url), 303);
}

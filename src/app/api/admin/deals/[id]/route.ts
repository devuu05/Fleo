import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deals } from "@/db/schema";
import { getAdmin } from "@/lib/auth/admin";

const ALLOWED = ["published", "rejected", "pending"];

export async function POST(req: Request, ctx: RouteContext<"/api/admin/deals/[id]">) {
  if (!(await getAdmin())) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const status = String((await req.formData()).get("status"));
  if (!ALLOWED.includes(status) || !Number.isInteger(Number(id))) return new NextResponse("Bad request", { status: 400 });
  await (await getDb()).update(deals).set({ status, reviewedAt: new Date() }).where(eq(deals.id, Number(id)));
  return NextResponse.redirect(new URL(req.headers.get("referer") ? new URL(req.headers.get("referer")!).pathname + new URL(req.headers.get("referer")!).search : "/admin", req.url), 303);
}

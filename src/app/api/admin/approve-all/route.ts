import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deals } from "@/db/schema";
import { getAdmin } from "@/lib/auth/admin";

export async function POST(req: Request) {
  if (!(await getAdmin())) return new NextResponse("Forbidden", { status: 403 });
  await (await getDb()).update(deals).set({ status: "published", reviewedAt: new Date() }).where(eq(deals.status, "pending"));
  return NextResponse.redirect(new URL("/admin", req.url), 303);
}

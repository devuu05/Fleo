import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { markPaid } from "@/lib/billing/premium";
import { testCheckoutEnabled } from "@/lib/billing/razorpay";

// Fake "payment succeeded" for local demos. Gone once Razorpay keys exist or in production.
export async function POST(req: Request) {
  if (!testCheckoutEnabled()) return new NextResponse("Not found", { status: 404 });
  const user = await getSessionUser();
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!user || !orderId) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const db = await getDb();
  const [p] = await db.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.userId, user.id), eq(payments.provider, "test")));
  if (!p) return NextResponse.json({ error: "unknown order" }, { status: 404 });
  return NextResponse.json({ result: await markPaid(db, orderId, `testpay_${orderId}`) });
}

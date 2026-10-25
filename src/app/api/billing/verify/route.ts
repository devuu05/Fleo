import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { markPaid } from "@/lib/billing/premium";
import { verifyPaymentSignature } from "@/lib/billing/razorpay";

// Browser callback after Razorpay Checkout. Never trust the client: check the HMAC and that the order is ours.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const user = await getSessionUser();
  const b = (await req.json().catch(() => ({}))) as { orderId?: string; paymentId?: string; signature?: string };
  if (!secret || !user || !b.orderId || !b.paymentId || !b.signature) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!verifyPaymentSignature(b.orderId, b.paymentId, b.signature, secret)) return NextResponse.json({ error: "bad signature" }, { status: 400 });
  const db = await getDb();
  const [p] = await db.select().from(payments).where(and(eq(payments.orderId, b.orderId), eq(payments.userId, user.id)));
  if (!p) return NextResponse.json({ error: "unknown order" }, { status: 404 });
  return NextResponse.json({ result: await markPaid(db, b.orderId, b.paymentId) });
}

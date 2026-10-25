import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth/session";
import { createPendingPayment } from "@/lib/billing/premium";
import { createRazorpayOrder, razorpayConfigured, testCheckoutEnabled } from "@/lib/billing/razorpay";
import { config } from "@/lib/config";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });
  const db = await getDb();
  const amountInr = config.billing.planAmountInr;

  if (razorpayConfigured()) {
    const order = await createRazorpayOrder({ amountInr, receipt: `fleo_${user.id}_${Date.now()}` });
    await createPendingPayment(db, { userId: user.id, provider: "razorpay", orderId: order.id, amountInr });
    return NextResponse.json({ mode: "razorpay", orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amountInr, email: user.email });
  }
  if (testCheckoutEnabled()) {
    const orderId = `test_${randomUUID()}`;
    await createPendingPayment(db, { userId: user.id, provider: "test", orderId, amountInr });
    return NextResponse.json({ mode: "test", orderId, amountInr });
  }
  return NextResponse.json({ error: "payments not configured" }, { status: 503 });
}

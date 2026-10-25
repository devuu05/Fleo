import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { markPaid } from "@/lib/billing/premium";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";

// Razorpay dashboard -> Webhooks: URL /api/billing/webhook, events payment.captured + order.paid,
// secret = RAZORPAY_WEBHOOK_SECRET. This covers users who close the tab before the callback fires.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const raw = await req.text(); // signature is over the exact raw bytes
  if (!secret || !verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), secret)) return new NextResponse("bad signature", { status: 400 });
  const evt = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string } } } };
  const pay = evt.payload?.payment?.entity;
  if ((evt.event === "payment.captured" || evt.event === "order.paid") && pay?.order_id) await markPaid(await getDb(), pay.order_id, pay.id);
  return NextResponse.json({ ok: true }); // 200 for everything else so Razorpay doesn't retry
}

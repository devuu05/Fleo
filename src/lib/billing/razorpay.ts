import { createHmac, timingSafeEqual } from "node:crypto";

export const razorpayConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Test checkout (no money moves) exists only without Razorpay keys and outside production. */
export const testCheckoutEnabled = () => !razorpayConfigured() && process.env.NODE_ENV !== "production";

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8"), y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

/** Checkout success callback: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  return !!signature && safeEqualHex(hmac(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook: HMAC_SHA256(raw body, webhook_secret) in X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  return !!signature && safeEqualHex(hmac(secret, rawBody), signature);
}

export async function createRazorpayOrder(o: { amountInr: number; receipt: string; fetchImpl?: typeof fetch }): Promise<{ id: string }> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await (o.fetchImpl ?? fetch)("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: o.amountInr * 100, currency: "INR", receipt: o.receipt }), // amount is in paise
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
  return (await res.json()) as { id: string };
}

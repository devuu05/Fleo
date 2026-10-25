import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { memoryDb } from "../src/db";
import { users } from "../src/db/schema";
import { createPendingPayment, extendPremium, isPremiumNow, markPaid } from "../src/lib/billing/premium";
import { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } from "../src/lib/billing/razorpay";
import { eq } from "drizzle-orm";

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

describe("razorpay signatures", () => {
  it("accepts a correct payment signature and rejects tampering", () => {
    const sig = sign("sek", "order_1|pay_1");
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "sek")).toBe(true);
    expect(verifyPaymentSignature("order_1", "pay_2", sig, "sek")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", sig, "other")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", "", "sek")).toBe(false);
    expect(verifyPaymentSignature("order_1", "pay_1", "abc", "sek")).toBe(false); // wrong length must not throw
  });
  it("verifies webhooks over the raw body", () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign("wh", body), "wh")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sign("wh", body), "wh")).toBe(false);
    expect(verifyWebhookSignature(body, null, "wh")).toBe(false);
  });
  it("creates orders in paise with basic auth", async () => {
    process.env.RAZORPAY_KEY_ID = "kid"; process.env.RAZORPAY_KEY_SECRET = "ksec";
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: "order_X" }), { status: 200 }); }) as unknown as typeof fetch;
    expect((await createRazorpayOrder({ amountInr: 1499, receipt: "r1", fetchImpl })).id).toBe("order_X");
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({ amount: 149900, currency: "INR" });
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("kid:ksec").toString("base64"));
  });
});

describe("premium period", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("expires; null expiry with the flag is a manual, non-expiring grant", () => {
    expect(isPremiumNow({ isPremium: false, premiumUntil: null }, now)).toBe(false);
    expect(isPremiumNow({ isPremium: true, premiumUntil: null }, now)).toBe(true);
    expect(isPremiumNow({ isPremium: true, premiumUntil: new Date("2026-06-01") }, now)).toBe(true);
    expect(isPremiumNow({ isPremium: true, premiumUntil: new Date("2025-12-31") }, now)).toBe(false);
  });
  it("renewing early stacks on the remaining time", () => {
    expect(extendPremium(null, now, 365).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(extendPremium(new Date("2026-02-01T00:00:00Z"), now, 365).toISOString()).toBe("2027-02-01T00:00:00.000Z");
    expect(extendPremium(new Date("2025-01-01"), now, 365).toISOString()).toBe("2027-01-01T00:00:00.000Z"); // lapsed
  });
});

describe("markPaid", () => {
  it("grants once, is idempotent across callback + webhook, ignores unknown orders", async () => {
    const db = await memoryDb();
    const [u] = await db.insert(users).values({ email: "a@b.co" }).returning();
    await createPendingPayment(db, { userId: u.id, provider: "razorpay", orderId: "order_1", amountInr: 1499 });
    const t = new Date("2026-03-01T00:00:00Z");
    expect(await markPaid(db, "order_1", "pay_1", t)).toBe("granted");
    expect(await markPaid(db, "order_1", "pay_1", t)).toBe("already");
    expect(await markPaid(db, "nope", "pay_9", t)).toBe("unknown");
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after.isPremium).toBe(true);
    expect(after.premiumUntil?.toISOString()).toBe("2027-03-01T00:00:00.000Z"); // 365 days, granted once
  });
});

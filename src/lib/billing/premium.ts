import { and, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { payments, users } from "../../db/schema";
import { config } from "../config";

/** isPremium flag + optional expiry. premiumUntil null with the flag set = manual grant that never expires. */
export function isPremiumNow(u: { isPremium: boolean; premiumUntil: Date | null }, now = new Date()): boolean {
  return u.isPremium && (u.premiumUntil === null || u.premiumUntil.getTime() > now.getTime());
}

/** Renewing early extends from the current expiry instead of wasting the remaining days. */
export function extendPremium(current: Date | null, now = new Date(), days = config.billing.planDays): Date {
  const from = current && current.getTime() > now.getTime() ? current : now;
  return new Date(from.getTime() + days * 86_400_000);
}

export async function createPendingPayment(db: Db, p: { userId: number; provider: "razorpay" | "test"; orderId: string; amountInr: number }) {
  await db.insert(payments).values(p);
}

/**
 * Idempotent: Razorpay may deliver both the browser callback and the webhook, and
 * webhooks retry. Only the first call that flips created -> paid grants premium.
 */
export async function markPaid(db: Db, orderId: string, paymentId: string, now = new Date()): Promise<"granted" | "already" | "unknown"> {
  return db.transaction(async (tx) => {
    const flipped = await tx.update(payments).set({ status: "paid", paymentId, paidAt: now })
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "created"))).returning();
    if (flipped.length === 0) {
      const [exists] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.orderId, orderId));
      return exists ? "already" : "unknown";
    }
    const [u] = await tx.select().from(users).where(eq(users.id, flipped[0].userId));
    await tx.update(users).set({ isPremium: true, premiumUntil: extendPremium(u.isPremium ? u.premiumUntil : null, now) }).where(eq(users.id, u.id));
    return "granted";
  });
}

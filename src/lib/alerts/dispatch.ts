import { and, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "../../db";
import { alerts, deals, routes, userPreferences, users } from "../../db/schema";
import { ORIGIN_CITY } from "../config";
import { accessFor } from "../gating";
import { isPremiumNow } from "../billing/premium";
import { inr, dateLabel, stopsLabel } from "../format";
import { matchesPreferences } from "./match";
import { createNotifiers, type Notifier } from "./notifier";

export function composeAlert(d: {
  originCity: string; destinationCity: string; cabin: string; priceInr: number; baselineInr: number; pctBelow: number;
  departDate: string; airline: string | null; stops: number; isErrorFare: boolean; deepLink: string | null; verifiedAt: Date | null;
}, siteUrl: string) {
  const subject = `${d.isErrorFare ? "⚠️ Possible error fare: " : ""}${d.originCity} → ${d.destinationCity} ${inr(d.priceInr)} (${Math.round(d.pctBelow)}% below usual)`;
  const lines = [
    `${d.originCity} → ${d.destinationCity} · ${d.cabin} · ${dateLabel(d.departDate)}`,
    `${inr(d.priceInr)} (usually ${inr(d.baselineInr)})`,
    [d.airline, stopsLabel(d.stops)].filter(Boolean).join(" · "),
    d.verifiedAt ? "✓ Checked live when posted." : "",
    d.isErrorFare ? "Possible error fare: the airline may cancel it. Don't buy non-refundable extras until confirmed." : "",
    d.deepLink ? `Book: ${d.deepLink}` : "",
    `All deals: ${siteUrl}`,
    "Fares come from cached searches; confirm the price before paying. Booking links are affiliate links.",
  ].filter(Boolean);
  return { subject, text: lines.join("\n") };
}

/**
 * For each deal found in the last `lookbackDays`, alert every opted-in user who
 * (a) matches the deal against their preferences and (b) is *allowed to see it right
 * now* under free/premium gating. Free users therefore get their 1-in-10 deals only
 * once the 24h delay has passed. Idempotent: the outbox has a unique key per
 * (user, deal, channel, price), so re-running never double-sends, while a further price
 * drop (new price) sends again.
 */
export async function dispatchAlerts(db: Db, o: { now?: Date; lookbackDays?: number; notifiers?: Notifier[]; siteUrl?: string; log?: (m: string) => void } = {}) {
  const now = o.now ?? new Date();
  const notifiers = o.notifiers ?? createNotifiers();
  const siteUrl = o.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const since = new Date(now.getTime() - (o.lookbackDays ?? 3) * 86_400_000);

  const recent = await db.select({ d: deals, r: routes }).from(deals).innerJoin(routes, eq(deals.routeId, routes.id))
    .where(and(eq(deals.status, "published"), gte(deals.foundAt, since)));
  const subs = await db.select({ u: users, p: userPreferences }).from(userPreferences)
    .innerJoin(users, eq(userPreferences.userId, users.id)).where(eq(userPreferences.alertsEmail, true));

  // one query for everything already sent, instead of one per (user, deal, channel)
  const sentKeys = new Set<string>();
  if (recent.length) {
    for (const a of await db.select().from(alerts).where(inArray(alerts.dealId, recent.map(({ d }) => d.id)))) sentKeys.add(`${a.userId}|${a.dealId}|${a.channel}|${a.priceInr}`);
  }
  const stats = { considered: 0, sent: 0, logged: 0, failed: 0, skippedGated: 0, skippedDuplicate: 0 };
  for (const { u, p } of subs) {
    const viewer = { isPremium: isPremiumNow(u, now) };
    for (const { d, r } of recent) {
      if (!matchesPreferences({ origin: r.origin, destination: r.destination, cabin: d.cabin }, p)) continue;
      stats.considered++;
      if (accessFor({ id: d.id, foundAt: d.foundAt }, viewer, now) !== "full") { stats.skippedGated++; continue; }

      for (const n of notifiers) {
        const sk = `${u.id}|${d.id}|${n.channel}|${d.priceInr}`;
        if (sentKeys.has(sk)) { stats.skippedDuplicate++; continue; }
        sentKeys.add(sk);
        const msg = composeAlert({ ...d, originCity: ORIGIN_CITY[r.origin] ?? r.origin, destinationCity: r.destinationCity }, siteUrl);
        let status: "sent" | "logged" | "failed" = n.live ? "sent" : "logged", error: string | null = null;
        try { await n.send({ to: u.email, ...msg }); } catch (e) { status = "failed"; error = (e as Error).message; }
        // A failed send is recorded too, but under the same unique key it won't be retried automatically.
        await db.insert(alerts).values({ userId: u.id, dealId: d.id, channel: n.channel, priceInr: d.priceInr, subject: msg.subject, body: msg.text, status, error }).onConflictDoNothing();
        stats[status]++;
      }
    }
  }
  o.log?.(JSON.stringify(stats));
  return stats;
}

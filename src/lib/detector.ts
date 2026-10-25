import { and, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { deals, priceSnapshots, routes, transitRules } from "../db/schema";
import { config } from "./config";
import { baselineUsable, evaluate, isStale, passesFilters, shouldRepost, visaWarnings, type BaselineStats } from "./detector-core";
import type { FareVerifier } from "./types";

export interface DetectOptions {
  now?: Date;
  /** snapshots newer than this are "candidates"; older ones form the baseline */
  lookbackHours?: number;
  requireReview?: boolean; // new deals start 'pending' until an admin approves (default: REVIEW_REQUIRED=1)
  verifier?: FareVerifier; // future: live price check (e.g. Duffel) before publishing
  log?: (m: string) => void;
}

const key = (...p: (string | number)[]) => p.join("|");
const rowsOf = (r: unknown): Record<string, unknown>[] => (Array.isArray(r) ? r : (r as { rows: Record<string, unknown>[] }).rows);

export async function loadBaselines(db: Db, from: Date, to: Date): Promise<Map<string, BaselineStats>> {
  const res = await db.execute(sql`
    select route_id, depart_month, cabin,
           percentile_cont(0.5) within group (order by price_inr) as med,
           count(*)::int as n,
           coalesce(extract(epoch from (max(fetched_at) - min(fetched_at))) / 86400, 0) as span
    from price_snapshots
    where fetched_at >= ${from.toISOString()}::timestamptz and fetched_at < ${to.toISOString()}::timestamptz
    group by route_id, depart_month, cabin`);
  const map = new Map<string, BaselineStats>();
  for (const r of rowsOf(res)) {
    map.set(key(r.route_id as number, r.depart_month as string, r.cabin as string), {
      medianInr: r.med == null ? null : Number(r.med), count: Number(r.n), spanDays: Number(r.span),
    });
  }
  return map;
}

export async function runDetector(db: Db, o: DetectOptions = {}) {
  const now = o.now ?? new Date();
  const lookbackMs = (o.lookbackHours ?? Number(process.env.DETECT_LOOKBACK_HOURS ?? 6)) * 3_600_000;
  const windowStart = new Date(now.getTime() - lookbackMs);
  const baselineFrom = new Date(now.getTime() - config.detection.baselineDays * 86_400_000);

  const baselines = await loadBaselines(db, baselineFrom, windowStart);
  const rules = await db.select().from(transitRules);
  const candidates = await db.select().from(priceSnapshots)
    .where(and(gte(priceSnapshots.fetchedAt, windowStart), lte(priceSnapshots.fetchedAt, now)));

  // cheapest candidate per route + cabin + dates
  const cheapest = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const k = key(c.routeId, c.cabin, c.departDate, c.returnDate ?? "");
    const cur = cheapest.get(k);
    if (!cur || c.priceInr < cur.priceInr) cheapest.set(k, c);
  }

  // only deals that can still be flown matter for de-duplication (keeps this query small as history grows)
  const existing = new Map<string, number>();
  const today = now.toISOString().slice(0, 10);
  for (const d of await db.select().from(deals).where(gte(deals.departDate, today))) existing.set(key(d.routeId, d.cabin, d.departDate, d.returnDate), d.priceInr);
  const routeById = new Map((await db.select().from(routes)).map((r) => [r.id, r]));

  const stats = { candidates: cheapest.size, noBaseline: 0, notDeal: 0, filtered: 0, duplicate: 0, unverified: 0, verifiedGone: 0, verifyDeferred: 0, stale: 0, created: 0, reposted: 0 };

  // 1) cheap checks first, no network
  const found: { c: (typeof candidates)[number]; baseline: number }[] = [];
  for (const c of cheapest.values()) {
    const b = baselines.get(key(c.routeId, c.departMonth, c.cabin));
    if (!baselineUsable(b)) { stats.noBaseline++; continue; }
    if (isStale(c.observedAt, now)) { stats.stale++; continue; }
    if (!evaluate(c.priceInr, b.medianInr).isDeal) { stats.notDeal++; continue; }
    if (!passesFilters(c)) { stats.filtered++; continue; }
    const prev = existing.get(key(c.routeId, c.cabin, c.departDate, c.returnDate ?? ""));
    if (!shouldRepost(prev, c.priceInr)) { stats.duplicate++; continue; }
    found.push({ c, baseline: b.medianInr });
  }
  // 2) biggest discounts first, so a limited live-check budget goes to the best deals
  found.sort((x, y) => (y.baseline - y.c.priceInr) / y.baseline - (x.baseline - x.c.priceInr) / x.baseline);

  let verifyBudget = config.verification.maxPerRun;
  for (const { c, baseline } of found) {
    let price = c.priceInr, verifiedAt: Date | null = null;
    const route = routeById.get(c.routeId)!;

    if (o.verifier) {
      if (verifyBudget-- <= 0) { stats.verifyDeferred++; continue; } // picked up on a later run
      const v = await o.verifier.verify({
        origin: route.origin, destination: route.destination, cabin: c.cabin as "economy" | "business", departDate: c.departDate,
        returnDate: c.returnDate, priceInr: c.priceInr, airline: c.airline, stops: c.stops, durationMinutes: c.durationMinutes,
        transitCountries: c.transitCountries, deepLink: c.deepLink, observedAt: c.observedAt, gate: c.gate,
      });
      if (!v.ok) { if (v.reason === "error") stats.unverified++;
        else stats.verifiedGone++;
        continue; }
      if (v.livePriceInr) price = v.livePriceInr; // the live price is the truth, not the cached one
      verifiedAt = now;
    }

    // re-evaluate with the price we'll actually publish (it may have moved)
    const ev = evaluate(price, baseline);
    if (!ev.isDeal) { stats.notDeal++; continue; }
    const ret = c.returnDate ?? "";
    const prevNow = existing.get(key(c.routeId, c.cabin, c.departDate, ret));
    if (!shouldRepost(prevNow, price)) { stats.duplicate++; continue; }

    const values = {
      routeId: c.routeId, cabin: c.cabin, departDate: c.departDate, departMonth: c.departMonth, returnDate: ret,
      priceInr: price, baselineInr: Math.round(baseline), pctBelow: ev.pctBelow, savingsInr: ev.savingsInr,
      airline: c.airline, stops: c.stops, durationMinutes: c.durationMinutes, isErrorFare: ev.isErrorFare,
      visaWarnings: visaWarnings(c.transitCountries, c.stops, rules), deepLink: c.deepLink, observedAt: c.observedAt, gate: c.gate,
      verifiedAt, source: c.source, foundAt: now,
    };
    // status only applies on first insert: a re-post must not undo an admin's approve/reject
    const status = (o.requireReview ?? config.review.required) ? "pending" : "published";
    await db.insert(deals).values({ ...values, status }).onConflictDoUpdate({
      target: [deals.routeId, deals.cabin, deals.departDate, deals.returnDate],
      set: values,
    });
    if (prevNow === undefined) stats.created++;
    else stats.reposted++;
    existing.set(key(c.routeId, c.cabin, c.departDate, ret), price);
  }
  o.log?.(JSON.stringify(stats));
  return stats;
}

import { and, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { deals, priceSnapshots, transitRules } from "../db/schema";
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

  const existing = new Map<string, number>();
  for (const d of await db.select().from(deals)) existing.set(key(d.routeId, d.cabin, d.departDate, d.returnDate), d.priceInr);

  const stats = { candidates: cheapest.size, noBaseline: 0, notDeal: 0, filtered: 0, duplicate: 0, unverified: 0, stale: 0, created: 0, reposted: 0 };

  for (const c of cheapest.values()) {
    const b = baselines.get(key(c.routeId, c.departMonth, c.cabin));
    if (!baselineUsable(b)) { stats.noBaseline++; continue; }
    if (isStale(c.observedAt, now)) { stats.stale++; continue; }
    const ev = evaluate(c.priceInr, b.medianInr);
    if (!ev.isDeal) { stats.notDeal++; continue; }
    if (!passesFilters(c)) { stats.filtered++; continue; }

    const ret = c.returnDate ?? "";
    const prev = existing.get(key(c.routeId, c.cabin, c.departDate, ret));
    if (!shouldRepost(prev, c.priceInr)) { stats.duplicate++; continue; }

    if (o.verifier) {
      const v = await o.verifier.verify({
        origin: "", destination: "", cabin: c.cabin as "economy" | "business", departDate: c.departDate, returnDate: c.returnDate,
        priceInr: c.priceInr, airline: c.airline, stops: c.stops, durationMinutes: c.durationMinutes,
        transitCountries: c.transitCountries, deepLink: c.deepLink, observedAt: c.observedAt, gate: c.gate,
      });
      if (!v.ok) { stats.unverified++; continue; }
    }

    const values = {
      routeId: c.routeId, cabin: c.cabin, departDate: c.departDate, departMonth: c.departMonth, returnDate: ret,
      priceInr: c.priceInr, baselineInr: Math.round(b.medianInr), pctBelow: ev.pctBelow, savingsInr: ev.savingsInr,
      airline: c.airline, stops: c.stops, durationMinutes: c.durationMinutes, isErrorFare: ev.isErrorFare,
      visaWarnings: visaWarnings(c.transitCountries, c.stops, rules), deepLink: c.deepLink, observedAt: c.observedAt, gate: c.gate, source: c.source, foundAt: now,
    };
    // status only applies on first insert: a re-post must not undo an admin's approve/reject
    const status = (o.requireReview ?? config.review.required) ? "pending" : "published";
    await db.insert(deals).values({ ...values, status }).onConflictDoUpdate({
      target: [deals.routeId, deals.cabin, deals.departDate, deals.returnDate],
      set: values,
    });
    if (prev === undefined) stats.created++;
    else stats.reposted++;
    existing.set(key(c.routeId, c.cabin, c.departDate, ret), c.priceInr);
  }
  o.log?.(JSON.stringify(stats));
  return stats;
}

import type { Db } from "../db";
import { priceSnapshots, routes } from "../db/schema";
import { eq } from "drizzle-orm";
import { config } from "./config";
import type { Cabin, FareProvider } from "./types";

export function targetMonths(now: Date, from = config.collector.monthsAheadFrom, to = config.collector.monthsAheadTo): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1)).toISOString().slice(0, 7));
  return out;
}

export interface CollectOptions {
  provider: FareProvider;
  now?: Date; // stamped on every snapshot (history backfill passes past dates)
  months?: string[];
  cabins?: readonly Cabin[];
  log?: (msg: string) => void;
}

export async function runCollector(db: Db, o: CollectOptions) {
  const now = o.now ?? new Date();
  const months = o.months ?? targetMonths(now);
  const cabins = o.cabins ?? config.collector.cabins;
  const log = o.log ?? (() => {});
  const active = await db.select().from(routes).where(eq(routes.active, true));

  let queries = 0, failures = 0, inserted = 0;
  let buffer: (typeof priceSnapshots.$inferInsert)[] = [];
  const flush = async () => {
    for (let i = 0; i < buffer.length; i += 1000) await db.insert(priceSnapshots).values(buffer.slice(i, i + 1000));
    inserted += buffer.length;
    buffer = [];
  };

  for (const route of active) {
    for (const month of months) {
      for (const cabin of cabins) {
        queries++;
        try {
          const fares = await o.provider.fetchMonth({ origin: route.origin, destination: route.destination, month, cabin });
          for (const f of fares) {
            buffer.push({
              routeId: route.id, cabin, departDate: f.departDate, departMonth: f.departDate.slice(0, 7),
              returnDate: f.returnDate, priceInr: f.priceInr, airline: f.airline, stops: f.stops,
              durationMinutes: f.durationMinutes, transitCountries: f.transitCountries,
              deepLink: f.deepLink, source: o.provider.name, fetchedAt: now,
            });
          }
        } catch (e) {
          failures++;
          log(`fetch failed ${route.origin}-${route.destination} ${month} ${cabin}: ${(e as Error).message}`);
        }
      }
    }
    if (buffer.length >= 5000) await flush();
  }
  await flush();
  return { routes: active.length, queries, failures, inserted };
}

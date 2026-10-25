import type { Db } from "../db";
import { priceSnapshots, routes } from "../db/schema";
import { eq } from "drizzle-orm";
import { config } from "./config";
import { HttpError } from "./http";
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
  // Optional narrowing for tests / API-budget control: COLLECT_ORIGINS=DEL,BOM COLLECT_DESTINATIONS=BKK,DXB
  const list = (v?: string) => (v ? v.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) : []);
  const [onlyO, onlyD] = [list(process.env.COLLECT_ORIGINS), list(process.env.COLLECT_DESTINATIONS)];
  const active = (await db.select().from(routes).where(eq(routes.active, true)))
    .filter((r) => (!onlyO.length || onlyO.includes(r.origin)) && (!onlyD.length || onlyD.includes(r.destination)));

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
              deepLink: f.deepLink, observedAt: f.observedAt, gate: f.gate, source: o.provider.name, fetchedAt: now,
            });
          }
        } catch (e) {
          // A rejected token fails every call identically; stop instead of sending thousands more.
          if (e instanceof HttpError && (e.status === 401 || e.status === 403)) throw new Error(`Data source rejected the credentials (HTTP ${e.status}). Check TRAVELPAYOUTS_TOKEN.`);
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

import { sql } from "drizzle-orm";
import type { Db } from "../db";

export interface PriceRow {
  origin: string; destination: string; destinationCity: string; cabin: string; departDate: string; priceInr: number;
  airline: string | null; stops: number; durationMinutes: number | null; deepLink: string | null; fetchedAt: Date; source: string;
}
export interface PriceFilters { from?: string; to?: string; cabin?: string; month?: string }

const rows = (r: unknown): Record<string, unknown>[] => (Array.isArray(r) ? r : (r as { rows: Record<string, unknown>[] }).rows);

/** Latest stored price for each route + cabin + date, cheapest first. Raw data: no deal logic, no gating. */
export async function latestPrices(db: Db, f: PriceFilters, limit = 60): Promise<PriceRow[]> {
  const res = await db.execute(sql`
    select * from (
      select distinct on (s.route_id, s.cabin, s.depart_date)
        r.origin, r.destination, r.destination_city, s.cabin, s.depart_date, s.depart_month, s.price_inr,
        s.airline, s.stops, s.duration_minutes, s.deep_link, s.fetched_at, s.source
      from price_snapshots s join routes r on r.id = s.route_id
      order by s.route_id, s.cabin, s.depart_date, s.fetched_at desc
    ) t
    where (${f.from ?? null}::text is null or origin = ${f.from ?? null})
      and (${f.to ?? null}::text is null or destination = ${f.to ?? null})
      and (${f.cabin ?? null}::text is null or cabin = ${f.cabin ?? null})
      and (${f.month ?? null}::text is null or depart_month = ${f.month ?? null})
    order by price_inr asc limit ${limit}`);
  return rows(res).map((r) => ({
    origin: r.origin as string, destination: r.destination as string, destinationCity: r.destination_city as string,
    cabin: r.cabin as string, departDate: r.depart_date as string, priceInr: Number(r.price_inr), airline: r.airline as string | null,
    stops: Number(r.stops), durationMinutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
    deepLink: r.deep_link as string | null, fetchedAt: new Date(r.fetched_at as string), source: r.source as string,
  }));
}

import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { deals, routes } from "../db/schema";
import { config, DESTINATIONS, ORIGIN_CITY } from "./config";
import { accessFor, hoursUntilFree, type Access, type Viewer } from "./gating";

export interface FeedFilters { from?: string; cabin?: string; month?: string; prefs?: { origins: string[]; destinations: string[]; cabins: string[] } }

interface Base { id: number; access: Access; origin: string; originCity: string; destination: string; destinationCity: string; cabin: string; foundAt: string }
export interface FullDeal extends Base {
  access: "full";
  departDate: string; returnDate: string | null; priceInr: number; baselineInr: number; pctBelow: number; savingsInr: number;
  airline: string | null; stops: number; durationMinutes: number | null; isErrorFare: boolean;
  visaWarnings: { country: string; note: string }[]; deepLink: string | null; observedAt: string | null; gate: string | null;
}
export interface TeaserDeal extends Base { access: "locked" | "delayed"; hoursUntilFree?: number }
export type FeedItem = FullDeal | TeaserDeal;

/**
 * Gating happens here, server-side: locked/delayed deals are stripped to a
 * teaser (route + cabin only) so price, dates and the affiliate link never
 * reach the browser of a viewer who isn't entitled to them.
 */
export async function getFeed(db: Db, filters: FeedFilters, viewer: Viewer, now = new Date(), limit = 100): Promise<FeedItem[]> {
  const pf = filters.prefs;
  const conds = [
    eq(deals.status, "published"),
    pf?.origins.length ? inArray(routes.origin, pf.origins) : undefined,
    pf?.destinations.length ? inArray(routes.destination, pf.destinations) : undefined,
    pf?.cabins.length ? inArray(deals.cabin, pf.cabins) : undefined,
    filters.from ? eq(routes.origin, filters.from) : undefined,
    filters.cabin === "economy" || filters.cabin === "business" ? eq(deals.cabin, filters.cabin) : undefined,
    filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? eq(deals.departMonth, filters.month) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db.select({ d: deals, r: routes }).from(deals).innerJoin(routes, eq(deals.routeId, routes.id))
    .where(and(...conds)).orderBy(desc(deals.foundAt)).limit(limit);

  return rows.map(({ d, r }): FeedItem => {
    const access = accessFor({ id: d.id, foundAt: d.foundAt }, viewer, now, config.gating);
    const base: Base = {
      id: d.id, access, origin: r.origin, originCity: ORIGIN_CITY[r.origin] ?? r.origin,
      destination: r.destination, destinationCity: r.destinationCity, cabin: d.cabin, foundAt: d.foundAt.toISOString(),
    };
    if (access !== "full") return { ...base, access, hoursUntilFree: access === "delayed" ? hoursUntilFree(d.foundAt, now) : undefined };
    return {
      ...base, access: "full", departDate: d.departDate, returnDate: d.returnDate || null, priceInr: d.priceInr,
      baselineInr: d.baselineInr, pctBelow: d.pctBelow, savingsInr: d.savingsInr, airline: d.airline, stops: d.stops,
      durationMinutes: d.durationMinutes, isErrorFare: d.isErrorFare, visaWarnings: d.visaWarnings, deepLink: d.deepLink, observedAt: d.observedAt?.toISOString() ?? null, gate: d.gate,
    };
  });
}

export async function filterOptions(db: Db) {
  const rows = await db.selectDistinct({ month: deals.departMonth }).from(deals).where(eq(deals.status, "published")).orderBy(deals.departMonth);
  return { months: rows.map((r) => r.month), origins: Object.entries(ORIGIN_CITY), destinations: DESTINATIONS };
}

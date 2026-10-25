import { DESTINATIONS, ORIGINS } from "./config";
import type { Db } from "../db";
import { routes, transitRules } from "../db/schema";

// Routes used in SAMPLE_DATA mode (keeps the demo fast). Includes every planted deal.
const SAMPLE_DESTS = ["DXB", "SIN", "BKK", "KUL", "LHR", "CDG", "FRA", "SYD", "HKG", "JFK", "DOH", "IST"];

export async function seedRoutes(db: Db, sample: boolean) {
  const dests = sample ? DESTINATIONS.filter((d) => SAMPLE_DESTS.includes(d.code)) : DESTINATIONS;
  const rows = ORIGINS.flatMap((origin) =>
    dests.map((d) => ({ origin, destination: d.code, destinationCity: d.city, destinationCountry: d.country })),
  );
  await db.insert(routes).values(rows).onConflictDoNothing();
  return rows.length;
}

const VERIFY = "PLACEHOLDER — not verified. Check the destination/transit country's official rules and the airline before relying on this.";

/**
 * Placeholder transit-visa watch-list. These are NOT statements of fact: each
 * row is `verified=false` and shows as "verify" in the UI. Edit/replace after
 * checking official sources.
 */
export async function seedTransitRules(db: Db) {
  const rows = [
    ["GB", "United Kingdom"], ["DE", "Germany"], ["US", "United States"], ["CA", "Canada"],
    ["AU", "Australia"], ["CN", "China"], ["ZA", "South Africa"], ["RU", "Russia"],
  ].map(([countryCode, countryName]) => ({ countryCode, countryName, note: VERIFY, verified: false }));
  await db.insert(transitRules).values(rows).onConflictDoNothing();
}

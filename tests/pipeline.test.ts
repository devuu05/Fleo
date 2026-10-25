import { describe, expect, it } from "vitest";
import { memoryDb } from "../src/db";
import { deals, priceSnapshots, routes } from "../src/db/schema";
import { runDetector } from "../src/lib/detector";
import { seedTransitRules } from "../src/lib/seed";
import { eq } from "drizzle-orm";

const NOW = new Date("2026-06-30T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function setup(history = 20) {
  const db = await memoryDb();
  await seedTransitRules(db);
  const [r] = await db.insert(routes).values({ origin: "DEL", destination: "BKK", destinationCity: "Bangkok", destinationCountry: "TH" }).returning();
  // `history` daily snapshots around ₹40,000 for the same route+month+cabin
  await db.insert(priceSnapshots).values(Array.from({ length: history }, (_, i) => ({
    routeId: r.id, cabin: "economy", departDate: "2026-09-10", departMonth: "2026-09", priceInr: 40000 + (i % 3) * 500,
    stops: 0, durationMinutes: 250, source: "sample", fetchedAt: day(i + 1),
  })));
  const add = (priceInr: number, extra: Partial<typeof priceSnapshots.$inferInsert> = {}) =>
    db.insert(priceSnapshots).values({ routeId: r.id, cabin: "economy", departDate: "2026-09-10", departMonth: "2026-09", priceInr, stops: 0, durationMinutes: 250, source: "sample", fetchedAt: NOW, ...extra });
  return { db, r, add };
}

describe("runDetector (integration, in-memory Postgres)", () => {
  it("flags a deal against the 30-day median", async () => {
    const { db, add } = await setup();
    await add(20000);
    const s = await runDetector(db, { now: NOW });
    expect(s.created).toBe(1);
    const [d] = await db.select().from(deals);
    expect(d.baselineInr).toBe(40500); // median of the 40000/40500/41000 cycle
    expect(d.pctBelow).toBeGreaterThan(50);
    expect(d.isErrorFare).toBe(false);
  });
  it("tags 70%+ as possible error fare", async () => {
    const { db, add } = await setup();
    await add(9000);
    await runDetector(db, { now: NOW });
    expect((await db.select().from(deals))[0].isErrorFare).toBe(true);
  });
  it("flags nothing during cold start", async () => {
    const { db, add } = await setup(3);
    await add(9000);
    const s = await runDetector(db, { now: NOW });
    expect(s.created).toBe(0);
    expect(s.noBaseline).toBe(1);
  });
  it("does not let today's own snapshots pollute the baseline", async () => {
    const { db, add } = await setup();
    for (let i = 0; i < 30; i++) await add(9000); // a burst of cheap snapshots today
    await runDetector(db, { now: NOW });
    expect((await db.select().from(deals))[0].baselineInr).toBe(40500);
  });
  it("applies stop/duration filters", async () => {
    const { db, add } = await setup();
    await add(20000, { stops: 2 });
    await add(19000, { departDate: "2026-09-11", durationMinutes: 40 * 60 });
    const s = await runDetector(db, { now: NOW });
    expect(s.created).toBe(0);
    expect(s.filtered).toBe(2);
  });
  it("doesn't re-post unless the price drops further", async () => {
    const { db, add } = await setup();
    await add(20000);
    await runDetector(db, { now: NOW });
    const later = new Date(NOW.getTime() + 8 * 3_600_000);
    await add(20000, { fetchedAt: later });
    expect((await runDetector(db, { now: later })).duplicate).toBe(1);
    const later2 = new Date(later.getTime() + 8 * 3_600_000);
    await add(18000, { fetchedAt: later2 });
    const s = await runDetector(db, { now: later2 });
    expect(s.reposted).toBe(1);
    const all = await db.select().from(deals);
    expect(all).toHaveLength(1);
    expect(all[0].priceInr).toBe(18000);
    expect(all[0].foundAt.getTime()).toBe(later2.getTime());
  });
  it("tags (does not hide) deals transiting a watch-listed country", async () => {
    const { db, add } = await setup();
    await add(20000, { stops: 1, transitCountries: ["GB"] });
    await runDetector(db, { now: NOW });
    const [d] = await db.select().from(deals).where(eq(deals.departDate, "2026-09-10"));
    expect(d.visaWarnings[0].country).toBe("United Kingdom");
  });
});

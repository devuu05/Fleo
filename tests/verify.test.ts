import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { memoryDb } from "../src/db";
import { deals, priceSnapshots, routes } from "../src/db/schema";
import { runDetector } from "../src/lib/detector";
import { accessFor } from "../src/lib/gating";
import { DuffelVerifier } from "../src/lib/providers/duffel";
import { pruneSnapshots } from "../src/lib/retention";
import type { Fare, FareVerifier } from "../src/lib/types";

const fare: Fare = { origin: "DEL", destination: "BKK", cabin: "economy", departDate: "2027-01-28", returnDate: null, priceInr: 13346, airline: "XJ", stops: 0, durationMinutes: 250, transitCountries: null, deepLink: null, observedAt: null, gate: null };
const offer = (amount: string, o: { cur?: string; airline?: string; segs?: number } = {}) => ({ total_amount: amount, total_currency: o.cur ?? "INR", owner: { iata_code: o.airline ?? "XJ" }, slices: [{ segments: Array(o.segs ?? 1).fill({}) }] });
const verifier = (offers: object[], status = 200, calls: { url: string; init: RequestInit }[] = []) =>
  new DuffelVerifier("duffel_test_x", {
    sleep: async () => {},
    fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ data: { offers } }), { status }); }) as unknown as typeof fetch,
  });

describe("DuffelVerifier", () => {
  it("sends the right request", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await verifier([offer("13000")], 200, calls).verify(fare);
    expect(calls[0].url).toContain("/air/offer_requests?return_offers=true");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer duffel_test_x");
    expect(JSON.parse(calls[0].init.body as string).data).toMatchObject({ cabin_class: "economy", slices: [{ origin: "DEL", destination: "BKK", departure_date: "2027-01-28" }] });
  });
  it("accepts a live price within tolerance and returns it", async () => {
    expect(await verifier([offer("13900.40"), offer("14200")]).verify(fare)).toEqual({ ok: true, livePriceInr: 13900 }); // +4%
  });
  it("rejects when the live price moved up too far", async () => {
    expect((await verifier([offer("16000")]).verify(fare))).toMatchObject({ ok: false, reason: "gone", livePriceInr: 16000 });
  });
  it("treats no offers / other airline / foreign currency / too many stops as gone", async () => {
    expect((await verifier([]).verify(fare)).reason).toBe("gone");
    expect((await verifier([offer("10000", { airline: "AI" })]).verify(fare)).reason).toBe("gone");
    expect((await verifier([offer("120", { cur: "USD" })]).verify(fare)).reason).toBe("gone");
    expect((await verifier([offer("10000", { segs: 3 })]).verify(fare)).reason).toBe("gone");
  });
  it("reports transport failures as 'error', not 'gone' (so the deal is retried, not discarded)", async () => {
    expect((await verifier([], 503).verify(fare)).reason).toBe("error");
    expect((await verifier([], 401).verify(fare)).reason).toBe("error");
  });
});

const NOW = new Date("2026-06-30T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

async function world() {
  const db = await memoryDb();
  const [r] = await db.insert(routes).values({ origin: "DEL", destination: "BKK", destinationCity: "Bangkok", destinationCountry: "TH" }).returning();
  const base = { routeId: r.id, cabin: "economy", departMonth: "2026-09", stops: 0, durationMinutes: 250, source: "travelpayouts" };
  await db.insert(priceSnapshots).values(Array.from({ length: 20 }, (_, i) => ({ ...base, departDate: "2026-09-10", priceInr: 40000, fetchedAt: day(i + 1) })));
  const add = (departDate: string, priceInr: number) => db.insert(priceSnapshots).values({ ...base, departDate, priceInr, fetchedAt: NOW, airline: "XJ" });
  return { db, r, add };
}
const stub = (fn: (f: Fare) => { ok: boolean; livePriceInr?: number; reason?: string }): FareVerifier & { seen: Fare[] } => {
  const seen: Fare[] = [];
  return { seen, verify: async (f) => { seen.push(f); return fn(f); } };
};

describe("detector + live verification", () => {
  it("passes the real route to the verifier and publishes the LIVE price, marked verified", async () => {
    const { db, add } = await world(); await add("2026-09-10", 20000);
    const v = stub(() => ({ ok: true, livePriceInr: 22000 }));
    await runDetector(db, { now: NOW, verifier: v });
    expect(v.seen[0]).toMatchObject({ origin: "DEL", destination: "BKK", departDate: "2026-09-10" });
    const [d] = await db.select().from(deals);
    expect(d.priceInr).toBe(22000);
    expect(d.verifiedAt?.getTime()).toBe(NOW.getTime());
  });
  it("drops a deal that is gone live, and one that stops being a deal at the live price", async () => {
    const { db, add } = await world(); await add("2026-09-10", 20000); await add("2026-09-11", 20000);
    const v = stub((f) => f.departDate === "2026-09-10" ? { ok: false, reason: "gone" } : { ok: true, livePriceInr: 39000 }); // 39000 vs 40000 baseline: no longer a deal
    const s = await runDetector(db, { now: NOW, verifier: v });
    expect(s.verifiedGone).toBe(1);
    expect(s.notDeal).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(deals)).toHaveLength(0);
  });
  it("counts transport errors separately so they can be retried next run", async () => {
    const { db, add } = await world(); await add("2026-09-10", 20000);
    const s = await runDetector(db, { now: NOW, verifier: stub(() => ({ ok: false, reason: "error" })) });
    expect(s.unverified).toBe(1);
    expect(s.verifiedGone).toBe(0);
  });
  it("spends the live-check budget on the biggest discounts and defers the rest", async () => {
    const { db, add } = await world();
    await add("2026-09-10", 24000); await add("2026-09-11", 10000); await add("2026-09-12", 18000);
    const { config } = await import("../src/lib/config");
    const prev = config.verification.maxPerRun; config.verification.maxPerRun = 2;
    try {
      const v = stub((f) => ({ ok: true, livePriceInr: f.priceInr }));
      const s = await runDetector(db, { now: NOW, verifier: v });
      expect(v.seen.map((f) => f.priceInr)).toEqual([10000, 18000]);
      expect(s.verifyDeferred).toBe(1);
      expect(await db.select().from(deals).where(eq(deals.departDate, "2026-09-10"))).toHaveLength(0);
    } finally { config.verification.maxPerRun = prev; }
  });
  it("without a verifier, deals publish from cached data and are not marked verified", async () => {
    const { db, add } = await world(); await add("2026-09-10", 20000);
    await runDetector(db, { now: NOW });
    expect((await db.select().from(deals))[0].verifiedAt).toBeNull();
  });
});

describe("retention", () => {
  it("deletes only snapshots older than the window", async () => {
    const { db } = await world(); // 20 snapshots, 1..20 days old
    expect(await pruneSnapshots(db, NOW, 10)).toBe(10); // days 11..20
    expect(await db.select().from(priceSnapshots)).toHaveLength(10);
  });
});

describe("gating switch", () => {
  it("enabled:false shows every deal to everyone immediately", () => {
    const deal = { id: 1, foundAt: NOW };
    expect(accessFor(deal, { isPremium: false }, NOW, { freeDelayHours: 24, freeOneInN: 10, enabled: false })).toBe("full");
    expect(accessFor(deal, { isPremium: false }, NOW, { freeDelayHours: 24, freeOneInN: 10 })).not.toBe("full"); // unspecified = enabled
  });
});

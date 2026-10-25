import { describe, expect, it } from "vitest";
import { memoryDb } from "../src/db";
import { alerts, deals, routes, userPreferences, users } from "../src/db/schema";
import { dispatchAlerts } from "../src/lib/alerts/dispatch";
import { matchesPreferences } from "../src/lib/alerts/match";
import type { Notifier } from "../src/lib/alerts/notifier";
import { isFreeEligible } from "../src/lib/gating";
import { runDetector } from "../src/lib/detector";
import { priceSnapshots } from "../src/db/schema";
import { eq } from "drizzle-orm";

describe("matchesPreferences", () => {
  const d = { origin: "DEL", destination: "BKK", cabin: "economy" };
  it("empty = any; otherwise every dimension must match", () => {
    expect(matchesPreferences(d, { origins: [], destinations: [], cabins: [] })).toBe(true);
    expect(matchesPreferences(d, { origins: ["DEL"], destinations: ["BKK"], cabins: ["economy"] })).toBe(true);
    expect(matchesPreferences(d, { origins: ["BOM"], destinations: [], cabins: [] })).toBe(false);
    expect(matchesPreferences(d, { origins: [], destinations: [], cabins: ["business"] })).toBe(false);
  });
});

const NOW = new Date("2026-06-30T12:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

async function world() {
  const db = await memoryDb();
  const [r] = await db.insert(routes).values({ origin: "DEL", destination: "BKK", destinationCity: "Bangkok", destinationCountry: "TH" }).returning();
  const mk = async (departDate: string, foundAt: Date, priceInr = 20000) => (await db.insert(deals).values({
    routeId: r.id, cabin: "economy", departDate, departMonth: departDate.slice(0, 7), priceInr, baselineInr: 40000, pctBelow: 50,
    savingsInr: 20000, stops: 0, source: "sample", foundAt,
  }).returning())[0];
  const user = async (email: string, premium: boolean, prefs: Partial<typeof userPreferences.$inferInsert> = {}) => {
    const [u] = await db.insert(users).values({ email, isPremium: premium }).returning();
    await db.insert(userPreferences).values({ userId: u.id, ...prefs });
    return u;
  };
  const sent: string[] = [];
  const notifier: Notifier = { channel: "email", live: true, send: async (m) => void sent.push(`${m.to}:${m.subject}`) };
  return { db, r, mk, user, sent, notifier };
}

describe("dispatchAlerts", () => {
  it("premium gets a fresh deal now; a free user doesn't (gating applies to alerts too)", async () => {
    const w = await world();
    // find a deal date whose id is NOT free-eligible and one that is
    await w.mk("2026-09-01", hours(1));
    await w.user("prem@x.co", true); await w.user("free@x.co", false);
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    expect(w.sent.some((s) => s.startsWith("prem@x.co"))).toBe(true);
    expect(w.sent.some((s) => s.startsWith("free@x.co"))).toBe(false); // <24h old, so never for free yet
  });
  it("free users get free-eligible deals only after the 24h delay", async () => {
    const w = await world();
    let id = 0, deal;
    do { deal = await w.mk(`2026-09-${String(++id).padStart(2, "0")}`, hours(30)); } while (!isFreeEligible(deal.id) && id < 28);
    await w.user("free@x.co", false);
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    expect(w.sent.filter((s) => s.startsWith("free@x.co"))).toHaveLength(1); // exactly the one eligible deal, none of the locked ones
  });
  it("honours preferences, opt-out, and never double-sends; re-alerts on a further price drop", async () => {
    const w = await world();
    const deal = await w.mk("2026-09-01", hours(1));
    await w.user("match@x.co", true, { origins: ["DEL"] });
    await w.user("nomatch@x.co", true, { origins: ["BOM"] });
    await w.user("optout@x.co", true, { alertsEmail: false });
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toContain("match@x.co");
    await w.db.update(deals).set({ priceInr: 15000 }).where(eq(deals.id, deal.id));
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    expect(w.sent).toHaveLength(2);
  });
  it("only alerts for published deals", async () => {
    const w = await world();
    const d = await w.mk("2026-09-01", hours(1));
    await w.db.update(deals).set({ status: "pending" }).where(eq(deals.id, d.id));
    await w.user("p@x.co", true);
    await dispatchAlerts(w.db, { now: NOW, notifiers: [w.notifier] });
    expect(w.sent).toHaveLength(0);
  });
  it("records provider failures and logs (not 'sent') when no live provider", async () => {
    const w = await world();
    await w.mk("2026-09-01", hours(1));
    await w.user("p@x.co", true);
    const failing: Notifier = { channel: "email", live: true, send: async () => { throw new Error("boom"); } };
    await dispatchAlerts(w.db, { now: NOW, notifiers: [failing] });
    expect((await w.db.select().from(alerts))[0]).toMatchObject({ status: "failed", error: "boom" });
    const w2 = await world();
    await w2.mk("2026-09-01", hours(1)); await w2.user("p@x.co", true);
    await dispatchAlerts(w2.db, { now: NOW, notifiers: [{ channel: "email", live: false, send: async () => {} }] });
    expect((await w2.db.select().from(alerts))[0].status).toBe("logged");
  });
});

describe("review workflow", () => {
  it("new deals start pending when review is required, and a re-post keeps the admin's decision", async () => {
    const db = await memoryDb();
    const [r] = await db.insert(routes).values({ origin: "DEL", destination: "BKK", destinationCity: "Bangkok", destinationCountry: "TH" }).returning();
    const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
    await db.insert(priceSnapshots).values(Array.from({ length: 20 }, (_, i) => ({ routeId: r.id, cabin: "economy", departDate: "2026-09-10", departMonth: "2026-09", priceInr: 40000, stops: 0, source: "sample", fetchedAt: day(i + 1) })));
    const add = (p: number, at: Date) => db.insert(priceSnapshots).values({ routeId: r.id, cabin: "economy", departDate: "2026-09-10", departMonth: "2026-09", priceInr: p, stops: 0, source: "sample", fetchedAt: at });
    await add(20000, NOW);
    await runDetector(db, { now: NOW, requireReview: true });
    expect((await db.select().from(deals))[0].status).toBe("pending");
    await db.update(deals).set({ status: "rejected" }).where(eq(deals.routeId, r.id));
    const later = new Date(NOW.getTime() + 8 * 3_600_000);
    await add(15000, later);
    await runDetector(db, { now: later, requireReview: true });
    const [d] = await db.select().from(deals);
    expect(d.priceInr).toBe(15000);
    expect(d.status).toBe("rejected"); // price update must not resurrect a rejected deal
  });
});

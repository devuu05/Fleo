import { describe, expect, it } from "vitest";
import { TravelpayoutsProvider, parseSearchDate } from "../src/lib/providers/travelpayouts";

const ticket = (o: object) => ({ origin: "DEL", destination: "BKK", price: 15000.4, airline: "AI", departure_at: "2026-12-05T10:00:00+05:30", transfers: 0, duration: 250, link: "/search/DEL0512BKK1?t=abc", ...o });

function provider(data: object[], calls: string[] = [], opts: object = {}) {
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push(url + "|" + JSON.stringify(init.headers));
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as unknown as typeof fetch;
  return new TravelpayoutsProvider({ token: "T0KEN", marker: "123456", rps: 1000, fetchImpl, sleep: async () => {}, ...opts });
}

describe("TravelpayoutsProvider", () => {
  it("sends token header, INR, and builds marker deep links", async () => {
    const calls: string[] = [];
    const fares = await provider([ticket({})], calls).fetchMonth({ origin: "DEL", destination: "BKK", month: "2026-12", cabin: "economy" });
    expect(calls[0]).toContain("currency=inr");
    expect(calls[0]).toContain("departure_at=2026-12");
    expect(calls[0]).toContain("X-Access-Token");
    expect(fares[0].priceInr).toBe(15000);
    expect(fares[0].deepLink).toMatch(/^https:\/\/www\.aviasales\.com\/search\/DEL0512BKK1\?.*marker=123456/);
    expect(fares[0].transitCountries).toBeNull();
  });
  it("keeps the cheapest fare per day", async () => {
    const fares = await provider([ticket({ price: 20000 }), ticket({ price: 12000 })]).fetchMonth({ origin: "DEL", destination: "BKK", month: "2026-12", cabin: "economy" });
    expect(fares).toHaveLength(1);
    expect(fares[0].priceInr).toBe(12000);
  });
  it("skips business unless explicitly enabled (trip_class unverified on v3)", async () => {
    const calls: string[] = [];
    const q = { origin: "DEL", destination: "BKK", month: "2026-12", cabin: "business" as const };
    expect(await provider([ticket({})], calls).fetchMonth(q)).toEqual([]);
    expect(calls).toHaveLength(0);
    await provider([ticket({})], calls, { businessEnabled: true }).fetchMonth(q);
    expect(calls[0]).toContain("trip_class=1");
  });
});

// Shape copied from a real prices_for_dates response (DEL -> BKK, Jan 2027).
const REAL = {
  flight_number: "231", origin_airport: "DEL", destination_airport: "DMK", departure_at: "2027-01-28T20:55:00+05:30", airline: "XJ",
  destination: "BKK", origin: "DEL", price: 13346, gate: "Trip.com", return_transfers: 0, duration: 250, duration_to: 250, duration_back: 0, transfers: 0,
  link: "/search/DEL2801BKK1?t=XJ18011697_babb&search_date=21102026&expected_price_uuid=01a1&expected_price_currency=inr&expected_price=13346",
};

describe("real response shape", () => {
  it("parses search_date as the day the price was seen", () => {
    expect(parseSearchDate(REAL.link)?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(parseSearchDate("/search/X?search_date=31022026")).toBeNull(); // 31 Feb
    expect(parseSearchDate("/search/X?t=1")).toBeNull();
  });
  it("maps a real ticket: INR price, stops, duration, gate, observed date, marker link", async () => {
    const [f] = await provider([REAL]).fetchMonth({ origin: "DEL", destination: "BKK", month: "2027-01", cabin: "economy" });
    expect(f).toMatchObject({ priceInr: 13346, airline: "XJ", stops: 0, durationMinutes: 250, gate: "Trip.com", departDate: "2027-01-28" });
    expect(f.observedAt?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(f.deepLink).toContain("marker=123456");
    expect(f.deepLink).toContain("search_date=21102026"); // original params preserved
  });
});

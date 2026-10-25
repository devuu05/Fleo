import { describe, expect, it } from "vitest";
import { baselineUsable, evaluate, isStale, median, passesFilters, shouldRepost, visaWarnings } from "../src/lib/detector-core";

const cfg = { minPctBelow: 40, minSavingsInr: 5000, errorFarePctBelow: 70, baselineDays: 30, maxPriceAgeDays: 5, minBaselineSnapshots: 10, minBaselineSpanDays: 5 };

describe("median", () => {
  it("handles odd, even, empty and unsorted input", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
  });
  it("is robust to an outlier (unlike a mean)", () => {
    expect(median([100, 100, 100, 100, 1])).toBe(100);
  });
});

describe("evaluate", () => {
  it("flags exactly at the 40% / ₹5,000 boundary", () => {
    const r = evaluate(30000, 50000, cfg); // 40% below, saves 20,000
    expect(r.isDeal).toBe(true);
    expect(r.pctBelow).toBe(40);
  });
  it("does not flag just under 40%", () => {
    expect(evaluate(30100, 50000, cfg).isDeal).toBe(false); // 39.8%
  });
  it("does not flag when % is met but savings < ₹5,000", () => {
    const r = evaluate(5000, 9000, cfg); // 44% but saves 4,000
    expect(r.pctBelow).toBeGreaterThanOrEqual(40);
    expect(r.isDeal).toBe(false);
  });
  it("does not round 39.96% up over the line", () => {
    expect(evaluate(30020, 50000, cfg).isDeal).toBe(false); // 39.96%
  });
  it("tags 70%+ below as a possible error fare, not 69%", () => {
    expect(evaluate(15000, 50000, cfg).isErrorFare).toBe(true); // exactly 70%
    expect(evaluate(15500, 50000, cfg).isErrorFare).toBe(false); // 69%
    expect(evaluate(15500, 50000, cfg).isDeal).toBe(true);
  });
  it("thresholds are configurable", () => {
    expect(evaluate(40000, 50000, { ...cfg, minPctBelow: 20 }).isDeal).toBe(true);
    expect(evaluate(30000, 50000, { ...cfg, minSavingsInr: 25000 }).isDeal).toBe(false);
  });
  it("never flags a price above baseline", () => {
    const r = evaluate(60000, 50000, cfg);
    expect(r.isDeal).toBe(false);
    expect(r.pctBelow).toBeLessThan(0);
  });
});

describe("baselineUsable (cold start)", () => {
  it("requires enough snapshots and enough time span", () => {
    expect(baselineUsable(undefined, cfg)).toBe(false);
    expect(baselineUsable({ medianInr: 1, count: 9, spanDays: 10 }, cfg)).toBe(false);
    expect(baselineUsable({ medianInr: 1, count: 20, spanDays: 2 }, cfg)).toBe(false);
    expect(baselineUsable({ medianInr: null, count: 20, spanDays: 10 }, cfg)).toBe(false);
    expect(baselineUsable({ medianInr: 1, count: 10, spanDays: 5 }, cfg)).toBe(true);
  });
});

describe("shouldRepost", () => {
  it("posts new deals, skips same/higher prices, reposts on a further drop", () => {
    expect(shouldRepost(undefined, 20000)).toBe(true);
    expect(shouldRepost(20000, 20000)).toBe(false);
    expect(shouldRepost(20000, 21000)).toBe(false);
    expect(shouldRepost(20000, 19990)).toBe(true);
  });
});

describe("passesFilters", () => {
  const f = { maxStops: 1, maxDurationHours: 30 };
  it("drops >1 stop and over-long itineraries; keeps unknown duration", () => {
    expect(passesFilters({ stops: 1, durationMinutes: 600 }, f)).toBe(true);
    expect(passesFilters({ stops: 2, durationMinutes: 600 }, f)).toBe(false);
    expect(passesFilters({ stops: 0, durationMinutes: 30 * 60 }, f)).toBe(true);
    expect(passesFilters({ stops: 0, durationMinutes: 30 * 60 + 1 }, f)).toBe(false);
    expect(passesFilters({ stops: 1, durationMinutes: null }, f)).toBe(true);
  });
  it("respects configured limits", () => {
    expect(passesFilters({ stops: 2, durationMinutes: 600 }, { maxStops: 2, maxDurationHours: 30 })).toBe(true);
  });
});

describe("visaWarnings", () => {
  const rules = [
    { countryCode: "GB", countryName: "United Kingdom", note: "", verified: false, enabled: true },
    { countryCode: "CN", countryName: "China", note: "", verified: true, enabled: false },
  ];
  it("tags, never hides, and marks unverified rules", () => {
    const w = visaWarnings(["QA", "GB", "GB"], 1, rules);
    expect(w).toHaveLength(1);
    expect(w[0].note).toContain("unverified");
  });
  it("ignores disabled rules and non-stop flights", () => {
    expect(visaWarnings(["CN"], 1, rules)).toEqual([]);
    expect(visaWarnings([], 0, rules)).toEqual([]);
  });
  it("warns generically when layover airports are unknown", () => {
    expect(visaWarnings(null, 1, rules)[0].country).toBe("??");
    expect(visaWarnings(null, 0, rules)).toEqual([]);
  });
});

describe("isStale", () => {
  const now = new Date("2026-10-25T00:00:00Z");
  it("flags prices last seen longer ago than the limit; unknown age is never stale", () => {
    expect(isStale(null, now, 5)).toBe(false);
    expect(isStale(new Date("2026-10-21T00:00:00Z"), now, 5)).toBe(false); // 4 days
    expect(isStale(new Date("2026-10-20T00:00:00Z"), now, 5)).toBe(false); // exactly 5
    expect(isStale(new Date("2026-10-19T00:00:00Z"), now, 5)).toBe(true); // 6 days
  });
});

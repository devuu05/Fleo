import { describe, expect, it } from "vitest";
import { accessFor, isFreeEligible } from "../src/lib/gating";

const cfg = { freeDelayHours: 24, freeOneInN: 10 };

describe("gating", () => {
  it("is deterministic and roughly 1 in 10", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const n = ids.filter((id) => isFreeEligible(id)).length;
    expect(isFreeEligible(7)).toBe(isFreeEligible(7));
    expect(n).toBeGreaterThan(350);
    expect(n).toBeLessThan(650);
  });
  const now = new Date("2026-01-02T00:00:00Z");
  const eligible = Array.from({ length: 100 }, (_, i) => i + 1).find((id) => isFreeEligible(id))!;
  const ineligible = Array.from({ length: 100 }, (_, i) => i + 1).find((id) => !isFreeEligible(id))!;

  it("premium sees everything instantly", () => {
    expect(accessFor({ id: ineligible, foundAt: now }, { isPremium: true }, now, cfg)).toBe("full");
  });
  it("free: ineligible deals are locked forever", () => {
    expect(accessFor({ id: ineligible, foundAt: new Date("2025-01-01") }, { isPremium: false }, now, cfg)).toBe("locked");
  });
  it("free: eligible deals are delayed 24h then visible", () => {
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
    expect(accessFor({ id: eligible, foundAt: at(1) }, { isPremium: false }, now, cfg)).toBe("delayed");
    expect(accessFor({ id: eligible, foundAt: at(23.9) }, { isPremium: false }, now, cfg)).toBe("delayed");
    expect(accessFor({ id: eligible, foundAt: at(24) }, { isPremium: false }, now, cfg)).toBe("full");
  });
});

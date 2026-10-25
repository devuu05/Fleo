// Pure detection / filter / gating logic. No I/O, so it's trivially unit-testable.
import { config } from "./config";

export type DetectionConfig = typeof config.detection;
export type FilterConfig = typeof config.filters;

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BaselineStats {
  medianInr: number | null;
  count: number;
  spanDays: number;
}

/** A baseline is only trusted once it has enough history (cold-start guard). */
export function baselineUsable(b: BaselineStats | undefined, cfg: DetectionConfig = config.detection): b is BaselineStats & { medianInr: number } {
  return !!b && b.medianInr != null && b.count >= cfg.minBaselineSnapshots && b.spanDays >= cfg.minBaselineSpanDays;
}

export interface Evaluation {
  isDeal: boolean;
  isErrorFare: boolean;
  pctBelow: number; // 0–100, one decimal
  savingsInr: number;
}

export function evaluate(priceInr: number, baselineInr: number, cfg: DetectionConfig = config.detection): Evaluation {
  const savingsInr = Math.round(baselineInr - priceInr);
  const pct = baselineInr > 0 ? ((baselineInr - priceInr) / baselineInr) * 100 : 0;
  const pctBelow = Math.round(pct * 10) / 10;
  return {
    pctBelow,
    savingsInr,
    // compare unrounded pct so 39.96% doesn't round its way over the line
    isDeal: pct >= cfg.minPctBelow && savingsInr >= cfg.minSavingsInr,
    isErrorFare: pct >= cfg.errorFarePctBelow && savingsInr >= cfg.minSavingsInr,
  };
}

/** Re-post an existing route+dates+cabin deal only if the price dropped further. */
export function shouldRepost(existingPriceInr: number | undefined, newPriceInr: number): boolean {
  return existingPriceInr === undefined || newPriceInr < existingPriceInr;
}

export interface FilterableFare {
  stops: number;
  durationMinutes: number | null;
}

export function passesFilters(f: FilterableFare, cfg: FilterConfig = config.filters): boolean {
  if (f.stops > cfg.maxStops) return false;
  if (f.durationMinutes != null && f.durationMinutes > cfg.maxDurationHours * 60) return false;
  return true;
}

export interface TransitRuleLite {
  countryCode: string;
  countryName: string;
  note: string;
  verified: boolean;
  enabled: boolean;
}
export interface VisaWarning { country: string; note: string }

/**
 * Tag (never hide) itineraries that touch a country on the watch-list.
 * `transit === null` means the data source can't tell us the layover airports.
 */
export function visaWarnings(transit: string[] | null, stops: number, rules: TransitRuleLite[]): VisaWarning[] {
  if (stops === 0) return [];
  if (transit === null) return [{ country: "??", note: "Layover airport unknown — check transit visa requirements before booking." }];
  const byCode = new Map(rules.filter((r) => r.enabled).map((r) => [r.countryCode, r]));
  const out: VisaWarning[] = [];
  for (const c of new Set(transit)) {
    const r = byCode.get(c);
    if (r) out.push({ country: r.countryName, note: `Transit via ${r.countryName} may need a visa for Indian passport holders${r.verified ? "" : " (unverified — check official sources)"}.` });
  }
  return out;
}

/** A fare whose price was last seen too long ago may no longer exist. Unknown age (sample data) is not stale. */
export function isStale(observedAt: Date | null, now: Date, maxAgeDays = config.detection.maxPriceAgeDays): boolean {
  return observedAt !== null && now.getTime() - observedAt.getTime() > maxAgeDays * 86_400_000;
}

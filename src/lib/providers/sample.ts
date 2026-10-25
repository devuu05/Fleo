import type { Cabin, Fare, FareProvider, FareQuery } from "../types";

// Realistic-ish generated fares. Deterministic per (route, date, asOf day) so
// baselines are stable and tests are reproducible.

const TIERS: Record<string, { base: number; hours: number; codes: string[] }> = {
  short: { base: 14000, hours: 4, codes: ["DXB", "AUH", "DOH", "CMB", "KTM", "MLE"] },
  sea: { base: 24000, hours: 6, codes: ["BKK", "KUL", "SIN", "HAN", "SGN", "MNL", "DPS", "HKG"] },
  east: { base: 38000, hours: 8, codes: ["NRT", "ICN", "PEK"] },
  africa: { base: 36000, hours: 7, codes: ["CAI", "NBO", "JNB", "MRU"] },
  eu: { base: 52000, hours: 9.5, codes: ["LHR", "CDG", "FRA", "AMS", "FCO", "BCN", "ZRH", "IST", "ATH", "VIE", "CPH", "MAD", "PRG"] },
  oceania: { base: 62000, hours: 14, codes: ["SYD", "MEL", "AKL"] },
  na: { base: 72000, hours: 16, codes: ["JFK", "SFO", "YYZ"] },
};
const tierOf = (code: string) => Object.values(TIERS).find((t) => t.codes.includes(code)) ?? TIERS.eu;

const HUBS = ["AE", "QA", "TR", "SG", "HK", "GB", "DE", "CN"];
const AIRLINES = ["AI", "6E", "EK", "QR", "TK", "SQ", "LH", "BA", "EY", "TG"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

interface Plant {
  origin: string; destination: string; cabin: Cabin; monthOffset: number;
  factor: number; stops?: number; transit?: string[]; durationMinutes?: number;
}

/** Deals planted into the *current* run so every detector branch is exercised. */
export const PLANTS: Plant[] = [
  { origin: "DEL", destination: "DXB", cabin: "economy", monthOffset: 2, factor: 0.5, stops: 0 },
  { origin: "BOM", destination: "SIN", cabin: "economy", monthOffset: 3, factor: 0.45, stops: 0 },
  { origin: "BLR", destination: "LHR", cabin: "business", monthOffset: 2, factor: 0.55, stops: 1, transit: ["QA"] },
  { origin: "DEL", destination: "BKK", cabin: "economy", monthOffset: 4, factor: 0.22, stops: 0 }, // error fare
  { origin: "HYD", destination: "CDG", cabin: "economy", monthOffset: 3, factor: 0.5, stops: 1, transit: ["DE"] }, // visa-warned (placeholder rule)
  { origin: "MAA", destination: "FRA", cabin: "economy", monthOffset: 2, factor: 0.5, stops: 2, transit: ["AE", "TR"] }, // dropped: 2 stops
  { origin: "COK", destination: "SYD", cabin: "economy", monthOffset: 3, factor: 0.5, stops: 1, transit: ["SG"], durationMinutes: 42 * 60 }, // dropped: too long
  { origin: "CCU", destination: "KUL", cabin: "economy", monthOffset: 5, factor: 0.8, stops: 0 }, // not a deal (only 20% off)
];

export interface SampleOptions {
  /** simulated "now" (used for history backfill) */
  asOf?: Date;
  /** apply PLANTS (only meaningful for the live run) */
  plant?: boolean;
  marker?: string;
}

export class SampleProvider implements FareProvider {
  readonly name = "sample";
  private asOf: Date;
  constructor(private o: SampleOptions = {}) {
    this.asOf = o.asOf ?? new Date();
  }

  async fetchMonth(q: FareQuery): Promise<Fare[]> {
    const tier = tierOf(q.destination);
    const [y, m] = q.month.split("-").map(Number);
    const dayKey = ymd(this.asOf);
    const originFactor = 0.92 + (hash(q.origin) % 19) / 100; // 0.92–1.10
    const season = 1 + 0.18 * Math.sin((m / 12) * Math.PI * 2) + ([5, 6, 12].includes(m) ? 0.12 : 0);
    const cabinFactor = q.cabin === "business" ? 3.2 : 1;
    const monthsAhead = (y - this.asOf.getUTCFullYear()) * 12 + (m - 1 - this.asOf.getUTCMonth());
    const plants = this.o.plant
      ? PLANTS.filter((p) => p.origin === q.origin && p.destination === q.destination && p.cabin === q.cabin && p.monthOffset === monthsAhead)
      : [];

    const days = [5, 14, 23].map((d, i) => d + (hash(`${q.origin}${q.destination}${q.month}${i}`) % 4));
    return days.map((day, i): Fare => {
      const date = `${q.month}-${String(day).padStart(2, "0")}`;
      const stable = rng(`${q.origin}${q.destination}${q.cabin}${date}`);
      const daily = rng(`${q.origin}${q.destination}${q.cabin}${date}${dayKey}`);
      const datePremium = 0.9 + stable() * 0.25; // per-date level
      const noise = 0.94 + daily() * 0.12; // day-to-day wobble ±6%
      let price = tier.base * originFactor * season * cabinFactor * datePremium * noise;

      const stopRoll = stable();
      let stops = tier.hours <= 4 ? 0 : stopRoll < 0.55 ? 0 : stopRoll < 0.9 ? 1 : 2;
      let transit = Array.from({ length: stops }, (_, k) => HUBS[hash(`${q.origin}${q.destination}${k}${stopRoll}`) % HUBS.length]);
      let duration = Math.round((tier.hours + stops * 3.5 + stable() * 1.5) * 60);

      const plant = i === 0 ? plants[0] : undefined; // plant on the first date of the month only
      if (plant) {
        price *= plant.factor;
        stops = plant.stops ?? stops;
        transit = plant.transit ?? transit;
        duration = plant.durationMinutes ?? Math.round((tier.hours + stops * 3.5) * 60);
      }

      return {
        origin: q.origin, destination: q.destination, cabin: q.cabin,
        departDate: date, returnDate: null,
        priceInr: Math.round(price / 10) * 10,
        airline: AIRLINES[hash(`${q.origin}${q.destination}${stopRoll}`) % AIRLINES.length],
        stops, durationMinutes: duration, transitCountries: transit,
        observedAt: null, gate: null,
        deepLink: `https://www.aviasales.com/search/${q.origin}${String(day).padStart(2, "0")}${String(m).padStart(2, "0")}${q.destination}1?marker=${this.o.marker ?? "sample"}`,
      };
    });
  }
}

export { addMonths, monthOf, ymd };

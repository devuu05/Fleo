// All tunables in one place. Env vars override the defaults.
const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : d);

export const config = {
  detection: {
    minPctBelow: num(process.env.DEAL_MIN_PCT_BELOW, 40), // % below baseline
    minSavingsInr: num(process.env.DEAL_MIN_SAVINGS_INR, 5000),
    errorFarePctBelow: num(process.env.ERROR_FARE_PCT_BELOW, 70),
    baselineDays: num(process.env.BASELINE_DAYS, 30),
    // cold start: no flagging until the baseline has this much history
    // real data only: ignore fares whose price was last seen longer ago than this
    maxPriceAgeDays: num(process.env.MAX_PRICE_AGE_DAYS, 5),
    minBaselineSnapshots: num(process.env.BASELINE_MIN_SNAPSHOTS, 10),
    minBaselineSpanDays: num(process.env.BASELINE_MIN_SPAN_DAYS, 5),
  },
  filters: {
    maxStops: num(process.env.MAX_STOPS, 1),
    maxDurationHours: num(process.env.MAX_DURATION_HOURS, 30),
  },
  gating: {
    // false (default) = every deal visible to everyone instantly; Premium is dormant. GATING_ENABLED=1 restores free/premium limits.
    enabled: process.env.GATING_ENABLED === "1",
    freeDelayHours: num(process.env.FREE_DELAY_HOURS, 24),
    freeOneInN: num(process.env.FREE_ONE_IN_N, 10),
  },
  collector: {
    monthsAheadFrom: 2,
    monthsAheadTo: 6,
    cabins: ["economy", "business"] as const,
    requestsPerSecond: num(process.env.COLLECTOR_RPS, 5),
    maxRetries: 5,
  },
  verification: {
    toleranceFraction: num(process.env.VERIFY_TOLERANCE, 0.1), // live price may be up to 10% above the cached one
    maxPerRun: num(process.env.VERIFY_MAX_PER_RUN, 50), // live searches cost money/quota; best deals first
  },
  retention: { snapshotDays: num(process.env.SNAPSHOT_RETENTION_DAYS, 45) }, // baseline needs 30
  review: {
    // true => new deals start "pending" and only go live after an admin approves them
    required: process.env.REVIEW_REQUIRED === "1",
  },
  billing: {
    planAmountInr: num(process.env.PLAN_PRICE_INR, 1499),
    planDays: 365,
  },
  currency: "INR",
};

export const ORIGINS = ["DEL", "BOM", "BLR", "MAA", "HYD", "CCU", "COK", "AMD", "PNQ"];

export const DESTINATIONS: { code: string; city: string; country: string }[] = [
  { code: "DXB", city: "Dubai", country: "AE" }, { code: "SIN", city: "Singapore", country: "SG" },
  { code: "BKK", city: "Bangkok", country: "TH" }, { code: "KUL", city: "Kuala Lumpur", country: "MY" },
  { code: "HKG", city: "Hong Kong", country: "HK" }, { code: "LHR", city: "London", country: "GB" },
  { code: "CDG", city: "Paris", country: "FR" }, { code: "FRA", city: "Frankfurt", country: "DE" },
  { code: "AMS", city: "Amsterdam", country: "NL" }, { code: "FCO", city: "Rome", country: "IT" },
  { code: "BCN", city: "Barcelona", country: "ES" }, { code: "ZRH", city: "Zurich", country: "CH" },
  { code: "IST", city: "Istanbul", country: "TR" }, { code: "DOH", city: "Doha", country: "QA" },
  { code: "AUH", city: "Abu Dhabi", country: "AE" }, { code: "JFK", city: "New York", country: "US" },
  { code: "SFO", city: "San Francisco", country: "US" }, { code: "YYZ", city: "Toronto", country: "CA" },
  { code: "SYD", city: "Sydney", country: "AU" }, { code: "MEL", city: "Melbourne", country: "AU" },
  { code: "AKL", city: "Auckland", country: "NZ" }, { code: "NRT", city: "Tokyo", country: "JP" },
  { code: "ICN", city: "Seoul", country: "KR" }, { code: "DPS", city: "Bali", country: "ID" },
  { code: "CMB", city: "Colombo", country: "LK" }, { code: "KTM", city: "Kathmandu", country: "NP" },
  { code: "MLE", city: "Male", country: "MV" }, { code: "HAN", city: "Hanoi", country: "VN" },
  { code: "SGN", city: "Ho Chi Minh City", country: "VN" }, { code: "MNL", city: "Manila", country: "PH" },
  { code: "PEK", city: "Beijing", country: "CN" }, { code: "CAI", city: "Cairo", country: "EG" },
  { code: "NBO", city: "Nairobi", country: "KE" }, { code: "JNB", city: "Johannesburg", country: "ZA" },
  { code: "MRU", city: "Mauritius", country: "MU" }, { code: "ATH", city: "Athens", country: "GR" },
  { code: "VIE", city: "Vienna", country: "AT" }, { code: "CPH", city: "Copenhagen", country: "DK" },
  { code: "MAD", city: "Madrid", country: "ES" }, { code: "PRG", city: "Prague", country: "CZ" },
];

export const ORIGIN_CITY: Record<string, string> = {
  DEL: "Delhi", BOM: "Mumbai", BLR: "Bengaluru", MAA: "Chennai", HYD: "Hyderabad",
  CCU: "Kolkata", COK: "Kochi", AMD: "Ahmedabad", PNQ: "Pune",
};

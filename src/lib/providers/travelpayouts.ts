import { HttpError, RateLimiter, withBackoff } from "../http";
import { config } from "../config";
import type { Cabin, Fare, FareProvider, FareQuery } from "../types";

const BASE = "https://api.travelpayouts.com";
const AVIASALES = "https://www.aviasales.com";

interface TpTicket {
  origin: string;
  destination: string;
  price: number;
  airline?: string;
  departure_at: string;
  return_at?: string;
  transfers?: number;
  duration?: number; // minutes (total). duration_to / duration_back also exist.
  duration_to?: number;
  gate?: string; // OTA that quoted the price, e.g. "Trip.com"
  link?: string; // path on aviasales.com; carries search_date=DDMMYYYY (when the price was seen)
}

/** `search_date=21102026` in the link = 21 Oct 2026, the day a user last saw this price. */
export function parseSearchDate(link: string): Date | null {
  const m = /[?&]search_date=(\d{2})(\d{2})(\d{4})/.exec(link);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] ? d : null; // rejects 31022026-style overflow
}

export interface TravelpayoutsOptions {
  token: string;
  marker: string;
  rps?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /**
   * v3 prices_for_dates is documented for economy-style cached prices; a
   * `trip_class` filter is only confirmed for older endpoints. Until you've
   * verified it against the live API, business queries are skipped so we never
   * store economy prices labelled "business".
   */
  businessEnabled?: boolean;
}

export class TravelpayoutsProvider implements FareProvider {
  readonly name = "travelpayouts";
  private limiter: RateLimiter;
  private f: typeof fetch;

  constructor(private o: TravelpayoutsOptions) {
    this.limiter = new RateLimiter(o.rps ?? config.collector.requestsPerSecond);
    this.f = o.fetchImpl ?? fetch;
  }

  async fetchMonth(q: FareQuery): Promise<Fare[]> {
    if (q.cabin === "business" && !this.o.businessEnabled) return [];
    const params = new URLSearchParams({
      origin: q.origin,
      destination: q.destination,
      departure_at: q.month, // YYYY-MM => cheapest per day in that month
      one_way: "true",
      direct: "false",
      sorting: "price",
      unique: "false",
      limit: "30",
      page: "1",
      currency: "inr",
      cy: "inr", // some docs use `cy`; harmless if ignored
    });
    if (q.cabin === "business") params.set("trip_class", "1"); // VERIFY against live API

    const body = await withBackoff(
      async () => {
        await this.limiter.wait();
        const res = await this.f(`${BASE}/aviasales/v3/prices_for_dates?${params}`, {
          headers: { "X-Access-Token": this.o.token, "Accept-Encoding": "gzip" },
        });
        if (!res.ok) {
          const ra = Number(res.headers.get("retry-after"));
          throw new HttpError(res.status, `Travelpayouts ${res.status}`, ra ? ra * 1000 : undefined);
        }
        return (await res.json()) as { success?: boolean; data?: TpTicket[] };
      },
      { retries: config.collector.maxRetries, sleep: this.o.sleep },
    );

    // keep the cheapest ticket per departure day
    const byDay = new Map<string, Fare>();
    for (const t of body.data ?? []) {
      const fare = this.toFare(t, q.cabin);
      if (!fare) continue;
      const cur = byDay.get(fare.departDate);
      if (!cur || fare.priceInr < cur.priceInr) byDay.set(fare.departDate, fare);
    }
    return [...byDay.values()];
  }

  private toFare(t: TpTicket, cabin: Cabin): Fare | null {
    if (!t.price || !t.departure_at) return null;
    return {
      origin: t.origin,
      destination: t.destination,
      cabin,
      departDate: t.departure_at.slice(0, 10),
      returnDate: t.return_at ? t.return_at.slice(0, 10) : null,
      priceInr: Math.round(t.price),
      airline: t.airline ?? null,
      stops: t.transfers ?? 0,
      durationMinutes: t.duration_to ?? t.duration ?? null,
      transitCountries: null, // Data API doesn't expose layover airports
      deepLink: t.link ? this.affiliateLink(t.link) : null,
      observedAt: t.link ? parseSearchDate(t.link) : null,
      gate: t.gate ?? null,
    };
  }

  private affiliateLink(path: string): string {
    const url = new URL(path.startsWith("http") ? path : AVIASALES + path);
    url.searchParams.set("marker", this.o.marker);
    return url.toString();
  }
}

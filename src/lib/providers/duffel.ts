import { HttpError, withBackoff } from "../http";
import { config } from "../config";
import type { Fare, FareVerifier } from "../types";

interface DuffelOffer {
  total_amount: string;
  total_currency: string;
  owner?: { iata_code?: string };
  slices?: { segments?: unknown[] }[];
}

/**
 * Live price check via Duffel's Offer Requests API: "can this fare actually be booked right now,
 * and at what price?". Returns ok:false/reason "gone" when no matching offer exists,
 * and reason "error" for transport problems (so a run can retry later instead of dropping the deal).
 *
 * Not yet exercised against the live API (no token in the build sandbox). Coverage of Indian carriers
 * through Duffel is limited, so expect some real fares to come back "gone" simply because Duffel can't sell them.
 */
export class DuffelVerifier implements FareVerifier {
  constructor(
    private token: string,
    private o: { toleranceFraction?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  async verify(f: Fare): Promise<{ ok: boolean; livePriceInr?: number; reason?: string }> {
    const tolerance = this.o.toleranceFraction ?? config.verification.toleranceFraction;
    let offers: DuffelOffer[];
    try {
      offers = await withBackoff(async () => {
        const res = await (this.o.fetchImpl ?? fetch)("https://api.duffel.com/air/offer_requests?return_offers=true", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            data: {
              slices: [{ origin: f.origin, destination: f.destination, departure_date: f.departDate }],
              passengers: [{ type: "adult" }],
              cabin_class: f.cabin,
            },
          }),
        });
        if (!res.ok) throw new HttpError(res.status, `Duffel ${res.status}`);
        return ((await res.json()) as { data?: { offers?: DuffelOffer[] } }).data?.offers ?? [];
      }, { retries: 2, sleep: this.o.sleep });
    } catch {
      return { ok: false, reason: "error" };
    }

    // Offers in another currency can't be compared with an INR baseline, so they don't count as a match.
    const inr = offers.filter((x) => x.total_currency === "INR" && Number(x.total_amount) > 0);
    const sameAirline = f.airline ? inr.filter((x) => x.owner?.iata_code === f.airline) : inr;
    const matching = sameAirline.filter((x) => (x.slices?.[0]?.segments?.length ?? 1) - 1 <= f.stops);
    if (matching.length === 0) return { ok: false, reason: "gone" };

    const live = Math.round(Math.min(...matching.map((x) => Number(x.total_amount))));
    if (live > f.priceInr * (1 + tolerance)) return { ok: false, livePriceInr: live, reason: "gone" }; // price has moved up
    return { ok: true, livePriceInr: live };
  }
}

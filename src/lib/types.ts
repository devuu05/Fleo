export type Cabin = "economy" | "business";

export interface FareQuery {
  origin: string;
  destination: string;
  month: string; // YYYY-MM departure month
  cabin: Cabin;
}

/** One normalised fare as returned by any provider. */
export interface Fare {
  origin: string;
  destination: string;
  cabin: Cabin;
  departDate: string; // YYYY-MM-DD
  returnDate: string | null;
  priceInr: number;
  airline: string | null;
  stops: number;
  durationMinutes: number | null;
  /** ISO country codes of transit airports. null = provider can't tell. */
  transitCountries: string[] | null;
  deepLink: string | null;
  /** when the price was last seen in a real user search (from the link), if the source says */
  observedAt: Date | null;
  /** the booking site that quoted it (e.g. Trip.com) */
  gate: string | null;
}

export interface FareProvider {
  readonly name: "sample" | "travelpayouts" | (string & {});
  fetchMonth(q: FareQuery): Promise<Fare[]>;
}

/**
 * Optional live-price check (e.g. Duffel) run on a candidate deal before it is
 * published. Not implemented in Phase 1; the detector accepts one if provided.
 */
export interface FareVerifier {
  verify(fare: Fare): Promise<{ ok: boolean; livePriceInr?: number; reason?: string }>;
}

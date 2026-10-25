import { SampleProvider, type SampleOptions } from "./sample";
import { TravelpayoutsProvider } from "./travelpayouts";
import { DuffelVerifier } from "./duffel";
import type { FareProvider, FareVerifier } from "../types";

export function sampleMode(): boolean {
  const flag = process.env.SAMPLE_DATA;
  if (flag !== undefined && flag !== "") return flag === "1" || flag.toLowerCase() === "true";
  return !process.env.TRAVELPAYOUTS_TOKEN; // no token => sample mode
}

export function createProvider(sample: SampleOptions = {}): FareProvider {
  if (sampleMode()) return new SampleProvider({ marker: process.env.TRAVELPAYOUTS_MARKER, ...sample });
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  if (!token || !marker) throw new Error("TRAVELPAYOUTS_TOKEN and TRAVELPAYOUTS_MARKER are required when SAMPLE_DATA is off");
  return new TravelpayoutsProvider({ token, marker, businessEnabled: process.env.TP_BUSINESS_ENABLED === "1" });
}

/** Live price check, only when DUFFEL_TOKEN is set. Without one, deals are published from cached data as before. */
export function createVerifier(): FareVerifier | undefined {
  const token = process.env.DUFFEL_TOKEN;
  return token && !sampleMode() ? new DuffelVerifier(token) : undefined;
}

export interface Prefs { origins: string[]; destinations: string[]; cabins: string[] }
export interface MatchableDeal { origin: string; destination: string; cabin: string }

/** An empty list means "any". */
export function matchesPreferences(d: MatchableDeal, p: Prefs): boolean {
  const ok = (list: string[], v: string) => list.length === 0 || list.includes(v);
  return ok(p.origins, d.origin) && ok(p.destinations, d.destination) && ok(p.cabins, d.cabin);
}

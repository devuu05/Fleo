import { config } from "./config";

export type Access = "full" | "locked" | "delayed";

/** Stable FNV-1a bucket so the same deal is always (or never) in the free 1-in-N slice. */
export function isFreeEligible(dealId: number, oneInN = config.gating.freeOneInN): boolean {
  let h = 2166136261;
  for (const ch of `deal:${dealId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % oneInN === 0;
}

export interface Viewer { isPremium: boolean }

/**
 * premium            -> full, immediately
 * free + eligible    -> full once the deal is `freeDelayHours` old, "delayed" before that
 * free + not eligible-> locked (teaser)
 */
export function accessFor(
  deal: { id: number; foundAt: Date },
  viewer: Viewer,
  now = new Date(),
  cfg: { freeDelayHours: number; freeOneInN: number; enabled?: boolean } = config.gating,
): Access {
  if (cfg.enabled === false || viewer.isPremium) return "full";
  if (!isFreeEligible(deal.id, cfg.freeOneInN)) return "locked";
  const ageMs = now.getTime() - deal.foundAt.getTime();
  return ageMs >= cfg.freeDelayHours * 3_600_000 ? "full" : "delayed";
}

export function hoursUntilFree(foundAt: Date, now = new Date(), cfg = config.gating): number {
  return Math.max(0, Math.ceil(cfg.freeDelayHours - (now.getTime() - foundAt.getTime()) / 3_600_000));
}

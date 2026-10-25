import type { Db } from "../db";
import { runCollector } from "./collector";
import { runDetector } from "./detector";
import { dispatchAlerts } from "./alerts/dispatch";
import { createProvider, createVerifier, sampleMode } from "./providers";
import { pruneSnapshots } from "./retention";
import { seedRoutes, seedTransitRules } from "./seed";

/** Collect fares then detect deals. Used by the CLI and the cron route. */
export async function collectAndDetect(db: Db, log: (m: string) => void = console.log) {
  const sample = sampleMode();
  log(`mode: ${sample ? "SAMPLE_DATA" : "travelpayouts"}`);
  await seedRoutes(db, sample);
  await seedTransitRules(db);
  const now = new Date();
  const collected = await runCollector(db, { provider: createProvider({ plant: true, asOf: now }), now, log });
  log(`collected: ${JSON.stringify(collected)}`);
  const detected = await runDetector(db, { now, verifier: createVerifier(), log: (m) => log(`detected: ${m}`) });
  const alerted = await dispatchAlerts(db, { now, log: (m) => log(`alerts: ${m}`) });
  const pruned = await pruneSnapshots(db, now);
  log(`pruned ${pruned} old snapshots`);
  return { collected, detected, alerted, pruned };
}

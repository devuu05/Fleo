import type { Db } from "../db";
import { runCollector } from "./collector";
import { runDetector } from "./detector";
import { createProvider, sampleMode } from "./providers";
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
  const detected = await runDetector(db, { now, log: (m) => log(`detected: ${m}`) });
  return { collected, detected };
}

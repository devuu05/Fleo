// SAMPLE_DATA only: generate N days of historical snapshots so baselines exist.
import { getDb } from "../src/db";
import { runCollector, targetMonths } from "../src/lib/collector";
import { SampleProvider } from "../src/lib/providers/sample";
import { sampleMode } from "../src/lib/providers";
import { seedRoutes, seedTransitRules } from "../src/lib/seed";

async function main() {
  if (!sampleMode()) throw new Error("backfill only runs in SAMPLE_DATA mode (real history must be collected over time)");
  const days = Number(process.argv[2] ?? 32);
  const db = await getDb();
  await seedRoutes(db, true);
  await seedTransitRules(db);
  const today = new Date();
  const months = targetMonths(today); // fixed target months so every day's history covers the same baselines
  for (let d = days; d >= 1; d--) {
    const asOf = new Date(today.getTime() - d * 86_400_000);
    const r = await runCollector(db, { provider: new SampleProvider({ asOf }), now: asOf, months });
    console.log(`backfill -${d}d: ${r.inserted} snapshots`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

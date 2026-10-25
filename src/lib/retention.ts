import { lt } from "drizzle-orm";
import type { Db } from "../db";
import { priceSnapshots } from "../db/schema";
import { config } from "./config";

/** Snapshots only feed the 30-day baseline, so older rows are dead weight. Keeps the table bounded. */
export async function pruneSnapshots(db: Db, now = new Date(), keepDays = config.retention.snapshotDays): Promise<number> {
  const cutoff = new Date(now.getTime() - keepDays * 86_400_000);
  const gone = await db.delete(priceSnapshots).where(lt(priceSnapshots.fetchedAt, cutoff)).returning({ id: priceSnapshots.id });
  return gone.length;
}

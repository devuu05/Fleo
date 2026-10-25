import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { userPreferences } from "../db/schema";
import { DESTINATIONS, ORIGINS } from "./config";

const clean = (vals: unknown[], allowed: string[]) => [...new Set(vals.map(String).filter((v) => allowed.includes(v)))];

/** Whitelists every value so arbitrary strings can't be stored. */
export function parsePreferences(f: { getAll(k: string): unknown[]; get(k: string): unknown }) {
  const wa = String(f.get("whatsapp") ?? "").replace(/[\s-]/g, "");
  return {
    origins: clean(f.getAll("origins"), ORIGINS),
    destinations: clean(f.getAll("destinations"), DESTINATIONS.map((d) => d.code)),
    cabins: clean(f.getAll("cabins"), ["economy", "business"]),
    alertsEmail: f.get("alertsEmail") === "on",
    whatsappNumber: /^\+?\d{8,15}$/.test(wa) ? wa : null,
  };
}

export async function getPreferences(db: Db, userId: number) {
  const [p] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  return p ?? { userId, origins: [], destinations: [], cabins: [], alertsEmail: true, whatsappNumber: null, updatedAt: new Date() };
}

export async function savePreferences(db: Db, userId: number, p: ReturnType<typeof parsePreferences>) {
  await db.insert(userPreferences).values({ userId, ...p })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { ...p, updatedAt: new Date() } });
}

import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { users } from "../../db/schema";

/** Find or create the app user for an authenticated identity. isPremium is never touched here. */
export async function upsertUser(db: Db, id: { email: string; authId?: string | null }) {
  const email = id.email.trim().toLowerCase();
  const [row] = await db.insert(users).values({ email, authId: id.authId ?? null })
    .onConflictDoUpdate({ target: users.email, set: id.authId ? { authId: id.authId } : { email } })
    .returning();
  return row;
}

export async function setPremium(db: Db, userId: number, isPremium: boolean) {
  await db.update(users).set({ isPremium }).where(eq(users.id, userId));
}

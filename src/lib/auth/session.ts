import { cookies } from "next/headers";
import { getDb } from "../../db";
import { DEV_COOKIE, devAuthEnabled, isEmail, supabaseConfigured } from "./config";
import { upsertUser } from "./users";
import { supabaseServer } from "../supabase/server";

export interface SessionUser { id: number; email: string; isPremium: boolean }

/** The signed-in app user (from Supabase, or the dev cookie), or null for anonymous visitors. */
export async function getSessionUser(): Promise<SessionUser | null> {
  let identity: { email: string; authId?: string } | null = null;

  if (supabaseConfigured()) {
    const { data } = await (await supabaseServer()).auth.getUser();
    if (data.user?.email) identity = { email: data.user.email, authId: data.user.id };
  } else if (devAuthEnabled()) {
    const email = (await cookies()).get(DEV_COOKIE)?.value;
    if (isEmail(email)) identity = { email };
  }
  if (!identity) return null;

  const u = await upsertUser(await getDb(), identity);
  return { id: u.id, email: u.email, isPremium: u.isPremium };
}

import type { Viewer } from "./gating";
import { getSessionUser, type SessionUser } from "./auth/session";

export interface AppViewer extends Viewer { user: SessionUser | null }

/** Gating input: anonymous visitors are free users; signed-in users get users.is_premium. */
export async function getViewer(): Promise<AppViewer> {
  const user = await getSessionUser();
  return { isPremium: user?.isPremium ?? false, user };
}

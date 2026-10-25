import { cookies } from "next/headers";
import type { Viewer } from "./gating";

export const PREMIUM_COOKIE = "fd_premium";

export const devToggleEnabled = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_PREMIUM_TOGGLE === "1";

/**
 * Phase 1 has no auth. The "user" is a stub whose isPremium flag comes from a
 * dev-only cookie. Phase 2 replaces this with a real session lookup against
 * `users.is_premium`; nothing else needs to change.
 */
export async function getViewer(): Promise<Viewer> {
  if (!devToggleEnabled()) return { isPremium: false };
  return { isPremium: (await cookies()).get(PREMIUM_COOKIE)?.value === "1" };
}

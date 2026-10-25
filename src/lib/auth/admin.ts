import { devAuthEnabled } from "./config";
import { getSessionUser, type SessionUser } from "./session";

/** ADMIN_EMAILS=a@x.com,b@y.com. With it unset, any dev-login user is an admin (never in production). */
export function isAdminEmail(email: string, env = process.env.ADMIN_EMAILS, dev = devAuthEnabled()): boolean {
  const list = (env ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list.includes(email.toLowerCase()) : dev;
}

export async function getAdmin(): Promise<SessionUser | null> {
  const u = await getSessionUser();
  return u && isAdminEmail(u.email) ? u : null;
}

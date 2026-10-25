export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Dev auth = type any email, no verification. Only exists when Supabase isn't
 * configured AND we're not in production, so it can never be a prod backdoor.
 */
export const devAuthEnabled = () => !supabaseConfigured() && process.env.NODE_ENV !== "production";

export const DEV_COOKIE = "fleo_dev_user";

/** Only same-site relative paths; blocks open redirects like //evil.com. */
export function safeNext(v: string | null | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export const isEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

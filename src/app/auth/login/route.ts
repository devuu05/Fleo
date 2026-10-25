import { NextResponse } from "next/server";
import { DEV_COOKIE, devAuthEnabled, isEmail, safeNext, supabaseConfigured } from "@/lib/auth/config";
import { supabaseServer } from "@/lib/supabase/server";

const origin = (req: Request) => process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
const back = (req: Request, qs: string) => NextResponse.redirect(new URL(`/login?${qs}`, origin(req)), 303);

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(form.get("next") ?? ""));
  if (!isEmail(email)) return back(req, "error=email");

  if (supabaseConfigured()) {
    // Passwordless: Supabase emails a magic link that lands on /auth/callback.
    const { error } = await (await supabaseServer()).auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin(req)}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    return error ? back(req, "error=send") : back(req, "sent=1");
  }
  if (devAuthEnabled()) {
    const res = NextResponse.redirect(new URL(next, origin(req)), 303);
    res.cookies.set(DEV_COOKIE, email, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  }
  return new NextResponse("Auth is not configured", { status: 503 });
}

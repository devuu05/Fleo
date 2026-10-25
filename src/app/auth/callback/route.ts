import { NextResponse, type NextRequest } from "next/server";
import { safeNext, supabaseConfigured } from "@/lib/auth/config";
import { supabaseServer } from "@/lib/supabase/server";

// Magic-link landing: exchanges the PKCE `code` (or a token_hash) for a session cookie.
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const p = req.nextUrl.searchParams;
  const fail = NextResponse.redirect(new URL("/login?error=link", base));
  if (!supabaseConfigured()) return fail;

  const supabase = await supabaseServer();
  const code = p.get("code"), tokenHash = p.get("token_hash");
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" }) : { error: new Error("no code") };
  return error ? fail : NextResponse.redirect(new URL(safeNext(p.get("next")), base));
}

import { NextResponse } from "next/server";
import { DEV_COOKIE, supabaseConfigured } from "@/lib/auth/config";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut();
  const res = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin), 303);
  res.cookies.delete(DEV_COOKIE);
  return res;
}

import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth/session";
import { parsePreferences, savePreferences } from "@/lib/preferences";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/preferences", req.url), 303);
  await savePreferences(await getDb(), user.id, parsePreferences(await req.formData()));
  return NextResponse.redirect(new URL("/preferences?saved=1", req.url), 303);
}

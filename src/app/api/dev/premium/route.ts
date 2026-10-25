import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { devAuthEnabled } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { setPremium } from "@/lib/auth/users";

// Dev-only stand-in for Razorpay: flips users.is_premium for the signed-in dev user.
export async function POST(req: Request) {
  if (!devAuthEnabled()) return new NextResponse("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  await setPremium(await getDb(), user.id, !user.isPremium);
  return NextResponse.redirect(new URL("/", req.url), 303);
}

import { NextResponse } from "next/server";
import { devToggleEnabled, PREMIUM_COOKIE } from "@/lib/viewer";

export async function POST(req: Request) {
  if (!devToggleEnabled()) return new NextResponse("Not found", { status: 404 });
  const form = await req.formData();
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(PREMIUM_COOKIE, form.get("premium") === "1" ? "1" : "0", { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}

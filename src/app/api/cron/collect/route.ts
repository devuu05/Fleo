import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { collectAndDetect } from "@/lib/pipeline";

// Trigger from Vercel Cron / Supabase pg_cron / any scheduler:
//   GET /api/cron/collect   with   Authorization: Bearer $CRON_SECRET
// A full 9x40x5x2 sweep exceeds serverless time limits; for production prefer the
// long-running `npm run collect` on a worker, or split by origin.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const logs: string[] = [];
  const result = await collectAndDetect(await getDb(), (m) => logs.push(m));
  return NextResponse.json({ ...result, logs });
}

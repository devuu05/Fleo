import "dotenv/config"; // tsx doesn't load .env on its own
// One live Travelpayouts call, printed raw. Use it to check the token, currency, cabin and link format.
//   npm run probe -- DEL BKK 2026-12 [business]
async function main() {
  const [origin = "DEL", destination = "BKK", month, cabin = "economy"] = process.argv.slice(2);
  const token = process.env.TRAVELPAYOUTS_TOKEN, marker = process.env.TRAVELPAYOUTS_MARKER;
  if (!token) throw new Error("Set TRAVELPAYOUTS_TOKEN in .env first");
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 3);
  const m = month ?? d.toISOString().slice(0, 7);

  const params = new URLSearchParams({ origin, destination, departure_at: m, one_way: "true", direct: "false", sorting: "price", unique: "false", limit: "10", page: "1", currency: "inr", cy: "inr" });
  if (cabin === "business") params.set("trip_class", "1");
  const url = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`;
  console.log("GET", url.replace(token, "***"));
  const res = await fetch(url, { headers: { "X-Access-Token": token } });
  const text = await res.text();
  console.log("status:", res.status, "| rate-limit headers:", [...res.headers].filter(([k]) => /rate|retry/i.test(k)));
  let body: { data?: Record<string, unknown>[]; currency?: string; success?: boolean; error?: string };
  try { body = JSON.parse(text); } catch { console.log(text.slice(0, 500)); return; }
  console.log("success:", body.success, "| currency:", body.currency, "| results:", body.data?.length ?? 0, body.error ? `| error: ${body.error}` : "");
  for (const t of (body.data ?? []).slice(0, 5)) {
    const seen = /search_date=(\d{2})(\d{2})(\d{4})/.exec(String(t.link ?? ""));
    console.log(JSON.stringify({ ...t, link: undefined }), seen ? `| price seen ${seen[1]}/${seen[2]}/${seen[3]}` : "");
  }
  const link = body.data?.[0]?.link as string | undefined;
  if (link) console.log("\nexample affiliate link:\nhttps://www.aviasales.com" + link + (link.includes("?") ? "&" : "?") + "marker=" + (marker ?? "<TRAVELPAYOUTS_MARKER>"));
  console.log("\nCheck: currency should be INR; for business, prices should be clearly higher than the economy run; fields transfers/duration/airline present.");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });

# Fleo (Phase 1)

Flight-deal alerts for Indian travellers. It does **not** sell tickets: it scans cached fares, flags unusually cheap ones, and sends users to Travelpayouts affiliate links.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · Postgres (Supabase in prod, embedded PGlite locally) · Vitest.

## Quick start (no keys needed)

```bash
npm install
cp .env.example .env          # optional; empty token => SAMPLE_DATA mode
npm run db:backfill           # ~30s: 32 days of generated history so baselines exist
npm run collect               # collect fares + detect deals (plants a few demo deals)
npm run dev                   # http://localhost:3000
npm test
```

> PGlite is single-process. Don't run `npm run collect` while `next dev` is using the same `.data/pglite`
> (stop the server, or point `DATABASE_URL` at a real Postgres, which has no such limit).
> `npm run db:reset` wipes the local DB.

The feed has a dev-only **"Viewing as Free/Premium"** button (cookie) standing in for auth.

## How it works

| Piece | Where |
|---|---|
| Schema / migrations | `src/db/schema.ts`, `drizzle/` (auto-applied on start; regenerate with `npm run db:generate`) |
| Provider interface | `src/lib/types.ts` (`FareProvider`, `FareVerifier`) |
| Sample provider (generated fares, planted deals) | `src/lib/providers/sample.ts` |
| Travelpayouts client (token header, rate limit, backoff) | `src/lib/providers/travelpayouts.ts`, `src/lib/http.ts` |
| Collector | `src/lib/collector.ts` — every route × month (now+2…+6) × cabin → `price_snapshots` |
| Detection + filters + visa tags (pure, tested) | `src/lib/detector-core.ts` |
| Detector (DB orchestration) | `src/lib/detector.ts` |
| Free/Premium gating | `src/lib/gating.ts`, applied server-side in `src/lib/feed.ts` |
| Config / thresholds / route lists | `src/lib/config.ts` + env vars (see `.env.example`) |
| Cron entry point | `npm run collect` or `GET /api/cron/collect` with `Authorization: Bearer $CRON_SECRET` |

**Detection rules.** Baseline = median of the last 30 days of snapshots for the same route + departure month + cabin, excluding the current run's own snapshots. A deal needs ≥40% below baseline **and** ≥₹5,000 saving (both configurable). ≥70% below also gets the "possible error fare" tag. A baseline isn't trusted until it has ≥10 snapshots spanning ≥5 days (cold-start guard), so a fresh real-data install flags nothing for the first few days. An existing route+dates+cabin deal is only re-posted (and its `found_at` refreshed) if the price drops further.

**Filters.** Itineraries with more than `MAX_STOPS` (1) stops or longer than `MAX_DURATION_HOURS` (30) are dropped. Deals touching a country in `transit_rules` are tagged with a warning, never hidden. The seeded rows are **placeholders marked unverified** — edit the table after checking official sources; the app never states visa rules as fact. The Data API doesn't expose layover airports, so real-data deals with stops get a generic "layover unknown — check transit visa" warning until a live-price source supplies them.

**Gating.** Premium: everything, instantly. Free: a deal is eligible if a stable hash of its id falls in a 1-in-10 bucket, and visible only 24h after `found_at`. Everything else renders as a teaser (route + cabin). Price, dates and the affiliate link are stripped on the server, so they never reach a free user's browser.

## Going live with Travelpayouts

1. Put `TRAVELPAYOUTS_TOKEN` and `TRAVELPAYOUTS_MARKER` in `.env`. Sample mode switches off automatically (or force with `SAMPLE_DATA=0`).
2. `npm run collect` on a schedule (every few hours). Full sweep ≈ 9 origins × 40 destinations × 5 months × 2 cabins = 3,600 requests; the limiter defaults to 3 req/s (`COLLECTOR_RPS`), with exponential backoff and `Retry-After` handling on 429/5xx.
3. Set `DATABASE_URL` to Supabase for production.

**Verify before trusting (I could not reach the Travelpayouts docs from the build sandbox):**
- Endpoint used: `GET /aviasales/v3/prices_for_dates` (cheapest per day for a `YYYY-MM` `departure_at`), auth via `X-Access-Token`. Field names (`price`, `airline`, `transfers`, `duration`/`duration_to`, `link`) come from public docs snippets.
- Currency is sent as both `currency=inr` and `cy=inr` because docs variously show each. Confirm prices come back in INR.
- **Business class:** a `trip_class` filter is only documented for older endpoints. Business queries are therefore **disabled** for the real API (`TP_BUSINESS_ENABLED=1` to turn on) so economy prices are never stored as "business". Confirm with a live call first.
- The affiliate link is the API's `link` path on `aviasales.com` plus `marker=…`. If you use Travelpayouts' tp.media link shortener, adapt `affiliateLink()`.
- Prices are cached from user searches and may be days old; add a `FareVerifier` (e.g. Duffel) — `runDetector({ verifier })` already calls it before a deal is published.

## Tests

`npm test` — detection boundaries (40% / ₹5,000 / 70%), median, cold start, de-dupe/re-post, filters, visa tagging, gating, backoff/rate limiter, Travelpayouts client (mocked fetch), plus an integration test of the detector on in-memory Postgres.

## Not built yet (later phases)

Auth, Razorpay subscription, email/push/WhatsApp alerts, per-user route preferences, admin review page, live-price verification, a UI for editing `transit_rules`.

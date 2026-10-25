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

Sign-in: with no Supabase keys, `/login` is a **dev login** (type any email, nothing is verified; disabled in production). A dev-only button flips `users.is_premium` for the signed-in user, standing in for Razorpay.

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

## Testing with real prices (do this first)

1. Get a token + marker: Travelpayouts dashboard → Tools → API (token) and your affiliate ID (marker).
2. In `.env`: `TRAVELPAYOUTS_TOKEN=...` and `TRAVELPAYOUTS_MARKER=...`. Real mode switches on automatically and uses its own database (`.data/pglite-real`), so sample fares never mix with real ones.
3. **Probe the API once:** `npm run probe -- DEL BKK 2027-01` prints the raw response. Check that `currency` is INR, prices look sane, and `transfers` / `duration` / `airline` / `link` are present. Then `npm run probe -- DEL BKK 2027-01 business` and confirm business prices are clearly higher than economy. If so, set `TP_BUSINESS_ENABLED=1`.
4. Collect a small slice first (full sweep = 1,800+ calls):
   `COLLECT_ORIGINS=DEL,BOM COLLECT_DESTINATIONS=BKK,DXB,SIN,LHR npm run collect`
   (Windows PowerShell: set `$env:COLLECT_ORIGINS="DEL,BOM"` etc. first.)
5. Open **/prices** (admin only; any dev-login user in dev). It lists the cheapest *stored real fares* per route/date, with data age and a link to Aviasales to compare. This works from the first run.
6. The **Deals** feed needs history: a deal is only flagged against a 30-day median, and a baseline is trusted after 10 snapshots over 5+ days. To see deal logic fire sooner, loosen it for testing only: `BASELINE_MIN_SNAPSHOTS=2 BASELINE_MIN_SPAN_DAYS=0` and run `collect` a few times a few hours apart. Expect noisy deals until real history builds up.

Remember these are cached prices from other users' searches: the same fare may no longer be bookable on Aviasales. A stale-but-cheap fare is the main false positive; live verification (Duffel) is the planned fix.

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

## Auth (Supabase)

Passwordless email magic-link via Supabase Auth (`@supabase/ssr`). Fleo's own data stays in Postgres via Drizzle; `users.auth_id` links a row to the Supabase user and `users.is_premium` is what gating reads. Logging in never changes `is_premium`.

1. Create a Supabase project. Copy the project URL and anon/publishable key into `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set `DATABASE_URL` to the project's Postgres connection string.
2. Dashboard → Authentication → URL Configuration: add `<your site>/auth/callback` to Redirect URLs (and set the Site URL).
3. Optional: set `NEXT_PUBLIC_SITE_URL` so links use your public origin.
4. Supabase's built-in mailer is heavily rate-limited; configure custom SMTP before real traffic.
5. The tables live in your `public` schema; enable RLS with no policies on them (the app uses the server-side DB connection, not the Supabase client API), so the anon key can't read them.

Flow: `/login` → `POST /auth/login` (emails the link) → `/auth/callback` (exchanges the code for a session cookie) → `src/proxy.ts` keeps the session fresh. `POST /auth/logout` signs out. Redirect targets go through `safeNext()` to block open redirects. **The Supabase path has not been exercised against a live project** (no keys in the build sandbox); only the dev login is end-to-end tested.

## Admin review, preferences, alerts, payments

- **Admin (`/admin`)**: with `REVIEW_REQUIRED=1`, new deals start *pending*. Approve/reject individually or "approve all". A later price drop updates a deal but never undoes an admin's decision. `/admin/transit` edits the transit-visa watch-list (enable, verify, notes, add countries). Admins = `ADMIN_EMAILS` (any dev-login user when unset, non-production only). Non-admins get a 404.
- **My routes (`/preferences`)**: origins / destinations / cabins (empty = any), email-alert toggle, WhatsApp number (stored for later). Feeds the "For me" filter and alerts.
- **Alerts**: after every collect run, `dispatchAlerts` emails opted-in users whose preferences match a published deal **that gating lets them see right now** (premium immediately; free users only their 1-in-10 deals after 24h). Idempotent per (user, deal, price), so a further price drop re-alerts but reruns don't. Without `RESEND_API_KEY` messages are only logged to the outbox shown at `/alerts`. Channels implement `Notifier` (`src/lib/alerts/notifier.ts`), so WhatsApp/push are drop-in additions.
- **Premium (`/upgrade`)**: ₹1,499 one-time for 365 days (no auto-renewal), stacking on remaining time if renewed early; `users.premium_until` expires it. With Razorpay keys: server creates an order, Checkout.js pays it, `/api/billing/verify` checks the HMAC signature, and `/api/billing/webhook` (`payment.captured`, `order.paid`, secret `RAZORPAY_WEBHOOK_SECRET`) covers closed tabs. Both paths go through one idempotent `markPaid`. Without keys, a test checkout grants premium without money moving (non-production only).

**Not yet verified against live services:** Supabase sign-in, Razorpay (real orders/Checkout/webhooks), and Resend delivery. The signature checks, order request shape and Resend request are unit-tested with mocks; the end-to-end flows were run using the dev login, test checkout and outbox.

## Business model switch, live verification, scale notes

- **`GATING_ENABLED`** (default off): every deal shows to everyone instantly, since earnings come from affiliate bookings and hiding deals only loses clicks. Premium/Razorpay stay built but hidden. Set `GATING_ENABLED=1` to bring back 1-in-10 / 24h-delay and `/upgrade`.
- **Live check (`DUFFEL_TOKEN`)**: before a deal is published the detector asks Duffel whether the fare is bookable now, publishes the *live* price (re-checked against the baseline), and shows "✓ Checked live". Not found / price moved up = dropped; a network error = retried on the next run. At most `VERIFY_MAX_PER_RUN` live searches per run, biggest discounts first. Untested against the live Duffel API; coverage of Indian carriers is limited, so some good fares may come back "gone" just because Duffel can't sell them. Watch the `verifiedGone` count in the collect log.
- **No compare-site links** (Google Flights / Skyscanner) on purpose: they'd send bookings away from the affiliate link.
- **Scale**: snapshots older than `SNAPSHOT_RETENTION_DAYS` (45) are pruned each run; de-dup only loads deals that haven't departed; alert de-dup is one query per run. See the answer in the project notes for what still needs work (alert queue, feed caching, sharded collection).

## Tests

`npm test` — detection boundaries (40% / ₹5,000 / 70%), median, cold start, de-dupe/re-post, filters, visa tagging, gating, backoff/rate limiter, Travelpayouts client (mocked fetch), plus an integration test of the detector on in-memory Postgres.

## Not built yet (later phases)

WhatsApp/push alerts, auto-renewing subscriptions (Razorpay Subscriptions), live-price verification (Duffel), social/phone login, refunds/invoices, deployment config and scheduler, real-API verification for Travelpayouts.

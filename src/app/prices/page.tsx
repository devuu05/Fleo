import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { Nav } from "@/components/Nav";
import { getAdmin } from "@/lib/auth/admin";
import { DESTINATIONS, ORIGIN_CITY } from "@/lib/config";
import { ageLabel, dateLabel, duration, inr, stopsLabel } from "@/lib/format";
import { latestPrices } from "@/lib/prices";
import { sampleMode } from "@/lib/providers";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const sel = "w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const ago = (d: Date) => { const h = Math.round((Date.now() - d.getTime()) / 3_600_000); return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };

// Raw latest prices straight from the snapshots, for checking what the data source actually returns.
export default async function Prices({ searchParams }: PageProps<"/prices">) {
  if (!(await getAdmin())) notFound();
  const sp = await searchParams;
  const f = { from: one(sp.from), to: one(sp.to), cabin: one(sp.cabin), month: one(sp.month) };
  const [viewer, db] = [await getViewer(), await getDb()];
  const items = await latestPrices(db, f);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Latest prices</h1>
      <Nav viewer={viewer} />
      <p className={`mb-4 rounded-lg px-3 py-2 text-xs ${sampleMode() ? "bg-purple-50 text-purple-800" : "bg-green-50 text-green-900"}`}>
        {sampleMode() ? "SAMPLE_DATA: generated prices, not real." : "Live data: cached Travelpayouts/Aviasales fares from real user searches. They can be days old and may not be bookable at this price."}
      </p>
      <form method="get" className="mb-5 grid grid-cols-2 gap-2">
        <select name="from" defaultValue={f.from ?? ""} className={sel}><option value="">Any origin</option>{Object.entries(ORIGIN_CITY).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
        <select name="to" defaultValue={f.to ?? ""} className={sel}><option value="">Any destination</option>{DESTINATIONS.map((d) => <option key={d.code} value={d.code}>{d.city}</option>)}</select>
        <select name="cabin" defaultValue={f.cabin ?? ""} className={sel}><option value="">Any cabin</option><option value="economy">Economy</option><option value="business">Business</option></select>
        <input name="month" defaultValue={f.month ?? ""} placeholder="YYYY-MM" pattern="\d{4}-\d{2}" className={sel} />
        <button className="col-span-2 rounded-xl bg-neutral-900 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">Filter</button>
      </form>
      <p className="mb-3 text-xs text-neutral-500">{items.length} cheapest stored fares</p>
      <div className="space-y-3">
        {items.map((p) => (
          <article key={`${p.origin}${p.destination}${p.cabin}${p.departDate}`} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{p.origin} → {p.destination} <span className="font-normal text-neutral-500">{p.destinationCity} · <span className="capitalize">{p.cabin}</span></span></h2>
              <span className="text-xl font-bold">{inr(p.priceInr)}</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{dateLabel(p.departDate)} · {[p.airline, stopsLabel(p.stops), duration(p.durationMinutes)].filter(Boolean).join(" · ")} · {p.observedAt ? `price seen ${ageLabel(p.observedAt)}` : `fetched ${ago(p.fetchedAt)}`}{p.gate ? ` · via ${p.gate}` : ""}</p>
            {p.deepLink && <a href={p.deepLink} target="_blank" rel="sponsored noopener noreferrer" className="mt-3 block rounded-xl bg-blue-600 py-2.5 text-center text-sm font-semibold text-white">Check on Aviasales</a>}
          </article>
        ))}
        {items.length === 0 && <p className="py-12 text-center text-neutral-500">No prices stored yet. Run <code>npm run collect</code>.</p>}
      </div>
    </main>
  );
}

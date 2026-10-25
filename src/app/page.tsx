import { getDb } from "@/db";
import { DealCard } from "@/components/DealCard";
import { PremiumToggle } from "@/components/PremiumToggle";
import { filterOptions, getFeed } from "@/lib/feed";
import { monthLabel } from "@/lib/format";
import { sampleMode } from "@/lib/providers";
import { devToggleEnabled, getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const sel = "w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const filters = { from: one(sp.from), cabin: one(sp.cabin), month: one(sp.month) };
  const [db, viewer] = [await getDb(), await getViewer()];
  const [items, opts] = await Promise.all([getFeed(db, filters, viewer), filterOptions(db)]);
  const unlocked = items.filter((i) => i.access === "full").length;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Fleo</h1>
        <p className="text-sm text-neutral-500">Unusually cheap international fares, spotted automatically.</p>
        {sampleMode() && <p className="mt-2 rounded-lg bg-purple-50 px-3 py-1.5 text-xs text-purple-800 dark:bg-purple-950 dark:text-purple-200">SAMPLE_DATA mode — these fares are generated, not real.</p>}
        {devToggleEnabled() && <div className="mt-3"><PremiumToggle isPremium={viewer.isPremium} /></div>}
      </header>

      <form method="get" className="mb-5 grid grid-cols-3 gap-2">
        <select name="from" defaultValue={filters.from ?? ""} className={sel} aria-label="Departure city">
          <option value="">Any city</option>
          {opts.origins.map(([code, city]) => <option key={code} value={code}>{city}</option>)}
        </select>
        <select name="cabin" defaultValue={filters.cabin ?? ""} className={sel} aria-label="Cabin">
          <option value="">Any cabin</option><option value="economy">Economy</option><option value="business">Business</option>
        </select>
        <select name="month" defaultValue={filters.month ?? ""} className={sel} aria-label="Month">
          <option value="">Any month</option>
          {opts.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button className="col-span-3 rounded-xl bg-neutral-900 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">Filter</button>
      </form>

      <p className="mb-3 text-xs text-neutral-500">
        {items.length} deal{items.length === 1 ? "" : "s"}
        {!viewer.isPremium && items.length > 0 && ` · ${unlocked} unlocked on the free plan`}
      </p>

      <div className="space-y-4">
        {items.map((d) => <DealCard key={d.id} deal={d} />)}
        {items.length === 0 && <p className="py-12 text-center text-neutral-500">No deals match yet. Run <code>npm run collect</code>.</p>}
      </div>

      <footer className="mt-10 text-xs text-neutral-500">
        We don&apos;t sell tickets. &quot;Book&quot; links are affiliate links — we may earn a commission at no extra cost to you.
        Fares come from cached searches and can change or sell out; always confirm the price before paying.
        Transit-visa notes are reminders only, not legal advice — check official sources for your passport.
      </footer>
    </main>
  );
}

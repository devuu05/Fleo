import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { Nav } from "@/components/Nav";
import { DESTINATIONS, ORIGIN_CITY } from "@/lib/config";
import { getPreferences } from "@/lib/preferences";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const chip = "flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-900 dark:border-neutral-700 dark:has-[:checked]:bg-blue-950 dark:has-[:checked]:text-blue-100";

export default async function Preferences({ searchParams }: PageProps<"/preferences">) {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/login?next=/preferences");
  const p = await getPreferences(await getDb(), viewer.user.id);
  const saved = (await searchParams).saved === "1";

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">My routes</h1>
      <Nav viewer={viewer} />
      <p className="mb-4 text-sm text-neutral-500">Pick what you care about. Leave a group empty to mean &quot;any&quot;. These drive your alerts and the &quot;For me&quot; filter on the feed.</p>
      {saved && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">Saved.</p>}

      <form action="/api/preferences" method="post" className="space-y-6">
        <fieldset><legend className="mb-2 font-semibold">Fly from</legend>
          <div className="flex flex-wrap gap-2">{Object.entries(ORIGIN_CITY).map(([c, n]) => (
            <label key={c} className={chip}><input type="checkbox" name="origins" value={c} defaultChecked={p.origins.includes(c)} />{n}</label>))}</div>
        </fieldset>
        <fieldset><legend className="mb-2 font-semibold">Fly to</legend>
          <div className="flex flex-wrap gap-2">{DESTINATIONS.map((d) => (
            <label key={d.code} className={chip}><input type="checkbox" name="destinations" value={d.code} defaultChecked={p.destinations.includes(d.code)} />{d.city}</label>))}</div>
        </fieldset>
        <fieldset><legend className="mb-2 font-semibold">Cabin</legend>
          <div className="flex gap-2">{["economy", "business"].map((c) => (
            <label key={c} className={`${chip} capitalize`}><input type="checkbox" name="cabins" value={c} defaultChecked={p.cabins.includes(c)} />{c}</label>))}</div>
        </fieldset>
        <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Alerts</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alertsEmail" defaultChecked={p.alertsEmail} />Email me matching deals ({viewer.user.email})</label>
          <div><label className="text-sm text-neutral-500" htmlFor="wa">WhatsApp number (alerts coming soon)</label>
            <input id="wa" name="whatsapp" defaultValue={p.whatsappNumber ?? ""} placeholder="+91 98765 43210" className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /></div>
          {!viewer.isPremium && <p className="text-xs text-neutral-500">On the free plan you only get alerts for deals you&apos;re allowed to see (1 in 10, after 24h). <Link href="/upgrade" className="underline">Go Premium</Link> for instant alerts.</p>}
        </fieldset>
        <button className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white">Save</button>
      </form>
    </main>
  );
}

import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { deals, routes } from "@/db/schema";
import { Nav } from "@/components/Nav";
import { getAdmin } from "@/lib/auth/admin";
import { config } from "@/lib/config";
import { dateLabel, inr, stopsLabel } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const TABS = ["pending", "published", "rejected"] as const;

function StatusButton({ id, status, label, tone }: { id: number; status: string; label: string; tone: string }) {
  return (
    <form action={`/api/admin/deals/${id}`} method="post">
      <input type="hidden" name="status" value={status} />
      <button className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${tone}`}>{label}</button>
    </form>
  );
}

export default async function Admin({ searchParams }: PageProps<"/admin">) {
  if (!(await getAdmin())) notFound();
  const viewer = await getViewer();
  const raw = (await searchParams).status;
  const tab = TABS.find((t) => t === raw) ?? "pending";
  const db = await getDb();
  const rows = await db.select({ d: deals, r: routes }).from(deals).innerJoin(routes, eq(deals.routeId, routes.id))
    .where(eq(deals.status, tab)).orderBy(desc(deals.foundAt)).limit(100);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Admin</h1>
      <Nav viewer={viewer} />
      <p className="mb-4 text-sm text-neutral-500">
        Review is {config.review.required ? <b>ON</b> : <b>OFF</b>} (<code>REVIEW_REQUIRED=1</code> makes new deals wait here before going live).{" "}
        <Link href="/admin/transit" className="underline">Edit transit-visa list →</Link>
      </p>
      <div className="mb-4 flex items-center gap-2 text-sm">
        {TABS.map((t) => <Link key={t} href={`/admin?status=${t}`} className={`rounded-full px-3 py-1 capitalize ${t === tab ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"}`}>{t}</Link>)}
        {tab === "pending" && rows.length > 0 && (
          <form action="/api/admin/approve-all" method="post" className="ml-auto"><button className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">Approve all {rows.length}</button></form>
        )}
      </div>
      <div className="space-y-3">
        {rows.map(({ d, r }) => (
          <article key={d.id} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{r.origin} → {r.destination} <span className="font-normal capitalize text-neutral-500">· {d.cabin}</span></h2>
              <span className="text-lg font-bold">{inr(d.priceInr)}</span>
            </div>
            <p className="text-xs text-neutral-500">{dateLabel(d.departDate)} · {Math.round(d.pctBelow)}% below {inr(d.baselineInr)} · {[d.airline, stopsLabel(d.stops)].filter(Boolean).join(" · ")} · {d.source}</p>
            {d.isErrorFare && <p className="mt-1 text-xs font-semibold text-red-700">⚠️ Possible error fare. Verify it live before approving.</p>}
            {d.visaWarnings.map((w) => <p key={w.country} className="mt-1 text-xs text-amber-800">🛂 {w.note}</p>)}
            <div className="mt-3 flex gap-2">
              {tab !== "published" && <StatusButton id={d.id} status="published" label="Approve" tone="bg-green-600" />}
              {tab !== "rejected" && <StatusButton id={d.id} status="rejected" label="Reject" tone="bg-red-600" />}
              {tab !== "pending" && <StatusButton id={d.id} status="pending" label="Back to pending" tone="bg-neutral-500" />}
              {d.deepLink && <a href={d.deepLink} target="_blank" rel="noopener noreferrer" className="ml-auto self-center text-xs underline">Check link ↗</a>}
            </div>
          </article>
        ))}
        {rows.length === 0 && <p className="py-12 text-center text-neutral-500">Nothing {tab}.</p>}
      </div>
    </main>
  );
}

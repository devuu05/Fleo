import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { transitRules } from "@/db/schema";
import { Nav } from "@/components/Nav";
import { getAdmin } from "@/lib/auth/admin";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";
const input = "w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";

export default async function TransitAdmin() {
  if (!(await getAdmin())) notFound();
  const viewer = await getViewer();
  const rules = await (await getDb()).select().from(transitRules).orderBy(asc(transitRules.countryName));
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Transit-visa watch-list</h1>
      <Nav viewer={viewer} />
      <p className="mb-4 text-sm text-neutral-500">Deals routed through an enabled country get a warning (never hidden). Mark a row <b>verified</b> only after checking official sources; unverified rows say so to users. Changes apply to deals found from now on.</p>
      <div className="space-y-3">
        {rules.map((r) => (
          <form key={r.id} action={`/api/admin/transit/${r.id}`} method="post" className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="font-semibold">{r.countryName} <span className="text-xs font-normal text-neutral-500">{r.countryCode}</span></h2>
            <textarea name="note" defaultValue={r.note} rows={2} className={`${input} mt-2`} />
            <div className="mt-2 flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" name="enabled" defaultChecked={r.enabled} />Enabled</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="verified" defaultChecked={r.verified} />Verified</label>
              <button className="ml-auto rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">Save</button>
            </div>
          </form>
        ))}
      </div>
      <form action="/api/admin/transit" method="post" className="mt-6 flex gap-2">
        <input name="countryCode" placeholder="TR" maxLength={2} className={`${input} w-20`} required />
        <input name="countryName" placeholder="Country name" className={input} required />
        <button className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Add</button>
      </form>
    </main>
  );
}

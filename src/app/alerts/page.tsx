import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { Nav } from "@/components/Nav";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Alerts() {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/login?next=/alerts");
  const rows = await (await getDb()).select().from(alerts).where(eq(alerts.userId, viewer.user.id)).orderBy(desc(alerts.createdAt)).limit(50);
  const label = { sent: "Emailed", logged: "Logged (no email provider set)", failed: "Failed" } as const;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Alerts</h1>
      <Nav viewer={viewer} />
      <p className="mb-4 text-sm text-neutral-500">Everything we&apos;ve sent you. Set what you want in <a className="underline" href="/preferences">My routes</a>.</p>
      <div className="space-y-3">
        {rows.map((a) => (
          <article key={a.id} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="font-semibold leading-snug">{a.subject}</h2>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-neutral-600 dark:text-neutral-300">{a.body}</pre>
            <p className="mt-2 text-[11px] text-neutral-500">{label[a.status as keyof typeof label] ?? a.status} · {a.createdAt.toLocaleString("en-IN")}{a.error ? ` · ${a.error}` : ""}</p>
          </article>
        ))}
        {rows.length === 0 && <p className="py-12 text-center text-neutral-500">No alerts yet. Set your routes, then they&apos;ll show up here when a deal matches.</p>}
      </div>
    </main>
  );
}

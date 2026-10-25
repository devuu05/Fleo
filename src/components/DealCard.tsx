import { dateLabel, duration, inr, stopsLabel } from "@/lib/format";
import type { FeedItem } from "@/lib/feed";

export function DealCard({ deal }: { deal: FeedItem }) {
  const route = (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold leading-tight">
        {deal.originCity} <span className="text-neutral-400">→</span> {deal.destinationCity}
      </h2>
      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize dark:bg-neutral-800">{deal.cabin}</span>
    </div>
  );

  if (deal.access !== "full") {
    return (
      <article className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800" data-access={deal.access}>
        {route}
        <p className="mt-1 text-xs text-neutral-500">{deal.origin} → {deal.destination}</p>
        <div className="mt-3 select-none text-2xl font-bold text-neutral-300 blur-[3px] dark:text-neutral-700" aria-hidden>₹ ••,•••</div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {deal.access === "delayed"
            ? <span>Free in ~{deal.hoursUntilFree}h — Premium sees it now</span>
            : <span>Premium deal — upgrade to see price &amp; dates</span>}
          <span className="font-semibold">🔒</span>
        </div>
      </article>
    );
  }

  const d = deal;
  return (
    <article className="rounded-2xl border border-neutral-200 p-4 shadow-sm dark:border-neutral-800" data-access="full">
      {route}
      <p className="mt-1 text-xs text-neutral-500">
        {d.origin} → {d.destination} · {dateLabel(d.departDate)}{d.returnDate ? ` – ${dateLabel(d.returnDate)}` : " · one-way"}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-bold tracking-tight">{inr(d.priceInr)}</div>
          <div className="text-xs text-neutral-500">usually {inr(d.baselineInr)}</div>
        </div>
        <div className="rounded-xl bg-green-600 px-3 py-1.5 text-right text-white">
          <div className="text-lg font-bold leading-none">{Math.round(d.pctBelow)}% below</div>
          <div className="text-[11px] opacity-90">save {inr(d.savingsInr)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
        {[d.airline, stopsLabel(d.stops), duration(d.durationMinutes)].filter(Boolean).join(" · ")}
      </p>
      {d.isErrorFare && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
          ⚠️ Possible error fare — may be cancelled by the airline. Don&apos;t pay for non-refundable extras until confirmed.
        </p>
      )}
      {d.visaWarnings.map((w) => (
        <p key={w.country} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          🛂 {w.note}
        </p>
      ))}
      {d.deepLink && (
        <a href={d.deepLink} target="_blank" rel="sponsored noopener noreferrer"
           className="mt-4 block rounded-xl bg-blue-600 py-3 text-center font-semibold text-white active:bg-blue-700">
          Book
        </a>
      )}
    </article>
  );
}

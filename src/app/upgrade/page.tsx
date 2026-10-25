import Link from "next/link";
import { Nav } from "@/components/Nav";
import { PayButton } from "@/components/PayButton";
import { razorpayConfigured, testCheckoutEnabled } from "@/lib/billing/razorpay";
import { config } from "@/lib/config";
import { dateLabel, inr } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Upgrade({ searchParams }: PageProps<"/upgrade">) {
  const viewer = await getViewer();
  const paid = (await searchParams).paid === "1";
  const until = viewer.user?.premiumUntil;
  const price = inr(config.billing.planAmountInr);

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Fleo Premium</h1>
      <Nav viewer={viewer} />
      {paid && viewer.isPremium && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">You&apos;re Premium. Thanks!</p>}

      <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="text-3xl font-bold">{price}<span className="text-base font-normal text-neutral-500"> / year</span></div>
        <ul className="mt-4 space-y-2 text-sm">
          <li>✅ Every deal, the moment it&apos;s found (free plan: 1 in 10, after 24 hours)</li>
          <li>✅ Instant email alerts for your routes</li>
          <li>✅ Possible error fares, before they&apos;re gone</li>
        </ul>
        <div className="mt-5">
          {viewer.isPremium ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {until ? `Active until ${dateLabel(until.toISOString().slice(0, 10))}.` : "Active."}
            </p>
          ) : viewer.user ? (
            <PayButton label={`Pay ${price}`} />
          ) : (
            <Link href="/login?next=/upgrade" className="block rounded-xl bg-blue-600 py-3 text-center font-semibold text-white">Sign in to continue</Link>
          )}
        </div>
        {!razorpayConfigured() && testCheckoutEnabled() && <p className="mt-3 text-xs text-purple-700">Test checkout: no money moves. Add Razorpay keys for real payments.</p>}
        <p className="mt-3 text-xs text-neutral-500">One-time payment for 12 months, no auto-renewal. Fleo doesn&apos;t sell flight tickets.</p>
      </div>
    </main>
  );
}

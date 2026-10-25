// Dev-only stand-in for the Razorpay upgrade. Plain form POST => no client JS.
export function PremiumToggle({ isPremium }: { isPremium: boolean }) {
  return (
    <form action="/api/dev/premium" method="post">
      <button className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium dark:border-neutral-700">
        {isPremium ? "Dev: downgrade to Free" : "Dev: upgrade to Premium"}
      </button>
    </form>
  );
}

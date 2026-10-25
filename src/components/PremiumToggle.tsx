// Dev-only stand-in for auth. Plain form POST => no client JS needed.
export function PremiumToggle({ isPremium }: { isPremium: boolean }) {
  return (
    <form action="/api/dev/premium" method="post" className="flex items-center gap-2 text-xs">
      <span className="text-neutral-500">Viewing as</span>
      <input type="hidden" name="premium" value={isPremium ? "0" : "1"} />
      <button className="rounded-full border border-neutral-300 px-3 py-1 font-medium dark:border-neutral-700">
        {isPremium ? "Premium ✓ (switch to Free)" : "Free (switch to Premium)"}
      </button>
    </form>
  );
}

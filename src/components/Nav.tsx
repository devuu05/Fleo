import Link from "next/link";
import type { AppViewer } from "@/lib/viewer";
import { isAdminEmail } from "@/lib/auth/admin";
import { config } from "@/lib/config";

export function Nav({ viewer }: { viewer: AppViewer }) {
  const link = "rounded-full px-3 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800";
  return (
    <nav className="mb-4 flex flex-wrap gap-1 text-sm font-medium">
      <Link href="/" className={link}>Deals</Link>
      {viewer.user && <Link href="/preferences" className={link}>My routes</Link>}
      {viewer.user && <Link href="/alerts" className={link}>Alerts</Link>}
      {config.gating.enabled && !viewer.isPremium && <Link href="/upgrade" className={`${link} text-blue-600`}>Go Premium</Link>}
      {viewer.user && isAdminEmail(viewer.user.email) && <Link href="/prices" className={link}>Prices</Link>}
      {viewer.user && isAdminEmail(viewer.user.email) && <Link href="/admin" className={link}>Admin</Link>}
    </nav>
  );
}

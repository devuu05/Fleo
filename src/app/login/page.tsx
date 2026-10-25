import Link from "next/link";
import { devAuthEnabled, safeNext, supabaseConfigured } from "@/lib/auth/config";

const MSG: Record<string, string> = {
  email: "Enter a valid email address.",
  send: "Couldn't send the sign-in link. Try again in a minute.",
  link: "That sign-in link is invalid or expired. Request a new one.",
};

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const v = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const live = supabaseConfigured(), dev = devAuthEnabled();

  return (
    <main className="mx-auto max-w-sm px-4 pt-16">
      <h1 className="text-2xl font-extrabold tracking-tight">Sign in to Fleo</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {live ? "We'll email you a one-tap sign-in link. No password." : "Dev mode: any email works, nothing is sent."}
      </p>

      {v("sent") ? (
        <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">Check your inbox for the sign-in link.</p>
      ) : live || dev ? (
        <form action="/auth/login" method="post" className="mt-6 space-y-3">
          <input type="hidden" name="next" value={safeNext(v("next"))} />
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com"
                 className="w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-3 dark:border-neutral-700" />
          {v("error") && <p className="text-sm text-red-600">{MSG[v("error")!] ?? "Something went wrong."}</p>}
          <button className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white">{live ? "Email me a link" : "Continue"}</button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-red-600">Sign-in isn&apos;t configured. Set the Supabase env vars.</p>
      )}
      <Link href="/" className="mt-8 block text-sm text-neutral-500 underline">← Back to deals</Link>
    </main>
  );
}

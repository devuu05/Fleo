import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(list) {
        // Server Components can't set cookies; the proxy refreshes the session instead.
        try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {}
      },
    },
  });
}

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void } } }

const loadScript = () => new Promise<void>((ok, fail) => {
  if (window.Razorpay) return ok();
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => ok(); s.onerror = () => fail(new Error("Couldn't load Razorpay"));
  document.body.appendChild(s);
});

export function PayButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pay() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const o = await res.json();
      if (!res.ok) throw new Error(res.status === 401 ? "Please sign in first." : "Payments aren't available right now.");
      const done = () => { router.push("/upgrade?paid=1"); router.refresh(); };
      if (o.mode === "test") {
        await fetch("/api/billing/test-confirm", { method: "POST", body: JSON.stringify({ orderId: o.orderId }) });
        return done();
      }
      await loadScript();
      new window.Razorpay!({
        key: o.keyId, order_id: o.orderId, amount: o.amountInr * 100, currency: "INR", name: "Fleo", description: "Premium, 1 year",
        prefill: { email: o.email },
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const v = await fetch("/api/billing/verify", { method: "POST", body: JSON.stringify({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }) });
          if (v.ok) done(); else setErr("Payment received but couldn't be verified yet. It will activate shortly; contact support if not.");
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <button onClick={pay} disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : label}</button>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </>
  );
}

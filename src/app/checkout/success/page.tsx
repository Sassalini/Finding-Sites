import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const { data: checkout } = sessionId
    ? await supabase.from("stripe_checkout_sessions").select("status,listing_id").eq("id", sessionId).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  const { data: listing } = checkout
    ? await supabase.from("website_listings").select("name,status").eq("id", checkout.listing_id).maybeSingle()
    : { data: null };
  const confirmed = checkout?.status === "complete" && listing?.status === "pending_review";

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <section className="form-card confirmation-card">
        <span className="confirmation-mark">{confirmed ? "✓" : "…"}</span>
        <span className="eyebrow">Stripe Checkout</span>
        <h1>{confirmed ? "Payment confirmed" : "Confirming your payment"}</h1>
        {listing?.name && <p><strong>{listing.name}</strong></p>}
        <p>{confirmed ? "Your listing is now Pending Review. An administrator will approve it before it appears in Finding Sites." : "Stripe is finalising the subscription. Your listing will move to Pending Review as soon as the verified webhook arrives."}</p>
        <div className="form-actions"><Link href="/account" className="button button-accent">View your account</Link><Link href="/" className="button button-secondary">Browse Finding Sites</Link></div>
      </section>
    </main>
  );
}

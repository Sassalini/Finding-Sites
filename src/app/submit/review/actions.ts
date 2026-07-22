"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { getStripeClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function safeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function continueSubmissionAction(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/submit/review/${listingId}?error=configuration`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/submit/review/${listingId}`)}`);

  const { data: listing } = await supabase.from("website_listings").select("id,owner_id,status").eq("id", listingId).maybeSingle();
  if (!listing || listing.owner_id !== user.id || !["draft", "changes_requested", "checkout_pending"].includes(listing.status)) redirect("/account");

  const entitlement = await getListingEntitlement(supabase, user.id);
  if (entitlement.hasQualifyingSubscription) {
    const { error } = await supabase.from("website_listings").update({
      status: "pending_review", rejection_reason: null, submitted_at: new Date().toISOString(),
    }).eq("id", listing.id);
    if (error) redirect(`/submit/review/${listing.id}?error=submit`);
    redirect(`/submit/confirmation?id=${listing.id}&kind=submit`);
  }

  if (["incomplete", "past_due", "unpaid", "paused"].includes(entitlement.subscriptionStatus ?? "")) {
    redirect("/account?billing=attention");
  }

  const stripe = getStripeClient();
  const admin = getSupabaseAdminClient();
  const priceId = process.env.STRIPE_DIRECTORY_PRICE_ID;
  if (!stripe || !admin || !priceId) redirect(`/submit/review/${listing.id}?error=configuration`);

  const requestHeaders = await headers();
  const origin = safeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? null) ?? safeOrigin(requestHeaders.get("origin")) ?? "http://localhost:3000";

  const { data: existingCheckout } = await admin.from("stripe_checkout_sessions").select("id")
    .eq("owner_id", user.id).eq("listing_id", listing.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existingCheckout) {
    let existingUrl: string | null = null;
    try {
      const session = await stripe.checkout.sessions.retrieve(existingCheckout.id);
      if (session.status === "open" && session.url) existingUrl = session.url;
      else await admin.from("stripe_checkout_sessions").update({ status: "expired" }).eq("id", existingCheckout.id);
    } catch {
      await admin.from("stripe_checkout_sessions").update({ status: "expired" }).eq("id", existingCheckout.id);
    }
    if (existingUrl) redirect(existingUrl);
  }

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  let stripeCustomerId = profile?.stripe_customer_id ?? entitlement.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { owner_id: user.id } });
    stripeCustomerId = customer.id;
    const { error } = await admin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", user.id);
    if (error) redirect(`/submit/review/${listing.id}?error=checkout`);
  }

  const activeSubscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 });
  if (activeSubscriptions.data.some((subscription) => ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(subscription.status))) {
    redirect("/account?billing=attention");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/submit/review/${listing.id}?checkout=cancelled`,
    client_reference_id: listing.id,
    customer: stripeCustomerId,
    allow_promotion_codes: true,
    metadata: { listing_id: listing.id, owner_id: user.id },
    subscription_data: { metadata: { owner_id: user.id } },
  });
  if (!session.url) redirect(`/submit/review/${listing.id}?error=checkout`);

  const { error: sessionError } = await admin.from("stripe_checkout_sessions").insert({ id: session.id, owner_id: user.id, listing_id: listing.id });
  if (sessionError) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    redirect(`/submit/review/${listing.id}?error=checkout`);
  }
  const { error: listingError } = await admin.from("website_listings").update({ status: "checkout_pending" }).eq("id", listing.id).eq("owner_id", user.id);
  if (listingError) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    redirect(`/submit/review/${listing.id}?error=checkout`);
  }
  redirect(session.url);
}

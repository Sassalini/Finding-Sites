"use server";

import { redirect } from "next/navigation";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { safeServerError } from "@/lib/server-errors";
import { getCheckoutConfiguration, getStripeRuntimeConfiguration, logStripeConfigurationDiagnostics } from "@/lib/stripe/config";
import { getStripeClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient, logSupabaseAdminConfigurationDiagnostics } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const resumableStatuses = ["draft", "changes_requested", "checkout_pending"] as const;

function safeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function logPaymentError(operation: string, error: unknown) {
  console.error("[continue-submission]", { operation, ...safeServerError(error) });
}

export async function continueSubmissionAction(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  const reviewPath = `/submit/review/${listingId}`;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`${reviewPath}?error=configuration`);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) logPaymentError("auth.getUser", authError);
  if (!user) redirect(`/login?next=${encodeURIComponent(reviewPath)}`);

  const listingResult = await supabase.from("website_listings").select("id,owner_id,status").eq("id", listingId).maybeSingle();
  if (listingResult.error) {
    logPaymentError("website_listings.select", listingResult.error);
    redirect(`${reviewPath}?error=checkout`);
  }
  const listing = listingResult.data;
  if (!listing || listing.owner_id !== user.id || !resumableStatuses.includes(listing.status as (typeof resumableStatuses)[number])) redirect("/account");

  let entitlement: Awaited<ReturnType<typeof getListingEntitlement>>;
  try {
    entitlement = await getListingEntitlement(supabase, user.id, { logPrefix: "[continue-submission]" });
  } catch (error) {
    logPaymentError("listing-entitlement", error);
    redirect(`${reviewPath}?error=checkout`);
  }
  if (entitlement.listingCount > entitlement.listingLimit) {
    logPaymentError("listing-limit", new Error("Existing listing count exceeds the configured limit."));
    redirect(`${reviewPath}?error=checkout`);
  }

  const admin = getSupabaseAdminClient();
  logSupabaseAdminConfigurationDiagnostics();
  if (!admin) redirect(`${reviewPath}?error=configuration`);

  if (entitlement.hasQualifyingSubscription) {
    const { error } = await admin.from("website_listings").update({
      status: "pending_review", rejection_reason: null, submitted_at: new Date().toISOString(),
    }).eq("id", listing.id).eq("owner_id", user.id).in("status", [...resumableStatuses]);
    if (error) {
      logPaymentError("website_listings.submit", error);
      redirect(`${reviewPath}?error=submit`);
    }
    redirect(`/submit/confirmation?id=${listing.id}&kind=submit`);
  }

  if (["incomplete", "past_due", "unpaid", "paused"].includes(entitlement.subscriptionStatus ?? "")) {
    redirect("/account?billing=attention");
  }

  const stripeRuntimeConfig = getStripeRuntimeConfiguration();
  const checkoutConfig = getCheckoutConfiguration(stripeRuntimeConfig);
  logStripeConfigurationDiagnostics(stripeRuntimeConfig);
  if (!checkoutConfig) {
    redirect(`${reviewPath}?error=configuration`);
  }
  const stripe = getStripeClient();
  if (!stripe) {
    logStripeConfigurationDiagnostics();
    redirect(`${reviewPath}?error=configuration`);
  }

  const origin = safeOrigin(checkoutConfig.siteUrl);
  if (!origin) {
    logStripeConfigurationDiagnostics();
    redirect(`${reviewPath}?error=configuration`);
  }

  const checkoutResult = await admin.from("stripe_checkout_sessions").select("id")
    .eq("owner_id", user.id).eq("listing_id", listing.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (checkoutResult.error) {
    logPaymentError("stripe_checkout_sessions.select", checkoutResult.error);
    redirect(`${reviewPath}?error=checkout`);
  }
  if (checkoutResult.data) {
    let existingUrl: string | null = null;
    let retrievalFailed = false;
    try {
      const session = await stripe.checkout.sessions.retrieve(checkoutResult.data.id);
      if (session.status === "open" && session.url) existingUrl = session.url;
      else {
        const { error } = await admin.from("stripe_checkout_sessions").update({ status: "expired" }).eq("id", checkoutResult.data.id);
        if (error) logPaymentError("stripe_checkout_sessions.expire-stale", error);
      }
    } catch (error) {
      logPaymentError("stripe.checkout.sessions.retrieve", error);
      retrievalFailed = true;
    }
    if (retrievalFailed) redirect(`${reviewPath}?error=checkout`);
    if (existingUrl) redirect(existingUrl);
  }

  const profileResult = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (profileResult.error) {
    logPaymentError("profiles.select", profileResult.error);
    redirect(`${reviewPath}?error=checkout`);
  }
  let stripeCustomerId = profileResult.data?.stripe_customer_id ?? entitlement.stripeCustomerId;
  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({ email: user.email, metadata: { owner_id: user.id } });
      stripeCustomerId = customer.id;
    } catch (error) {
      logPaymentError("stripe.customers.create", error);
      redirect(`${reviewPath}?error=checkout`);
    }
    const { error } = await admin.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id);
    if (error) {
      logPaymentError("profiles.update-customer", error);
      redirect(`${reviewPath}?error=checkout`);
    }
  }

  let hasConflictingSubscription = false;
  try {
    const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 });
    hasConflictingSubscription = subscriptions.data.some((subscription) => ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(subscription.status));
  } catch (error) {
    logPaymentError("stripe.subscriptions.list", error);
    redirect(`${reviewPath}?error=checkout`);
  }
  if (hasConflictingSubscription) redirect("/account?billing=attention");

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: checkoutConfig.directoryPriceId, quantity: 1 }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${reviewPath}?checkout=cancelled`,
      client_reference_id: listing.id,
      customer: stripeCustomerId,
      allow_promotion_codes: true,
      metadata: { listing_id: listing.id, owner_id: user.id },
      subscription_data: { metadata: { listing_id: listing.id, owner_id: user.id } },
    });
  } catch (error) {
    logPaymentError("stripe.checkout.sessions.create", error);
    redirect(`${reviewPath}?error=checkout`);
  }
  if (!session.url) redirect(`${reviewPath}?error=checkout`);

  const { error: sessionError } = await admin.from("stripe_checkout_sessions").insert({ id: session.id, owner_id: user.id, listing_id: listing.id });
  if (sessionError) {
    logPaymentError("stripe_checkout_sessions.insert", sessionError);
    await stripe.checkout.sessions.expire(session.id).catch((error) => logPaymentError("stripe.checkout.sessions.expire", error));
    redirect(`${reviewPath}?error=checkout`);
  }
  const { error: listingError } = await admin.from("website_listings").update({ status: "checkout_pending" })
    .eq("id", listing.id).eq("owner_id", user.id).in("status", [...resumableStatuses]);
  if (listingError) {
    logPaymentError("website_listings.checkout-pending", listingError);
    await stripe.checkout.sessions.expire(session.id).catch((error) => logPaymentError("stripe.checkout.sessions.expire", error));
    redirect(`${reviewPath}?error=checkout`);
  }
  redirect(session.url);
}

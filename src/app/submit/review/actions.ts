"use server";

import { redirect } from "next/navigation";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { safeServerError } from "@/lib/server-errors";
import { getCheckoutConfiguration, getStripeRuntimeConfiguration, logStripeConfigurationDiagnostics } from "@/lib/stripe/config";
import { getStripeClient, withStripeTiming } from "@/lib/stripe/server";
import { getSupabaseAdminClient, logSupabaseAdminConfigurationDiagnostics } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const resumableStatuses = ["draft", "changes_requested", "checkout_pending"] as const;
const STRIPE_CHECKOUT_ERROR = "We couldn’t start checkout. Please try again.";
const CHECKOUT_REQUEST_VERSION = "managed-payments-disabled-v1";

export type ContinueSubmissionState = { error?: string; startNewCheckoutAttempt?: boolean };

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

function shouldRetrySameCheckoutAttempt(error: unknown) {
  if (!error || typeof error !== "object" || !("type" in error)) return false;
  const type = (error as { type?: unknown }).type;
  return type === "StripeConnectionError" || type === "StripeAPIError";
}

function logCheckoutAttempt(
  listingId: string,
  checkoutAttemptId: string,
  existingStripeSessionReused: boolean,
  newStripeSessionCreated: boolean,
) {
  console.info("[stripe-checkout-attempt]", {
    listingId,
    checkoutAttemptId,
    existingStripeSessionReused,
    newStripeSessionCreated,
  });
}

export async function continueSubmissionAction(
  _state: ContinueSubmissionState,
  formData: FormData,
): Promise<ContinueSubmissionState> {
  const listingId = String(formData.get("listingId") ?? "");
  const startNewCheckoutAttempt = String(formData.get("startNewCheckoutAttempt") ?? "false") === "true";
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

  const attemptResult = await admin.from("stripe_checkout_attempts")
    .select("checkout_attempt_id,stripe_checkout_session_id,checkout_status,request_version")
    .eq("owner_id", user.id).eq("listing_id", listing.id)
    .in("checkout_status", ["creating", "open"])
    .order("checkout_started_at", { ascending: false }).limit(1).maybeSingle();
  if (attemptResult.error) {
    logPaymentError("stripe_checkout_attempts.select", attemptResult.error);
    redirect(`${reviewPath}?error=checkout`);
  }
  let checkoutAttempt = attemptResult.data;

  if (checkoutAttempt && startNewCheckoutAttempt) {
    let completedSessionFound = false;
    try {
      if (checkoutAttempt.stripe_checkout_session_id) {
        const priorSession = await stripe.checkout.sessions.retrieve(checkoutAttempt.stripe_checkout_session_id);
        completedSessionFound = priorSession.status === "complete";
        if (!completedSessionFound) {
          if (priorSession.status === "open") await stripe.checkout.sessions.expire(priorSession.id);
          const { error: sessionError } = await admin.from("stripe_checkout_sessions")
            .update({ status: "expired" }).eq("id", priorSession.id);
          if (sessionError) throw sessionError;
        }
      }
      if (!completedSessionFound) {
        const { error: abandonError } = await admin.from("stripe_checkout_attempts")
          .update({ checkout_status: "abandoned" })
          .eq("checkout_attempt_id", checkoutAttempt.checkout_attempt_id);
        if (abandonError) throw abandonError;
        checkoutAttempt = null;
      }
    } catch (error) {
      logPaymentError("stripe.checkout.attempt.abandon", error);
      return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: true };
    }
    if (completedSessionFound) redirect("/account?billing=attention");
  }

  if (checkoutAttempt?.stripe_checkout_session_id) {
    const currentAttempt = checkoutAttempt;
    const currentSessionId = checkoutAttempt.stripe_checkout_session_id;
    let existingUrl: string | null = null;
    let completedSessionFound = false;
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(currentSessionId);
      if (existingSession.status === "open" && existingSession.url) {
        existingUrl = existingSession.url;
      } else {
        const terminalStatus = existingSession.status === "complete" ? "complete" : "expired";
        const { error: sessionError } = await admin.from("stripe_checkout_sessions")
          .update({ status: terminalStatus }).eq("id", existingSession.id);
        if (sessionError) throw sessionError;
        const { error: attemptError } = await admin.from("stripe_checkout_attempts")
          .update({ checkout_status: terminalStatus })
          .eq("checkout_attempt_id", currentAttempt.checkout_attempt_id);
        if (attemptError) throw attemptError;
        checkoutAttempt = null;
        completedSessionFound = terminalStatus === "complete";
      }
    } catch (error) {
      logPaymentError("stripe.checkout.sessions.retrieve", error);
      if (!shouldRetrySameCheckoutAttempt(error)) {
        await admin.from("stripe_checkout_attempts").update({ checkout_status: "failed" })
          .eq("checkout_attempt_id", currentAttempt.checkout_attempt_id);
      }
      logCheckoutAttempt(listing.id, currentAttempt.checkout_attempt_id, false, false);
      return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: !shouldRetrySameCheckoutAttempt(error) };
    }
    if (existingUrl) {
      logCheckoutAttempt(listing.id, currentAttempt.checkout_attempt_id, true, false);
      redirect(existingUrl);
    }
    if (completedSessionFound) redirect("/account?billing=attention");
  }

  const profileResult = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (profileResult.error) {
    logPaymentError("profiles.select", profileResult.error);
    redirect(`${reviewPath}?error=checkout`);
  }
  let stripeCustomerId = profileResult.data?.stripe_customer_id ?? entitlement.stripeCustomerId;
  if (!stripeCustomerId) {
    try {
      const customer = await withStripeTiming("stripe.customers.create", () => stripe.customers.create(
        { email: user.email, metadata: { owner_id: user.id } },
        { idempotencyKey: `finding-sites:customer:${user.id}` },
      ));
      stripeCustomerId = customer.id;
    } catch (error) {
      logPaymentError("stripe.customers.create", error);
      return { error: STRIPE_CHECKOUT_ERROR };
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
    return { error: STRIPE_CHECKOUT_ERROR };
  }
  if (hasConflictingSubscription) redirect("/account?billing=attention");

  if (checkoutAttempt && checkoutAttempt.request_version !== CHECKOUT_REQUEST_VERSION) {
    const { error } = await admin.from("stripe_checkout_attempts").update({ checkout_status: "failed" })
      .eq("checkout_attempt_id", checkoutAttempt.checkout_attempt_id);
    if (error) {
      logPaymentError("stripe_checkout_attempts.supersede", error);
      return { error: STRIPE_CHECKOUT_ERROR };
    }
    checkoutAttempt = null;
  }

  if (!checkoutAttempt) {
    const checkoutAttemptId = crypto.randomUUID();
    const insertResult = await admin.from("stripe_checkout_attempts").insert({
      checkout_attempt_id: checkoutAttemptId,
      owner_id: user.id,
      listing_id: listing.id,
      checkout_status: "creating",
      request_version: CHECKOUT_REQUEST_VERSION,
    }).select("checkout_attempt_id,stripe_checkout_session_id,checkout_status,request_version").single();
    if (insertResult.error?.code === "23505") {
      const concurrentResult = await admin.from("stripe_checkout_attempts")
        .select("checkout_attempt_id,stripe_checkout_session_id,checkout_status,request_version")
        .eq("owner_id", user.id).eq("listing_id", listing.id)
        .in("checkout_status", ["creating", "open"])
        .order("checkout_started_at", { ascending: false }).limit(1).maybeSingle();
      if (concurrentResult.error || !concurrentResult.data) {
        logPaymentError("stripe_checkout_attempts.select-concurrent", concurrentResult.error);
        return { error: STRIPE_CHECKOUT_ERROR };
      }
      checkoutAttempt = concurrentResult.data;
    } else if (insertResult.error || !insertResult.data) {
      logPaymentError("stripe_checkout_attempts.insert", insertResult.error);
      return { error: STRIPE_CHECKOUT_ERROR };
    } else {
      checkoutAttempt = insertResult.data;
    }
  }

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await withStripeTiming("stripe.checkout.sessions.create", () => stripe.checkout.sessions.create(
      {
        mode: "subscription",
        managed_payments: { enabled: false },
        line_items: [{ price: checkoutConfig.directoryPriceId, quantity: 1 }],
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${reviewPath}?checkout=cancelled`,
        client_reference_id: listing.id,
        customer: stripeCustomerId,
        allow_promotion_codes: true,
        metadata: { listing_id: listing.id, owner_id: user.id },
        subscription_data: { metadata: { listing_id: listing.id, owner_id: user.id } },
      },
      { idempotencyKey: `finding-sites:checkout:${listing.id}:${checkoutAttempt.checkout_attempt_id}` },
    ));
  } catch (error) {
    logPaymentError("stripe.checkout.sessions.create", error);
    const retrySameAttempt = shouldRetrySameCheckoutAttempt(error);
    if (!retrySameAttempt) {
      const { error: attemptError } = await admin.from("stripe_checkout_attempts")
        .update({ checkout_status: "failed" })
        .eq("checkout_attempt_id", checkoutAttempt.checkout_attempt_id);
      if (attemptError) logPaymentError("stripe_checkout_attempts.fail", attemptError);
    }
    logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, false);
    return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: !retrySameAttempt };
  }
  if (!session.url) {
    await admin.from("stripe_checkout_attempts").update({ checkout_status: "failed" })
      .eq("checkout_attempt_id", checkoutAttempt.checkout_attempt_id);
    logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, false);
    return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: true };
  }

  const { error: sessionError } = await admin.from("stripe_checkout_sessions")
    .upsert({ id: session.id, owner_id: user.id, listing_id: listing.id }, { onConflict: "id" });
  if (sessionError) {
    logPaymentError("stripe_checkout_sessions.insert", sessionError);
    logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, false);
    return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: false };
  }
  const { error: attemptError } = await admin.from("stripe_checkout_attempts").update({
    stripe_checkout_session_id: session.id,
    checkout_status: "open",
  }).eq("checkout_attempt_id", checkoutAttempt.checkout_attempt_id);
  if (attemptError) {
    logPaymentError("stripe_checkout_attempts.attach-session", attemptError);
    logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, false);
    return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: false };
  }
  const { error: listingError } = await admin.from("website_listings").update({ status: "checkout_pending" })
    .eq("id", listing.id).eq("owner_id", user.id).in("status", [...resumableStatuses]);
  if (listingError) {
    logPaymentError("website_listings.checkout-pending", listingError);
    logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, false);
    return { error: STRIPE_CHECKOUT_ERROR, startNewCheckoutAttempt: false };
  }
  logCheckoutAttempt(listing.id, checkoutAttempt.checkout_attempt_id, false, true);
  redirect(session.url);
}

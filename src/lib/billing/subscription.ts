import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { billingWarning, LISTING_LIMIT, qualifiesForNewSubmissions, retainsPublicAccess } from "@/lib/billing/policy";

export function trialsEnabled() {
  return process.env.STRIPE_TRIALS_ENABLED === "true";
}

type EntitlementOptions = { logPrefix?: string };

function databaseError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

export async function getListingEntitlement(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  { logPrefix }: EntitlementOptions = {},
) {
  if (logPrefix) console.info(`${logPrefix} loading entitlement`);
  if (logPrefix) console.info(`${logPrefix} loading existing listing count`);

  const [subscriptionResult, listingsResult] = await Promise.all([
    supabase.from("billing_subscriptions")
      .select("status,cancel_at_period_end,current_period_start,current_period_end,canceled_at,ended_at,grace_period_end,stripe_customer_id,stripe_subscription_id,stripe_price_id")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase.rpc("count_slot_occupying_listings", {
      candidate_owner_id: ownerId,
      excluded_listing_id: null,
    }),
  ]);

  if (subscriptionResult.error) {
    if (logPrefix) console.error(`${logPrefix} entitlement query failed`, databaseError(subscriptionResult.error));
    throw new Error("Listing entitlement query failed.", { cause: subscriptionResult.error });
  }
  if (listingsResult.error) {
    if (logPrefix) console.error(`${logPrefix} listing-count query failed`, databaseError(listingsResult.error));
    throw new Error("Existing listing-count query failed.", { cause: listingsResult.error });
  }

  const subscription = subscriptionResult.data;
  const listingCount = listingsResult.data;
  if (!Number.isSafeInteger(listingCount) || listingCount < 0) {
    throw new Error("Listing slot count returned an invalid value.");
  }
  if (logPrefix) console.info(`${logPrefix} entitlement loaded`, { found: Boolean(subscription) });
  if (logPrefix) console.info(`${logPrefix} existing listing count loaded`, { listingCount });
  const hasQualifyingSubscription = qualifiesForNewSubmissions(subscription?.status ?? null, trialsEnabled());
  const hasCurrentPublicAccess = retainsPublicAccess(
    subscription?.status ?? null,
    subscription?.current_period_end ?? null,
    subscription?.grace_period_end ?? null,
    trialsEnabled(),
  );

  return {
    hasQualifyingSubscription,
    hasCurrentPublicAccess,
    subscriptionStatus: subscription?.status ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    currentPeriodStart: subscription?.current_period_start ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    listingLimit: LISTING_LIMIT,
    listingCount,
    remainingSlots: Math.max(0, LISTING_LIMIT - listingCount),
    canCreateListing: listingCount < LISTING_LIMIT,
    billingWarning: billingWarning(subscription?.status ?? null, subscription?.grace_period_end ?? null),
    stripeCustomerId: subscription?.stripe_customer_id ?? null,
  };
}

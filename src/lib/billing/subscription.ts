import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { billingWarning, isCountableListing, LISTING_LIMIT, qualifiesForNewSubmissions, retainsPublicAccess } from "@/lib/billing/policy";

export function trialsEnabled() {
  return process.env.STRIPE_TRIALS_ENABLED === "true";
}

export async function getListingEntitlement(supabase: SupabaseClient<Database>, ownerId: string) {
  const [{ data: subscription }, { data: listings }] = await Promise.all([
    supabase.from("billing_subscriptions")
      .select("status,cancel_at_period_end,current_period_start,current_period_end,canceled_at,ended_at,grace_period_end,stripe_customer_id,stripe_subscription_id,stripe_price_id")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase.from("website_listings").select("status,deleted_at").eq("owner_id", ownerId),
  ]);
  const listingCount = (listings ?? []).filter((listing) => isCountableListing(listing.status, listing.deleted_at)).length;
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

import type { ListingStatus, SubscriptionStatus } from "@/types/database";

export const LISTING_LIMIT = 2;
export const COUNTABLE_LISTING_STATUSES: ListingStatus[] = [
  "draft", "checkout_pending", "pending_review", "approved",
  "changes_requested", "suspended", "subscription_inactive",
];

export function isCountableListing(status: ListingStatus, deletedAt?: string | null) {
  return !deletedAt && COUNTABLE_LISTING_STATUSES.includes(status);
}

export function qualifiesForNewSubmissions(status: SubscriptionStatus | null, trialsEnabled: boolean) {
  return status === "active" || (status === "trialing" && trialsEnabled);
}

export function retainsPublicAccess(
  status: SubscriptionStatus | null,
  currentPeriodEnd: string | null,
  gracePeriodEnd: string | null,
  trialsEnabled: boolean,
  now = Date.now(),
) {
  if (qualifiesForNewSubmissions(status, trialsEnabled)) return true;
  if (status === "canceled" && currentPeriodEnd) return new Date(currentPeriodEnd).getTime() > now;
  if (status === "past_due" && gracePeriodEnd) return new Date(gracePeriodEnd).getTime() > now;
  return false;
}

export function billingWarning(status: SubscriptionStatus | null, gracePeriodEnd: string | null) {
  if (status === "past_due") return gracePeriodEnd
    ? `Payment failed. Update billing before ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(gracePeriodEnd))} to avoid listings being hidden.`
    : "Payment failed. Update billing details to keep listings visible.";
  if (status === "unpaid") return "The subscription is unpaid and public listing access is paused. Update billing to reactivate it.";
  if (status === "incomplete") return "Subscription setup is incomplete. Finish payment in Billing before submitting listings.";
  if (status === "paused") return "The subscription is paused. Resume it in Billing to restore listing access.";
  return null;
}

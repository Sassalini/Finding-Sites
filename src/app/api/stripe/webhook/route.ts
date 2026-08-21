import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { qualifiesForNewSubmissions } from "@/lib/billing/policy";
import { trialsEnabled } from "@/lib/billing/subscription";
import { finalizeListingAfterEntitlement } from "@/lib/listings/finalize";
import { getStripeRuntimeConfiguration, logStripeConfigurationDiagnostics } from "@/lib/stripe/config";
import { getStripeClient } from "@/lib/stripe/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/types/database";

export const runtime = "nodejs";
const PAYMENT_GRACE_DAYS = 7;

function stripeId(value: string | { id: string }) {
  return typeof value === "string" ? value : value.id;
}

function stripeDate(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function resolveOwnerId(subscription: Stripe.Subscription, fallbackOwnerId?: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const customer = stripeId(subscription.customer);
  const { data: existing } = await admin.from("billing_subscriptions").select("owner_id")
    .or(`stripe_subscription_id.eq.${subscription.id},stripe_customer_id.eq.${customer}`).maybeSingle();
  if (existing?.owner_id) return existing.owner_id;
  const { data: profile } = await admin.from("profiles").select("id").eq("stripe_customer_id", customer).maybeSingle();
  if (profile?.id && (!fallbackOwnerId || fallbackOwnerId === profile.id)) return profile.id;
  return null;
}

async function applyListingLifecycle(ownerId: string, status: SubscriptionStatus, currentPeriodEnd: string | null, gracePeriodEnd: string | null) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const now = Date.now();
  const entitled = qualifiesForNewSubmissions(status, trialsEnabled())
    || (status === "canceled" && currentPeriodEnd !== null && new Date(currentPeriodEnd).getTime() > now)
    || (status === "past_due" && gracePeriodEnd !== null && new Date(gracePeriodEnd).getTime() > now);

  if (entitled) {
    const { error } = await admin.from("website_listings").update({
      status: "approved", subscription_inactive_at: null, inactive_from_status: null,
    }).eq("owner_id", ownerId).eq("status", "subscription_inactive").eq("inactive_from_status", "approved");
    if (error) throw error;
    return;
  }

  if (["unpaid", "incomplete_expired", "paused", "canceled"].includes(status)
    || (status === "past_due" && (!gracePeriodEnd || new Date(gracePeriodEnd).getTime() <= now))) {
    const { error } = await admin.from("website_listings").update({
      status: "subscription_inactive", subscription_inactive_at: new Date().toISOString(), inactive_from_status: "approved",
    }).eq("owner_id", ownerId).eq("status", "approved");
    if (error) throw error;
  }
}

async function syncSubscription(subscription: Stripe.Subscription, fallbackOwnerId?: string, gracePeriodEndOverride?: string | null) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  if (!priceId || priceId !== getStripeRuntimeConfiguration().directoryPriceId) return null;

  const ownerId = await resolveOwnerId(subscription, fallbackOwnerId);
  if (!ownerId) return null;
  const status = subscription.status as SubscriptionStatus;
  const customerId = stripeId(subscription.customer);
  const currentPeriodStart = stripeDate(item?.current_period_start);
  const currentPeriodEnd = stripeDate(item?.current_period_end);
  const gracePeriodEnd = gracePeriodEndOverride === undefined
    ? (status === "active" ? null : undefined)
    : gracePeriodEndOverride;

  const payload = {
    owner_id: ownerId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    canceled_at: stripeDate(subscription.canceled_at),
    ended_at: stripeDate(subscription.ended_at),
    trial_entitlement: trialsEnabled(),
    ...(gracePeriodEnd !== undefined ? { grace_period_end: gracePeriodEnd } : {}),
  };
  const { error } = await admin.from("billing_subscriptions").upsert(payload, { onConflict: "owner_id" });
  if (error) throw error;
  await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", ownerId);
  await applyListingLifecycle(ownerId, status, currentPeriodEnd, gracePeriodEnd ?? null);
  return { ownerId, status };
}

async function processCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = getSupabaseAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) throw new Error("Billing is not configured.");
  const { data: checkout, error } = await admin.from("stripe_checkout_sessions").select("owner_id,listing_id")
    .eq("id", session.id).maybeSingle();
  if (error) throw error;
  if (!checkout || session.mode !== "subscription" || !session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(stripeId(session.subscription));
  const synced = await syncSubscription(subscription, checkout.owner_id);
  const completedAt = new Date().toISOString();
  await admin.from("stripe_checkout_sessions").update({ status: "complete", completed_at: completedAt }).eq("id", session.id);
  await admin.from("stripe_checkout_attempts").update({ checkout_status: "complete" }).eq("stripe_checkout_session_id", session.id);
  if (synced && qualifiesForNewSubmissions(synced.status, trialsEnabled())) {
    await finalizeListingAfterEntitlement(checkout.listing_id, checkout.owner_id);
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return subscription ? stripeId(subscription) : null;
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const admin = getSupabaseAdminClient();
  const secret = getStripeRuntimeConfiguration().webhookSecret;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !admin || !secret || !signature) {
    if (!stripe || !secret) logStripeConfigurationDiagnostics();
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const { data: existing } = await admin.from("stripe_webhook_events").select("processed_at").eq("id", event.id).maybeSingle();
  if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  if (!existing) {
    const { error } = await admin.from("stripe_webhook_events").insert({ id: event.id, event_type: event.type });
    if (error && error.code !== "23505") return NextResponse.json({ error: "Could not record event." }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await processCheckoutCompleted(event.data.object);
        break;
      case "checkout.session.expired": {
        const session = event.data.object;
        const { data: checkout } = await admin.from("stripe_checkout_sessions").select("listing_id").eq("id", session.id).maybeSingle();
        await admin.from("stripe_checkout_sessions").update({ status: "expired" }).eq("id", session.id);
        await admin.from("stripe_checkout_attempts").update({ checkout_status: "expired" }).eq("stripe_checkout_session_id", session.id);
        if (checkout) await admin.from("website_listings").update({ status: "draft" }).eq("id", checkout.listing_id).eq("status", "checkout_pending");
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subscriptionId = invoiceSubscriptionId(event.data.object);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const grace = event.type === "invoice.payment_failed"
            ? new Date(Date.now() + PAYMENT_GRACE_DAYS * 86_400_000).toISOString()
            : null;
          await syncSubscription(subscription, undefined, grace);
        }
        break;
      }
      default:
        break;
    }
    const { error } = await admin.from("stripe_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", event.id);
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing failure";
    await admin.from("stripe_webhook_events").update({ processing_error: message }).eq("id", event.id);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { getStripeClient } from "@/lib/stripe/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AccountActionState = { error?: string; message?: string };

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  return { supabase, user };
}

export async function createBillingPortalAction() {
  const { supabase, user } = await requireUser();
  const stripe = getStripeClient();
  if (!stripe) redirect("/account?error=billing-configuration");
  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle(),
    supabase.from("billing_subscriptions").select("stripe_customer_id").eq("owner_id", user.id).maybeSingle(),
  ]);
  const customerId = profile?.stripe_customer_id ?? subscription?.stripe_customer_id;
  if (!customerId) redirect("/account?error=no-billing-account");
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/account` });
  redirect(session.url);
}

export async function updateProfileAction(_state: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const { supabase, user } = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!displayName || displayName.length > 80) return { error: "Enter a display name of no more than 80 characters." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  const { error: profileError } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  if (profileError) return { error: "We could not update your profile." };
  if (email !== user.email) {
    const { error: emailError } = await supabase.auth.updateUser({ email });
    if (emailError) return { error: "Your name was updated, but the email change could not be requested." };
    revalidatePath("/account");
    return { message: "Profile updated. Check both email inboxes to confirm the address change." };
  }
  revalidatePath("/account");
  return { message: "Profile updated." };
}

export async function deleteListingAction(formData: FormData) {
  const { supabase } = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "DELETE") redirect("/account?error=delete-confirmation");
  const { error } = await supabase.rpc("soft_delete_owned_listing", { candidate_listing_id: listingId });
  if (error) redirect("/account?error=delete-listing");
  updateTag("directory-statistics");
  revalidatePath("/", "layout");
}

export async function requestAccountDeletionAction(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (String(formData.get("confirmation") ?? "") !== "DELETE") redirect("/account?error=delete-confirmation");
  const entitlement = await getListingEntitlement(supabase, user.id);
  if (entitlement.subscriptionStatus && !["canceled", "incomplete_expired"].includes(entitlement.subscriptionStatus)) {
    redirect("/account?error=cancel-subscription-first");
  }
  const { error } = await supabase.rpc("request_account_deletion", {});
  if (error) redirect(error.message.includes("ACTIVE_BILLING_EXISTS") ? "/account?error=cancel-subscription-first" : "/account?error=account-deletion");
  await supabase.auth.signOut();
  redirect("/?account=deletion-requested");
}

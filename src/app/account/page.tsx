import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createBillingPortalAction } from "@/app/account/actions";
import { DeleteDialog } from "@/app/account/DeleteDialog";
import { ProfileForm } from "@/app/account/ProfileForm";
import { logoutAction } from "@/app/login/actions";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRevisionStatus, ListingStatus } from "@/types/database";

export const metadata: Metadata = { title: "Your Account", robots: { index: false, follow: false } };

const statusLabels: Record<ListingStatus | ListingRevisionStatus, string> = {
  draft: "Draft", checkout_pending: "Checkout pending", pending_review: "Pending review", approved: "Approved", rejected: "Changes requested", changes_requested: "Changes requested", suspended: "Suspended", subscription_inactive: "Subscription inactive", deleted: "Deleted", permanently_rejected: "Permanently rejected", expired: "Expired",
};
const statusExplanations: Partial<Record<ListingStatus, string>> = {
  draft: "Saved privately. Review and submit it when ready.",
  checkout_pending: "Waiting for Stripe to confirm subscription payment.",
  pending_review: "The directory team is reviewing this site.",
  approved: "Published in Finding Sites.",
  changes_requested: "Update the listing using the review feedback, then resubmit.",
  suspended: "Hidden by an administrator. Contact support for details.",
  subscription_inactive: "Hidden because the paid-through or grace period ended.",
};
const subscriptionLabels = { active: "Active", trialing: "Trialing", incomplete: "Incomplete", incomplete_expired: "Expired", past_due: "Past due", canceled: "Canceled", unpaid: "Unpaid", paused: "Paused" } as const;
const accountErrors: Record<string, string> = {
  "billing-configuration": "Billing management is not configured yet.",
  "no-billing-account": "There is no Stripe billing account to manage yet.",
  "delete-confirmation": "Type DELETE exactly to confirm that action.",
  "delete-listing": "The listing could not be deleted.",
  "cancel-subscription-first": "Cancel the Stripe subscription and wait until the paid-through period ends before deleting the account.",
  "account-deletion": "The account deletion request could not be completed.",
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; billing?: string }> }) {
  const query = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: profile }, { data: listings }, { data: revisions }, entitlement] = await Promise.all([
    supabase.from("profiles").select("display_name,deletion_requested_at,stripe_customer_id").eq("id", user.id).maybeSingle(),
    supabase.from("website_listings").select("id,name,url,normalized_domain,category_id,status,rejection_reason,submitted_at,approved_at,updated_at").eq("owner_id", user.id).neq("status", "deleted").order("updated_at", { ascending: false }),
    supabase.from("listing_revisions").select("id,listing_id,name,status,rejection_reason,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
    getListingEntitlement(supabase, user.id),
  ]);
  const categoryIds = [...new Set((listings ?? []).flatMap((listing) => listing.category_id ? [listing.category_id] : []))];
  const { data: categories } = categoryIds.length ? await supabase.from("categories").select("id,name").in("id", categoryIds) : { data: [] };
  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const revisionsByListing = new Map<string, NonNullable<typeof revisions>>();
  for (const revision of revisions ?? []) revisionsByListing.set(revision.listing_id, [...(revisionsByListing.get(revision.listing_id) ?? []), revision]);
  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Website owner";
  const error = query.error ? accountErrors[query.error] : null;

  return (
    <main className="account-shell" id="main-content">
      <nav className="account-nav" aria-label="Account"><a href="#overview">Overview</a><a href="#sites">My Sites</a><Link href="/account/sites/new">Add Site</Link><a href="#billing">Billing</a><a href="#settings">Account Settings</a></nav>
      <header className="account-heading account-heading-row" id="overview"><div><span className="eyebrow">Your account</span><h1>Welcome, {displayName}</h1><p>{user.email}</p></div><div className="account-actions">{entitlement.canCreateListing ? <Link className="button button-accent" href="/account/sites/new">Add Site</Link> : <span className="slot-limit-note">2-site limit reached</span>}<form action={logoutAction}><button className="button button-secondary">Sign out</button></form></div></header>
      {error && <p className="form-alert form-alert-error">{error}</p>}
      {query.billing === "attention" && <p className="form-alert form-alert-error">This subscription needs attention before another listing can be submitted. Open Manage Billing to continue.</p>}
      {entitlement.billingWarning && <p className="form-alert form-alert-error billing-warning">{entitlement.billingWarning}</p>}

      <section className={`subscription-banner ${entitlement.hasQualifyingSubscription ? "subscription-banner-active" : ""}`} id="billing">
        <div><span className="eyebrow">Directory membership</span><strong>{entitlement.subscriptionStatus ? subscriptionLabels[entitlement.subscriptionStatus] : "No active subscription"}</strong><p>{entitlement.cancelAtPeriodEnd && entitlement.currentPeriodEnd ? `Cancels on ${formatDate(entitlement.currentPeriodEnd)}.` : entitlement.currentPeriodEnd ? `Current billing period ends ${formatDate(entitlement.currentPeriodEnd)}.` : "One recurring subscription covers up to two website listings."}</p><p><strong>{entitlement.listingCount} of {entitlement.listingLimit} listings used</strong> · {entitlement.remainingSlots} remaining</p></div>
        {(entitlement.stripeCustomerId || profile?.stripe_customer_id) && <form action={createBillingPortalAction}><button className="button button-secondary">Manage Billing</button></form>}
      </section>

      <section id="sites">
        {!listings?.length ? <div className="account-empty"><h2>You have not added any websites yet.</h2><p>Your first listing is saved as a draft before any subscription checkout.</p><Link className="button button-accent" href="/account/sites/new">Add Your First Site</Link></div> : <div className="submission-list">{listings.map((listing) => {
          const editable = ["draft", "pending_review", "changes_requested", "approved"].includes(listing.status);
          return <article className="submission-item" key={listing.id}><div className="submission-item-main"><div className="submission-title-line"><h2>{listing.name}</h2><span className={`status-badge status-${listing.status}`}><span aria-hidden="true">●</span> {statusLabels[listing.status]}</span></div><a href={listing.url} target="_blank" rel="noreferrer">{listing.normalized_domain}</a><p>{categoriesById.get(listing.category_id ?? "") ?? "Requested category"} · Submitted {formatDate(listing.submitted_at)}{listing.approved_at ? ` · Approved ${formatDate(listing.approved_at)}` : ""}</p><p className="status-explanation">{statusExplanations[listing.status] ?? "Contact the directory team for information about this status."}</p>{listing.rejection_reason && <div className="rejection-note"><strong>Review feedback</strong><p>{listing.rejection_reason}</p></div>}</div><div className="submission-item-action"><Link href={`/account/sites/${listing.id}`} className="button button-secondary">Preview</Link>{editable && <Link href={`/account/sites/${listing.id}/edit`} className="button button-secondary">{listing.status === "approved" ? "Propose changes" : "Edit"}</Link>}<DeleteDialog listingId={listing.id} listingName={listing.name} /></div>{(revisionsByListing.get(listing.id) ?? []).map((revision) => <div className="revision-row" key={revision.id}><div><strong>Revision: {revision.name}</strong><small>Submitted {formatDate(revision.created_at)}</small>{revision.rejection_reason && <p>{revision.rejection_reason}</p>}</div><span className={`status-badge status-${revision.status}`}>{statusLabels[revision.status]}</span></div>)}</article>;
        })}</div>}
      </section>

      <section className="form-card account-settings" id="settings"><div><span className="eyebrow">Account settings</span><h2>Account details</h2><p>Changing your email address requires confirmation through Supabase.</p></div><ProfileForm displayName={profile?.display_name ?? ""} email={user.email ?? ""} /></section>
      <section className="danger-zone"><div><h2>Danger zone</h2><p>Deleting an account requires billing to be resolved first. Stripe financial records are not erased.</p></div><DeleteDialog /></section>
    </main>
  );
}

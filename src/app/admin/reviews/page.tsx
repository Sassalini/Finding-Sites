import type { Metadata } from "next";
import Link from "next/link";
import { moderateListingAction, moderateRevisionAction } from "@/app/admin/actions";
import { ListingModerationDialog } from "@/app/admin/ListingModerationDialog";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Admin review queue", robots: { index: false, follow: false } };

const errorMessages: Record<string, string> = {
  category: "Choose an active category.",
  duplicate: "A matching category already exists. Assign this request to the existing category instead.",
  reason: "Add a clear reason of between 5 and 1,000 characters.",
  review: "This review could not be completed. It may already have been resolved.",
  revision: "The revision could not be reviewed.",
};

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin("/admin/reviews");
  const [{ data: listings, error: listingError }, { data: categories }, { data: revisions }] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,name,url,normalized_domain,short_description,contact_email,category_request_id,submitted_at,status").eq("status", "pending_review").not("category_request_id", "is", null).order("submitted_at"),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("listing_revisions").select("id,listing_id,name,url,short_description,category_id,category_request_id,created_at").eq("status", "pending_review").order("created_at"),
  ]);
  const requestIds = (listings ?? []).map((listing) => listing.category_request_id).filter((id): id is string => Boolean(id));
  const ownerIds = [...new Set((listings ?? []).map((listing) => listing.owner_id).filter((id): id is string => Boolean(id)))];
  const [{ data: requests }, { data: subscriptions }] = await Promise.all([
    requestIds.length ? supabase.from("category_requests").select("id,requested_name,requested_description,status").in("id", requestIds) : Promise.resolve({ data: [] }),
    ownerIds.length ? supabase.from("billing_subscriptions").select("owner_id,status,current_period_end").in("owner_id", ownerIds) : Promise.resolve({ data: [] }),
  ]);
  const requestsById = new Map((requests ?? []).map((request) => [request.id, request]));
  const subscriptionsByOwner = new Map((subscriptions ?? []).map((subscription) => [subscription.owner_id, subscription]));

  return (
    <main className="account-shell" id="main-content">
      <nav className="account-nav" aria-label="Administrator navigation"><Link href="/admin">Overview</Link><Link href="/admin/listings">Listings</Link><Link href="/admin/reviews">Review Queue</Link><Link href="/admin/categories">Categories</Link><Link href="/">Back to Finding Sites</Link><Link href="/account">Account</Link></nav>
      <header className="account-heading account-heading-row"><div><span className="eyebrow">Administrator</span><h1>Category review queue</h1><p>Resolve requested categories without loading submitted websites inside the admin interface.</p></div><span className="queue-count">{listings?.length ?? 0} waiting</span></header>
      {query.error && <p className="form-alert form-alert-error" role="alert">{errorMessages[query.error] ?? errorMessages.review}</p>}
      {query.success && <p className="form-alert" role="status">Review completed successfully.</p>}
      {listingError && <p className="form-alert form-alert-error" role="alert">The review queue could not be loaded.</p>}
      {!listings?.length ? <section className="account-empty"><h2>Queue clear</h2><p>There are no new-category listings waiting for review.</p></section> : <div className="moderation-list">{listings.map((listing) => {
        const request = listing.category_request_id ? requestsById.get(listing.category_request_id) : null;
        const subscription = listing.owner_id ? subscriptionsByOwner.get(listing.owner_id) : null;
        return <article className="form-card moderation-card" key={listing.id}>
          <div className="moderation-card-heading"><div><span className="eyebrow">Requested category</span><h2>{listing.name}</h2><a href={listing.url} target="_blank" rel="noopener noreferrer">Visit Website — {listing.normalized_domain}</a></div><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.submitted_at))}</time></div>
          <p>{listing.short_description}</p>
          <dl className="admin-review-details"><div><dt>Account reference</dt><dd>{listing.owner_id}</dd></div><div><dt>Administrative contact</dt><dd>{listing.contact_email ?? "Not provided"}</dd></div><div><dt>Entitlement</dt><dd>{subscription?.status ?? "No subscription record"}</dd></div><div><dt>Listing status</dt><dd>{listing.status}</dd></div></dl>
          <div className="category-request-review"><strong>{request?.requested_name ?? "Unavailable category request"}</strong><p>{request?.requested_description || "No explanation was supplied."}</p></div>
          <div className="admin-review-actions">
            <form action={moderateListingAction} className="moderation-form"><input type="hidden" name="listingId" value={listing.id} /><button className="button button-accent" name="intent" value="approve_new_category">Approve Category &amp; Listing</button></form>
            <form action={moderateListingAction} className="moderation-form"><input type="hidden" name="listingId" value={listing.id} /><label>Use existing category<select name="categoryId" required defaultValue=""><option value="" disabled>Choose category</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="button button-secondary" name="intent" value="assign_existing">Assign &amp; Publish</button></form>
            <form action={moderateListingAction} className="moderation-form"><input type="hidden" name="listingId" value={listing.id} /><label>Review notes<textarea name="reason" minLength={5} maxLength={1000} required /></label><div className="form-actions"><button className="button button-secondary" name="intent" value="request_changes">Request Changes</button><button className="button button-danger" name="intent" value="reject">Reject</button></div></form>
            <div className="moderation-form"><p>Urgent safety takedown</p><ListingModerationDialog listingId={listing.id} listingName={listing.name} mode="remove" returnPath="/admin/reviews" /></div>
          </div>
        </article>;
      })}</div>}
      {!!revisions?.length && <section className="moderation-list revision-moderation"><h2>Pending listing revisions</h2>{revisions.map((revision) => <article className="form-card moderation-card" key={revision.id}><div className="moderation-card-heading"><div><span className="eyebrow">Approved listing edit</span><h2>{revision.name}</h2><a href={revision.url} target="_blank" rel="noopener noreferrer">Visit Website</a></div><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(revision.created_at))}</time></div><p>{revision.short_description}</p><form action={moderateRevisionAction} className="moderation-form"><input type="hidden" name="revisionId" value={revision.id} />{!revision.category_id && <label>Publish in category<select name="categoryId" required><option value="">Choose category</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}<label>Feedback if rejected<input name="reason" maxLength={1000} /></label><div className="form-actions"><button className="button button-secondary" name="intent" value="reject" formNoValidate>Reject revision</button><button className="button button-accent" name="intent" value="approve">Approve revision</button></div></form></article>)}</section>}
    </main>
  );
}

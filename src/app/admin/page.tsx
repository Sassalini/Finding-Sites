import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { moderateListingAction, moderateRevisionAction } from "@/app/admin/actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review queue", robots: { index: false, follow: false } };

const errorMessages: Record<string, string> = {
  category: "Choose an approved category before publishing this requested-category listing.",
  approve: "The listing could not be approved.",
  reason: "Add a clear rejection reason of at least five characters.",
  reject: "The listing could not be rejected.",
  revision: "The revision could not be reviewed.",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/admin");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/account");

  const [{ data: listings }, { data: categories }, { data: revisions }] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,name,url,normalized_domain,short_description,category_id,category_request_id,submitted_at").eq("status", "pending_review").order("submitted_at"),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("listing_revisions").select("id,listing_id,name,url,short_description,category_id,category_request_id,created_at").eq("status", "pending_review").order("created_at"),
  ]);
  const requestIds = (listings ?? []).flatMap((listing) => listing.category_request_id ? [listing.category_request_id] : []);
  const { data: requests } = requestIds.length
    ? await supabase.from("category_requests").select("id,requested_name,requested_description").in("id", requestIds)
    : { data: [] };
  const requestsById = new Map((requests ?? []).map((request) => [request.id, request]));
  const ownerIds = [...new Set((listings ?? []).flatMap((listing) => listing.owner_id ? [listing.owner_id] : []))];
  const { data: subscriptions } = ownerIds.length ? await supabase.from("billing_subscriptions").select("owner_id,status,current_period_end").in("owner_id", ownerIds) : { data: [] };
  const subscriptionsByOwner = new Map((subscriptions ?? []).map((subscription) => [subscription.owner_id, subscription]));
  const error = query.error ? errorMessages[query.error] : null;

  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading account-heading-row"><div><span className="eyebrow">Administrator</span><h1>Listing review queue</h1><p>Approve paid submissions before they appear in Finding Sites.</p></div><span className="queue-count">{listings?.length ?? 0} waiting</span></header>
      {error && <p className="form-alert form-alert-error" role="alert">{error}</p>}
      {!listings?.length && !revisions?.length ? (
        <section className="account-empty"><h2>Queue clear</h2><p>There are no listings waiting for review.</p></section>
      ) : (
        <div className="moderation-list">
          {(listings ?? []).map((listing) => {
            const request = listing.category_request_id ? requestsById.get(listing.category_request_id) : null;
            return (
              <article className="form-card moderation-card" key={listing.id}>
                <div className="moderation-card-heading"><div><span className="eyebrow">Pending review</span><h2>{listing.name}</h2><a href={listing.url} target="_blank" rel="noreferrer">{listing.normalized_domain}</a>{listing.owner_id && <small>Owner subscription: {subscriptionsByOwner.get(listing.owner_id)?.status ?? "none"}</small>}</div><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.submitted_at))}</time></div>
                <p>{listing.short_description}</p>
                {request && <div className="category-request-review"><strong>Requested category: {request.requested_name}</strong>{request.requested_description && <p>{request.requested_description}</p>}</div>}
                <form action={moderateListingAction} className="moderation-form">
                  <input type="hidden" name="listingId" value={listing.id} />
                  {listing.category_request_id && <input type="hidden" name="categoryRequestId" value={listing.category_request_id} />}
                  {!listing.category_id && <label>Publish in category<select name="categoryId" required><option value="">Choose category</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
                  <label>Feedback if rejected<input name="reason" maxLength={1000} placeholder="Explain what the owner should change" /></label>
                  <div className="form-actions"><button className="button button-secondary" name="intent" value="reject" formNoValidate>Reject with feedback</button><button className="button button-accent" name="intent" value="approve">Approve & publish</button></div>
                </form>
              </article>
            );
          })}
        </div>
      )}
      {!!revisions?.length && <section className="moderation-list revision-moderation"><h2>Pending listing revisions</h2>{revisions.map((revision) => <article className="form-card moderation-card" key={revision.id}><div className="moderation-card-heading"><div><span className="eyebrow">Approved listing edit</span><h2>{revision.name}</h2><a href={revision.url} target="_blank" rel="noreferrer">{revision.url}</a></div><time>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(revision.created_at))}</time></div><p>{revision.short_description}</p><form action={moderateRevisionAction} className="moderation-form"><input type="hidden" name="revisionId" value={revision.id} />{!revision.category_id && <label>Publish in category<select name="categoryId" required><option value="">Choose category</option>{(categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}<label>Feedback if rejected<input name="reason" maxLength={1000} /></label><div className="form-actions"><button className="button button-secondary" name="intent" value="reject" formNoValidate>Reject revision</button><button className="button button-accent" name="intent" value="approve">Approve revision</button></div></form></article>)}</section>}
    </main>
  );
}

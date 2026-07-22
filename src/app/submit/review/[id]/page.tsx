import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { continueSubmissionAction } from "@/app/submit/review/actions";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review submission", robots: { index: false, follow: false } };

const errorMessages: Record<string, string> = {
  configuration: "Checkout is not configured yet. Your draft is safe; please try again after billing has been connected.",
  checkout: "We could not start Checkout. Your draft is safe, so please try again.",
  submit: "We could not add this listing to the review queue. Please try again.",
};

export default async function ReviewSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/login?next=/submit/review/${id}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/submit/review/${id}`);

  const [{ data: listing }, entitlement] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,name,url,normalized_domain,short_description,full_description,contact_email,category_id,category_request_id,status").eq("id", id).maybeSingle(),
    getListingEntitlement(supabase, user.id),
  ]);
  if (!listing || listing.owner_id !== user.id) notFound();
  if (!["draft", "changes_requested", "checkout_pending"].includes(listing.status)) redirect("/account");

  const [{ data: category }, { data: categoryRequest }] = await Promise.all([
    listing.category_id ? supabase.from("categories").select("name").eq("id", listing.category_id).maybeSingle() : Promise.resolve({ data: null }),
    listing.category_request_id ? supabase.from("category_requests").select("requested_name").eq("id", listing.category_request_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const active = entitlement.hasQualifyingSubscription;
  const error = query.error ? errorMessages[query.error] : null;

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <header className="account-heading">
        <span className="eyebrow">Submission summary</span>
        <h1>Review your listing</h1>
        <p>Check the details below. Nothing appears in Finding Sites until an administrator approves it.</p>
      </header>
      {query.checkout === "cancelled" && <p className="form-alert" role="status">Checkout was cancelled. Your listing is still saved as a draft.</p>}
      {error && <p className="form-alert form-alert-error" role="alert">{error}</p>}
      <section className="form-card review-card">
        <div className="review-summary">
          <div><span>Website</span><strong>{listing.name}</strong></div>
          <div><span>URL</span><a href={listing.url} target="_blank" rel="noreferrer">{listing.normalized_domain}</a></div>
          <div><span>Category</span><strong>{category?.name ?? `${categoryRequest?.requested_name ?? "New category"} (requested)`}</strong></div>
          <div className="review-summary-wide"><span>Description</span><p>{listing.short_description}</p></div>
          {listing.full_description && <div className="review-summary-wide"><span>Additional details</span><p>{listing.full_description}</p></div>}
          <div><span>Administrative contact</span><strong>{listing.contact_email}</strong></div>
        </div>
        <div className={`subscription-check ${active ? "subscription-check-active" : ""}`}>
          <span aria-hidden="true">{active ? "✓" : "1"}</span>
          <div>
            <strong>{active ? "Active subscription found" : "Directory subscription required"}</strong>
            <p>{active ? "Stripe Checkout will be bypassed and this listing will go straight to Pending Review." : "Continue to secure Stripe Checkout. One subscription covers up to two listings on this account."}</p>
          </div>
        </div>
        <form action={continueSubmissionAction} className="form-actions">
          <input type="hidden" name="listingId" value={listing.id} />
          {listing.status !== "checkout_pending" && <Link href={`/account/sites/${listing.id}/edit`} className="button button-secondary">Edit details</Link>}
          <button className="button button-accent" type="submit">{active ? "Submit for review" : "Continue to Stripe Checkout"}</button>
        </form>
      </section>
    </main>
  );
}

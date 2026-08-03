import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteDialog } from "@/app/account/DeleteDialog";
import { continueSubmissionAction } from "@/app/submit/review/actions";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { safeServerError } from "@/lib/server-errors";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review submission", robots: { index: false, follow: false } };

const errorMessages: Record<string, string> = {
  configuration: "Checkout is not configured yet. Your draft is safe; please try again after billing has been connected.",
  checkout: "We couldn’t start payment. Your draft is safe, so please try again.",
  submit: "We couldn’t submit your website for review. Please try again.",
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

  let reviewData;
  try {
    reviewData = await Promise.all([
      supabase.from("website_listings").select("id,owner_id,name,url,normalized_domain,short_description,contact_email,category_id,category_request_id,status,rejection_reason").eq("id", id).maybeSingle(),
      getListingEntitlement(supabase, user.id, { logPrefix: "[review-submission]" }),
    ]);
  } catch (loadError) {
    console.error("[review-submission] draft load failed", safeServerError(loadError));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load your website draft.</h1><p>Please try again from your account.</p><Link href="/account" className="button button-secondary">Back to account</Link></section></main>;
  }
  const [listingResult, entitlement] = reviewData;
  if (listingResult.error) {
    console.error("[review-submission] draft query failed", safeServerError(listingResult.error));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load your website draft.</h1><p>Please try again from your account.</p><Link href="/account" className="button button-secondary">Back to account</Link></section></main>;
  }
  const listing = listingResult.data;
  if (!listing || listing.owner_id !== user.id) notFound();
  if (!["draft", "changes_requested", "checkout_pending"].includes(listing.status)) redirect("/account");

  const [categoryResult, categoryRequestResult] = await Promise.all([
    listing.category_id ? supabase.from("categories").select("name").eq("id", listing.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    listing.category_request_id ? supabase.from("category_requests").select("requested_name").eq("id", listing.category_request_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoryResult.error || categoryRequestResult.error) {
    console.error("[review-submission] category query failed", safeServerError(categoryResult.error ?? categoryRequestResult.error));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load your website draft.</h1><p>Please try again from your account.</p><Link href="/account" className="button button-secondary">Back to account</Link></section></main>;
  }
  const category = categoryResult.data;
  const categoryRequest = categoryRequestResult.data;
  const active = entitlement.hasQualifyingSubscription;
  const error = query.error ? errorMessages[query.error] : null;

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <header className="account-heading">
        <span className="eyebrow">Submission summary</span>
        <h1>Review your listing</h1>
        <p>Check the details below. Nothing appears in Finding Sites until an administrator approves it.</p>
      </header>
      {query.checkout === "cancelled" && <p className="form-alert" role="status">Payment was not completed. Your website draft has been saved.</p>}
      {error && <p className="form-alert form-alert-error" role="alert">{error}</p>}
      <section className="form-card review-card">
        <div className="review-summary">
          <div><span>Website</span><strong>{listing.name}</strong></div>
          <div><span>URL</span><a href={listing.url} target="_blank" rel="noreferrer">{listing.normalized_domain}</a></div>
          <div><span>Category</span><strong>{category?.name ?? `${categoryRequest?.requested_name ?? "New category"} (requested)`}</strong></div>
          <div className="review-summary-wide"><span>Description</span><p>{listing.short_description}</p></div>
          <div><span>Administrative contact</span><strong>{listing.contact_email}</strong></div>
        </div>
        {listing.rejection_reason && <div className="rejection-note"><strong>Required changes</strong><p>{listing.rejection_reason}</p></div>}
        <div className={`subscription-check ${active ? "subscription-check-active" : ""}`}>
          <span aria-hidden="true">{active ? "✓" : "1"}</span>
          <div>
            <strong>{active ? "Active subscription found" : "Directory subscription required"}</strong>
            <p>{active ? "Stripe Checkout will be bypassed and this listing will go straight to Pending Review." : "Continue to secure Stripe Checkout. One subscription covers up to two listings on this account."}</p>
          </div>
        </div>
        <form action={continueSubmissionAction} className="form-actions">
          <input type="hidden" name="listingId" value={listing.id} />
          <Link href={`/account/sites/${listing.id}/edit`} className="button button-secondary">Edit Draft</Link>
          <button className="button button-accent" type="submit">{active ? "Submit for Review" : listing.status === "checkout_pending" ? "Resume Payment" : "Continue to Payment"}</button>
          <DeleteDialog listingId={listing.id} listingName={listing.name} />
        </form>
      </section>
    </main>
  );
}

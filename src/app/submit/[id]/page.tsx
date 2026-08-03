import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmissionForm } from "@/app/submit/SubmissionForm";
import type { SubmissionValues } from "@/app/submit/actions";
import { safeServerError } from "@/lib/server-errors";
import { toSubmissionCategories } from "@/lib/submissions/form";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit submission", robots: { index: false, follow: false } };

export default async function EditSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/login?next=/submit/${id}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/submit/${id}`);

  const [listingResult, categoryResult] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,name,url,category_id,category_request_id,short_description,contact_email,ownership_confirmed,terms_accepted,status").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id,name,sort_order").eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);
  if (listingResult.error || categoryResult.error) {
    console.error("[edit-submission] load failed", safeServerError(listingResult.error ?? categoryResult.error));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load your website draft.</h1><p>Please try again from your account.</p><Link className="button button-secondary" href="/account">Back to account</Link></section></main>;
  }
  const listing = listingResult.data;
  if (!listing || listing.owner_id !== user.id) notFound();
  if (!["draft", "checkout_pending", "pending_review", "changes_requested", "approved", "subscription_inactive"].includes(listing.status)) redirect("/account");

  const [categoryRequestResult, pendingRevisionResult] = await Promise.all([
    listing.category_request_id
      ? supabase.from("category_requests").select("requested_name,requested_description").eq("id", listing.category_request_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    ["approved", "subscription_inactive"].includes(listing.status)
      ? supabase.from("listing_revisions").select("id").eq("listing_id", listing.id).eq("status", "pending_review").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoryRequestResult.error || pendingRevisionResult.error) {
    console.error("[edit-submission] related data load failed", safeServerError(categoryRequestResult.error ?? pendingRevisionResult.error));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load your website draft.</h1><p>Please try again from your account.</p><Link className="button button-secondary" href="/account">Back to account</Link></section></main>;
  }
  const categoryRequest = categoryRequestResult.data;
  const pendingRevision = pendingRevisionResult.data;

  if (pendingRevision) {
    return (
      <main className="account-shell account-shell-narrow" id="main-content">
        <div className="form-card confirmation-card"><span className="confirmation-mark">✓</span><h1>Revision already pending</h1><p>This approved listing already has a revision waiting for review. Its published version remains unchanged.</p><Link className="button button-accent" href="/account">Back to account</Link></div>
      </main>
    );
  }

  const initialValues: SubmissionValues = {
    name: listing.name,
    url: listing.url,
    categoryMode: listing.category_request_id ? "request" : "existing",
    categoryId: listing.category_id ?? "",
    requestedCategory: categoryRequest?.requested_name ?? "",
    requestedCategoryDescription: categoryRequest?.requested_description ?? "",
    description: listing.short_description,
    contactEmail: listing.contact_email ?? user.email ?? "",
    ownershipConfirmed: listing.ownership_confirmed,
    termsAccepted: listing.terms_accepted,
  };
  const isRevision = listing.status === "approved" || listing.status === "subscription_inactive";

  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading"><span className="eyebrow">{isRevision ? "Pending revision" : "Website submission"}</span><h1>{isRevision ? "Propose listing changes" : "Edit your submission"}</h1><p>{isRevision ? "Your approved listing stays live and unchanged while this revision is reviewed." : "Update the details, then save a draft or resubmit it for review."}</p></header>
      <div className="form-card"><SubmissionForm categories={toSubmissionCategories(categoryResult.data)} initialValues={initialValues} listingId={listing.id} isRevision={isRevision} /></div>
    </main>
  );
}

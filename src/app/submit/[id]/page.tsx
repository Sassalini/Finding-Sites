import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmissionForm } from "@/app/submit/SubmissionForm";
import type { SubmissionValues } from "@/app/submit/actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit submission", robots: { index: false, follow: false } };

export default async function EditSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/login?next=/submit/${id}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/submit/${id}`);

  const [{ data: listing }, { data: categories }] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,name,url,category_id,category_request_id,short_description,full_description,contact_email,ownership_confirmed,terms_accepted,status").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order").order("name"),
  ]);
  if (!listing || listing.owner_id !== user.id) notFound();
  if (!["draft", "pending_review", "changes_requested", "approved"].includes(listing.status)) redirect("/account");

  const [{ data: categoryRequest }, { data: pendingRevision }] = await Promise.all([
    listing.category_request_id
      ? supabase.from("category_requests").select("requested_name,requested_description").eq("id", listing.category_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listing.status === "approved"
      ? supabase.from("listing_revisions").select("id").eq("listing_id", listing.id).eq("status", "pending_review").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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
    fullDescription: listing.full_description ?? "",
    contactEmail: listing.contact_email ?? user.email ?? "",
    ownershipConfirmed: listing.ownership_confirmed,
    termsAccepted: listing.terms_accepted,
  };
  const isRevision = listing.status === "approved";

  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading"><span className="eyebrow">{isRevision ? "Pending revision" : "Website submission"}</span><h1>{isRevision ? "Propose listing changes" : "Edit your submission"}</h1><p>{isRevision ? "Your approved listing stays live and unchanged while this revision is reviewed." : "Update the details, then save a draft or resubmit it for review."}</p></header>
      <div className="form-card"><SubmissionForm categories={categories ?? []} initialValues={initialValues} listingId={listing.id} isRevision={isRevision} /></div>
    </main>
  );
}

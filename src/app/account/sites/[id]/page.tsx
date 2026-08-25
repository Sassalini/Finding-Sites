import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { safeServerError } from "@/lib/server-errors";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listing preview", robots: { index: false, follow: false } };

export default async function AccountSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/login?next=/account/sites/${id}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/account/sites/${id}`);

  const listingResult = await supabase.from("website_listings").select("id,owner_id,name,url,normalized_domain,short_description,contact_email,status,moderation_status,removal_reason,removed_at,submitted_at,approved_at,category_id,category_request_id").eq("id", id).maybeSingle();
  if (listingResult.error) {
    console.error("[account-listing] listing query failed", safeServerError(listingResult.error));
    return <main className="account-shell account-shell-narrow" id="main-content"><section className="form-card confirmation-card" role="alert"><h1>We couldn’t load this website submission.</h1><p>Please try again from your account.</p><Link href="/account" className="button button-secondary">Back to account</Link></section></main>;
  }
  const listing = listingResult.data;
  if (!listing || listing.owner_id !== user.id) notFound();

  const [categoryResult, requestResult] = await Promise.all([
    listing.category_id ? supabase.from("categories").select("name").eq("id", listing.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    listing.category_request_id ? supabase.from("category_requests").select("requested_name").eq("id", listing.category_request_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoryResult.error || requestResult.error) console.error("[account-listing] category query failed", safeServerError(categoryResult.error ?? requestResult.error));
  const categoryName = categoryResult.data?.name ?? `${requestResult.data?.requested_name ?? "New category"} (requested)`;
  const editable = listing.moderation_status !== "removed" && ["draft", "checkout_pending", "pending_review", "changes_requested", "approved", "subscription_inactive"].includes(listing.status);

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <header className="account-heading"><span className="eyebrow">Private owner preview · {listing.status.replaceAll("_", " ")}</span><h1>{listing.name}</h1><p>{listing.normalized_domain}</p></header>
      <article className="form-card listing-preview">
        {listing.moderation_status === "removed" && <div className="rejection-note"><strong>Removed by Finding Sites</strong><p>This listing is not publicly visible because it was removed by moderation. Reason: {listing.removal_reason?.replaceAll("_", " ") ?? "terms violation"}.</p></div>}
        <p className="listing-preview-category">{categoryName}</p>
        <p className="listing-preview-lead">{listing.short_description}</p>
        <dl>
          <div><dt>Administrative contact</dt><dd>{listing.contact_email}</dd></div>
          <div><dt>Submitted</dt><dd>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.submitted_at))}</dd></div>
          {listing.approved_at && <div><dt>Approved</dt><dd>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.approved_at))}</dd></div>}
        </dl>
        <div className="form-actions"><Link href="/account" className="button button-secondary">Back to account</Link>{editable && <Link href={`/account/sites/${listing.id}/edit`} className="button button-accent">{["approved", "subscription_inactive"].includes(listing.status) ? "Propose edits" : "Edit listing"}</Link>}<a href={listing.url} target="_blank" rel="noreferrer" className="button button-secondary">Visit website</a></div>
      </article>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRevisionStatus, ListingStatus } from "@/types/database";

export const metadata: Metadata = { title: "Your Account", robots: { index: false, follow: false } };

const statusLabels: Record<ListingStatus | ListingRevisionStatus, string> = {
  draft: "Draft", pending_review: "Pending review", approved: "Approved", rejected: "Rejected", suspended: "Suspended", expired: "Expired",
};

function StatusBadge({ status }: { status: ListingStatus | ListingRevisionStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>;
}

export default async function AccountPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: listings }, { data: revisions }] = await Promise.all([
    supabase.from("website_listings").select("id,name,url,normalized_domain,status,rejection_reason,updated_at").eq("owner_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("listing_revisions").select("id,listing_id,name,status,rejection_reason,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);
  const revisionsByListing = new Map<string, NonNullable<typeof revisions>>();
  for (const revision of revisions ?? []) {
    const group = revisionsByListing.get(revision.listing_id) ?? [];
    group.push(revision);
    revisionsByListing.set(revision.listing_id, group);
  }

  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading account-heading-row"><div><span className="eyebrow">Your account</span><h1>Website submissions</h1><p>{user.email}</p></div><div className="account-actions"><Link className="button button-accent" href="/submit">Submit a website</Link><form action={logoutAction}><button className="button button-secondary">Log out</button></form></div></header>
      {!listings?.length ? (
        <section className="account-empty"><h2>No submissions yet</h2><p>Add a website, save it as a draft, or send it straight for review.</p><Link className="button button-accent" href="/submit">Start a submission</Link></section>
      ) : (
        <div className="submission-list">
          {listings.map((listing) => {
            const editable = listing.status === "draft" || listing.status === "rejected" || listing.status === "approved";
            return (
              <article className="submission-item" key={listing.id}>
                <div className="submission-item-main"><div className="submission-title-line"><h2>{listing.name}</h2><StatusBadge status={listing.status} /></div><a href={listing.url} target="_blank" rel="noreferrer">{listing.normalized_domain}</a><p>Updated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.updated_at))}</p>{listing.rejection_reason && <div className="rejection-note"><strong>Review feedback</strong><p>{listing.rejection_reason}</p></div>}</div>
                <div className="submission-item-action">{editable ? <Link href={`/submit/${listing.id}`} className="button button-secondary">{listing.status === "approved" ? "Propose changes" : "Edit submission"}</Link> : <span>Editing is unavailable while this submission is under review.</span>}</div>
                {(revisionsByListing.get(listing.id) ?? []).map((revision) => <div className="revision-row" key={revision.id}><div><strong>Revision: {revision.name}</strong><small>Submitted {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(revision.created_at))}</small>{revision.rejection_reason && <p>{revision.rejection_reason}</p>}</div><StatusBadge status={revision.status} /></div>)}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

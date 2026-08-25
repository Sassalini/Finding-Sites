import type { Metadata } from "next";
import Link from "next/link";
import { ListingModerationDialog } from "@/app/admin/ListingModerationDialog";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Admin listings", robots: { index: false, follow: false } };

const removalLabels: Record<string, string> = {
  nsfw: "NSFW / adult content", malware: "Malware / unsafe website", scam: "Scam / fraud", spam: "Spam",
  illegal: "Illegal / prohibited content", misleading: "Misleading listing", terms: "Terms violation", other: "Other",
};

const errors: Record<string, string> = {
  moderation: "The moderation action could not be completed. The listing may have changed.",
  reason: "Choose a valid reason. Other reasons require an explanatory note.",
};

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin("/admin/listings");
  const [{ data: listings, error }, { data: categories }, { data: events }] = await Promise.all([
    supabase.from("website_listings").select("id,owner_id,category_id,name,url,normalized_domain,short_description,status,moderation_status,removed_at,removed_by,removal_reason,deleted_at,published_at,updated_at").neq("status", "deleted").order("updated_at", { ascending: false }),
    supabase.from("categories").select("id,name,is_active").order("name"),
    supabase.from("listing_moderation_events").select("id,listing_id,admin_user_id,action,reason,notes,publication_result,created_at").order("created_at", { ascending: false }),
  ]);
  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category]));
  const eventsByListing = new Map<string, NonNullable<typeof events>>();
  for (const event of events ?? []) eventsByListing.set(event.listing_id, [...(eventsByListing.get(event.listing_id) ?? []), event]);

  return <main className="account-shell" id="main-content">
    <nav className="account-nav" aria-label="Administrator navigation"><Link href="/admin">Overview</Link><Link href="/admin/listings">Listings</Link><Link href="/admin/reviews">Review Queue</Link><Link href="/admin/categories">Categories</Link><Link href="/">Back to Finding Sites</Link><Link href="/account">Account</Link></nav>
    <header className="account-heading account-heading-row"><div><span className="eyebrow">Administrator</span><h1>Listing moderation</h1><p>Remove unsafe or rule-breaking websites without deleting ownership, billing, or audit records.</p></div><span className="queue-count">{listings?.length ?? 0} records</span></header>
    {query.error && <p className="form-alert form-alert-error" role="alert">{errors[query.error] ?? errors.moderation}</p>}
    {query.success === "removed" && <p className="form-alert" role="status">The listing was removed from the public directory.</p>}
    {query.success === "restored" && <p className="form-alert" role="status">The listing was restored and is publicly eligible.</p>}
    {query.success === "restored-private" && <p className="form-alert" role="status">The takedown was cleared, but the listing remains private because a normal publication requirement is not met.</p>}
    {error && <p className="form-alert form-alert-error" role="alert">Listings could not be loaded.</p>}
    {!listings?.length ? <section className="account-empty"><h2>No listings</h2><p>There are no listing records to moderate.</p></section> : <div className="moderation-list">{listings.map((listing) => {
      const category = listing.category_id ? categoriesById.get(listing.category_id) : null;
      const history = eventsByListing.get(listing.id) ?? [];
      const removed = listing.moderation_status === "removed";
      return <article className="form-card moderation-card" id={`listing-${listing.id}`} key={listing.id}>
        <div className="moderation-card-heading"><div><span className="eyebrow">{removed ? "Removed listing" : listing.status === "approved" ? "Live listing" : "Private listing"}</span><h2>{listing.name}</h2><a href={listing.url} target="_blank" rel="noopener noreferrer">View website — {listing.normalized_domain}</a></div><span className={`status-badge ${removed ? "status-suspended" : `status-${listing.status}`}`}>{removed ? "Removed" : listing.status.replaceAll("_", " ")}</span></div>
        <p>{listing.short_description}</p>
        <details><summary>View listing details</summary><dl className="admin-review-details"><div><dt>Owner reference</dt><dd>{listing.owner_id ?? "No owner"}</dd></div><div><dt>Category</dt><dd>{category?.name ?? "No category"}{category && !category.is_active ? " (inactive)" : ""}</dd></div><div><dt>Publication</dt><dd>{listing.published_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(listing.published_at)) : "Never published"}</dd></div><div><dt>Database status</dt><dd>{listing.status}</dd></div>{removed && <><div><dt>Removal reason</dt><dd>{removalLabels[listing.removal_reason ?? ""] ?? "Unknown"}</dd></div><div><dt>Removed at</dt><dd>{listing.removed_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(listing.removed_at)) : "Unknown"}</dd></div><div><dt>Removed by</dt><dd>{listing.removed_by}</dd></div></>}</dl></details>
        <div className="form-actions"><a href={listing.url} target="_blank" rel="noopener noreferrer" className="button button-secondary">View Website</a>{removed ? <ListingModerationDialog listingId={listing.id} listingName={listing.name} mode="restore" /> : <ListingModerationDialog listingId={listing.id} listingName={listing.name} mode="remove" />}</div>
        {!!history.length && <details className="moderation-history"><summary>Moderation history ({history.length})</summary>{history.map((event) => <div className="revision-row" key={event.id}><div><strong>{event.action === "removed" ? "Removed" : "Restored"}</strong><small>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))} · Admin {event.admin_user_id}</small>{event.reason && <p>{removalLabels[event.reason]}</p>}{event.notes && <p>Private note: {event.notes}</p>}</div><span className="status-badge">{event.publication_result}</span></div>)}</details>}
      </article>;
    })}</div>}
  </main>;
}

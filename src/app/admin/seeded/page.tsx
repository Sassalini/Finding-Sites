import type { Metadata } from "next";
import Link from "next/link";
import { deleteSeededListingAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Seeded listings", robots: { index: false, follow: false } };

export default async function SeededListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const query = await searchParams;
  const { supabase } = await requireAdmin("/admin/seeded");
  const [{ data: listings, error }, { data: categories, error: categoryError }] = await Promise.all([
    supabase.from("website_listings").select("id,name,url,category_id,source,source_crawl,imported_at,is_claimed,owner_id,moderation_status").eq("is_seeded", true).is("deleted_at", null).order("imported_at", { ascending: false }),
    supabase.from("categories").select("id,name"),
  ]);
  const names = new Map((categories ?? []).map((category) => [category.id, category.name]));
  return <main className="account-shell" id="main-content">
    <nav className="account-nav" aria-label="Administrator navigation"><Link href="/admin">Overview</Link><Link href="/admin/listings">Listings</Link><Link href="/admin/seeded">Seeded Listings</Link><Link href="/admin/reviews">Review Queue</Link><Link href="/admin/categories">Categories</Link></nav>
    <header className="account-heading"><span className="eyebrow">Administrator</span><h1>Seeded listings</h1><p>Reviewed directory entries discovered through Common Crawl.</p></header>
    {(error || categoryError || query.error) && <p className="form-alert form-alert-error" role="alert">{query.error === "confirmation" ? "Confirm deletion before continuing." : "The request could not be completed. Please try again."}</p>}
    {query.success === "deleted" && <p className="form-alert" role="status">The seeded listing was deleted from the directory. Its import history is retained.</p>}
    {!error && !listings?.length && <section className="account-empty"><h2>No seeded listings</h2><p>Import a small reviewed batch using the local seeding utility.</p></section>}
    <div className="moderation-list">{(listings ?? []).map((listing) => <article key={listing.id} className="form-card moderation-card">
      <h2>{listing.name}</h2><a href={listing.url} target="_blank" rel="noopener noreferrer">{listing.url}</a>
      <dl className="admin-review-details"><div><dt>Category</dt><dd>{names.get(listing.category_id ?? "") ?? "Unavailable"}</dd></div><div><dt>Source</dt><dd>{listing.source}</dd></div><div><dt>Crawl</dt><dd>{listing.source_crawl}</dd></div><div><dt>Imported</dt><dd>{listing.imported_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(listing.imported_at)) : "Unknown"}</dd></div><div><dt>Claim status</dt><dd>{listing.is_claimed ? "Claimed" : "Unclaimed"}</dd></div></dl>
      <div className="form-actions"><Link className="button button-secondary" href={`/admin/listings#listing-${listing.id}`}>Moderation and history</Link></div>
      {!listing.is_claimed && !listing.owner_id && listing.moderation_status === "active" && <form action={deleteSeededListingAction}>
        <input type="hidden" name="listingId" value={listing.id} />
        <label><input type="checkbox" name="confirmed" value="yes" required /> Delete this unclaimed listing from the public directory</label>
        <div className="form-actions"><button className="button button-secondary" type="submit">Delete seeded listing</button></div>
      </form>}
    </article>)}</div>
  </main>;
}

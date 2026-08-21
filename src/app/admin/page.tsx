import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Admin dashboard", robots: { index: false, follow: false } };

export default async function AdminDashboardPage() {
  const { supabase } = await requireAdmin("/admin");
  const [reviews, approved, categories, changes, revisions] = await Promise.all([
    supabase.from("website_listings").select("id", { count: "exact", head: true }).eq("status", "pending_review").not("category_request_id", "is", null),
    supabase.from("website_listings").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("categories").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("website_listings").select("id", { count: "exact", head: true }).in("status", ["changes_requested", "permanently_rejected"]),
    supabase.from("listing_revisions").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
  ]);
  const queryFailed = [reviews, approved, categories, changes, revisions].some((result) => result.error);

  return (
    <main className="account-shell" id="main-content">
      <nav className="account-nav" aria-label="Administrator navigation"><Link href="/admin">Overview</Link><Link href="/admin/reviews">Review Queue</Link><Link href="/admin/categories">Categories</Link><Link href="/">Back to Finding Sites</Link><Link href="/account">Account</Link></nav>
      <header className="account-heading"><span className="eyebrow">Administrator</span><h1>Finding Sites admin</h1><p>Category moderation and directory health at a glance.</p></header>
      {queryFailed && <p className="form-alert form-alert-error" role="alert">Some dashboard totals could not be loaded.</p>}
      <section className="admin-stat-grid" aria-label="Directory totals">
        <Link href="/admin/reviews" className="form-card admin-stat"><span>Pending category reviews</span><strong>{reviews.count ?? 0}</strong><small>{revisions.count ?? 0} listing revisions also waiting</small></Link>
        <div className="form-card admin-stat"><span>Approved listings</span><strong>{approved.count ?? 0}</strong><small>Currently published records</small></div>
        <Link href="/admin/categories" className="form-card admin-stat"><span>Active categories</span><strong>{categories.count ?? 0}</strong><small>Available for automatic publication</small></Link>
        <div className="form-card admin-stat"><span>Changes or rejection</span><strong>{changes.count ?? 0}</strong><small>Owner-visible moderation outcomes</small></div>
      </section>
      <section className="form-card admin-callout"><div><span className="eyebrow">Human review</span><h2>Only category decisions enter the listing queue</h2><p>Listings using an active existing category publish automatically after entitlement checks. New-category requests remain private until reviewed.</p></div><Link className="button button-accent" href="/admin/reviews">Open Review Queue</Link></section>
    </main>
  );
}

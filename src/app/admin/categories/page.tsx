import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Admin categories", robots: { index: false, follow: false } };

export default async function AdminCategoriesPage() {
  const { supabase } = await requireAdmin("/admin/categories");
  const { data: categories } = await supabase.from("categories").select("id,name,slug,is_active,sort_order").order("sort_order").order("name");
  return <main className="account-shell" id="main-content"><nav className="account-nav" aria-label="Administrator navigation"><Link href="/admin">Overview</Link><Link href="/admin/listings">Listings</Link><Link href="/admin/reviews">Review Queue</Link><Link href="/admin/categories">Categories</Link><Link href="/">Back to Finding Sites</Link><Link href="/account">Account</Link></nav><header className="account-heading"><span className="eyebrow">Administrator</span><h1>Categories</h1><p>Active categories are eligible for automatic listing publication.</p></header><div className="moderation-list">{(categories ?? []).map((category) => <article className="form-card moderation-card" key={category.id}><div className="moderation-card-heading"><div><h2>{category.name}</h2><small>/{category.slug}</small></div><span className={`status-badge ${category.is_active ? "status-approved" : "status-suspended"}`}>{category.is_active ? "Active" : "Inactive"}</span></div></article>)}</div></main>;
}

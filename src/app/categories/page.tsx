import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { categories } from "@/data/categories";

export const metadata: Metadata = { title: "Browse Categories", description: "Browse Finding Sites by topic and industry.", alternates: { canonical: "/categories" } };

export default function CategoriesPage() {
  return (
    <main className="categories-page" id="main-content">
      <header>
        <span className="eyebrow">Browse the directory</span>
        <h1>Find a useful corner of the web</h1>
        <p>Choose a category to see every approved website, without pay-to-win rankings.</p>
      </header>
      <div className="category-grid">
        {categories.map((category) => (
          <Link href={`/category/${category.slug}`} key={category.slug}>
            <span><Icon name={category.iconKey} /></span>
            <div><h2>{category.name}</h2><p>{category.description}</p><small>{category.approvedCount} approved listings</small></div>
          </Link>
        ))}
      </div>
    </main>
  );
}

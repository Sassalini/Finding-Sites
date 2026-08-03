import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { getDirectoryCategories } from "@/lib/directory/repository";

export const metadata: Metadata = { title: "Browse Categories", description: "Browse Finding Sites by topic and industry.", alternates: { canonical: "/categories" } };

export default async function CategoriesPage() {
  const categories = await getDirectoryCategories();
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
            <span><Icon name="folder" /></span>
            <div><h2>{category.name}</h2><p>Browse approved websites in {category.name}.</p><small>{category.approvedCount} approved listings</small></div>
          </Link>
        ))}
      </div>
    </main>
  );
}

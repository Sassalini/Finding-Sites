import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { directoryHref } from "@/lib/directory/urls";
import type { DirectoryCategory, DirectoryFilters, SortMode } from "@/types/directory";

const sortOptions: Array<{ value: SortMode; label: string; icon: string }> = [
  { value: "az", label: "A–Z", icon: "sort" },
  { value: "newest", label: "Newest Listings", icon: "clock" },
  { value: "most-visited", label: "Most Visited", icon: "eye" },
  { value: "recently-updated", label: "Recently Updated", icon: "clock" },
  { value: "trending", label: "Trending This Week", icon: "trend" },
  { value: "random", label: "Random Order", icon: "shuffle" },
];

export function CategorySidebar({ categories, activeCategorySlug, pathname, filters, mobile = false }: { categories: DirectoryCategory[]; activeCategorySlug?: string; pathname: string; filters: DirectoryFilters; mobile?: boolean }) {
  return (
    <div className={mobile ? "sidebar-stack sidebar-stack-mobile" : "sidebar-stack"}>
      <section className="sidebar-card category-card" aria-labelledby={mobile ? "mobile-category-heading" : "category-heading"}>
        <h2 id={mobile ? "mobile-category-heading" : "category-heading"}>Browse categories</h2>
        <ul className="category-list">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/category/${category.slug}`} className={activeCategorySlug === category.slug ? "active" : undefined} aria-current={activeCategorySlug === category.slug ? "page" : undefined}>
                <Icon name={category.iconKey ?? "folder"} />
                <span>{category.name}</span>
                <small>{category.approvedCount}</small>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/" className="show-all-link">View all websites →</Link>
      </section>

      <section className="sidebar-card instruction-card">
        <h2>How to use Finding Sites</h2>
        <ol>
          <li><span><Icon name="folder" /></span><div><strong>Choose a category</strong><p>Or search to find what you need.</p></div></li>
          <li><span><strong>A↓Z</strong></span><div><strong>Jump to a letter</strong><p>Use the alphabet to move straight to a section.</p></div></li>
          <li><span><Icon name="eye" /></span><div><strong>Browse and discover</strong><p>Explore every approved listing without hidden rankings.</p></div></li>
        </ol>
      </section>

      <section className="sidebar-card sort-card" aria-labelledby={mobile ? "mobile-sort-heading" : "sort-heading"}>
        <h2 id={mobile ? "mobile-sort-heading" : "sort-heading"}>Sort this directory</h2>
        <ul>
          {sortOptions.map((option) => (
            <li key={option.value}>
              <Link href={directoryHref(pathname, filters, { sort: option.value })} className={filters.sort === option.value ? "active" : undefined} aria-current={filters.sort === option.value ? "true" : undefined}>
                <Icon name={option.icon} />
                <span>{option.label}</span>
                {option.value === "az" && <small>Default</small>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="submit-listing-card">
        <span className="eyebrow">For website owners</span>
        <h2>Get found online</h2>
        <p>Reach people looking beyond the biggest names.</p>
        <Link href="/submit" className="button button-accent">List Your Website</Link>
        <small>No payment required in this phase</small>
      </section>
    </div>
  );
}

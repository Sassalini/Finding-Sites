import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { directoryHref } from "@/lib/directory/urls";
import type { DirectoryFilters } from "@/types/directory";

export function DirectoryToolbar({ filters, pathname, categoryName }: { filters: DirectoryFilters; pathname: string; categoryName?: string }) {
  return (
    <div className="directory-toolbar">
      <form action={pathname} method="get" role="search" className="category-search">
        <label className="sr-only" htmlFor="directory-query">{categoryName ? `Search within ${categoryName}` : "Search all websites"}</label>
        <Icon name="search" />
        <input id="directory-query" name="q" defaultValue={filters.query} placeholder={categoryName ? `Search within ${categoryName}…` : "Search all websites…"} />
        {filters.sort !== "az" && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.view !== "standard" && <input type="hidden" name="view" value={filters.view} />}
        <button type="submit">Search</button>
      </form>
      <div className="view-toggle" aria-label="Directory view">
        <span>View:</span>
        <Link href={directoryHref(pathname, filters, { view: "standard" })} className={filters.view === "standard" ? "active" : undefined} aria-current={filters.view === "standard" ? "true" : undefined}>Standard</Link>
        <Link href={directoryHref(pathname, filters, { view: "compact" })} className={filters.view === "compact" ? "active" : undefined} aria-current={filters.view === "compact" ? "true" : undefined}>Compact</Link>
      </div>
    </div>
  );
}

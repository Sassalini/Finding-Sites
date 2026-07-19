import { DesktopSideAdSlot } from "@/components/ads/AdSlot";
import { AlphabetNavigation } from "@/components/directory/AlphabetNavigation";
import { CategorySidebar } from "@/components/directory/CategorySidebar";
import { DirectoryContent } from "@/components/directory/DirectoryContent";
import { DirectoryStats } from "@/components/directory/DirectoryStats";
import { DirectoryToolbar } from "@/components/directory/DirectoryToolbar";
import { Icon } from "@/components/ui/Icon";
import { getDirectoryResult } from "@/lib/directory/repository";
import type { Category, DirectoryFilters } from "@/types/directory";
import Link from "next/link";

export async function DirectoryPage({ filters, pathname, category, heading, intro }: { filters: DirectoryFilters; pathname: string; category?: Category; heading?: string; intro?: string }) {
  const result = await getDirectoryResult(filters);
  const pageHeading = heading ?? category?.name ?? "All Websites";
  const pageIntro = intro ?? category?.description ?? "Explore useful independent websites, clearly organised and open to everyone.";

  return (
    <>
      <div className="page-width stats-wrap"><DirectoryStats /></div>
      <div className="directory-frame">
        <DesktopSideAdSlot />
        <aside className="directory-sidebar" aria-label="Directory controls">
          <CategorySidebar activeCategorySlug={category?.slug} pathname={pathname} filters={filters} />
        </aside>

        <main className="directory-main" id="main-content">
          {category && <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Directory</Link><span aria-hidden="true">/</span><span>{category.name}</span></nav>}
          <div className="directory-heading">
            <div>
              <span className="eyebrow">Human-curated directory</span>
              <h1>{pageHeading} <small>{result.total} approved {result.total === 1 ? "website" : "websites"}</small></h1>
              <p>{pageIntro}</p>
            </div>
          </div>

          <details className="mobile-directory-controls">
            <summary><span><Icon name="sort" />Categories & sorting</span><small>Open controls</small></summary>
            <CategorySidebar activeCategorySlug={category?.slug} pathname={pathname} filters={filters} mobile />
          </details>

          <DirectoryToolbar filters={filters} pathname={pathname} categoryName={category?.name} />
          <div className="mobile-alphabet"><AlphabetNavigation availableLetters={result.availableLetters} /></div>
          <DirectoryContent result={result} view={filters.view} hasQuery={Boolean(filters.query)} />
        </main>

        <aside className="alphabet-rail" aria-label="Alphabet navigation">
          <AlphabetNavigation availableLetters={result.availableLetters} />
          <div className="alphabet-tip"><span aria-hidden="true">☝</span><strong>Jump to any letter</strong><p>Choose a letter to move there instantly.</p></div>
        </aside>
        <DesktopSideAdSlot />
      </div>
    </>
  );
}

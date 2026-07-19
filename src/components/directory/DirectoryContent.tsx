import { DirectoryListingRow } from "@/components/directory/DirectoryListingRow";
import { EmptyDirectoryState } from "@/components/directory/EmptyDirectoryState";
import { MobileInlineAdSlot } from "@/components/ads/AdSlot";
import { Icon } from "@/components/ui/Icon";
import { letterAnchor } from "@/lib/directory/urls";
import type { DirectoryResult, ViewMode } from "@/types/directory";

export function DirectoryContent({ result, view, hasQuery }: { result: DirectoryResult; view: ViewMode; hasQuery: boolean }) {
  if (!result.total) return <EmptyDirectoryState hasQuery={hasQuery} />;

  return (
    <div className="directory-results">
      <div className="directory-notice">
        <span aria-hidden="true">✦</span>
        <p><strong>Every approved website is open to discovery.</strong> Browse continuously, or jump straight to a letter.</p>
      </div>
      {result.groups.map((group, index) => (
        <section id={letterAnchor(group.letter)} data-letter={group.letter} className="alphabet-section" key={group.letter} aria-labelledby={`heading-${letterAnchor(group.letter)}`}>
          <header>
            <h2 id={`heading-${letterAnchor(group.letter)}`}>{group.letter}</h2>
            <span>{group.listings.length} {group.listings.length === 1 ? "listing" : "listings"}</span>
          </header>
          <div>
            {group.listings.map((listing) => <DirectoryListingRow key={listing.id} listing={listing} view={view} />)}
          </div>
          {index === 1 && <MobileInlineAdSlot />}
        </section>
      ))}
      <div className="keep-browsing"><Icon name="arrow-down" /><span>You’ve reached the end of these {result.total} results</span></div>
    </div>
  );
}

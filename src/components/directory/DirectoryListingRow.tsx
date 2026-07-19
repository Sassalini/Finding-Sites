import { Icon } from "@/components/ui/Icon";
import type { DirectoryListing, ViewMode } from "@/types/directory";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

export function DirectoryListingRow({ listing, view }: { listing: DirectoryListing; view: ViewMode }) {
  const formattedDate = dateFormatter.format(new Date(`${listing.publishedAt}T12:00:00Z`));
  return (
    <article className={`listing-row ${view === "compact" ? "listing-row-compact" : ""}`}>
      <div className="listing-identity">
        <div className="listing-name-line">
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="listing-name">
            {listing.name}<Icon name="external" />
          </a>
          {listing.isVerified && <span className="verified-badge" title="Listing details checked"><Icon name="check" /> Verified</span>}
          {listing.isFeatured && <span className="featured-badge">Featured</span>}
        </div>
        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="listing-domain">{listing.normalizedDomain}</a>
      </div>
      <p className="listing-description">{listing.shortDescription}</p>
      <p className="listing-category">{listing.categoryName}</p>
      <time dateTime={listing.publishedAt}>{formattedDate}</time>
    </article>
  );
}

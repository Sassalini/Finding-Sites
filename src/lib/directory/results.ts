import type { DirectoryFilters, DirectoryListing, DirectoryResult } from "@/types/directory";

function dateValue(value: string) {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).getTime();
}

function stableScore(value: string) {
  return [...value].reduce((score, character) => (score * 31 + character.charCodeAt(0)) % 997, 7);
}

function sortListings(listings: DirectoryListing[], sort: DirectoryFilters["sort"]) {
  return [...listings].sort((left, right) => {
    switch (sort) {
      case "newest":
        return dateValue(right.publishedAt) - dateValue(left.publishedAt);
      case "most-visited":
        return right.outboundClicks - left.outboundClicks;
      case "recently-updated":
        return dateValue(right.updatedAt) - dateValue(left.updatedAt);
      case "trending":
        return right.trendingScore - left.trendingScore;
      case "random":
        return stableScore(left.slug) - stableScore(right.slug);
      default:
        return left.name.localeCompare(right.name, "en-GB", { sensitivity: "base" });
    }
  });
}

export function buildDirectoryResult(source: DirectoryListing[], filters: DirectoryFilters): DirectoryResult {
  const query = filters.query.trim().toLocaleLowerCase("en-GB");
  const filtered = source.filter((listing) => {
    const matchesCategory = !filters.categorySlug || listing.categorySlug === filters.categorySlug;
    const haystack = `${listing.name} ${listing.normalizedDomain} ${listing.shortDescription}`.toLocaleLowerCase("en-GB");
    return matchesCategory && (!query || haystack.includes(query));
  });

  const listings = sortListings(filtered, filters.sort);
  const grouped = new Map<string, DirectoryListing[]>();

  for (const listing of listings) {
    const firstCharacter = listing.name.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstCharacter) ? firstCharacter : "#";
    const group = grouped.get(letter) ?? [];
    group.push(listing);
    grouped.set(letter, group);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([letter, groupedListings]) => ({ letter, listings: groupedListings }));

  return {
    listings,
    groups,
    total: listings.length,
    availableLetters: groups.map((group) => group.letter),
  };
}

import { developmentListings } from "@/data/listings";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DirectoryFilters, DirectoryListing, DirectoryResult } from "@/types/directory";

export interface DirectoryRepository {
  search(filters: DirectoryFilters): Promise<DirectoryResult>;
}

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

function buildDirectoryResult(source: DirectoryListing[], filters: DirectoryFilters): DirectoryResult {
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

async function searchDevelopmentListings(filters: DirectoryFilters): Promise<DirectoryResult> {
  return buildDirectoryResult(developmentListings, filters);
}

async function searchPublishedListings(filters: DirectoryFilters): Promise<DirectoryResult | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: listings, error: listingsError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("website_listings").select("id,category_id,name,slug,url,normalized_domain,short_description,is_verified,is_featured,published_at,updated_at").eq("status", "approved"),
    supabase.from("categories").select("id,name,slug").eq("is_active", true),
  ]);
  if (listingsError || categoriesError) return null;

  const categoriesById = new Map((categories ?? []).map((category) => [category.id, category]));
  const published: DirectoryListing[] = (listings ?? []).flatMap((listing) => {
    const category = listing.category_id ? categoriesById.get(listing.category_id) : null;
    if (!category || !listing.published_at) return [];
    return [{
      id: listing.id,
      name: listing.name,
      slug: listing.slug,
      url: listing.url,
      normalizedDomain: listing.normalized_domain,
      shortDescription: listing.short_description,
      categorySlug: category.slug,
      categoryName: category.name,
      isVerified: listing.is_verified,
      isFeatured: listing.is_featured,
      publishedAt: listing.published_at,
      updatedAt: listing.updated_at,
      outboundClicks: 0,
      trendingScore: 0,
    }];
  });

  return buildDirectoryResult(published, filters);
}

export const developmentDirectoryRepository: DirectoryRepository = {
  search: searchDevelopmentListings,
};

// Use approved Supabase records in configured environments and retain the
// fixture as a local interface-development fallback.
export function getDirectoryResult(filters: DirectoryFilters) {
  return searchPublishedListings(filters).then((result) => result ?? developmentDirectoryRepository.search(filters));
}

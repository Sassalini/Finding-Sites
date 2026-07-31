import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDirectoryResult } from "@/lib/directory/results";
import type { Database } from "@/types/database";
import type { DirectoryFilters, DirectoryListing, DirectoryResult } from "@/types/directory";

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  stack?: string;
};

export function logDirectoryQueryError(operation: string, categorySlug: string | undefined, error: SupabaseError) {
  console.error("[directory-query]", {
    operation,
    categorySlug: categorySlug ?? null,
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    stack: error.stack ?? null,
  });
}

export async function searchPublishedListings(
  supabase: SupabaseClient<Database>,
  filters: DirectoryFilters,
): Promise<DirectoryResult> {
  const [listingsResult, categoriesResult] = await Promise.all([
    supabase.from("website_listings").select("id,category_id,name,slug,url,normalized_domain,short_description,is_verified,is_featured,published_at,updated_at").eq("status", "approved"),
    supabase.from("categories").select("id,name,slug").eq("is_active", true),
  ]);

  if (listingsResult.error) {
    logDirectoryQueryError("approved-listings.select", filters.categorySlug, listingsResult.error);
  }
  if (categoriesResult.error) {
    logDirectoryQueryError("active-categories.select", filters.categorySlug, categoriesResult.error);
  }
  if (listingsResult.error || categoriesResult.error) {
    throw listingsResult.error ?? categoriesResult.error;
  }

  const categoriesById = new Map((categoriesResult.data ?? []).map((category) => [category.id, category]));
  const published: DirectoryListing[] = (listingsResult.data ?? []).flatMap((listing) => {
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

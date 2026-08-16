import { developmentListings } from "@/data/listings";
import { loadPublishedDirectory } from "@/lib/directory/published";
import { buildDirectoryResult } from "@/lib/directory/results";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Category, DirectoryCategory, DirectoryFilters, DirectoryResult } from "@/types/directory";

export interface DirectoryRepository {
  search(filters: DirectoryFilters): Promise<DirectoryResult>;
}

async function searchDevelopmentListings(filters: DirectoryFilters): Promise<DirectoryResult> {
  return buildDirectoryResult(developmentListings, filters);
}

function developmentCategories(): DirectoryCategory[] {
  const categories = new Map<string, DirectoryCategory>();
  for (const listing of developmentListings) {
    const existing = categories.get(listing.categorySlug);
    if (existing) existing.approvedCount += 1;
    else categories.set(listing.categorySlug, {
      id: listing.categorySlug,
      name: listing.categoryName,
      slug: listing.categorySlug,
      iconKey: null,
      sortOrder: 0,
      approvedCount: 1,
    });
  }
  return [...categories.values()].sort((left, right) => left.name.localeCompare(right.name, "en-GB"));
}

async function loadConfiguredDirectory(filters: DirectoryFilters) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  return loadPublishedDirectory(supabase, filters);
}

export const developmentDirectoryRepository: DirectoryRepository = {
  search: searchDevelopmentListings,
};

export async function getDirectoryPageData(filters: DirectoryFilters): Promise<{ result: DirectoryResult; categories: DirectoryCategory[] }> {
  const configured = await loadConfiguredDirectory(filters);
  if (configured) return configured;
  return { result: await searchDevelopmentListings(filters), categories: developmentCategories() };
}

// Use approved Supabase records in configured environments. Retain the fixture
// only when no Supabase project is configured for local interface development.
export function getDirectoryResult(filters: DirectoryFilters) {
  return getDirectoryPageData(filters).then((data) => data.result);
}

const defaultCategoryFilters: DirectoryFilters = { query: "", sort: "az", view: "standard" };

export async function getDirectoryCategories() {
  return (await getDirectoryPageData(defaultCategoryFilters)).categories;
}

export async function getDirectoryCategory(slug: string): Promise<Category | undefined> {
  const categories = await getDirectoryCategories();
  const category = categories.find((candidate) => candidate.slug === slug);
  if (!category) return undefined;
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: `Browse approved websites in ${category.name}.`,
    iconKey: category.iconKey ?? "folder",
    approvedCount: category.approvedCount,
  };
}

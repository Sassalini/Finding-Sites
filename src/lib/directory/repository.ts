import { developmentListings } from "@/data/listings";
import { searchPublishedListings } from "@/lib/directory/published";
import { buildDirectoryResult } from "@/lib/directory/results";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DirectoryFilters, DirectoryResult } from "@/types/directory";

export interface DirectoryRepository {
  search(filters: DirectoryFilters): Promise<DirectoryResult>;
}

async function searchDevelopmentListings(filters: DirectoryFilters): Promise<DirectoryResult> {
  return buildDirectoryResult(developmentListings, filters);
}

async function searchConfiguredListings(filters: DirectoryFilters): Promise<DirectoryResult | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  return searchPublishedListings(supabase, filters);
}

export const developmentDirectoryRepository: DirectoryRepository = {
  search: searchDevelopmentListings,
};

// Use approved Supabase records in configured environments. Retain the fixture
// only when no Supabase project is configured for local interface development.
export function getDirectoryResult(filters: DirectoryFilters) {
  return searchConfiguredListings(filters).then((result) => result ?? developmentDirectoryRepository.search(filters));
}

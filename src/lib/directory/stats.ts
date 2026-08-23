import "server-only";

import { unstable_cache } from "next/cache";
import { safeServerError } from "@/lib/server-errors";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const POPULAR_SEARCH_MINIMUM_FREQUENCY = 3;
export const POPULAR_SEARCH_WINDOW_DAYS = 7;
export const DIRECTORY_STATS_REVALIDATE_SECONDS = 60;

export type DirectoryStats = {
  websiteCount: number | null;
  categoryCount: number | null;
  searchesToday: number | null;
  popularSearches: Array<{ query: string; count: number }>;
};

const unavailableStats: DirectoryStats = {
  websiteCount: null,
  categoryCount: null,
  searchesToday: null,
  popularSearches: [],
};

function nonNegativeCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseDirectoryStats(value: unknown): DirectoryStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Directory statistics returned an invalid payload.");
  const payload = value as Record<string, unknown>;
  const popularSearches = Array.isArray(payload.popularSearches)
    ? payload.popularSearches.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      const query = typeof candidate.query === "string" ? candidate.query.trim() : "";
      const count = nonNegativeCount(candidate.count);
      return query && count !== null ? [{ query, count }] : [];
    }).slice(0, 5)
    : [];
  return {
    websiteCount: nonNegativeCount(payload.websiteCount),
    categoryCount: nonNegativeCount(payload.categoryCount),
    searchesToday: nonNegativeCount(payload.searchesToday),
    popularSearches,
  };
}

async function loadDirectoryStats() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Directory statistics database access is not configured.");
  const { data, error } = await admin.rpc("get_directory_stats", {
    candidate_min_popular_frequency: POPULAR_SEARCH_MINIMUM_FREQUENCY,
    candidate_popular_window_days: POPULAR_SEARCH_WINDOW_DAYS,
  });
  if (error) throw error;
  return parseDirectoryStats(data);
}

const getCachedDirectoryStats = unstable_cache(
  loadDirectoryStats,
  ["directory-statistics-v1"],
  { revalidate: DIRECTORY_STATS_REVALIDATE_SECONDS, tags: ["directory-statistics"] },
);

export async function getDirectoryStats(): Promise<DirectoryStats> {
  try {
    return await getCachedDirectoryStats();
  } catch (error) {
    console.error("[directory-statistics] aggregate query failed", safeServerError(error));
    return unavailableStats;
  }
}

export const SORT_MODES = [
  "az",
  "newest",
  "most-visited",
  "recently-updated",
  "trending",
  "random",
] as const;

export type SortMode = (typeof SORT_MODES)[number];
export type ViewMode = "standard" | "compact";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconKey: string;
  approvedCount: number;
}

export interface DirectoryCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  approvedCount: number;
}

export interface DirectoryListing {
  id: string;
  name: string;
  slug: string;
  url: string;
  normalizedDomain: string;
  shortDescription: string;
  categorySlug: string;
  categoryName: string;
  isVerified: boolean;
  isFeatured: boolean;
  publishedAt: string;
  updatedAt: string;
  outboundClicks: number;
  trendingScore: number;
}

export interface DirectoryFilters {
  query: string;
  categorySlug?: string;
  sort: SortMode;
  view: ViewMode;
}

export interface DirectoryResult {
  listings: DirectoryListing[];
  groups: Array<{ letter: string; listings: DirectoryListing[] }>;
  total: number;
  availableLetters: string[];
}

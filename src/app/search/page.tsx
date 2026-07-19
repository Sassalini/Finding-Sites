import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory/DirectoryPage";
import { parseDirectoryFilters, type SearchParamRecord } from "@/lib/directory/urls";

export const metadata: Metadata = { title: "Search", description: "Search approved websites in the Finding Sites directory.", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParamRecord> }) {
  const params = await searchParams;
  const filters = parseDirectoryFilters(params);
  return <DirectoryPage filters={filters} pathname="/search" heading={filters.query ? `Results for “${filters.query}”` : "Search the directory"} intro="Search names, website addresses and descriptions across the directory." />;
}

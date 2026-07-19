import { DirectoryPage } from "@/components/directory/DirectoryPage";
import { parseDirectoryFilters, type SearchParamRecord } from "@/lib/directory/urls";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParamRecord> }) {
  const params = await searchParams;
  return <DirectoryPage filters={parseDirectoryFilters(params)} pathname="/" />;
}

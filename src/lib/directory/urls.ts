import { SORT_MODES, type DirectoryFilters, type SortMode } from "@/types/directory";

type SearchParamValue = string | string[] | undefined;
export type SearchParamRecord = Record<string, SearchParamValue>;

function first(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDirectoryFilters(params: SearchParamRecord, categorySlug?: string): DirectoryFilters {
  const sortValue = first(params.sort);
  const viewValue = first(params.view);
  return {
    query: first(params.q)?.slice(0, 120) ?? "",
    categorySlug,
    sort: SORT_MODES.includes(sortValue as SortMode) ? (sortValue as SortMode) : "az",
    view: viewValue === "compact" ? "compact" : "standard",
  };
}

export function directoryHref(pathname: string, filters: DirectoryFilters, changes: Partial<Pick<DirectoryFilters, "query" | "sort" | "view">>) {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.sort !== "az") params.set("sort", next.sort);
  if (next.view !== "standard") params.set("view", next.view);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function letterAnchor(letter: string) {
  return `letter-${letter === "#" ? "number" : letter.toLowerCase()}`;
}

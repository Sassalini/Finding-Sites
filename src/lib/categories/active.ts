import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ActiveCategory = {
  id: string;
  name: string;
  slug: string;
  icon_key: string | null;
  sort_order: number;
};

type CategoryQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export class ActiveCategoriesLoadError extends Error {
  constructor(public readonly queryError: CategoryQueryError) {
    super("Active categories could not be loaded.", { cause: queryError });
    this.name = "ActiveCategoriesLoadError";
  }
}

export async function getActiveCategories(supabase: SupabaseClient<Database>): Promise<ActiveCategory[]> {
  const result = await supabase
    .from("categories")
    .select("id,name,slug,icon_key,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (result.error) {
    console.error("[categories] failed to load active categories", {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
    });
    throw new ActiveCategoriesLoadError(result.error);
  }

  return (result.data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon_key: category.icon_key,
    sort_order: category.sort_order,
  }));
}

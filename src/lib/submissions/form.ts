export type SubmissionCategory = { id: string; name: string };

type CategoryRow = { id?: unknown; name?: unknown };

export function toSubmissionCategories(rows: readonly CategoryRow[] | null): SubmissionCategory[] {
  return (rows ?? []).flatMap((category) => {
    if (typeof category.id !== "string" || typeof category.name !== "string") return [];
    return [{ id: category.id, name: category.name }];
  });
}

export function initialCategoryMode(
  categories: readonly SubmissionCategory[],
  requestedMode: "existing" | "request",
) {
  return categories.length > 0 ? requestedMode : "request";
}

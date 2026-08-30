import type { ActiveCategory } from "@/lib/categories/active";

export type SubmissionCategory = ActiveCategory;

export type CategoryMode = "existing" | "request";

export type CategoryChoice = {
  categoryId: string;
  requestedCategory: string;
  requestedCategoryDescription: string;
};

export function initialCategoryMode(
  categories: readonly SubmissionCategory[],
  requestedMode: CategoryMode,
) {
  return categories.length > 0 ? requestedMode : "request";
}

export function switchCategoryMode(choice: CategoryChoice, mode: CategoryMode): CategoryChoice {
  return mode === "existing"
    ? { ...choice, requestedCategory: "", requestedCategoryDescription: "" }
    : { ...choice, categoryId: "" };
}

export function categoryChoiceError(mode: CategoryMode, choice: CategoryChoice) {
  const hasExistingCategory = choice.categoryId.length > 0;
  const hasRequestedCategory = choice.requestedCategory.length > 0;
  const hasRequestedDescription = choice.requestedCategoryDescription.length > 0;

  if (hasExistingCategory && (hasRequestedCategory || hasRequestedDescription)) {
    return "Choose an existing category or request a new one, not both.";
  }
  if (!hasExistingCategory && !hasRequestedCategory) {
    return mode === "existing"
      ? "Choose the closest existing category."
      : "Enter a requested category name.";
  }
  if (mode === "existing" && !hasExistingCategory) return "Choose the closest existing category.";
  if (mode === "request" && !hasRequestedCategory) return "Enter a requested category name.";
  return null;
}

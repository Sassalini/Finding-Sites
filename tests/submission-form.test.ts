import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { categoryChoiceError, initialCategoryMode, switchCategoryMode } from "../src/lib/submissions/form";

test("plain active-category data selects the existing-category mode", () => {
  const categories = [
    { id: "category-1", name: "Business & Services", slug: "business-services", sort_order: 1 },
  ];

  assert.deepEqual(categories, [{ id: "category-1", name: "Business & Services", slug: "business-services", sort_order: 1 }]);
  assert.equal(initialCategoryMode(categories, "existing"), "existing");
});

test("an empty category result safely selects category request mode", () => {
  assert.equal(initialCategoryMode([], "existing"), "request");
});

test("switching category modes clears values from the conflicting mode", () => {
  assert.deepEqual(switchCategoryMode({ categoryId: "category-1", requestedCategory: "", requestedCategoryDescription: "" }, "request"), {
    categoryId: "", requestedCategory: "", requestedCategoryDescription: "",
  });
  assert.deepEqual(switchCategoryMode({ categoryId: "", requestedCategory: "New category", requestedCategoryDescription: "Needed" }, "existing"), {
    categoryId: "", requestedCategory: "", requestedCategoryDescription: "",
  });
});

test("category validation requires exactly one mode value", () => {
  assert.match(categoryChoiceError("existing", { categoryId: "", requestedCategory: "", requestedCategoryDescription: "" }) ?? "", /Choose/);
  assert.match(categoryChoiceError("request", { categoryId: "category-1", requestedCategory: "New category", requestedCategoryDescription: "" }) ?? "", /not both/);
  assert.equal(categoryChoiceError("existing", { categoryId: "category-1", requestedCategory: "", requestedCategoryDescription: "" }), null);
  assert.equal(categoryChoiceError("request", { categoryId: "", requestedCategory: "New category", requestedCategoryDescription: "" }), null);
});

test("the form renders both category modes and keeps URL directly after the name", () => {
  const form = readFileSync("src/app/submit/SubmissionForm.tsx", "utf8");
  assert.match(form, /Choose existing/);
  assert.match(form, /<select id="category-id" name="categoryId"/);
  assert.match(form, /Request a new category/);
  assert.match(form, /name="requestedCategory"/);
  assert.ok(form.indexOf("website-url") > form.indexOf("website-name"));
  assert.ok(form.indexOf("website-url") < form.indexOf("category-choice"));
  assert.doesNotMatch(form, /fullDescription|Longer description/);
});

test("the selected category UUID is read and validated by the server action", () => {
  const action = readFileSync("src/app/submit/actions.ts", "utf8");
  assert.match(action, /categoryId: field\(formData, "categoryId"\)/);
  assert.match(action, /eq\("id", values\.categoryId\)\.eq\("is_active", true\)/);
});

test("category loading failures have a reload message instead of the empty-state message", () => {
  const page = readFileSync("src/app/submit/NewSitePage.tsx", "utf8");
  assert.match(page, /We couldn’t load the available categories\. Please try again\./);
  assert.match(page, /Reload categories/);
  assert.match(page, /getActiveCategories\(supabase\)/);
});

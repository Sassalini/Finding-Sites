import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { categoryChoiceError, initialCategoryMode, switchCategoryMode, toSubmissionCategories } from "../src/lib/submissions/form";

test("active categories are converted to plain serializable form props", () => {
  const categories = toSubmissionCategories([
    { id: "category-1", name: "Business & Services" },
  ]);

  assert.deepEqual(categories, [{ id: "category-1", name: "Business & Services" }]);
  assert.equal(initialCategoryMode(categories, "existing"), "existing");
});

test("an empty category result safely selects category request mode", () => {
  assert.deepEqual(toSubmissionCategories([]), []);
  assert.deepEqual(toSubmissionCategories(null), []);
  assert.equal(initialCategoryMode([], "existing"), "request");
});

test("nullable or malformed category rows are not sent to the client", () => {
  assert.deepEqual(toSubmissionCategories([
    { id: "category-1", name: null },
    { id: null, name: "Missing ID" },
    { id: "category-2", name: "Education" },
  ]), [{ id: "category-2", name: "Education" }]);
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

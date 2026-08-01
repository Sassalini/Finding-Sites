import assert from "node:assert/strict";
import test from "node:test";
import { initialCategoryMode, toSubmissionCategories } from "../src/lib/submissions/form";

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

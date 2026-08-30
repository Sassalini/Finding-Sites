import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateSubmissionDescriptions } from "../src/lib/submissions/validation";

for (const field of ["description", "requestedCategoryDescription"] as const) {
  test(`${field} accepts empty, short and up-to-250-character descriptions`, () => {
    for (const length of [0, 1, 19, 20, 240, 241, 249, 250]) {
      const values = { description: "", requestedCategoryDescription: "", [field]: "a".repeat(length) };
      assert.deepEqual(validateSubmissionDescriptions(values), {}, `Length ${length}`);
    }
  });

  test(`${field} rejects overlong descriptions independently of browser limits`, () => {
    for (const length of [251, 800, 10000]) {
      const values = { description: "", requestedCategoryDescription: "", [field]: "a".repeat(length) };
      assert.deepEqual(validateSubmissionDescriptions(values), { [field]: "Use 250 characters or fewer." });
    }
  });
}

test("both description errors are reported on their own fields", () => {
  assert.deepEqual(validateSubmissionDescriptions({ description: "a".repeat(251), requestedCategoryDescription: "b".repeat(251) }), {
    description: "Use 250 characters or fewer.",
    requestedCategoryDescription: "Use 250 characters or fewer.",
  });
});

test("description controls are optional and share the updated browser limits", () => {
  const form = readFileSync("src/app/submit/SubmissionForm.tsx", "utf8");
  for (const name of ["description", "requestedCategoryDescription"]) {
    const textarea = form.match(new RegExp(`<textarea[^>]*name="${name}"[\\s\\S]*? />`))?.[0];
    assert.ok(textarea);
    assert.match(textarea, /minLength=\{SUBMISSION_LIMITS.descriptionMin\}/);
    assert.match(textarea, /maxLength=\{SUBMISSION_LIMITS.descriptionMax\}/);
    assert.doesNotMatch(textarea, /\brequired\b/);
  }
  assert.match(form, /Provide a short description of what this category is/);
  assert.doesNotMatch(form, /Why is it needed\?/);
  assert.match(form, /FieldError message=\{state.errors.requestedCategoryDescription\}/);
});

test("shared server validation runs before draft, edit, or revision writes", () => {
  const action = readFileSync("src/app/submit/actions.ts", "utf8");
  assert.match(action, /const errors: SubmissionErrors = validateSubmissionDescriptions\(values\)/);
  const validation = action.indexOf("const { errors, normalizedUrl } = validate(values)");
  const rejection = action.indexOf('if (Object.keys(errors).length || "error" in normalizedUrl) return');
  assert.ok(validation > -1 && rejection > validation);
  for (const operation of ['from("listing_revisions").insert', 'from("website_listings").insert', 'from("website_listings").update']) {
    assert.ok(action.indexOf(operation) > rejection);
  }
});

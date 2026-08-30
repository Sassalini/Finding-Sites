import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import type { SubmissionActionState, SubmissionValues } from "../src/app/submit/actions";

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: "http://localhost/submit" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Event: dom.window.Event, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true,
});
// Load React DOM after the DOM globals so its event system uses the DOM path.
const React: typeof import("react") = require("react");
const { createRoot }: typeof import("react-dom/client") = require("react-dom/client");

// Execute the actual component/action with only framework and database boundaries
// replaced. No copied handlers or network requests are used in these tests.
function loadModule(path: string, replacements: Record<string, unknown>) {
  const file = resolve(path);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (id: string) => id in replacements ? replacements[id] : require(id.startsWith("@/") ? resolve("src", id.slice(2)) : id);
  new Function("require", "module", "exports", compiled)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const categoryId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const defaultValues: SubmissionValues = {
  name: "Example", url: "https://example.com", categoryMode: "existing", categoryId: "",
  requestedCategory: "", requestedCategoryDescription: "", description: "", contactEmail: "test@example.com",
  ownershipConfirmed: true, termsAccepted: true,
};

function actionFixture() {
  const writes: { table: string; values: Record<string, unknown> }[] = [];
  const operations: string[] = [];
  const redirects: string[] = [];
  let categoryError: unknown = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "test-owner" } } }) },
    rpc: async () => ({ data: false, error: null }),
    from(table: string) {
      operations.push(table);
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => {
          if (categoryError instanceof Error) throw categoryError;
          return { data: categoryError ? null : { id: categoryId }, error: categoryError };
        },
        single: async () => ({ data: { id: requestId }, error: null }),
        insert(values: Record<string, unknown>) { writes.push({ table, values }); return query; },
        then(done: (value: unknown) => unknown) { return Promise.resolve({ error: null }).then(done); },
      };
      return query;
    },
  };
  class Navigation extends Error {}
  const actions = loadModule("src/app/submit/actions.ts", {
    "next/navigation": { redirect: (url: string) => { redirects.push(url); throw new Navigation(); } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { getSupabaseServerClient: async () => client },
    "@/lib/supabase/admin": { getSupabaseAdminClient: () => client },
    "@/lib/billing/subscription": { getListingEntitlement: async () => ({ canCreateListing: true }) },
  }) as { saveSubmissionAction: (state: SubmissionActionState, data: FormData) => Promise<SubmissionActionState> };
  async function save(state: SubmissionActionState, data: FormData) {
    try { return await actions.saveSubmissionAction(state, data); }
    catch (error) { if (!(error instanceof Navigation)) throw error; return { errors: {} }; }
  }
  return { save, writes, operations, redirects, failCategory: (error: unknown) => { categoryError = error; } };
}

async function mountForm(values = defaultValues) {
  const fixture = actionFixture();
  const submissions: FormData[] = [];
  const errors: unknown[] = [];
  const { SubmissionForm } = loadModule("src/app/submit/SubmissionForm.tsx", {
    "@/app/submit/actions": { saveSubmissionAction: async (state: SubmissionActionState, data: FormData) => {
      submissions.push(data);
      return fixture.save(state, data);
    } },
  }) as { SubmissionForm: React.ComponentType<Record<string, unknown>> };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SubmissionForm, {
    categories: [{ id: categoryId, name: "Business", slug: "business", icon_key: null, sort_order: 1 }], initialValues: values,
  }))));
  function get<T extends Element>(selector: string) {
    const element = container.querySelector<T>(selector);
    assert.ok(element, `Missing ${selector}; render errors: ${errors.map(String).join(", ")}`);
    return element;
  }
  async function mode(value: string) {
    await React.act(async () => get<HTMLInputElement>(`input[value="${value}"]`).click());
  }
  async function input(name: string, value: string) {
    const element = get<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
    const proto = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
    assert.deepEqual(errors, [], "React must not crash while changing category fields");
  }
  async function submit() {
    await React.act(async () => get<HTMLFormElement>("form").requestSubmit(get<HTMLButtonElement>('button[value="submit"]')));
    assert.deepEqual(errors, []);
  }
  return { ...fixture, submissions, get, mode, input, submit, cleanup: async () => { await React.act(async () => root.unmount()); container.remove(); } };
}

test("request -> existing -> select stays rendered without auto-submit or navigation", async () => {
  const form = await mountForm();
  try {
    await form.mode("request");
    await form.mode("existing");
    await form.input("categoryId", categoryId);
    assert.ok(form.get("form"));
    assert.equal(form.submissions.length, 0);
    assert.deepEqual(form.operations, []);
    assert.deepEqual(form.redirects, []);
  } finally { await form.cleanup(); }
});

test("requested values clear when returning to existing; submission writes only category ID", async () => {
  const form = await mountForm();
  try {
    await form.mode("request");
    await form.input("requestedCategory", "Independent makers");
    await form.input("requestedCategoryDescription", "Small independent businesses");
    await form.mode("existing");
    assert.equal(document.querySelector('[name="requestedCategory"]'), null);
    assert.equal(document.querySelector('[name="requestedCategoryDescription"]'), null);
    await form.input("categoryId", categoryId);
    assert.equal(form.submissions.length, 0);
    await form.submit();
    const data = form.submissions[0];
    assert.equal(data.get("categoryId"), categoryId);
    assert.equal(data.get("requestedCategory"), null);
    assert.equal(data.get("requestedCategoryDescription"), null);
    assert.equal(form.writes.length, 1);
    assert.equal(form.writes[0].table, "website_listings");
    assert.equal(form.writes[0].values.category_id, categoryId);
    assert.equal(form.writes[0].values.category_request_id, null);
    assert.equal(form.redirects.length, 1);
  } finally { await form.cleanup(); }
});

test("switching modes clears requested values and errors but fresh validation still appears", async (context) => {
  context.mock.method(console, "error", () => {});
  const form = await mountForm();
  try {
    await form.mode("request");
    await form.input("requestedCategory", "x");
    await form.input("requestedCategoryDescription", "x".repeat(251));
    await form.submit();
    assert.equal(form.get('[name="requestedCategory"]').getAttribute("aria-invalid"), "true");
    assert.equal(form.get('[name="requestedCategoryDescription"]').getAttribute("aria-invalid"), "true");
    await form.mode("existing");
    await form.mode("request");
    assert.equal(form.get<HTMLInputElement>('[name="requestedCategory"]').value, "");
    assert.equal(form.get<HTMLTextAreaElement>('[name="requestedCategoryDescription"]').value, "");
    assert.equal(form.get('[name="requestedCategory"]').getAttribute("aria-invalid"), "false");
    assert.equal(form.get('[name="requestedCategoryDescription"]').getAttribute("aria-invalid"), "false");
    await form.submit();
    assert.equal(form.get('[name="requestedCategory"]').getAttribute("aria-invalid"), "true");
    assert.equal(form.writes.length, 0);
  } finally { await form.cleanup(); }
});

function submissionData(overrides: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(defaultValues)) data.set(key, typeof value === "boolean" ? (value ? "on" : "") : value);
  data.set("intent", "submit");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

test("server rejects both paths, stale description-only conflicts, neither path and mismatched modes before database access", async (context) => {
  context.mock.method(console, "error", () => {});
  const selections: Record<string, string>[] = [
    { categoryMode: "existing", categoryId, requestedCategory: "Makers" },
    { categoryMode: "existing", categoryId, requestedCategoryDescription: "Stale requested description" },
    { categoryMode: "existing" },
    { categoryMode: "request" },
    { categoryMode: "existing", requestedCategory: "Makers" },
    { categoryMode: "request", categoryId },
    { categoryMode: "unknown", categoryId },
  ];
  for (const selection of selections) {
    const fixture = actionFixture();
    const result = await fixture.save({ errors: {} }, submissionData(selection));
    assert.ok(result.errors.category || result.errors.requestedCategory);
    assert.deepEqual(fixture.operations, []);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.redirects, []);
  }
});

test("Supabase category errors stay inline and logs contain only safe category context", async (context) => {
  const logs: unknown[] = [];
  context.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const form = await mountForm();
  try {
    form.failCategory({ code: "23514", message: "Invalid category for private@example.com", details: "Failing row contains (private@example.com, secret-row-value)", hint: "token=secret-token-value" });
    await form.input("categoryId", categoryId);
    await form.submit();
    assert.equal(form.get('[name="categoryId"]').getAttribute("aria-invalid"), "true");
    assert.equal(form.writes.length, 0);
    const output = JSON.stringify(logs);
    assert.match(output, /categories.select/);
    assert.match(output, /23514/);
    assert.match(output, /"categoryMode":"existing"/);
    assert.match(output, /"hasCategoryId":true/);
    assert.match(output, /"hasRequestedCategory":false/);
    assert.doesNotMatch(output, /private@example.com|test@example.com|secret-row-value|secret-token-value/);
  } finally { await form.cleanup(); }
});

test("thrown category lookup failures return a field error rather than escaping to the route", async (context) => {
  context.mock.method(console, "error", () => {});
  const fixture = actionFixture();
  fixture.failCategory(new Error("Category lookup unavailable"));
  const result = await fixture.save({ errors: {} }, submissionData({ categoryMode: "existing", categoryId }));
  assert.equal(result.errors.category, "We could not check that category. Please try again.");
  assert.equal(fixture.writes.length, 0);
});

test("existing -> requested clears category ID and successfully creates a request", async () => {
  const form = await mountForm();
  try {
    await form.input("categoryId", categoryId);
    await form.mode("request");
    await form.mode("existing");
    assert.equal(form.get<HTMLSelectElement>('[name="categoryId"]').value, "");
    await form.mode("request");
    await form.input("requestedCategory", "Independent makers");
    await form.input("requestedCategoryDescription", "Small independent businesses");
    assert.equal(form.submissions.length, 0);
    await form.submit();
    assert.equal(form.submissions[0].get("categoryId"), null);
    assert.equal(form.submissions[0].get("requestedCategory"), "Independent makers");
    assert.deepEqual(form.writes.map((write) => write.table), ["category_requests", "website_listings"]);
    assert.equal(form.writes[1].values.category_id, null);
    assert.equal(form.writes[1].values.category_request_id, requestId);
    assert.equal(form.redirects.length, 1);
  } finally { await form.cleanup(); }
});

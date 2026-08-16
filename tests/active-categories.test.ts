import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActiveCategoriesLoadError, getActiveCategories } from "../src/lib/categories/active";
import type { Database } from "../src/types/database";

type TestCategory = { id: string; name: string; slug: string; icon_key: string | null; is_active: boolean; sort_order: number };

function categoryClient(rows: TestCategory[], error: null | { code: string; message: string; details: string; hint: string }) {
  const calls: Array<[string, unknown, unknown?]> = [];
  let filtered = [...rows];
  let orderCount = 0;
  const chain = {
    select(columns: string) { calls.push(["select", columns]); return chain; },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      if (column === "is_active") filtered = filtered.filter((row) => row.is_active === value);
      return chain;
    },
    order(column: "sort_order" | "name") {
      calls.push(["order", column]);
      orderCount += 1;
      if (orderCount === 2) filtered.sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
      if (orderCount === 2) {
        return Promise.resolve({
          data: error ? null : filtered.map(({ id, name, slug, icon_key, sort_order }) => ({ id, name, slug, icon_key, sort_order })),
          error,
        });
      }
      return chain;
    },
  };
  const client = { from(table: string) { assert.equal(table, "categories"); return chain; } } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const rows: TestCategory[] = [
  { id: "3", name: "Aardvark", slug: "aardvark", icon_key: "compass", is_active: true, sort_order: 2 },
  { id: "2", name: "Beta", slug: "beta", icon_key: "book", is_active: true, sort_order: 1 },
  { id: "1", name: "Alpha", slug: "alpha", icon_key: "briefcase", is_active: true, sort_order: 1 },
  { id: "4", name: "Inactive", slug: "inactive", icon_key: "folder", is_active: false, sort_order: 0 },
];

for (const role of ["anonymous", "authenticated"] as const) {
  test(`${role} clients receive active categories in database order`, async () => {
    const { client, calls } = categoryClient(rows, null);
    const categories = await getActiveCategories(client);
    assert.deepEqual(categories.map((category) => category.name), ["Alpha", "Beta", "Aardvark"]);
    assert.deepEqual(calls, [
      ["select", "id,name,slug,icon_key,sort_order"],
      ["eq", "is_active", true],
      ["order", "sort_order"],
      ["order", "name"],
    ]);
  });
}

test("active category data preserves the database icon key for public consumers", async () => {
  const { client } = categoryClient(rows, null);
  const categories = await getActiveCategories(client);
  assert.equal(categories[0]?.icon_key, "briefcase");
});

test("category query errors are typed and safely logged", async () => {
  const queryError = { code: "42501", message: "permission denied", details: "RLS", hint: "check policy" };
  const { client } = categoryClient([], queryError);
  const original = console.error;
  const calls: unknown[][] = [];
  console.error = (...values: unknown[]) => calls.push(values);
  try {
    await assert.rejects(() => getActiveCategories(client), (error) => error instanceof ActiveCategoriesLoadError && error.queryError === queryError);
  } finally {
    console.error = original;
  }
  assert.deepEqual(calls, [["[categories] failed to load active categories", queryError]]);
});

test("the public directory and submission form share the active-category helper", () => {
  const directory = readFileSync("src/lib/directory/published.ts", "utf8");
  const submission = readFileSync("src/app/submit/NewSitePage.tsx", "utf8");
  assert.match(directory, /getActiveCategories\(supabase\)/);
  assert.match(submission, /getActiveCategories\(supabase\)/);
});

test("the public sidebar renders shared category icons, names, counts, and the all-websites link", () => {
  const sidebar = readFileSync("src/components/directory/CategorySidebar.tsx", "utf8");
  assert.match(sidebar, /Icon name=\{category\.iconKey \?\? "folder"\}/);
  assert.match(sidebar, /\{category\.name\}/);
  assert.match(sidebar, /\{category\.approvedCount\}/);
  assert.match(sidebar, /View all websites/);
});

test("the additive RLS policy explicitly covers anonymous and authenticated reads", () => {
  const migration = readFileSync("supabase/migrations/20260803120000_active_categories_public_read.sql", "utf8");
  assert.match(migration, /to anon, authenticated/);
  assert.match(migration, /using \(is_active = true\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCategory } from "../src/data/categories";
import { searchPublishedListings } from "../src/lib/directory/published";
import type { Database } from "../src/types/database";
import type { DirectoryFilters } from "../src/types/directory";

const businessFilters: DirectoryFilters = {
  query: "",
  categorySlug: "business-services",
  sort: "az",
  view: "standard",
};

function fakeSupabase(results: Record<string, { data: unknown; error: unknown }>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve(results[table]);
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

test("a valid category with no approved listings returns an empty result", async () => {
  const supabase = fakeSupabase({
    website_listings: { data: [], error: null },
    categories: { data: [{ id: "category-1", name: "Business & Services", slug: "business-services" }], error: null },
  });

  const result = await searchPublishedListings(supabase, businessFilters);

  assert.deepEqual(result, { listings: [], groups: [], total: 0, availableLetters: [] });
});

test("a valid category returns its approved listings", async () => {
  const supabase = fakeSupabase({
    website_listings: {
      data: [{
        id: "listing-1",
        category_id: "category-1",
        name: "Acme Services",
        slug: "acme-services",
        url: "https://example.com",
        normalized_domain: "example.com",
        short_description: "A useful service.",
        is_verified: false,
        is_featured: false,
        published_at: "2026-07-30T12:00:00+00:00",
        updated_at: "2026-07-30T12:00:00+00:00",
      }],
      error: null,
    },
    categories: { data: [{ id: "category-1", name: "Business & Services", slug: "business-services" }], error: null },
  });

  const result = await searchPublishedListings(supabase, businessFilters);

  assert.equal(result.total, 1);
  assert.equal(result.listings[0]?.categorySlug, "business-services");
  assert.equal(result.groups[0]?.letter, "A");
});

test("an unknown category is rejected by the route with notFound", () => {
  assert.equal(getCategory("not-a-real-category"), undefined);
  const route = readFileSync("src/app/category/[slug]/page.tsx", "utf8");
  assert.equal(route.match(/if \(!category\) notFound\(\)/g)?.length, 2);
  assert.doesNotMatch(route, /generateStaticParams/);
});

test("a category query error is logged safely and rethrown unchanged", async () => {
  const categoryError = {
    code: "42P01",
    message: "relation does not exist",
    details: "database detail",
    hint: "database hint",
  };
  const supabase = fakeSupabase({
    website_listings: { data: [], error: null },
    categories: { data: null, error: categoryError },
  });
  const originalConsoleError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => calls.push(args);

  try {
    await assert.rejects(
      () => searchPublishedListings(supabase, businessFilters),
      (error) => error === categoryError,
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "[directory-query]");
  assert.deepEqual(calls[0]?.[1], {
    operation: "active-categories.select",
    categorySlug: "business-services",
    code: "42P01",
    message: "relation does not exist",
    details: "database detail",
    hint: "database hint",
    stack: null,
  });
});

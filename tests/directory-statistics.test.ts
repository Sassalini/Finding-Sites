import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260823195641_directory_statistics.sql", "utf8");
const statsComponent = readFileSync("src/components/directory/DirectoryStats.tsx", "utf8");
const statsHelper = readFileSync("src/lib/directory/stats.ts", "utf8");
const searchAction = readFileSync("src/app/search/actions.ts", "utf8");
const globalSearch = readFileSync("src/components/search/GlobalSearch.tsx", "utf8");
const directoryToolbar = readFileSync("src/components/directory/DirectoryToolbar.tsx", "utf8");
const initialMigration = readFileSync("supabase/migrations/20260716160000_initial_directory_schema.sql", "utf8");

test("production statistics contain no placeholder numbers or fabricated popular terms", () => {
  assert.doesNotMatch(statsComponent, /value: "(?:30|15|86)"/);
  assert.doesNotMatch(statsComponent, /plumbers|marketing|independent shops|web hosting|antiques/);
  assert.match(statsComponent, /stats\.popularSearches\.length > 0/);
});

test("public website count and directory RLS share one eligibility definition", () => {
  assert.match(migration, /create or replace function public\.is_listing_publicly_eligible/);
  assert.match(migration, /create policy "Eligible approved listings are public"[\s\S]*public\.is_listing_publicly_eligible\(status, deleted_at, published_at, owner_id, category_id\)/);
  assert.match(migration, /from public\.website_listings listing[\s\S]*where public\.is_listing_publicly_eligible/);
});

test("draft pending review deleted and subscription-inactive listings are excluded while eligible approved listings count", () => {
  assert.match(migration, /candidate_status = 'approved'/);
  assert.match(migration, /candidate_deleted_at is null/);
  assert.match(migration, /candidate_published_at is not null/);
  assert.match(migration, /has_current_listing_entitlement\(candidate_owner_id\)/);
  assert.doesNotMatch(migration, /candidate_status in \('draft'|'pending_review'|'subscription_inactive'/);
});

test("category count includes only active categories", () => {
  assert.match(migration, /select count\(\*\) into category_count[\s\S]*from public\.categories category[\s\S]*where category\.is_active/);
});

test("searches today use DST-aware Europe London calendar boundaries", () => {
  assert.match(migration, /now\(\) at time zone 'Europe\/London'/);
  assert.match(migration, /london_today::timestamp at time zone 'Europe\/London'/);
  assert.match(migration, /\(london_today \+ 1\)::timestamp at time zone 'Europe\/London'/);
  assert.match(migration, /event\.created_at >= today_starts_at[\s\S]*event\.created_at < tomorrow_starts_at/);
});

test("empty and one-character searches are not recorded", () => {
  assert.match(searchAction, /if \(query\.length < 2\) redirect\(destination\)/);
  assert.match(migration, /char_length\(normalized_query\) < 2/);
});

test("popular searches normalize case and whitespace and enforce privacy threshold", () => {
  assert.match(migration, /lower\(regexp_replace\(btrim\(event\.query\), '\[\[:space:\]\]\+'/);
  assert.match(statsHelper, /POPULAR_SEARCH_MINIMUM_FREQUENCY = 3/);
  assert.match(migration, /having count\(\*\) >= minimum_frequency/);
  assert.match(migration, /count\(distinct search_actor\) >= 2/);
  assert.ok(migration.includes("event.query !~* '(^|[^[:alnum:]._%+-])[[:alnum:]._%+-]+@"));
});

test("popular searches use seven days, return at most five, and have no fallback terms", () => {
  assert.match(statsHelper, /POPULAR_SEARCH_WINDOW_DAYS = 7/);
  assert.match(migration, /limit 5/);
  assert.match(migration, /'\[\]'::jsonb/);
  assert.match(statsComponent, /stats\.popularSearches\.map/);
});

test("popular search links encode real search result URLs", () => {
  assert.match(statsComponent, /`\/search\?q=\$\{encodeURIComponent\(search\.query\)\}`/);
});

test("statistics failures preserve layout without fabricated values", () => {
  assert.match(statsHelper, /catch \(error\)/);
  assert.match(statsHelper, /websiteCount: null/);
  assert.match(statsComponent, /aria-label=\{stat\.value === null \? "Unavailable"/);
});

test("search forms record only deliberate submissions through a server action", () => {
  assert.match(globalSearch, /action=\{executeDirectorySearch\}/);
  assert.match(directoryToolbar, /action=\{executeDirectorySearch\}/);
  assert.doesNotMatch(globalSearch, /onChange|onInput/);
  assert.doesNotMatch(directoryToolbar, /onChange|onInput/);
});

test("raw search events remain private and writes are controlled and rate limited", () => {
  assert.match(initialMigration, /alter table public\.search_events enable row level security/);
  assert.match(initialMigration, /No anon\/authenticated insert policy is intentionally provided/);
  assert.match(migration, /revoke execute on function public\.record_directory_search_event[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_directory_search_event[\s\S]*to service_role/);
  assert.match(migration, />= 30/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(searchAction, /BOT_USER_AGENT/);
});

test("the aggregate is briefly cached for OpenNext-compatible request reuse", () => {
  assert.match(statsHelper, /unstable_cache/);
  assert.match(statsHelper, /DIRECTORY_STATS_REVALIDATE_SECONDS = 60/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260827120000_admin_category_request_resolution.sql", "utf8");
const reviewPage = readFileSync("src/app/admin/reviews/page.tsx", "utf8");
const adminActions = readFileSync("src/app/admin/actions.ts", "utf8");
const accountPage = readFileSync("src/app/account/page.tsx", "utf8");
const accountPreview = readFileSync("src/app/account/sites/[id]/page.tsx", "utf8");
const newSubmission = readFileSync("src/app/submit/NewSitePage.tsx", "utf8");
const editSubmission = readFileSync("src/app/submit/[id]/page.tsx", "utf8");
const sharedCategories = readFileSync("src/lib/categories/active.ts", "utf8");
const directoryCategories = readFileSync("src/lib/directory/published.ts", "utf8");

test("pending category requests appear with the required review context", () => {
  assert.match(reviewPage, /\.eq\("status", "pending_review"\)\.not\("category_request_id", "is", null\)/);
  for (const field of ["name", "url", "short_description", "status", "submitted_at", "owner_id"]) assert.match(reviewPage, new RegExp(field));
  assert.match(reviewPage, /requested_name,requested_description,status/);
  assert.match(reviewPage, /billing_subscriptions/);
});

test("non-admin users cannot create or review categories", () => {
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'ADMIN_REQUIRED'/);
  assert.match(migration, /Only administrators may review category requests/);
  assert.match(adminActions, /requireAdmin\("\/admin\/reviews"\)/);
});

test("admin can create the requested category with reviewed fields", () => {
  assert.match(reviewPage, /Create Category &amp; Approve/);
  assert.match(reviewPage, /name="categoryName"/);
  assert.match(reviewPage, /name="categorySlug"/);
  assert.match(reviewPage, /name="categoryIconKey"/);
  assert.match(reviewPage, /name="categorySortOrder"/);
  assert.match(migration, /insert into public\.categories \(name, slug, description, icon_key, sort_order, is_active\)/);
});

test("new categories receive a validated unique slug", () => {
  assert.match(migration, /category\.slug = clean_category_slug/);
  assert.match(migration, /raise exception 'CATEGORY_DUPLICATE'/);
  assert.match(reviewPage, /pattern="\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*"/);
});

test("new-category approval assigns the created category to the listing", () => {
  assert.match(migration, /returning id into category_id_to_use/);
  assert.match(migration, /category_id = category_id_to_use/);
  assert.match(migration, /resolved_category_request_id = request\.id/);
});

test("approval publishes the listing for the public-directory eligibility flow", () => {
  assert.match(migration, /status = 'approved'/);
  assert.match(migration, /approved_at = now_at/);
  assert.match(migration, /published_at = now_at/);
  assert.match(migration, /is_active\)\s*values[\s\S]*true/);
});

test("new active categories flow into the public category list", () => {
  assert.match(directoryCategories, /getActiveCategories\(supabase\)/);
  assert.match(directoryCategories, /approvedCounts\.get\(category\.id\) \?\? 0/);
});

test("new active categories flow into new and edit submission forms", () => {
  assert.match(newSubmission, /getActiveCategories\(supabase\)/);
  assert.match(editSubmission, /getActiveCategories\(supabase\)/);
  assert.match(sharedCategories, /\.from\("categories"\)/);
  assert.match(sharedCategories, /\.eq\("is_active", true\)/);
});

test("admin can resolve a request with an existing active category", () => {
  assert.match(reviewPage, /value="assign_existing"/);
  assert.match(migration, /moderation_action = 'assign_existing'/);
  assert.match(migration, /review_status = 'assigned_existing'/);
  assert.match(migration, /resolved_category_id = category_id_to_use/);
});

test("duplicate names and slugs are detected before insert", () => {
  assert.match(reviewPage, /Possible duplicate:/);
  assert.match(migration, /clean_category_name_key/);
  assert.match(migration, /category\.slug = clean_category_slug/);
  assert.match(adminActions, /CATEGORY_DUPLICATE/);
});

test("request changes preserves the listing, feedback and paid entitlement path", () => {
  assert.match(migration, /review_status = 'changes_requested'/);
  assert.match(migration, /status = 'changes_requested', rejection_reason = clean_reason/);
  assert.doesNotMatch(migration, /delete from public\.website_listings/);
  assert.match(accountPage, /Review feedback/);
  assert.match(accountPreview, /Review feedback/);
  assert.doesNotMatch(adminActions.slice(adminActions.indexOf("export async function moderateListingAction"), adminActions.indexOf("export async function moderateRevisionAction")), /stripe/i);
});

test("reject records an audit outcome without creating or deleting records", () => {
  const rejectBranch = migration.slice(migration.indexOf("if moderation_action in ('request_changes', 'reject')"), migration.indexOf("if moderation_action = 'assign_existing'"));
  assert.match(rejectBranch, /review_status = 'rejected'/);
  assert.match(rejectBranch, /status = 'permanently_rejected'/);
  assert.doesNotMatch(rejectBranch, /insert into public\.categories|delete from/);
});

test("category resolution and listing publication run in one database transaction", () => {
  assert.match(migration, /create function public\.admin_moderate_category_listing/);
  assert.match(migration, /for update/);
  assert.match(migration, /insert into public\.categories[\s\S]*update public\.category_requests[\s\S]*update public\.website_listings/);
  const action = adminActions.slice(adminActions.indexOf("export async function moderateListingAction"), adminActions.indexOf("export async function moderateRevisionAction"));
  assert.match(action, /supabase\.rpc\("admin_moderate_category_listing"/);
  assert.doesNotMatch(action, /from\("categories"\)\.insert|from\("website_listings"\)\.update/);
});

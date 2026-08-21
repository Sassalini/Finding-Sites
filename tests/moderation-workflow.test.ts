import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260820120000_category_moderation_workflow.sql", "utf8");
const finalizer = readFileSync("src/lib/listings/finalize.ts", "utf8");
const reviewAction = readFileSync("src/app/submit/review/actions.ts", "utf8");
const webhook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
const adminAuth = readFileSync("src/lib/admin/auth.ts", "utf8");
const adminActions = readFileSync("src/app/admin/actions.ts", "utf8");
const adminDashboard = readFileSync("src/app/admin/page.tsx", "utf8");
const reviewQueue = readFileSync("src/app/admin/reviews/page.tsx", "utf8");
const header = readFileSync("src/components/layout/SiteHeader.tsx", "utf8");

test("one authoritative finalizer is used by active subscribers and the verified Stripe webhook", () => {
  assert.match(finalizer, /rpc\("finalize_listing_after_entitlement"/);
  assert.match(reviewAction, /finalizeListingAfterEntitlement\(listing\.id, user\.id\)/);
  assert.match(webhook, /finalizeListingAfterEntitlement\(checkout\.listing_id, checkout\.owner_id\)/);
  assert.doesNotMatch(webhook, /status: "pending_review"/);
});

test("existing active categories publish automatically after entitlement", () => {
  assert.match(migration, /listing\.category_id is not null and listing\.category_request_id is null/);
  assert.match(migration, /category\.id = listing\.category_id and category\.is_active/);
  assert.match(migration, /status = 'approved',[\s\S]*approved_at = now_at,[\s\S]*published_at = now_at/);
  assert.match(migration, /approval_source = 'automatic_existing_category'/);
});

test("requested categories remain private and enter human review", () => {
  assert.match(migration, /listing\.category_id is null and listing\.category_request_id is not null/);
  assert.match(migration, /request\.status = 'pending'/);
  assert.match(migration, /status = 'pending_review',[\s\S]*published_at = null/);
  assert.match(reviewQueue, /\.eq\("status", "pending_review"\)\.not\("category_request_id", "is", null\)/);
});

test("finalization rechecks owner, qualifying subscription, validation and the listing limit", () => {
  assert.match(migration, /id = candidate_listing_id and owner_id = candidate_owner_id/);
  assert.match(migration, /has_qualifying_listing_subscription\(candidate_owner_id\)/);
  assert.match(migration, /ownership_confirmed/);
  assert.match(migration, /terms_accepted/);
  assert.match(migration, /used_slots > 2/);
  assert.match(migration, /LISTING_LIMIT_REACHED/);
});

test("deleted suspended and rejected listings cannot be finalized into public listings", () => {
  assert.match(migration, /listing\.status in \('deleted', 'suspended', 'permanently_rejected', 'expired'\)/);
  assert.match(migration, /LISTING_NOT_FINALIZABLE/);
});

test("inactive or nonexistent category IDs cannot auto-approve", () => {
  assert.match(migration, /CATEGORY_NOT_ACTIVE/);
  assert.match(migration, /category\.id = listing\.category_id and category\.is_active/);
});

test("all admin routes enforce the trusted profile role on the server", () => {
  assert.match(adminAuth, /supabase\.auth\.getUser\(\)/);
  assert.match(adminAuth, /from\("profiles"\)\.select\("role"\)\.eq\("id", user\.id\)/);
  assert.match(adminAuth, /profile\?\.role !== "admin"/);
  assert.match(adminAuth, /notFound\(\)/);
  assert.match(adminDashboard, /requireAdmin\("\/admin"\)/);
  assert.match(reviewQueue, /requireAdmin\("\/admin\/reviews"\)/);
  assert.match(header, /profile\?\.role === "admin"/);
  assert.doesNotMatch(adminAuth, /email/);
});

test("client-provided role values cannot grant administrator access", () => {
  assert.doesNotMatch(adminActions, /formData\.get\("role"\)/);
  assert.match(adminActions, /requireAdmin\("\/admin\/reviews"\)/);
  assert.match(migration, /if not public\.is_admin\(\) then raise exception 'ADMIN_REQUIRED'/);
});

test("administrator category approval and existing-category assignment are atomic", () => {
  const listingAction = adminActions.slice(adminActions.indexOf("export async function moderateListingAction"), adminActions.indexOf("export async function moderateRevisionAction"));
  assert.match(migration, /create or replace function public\.admin_moderate_category_listing/);
  assert.match(migration, /moderation_action = 'approve_new_category'/);
  assert.match(migration, /insert into public\.categories/);
  assert.match(migration, /moderation_action = 'assign_existing'/);
  assert.match(migration, /resolved_category_request_id = request\.id/);
  assert.match(migration, /status = 'approved'/);
  assert.doesNotMatch(listingAction, /from\("categories"\)\.insert/);
  assert.doesNotMatch(listingAction, /from\("website_listings"\)\.update/);
});

test("near duplicate categories are blocked before category creation", () => {
  assert.match(migration, /CATEGORY_DUPLICATE/);
  assert.match(migration, /lower\(regexp_replace\(trim\(category\.name\), '\[\[:space:\]\]\+'/);
  assert.match(migration, /category\.slug = category_slug_base/);
});

test("admin can request changes or reject without deleting moderation history", () => {
  assert.match(migration, /moderation_action in \('request_changes', 'reject'\)/);
  assert.match(migration, /status = 'changes_requested'/);
  assert.match(migration, /status = 'permanently_rejected'/);
  assert.match(migration, /update public\.category_requests set status = 'rejected'/);
  assert.doesNotMatch(migration, /delete from public\.website_listings/);
});

test("approval audit fields are protected from ordinary users", () => {
  assert.match(migration, /protect_listing_approval_audit/);
  assert.match(migration, /new\.approval_source is distinct from old\.approval_source/);
  assert.match(migration, /new\.resolved_category_request_id is distinct from old\.resolved_category_request_id/);
});

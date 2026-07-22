import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const limits = readFileSync("supabase/migrations/20260721151000_listing_entitlements_and_limits.sql", "utf8");
const initial = readFileSync("supabase/migrations/20260716160000_initial_directory_schema.sql", "utf8");
const billing = readFileSync("supabase/migrations/20260721120000_billing_and_moderation.sql", "utf8");
const webhook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");

test("profile creation is controlled by the auth.users trigger", () => {
  assert.match(initial, /after insert on auth\.users/);
  assert.match(initial, /insert into public\.profiles/);
});

test("the two-listing limit uses a transaction lock and database trigger", () => {
  assert.match(limits, /pg_advisory_xact_lock/);
  assert.match(limits, /LISTING_LIMIT_REACHED/);
  assert.match(limits, /create trigger listings_enforce_limit/);
});

test("public reads require approved status, no deletion and current entitlement", () => {
  assert.match(limits, /status = 'approved'/);
  assert.match(limits, /deleted_at is null/);
  assert.match(limits, /has_current_listing_entitlement\(owner_id\)/);
});

test("ownership and moderation state are enforced below the browser layer", () => {
  assert.match(limits, /old\.owner_id is distinct from auth\.uid\(\)/);
  assert.match(limits, /new\.status not in \('draft', 'pending_review'\)/);
  assert.match(limits, /new\.is_verified is distinct from old\.is_verified/);
  assert.match(limits, /public\.is_admin\(\)/);
});

test("soft deletion frees a slot without canceling billing", () => {
  assert.match(limits, /soft_delete_owned_listing/);
  assert.match(limits, /set status = 'deleted'/);
  assert.doesNotMatch(limits, /stripe\.subscriptions\.cancel/);
});

test("webhook event IDs and open checkout sessions are unique", () => {
  assert.match(billing, /stripe_webhook_events[\s\S]*id text primary key/);
  assert.match(billing, /checkout_sessions_one_open_per_listing_idx/);
});

test("ended subscriptions hide approved listings and reactivation restores them", () => {
  assert.match(webhook, /status: "subscription_inactive"/);
  assert.match(webhook, /inactive_from_status: "approved"/);
  assert.match(webhook, /status: "approved", subscription_inactive_at: null/);
});

test("approved edits remain in the revision workflow", () => {
  assert.match(initial, /create table if not exists public\.website_listings/);
  const revisions = readFileSync("supabase/migrations/20260719120000_website_submissions.sql", "utf8");
  assert.match(revisions, /create table if not exists public\.listing_revisions/);
  assert.match(revisions, /listing\.status = 'approved'/);
});

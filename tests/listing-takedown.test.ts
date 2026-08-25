import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260825120000_admin_listing_moderation.sql", "utf8");
const actions = readFileSync("src/app/admin/actions.ts", "utf8");
const adminPage = readFileSync("src/app/admin/listings/page.tsx", "utf8");
const dialog = readFileSync("src/app/admin/ListingModerationDialog.tsx", "utf8");
const published = readFileSync("src/lib/directory/published.ts", "utf8");
const account = readFileSync("src/app/account/page.tsx", "utf8");
const billingPolicy = readFileSync("src/lib/billing/policy.ts", "utf8");
const repository = readFileSync("src/lib/directory/repository.ts", "utf8");
const directoryPage = readFileSync("src/components/directory/DirectoryPage.tsx", "utf8");
const homePage = readFileSync("src/app/page.tsx", "utf8");
const categoryPage = readFileSync("src/app/category/[slug]/page.tsx", "utf8");
const searchPage = readFileSync("src/app/search/page.tsx", "utf8");

test("admin removal is a soft, audited takedown with reason, identity and timestamp", () => {
  assert.match(migration, /update public\.website_listings set moderation_status = 'removed', removed_at = now\(\),[\s\S]*removed_by = admin_id, removal_reason = clean_reason/);
  assert.match(migration, /insert into public\.listing_moderation_events[\s\S]*'removed'/);
  assert.doesNotMatch(migration, /delete from public\.website_listings/);
  assert.match(dialog, /Remove Listing/);
  assert.match(dialog, /This will immediately remove the website from the public directory\. The record will be retained for moderation and audit purposes\./);
});

test("moderation is authenticated and administrator-authorized at both server layers", () => {
  const action = actions.slice(actions.indexOf("export async function moderatePublicListingAction"));
  assert.match(action, /requireAdmin\(safeReturnPath\)/);
  assert.doesNotMatch(action, /formData\.get\("role"\)|formData\.get\("admin"\)/);
  assert.match(migration, /admin_id is null or not public\.is_admin\(\)/);
  assert.match(migration, /raise exception 'ADMIN_REQUIRED'/);
  assert.match(migration, /revoke all on function public\.admin_moderate_public_listing[\s\S]*from public, anon/);
});

test("ordinary owners cannot manipulate or restore moderation state directly", () => {
  assert.match(migration, /protect_listing_takedown_fields/);
  assert.match(migration, /new\.moderation_status is distinct from old\.moderation_status/);
  assert.match(migration, /Only administrators can change listing takedown fields/);
  assert.match(migration, /if listing\.moderation_status <> 'removed' then raise exception 'LISTING_NOT_REMOVED'/);
});

test("all public directory results exclude moderated removals through one loader and RLS rule", () => {
  assert.match(published, /\.eq\("moderation_status", "active"\)\.is\("removed_at", null\)/);
  assert.match(migration, /candidate_moderation_status = 'active'/);
  assert.match(migration, /candidate_removed_at is null/);
  assert.match(migration, /create policy "Eligible approved listings are public"[\s\S]*is_listing_publicly_eligible\(status, deleted_at, published_at, owner_id, category_id, moderation_status, removed_at\)/);
  assert.match(migration, /drop function if exists public\.is_listing_publicly_eligible\([\s\S]*public\.listing_status, timestamptz, timestamptz, uuid, uuid/);
});

test("removed listings disappear from homepage, category, search and alphabetical results", () => {
  assert.match(homePage, /<DirectoryPage/);
  assert.match(categoryPage, /<DirectoryPage/);
  assert.match(searchPage, /<DirectoryPage/);
  assert.match(directoryPage, /getDirectoryPageData\(filters\)/);
  assert.match(repository, /return loadPublishedDirectory\(supabase, filters\)/);
  assert.match(published, /moderation_status/);
});

test("Websites Listed uses the same eligibility rule and its cache is invalidated", () => {
  assert.match(migration, /select count\(\*\) into website_count[\s\S]*listing\.moderation_status, listing\.removed_at/);
  assert.match(actions, /updateTag\("directory-statistics"\)/);
});

test("owners retain the record and see a moderation status and public reason", () => {
  assert.match(account, /moderation_status,removed_at,removal_reason/);
  assert.match(account, /Removed by Finding Sites/);
  assert.match(account, /no longer publicly visible because it was removed by moderation/);
  assert.doesNotMatch(account, /moderation_events|admin_user_id|Private note/);
});

test("private notes are confined to the administrator-only audit table", () => {
  assert.match(migration, /listing_moderation_events[\s\S]*notes text/);
  assert.match(migration, /Admins inspect listing moderation history/);
  assert.doesNotMatch(migration, /add column if not exists removal_notes/);
  assert.match(dialog, /Private: visible to administrators only/);
});

test("removed approved records keep occupying the two-listing allowance", () => {
  assert.match(billingPolicy, /COUNTABLE_LISTING_STATUSES[\s\S]*"approved"/);
  assert.doesNotMatch(migration, /set status = 'deleted'/);
  assert.match(account, /continues to occupy one of your two listing slots until you delete it/);
});

test("restore clears the takedown while retaining audit history", () => {
  assert.match(migration, /update public\.website_listings set moderation_status = 'active', removed_at = null,[\s\S]*removed_by = null, removal_reason = null/);
  assert.match(migration, /insert into public\.listing_moderation_events[\s\S]*'restored'/);
  assert.match(adminPage, /mode="restore"/);
  assert.match(dialog, /Confirm Restore/);
});

test("restore only republishes when normal entitlement and category rules still pass", () => {
  assert.match(migration, /restored_publicly := public\.is_listing_publicly_eligible/);
  assert.match(migration, /public\.has_current_listing_entitlement\(candidate_owner_id\)/);
  assert.match(migration, /category\.id = candidate_category_id and category\.is_active/);
  assert.match(migration, /listing\.deleted_at is not null or listing\.status = 'deleted'[\s\S]*RESTORE_NOT_ALLOWED/);
  assert.match(migration, /restored_private/);
});

test("listing moderation does not cancel or mutate Stripe subscriptions", () => {
  assert.doesNotMatch(migration, /billing_subscriptions[\s\S]*(update|delete)|stripe/i);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function moderatePublicListingAction")), /stripe|subscription.*cancel/i);
});

test("Other requires a note and every destructive action requires explicit confirmation", () => {
  assert.match(dialog, /reason === "other"/);
  assert.match(dialog, /name="confirmed" value="yes" required/);
  assert.match(actions, /formData\.get\("confirmed"\) === "yes"/);
  assert.match(migration, /clean_reason = 'other'[\s\S]*REMOVAL_NOTES_REQUIRED/);
});

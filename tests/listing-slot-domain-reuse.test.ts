import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWebsiteUrl } from "../src/lib/submissions/validation";

const migration = readFileSync("supabase/migrations/20260901120000_listing_slot_and_domain_reuse.sql", "utf8");
const entitlement = readFileSync("src/lib/billing/subscription.ts", "utf8");
const submission = readFileSync("src/app/submit/actions.ts", "utf8");
const review = readFileSync("src/app/submit/review/actions.ts", "utf8");
const webhook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
const account = readFileSync("src/app/account/page.tsx", "utf8");
const accountActions = readFileSync("src/app/account/actions.ts", "utf8");
const deleteDialog = readFileSync("src/app/account/DeleteDialog.tsx", "utf8");
const initialSchema = readFileSync("supabase/migrations/20260716160000_initial_directory_schema.sql", "utf8");

test("one authoritative database function counts all slot-occupying statuses", () => {
  assert.match(migration, /create or replace function public\.count_slot_occupying_listings/);
  assert.match(migration, /is_slot_occupying_listing[\s\S]*'draft'[\s\S]*'checkout_pending'[\s\S]*'pending_review'[\s\S]*'approved'[\s\S]*'changes_requested'[\s\S]*'suspended'[\s\S]*'subscription_inactive'/);
  assert.match(entitlement, /rpc\("count_slot_occupying_listings"/);
  assert.doesNotMatch(entitlement, /from\("website_listings"\).*status,deleted_at/);
});

test("two current listings use both slots and a third is rejected race-safely", () => {
  assert.match(migration, /used_slots := public\.count_slot_occupying_listings\(new\.owner_id, new\.id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /if used_slots >= 2[\s\S]*LISTING_LIMIT_REACHED/);
});

test("owner deletion stores history while immediately freeing its slot", () => {
  assert.match(migration, /set status = 'deleted', deleted_at = now\(\), published_at = null/);
  assert.match(migration, /candidate_deleted_at is null and candidate_status in/);
  assert.doesNotMatch(migration.slice(migration.indexOf("soft_delete_owned_listing"), migration.indexOf("-- The initial schema")), /billing_subscriptions|stripe/);
});

test("deleting either or both listings produces one or zero occupied slots", () => {
  assert.match(migration, /listing\.deleted_at/);
  assert.match(migration, /public\.is_slot_occupying_listing\(listing\.status, listing\.deleted_at\)/);
  assert.match(account, /listingCount\} of \{entitlement\.listingLimit\} listings used/);
});

test("owner deletion preserves the active subscription and replacement checkout bypass", () => {
  assert.match(deleteDialog, /Your directory subscription will remain active/);
  assert.match(review, /if \(entitlement\.hasQualifyingSubscription\)/);
  assert.match(review, /finalizeListingAfterEntitlement\(listing\.id, user\.id\)/);
});

test("account, form, checkout and webhook finalisation share the authoritative count", () => {
  assert.match(account, /getListingEntitlement/);
  assert.match(submission, /getListingEntitlement/);
  assert.match(review, /getListingEntitlement/);
  assert.match(webhook, /finalizeListingAfterEntitlement/);
  assert.match(migration, /used_slots := public\.count_slot_occupying_listings\(candidate_owner_id\)/);
});

test("the global domain constraint is replaced with current-record uniqueness", () => {
  assert.match(initialSchema, /normalized_domain text not null unique/);
  assert.match(migration, /drop constraint if exists website_listings_normalized_domain_key/);
  assert.match(migration, /create unique index website_listings_current_normalized_domain_idx/);
  assert.match(migration, /deleted_at is null/);
});

test("an owner-deleted domain and its deleted parent revisions no longer block reuse", () => {
  assert.match(migration, /listing\.deleted_at is null[\s\S]*listing\.moderation_status = 'active'/);
  assert.match(migration, /join public\.website_listings parent on parent\.id = revision\.listing_id/);
  assert.match(migration, /parent\.deleted_at is null/);
  assert.match(deleteDialog, /You can submit this website again later/);
});

test("a current duplicate from this or another owner remains blocked", () => {
  assert.match(migration, /return 'current'/);
  assert.match(submission, /duplicateResult\.data === "current"/);
  assert.match(submission, /already has a submission/);
});

test("administrator-restricted domains cannot bypass moderation", () => {
  assert.match(migration, /return 'moderated'/);
  assert.match(migration, /ADMIN_RESTRICTED_LISTING_CANNOT_BE_DELETED/);
  assert.match(submission, /cannot currently be resubmitted\. Please contact Finding Sites/);
  assert.match(account, /const adminRestricted = listing\.moderation_status === "removed" \|\| \["suspended", "permanently_rejected"\]/);
  assert.match(account, /!adminRestricted && <DeleteDialog/);
});

test("legacy deleted moderation records are restored as private slot occupants", () => {
  assert.match(migration, /set status = 'suspended', deleted_at = null[\s\S]*moderation_status = 'removed'/);
  assert.match(migration, /status in \('suspended', 'permanently_rejected'\)/);
});

test("human-readable listing names are reusable while generated slugs stay unique", () => {
  assert.doesNotMatch(initialSchema, /name text not null unique/);
  assert.match(initialSchema, /slug text not null unique/);
  assert.match(submission, /slug: `\$\{slugifyName\(values\.name\)\}-\$\{newId\.slice\(0, 8\)\}`/);
  assert.doesNotMatch(submission, /domain or listing name/);
});

test("equivalent www, HTTP and HTTPS forms normalize to one domain", () => {
  assert.deepEqual(normalizeWebsiteUrl("https://basic22.com"), { url: "https://basic22.com/", domain: "basic22.com" });
  assert.deepEqual(normalizeWebsiteUrl("https://www.basic22.com/"), { url: "https://www.basic22.com/", domain: "basic22.com" });
  assert.deepEqual(normalizeWebsiteUrl("http://basic22.com"), { url: "http://basic22.com/", domain: "basic22.com" });
});

test("owner deletion refreshes account and public directory state immediately", () => {
  assert.match(accountActions, /updateTag\("directory-statistics"\)/);
  assert.match(accountActions, /revalidatePath\("\/", "layout"\)/);
});

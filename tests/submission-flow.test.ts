import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const saveAction = readFileSync("src/app/submit/actions.ts", "utf8");
const reviewAction = readFileSync("src/app/submit/review/actions.ts", "utf8");
const reviewPage = readFileSync("src/app/submit/review/[id]/page.tsx", "utf8");
const reviewForm = readFileSync("src/app/submit/review/ContinueSubmissionForm.tsx", "utf8");
const accountPage = readFileSync("src/app/account/page.tsx", "utf8");
const stripeConfig = readFileSync("src/lib/stripe/config.ts", "utf8");
const stripeServer = readFileSync("src/lib/stripe/server.ts", "utf8");
const checkoutAttemptsMigration = readFileSync("supabase/migrations/20260819210000_checkout_attempts.sql", "utf8");

test("the initial submission saves one draft before opening the review flow", () => {
  assert.match(saveAction, /const newId = crypto\.randomUUID\(\)/);
  assert.match(saveAction, /status: nextStatus/);
  assert.match(saveAction, /redirect\(intent === "submit" \? `\/submit\/review\/\$\{newId\}`/);
  assert.equal(saveAction.match(/from\("website_listings"\)\.insert/g)?.length, 1);
});

test("account cards expose resumable actions for saved listings", () => {
  assert.match(accountPage, /Continue to Payment/);
  assert.match(accountPage, /Submit for Review/);
  assert.match(accountPage, /Resume Payment/);
  assert.match(accountPage, /Review Required Changes/);
});

test("checkout resumes the same owned listing and never creates another listing", () => {
  assert.match(reviewAction, /listing\.owner_id !== user\.id/);
  assert.match(reviewAction, /listing_id: listing\.id, owner_id: user\.id/);
  assert.match(reviewAction, /stripe_checkout_sessions"\)[\s\S]*\.upsert\(\{ id: session\.id, owner_id: user\.id, listing_id: listing\.id \}/);
  assert.doesNotMatch(reviewAction, /from\("website_listings"\)\.insert/);
});

test("checkout cancellation returns to the saved draft review page", () => {
  assert.match(reviewAction, /cancel_url: `\$\{origin\}\$\{reviewPath\}\?checkout=cancelled`/);
  assert.match(reviewPage, /Payment was not completed\. Your website draft has been saved\./);
});

test("an active subscriber bypasses Checkout and submits the existing listing", () => {
  const entitlementBranch = reviewAction.indexOf("if (entitlement.hasQualifyingSubscription)");
  const checkoutCreation = reviewAction.indexOf("stripe.checkout.sessions.create");
  assert.ok(entitlementBranch > -1 && checkoutCreation > entitlementBranch);
  assert.match(reviewAction.slice(entitlementBranch, checkoutCreation), /status: "pending_review"/);
});

test("checkout enforces the listing limit and checks for conflicting subscriptions", () => {
  assert.match(reviewAction, /entitlement\.listingCount > entitlement\.listingLimit/);
  assert.match(reviewAction, /stripe\.subscriptions\.list/);
});

test("checkout reads and validates Worker-populated Stripe configuration at request time", () => {
  assert.match(stripeConfig, /return process\.env\[name\]/);
  assert.match(stripeConfig, /value\.startsWith\("sk_test_"\) \|\| value\.startsWith\("sk_live_"\)/);
  assert.match(stripeConfig, /value\.startsWith\("price_"\)/);
  assert.match(stripeConfig, /value\.startsWith\("https:\/\/"\)/);
  assert.doesNotMatch(reviewAction, /STRIPE_WEBHOOK_SECRET/);
});

test("Stripe uses fetch transport with an interactive timeout and no automatic retries", () => {
  assert.match(stripeServer, /httpClient: Stripe\.createFetchHttpClient\(\)/);
  assert.match(stripeServer, /timeout: STRIPE_REQUEST_TIMEOUT_MS/);
  assert.match(stripeServer, /maxNetworkRetries: 0/);
});

test("checkout failures return an inline error and reset the pending button", () => {
  assert.match(reviewAction, /We couldn’t start checkout\. Please try again\./);
  assert.match(reviewForm, /useActionState\(continueSubmissionAction, initialState\)/);
  assert.match(reviewForm, /disabled=\{pending\}/);
  assert.match(reviewForm, /state\.error/);
});

test("subscription Checkout explicitly disables Managed Payments", () => {
  assert.match(reviewAction, /mode: "subscription",\s+managed_payments: \{ enabled: false \}/);
});

test("checkout idempotency is scoped to a persisted logical attempt", () => {
  assert.match(reviewAction, /crypto\.randomUUID\(\)/);
  assert.match(reviewAction, /finding-sites:checkout:\$\{listing\.id\}:\$\{checkoutAttempt\.checkout_attempt_id\}/);
  assert.doesNotMatch(reviewAction, /idempotencyKey: `finding-sites:checkout:\$\{listing\.id\}`/);
  assert.match(checkoutAttemptsMigration, /create table public\.stripe_checkout_attempts/);
  assert.match(checkoutAttemptsMigration, /stripe_checkout_session_id text unique/);
  assert.match(checkoutAttemptsMigration, /request_version text not null/);
});

test("an indeterminate Stripe failure keeps the attempt while a deliberate restart supersedes it", () => {
  assert.match(reviewAction, /type === "StripeConnectionError" \|\| type === "StripeAPIError"/);
  assert.match(reviewAction, /checkout_status: "abandoned"/);
  assert.match(reviewForm, /name="startNewCheckoutAttempt"/);
  assert.match(reviewPage, /startNewCheckoutAttempt=\{query\.checkout === "cancelled"\}/);
});

test("checkout attempt logs contain identifiers and reuse outcomes only", () => {
  assert.match(reviewAction, /console\.info\("\[stripe-checkout-attempt\]", \{\s+listingId,\s+checkoutAttemptId,\s+existingStripeSessionReused,\s+newStripeSessionCreated/);
});

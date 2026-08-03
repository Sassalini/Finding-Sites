import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const saveAction = readFileSync("src/app/submit/actions.ts", "utf8");
const reviewAction = readFileSync("src/app/submit/review/actions.ts", "utf8");
const reviewPage = readFileSync("src/app/submit/review/[id]/page.tsx", "utf8");
const accountPage = readFileSync("src/app/account/page.tsx", "utf8");

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
  assert.match(reviewAction, /stripe_checkout_sessions"\)\.insert\(\{ id: session\.id, owner_id: user\.id, listing_id: listing\.id \}\)/);
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

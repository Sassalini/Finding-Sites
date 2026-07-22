import assert from "node:assert/strict";
import test from "node:test";
import { billingWarning, isCountableListing, LISTING_LIMIT, qualifiesForNewSubmissions, retainsPublicAccess } from "../src/lib/billing/policy";

test("the plan has exactly two countable listing slots", () => {
  assert.equal(LISTING_LIMIT, 2);
  assert.equal(isCountableListing("draft"), true);
  assert.equal(isCountableListing("checkout_pending"), true);
  assert.equal(isCountableListing("approved"), true);
  assert.equal(isCountableListing("subscription_inactive"), true);
  assert.equal(isCountableListing("deleted", new Date().toISOString()), false);
  assert.equal(isCountableListing("permanently_rejected"), false);
});

test("only active or intentionally enabled trials qualify for new submissions", () => {
  assert.equal(qualifiesForNewSubmissions("active", false), true);
  assert.equal(qualifiesForNewSubmissions("trialing", false), false);
  assert.equal(qualifiesForNewSubmissions("trialing", true), true);
  assert.equal(qualifiesForNewSubmissions("past_due", true), false);
  assert.equal(qualifiesForNewSubmissions("incomplete", true), false);
});

test("cancellation retains access to the paid-through date", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(retainsPublicAccess("canceled", future, null, false), true);
  assert.equal(retainsPublicAccess("canceled", past, null, false), false);
});

test("past-due access follows the documented grace period", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(retainsPublicAccess("past_due", null, future, false), true);
  assert.equal(retainsPublicAccess("past_due", null, past, false), false);
  assert.match(billingWarning("past_due", future) ?? "", /Payment failed/);
});

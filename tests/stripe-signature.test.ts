import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";

test("invalid Stripe webhook signatures are rejected", () => {
  const stripe = new Stripe("sk_test_placeholder");
  assert.throws(() => stripe.webhooks.constructEvent(
    JSON.stringify({ id: "evt_test", type: "invoice.paid" }),
    "t=1,v1=invalid",
    "whsec_test",
  ));
});

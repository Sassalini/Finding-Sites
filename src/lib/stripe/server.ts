import "server-only";

import Stripe from "stripe";
import { getStripeRuntimeConfiguration, isSandboxStripeSecretKey } from "@/lib/stripe/config";

let stripeClient: Stripe | null = null;

const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

export function getStripeClient() {
  const secretKey = getStripeRuntimeConfiguration().secretKey;
  if (!secretKey || !isSandboxStripeSecretKey(secretKey)) return null;
  stripeClient ??= new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
  });
  return stripeClient;
}

export async function withStripeTiming<T>(operation: string, request: () => Promise<T>) {
  const startedAt = Date.now();
  try {
    return await request();
  } finally {
    console.info("[stripe-timing]", { operation, durationMs: Date.now() - startedAt });
  }
}

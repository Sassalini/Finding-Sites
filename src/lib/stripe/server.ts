import "server-only";

import Stripe from "stripe";
import { getStripeRuntimeConfiguration, isSandboxStripeSecretKey } from "@/lib/stripe/config";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secretKey = getStripeRuntimeConfiguration().secretKey;
  if (!secretKey || !isSandboxStripeSecretKey(secretKey)) return null;
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

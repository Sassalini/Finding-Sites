import "server-only";

const PRODUCTION_SITE_URL = "https://findingsites.com";

export const stripeEnvironmentVariables = [
  "STRIPE_SECRET_KEY",
  "STRIPE_DIRECTORY_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SITE_URL",
] as const;

type StripeEnvironmentVariable = (typeof stripeEnvironmentVariables)[number];

function runtimeValue(name: StripeEnvironmentVariable) {
  // OpenNext copies string Worker bindings into process.env before handling a
  // request. Using a computed lookup keeps this a request-time server read,
  // including for the NEXT_PUBLIC_* binding.
  return process.env[name]?.trim() || null;
}

function matchesExpectedValue(name: StripeEnvironmentVariable, value: string) {
  switch (name) {
    case "STRIPE_SECRET_KEY":
      return value.startsWith("sk_test_");
    case "STRIPE_DIRECTORY_PRICE_ID":
      return value.startsWith("price_");
    case "STRIPE_WEBHOOK_SECRET":
      return value.startsWith("whsec_");
    case "NEXT_PUBLIC_SITE_URL":
      return value === PRODUCTION_SITE_URL;
  }
}

export function isSandboxStripeSecretKey(value: string) {
  return matchesExpectedValue("STRIPE_SECRET_KEY", value);
}

export function getStripeRuntimeConfiguration() {
  return {
    secretKey: runtimeValue("STRIPE_SECRET_KEY"),
    directoryPriceId: runtimeValue("STRIPE_DIRECTORY_PRICE_ID"),
    webhookSecret: runtimeValue("STRIPE_WEBHOOK_SECRET"),
    siteUrl: runtimeValue("NEXT_PUBLIC_SITE_URL"),
  };
}

export function logStripeConfigurationDiagnostics() {
  for (const variable of stripeEnvironmentVariables) {
    const value = runtimeValue(variable);
    console.info("[stripe-configuration]", {
      variable,
      status: value ? "present" : "missing",
      expectedValidation: value ? (matchesExpectedValue(variable, value) ? "valid" : "invalid") : "not-run",
    });
  }
}

export function getCheckoutConfiguration() {
  const config = getStripeRuntimeConfiguration();
  if (
    !config.secretKey
    || !matchesExpectedValue("STRIPE_SECRET_KEY", config.secretKey)
    || !config.directoryPriceId
    || !matchesExpectedValue("STRIPE_DIRECTORY_PRICE_ID", config.directoryPriceId)
    || !config.siteUrl
    || !matchesExpectedValue("NEXT_PUBLIC_SITE_URL", config.siteUrl)
  ) return null;

  return {
    secretKey: config.secretKey,
    directoryPriceId: config.directoryPriceId,
    siteUrl: config.siteUrl,
  };
}

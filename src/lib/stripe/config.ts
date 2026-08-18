import "server-only";

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
      return value.startsWith("sk_test_") || value.startsWith("sk_live_");
    case "STRIPE_DIRECTORY_PRICE_ID":
      return value.startsWith("price_");
    case "STRIPE_WEBHOOK_SECRET":
      return value.startsWith("whsec_");
    case "NEXT_PUBLIC_SITE_URL":
      return value.startsWith("https://");
  }
}

export function isSandboxStripeSecretKey(value: string) {
  return value.startsWith("sk_test_");
}

export function getStripeRuntimeConfiguration() {
  return {
    secretKey: runtimeValue("STRIPE_SECRET_KEY"),
    directoryPriceId: runtimeValue("STRIPE_DIRECTORY_PRICE_ID"),
    webhookSecret: runtimeValue("STRIPE_WEBHOOK_SECRET"),
    siteUrl: runtimeValue("NEXT_PUBLIC_SITE_URL"),
  };
}

export type StripeRuntimeConfiguration = ReturnType<typeof getStripeRuntimeConfiguration>;

export function logStripeConfigurationDiagnostics(config = getStripeRuntimeConfiguration()) {
  console.info("[stripe-config]", {
    stripeSecretKeyPresent: Boolean(config.secretKey),
    stripePriceIdPresent: Boolean(config.directoryPriceId),
    siteUrlPresent: Boolean(config.siteUrl),
    webhookSecretPresent: Boolean(config.webhookSecret),
    stripeSecretKeyPrefixValid: Boolean(config.secretKey && matchesExpectedValue("STRIPE_SECRET_KEY", config.secretKey)),
    stripeSecretKeyTestMode: Boolean(config.secretKey && isSandboxStripeSecretKey(config.secretKey)),
    stripePriceIdPrefixValid: Boolean(config.directoryPriceId && matchesExpectedValue("STRIPE_DIRECTORY_PRICE_ID", config.directoryPriceId)),
    siteUrlPrefixValid: Boolean(config.siteUrl && matchesExpectedValue("NEXT_PUBLIC_SITE_URL", config.siteUrl)),
    webhookSecretPrefixValid: Boolean(config.webhookSecret && matchesExpectedValue("STRIPE_WEBHOOK_SECRET", config.webhookSecret)),
  });
}

export function getCheckoutConfiguration(config = getStripeRuntimeConfiguration()) {
  if (
    !config.secretKey
    || !isSandboxStripeSecretKey(config.secretKey)
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

import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type RuntimeBindings = Record<string, unknown>;

function getSupabaseAdminRuntimeConfiguration() {
  let bindings: RuntimeBindings | null = null;
  try {
    bindings = getCloudflareContext().env as unknown as RuntimeBindings;
  } catch {
    // next dev and ordinary Node.js builds do not have a Cloudflare request context.
  }

  const bindingUrl = typeof bindings?.NEXT_PUBLIC_SUPABASE_URL === "string" ? bindings.NEXT_PUBLIC_SUPABASE_URL.trim() : "";
  const bindingServiceRoleKey = typeof bindings?.SUPABASE_SERVICE_ROLE_KEY === "string" ? bindings.SUPABASE_SERVICE_ROLE_KEY.trim() : "";
  const processUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() || "";
  const processServiceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || "";
  const serviceRoleKey = bindingServiceRoleKey || processServiceRoleKey || null;

  return {
    url: bindingUrl || processUrl || null,
    serviceRoleKey,
    diagnostic: {
      accessMethod: bindingServiceRoleKey ? "cloudflare-runtime-binding" : "process.env-fallback",
      keyPresent: Boolean(serviceRoleKey),
      runtimeEnvironmentName: (
        typeof bindings?.NEXTJS_ENV === "string" ? bindings.NEXTJS_ENV : null
      ) ?? process.env["NEXTJS_ENV"] ?? process.env["NODE_ENV"] ?? null,
    },
  };
}

export function logSupabaseAdminConfigurationDiagnostics() {
  const config = getSupabaseAdminRuntimeConfiguration();
  console.info("[checkout-config]", config.diagnostic);
}

export function getSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminRuntimeConfiguration();
  if (!url || !serviceRoleKey) return null;

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

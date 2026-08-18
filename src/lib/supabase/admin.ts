import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function getSupabaseAdminRuntimeConfiguration() {
  return {
    url: process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim() || null,
    serviceRoleKey: process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || null,
  };
}

export function logSupabaseAdminConfigurationDiagnostics() {
  const config = getSupabaseAdminRuntimeConfiguration();
  console.info("[checkout-config]", {
    supabaseUrlPresent: Boolean(config.url),
    supabaseServiceRoleKeyPresent: Boolean(config.serviceRoleKey),
  });
}

export function getSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminRuntimeConfiguration();
  if (!url || !serviceRoleKey) return null;

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

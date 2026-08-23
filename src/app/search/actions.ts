"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDirectoryPageData } from "@/lib/directory/repository";
import { directoryHref } from "@/lib/directory/urls";
import { safeServerError } from "@/lib/server-errors";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DirectoryFilters } from "@/types/directory";

const SEARCH_SESSION_COOKIE = "finding_sites_search_session";
const BOT_USER_AGENT = /(bot|crawler|spider|slurp|bingpreview|headless|facebookexternalhit|preview|monitoring)/i;

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function normalizedQuery(formData: FormData) {
  return value(formData, "q").trim().replace(/\s+/g, " ").slice(0, 120);
}

function validUuid(value: string | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function executeDirectorySearch(formData: FormData) {
  const query = normalizedQuery(formData);
  const requestedPathname = value(formData, "pathname");
  const categorySlugValue = value(formData, "categorySlug");
  const categorySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlugValue) ? categorySlugValue : undefined;
  const pathname = categorySlug ? `/category/${categorySlug}` : requestedPathname === "/" ? "/" : "/search";
  const filters: DirectoryFilters = {
    query,
    categorySlug,
    sort: ["newest", "most-visited", "recently-updated", "trending", "random"].includes(value(formData, "sort"))
      ? value(formData, "sort") as DirectoryFilters["sort"]
      : "az",
    view: value(formData, "view") === "compact" ? "compact" : "standard",
  };
  const destination = directoryHref(pathname, filters, {});
  if (query.length < 2) redirect(destination);

  try {
    const requestHeaders = await headers();
    const userAgent = requestHeaders.get("user-agent") ?? "";
    if (userAgent && !BOT_USER_AGENT.test(userAgent)) {
      const { result, categories } = await getDirectoryPageData(filters);
      const categoryId = categorySlug ? categories.find((category) => category.slug === categorySlug)?.id ?? null : null;
      if (!categorySlug || categoryId) {
        const cookieStore = await cookies();
        let anonymousSessionId = validUuid(cookieStore.get(SEARCH_SESSION_COOKIE)?.value);
        if (!anonymousSessionId) {
          anonymousSessionId = crypto.randomUUID();
          cookieStore.set(SEARCH_SESSION_COOKIE, anonymousSessionId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
          });
        }
        const supabase = await getSupabaseServerClient();
        const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
        const admin = getSupabaseAdminClient();
        if (admin) {
          const { error } = await admin.rpc("record_directory_search_event", {
            candidate_query: query,
            candidate_category_id: categoryId,
            candidate_result_count: result.total,
            candidate_anonymous_session_id: anonymousSessionId,
            candidate_user_id: user?.id ?? null,
          });
          if (error) console.error("[directory-search] event recording failed", safeServerError(error));
        }
      }
    }
  } catch (error) {
    console.error("[directory-search] event recording failed", safeServerError(error));
  }
  redirect(destination);
}

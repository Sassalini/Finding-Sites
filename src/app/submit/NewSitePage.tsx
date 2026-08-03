import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { SubmissionForm } from "@/app/submit/SubmissionForm";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { getActiveCategories } from "@/lib/categories/active";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const newSiteMetadata: Metadata = {
  title: "Submit a Website",
  description: "Submit a website for review by Finding Sites.",
  robots: { index: false, follow: false },
};

type NewSitePageOptions = {
  returnTo: "/submit" | "/account/sites/new";
  logPrefix: "[submit]" | "[new-site]";
};

type SafeErrorShape = {
  name?: string;
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  stack?: string;
  cause?: Omit<SafeErrorShape, "cause">;
};

function safeError(error: unknown): SafeErrorShape {
  if (error instanceof Error) {
    const cause = error.cause && typeof error.cause === "object"
      ? safeError(error.cause)
      : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: cause ? { name: cause.name, code: cause.code, message: cause.message, details: cause.details, hint: cause.hint, stack: cause.stack } : undefined,
    };
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return {
      name: typeof value.name === "string" ? value.name : undefined,
      code: typeof value.code === "string" ? value.code : undefined,
      message: typeof value.message === "string" ? value.message : "Unknown render error",
      details: typeof value.details === "string" ? value.details : undefined,
      hint: typeof value.hint === "string" ? value.hint : undefined,
      stack: typeof value.stack === "string" ? value.stack : undefined,
    };
  }
  return { message: typeof error === "string" ? error : "Unknown render error" };
}

function NewSiteLoadError() {
  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <section className="form-card confirmation-card" role="alert">
        <span className="eyebrow">Website submission</span>
        <h1>We couldn’t load the website submission form.</h1>
        <p>Please try again. If the problem continues, return to your account and contact the directory team.</p>
        <Link href="/account" className="button button-secondary">Back to account</Link>
      </section>
    </main>
  );
}

function CategoryLoadError({ returnTo }: { returnTo: NewSitePageOptions["returnTo"] }) {
  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <section className="form-card confirmation-card" role="alert">
        <span className="eyebrow">Website submission</span>
        <h1>We couldn’t load the available categories. Please try again.</h1>
        <p>The submission form has not treated this as an empty category list.</p>
        <a href={returnTo} className="button button-accent">Reload categories</a>
      </section>
    </main>
  );
}

export async function renderNewSitePage({ returnTo, logPrefix }: NewSitePageOptions) {
  console.info(`${logPrefix} render started`);

  try {
    console.info(`${logPrefix} creating Supabase server client`);
    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      console.error(`${logPrefix} Supabase configuration unavailable`);
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    }
    console.info(`${logPrefix} Supabase server client ready`);

    console.info(`${logPrefix} loading session`);
    const { data: { user }, error: authenticationError } = await supabase.auth.getUser();
    if (!user) {
      console.info(`${logPrefix} unauthenticated; redirecting to login`, {
        authError: authenticationError?.name ?? null,
      });
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    }
    if (authenticationError) {
      console.error(`${logPrefix} session lookup failed`, safeError(authenticationError));
      throw new Error("Authenticated session lookup failed.", { cause: authenticationError });
    }
    console.info(`${logPrefix} authenticated`);

    console.info(`${logPrefix} profile loading skipped`, {
      reason: "The form needs no profile fields during initial render.",
    });

    const entitlement = await getListingEntitlement(supabase, user.id, { logPrefix });
    if (!entitlement.canCreateListing) {
      console.info(`${logPrefix} listing limit reached`, {
        listingCount: entitlement.listingCount,
        listingLimit: entitlement.listingLimit,
      });
      return (
        <main className="account-shell account-shell-narrow" id="main-content">
          <section className="form-card confirmation-card"><span className="confirmation-mark">2</span><span className="eyebrow">Plan limit reached</span><h1>Both listing slots are in use</h1><p>Your subscription includes up to two listings. Delete an existing listing before adding another; deleting a site does not cancel billing.</p><Link href="/account" className="button button-accent">Manage your sites</Link></section>
        </main>
      );
    }

    console.info(`${logPrefix} loading categories`);
    let categories;
    try {
      categories = await getActiveCategories(supabase);
    } catch {
      return <CategoryLoadError returnTo={returnTo} />;
    }
    console.info(`${logPrefix} categories loaded`, { categoryCount: categories.length });
    if (categories.length === 0) console.info(`${logPrefix} no active categories; enabling category request mode`);

    const defaultEmail = typeof user.email === "string" ? user.email : "";
    console.info(`${logPrefix} form defaults constructed`, { hasDefaultEmail: Boolean(defaultEmail) });
    console.info(`${logPrefix} client props ready`, {
      categoryCount: categories.length,
      serializable: true,
    });
    console.info(`${logPrefix} submission form component ready`);

    return (
      <main className="account-shell" id="main-content">
        <header className="account-heading"><span className="eyebrow">Website submission · {entitlement.listingCount + 1} of {entitlement.listingLimit}</span><h1>Add a website</h1><p>Tell us about your site, then review the details before submitting. An active directory subscription covers up to two sites on your account.</p></header>
        <div className="form-card"><SubmissionForm categories={categories} defaultEmail={defaultEmail} /></div>
      </main>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error(`${logPrefix} route render failed`, safeError(error));
    return <NewSiteLoadError />;
  }
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmissionForm } from "@/app/submit/SubmissionForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getListingEntitlement } from "@/lib/billing/subscription";
import Link from "next/link";

export const metadata: Metadata = { title: "Submit a Website", description: "Submit a website for review by Finding Sites.", robots: { index: false, follow: false } };

export default async function SubmitPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/submit");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/submit");

  const entitlement = await getListingEntitlement(supabase, user.id);
  if (!entitlement.canCreateListing) {
    return (
      <main className="account-shell account-shell-narrow" id="main-content">
        <section className="form-card confirmation-card"><span className="confirmation-mark">2</span><span className="eyebrow">Plan limit reached</span><h1>Both listing slots are in use</h1><p>Your subscription includes up to two listings. Delete an existing listing before adding another; deleting a site does not cancel billing.</p><Link href="/account" className="button button-accent">Manage your sites</Link></section>
      </main>
    );
  }

  const { data: categories } = await supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order").order("name");
  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading"><span className="eyebrow">Website submission · {entitlement.listingCount + 1} of {entitlement.listingLimit}</span><h1>Add a website</h1><p>Tell us about your site, then review the details before submitting. An active directory subscription covers up to two sites on your account.</p></header>
      <div className="form-card"><SubmissionForm categories={categories ?? []} defaultEmail={user.email ?? ""} /></div>
    </main>
  );
}

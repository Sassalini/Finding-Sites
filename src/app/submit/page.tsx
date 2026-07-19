import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubmissionForm } from "@/app/submit/SubmissionForm";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submit a Website", description: "Submit a website for review by Finding Sites.", robots: { index: false, follow: false } };

export default async function SubmitPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/submit");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/submit");

  const { data: categories } = await supabase.from("categories").select("id,name").eq("is_active", true).order("sort_order").order("name");
  return (
    <main className="account-shell" id="main-content">
      <header className="account-heading"><span className="eyebrow">Website submission</span><h1>Add a website</h1><p>Save your progress as a draft or send it to the directory team for review. There is no payment step.</p></header>
      <div className="form-card"><SubmissionForm categories={categories ?? []} /></div>
    </main>
  );
}

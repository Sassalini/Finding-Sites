import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submission received", robots: { index: false, follow: false } };

export default async function SubmissionConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string; kind?: string }> }) {
  const { id, kind } = await searchParams;
  if (!id) notFound();
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/account");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const result = kind === "revision"
    ? await supabase.from("listing_revisions").select("name,owner_id").eq("id", id).maybeSingle()
    : await supabase.from("website_listings").select("name,owner_id").eq("id", id).maybeSingle();
  if (!result.data || result.data.owner_id !== user.id) notFound();

  const isDraft = kind === "draft";
  const title = kind === "revision" ? "Revision submitted" : isDraft ? "Draft saved" : "Website submitted";
  const detail = kind === "revision"
    ? "Your proposed changes are waiting for review. The approved listing remains live and unchanged in the meantime."
    : isDraft
      ? "Your website has not been sent for review yet. You can continue editing it from your account."
      : "Your website is now waiting for human review. You can follow its status from your account.";

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <section className="form-card confirmation-card"><span className="confirmation-mark">✓</span><span className="eyebrow">{isDraft ? "Saved" : "Confirmation"}</span><h1>{title}</h1><p><strong>{result.data.name}</strong></p><p>{detail}</p><div className="form-actions"><Link href="/account" className="button button-accent">View your submissions</Link><Link href="/" className="button button-secondary">Browse the directory</Link></div></section>
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForms } from "@/app/login/AuthForms";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (data.user) redirect("/account");
  const query = await searchParams;
  const requestedNext = query.next ?? "/account";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <header className="account-heading"><span className="eyebrow">Website owners</span><h1>Welcome to Finding Sites</h1><p>Create an account or log in to submit and manage websites.</p></header>
      <AuthForms next={next} initialError={query.error === "confirmation" ? "That confirmation link is invalid or has expired. Request a new confirmation email and try again." : undefined} />
    </main>
  );
}
